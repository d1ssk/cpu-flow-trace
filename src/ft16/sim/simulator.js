/* Event-driven circuit simulator for the FT16 learning path.
 *
 * - Modules have zero internal delay: a module evaluates when input changes
 *   arrive at its terminals, and changed outputs start travelling at once.
 * - Wires carry a value (1 bit or a bus) with a travel time proportional to
 *   their routed length. A transition visibly moves along the wire.
 * - Sequential modules sample their inputs on a global clock edge. The clock
 *   reaches every sequential module at the same instant (an idealised,
 *   balanced clock tree); this is a stated simplification.
 * - Each output change records what caused it (a clock edge, an external
 *   input, or the input arrivals that triggered the evaluation), so the
 *   viewer can explain *why* a wire changed. */

import { library } from './modules.js';

export const WIRE_SPEED = 100; // layout units per model time unit (t)

class EventQueue {
  constructor() { this.items = []; }
  get size() { return this.items.length; }
  peek() { return this.items[0]; }
  less(a, b) { return a.time < b.time || (a.time === b.time && a.order < b.order); }
  push(item) {
    const h = this.items; h.push(item);
    let i = h.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (!this.less(h[i], h[p])) break;
      [h[i], h[p]] = [h[p], h[i]]; i = p;
    }
  }
  pop() {
    const h = this.items, top = h[0], last = h.pop();
    if (h.length) {
      h[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1, r = l + 1;
        let m = i;
        if (l < h.length && this.less(h[l], h[m])) m = l;
        if (r < h.length && this.less(h[r], h[m])) m = r;
        if (m === i) break;
        [h[i], h[m]] = [h[m], h[i]]; i = m;
      }
    }
    return top;
  }
  clear() { this.items = []; }
}

export class Simulator {
  constructor(circuit, { program, options = {}, initialState = {}, settleOnReset = true } = {}) {
    this.circuit = circuit;
    this.program = program;
    this.options = options;
    this.initialState = structuredClone(initialState);
    this.settleOnReset = settleOnReset;
    this.listeners = new Set();
    this.reset();
  }

  reset() {
    this.time = 0; this.order = 0; this.cycle = 0;
    this.retired = 0; this.trapCount = 0; this.trapCauses = new Set(); this.cycleDepth = 0;
    this.meta = {};
    this.queue = new EventQueue();
    this.dirty = new Set();
    this.modules = new Map();
    this.wires = new Map();
    this.netByOutput = new Map();
    this.wiresByNet = new Map();
    this.cycleLog = [];
    this.clockTime = null;
    this.emissionSeq = 0;
    for (const spec of this.circuit.modules) {
      const def = library[spec.type];
      if (!def) throw new Error(`Unknown module type ${spec.type}`);
      const m = {
        id: spec.id, type: spec.type, def, params: spec.params, spec,
        in: {}, out: {}, triggers: [], lastEmission: {}, state: null,
      };
      for (const port of spec.ports) {
        if (port.dir === 'in') m.in[port.name] = spec.params.defaults?.[port.name] ?? 0;
        else m.out[port.name] = 0;
      }
      m.state = def.init ? def.init(spec.params, { program: this.program, options: this.options }) : {};
      // Lesson fixtures initialize real sequential modules before any wire evaluates.
      // Subsequent execution uses the ordinary connected circuit, including reset.
      if (this.initialState[m.id]) Object.assign(m.state, structuredClone(this.initialState[m.id]));
      m.emit = (port, value) => this.emit(m, port, value);
      this.modules.set(m.id, m);
    }
    for (const net of this.circuit.nets) {
      this.netByOutput.set(net.from, net);
      this.wiresByNet.set(net.id, []);
    }
    for (const w of this.circuit.wires) {
      const wire = {
        ...w, delay: w.length / WIRE_SPEED,
        source: 0, arrived: 0, initial: 0, transitions: [], last: null,
      };
      const [module, port] = w.to.split('.');
      wire.sink = { module: this.modules.get(module), port };
      this.wires.set(w.id, wire);
      this.wiresByNet.get(w.net).push(wire);
    }
    // Resolve startup through ordinary wire events, without a clock edge.
    // By default start settled; callers inspecting startup propagation can
    // leave these events pending instead.
    this.cause = { type: 'reset' };
    for (const m of this.modules.values()) this.evaluate(m, { type: 'reset' });
    if (this.settleOnReset) {
      this.settle();
      for (const wire of this.wires.values()) { wire.transitions = []; wire.initial = wire.arrived; }
      this.time = 0;
    }
    this.notify();
  }

