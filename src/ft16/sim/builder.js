/* Circuit construction. A stage adds modules and connects terminals; the
 * builder sizes every module box from its contents (title, terminal labels,
 * view rows) and routes the nets as orthogonal trees. A wire is one
 * (net, sink) pair whose polyline runs from the source terminal along the
 * shared trunk to that sink, so its travel time is its routed length.
 *
 * Positions are grid coordinates. Because sizes are only known once a
 * module is added, positions can be written relative to placed modules:
 *   b.right('ALU', 4)   x just right of ALU with a 4-cell channel
 *   b.below('RF', 4)    y just below RF
 *   b.leftOf('PC', 4), b.above('ALU', 4)   use the new module's own size
 *   b.alignPort('d', 'PCMUX.y')   y such that port d lines up with PCMUX.y
 * Gaps are routing channels; at least 4 cells leave one free track. */

import { library } from './modules.js';
import { GRID, ROUTER, route } from './router.js';
import precomputed from '../stages/layouts.js';
import { charWidth, contentBox, portLabelChars, textWidth } from './metrics.js';

export { GRID, ROUTER };
const PORT_PITCH = 2;
const SIDE_PITCH = 3;
const MARGIN = 4;
const MIRRORED = { left: 'right', right: 'left' };
export const MIN_GAP = 4;

export class CircuitBuilder {
  constructor(meta) {
    this.meta = meta;
    this.modules = [];
    this.byId = new Map();
    this.nets = [];
    // Extra cells added to every relative gap (routing channel width).
    this.extra = meta.gapExtra ?? Number(globalThis.process?.env?.GAP_EXTRA ?? 1);
  }

  /* add(id, type, params, [gx, gy], {label, w, h, sides, order, portOffset, mirror}).
   * gx / gy may be numbers or functions of the new module's measured spec.
   * mirror swaps the left and right terminals, for a part of the circuit
   * that flows right to left; `sides` still overrides single terminals. */
  add(id, type, params, at, options = {}) {
    const def = library[type];
    if (!def) throw new Error(`Unknown module type ${type}`);
    if (this.byId.has(id)) throw new Error(`Duplicate module ${id}`);
    const flip = side => (options.mirror ? MIRRORED[side] ?? side : side);
    const ports = def.ports(params).map(p => ({ ...p, side: options.sides?.[p.name] ?? flip(p.side) }));
    const spec = { id, type, params, label: options.label ?? def.title, at, options, ports };
    measure(spec, def);
    const [ax, ay] = at;
    spec.gx = typeof ax === 'function' ? ax(spec) : ax;
    spec.gy = typeof ay === 'function' ? ay(spec) : ay;
    this.modules.push(spec);
    this.byId.set(id, spec);
    return spec;
  }

  /* Re-position a placed module (gx / gy may be functions of its spec). */
  move(id, gx, gy) {
    const m = this.get(id);
    if (gx !== undefined) m.gx = typeof gx === 'function' ? gx(m) : gx;
    if (gy !== undefined) m.gy = typeof gy === 'function' ? gy(m) : gy;
  }

  get(id) {
    const m = this.byId.get(id);
    if (!m) throw new Error(`No module ${id}`);
    return m;
  }
  x(id) { return this.get(id).gx; }
  y(id) { return this.get(id).gy; }
  w(id) { return this.get(id).gw; }
  h(id) { return this.get(id).gh; }
  right(id, gap = MIN_GAP) { const m = this.get(id); return m.gx + m.gw + gap + this.extra; }
  below(id, gap = MIN_GAP) { const m = this.get(id); return m.gy + m.gh + gap + this.extra; }
  leftOf(id, gap = MIN_GAP) { const m = this.get(id); return spec => m.gx - spec.gw - gap - this.extra; }
  above(id, gap = MIN_GAP) { const m = this.get(id); return spec => m.gy - spec.gh - gap - this.extra; }
  alignRight(id) { const m = this.get(id); return spec => m.gx + m.gw - spec.gw; }
  alignBottom(id) { const m = this.get(id); return spec => m.gy + m.gh - spec.gh; }
  centerX(id) { const m = this.get(id); return spec => m.gx + Math.round((m.gw - spec.gw) / 2); }
  centerY(id) { const m = this.get(id); return spec => m.gy + Math.round((m.gh - spec.gh) / 2); }
  /* y such that `port` of the new module is level with `target` ('MOD.port'). */
  alignPort(port, target, dy = 0) {
    const [mid, pid] = target.split('.');
    const m = this.get(mid), p = m.ports.find(q => q.name === pid);
    if (!p) throw new Error(`No port ${target}`);
    return spec => {
      const own = spec.ports.find(q => q.name === port);
      if (!own) throw new Error(`No port ${port} on ${spec.id}`);
      return m.gy + p.ry - own.ry + dy;
    };
  }
  /* x such that a top/bottom `port` of the new module is level with target. */
  alignPortX(port, target, dx = 0) {
    const [mid, pid] = target.split('.');
    const m = this.get(mid), p = m.ports.find(q => q.name === pid);
    return spec => {
      const own = spec.ports.find(q => q.name === port);
      return m.gx + p.rx - own.rx + dx;
    };
  }

