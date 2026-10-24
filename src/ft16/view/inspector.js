import { createTranslator } from '../i18n/index.js';
/* Inspector panel: what a module does, and why a wire holds its value.
 * The "why" follows recorded causes: an output change was produced by a
 * clock edge, an external input, or the arrival of input changes. */

import { formatValue } from '../sim/format.js';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const label = (sim, id) => sim.module(id)?.spec.label ?? id;
const link = (kind, id, text) => `<button type="button" class="linkish" data-goto="${kind}:${esc(id)}">${esc(text)}</button>`;

export function inspectorHtml(sim, selection, locale = 'ja') {
  const t = createTranslator(locale);
  if (selection.kind === 'module') return moduleHtml(sim, selection.id, t);
  if (selection.kind === 'wire') return wireHtml(sim, selection.id, t);
  return '';
}

function moduleHtml(sim, id, t) {
  const m = sim.module(id);
  if (!m) return '';
  const lines = m.def.explain?.(m, t) ?? [];
  let html = `<div class="insp"><h3>${esc(m.spec.label)}</h3><div class="type">${esc(t(m.def.title))}${m.def.edge ? t(" · クロックで状態を更新") : t(" · 組み合わせ回路 (内部遅延 0)")}</div>`;
  html += `<ul>${lines.map(l => `<li>${esc(t(l))}</li>`).join('')}</ul>`;
  html += '<table>';
  for (const p of m.spec.ports) {
    const value = p.dir === 'in' ? m.in[p.name] : m.out[p.name];
    const peer = p.dir === 'in'
      ? sim.circuit.wires.find(w => w.to === `${id}.${p.name}`)
      : sim.circuit.wires.find(w => w.from === `${id}.${p.name}`);
    const name = p.name.replace(/^i_/, '');
    const where = peer ? link('wire', peer.id, p.dir === 'in' ? `← ${label(sim, peer.from.split('.')[0])}` : t("→ 配線")) : '';
    html += `<tr><td>${p.dir === 'in' ? t("入力") : t("出力")}</td><td>${esc(name)}</td><td>${where}</td><td class="v">${esc(formatValue(value ?? 0, p.width))}</td></tr>`;
  }
  html += '</table>';
  // Why are the outputs what they are? Show the most recent output change.
  const latest = Object.values(m.lastEmission).sort((a, b) => b.seq - a.seq)[0];
  if (latest) html += t("<div class=\"why\"><b>直近の出力の変化:</b> {0}</div>", emissionHtml(sim, latest, t));
  return `${html}</div>`;
}

function wireHtml(sim, id, t) {
  const w = sim.wires.get(id);
  if (!w) return '';
  const [fm, fp] = w.from.split('.'), [tm, tp] = w.to.split('.');
  let html = t("<div class=\"insp\"><h3>配線: {0}.{1} → {2}.{3}</h3>", esc(label(sim, fm)), esc(fp), esc(label(sim, tm)), esc(tp.replace(/^i_/, '')));
  html += t("<div class=\"type\">{0} · 長さ {1} · 伝わるのに {2} t</div>", w.width > 1 ? t("{0} bit バス", w.width) : '1 bit', Math.round(w.length), w.delay.toFixed(1));
  html += '<table>';
  html += t("<tr><td>送り出し側 ({0})</td><td class=\"v\">{1}</td></tr>", link('module', fm, label(sim, fm)), esc(formatValue(w.source, w.width)));
  html += t("<tr><td>受け取り側 ({0})</td><td class=\"v\">{1}</td></tr>", link('module', tm, label(sim, tm)), esc(formatValue(w.arrived, w.width)));
  html += '</table>';
  if (w.transitions.length) {
    html += t("<p class=\"note\" style=\"margin-top:6px\">伝わっている途中の変化:</p><ul>{0}</ul>", w.transitions.map(transition => {
      const done = Math.min(1, (sim.time - transition.time) / w.delay);
      return t("<li>{0} — {1}% 進行 (t = {2} に出発)</li>", esc(formatValue(transition.value, w.width)), Math.round(done * 100), transition.time.toFixed(1));
    }).join(''));
  }
  const transition = w.transitions.at(-1) ?? w.last;
  if (transition) html += t("<div class=\"why\"><b>なぜ {0} なのか:</b> {1}</div>", esc(formatValue(transition.value, w.width)), emissionHtml(sim, transition.emission, t));
  else html += t("<p class=\"note\">リセット後、この配線の値は変わっていません。</p>");
  return `${html}</div>`;
}

function emissionHtml(sim, e, t) {
  if (!e) return '';
  const who = t("{0} の出力 {1} が t = {2} に {3} になりました。", link('module', e.module, label(sim, e.module)), esc(e.port), e.time.toFixed(1), esc(formatValue(e.value, portWidth(sim, e))));
  const c = e.cause;
  if (!c || c.type === 'reset') return t("{0} (リセット直後の初期評価)", who);
  if (c.type === 'clock') return t("{0} 原因: クロック #{1} の立ち上がりで、このモジュールが入力の値を取り込んで状態を更新したため。", who, c.cycle);
  if (c.type === 'external') return t("{0} 原因: 外部からの入力 ({1}) を操作したため。", who, esc(c.key));
  if (c.type === 'eval') {
    const items = c.triggers.map(transition => {
      const w = sim.wires.get(transition.wire);
      const port = w ? w.to.split('.')[1].replace(/^i_/, '') : '?';
      return t("<li>入力 {0} に {1} が届いた ({2}, t = {3})</li>", esc(port), esc(formatValue(transition.value, w?.width ?? 8)), link('wire', transition.wire, t("{0} から", label(sim, w?.from.split('.')[0]))), (transition.time + (w?.delay ?? 0)).toFixed(1));
    }).join('');
    return t("{0} 原因: 次の入力の変化が届き、モジュールが評価し直したため。<ul>{1}</ul><span class=\"note\">リンクをたどると、さらに前の原因へさかのぼれます。</span>", who, items);
  }
  return who;
}

function portWidth(sim, e) {
  return sim.module(e.module)?.spec.ports.find(p => p.name === e.port)?.width ?? 8;
}
