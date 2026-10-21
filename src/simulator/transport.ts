import type { Signal, WireState } from './types';

/** Educational time, in milliseconds. Derived from workbench/simulation.js.
 * Viewport scaling never changes model-space lengths or propagation times. */
export const PROPAGATION_SPEED = 360;
export const lengthOf = (points: WireState['points']) => points.slice(1).reduce(
  (length, point, i) => length + Math.hypot(point[0] - points[i][0], point[1] - points[i][1]), 0,
);

export class Transport {
  time = 0;
  private sequence = 0;
  private queue: { time: number; order: number; action: () => void }[] = [];
  wires: Record<string, WireState> = {};

  send(id: string, value: Signal, onArrival: (value: Signal) => void) {
    const wire = this.wires[id];
    if (wire.source === value) return;
    wire.source = value;
    wire.transitions.push({ time: this.time, value });
    this.queue.push({
      time: this.time + wire.delay, order: this.sequence++,
      action: () => { wire.arrived = value; onArrival(value); },
    });
    this.queue.sort((a, b) => a.time - b.time || a.order - b.order);
  }

  protected flush() {}

  advance(delta: number) {
    if (!Number.isFinite(delta) || delta < 0) throw new Error('Invalid time step');
    const target = this.time + delta;
    while (this.queue.length && this.queue[0].time <= target) {
      this.time = this.queue[0].time;
      const batch = [];
      while (this.queue.length && this.queue[0].time <= this.time + 1e-8) {
        batch.push(this.queue.shift()!);
      }
      for (const event of batch) event.action();
      this.flush();
    }
    this.time = target;
    for (const wire of Object.values(this.wires)) {
      while (wire.transitions.length && wire.transitions[0].time + wire.delay <= this.time) {
        wire.initial = wire.transitions.shift()!.value;
      }
    }
  }

  next() {
    if (!this.queue.length) return false;
    this.advance(this.queue[0].time - this.time);
    return true;
  }

  valueAt(id: string, fraction = 1): Signal {
    const wire = this.wires[id];
    let value = wire.initial;
    for (const change of wire.transitions) {
      if (this.time - change.time >= wire.delay * fraction) value = change.value;
    }
    return value;
  }

  get busy() { return this.queue.length > 0; }
}