  connect(from, ...sinks) {
    const [m, p] = from.split('.');
    const source = this.byId.get(m)?.ports.find(port => port.name === p && port.dir === 'out');
    if (!source) throw new Error(`No output ${from}`);
    for (const sink of sinks) {
      const [sm, sp] = sink.split('.');
      const port = this.byId.get(sm)?.ports.find(q => q.name === sp && q.dir === 'in');
      if (!port) throw new Error(`No input ${sink}`);
      if (port.width !== source.width) throw new Error(`Width mismatch ${from}(${source.width}) → ${sink}(${port.width})`);
      if (this.nets.some(n => n.sinks.includes(sink))) throw new Error(`Input driven twice: ${sink}`);
    }
    const existing = this.nets.find(n => n.from === from);
    if (existing) existing.sinks.push(...sinks);
    else this.nets.push({ id: from, from, width: source.width, sinks: [...sinks] });
  }

  build() {
    this.place();
    // Routing a large stage takes a moment, so routes are precomputed
    // (scripts/precompute-layouts.js). They are used only when the circuit's
    // placement, terminals, nets and router settings are exactly the same.
    const signature = signatureOf(this.modules, this.nets);
    const saved = precomputed[this.meta.id];
    const routed = saved?.signature === signature
      ? { ...saved, junctions: new Map(saved.junctions) }
      : route(this.modules, this.nets);
    const width = (Math.max(...this.modules.map(m => m.gx + m.gw)) + MARGIN) * GRID;
    const height = (Math.max(...this.modules.map(m => m.gy + m.gh)) + MARGIN) * GRID;
    const unconnected = [];
    for (const m of this.modules) for (const p of m.ports) {
      const key = `${m.id}.${p.name}`;
      if (p.dir === 'in' && m.params.defaults?.[p.name] === undefined && !this.nets.some(n => n.sinks.includes(key))) unconnected.push(key);
    }
    return {
      ...this.meta,
      modules: this.modules.map(({ options, at, ...m }) => m),
      nets: this.nets.map(n => ({ ...n, junctions: routed.junctions.get(n.id) ?? [] })),
      wires: routed.wires,
      violations: routed.violations,
      conflicts: routed.conflicts,
      adjusted: this.adjusted,
      unconnected,
      width, height,
      signature, precomputed: saved?.signature === signature,
      routed: { wires: routed.wires, junctions: [...routed.junctions], violations: routed.violations, conflicts: routed.conflicts },
    };
  }

  /* Resolve overlaps, shift everything to a common margin and give
   * terminals absolute points. A module placed too close to an earlier one
   * is pushed right or down (whichever is shorter); `adjusted` lists them
   * so stage layouts can be corrected. */
  place() {
    this.adjusted = [];
    const placed = [];
    for (const b of this.modules) {
      for (let guard = 0; guard < 50; guard++) {
        const a = placed.find(p => clash(p, b));
        if (!a) break;
        const dx = a.gx + a.gw + MIN_GAP - b.gx, dy = a.gy + a.gh + MIN_GAP - b.gy;
        if (dx <= dy) b.gx += dx; else b.gy += dy;
        this.adjusted.push(`${b.id}<${a.id}`);
      }
      placed.push(b);
    }
    const minX = Math.min(...this.modules.map(m => m.gx)), minY = Math.min(...this.modules.map(m => m.gy));
    for (const m of this.modules) {
      m.gx += MARGIN - minX; m.gy += MARGIN - minY;
      Object.assign(m, { x: m.gx * GRID, y: m.gy * GRID, w: m.gw * GRID, h: m.gh * GRID });
      for (const p of m.ports) Object.assign(p, { gx: m.gx + p.rx, gy: m.gy + p.ry, x: (m.gx + p.rx) * GRID, y: (m.gy + p.ry) * GRID });
      m.view = { x: m.x + m.box.x0, y: m.y + m.box.y0, w: m.box.x1 - m.box.x0, h: m.box.y1 - m.box.y0 };
      m.titleY = m.y + m.box.titleY;
    }
  }
}

