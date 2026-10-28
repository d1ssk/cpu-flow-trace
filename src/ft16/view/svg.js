/* Static SVG markup for a routed circuit, plus the module content rows.
 * Used by the browser viewer and by the Node snapshot script. Every text
 * position comes from the builder's measurements (sim/metrics.js), and
 * view rows are clipped to the module's view box, so text cannot overlap. */

import { formatValue } from '../sim/format.js';
import { FONT, FONT_FAMILY, LINE, charWidth, rowKind, showsValue } from '../sim/metrics.js';
import { bitLane, bitPin, bitStroke, laneJunction } from './bit-wires.js';

export const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
export const pathOf = points => points.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join('');

export function renderStatic(circuit) {
  const wires = circuit.wires.map(w => {
    const d = pathOf(w.points);
    const cls = w.width > 1 ? 'bus' : 'bit';
    const bits = Array.from({ length: w.width }, (_, bit) => {
      const lane = bitLane(w, bit);
      return `<path class="wire-base low" data-wire-bit="${bit}" d="${pathOf(lane.points)}" pathLength="1"><title>${esc(w.from)}[${bit}] → ${esc(w.to)}[${bit}]</title></path>`;
    }).join('');
    return `<g class="wire ${cls}" data-wire="${esc(w.id)}" data-width="${w.width}" style="--bit-stroke:${bitStroke(w.width)}" tabindex="0" role="button" aria-label="${esc(w.from)} → ${esc(w.to)}"><path class="wire-halo" d="${d}"/><path class="wire-hit" d="${d}"/>${bits}<g class="waves"></g></g>`;
  }).join('');
  const seen = new Set();
  const dots = circuit.nets.flatMap(n => n.junctions.flatMap(point => circuit.wires.filter(w => w.net === n.id).flatMap(w =>
    Array.from({ length: w.width }, (_, bit) => {
      const junction = laneJunction(w, bitLane(w, bit), point);
      if (!junction) return '';
      const [x, y] = junction.point, key = `${n.id}:${bit}:${x}:${y}`;
      if (seen.has(key)) return '';
      seen.add(key);
      return `<circle class="junction low" data-junction-wire="${esc(w.id)}" data-fraction="${junction.fraction}" data-bit="${bit}" cx="${x}" cy="${y}" r="${bitStroke(w.width) * 0.8}"/>`;
    })
  ))).join('');
  const modules = circuit.modules.map(renderModule).join('');
  return `<g class="wires">${wires}</g><g class="junctions">${dots}</g><g class="modules">${modules}</g><g class="fronts"></g>`;
}

function renderModule(m) {
  const { x, y, w, h } = m;
  let out = `<g class="module" data-module="${esc(m.id)}" tabindex="0" role="button" aria-label="${esc(m.label)}">`;
  out += `<rect class="module-box" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>`;
  out += `<text class="module-title" x="${x + w / 2}" y="${m.titleY}" text-anchor="middle">${esc(m.label)}</text>`;
  for (const p of m.ports) {
    const value = showsValue(p) ? ` <tspan class="port-value" data-port-value="${esc(m.id)}.${esc(p.name)}"></tspan>` : '';
    const name = esc(p.name.replace(/^i_/, ''));
    for (let bit = 0; bit < p.width; bit++) {
      const [px, py] = bitPin(p, bit);
      out += `<circle class="pin low" data-pin="${esc(m.id)}.${esc(p.name)}" data-bit="${bit}" cx="${px}" cy="${py}" r="${bitStroke(p.width) * 0.65}"><title>${name}[${bit}]</title></circle>`;
    }
    if (p.noLabel) continue;
    if (p.side === 'left') out += `<text class="port-label" x="${p.x + 5}" y="${p.y + 3}">${name}${value}</text>`;
    else if (p.side === 'right') out += `<text class="port-label" x="${p.x - 5}" y="${p.y + 3}" text-anchor="end">${value ? `${value.slice(1)} ` : ''}${name}</text>`;
    else if (p.side === 'top') out += `<text class="port-label" transform="translate(${p.x - 3} ${p.y + 5}) rotate(90)">${name}${value}</text>`;
    else out += `<text class="port-label" transform="translate(${p.x + 3} ${p.y - 5}) rotate(-90)">${name}${value}</text>`;
  }
  out += `<g class="module-view" data-view="${esc(m.id)}"></g>`;
  return `${out}</g>`;
}

const ASCENT = { row: 10, big: 12, small: 8.5 };

/* Text cut to `px` pixels of the given font. */
function fit(text, kind, px) {
  const max = Math.floor(px / charWidth(kind));
  return text.length <= max ? text : `${text.slice(0, Math.max(0, max - 1))}…`;
}

