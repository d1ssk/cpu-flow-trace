/* SVG helpers for the TD4 module drawing. */
import geometry from '../../simulator/td4/geometry.js';
const {pathOf}=geometry;
  const PAPER = '#fcfcfa', LOW = '#8d9596', HIGH = '#b76557';
  const color = v => v === 1 ? HIGH : v === 0 ? LOW : '#b6b2a7';
  const text = (x, y, value, cls = '', extra = '') =>
    `<text x="${x}" y="${y}" class="${cls}" ${extra}>${value}</text>`;
  const state = (x, y, key, cls = '') =>
    `<text x="${x}" y="${y}" class="state ${cls}" text-anchor="middle" data-value="${key}"></text>`;
  function wire(w, points = w.points, offset = null) {
    const d = pathOf(points);
    return `<g data-wire="${w.id}" ${offset===null?'':`data-offset="${offset}"`}>
      <path class="clearance" d="${d}"/><path class="wire wire-base" d="${d}"/><g class="wave-layers"></g>
      <path class="wire-hit" d="${d}" data-inspect="wire:${w.id}" role="button" tabindex="0" aria-label="配線 ${w.id} を観察"/>
    </g>`;
  }
export default {color, helpers:{wire,text,state,PAPER}};