/* A short hash of everything that determines the routes. */
function signatureOf(modules, nets) {
  const text = JSON.stringify([
    modules.map(m => [m.id, m.gx, m.gy, m.gw, m.gh, m.ports.map(p => [p.name, p.gx, p.gy, p.side])]),
    nets.map(n => [n.id, n.sinks]), ROUTER,
  ]);
  let h1 = 0x811c9dc5, h2 = 0;
  for (let i = 0; i < text.length; i++) {
    h1 = Math.imul(h1 ^ text.charCodeAt(i), 16777619) >>> 0;
    h2 = (Math.imul(h2, 31) + text.charCodeAt(i)) >>> 0;
  }
  return `${h1.toString(16)}-${h2.toString(16)}-${text.length}`;
}

function clash(a, b) {
  const gapX = Math.max(b.gx - (a.gx + a.gw), a.gx - (b.gx + b.gw));
  const gapY = Math.max(b.gy - (a.gy + a.gh), a.gy - (b.gy + b.gh));
  return gapX < MIN_GAP && gapY < MIN_GAP;
}

/* Size a module from its contents and give each terminal a relative grid
 * point (rx, ry). Layout, top to bottom: rotated top-terminal labels, the
 * title, the body (side terminals at the edges, view rows in the middle),
 * rotated bottom-terminal labels. */
function measure(spec, def) {
  const { options } = spec;
  // hideLabels: sides whose labels repeat the terminals they face directly.
  for (const p of spec.ports) if (options.hideLabels?.includes(p.side)) p.noLabel = true;
  const sides = { left: [], right: [], top: [], bottom: [] };
  for (const p of spec.ports) sides[p.side].push(p);
  for (const [side, names] of Object.entries(options.order ?? {})) {
    sides[side].sort((a, b) => names.indexOf(a.name) - names.indexOf(b.name));
  }
  const labelPx = p => portLabelChars(p) * charWidth('port');
  const longest = list => Math.max(0, ...list.map(labelPx));
  const content = contentBox(def.size?.(spec.params) ?? []);

  const edge = list => (list.length ? Math.max(1, Math.ceil((longest(list) + (longest(list) ? 9 : 0)) / GRID)) : 0);
  const gTop = edge(sides.top), gBottom = edge(sides.bottom);
  const bodyStart = gTop + 2;
  const offset = options.portOffset ?? 0;
  const sideCount = Math.max(sides.left.length, sides.right.length);
  const sideRows = sideCount ? PORT_PITCH * sideCount + offset : 0;
  const contentRows = content.h ? Math.ceil((content.h + 6) / GRID) : 1;
  const gh = Math.max(options.h ?? 0, bodyStart + Math.max(sideRows, contentRows) + gBottom);

  const leftM = sides.left.length ? longest(sides.left) + 9 : 6;
  const rightM = sides.right.length ? longest(sides.right) + 9 : 6;
  const titleW = textWidth(spec.label.length, 'title') + 14;
  const tbW = (Math.max(sides.top.length, sides.bottom.length) - 1) * SIDE_PITCH * GRID + 3 * GRID;
  const gw = Math.max(options.w ?? 0, Math.ceil(Math.max(titleW, leftM + content.w + rightM + 4, tbW, 4 * GRID) / GRID));

  sides.left.forEach((p, i) => Object.assign(p, { rx: 0, ry: bodyStart + 1 + offset + i * PORT_PITCH }));
  sides.right.forEach((p, i) => Object.assign(p, { rx: gw, ry: bodyStart + 1 + offset + i * PORT_PITCH }));
  const spread = (list, ry) => {
    const start = Math.max(2, Math.floor((gw - (list.length - 1) * SIDE_PITCH) / 2));
    list.forEach((p, i) => Object.assign(p, { rx: start + i * SIDE_PITCH, ry }));
  };
  spread(sides.top, 0);
  spread(sides.bottom, gh);
  spec.gw = gw; spec.gh = gh;
  spec.box = {
    x0: leftM, x1: gw * GRID - rightM,
    y0: bodyStart * GRID, y1: (gh - gBottom) * GRID - 2,
    titleY: gTop * GRID + 14,
  };
}