/* Inner rows of a module box, from the module definition's view(). */
export function renderView(m, rows) {
  const box = m.spec.view;
  const cx = box.x + box.w / 2;
  let y = box.y;
  let out = '';
  for (const row of rows) {
    if (row.kind === 'map') { out += memoryMap(cx, y, row); y += 36; continue; }
    if (row.kind === 'leds') { out += leds(cx, y + 11, row.value, row.n ?? 8); y += 22; continue; }
    if (row.kind === 'switches') { out += switches(cx, y + 12, row.value, row.module, row.n ?? 8); y += 24; continue; }
    if (row.kind === 'states') { out += stateChips(cx, y + 15, row); y += 22; continue; }
    const kind = rowKind(row.cls);
    if (y + LINE[kind] > box.y + box.h + 3) break;
    if (row.cells) {
      const text = row.cells.map(c => c.text).join(' ');
      const shown = fit(text, kind, box.w);
      if (shown !== text) out += `<text class="view-row ${row.cls ?? ''}" x="${cx}" y="${y + ASCENT[kind]}" text-anchor="middle">${esc(shown)}</text>`;
      else out += `<text class="view-row ${row.cls ?? ''}" x="${cx}" y="${y + ASCENT[kind]}" text-anchor="middle">${row.cells.map((c, i) => `<tspan class="${c.cls ?? ''}">${esc(c.text)}</tspan>${i < row.cells.length - 1 ? ' ' : ''}`).join('')}</text>`;
    } else if (row.text) {
      out += `<text class="view-row ${row.cls ?? ''}" x="${cx}" y="${y + ASCENT[kind]}" text-anchor="middle">${esc(fit(row.text, kind, box.w))}</text>`;
    }
    y += LINE[kind];
  }
  return out;
}

/* The whole memory as 64 blocks of 8 words (16 per row): darker blocks hold
 * non-zero words; outlines mark the fetch (blue) and data (orange) blocks. */
function memoryMap(cx, top, row) {
  const cell = 8, cols = 16, blocks = Math.ceil(row.words.length / 8);
  const left = cx - (cols * cell) / 2;
  let out = '';
  for (let b = 0; b < blocks; b++) {
    const x = left + (b % cols) * cell, y = top + 2 + Math.floor(b / cols) * cell;
    let used = false;
    for (let k = 0; k < 8; k++) if (row.words[b * 8 + k]) used = true;
    const cls = [used ? 'used' : '', row.write >= 0 && row.write >> 3 === b ? 'write' : row.last >= 0 && row.last >> 3 === b ? 'last' : ''].join(' ');
    out += `<rect class="map-cell ${cls}" x="${x}" y="${y}" width="${cell - 1}" height="${cell - 1}"/>`;
  }
  const mark = (addr, cls) => {
    if (addr === undefined || addr < 0 || addr >= row.words.length) return '';
    const b = addr >> 3, x = left + (b % cols) * cell - 1, y = top + 1 + Math.floor(b / cols) * cell;
    return `<rect class="map-mark ${cls}" x="${x}" y="${y}" width="${cell + 1}" height="${cell + 1}"/>`;
  };
  return out + mark(row.data, 'data') + mark(row.fetch, 'fetch');
}

function leds(cx, y, value, n) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = cx + ((n - 1) / 2 - i) * 18;
    out += `<circle class="led ${(value >> i) & 1 ? 'on' : ''}" cx="${x}" cy="${y}" r="6.5"/>`;
  }
  return out;
}

function switches(cx, y, value, module, n) {
  let out = '';
  for (let i = 0; i < n; i++) {
    const x = cx + ((n - 1) / 2 - i) * 18;
    const on = (value >> i) & 1;
    out += `<g class="switch ${on ? 'on' : ''}" data-switch="${esc(module)}" data-bit="${i}" role="button" tabindex="0" aria-label="switch ${i}"><rect x="${x - 7}" y="${y - 9}" width="14" height="18" rx="3"/><text x="${x}" y="${y + 3.5}" text-anchor="middle">${on ? 1 : 0}</text></g>`;
  }
  return out;
}

function stateChips(cx, y, row) {
  const w = 48, gap = 4, total = row.states.length * (w + gap) - gap;
  return row.states.map((name, i) => {
    const x = cx - total / 2 + i * (w + gap);
    const cls = `state-chip ${i === row.current ? 'on' : ''} ${i === row.next && i !== row.current ? 'next' : ''}`;
    return `<g class="${cls}"><rect x="${x}" y="${y - 12}" width="${w}" height="16" rx="8"/><text x="${x + w / 2}" y="${y - 1}" text-anchor="middle">${esc(fit(name, 'small', w - 4))}</text></g>`;
  }).join('');
}