  /* Runtime checkpoints belong to this simulator and its fixed circuit. */
  snapshot() {
    // Clone the complete event graph together: arrivals and causal traces
    // share transition objects. Keep executable definitions/topology outside.
    return structuredClone({
      runtime: Object.fromEntries([
        'time', 'order', 'cycle', 'retired', 'trapCount', 'trapCauses',
        'cycleDepth', 'meta', 'cycleLog', 'clockTime', 'emissionSeq', 'cause',
      ].map(key => [key, this[key]])),
      modules: [...this.modules.values()].map(m => ({
        id: m.id, in: m.in, out: m.out, state: m.state,
        triggers: m.triggers, lastEmission: m.lastEmission,
      })),
      wires: [...this.wires.values()].map(w => ({
        id: w.id, source: w.source, arrived: w.arrived, initial: w.initial,
        transitions: w.transitions, last: w.last, lastCycle: w.lastCycle,
      })),
      queue: this.queue.items.map(({ time, order, wire, transition }) => ({ time, order, wireId: wire.id, transition })),
      dirty: [...this.dirty].map(m => m.id),
    });
  }

  restore(snapshot) {
    // Restore into the same circuit without evaluating it or sending a clock.
    // Clone again so future execution cannot mutate a saved checkpoint.
    const saved = structuredClone(snapshot);
    Object.assign(this, saved.runtime);
    for (const m of saved.modules) Object.assign(this.modules.get(m.id), m);
    for (const w of saved.wires) Object.assign(this.wires.get(w.id), w);
    this.queue.items = saved.queue.map(({ wireId, ...event }) => ({ ...event, wire: this.wires.get(wireId) }));
    this.dirty = new Set(saved.dirty.map(id => this.modules.get(id)));
    this.notify();
  }

  /* Output API used by module definitions during evaluation. */
  emit(m, port, value) {
    if (m.out[port] === value) return;
    m.out[port] = value;
    const emission = {
      seq: this.emissionSeq++, module: m.id, port, value, time: this.time, cause: this.cause,
      depth: this.depthOf(m),
    };
    if (emission.depth > this.cycleDepth) this.cycleDepth = emission.depth;
    m.lastEmission[port] = emission;
    const net = this.netByOutput.get(`${m.id}.${port}`);
    if (!net) return;
    for (const wire of this.wiresByNet.get(net.id)) this.send(wire, value, emission);
  }

  /* Logic depth: nominal module delays summed along the causal chain since
   * the last clock edge. The animation keeps zero module delay; this is an
   * estimate of each cycle's critical path, reported separately. */
  depthOf(m) {
    const cause = this.cause;
    let base = 0;
    if (cause?.type === 'eval') for (const t of cause.triggers) base = Math.max(base, t.emission?.depth ?? 0);
    return base + (m.def.delay ?? 2);
  }

  send(wire, value, emission) {
    if (wire.source === value) return;
    wire.source = value;
    const transition = { time: this.time, value, emission, wire: wire.id };
    wire.transitions.push(transition);
    this.queue.push({ time: this.time + wire.delay, order: this.order++, wire, transition });
  }

  evaluate(m, cause) {
    if (!m.def.comb) return;
    this.cause = cause;
    m.def.comb(m);
    this.cause = null;
  }

  flush() {
    const pending = [...this.dirty];
    this.dirty.clear();
    for (const m of pending) {
      const triggers = m.triggers; m.triggers = [];
      this.evaluate(m, { type: 'eval', module: m.id, time: this.time, triggers });
    }
  }

