/* Live SVG view of a running circuit: wire colours, travelling wavefronts,
 * terminal values and module contents. Zoom and pan act on the viewBox. */

import { renderStatic, renderView, esc, STYLE } from './svg.js';
import { formatValue } from '../sim/format.js';
import { charWidth } from '../sim/metrics.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

function pointAt(points, distance) {
  let left = distance;
  for (let i = 1; i < points.length; i++) {
    const [x0, y0] = points[i - 1], [x1, y1] = points[i];
    const len = Math.abs(x1 - x0) + Math.abs(y1 - y0);
    if (left <= len) {
      const t = len ? left / len : 0;
      return [x0 + (x1 - x0) * t, y0 + (y1 - y0) * t];
    }
    left -= len;
  }
  return points[points.length - 1];
}

export class CircuitView {
  constructor(svg, { onSelect } = {}) {
    this.svg = svg;
    this.abort = new AbortController();
    this.onSelect = onSelect;
    this.showFrontValues = true;
    this.view = null;
    this.installZoom();
  }

  mount(sim) {
    this.sim = sim;
    const c = sim.circuit;
    this.svg.innerHTML = `<style>${STYLE}</style><rect class="canvas-bg" x="-2000" y="-2000" width="${c.width + 4000}" height="${c.height + 4000}"/>${renderStatic(c)}`;
    this.wireEls = new Map();
    for (const el of this.svg.querySelectorAll('[data-wire]')) {
      const wire = sim.wires.get(el.dataset.wire);
      this.wireEls.set(wire.id, { el, waves: el.querySelector('.waves'), d: el.querySelector('.wire-base').getAttribute('d'), wire, key: '' });
    }
    this.frontLayer = this.svg.querySelector('.fronts');
    this.viewEls = new Map([...this.svg.querySelectorAll('[data-view]')].map(el => [el.dataset.view, el]));
    this.portEls = [...this.svg.querySelectorAll('[data-port-value]')].map(el => {
      const [m, p] = el.dataset.portValue.split('.');
      const mod = sim.modules.get(m);
      const port = mod.spec.ports.find(q => q.name === p);
      return { el, mod, port, key: '' };
    });
    // Wavefront labels must not cover module boxes (their text) or each other.
    this.obstacles = c.modules.map(m => [m.x - 2, m.y - 2, m.x + m.w + 2, m.y + m.h + 2]);
    this.svg.onclick = event => this.handleClick(event);
    this.svg.onkeydown = event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.closest('[data-module], [data-wire], [data-switch]')) { event.preventDefault(); event.stopPropagation(); this.handleClick(event); } };
    if (!this.view) this.fit();
    else this.applyView();
    this.render(true);
  }

  handleClick(event) {
    if (this.dragged) return;
    const sw = event.target.closest('[data-switch]');
    if (sw) {
      const id = sw.dataset.switch, bit = Number(sw.dataset.bit);
      const current = this.sim.state(id).sw;
      this.sim.setExternal(id, 'sw', current ^ (1 << bit));
      this.render(true);
      this.onSelect?.({ kind: 'module', id }, { external: true });
      return;
    }
    const wire = event.target.closest('[data-wire]');
    if (wire) { this.onSelect?.({ kind: 'wire', id: wire.dataset.wire }); return; }
    const mod = event.target.closest('[data-module]');
    if (mod) { this.onSelect?.({ kind: 'module', id: mod.dataset.module }); return; }
    this.onSelect?.(null);
  }

  select(selection) {
    this.svg.querySelectorAll('.selected,.related').forEach(el => el.classList.remove('selected', 'related'));
    if (!selection) return;
    if (selection.kind === 'wire') {
      const w = this.wireEls.get(selection.id);
      w?.el.classList.add('selected');
      if (w) {
        const net = w.wire.net;
        for (const other of this.wireEls.values()) if (other.wire.net === net && other !== w) other.el.classList.add('related');
        for (const id of [w.wire.from, w.wire.to].map(k => k.split('.')[0])) this.svg.querySelector(`[data-module="${CSS.escape(id)}"]`)?.classList.add('related');
      }
    } else {
      this.svg.querySelector(`[data-module="${CSS.escape(selection.id)}"]`)?.classList.add('selected');
      for (const w of this.wireEls.values()) {
        if (w.wire.from.startsWith(`${selection.id}.`) || w.wire.to.startsWith(`${selection.id}.`)) w.el.classList.add('related');
      }
    }
  }

  /* Updates colours, wavefronts and labels. `full` also redraws module contents. */
  render(full = false) {
    const sim = this.sim;
    const cycle = sim.cycle;
    let fronts = '';
    const placed = [];
    const free = r => !placed.some(q => overlaps(q, r)) && !this.obstacles.some(q => overlaps(q, r));
    const label = (x, y, text) => {
      const w = text.length * charWidth('front') + 2, h = 11;
      for (const [dx, dy] of [[5, -16], [5, 4], [-5 - w, -16], [-5 - w, 4]]) {
        const r = [x + dx, y + dy, x + dx + w, y + dy + h];
        if (!free(r)) continue;
        placed.push(r);
        return `<text class="front-label" x="${r[0] + 1}" y="${r[3] - 2}">${esc(text)}</text>`;
      }
      return '';
    };
    for (const w of this.wireEls.values()) {
      const wire = w.wire;
      const bus = wire.width > 1;
      const inflight = wire.transitions.length > 0;
      const recent = wire.lastCycle === cycle && cycle > 0;
      const key = inflight ? `t${sim.time}` : `${wire.initial}|${recent}`;
      if (key === w.key) continue;
      w.key = key;
      if (bus) w.el.classList.toggle('changed', recent);
      else w.el.classList.toggle('high', !!wire.initial);
      if (!inflight) { if (w.hadWaves) { w.waves.innerHTML = ''; w.hadWaves = false; } continue; }
      // One layer per transition still travelling; newer layers lie on top.
      let layers = '';
      for (const t of wire.transitions) {
        const distance = Math.min(wire.length, Math.max(0, (sim.time - t.time) / wire.delay * wire.length));
        if (distance <= 0) continue;
        const cls = bus ? 'bus' : t.value ? 'high' : 'low';
        layers += `<path class="wave ${cls}" d="${w.d}" stroke-dasharray="${distance} ${wire.length + 10}"/>`;
        const [x, y] = pointAt(wire.points, distance);
        fronts += `<circle class="front ${cls}" cx="${x}" cy="${y}" r="${bus ? 4 : 3}"/>`;
        if (bus && this.showFrontValues) fronts += label(x, y, formatValue(t.value, wire.width));
      }
      w.waves.innerHTML = layers;
      w.hadWaves = true;
    }
    this.frontLayer.innerHTML = fronts;
    for (const p of this.portEls) {
      const value = p.port.dir === 'in' ? p.mod.in[p.port.name] : p.mod.out[p.port.name];
      const text = formatValue(value ?? 0, p.port.width);
      if (text !== p.key) { p.key = text; p.el.textContent = text; }
    }
    if (full) this.renderModules();
  }

  renderModules() {
    for (const m of this.sim.modules.values()) {
      const el = this.viewEls.get(m.id);
      if (!el) continue;
      const markup = renderView(m, m.def.view?.(m) ?? []);
      if (markup !== el._markup) { el._markup = markup; el.innerHTML = markup; }
    }
  }

  // ---- zoom and pan --------------------------------------------------------
  fit() {
    const c = this.sim.circuit;
    this.view = { x: -20, y: -10, w: c.width + 40, h: c.height + 20 };
    this.applyView();
  }
  applyView() {
    const { x, y, w, h } = this.view;
    this.svg.setAttribute('viewBox', `${x} ${y} ${w} ${h}`);
  }
  zoom(factor, cx, cy) {
    const v = this.view;
    const px = cx ?? v.x + v.w / 2, py = cy ?? v.y + v.h / 2;
    const w = Math.min(Math.max(v.w * factor, 120), this.sim.circuit.width * 3);
    const h = w * (v.h / v.w);
    this.view = { x: px - (px - v.x) * (w / v.w), y: py - (py - v.y) * (h / v.h), w, h };
    this.applyView();
  }
  focus(moduleId) {
    const m = this.sim.module(moduleId)?.spec;
    if (!m) return;
    const rect = this.svg.getBoundingClientRect();
    const w = Math.max(m.w * 3, 500), h = w * (rect.height / Math.max(rect.width, 1));
    this.view = { x: m.x + m.w / 2 - w / 2, y: m.y + m.h / 2 - h / 2, w, h };
    this.applyView();
  }
  toModel(event) {
    const rect = this.svg.getBoundingClientRect();
    const v = this.view;
    const scale = Math.max(v.w / rect.width, v.h / rect.height);
    const offX = (rect.width * scale - v.w) / 2, offY = (rect.height * scale - v.h) / 2;
    return [v.x - offX + (event.clientX - rect.left) * scale, v.y - offY + (event.clientY - rect.top) * scale];
  }
  destroy() { this.abort.abort(); this.svg.onclick = null; this.svg.onkeydown = null; }
  installZoom() {
    const svg = this.svg;
    const options = { signal: this.abort.signal };
    svg.addEventListener('wheel', event => {
      event.preventDefault();
      const [x, y] = this.toModel(event);
      this.zoom(Math.exp(event.deltaY * 0.0015), x, y);
    }, { passive: false, ...options });
    let drag = null;
    svg.addEventListener('pointerdown', event => {
      if (event.button !== 0) return;
      drag = { x: event.clientX, y: event.clientY, view: { ...this.view }, id: event.pointerId };
      this.dragged = false;
    }, options);
    svg.addEventListener('pointermove', event => {
      if (!drag) return;
      const rect = svg.getBoundingClientRect();
      const scale = Math.max(drag.view.w / rect.width, drag.view.h / rect.height);
      const dx = event.clientX - drag.x, dy = event.clientY - drag.y;
      if (!this.dragged && Math.hypot(dx, dy) < 4) return;
      if (!this.dragged) svg.setPointerCapture(drag.id);
      this.dragged = true;
      this.view = { ...drag.view, x: drag.view.x - dx * scale, y: drag.view.y - dy * scale };
      this.applyView();
    }, options);
    const end = () => { drag = null; setTimeout(() => { this.dragged = false; }, 0); };
    svg.addEventListener('pointerup', end, options);
    svg.addEventListener('pointercancel', end, options);
  }
}

const overlaps = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];

export { SVG_NS };