export function portValueText(value, width) {
  return formatValue(value, width);
}

const MONO = FONT_FAMILY;
export const WIRE_STYLE = `
.ft-workspace .wire path {fill:none;stroke-linejoin:round;stroke-linecap:round}
.ft-workspace .wire-halo {stroke:var(--bg,#f6f4ef);stroke-width:10;pointer-events:none}
.ft-workspace .wire.bit .wire-halo {stroke-width:5}
.ft-workspace .wire-base, .ft-workspace .wire .wave {stroke-width:var(--bit-stroke);stroke-linecap:butt}
.ft-workspace .wire .high {stroke:var(--high,#b76557)}
.ft-workspace .wire .low {stroke:var(--low,#8d9596)}
.ft-workspace .wire-hit {stroke:transparent;stroke-width:10;cursor:pointer}
.ft-workspace .wire.selected .wire-halo, .ft-workspace .wire:focus-visible .wire-halo {stroke:var(--accent-soft,#f5e9e4);stroke-width:12}
.ft-workspace .wire.related .wire-halo {stroke:var(--accent-soft,#f5e9e4)}
.ft-workspace .wire .waves, .ft-workspace .fronts, .ft-workspace .junction {pointer-events:none}
.ft-workspace .pin.high, .ft-workspace .junction.high, .ft-workspace .front.high {fill:var(--high,#b76557)}
.ft-workspace .pin.low, .ft-workspace .junction.low, .ft-workspace .front.low {fill:var(--low,#8d9596)}
`;
export const STYLE = `
${WIRE_STYLE}
.ft-workspace .module-box {fill:var(--panel,#fffdf8);stroke:var(--ink-2,#56616a);stroke-width:1.3}
.ft-workspace .module-title {font:700 ${FONT.title}px ${MONO};fill:var(--ink,#1f2a30)}
.ft-workspace .port-label {font:${FONT.port}px ${MONO};fill:var(--ink-3,#6a747a)}
.ft-workspace .port-value {font:inherit;fill:var(--ink,#1f2a30);font-weight:600}
.ft-workspace .view-row {font:${FONT.row}px ${MONO};fill:var(--ink,#1f2a30)}
.ft-workspace .view-row.big {font-size:${FONT.big}px;font-weight:700}
.ft-workspace .view-row.small {font-size:${FONT.small}px}
.ft-workspace .view-row.off, .ft-workspace .view-row .off {fill:var(--ink-3,#8a9296)}
.ft-workspace .view-row.on, .ft-workspace .view-row .on {fill:var(--accent,#1c6fb0);font-weight:700}
.ft-workspace .view-row .write, .ft-workspace .view-row.write {fill:var(--high,#c0503e);font-weight:700}
.ft-workspace .view-row .last {fill:var(--changed,#b0731a);font-weight:700}
.ft-workspace .map-cell {fill:var(--cell,#ebe7dc)} .ft-workspace .map-cell.used {fill:var(--cell-nz,#c9c2b0)}
.ft-workspace .map-cell.last {fill:var(--changed-soft,#f0cf94)} .ft-workspace .map-cell.write {fill:var(--high-soft,#ee9f90)}
.ft-workspace .map-mark {fill:none;stroke-width:1.6} .ft-workspace .map-mark.fetch {stroke:var(--accent,#1c6fb0)} .ft-workspace .map-mark.data {stroke:var(--changed,#d4902a)}
.ft-workspace .led {fill:#e0dcd2;stroke:#8a9296} .ft-workspace .led.on {fill:#e8463a;stroke:#9c2a20}
.ft-workspace .switch rect {fill:#e9e6dd;stroke:#8a9296} .ft-workspace .switch.on rect {fill:#3c7fb8} .ft-workspace .switch text {font:9px ${MONO};fill:#333} .ft-workspace .switch.on text {fill:#fff}
.ft-workspace .state-chip rect {fill:#ece8de;stroke:#b9b3a5} .ft-workspace .state-chip.on rect {fill:var(--accent,#1c6fb0);stroke:var(--accent,#1c6fb0)}
.ft-workspace .state-chip text {font:${FONT.small}px ${MONO};fill:var(--ink-2,#56616a)} .ft-workspace .state-chip.on text {fill:#fff;font-weight:700}
.ft-workspace .state-chip.next rect {stroke:var(--accent,#1c6fb0);stroke-width:2}
.ft-workspace .front-label {font:700 ${FONT.front}px ${MONO};fill:var(--ink-2,#56616a);paint-order:stroke;stroke:var(--bg,#f6f4ef);stroke-width:3px}
`;