  advance(delta) {
    if (!Number.isFinite(delta) || delta < 0) throw new Error('Invalid time step');
    const target = this.time + delta;
    while (this.queue.size && this.queue.peek().time <= target + 1e-9) {
      this.time = this.queue.peek().time;
      // Arrivals at the same modelled instant are evaluated together.
      while (this.queue.size && this.queue.peek().time <= this.time + 1e-9) {
        const { wire, transition } = this.queue.pop();
        wire.arrived = transition.value;
        wire.last = transition;
        wire.lastCycle = this.cycle;
        const sink = wire.sink;
        if (sink.module.in[sink.port] !== transition.value) {
          sink.module.in[sink.port] = transition.value;
          sink.module.triggers.push(transition);
          this.dirty.add(sink.module);
        }
      }
      this.flush();
      if (!this.queue.size) this.recordSettle();
    }
    this.time = Math.max(this.time, target);
    this.prune();
  }

  prune() {
    for (const wire of this.wires.values()) {
      while (wire.transitions.length && wire.transitions[0].time + wire.delay <= this.time + 1e-9) {
        wire.initial = wire.transitions.shift().value;
      }
    }
  }

  recordSettle() {
    if (this.clockTime === null) return;
    const entry = this.cycleLog[this.cycleLog.length - 1];
    if (entry && entry.settle === null) entry.settle = this.time - this.clockTime;
  }

  /* Advance to the next arrival batch. Returns false when nothing is pending. */
  next() {
    if (!this.queue.size) return false;
    this.advance(this.queue.peek().time - this.time);
    return true;
  }

  settle(limit = 1e6) {
    let guard = 0;
    while (this.queue.size) {
      this.next();
      if (++guard > limit) throw new Error('Circuit did not settle (oscillation?)');
    }
  }

  get busy() { return this.queue.size > 0; }

  /* A rising clock edge: every sequential module samples its arrived inputs
   * and its current state; all new states are committed together. */
  clock() {
    if (this.busy) return false;
    this.cycle++;
    const previous = this.cycleLog[this.cycleLog.length - 1];
    if (previous) previous.depth = this.cycleDepth;
    this.cycleDepth = 0;
    const info = { cycle: this.cycle, time: this.time, settle: null, depth: null };
    this.circuit.hooks?.beforeClock?.(this, info);
    this.retired += info.retired ?? 0;
    if (info.trap) { this.trapCount++; this.trapCauses.add(info.trap); }
    const updates = [];
    for (const m of this.modules.values()) {
      if (!m.def.edge) continue;
      const next = m.def.edge(m);
      if (next !== undefined) updates.push([m, next]);
    }
    for (const [m, next] of updates) m.state = next;
    this.clockTime = this.time;
    this.cycleLog.push(info);
    if (this.cycleLog.length > 4096) this.cycleLog.splice(0, 2048);
    const cause = { type: 'clock', cycle: this.cycle, time: this.time };
    for (const m of this.modules.values()) if (m.def.edge) this.evaluate(m, { ...cause, module: m.id });
    if (!this.busy) info.settle = 0;
    this.notify();
    return true;
  }

  /* Changes an external input (e.g. a switch) on a module and re-evaluates it. */
  setExternal(moduleId, key, value) {
    const m = this.modules.get(moduleId);
    m.state = { ...m.state, [key]: value };
    this.evaluate(m, { type: 'external', module: moduleId, key, value, time: this.time });
    this.notify();
  }

  /* Value visible at a fraction of a wire's length at the current time. */
  valueAt(wire, fraction = 1) {
    let value = wire.initial;
    for (const t of wire.transitions) if (this.time - t.time >= wire.delay * fraction - 1e-9) value = t.value;
    return value;
  }

  module(id) { return this.modules.get(id); }
  input(id, port) { return this.modules.get(id).in[port]; }
  output(id, port) { return this.modules.get(id).out[port]; }
  state(id) { return this.modules.get(id).state; }

  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  notify() { for (const fn of this.listeners) fn(this); }

  /* Run whole clock cycles without animation (settle, clock, settle...). */
  runCycles(count, stop = () => false) {
    for (let i = 0; i < count; i++) {
      this.settle();
      if (stop(this)) return i;
      this.clock();
    }
    this.settle();
    return count;
  }
}
