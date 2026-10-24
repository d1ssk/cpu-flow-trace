import { message } from '../i18n/message.js';
/* Modules for the pipelined implementations: pipeline registers, control
 * bundles, hazard detection, forwarding, branch resolution and prediction,
 * MEM-stage redirects and precise traps. */

import { disassemble } from '../isa/disassembler.js';
import { CAUSE, CAUSE_NAMES, CAUSE_SHORT, COND_NAMES, PROFILES, TRAP_VECTOR, condHolds, hex } from '../isa/spec.js';
import { PCSRC, WB, decodeControl, readsOf } from './control.js';
import { formatValue, flagsText } from './format.js';
import { T, lines } from './metrics.js';

const P = (name, dir, width, side) => ({ name, dir, width, side: side ?? (dir === 'in' ? 'left' : 'right') });
const v = formatValue;
const pcOf = pc1 => (pc1 - 1) & 0xFFFF;

/* Control bundles carried down the pipeline. Each entry: [name, width]. */
export const BUNDLES = {
  ex: [['aluOp', 4], ['aluSrc', 1], ['flagWrite', 1], ['br', 1], ['jal', 1], ['jalr', 1], ['cond', 4], ['link', 1]],
  m: [['memWrite', 1], ['memRead', 1], ['halt', 1], ['fence', 1], ['reti', 1], ['ei', 1], ['di', 1], ['csrWrite', 1], ['tlbWrite', 1], ['flagSrc', 1]],
  wb: [['regWrite', 1], ['wbSel', 2]],
};
export const bundleWidth = fields => fields.reduce((n, [, w]) => n + w, 0);
export function pack(fields, values) {
  let word = 0, shift = 0;
  for (const [name, width] of fields) { word |= ((values[name] ?? 0) & ((1 << width) - 1)) << shift; shift += width; }
  return word;
}
export function unpack(fields, word) {
  const out = {};
  let shift = 0;
  for (const [name, width] of fields) { out[name] = (word >> shift) & ((1 << width) - 1); shift += width; }
  return out;
}
export const bundlesFor = sys => ({ ex: BUNDLES.ex, m: sys ? BUNDLES.m : BUNDLES.m.slice(0, 4), wb: BUNDLES.wb });
const describe = o => Object.entries(o).filter(([, x]) => x).map(([k, x]) => (x === 1 ? k : `${k}=${x}`)).join(' ') || '-';

export const PIPEREG = {
  delay: 1,
  title: 'パイプラインレジスタ',
  ports: p => [
    ...p.fields.filter(([name]) => p.consts?.[name] === undefined).map(([name, width]) => P(`d_${name}`, 'in', width)),
    P('en', 'in', 1, 'top'), P('clr', 'in', 1, 'top'),
    ...p.fields.map(([name, width]) => P(name, 'out', width)),
  ],
  init: p => ({ values: Object.fromEntries(p.fields.map(([n]) => [n, 0])) }),
  comb: m => { for (const [name] of m.params.fields) m.emit(name, m.state.values[name]); },
  edge: m => {
    let values;
    if (m.in.clr) values = Object.fromEntries(m.params.fields.map(([n]) => [n, 0]));
    else if (m.in.en) values = Object.fromEntries(m.params.fields.map(([n]) => [n, m.params.consts?.[n] ?? m.in[`d_${n}`]]));
    else return undefined;
    return JSON.stringify(values) === JSON.stringify(m.state.values) ? undefined : { values };
  },
  view: m => {
    const s = m.state.values;
    if (!s.v) return [{ text: 'bubble', cls: 'off' }];
    return [{ text: `PC ${hex(pcOf(s.pc1))}`, cls: 'big' }, ...(s.ir !== undefined ? [{ text: disassemble(s.ir, m.params.profile ?? PROFILES.full, pcOf(s.pc1)), cls: 'small' }] : [])];
  },
  size: p => [T(7, 'big'), ...(p.fields.some(([n]) => n === 'ir') ? [T(18, 'small')] : [])],
  explain: (m, t = message) => {
    const s = m.state.values;
    return [
      t("{0}の間に置くレジスタ。クロックごとに前の段の結果を取り込み、次の段へ1クロック分保持して渡します。", m.params.stageName ?? t("段")),
      m.in.clr ? t("次のクロックで中身を消して「泡」(何もしない命令) にします (flush / ストール時の挿入)。") :
        m.in.en ? t("次のクロックで前の段の値を取り込みます。") : t("次のクロックでは値を保持します (前の段が止まっている)。"),
      s.v ? t("保持中: PC {0} の命令", hex(pcOf(s.pc1))) : t("保持中: 泡 (有効な命令なし)"),
    ];
  },
};

export const UNPACK = {
  delay: 0,
  title: '制御信号の分配',
  ports: p => [P('bus', 'in', bundleWidth(p.fields)), ...p.fields.map(([n, w]) => P(n, 'out', w))],
  comb: m => { const u = unpack(m.params.fields, m.in.bus); for (const [n] of m.params.fields) m.emit(n, u[n]); },
  view: () => [],
  size: () => [],
  explain: (m, t = message) => [t("パイプラインレジスタで運ばれてきた制御信号の束を、この段で使う個々の信号に分けます (配線を分けるだけです)。"), ...m.params.fields.map(([n, w]) => `${n} = ${w > 1 ? m.out[n] : v(m.out[n], 1)}`)],
};

/* Pipeline decoder: emits the per-stage control bundles. */
export function pipelineDecode(ir, valid, params, kernel, iexc = 0) {
  const zero = { ex: {}, m: {}, wb: {}, useA: 0, useB: 0, ctl: 0, exc: 0 };
  if (!valid) return zero;
  // A fetch exception (instruction TLB miss, execute fault) travels down the pipeline.
  if (iexc) return { ...zero, exc: iexc };
  const c = decodeControl(ir, params.profile, { kernel });
  if (c.illegal) return { ...zero, exc: CAUSE.ILLEGAL };
  if (c.syscall) return { ...zero, exc: CAUSE.SYSCALL };
  const reads = readsOf(c.kind);
  return {
    ex: {
      aluOp: c.aluOp, aluSrc: c.aluSrc, flagWrite: c.flagWrite && !c.reti ? 1 : 0, cond: c.cond,
      br: c.pcSrc === PCSRC.BR ? 1 : 0, jal: c.pcSrc === PCSRC.JAL ? 1 : 0, jalr: c.pcSrc === PCSRC.JALR ? 1 : 0, link: c.wbSel === WB.LINK && c.regWrite ? 1 : 0,
    },
    m: {
      memWrite: c.memWrite, memRead: c.memRead, halt: c.halt, fence: c.fence,
      reti: c.reti, ei: c.ei, di: c.di, csrWrite: c.csrWrite, tlbWrite: c.tlbWrite, flagSrc: c.flagSrc,
    },
    wb: { regWrite: c.regWrite, wbSel: c.wbSel },
    useA: reads.useA, useB: reads.useB,
    // Control transfers and serialising instructions a non-speculating pipeline waits for.
    ctl: c.pcSrc !== PCSRC.SEQ || c.halt || c.fence || c.csrWrite || c.tlbWrite || c.ei || c.di ? 1 : 0,
    exc: 0,
  };
}

export const PCTRL = {
  delay: 4,
  title: '制御回路 (デコーダ)',
  ports: p => [
    P('ir', 'in', 16), P('v', 'in', 1), ...(p.priv ? [P('kernel', 'in', 1), P('iexc', 'in', 3)] : []),
    P('ex', 'out', bundleWidth(p.bundles.ex)), P('m', 'out', bundleWidth(p.bundles.m)), P('wb', 'out', bundleWidth(p.bundles.wb)),
    P('useA', 'out', 1), P('useB', 'out', 1), P('ctl', 'out', 1), ...(p.sys ? [P('exc', 'out', 3)] : []),
  ],
  comb: m => {
    const r = pipelineDecode(m.in.ir, m.in.v, m.params, m.params.priv ? m.in.kernel : 1, m.in.iexc);
    m.emit('ex', pack(m.params.bundles.ex, r.ex));
    m.emit('m', pack(m.params.bundles.m, r.m));
    m.emit('wb', pack(m.params.bundles.wb, r.wb));
    m.emit('useA', r.useA); m.emit('useB', r.useB); m.emit('ctl', r.ctl);
    if (m.params.sys) m.emit('exc', r.exc);
  },
  view: m => [{ text: m.in.v ? disassemble(m.in.ir, m.params.profile) : 'bubble', cls: 'big' }],
  size: () => [T(18, 'big')],
  explain: (m, t = message) => {
    const r = pipelineDecode(m.in.ir, m.in.v, m.params, m.params.priv ? m.in.kernel : 1, m.in.iexc);
    const out = [t("ID段で命令を解読し、EX段・MEM段・WB段で使う制御信号を束ねてパイプラインレジスタへ送ります。")];
    if (!m.in.v) return [...out, t("いまは泡 (無効) なので、すべての制御信号を L にします。")];
    out.push(`${disassemble(m.in.ir, m.params.profile)}: EX ${describe(r.ex)} / MEM ${describe(r.m)} / WB ${describe(r.wb)}`);
    out.push(t("読むレジスタ: {0}{1}{2} (ハザード検出に使う)", r.useA ? 'ra ' : '', r.useB ? 'rb' : '', !r.useA && !r.useB ? t("なし") : ''));
    if (r.exc) out.push(t("例外: {0}", CAUSE_NAMES[r.exc]));
    return out;
  },
};

export const MODE_NAMES = ['ストールのみ', 'フォワーディング', 'フォワーディング + フラッシュ', 'フォワーディング + 分岐予測'];
const MODE_SHORT = ['stall only', 'forwarding', 'fwd + flush', 'fwd + predict'];

export const CONFIG = {
  delay: 0,
  title: '設定',
  ports: () => [P('mode', 'out', 2)],
  init: (p, ctx) => ({ mode: ctx.options?.hazardMode ?? p.mode ?? 2 }),
  comb: m => m.emit('mode', m.state.mode),
  view: m => [{ text: `${m.state.mode}: ${MODE_SHORT[m.state.mode]}`, cls: 'big' }],
  size: () => [T(16, 'big')],
  explain: (m, t = message) => [
    t("ハザードの解決方法を選ぶ設定です (実際のCPUでは設計時に決まります)。"),
    t("0 ストールのみ: 依存する命令は結果が書き込まれるまで ID 段で待ち、分岐系の命令の後は取り込みを止めます。"),
    t("1 フォワーディング: 結果をレジスタへ書く前に、EX/MEM・MEM/WB から直接 ALU へ回します。ロード直後の使用だけは1クロック待ちます。"),
    t("2 + フラッシュ: 分岐は「成立しない」と仮定して次の命令を取り込み続け、外れたら取り込んだ命令を捨てます。"),
    t("3 + 分岐予測: BTB (分岐先バッファ) と2ビットカウンタで、過去の結果から次の番地を予測します。"),
    t("現在: {0} {1}", m.state.mode, MODE_NAMES[m.state.mode]),
  ],
};

export const HAZARD = {
  delay: 3,
  title: 'ハザード検出',
  ports: p => [
    P('useA', 'in', 1), P('useB', 'in', 1), P('ra', 'in', 3), P('rb', 'in', 3), P('ctl', 'in', 1),
    P('deRd', 'in', 3), P('deWb', 'in', 3), P('deM', 'in', bundleWidth(p.mFields)), ...(p.depth === 5 ? [P('emRd', 'in', 3), P('emWb', 'in', 3)] : []), P('mode', 'in', 2, 'top'),
    P('stall', 'out', 1), P('hold', 'out', 1),
  ],
  comb: m => { const r = hazard(m.in, m.params); m.emit('stall', r.stall); m.emit('hold', r.hold); },
  view: m => [{ text: m.out.stall ? 'stall (data)' : m.out.hold ? 'hold (control)' : 'no hazard', cls: m.out.stall || m.out.hold ? 'on big' : 'off' }],
  size: () => [T(14, 'big')],
  explain: (m, t = message) => [t("ID段の命令が読むレジスタを、先行する命令がまだ書き込んでいないかを調べます。"), ...hazard(m.in, m.params, t).why],
};

export function hazard(i, params, t = message) {
  const why = [];
  const deWe = i.deWb & 1, deLate = ((i.deWb >> 1) & 1) === 1, emWe = i.emWb & 1;
  const dm = unpack(params.mFields, i.deM);
  const deRedirects = dm.halt || dm.fence || dm.reti || dm.csrWrite || dm.tlbWrite || dm.ei || dm.di;
  const uses = r => (i.useA && i.ra === r) || (i.useB && i.rb === r);
  let stall = 0, hold = 0;
  if (i.mode >= 1) {
    if (params.depth === 5 && deWe && deLate && uses(i.deRd)) { stall = 1; why.push(t("ロードや CSRR (EX段) が r{0} の値を得るのはMEM段の終わり。フォワーディングでも間に合わないので1クロック待ちます。", i.deRd)); }
  } else {
    if (deWe && uses(i.deRd)) { stall = 1; why.push(t("{0}段の命令が r{1} をまだ書いていないので待ちます。", params.depth === 5 ? 'EX' : 'MW', i.deRd)); }
    else if (params.depth === 5 && emWe && uses(i.emRd)) { stall = 1; why.push(t("MEM段の命令が r{0} をまだ書いていないので待ちます。", i.emRd)); }
  }
  if (i.mode <= 1 && !stall) {
    if (i.ctl) { hold = 1; why.push(t("ID段の命令は分岐系 (または状態を変える命令) です。行き先が決まるまで次の命令を取り込みません。")); }
    else if (deRedirects) { hold = 1; why.push(t("次の段の命令 (HALT・FENCEI など) は MEM段で取り込み直しを指示するので、取り込みを止めて待ちます。")); }
  }
  if (!why.length) why.push(t("依存関係による待ちはありません。r0 への書き込みは捨てられるので、比較の対象になりません。"));
  return { stall, hold, why };
}

const SRC = ['reg', 'EX/MEM', 'MEM/WB'];
export const FWD = {
  delay: 3,
  title: 'フォワーディング',
  ports: p => [
    P('ra', 'in', 3), P('rb', 'in', 3), ...(p.depth === 3 ? [] : [P('emRd', 'in', 3), P('emWb', 'in', 3)]), P('mwRd', 'in', 3), P('mwWe', 'in', 1), P('mode', 'in', 2, 'top'),
    P('selA', 'out', 2), P('selB', 'out', 2),
  ],
  comb: m => { const r = forwarding(m.in); m.emit('selA', r.selA); m.emit('selB', r.selB); },
  view: m => [{ text: `a<${SRC[m.out.selA]} b<${SRC[m.out.selB]}`, cls: m.out.selA || m.out.selB ? 'on' : 'off' }],
  size: () => [T(17)],
  explain: (m, t = message) => {
    const r = forwarding(m.in);
    const name = [t("レジスタファイルの値"), t("EX/MEM の結果"), t("MEM/WB の結果")];
    return [
      t("実行する命令が使うレジスタ (a: ra, b: rb) を、まだ書き込まれていない先行命令の書き込み先と比べ、一致すれば結果を直接 ALU へ回します。"),
      m.in.mode === 0 ? t("設定がストールのみなので、フォワーディングしません。") : `a: ${name[r.selA]}、b: ${name[r.selB]}`,
    ];
  },
};
function forwarding(i) {
  if (i.mode === 0) return { selA: 0, selB: 0 };
  const emWe = (i.emWb ?? 0) & 1, emEarly = (((i.emWb ?? 0) >> 1) & 1) === 0; // ALU or link result
  const pick = r => (emWe && emEarly && i.emRd === r ? 1 : i.mwWe && i.mwRd === r ? 2 : 0);
  return { selA: pick(i.ra), selB: pick(i.rb) };
}

/* Branch resolution in EX: the actual next PC against the predicted one. */
export const BRU = {
  delay: 3,
  title: '分岐判定',
  ports: () => [
    P('br', 'in', 1), P('jal', 'in', 1), P('jalr', 'in', 1), P('cond', 'in', 4), P('flags', 'in', 4),
    P('pn', 'in', 16), P('pc1', 'in', 16), P('target', 'in', 16), P('jtarget', 'in', 16),
    P('redirect', 'out', 1), P('npc', 'out', 16), P('taken', 'out', 1), P('isBr', 'out', 1),
  ],
  comb: m => {
    const r = resolve(m.in);
    m.emit('isBr', m.in.br || m.in.jal || m.in.jalr ? 1 : 0);
    m.emit('taken', r.taken); m.emit('redirect', r.redirect); m.emit('npc', r.npc);
  },
  view: m => {
    const r = resolve(m.in);
    const branch = m.in.br || m.in.jal || m.in.jalr;
    return [{ text: !branch && !r.redirect ? '-' : `${branch ? (r.taken ? 'taken' : 'not taken') : 'no branch'}${r.redirect ? ': fix' : ': ok'}`, cls: r.redirect ? 'on big' : 'off' }];
  },
  size: () => [T(16, 'big')],
  explain: (m, t = message) => {
    const r = resolve(m.in);
    const out = [t("EX段で実際の次の番地を求め、取り込みのときに予測した番地 (予測なしなら PC+1) と比べます。違っていれば PC を正しい番地に変え、後ろの命令を捨てます。")];
    if (m.in.br) out.push(t("{0}: フラグ {1} → {2}", COND_NAMES[m.in.cond], flagsText(m.in.flags), r.taken ? t("成立、行き先 {0}", v(m.in.target, 16)) : t("不成立")));
    else if (m.in.jal) out.push(t("JAL: 常に {0} (PC+1+オフセット) へ。", v(m.in.target, 16)));
    else if (m.in.jalr) out.push(t("JALR: レジスタ+オフセット = {0} へ。行き先が毎回変わりうるので、予測した番地との比較が必要です。", v(m.in.jtarget, 16)));
    else out.push(t("いまの命令は分岐ではないので、次の番地は PC+1 です。"));
    out.push(t("実際 {0} / 予測 {1} → {2}", v(r.npc, 16), v(m.in.pn, 16), r.redirect ? t("外れ。取り込み直します。") : t("一致。そのまま進みます。")));
    return out;
  },
};
function resolve(i) {
  const taken = i.jal || i.jalr ? 1 : i.br ? (condHolds(i.cond, i.flags) ? 1 : 0) : 0;
  const npc = taken ? (i.jalr ? i.jtarget : i.target) : i.pc1;
  return { taken, npc, redirect: npc !== i.pn ? 1 : 0 };
}

/* Branch target buffer with 2-bit counters, indexed by PC[1:0]. It
 * outputs the predicted next PC: the stored target, or PC+1. */
export const BTB = {
  delay: 4,
  title: '分岐予測 (BTB)',
  ports: p => [
    P('pc', 'in', 16), P('pc1', 'in', 16), P('mode', 'in', 2, 'top'), ...(p.wait ? [P('hold', 'in', 1, 'bottom')] : []),
    P('upd', 'in', 1, 'bottom'), P('upc1', 'in', 16, 'bottom'), P('taken', 'in', 1, 'bottom'), P('target', 'in', 16, 'bottom'),
    P('pn', 'out', 16), P('pt', 'out', 1),
  ],
  init: () => ({ entries: Array.from({ length: 4 }, () => ({ valid: 0, tag: 0, target: 0, counter: 1 })) }),
  comb: m => {
    const e = m.state.entries[m.in.pc & 3];
    const hit = m.in.mode === 3 && e.valid && e.tag === m.in.pc >> 2 && e.counter >= 2;
    m.emit('pt', hit ? 1 : 0);
    m.emit('pn', hit ? e.target : m.in.pc1);
  },
  edge: m => {
    if (!m.in.upd || m.in.mode !== 3 || m.in.hold) return undefined;
    const entries = m.state.entries.map(e => ({ ...e }));
    const upc = pcOf(m.in.upc1);
    const e = entries[upc & 3], tag = upc >> 2;
    if (!e.valid || e.tag !== tag) Object.assign(e, { valid: 1, tag, counter: m.in.taken ? 2 : 1, target: m.in.target });
    else { e.counter = Math.max(0, Math.min(3, e.counter + (m.in.taken ? 1 : -1))); if (m.in.taken) e.target = m.in.target; }
    return { entries };
  },
  view: m => m.state.entries.map((e, i) => ({
    text: e.valid ? `${i} ${hex((e.tag << 2) | i, 3)}>${hex(e.target, 3)} ${['SN', 'WN', 'WT', 'ST'][e.counter]}` : `${i} -`,
    cls: (m.in.pc & 3) === i && m.out.pt ? 'on' : 'off',
  })),
  size: () => lines(4, 14),
  explain: (m, t = message) => [
    t("取り込み中の PC で表を引き、過去にその番地の分岐が成立していれば、記録した行き先を次の番地として予測します。各エントリの2ビットカウンタ (SN 強不成立・WN 弱不成立・WT 弱成立・ST 強成立) は成立で+1、不成立で−1され、2以上なら「成立」と予測します。"),
    m.in.mode !== 3 ? t("設定が分岐予測ではないため、常に PC+1 を予測します。") : m.out.pt ? t("PC {0} は成立と予測 → 次は {1}。", v(m.in.pc, 16), v(m.out.pn, 16)) : t("PC {0} は予測なし (PC+1)。", v(m.in.pc, 16)),
    m.in.upd && m.in.mode === 3 ? t("EX段の分岐結果 ({0}) で {1} のエントリを更新します。", m.in.taken ? t("成立") : t("不成立"), hex(pcOf(m.in.upc1))) : '',
  ].filter(Boolean),
};

/* Next-PC selection and pipeline flow control. PCMUX: 0 predicted, 1 EX fix, 2 MEM fix. */
export const NPC = {
  delay: 2,
  title: '次PC・流れ制御',
  ports: p => [
    P('exRedir', 'in', 1), P('memRedir', 'in', 1), P('stall', 'in', 1), P('hold', 'in', 1), P('halted', 'in', 1),
    ...(p.fwait ? [P('fwait', 'in', 1)] : []), ...(p.mwait ? [P('mwait', 'in', 1)] : []),
    P('sel', 'out', 2), P('pcEn', 'out', 1), P('fdEn', 'out', 1), P('fdClr', 'out', 1), P('deEn', 'out', 1), P('deClr', 'out', 1),
    ...(p.depth === 3 ? [] : [P('emEn', 'out', 1), P('emClr', 'out', 1)]), ...(p.mwait ? [P('mwEn', 'out', 1)] : []),
  ],
  comb: m => { const r = flow(m.in, m.params); for (const [k, x] of Object.entries(r.out)) if (m.out[k] !== undefined) m.emit(k, x); },
  view: m => [{ text: flow(m.in, m.params).summary, cls: 'big' }],
  size: () => [T(13, 'big')],
  explain: (m, t = message) => [t("次に取り込む番地と、各パイプラインレジスタを進める・止める・空にする信号を決めます。"), ...flow(m.in, m.params, t).why],
};
export function flow(i, params, t = message) {
  const why = [];
  const mwait = params.mwait ? i.mwait : 0, fwait = params.fwait ? i.fwait : 0;
  const out = { sel: 0, pcEn: 1, fdEn: 1, fdClr: 0, deEn: 1, deClr: 0, emEn: 1, emClr: 0, mwEn: 1 };
  if (mwait) {
    // A data-memory wait freezes everything, MEM/WB included.
    Object.assign(out, { pcEn: 0, fdEn: 0, deEn: 0, emEn: 0, mwEn: 0 });
    why.push(t("MEM段がメモリ (キャッシュミスや書き込み) を待っているので、パイプライン全体を止めます。MEM/WB も保持するので、フォワーディングの値も変わりません。"));
    return { out, why, summary: 'MEM wait' };
  }
  let summary = 'normal';
  if (i.memRedir) {
    Object.assign(out, { sel: 2, fdClr: 1, deClr: 1, emClr: 1 });
    why.push(params.depth === 3 ? t("MW段で行き先が決まりました (HALT・FENCEI・RETI など)。DX・IF段の命令を捨てて、その番地から取り込み直します。") : t("MEM段で行き先が決まりました (HALT・FENCEI・RETI・トラップなど)。EX・ID・IF段の命令を捨てて、その番地から取り込み直します。"));
    summary = 'MEM redirect';
  } else if (i.stall && params.depth === 3) {
    // With 3 stages the stalled instruction is the one in DX: its branch
    // result uses stale operands, so the stall wins over a DX redirect.
    Object.assign(out, { pcEn: 0, fdEn: 0, deClr: 1 });
    why.push(t("データハザード: DX段の命令が使うレジスタがまだ書かれていません。PC と IF/DX を止め、DX/MW には泡を入れます (この命令の分岐判定はまだ使えません)。"));
    summary = 'stall';
  } else if (i.exRedir) {
    Object.assign(out, params.depth === 3 ? { sel: 1, fdClr: 1 } : { sel: 1, fdClr: 1, deClr: 1 });
    why.push(params.depth === 3 ? t("DX段で予測が外れたことがわかりました。IF段の1命令を捨てて、正しい番地から取り込みます。") : t("EX段で予測が外れたことがわかりました。ID・IF段の2命令を捨てて、正しい番地から取り込みます。"));
    summary = 'flush';
  } else if (i.stall) {
    Object.assign(out, { pcEn: 0, fdEn: 0, deClr: 1 });
    why.push(t("データハザード: PC と IF/ID を止め、ID/EX には泡を入れます。"));
    summary = 'stall';
  } else if (i.halted) {
    Object.assign(out, { pcEn: 0, fdClr: 1 });
    why.push(t("停止中なので命令を取り込みません。"));
    summary = 'halted';
  } else if (fwait) {
    Object.assign(out, { pcEn: 0, fdClr: 1 });
    why.push(params.cache ? t("命令キャッシュのミスでメモリを待っています。ID段には泡を送ります。") : t("メモリのポートをデータ側が使っているので、このクロックは命令を取り込めません (構造ハザード)。ID段には泡を送ります。"));
    summary = 'fetch wait';
  } else if (i.hold) {
    Object.assign(out, { pcEn: 0, fdClr: 1 });
    why.push(t("分岐系の命令の行き先が決まるまで、取り込みを止めて泡を送ります。"));
    summary = 'hold';
  } else why.push(t("予測した番地 (予測なしなら PC+1) を次に取り込みます。"));
  return { out, why, summary };
}

/* MEM-stage redirect: HALT, RETI and serialising instructions (FENCEI,
 * CSRW, TLBW, EI, DI) restart fetch after themselves; traps go to the vector. */
export const MREDIR = {
  delay: 1,
  title: 'MEM段の行き先',
  ports: p => [P('m', 'in', bundleWidth(p.mFields)), ...(p.sys ? [P('trap', 'in', 1), P('epc', 'in', 16)] : []), P('pc1', 'in', 16), P('redirect', 'out', 1), P('target', 'out', 16)],
  comb: m => { const r = memRedirect(m); m.emit('redirect', r.redirect); m.emit('target', r.target); },
  view: m => [{ text: memRedirect(m).label, cls: m.out.redirect ? 'on' : 'off' }],
  size: () => [T(14)],
  explain: (m, t = message) => [
    t("HALT や状態を変える命令 (FENCEI・CSRW・TLBW・EI・DI)、RETI、トラップは、後ろの命令を捨てて取り込み直す必要があるので、MEM段で行き先を指示します。"),
    m.out.redirect ? t("{0}: PC ← {1}、後ろの段の命令を捨てます。", memRedirect(m).label, v(m.out.target, 16)) : t("行き先の変更はありません。"),
  ],
};
function memRedirect(m) {
  const i = m.in, b = unpack(m.params.mFields, i.m);
  if (m.params.sys && i.trap) return { redirect: 1, target: TRAP_VECTOR, label: 'trap -> vector' };
  if (b.reti) return { redirect: 1, target: i.epc, label: 'RETI -> EPC' };
  if (b.halt) return { redirect: 1, target: i.pc1, label: 'HALT' };
  if (b.fence || b.ei || b.di || b.csrWrite || b.tlbWrite) return { redirect: 1, target: i.pc1, label: 'refetch' };
  return { redirect: 0, target: i.pc1, label: '-' };
}

/* Precise traps in MEM. Exceptions raised in earlier stages travel with
 * their instruction; an interrupt lets the MEM instruction complete and
 * resumes at its successor. */
export const PTRAP = {
  delay: 3,
  title: 'トラップ判定',
  ports: () => [
    P('v', 'in', 1), P('exc', 'in', 3), P('m', 'in', bundleWidth(BUNDLES.m)), P('dtlbMiss', 'in', 1), P('wfault', 'in', 1), P('dva', 'in', 16),
    P('irq', 'in', 1), P('ie', 'in', 1), P('halted', 'in', 1), P('wait', 'in', 1), P('pc', 'in', 16), P('pc1', 'in', 16), P('npc', 'in', 16),
    P('take', 'out', 1), P('fault', 'out', 1), P('cause', 'out', 3), P('epc', 'out', 16), P('badva', 'out', 16),
  ],
  comb: m => { const r = pipelineTrap(m.in); for (const k of ['take', 'fault', 'cause', 'epc', 'badva']) m.emit(k, r[k]); },
  view: m => [{ text: m.out.take ? CAUSE_SHORT[m.out.cause] : 'no trap', cls: m.out.take ? 'on big' : 'off' }],
  size: () => [T(11, 'big')],
  explain: (m, t = message) => [t("MEM段で、その命令が持ってきた例外 (命令TLBミス・実行保護・不正命令・システムコール) と、MEM段で起きる例外 (データTLBミス・書き込み保護)、割り込みを判定します。トラップするときは後ろの命令をすべて捨てるので、どの命令まで実行されたかが明確 (正確な例外) になります。"), ...pipelineTrap(m.in, t).why],
};
export function pipelineTrap(i, t = message) {
  const none = { take: 0, fault: 0, cause: 0, epc: 0, badva: 0 };
  const b = unpack(BUNDLES.m, i.m);
  const pc = pcOf(i.pc1);
  const interrupt = i.irq && i.ie;
  if (i.halted && interrupt) return { take: 1, fault: 0, cause: CAUSE.TIMER, epc: i.pc, badva: 0, why: [t("停止中に割り込み: HALT の次の命令を EPC にしてトラップします。")] };
  if (!i.v) return { ...none, why: [interrupt ? t("MEM段が泡なので、割り込みは次の命令まで待ちます。") : t("MEM段は泡です。")] };
  if (i.exc) {
    const syscall = i.exc === CAUSE.SYSCALL, fetch = i.exc === CAUSE.ITLB_MISS || i.exc === CAUSE.EXEC_PROTECT;
    return { take: 1, fault: 1, cause: i.exc, epc: syscall ? i.pc1 : pc, badva: fetch ? pc : 0, why: [t("この命令は {0} を持って来ました → トラップ。{1}", CAUSE_NAMES[i.exc], syscall ? t("EPC は次の命令。") : t("EPC はこの命令 (やり直す)。"))] };
  }
  const access = b.memRead || b.memWrite;
  if (access && i.dtlbMiss) return { take: 1, fault: 1, cause: CAUSE.DTLB_MISS, epc: pc, badva: i.dva, why: [t("データ番地のページがTLBにありません → データTLBミス。この命令の書き込みは取り消します。")] };
  if (b.memWrite && i.wfault) return { take: 1, fault: 1, cause: CAUSE.WRITE_PROTECT, epc: pc, badva: i.dva, why: [t("書き込み可でないページへの書き込み → 保護違反。")] };
  if (interrupt) {
    const plain = !(b.reti || b.halt || b.fence || b.ei || b.di || b.csrWrite || b.tlbWrite);
    if (!plain) return { ...none, why: [t("MEM段の命令自身が行き先を変えるので、割り込みは次の命令まで待ちます。")] };
    if (i.wait) return { ...none, why: [t("MEM段の命令がメモリを待っているので、割り込みは完了後に受け付けます。")] };
    return { take: 1, fault: 0, cause: CAUSE.TIMER, epc: i.npc, badva: 0, why: [t("割り込み: MEM段の命令は完了させ、その次の命令 (EPC) から後をすべて捨ててトラップします。")] };
  }
  return { ...none, why: [t("トラップはありません。")] };
}

/* Flag register write control in EX: a younger instruction's flag write is
 * cancelled when MEM redirects or traps; RETI restores the flags from MEM. */
export const FLAGCTL = {
  delay: 1,
  title: 'フラグ書き込み制御',
  ports: p => [P('exWrite', 'in', 1), P('kill', 'in', 1), ...(p.restore ? [P('restore', 'in', 1)] : []), P('en', 'out', 1), ...(p.restore ? [P('sel', 'out', 1)] : [])],
  comb: m => {
    const restore = m.params.restore ? m.in.restore : 0;
    m.emit('en', restore || (m.in.exWrite && !m.in.kill) ? 1 : 0);
    if (m.params.restore) m.emit('sel', restore);
  },
  view: m => [{ text: m.in.restore ? 'RETI restore' : m.in.exWrite ? (m.in.kill ? 'cancel' : 'write') : '-', cls: m.out.en ? 'on' : 'off' }],
  size: () => [T(12)],
  explain: (m, t = message) => [
    t("EX段の命令はフラグをEX段の終わりに書きます。ただし同じクロックでMEM段が行き先を変える (HALT・FENCEI・トラップなど) 場合、EX段の命令は捨てられる命令なので、その書き込みを取り消します。"),
    m.in.exWrite ? (m.in.kill ? t("いまEX段の命令は捨てられるため、書き込みません。") : t("EX段の命令の結果でフラグを更新します。")) : t("EX段の命令はフラグを書きません。"),
    ...(m.params.restore && m.in.restore ? [t("MEM段の RETI が ESTAT に保存したフラグを戻します。")] : []),
  ],
};

export const pipelineLibrary = { PTRAP, FLAGCTL, PIPEREG, UNPACK, PCTRL, CONFIG, HAZARD, FWD, BRU, BTB, NPC, MREDIR };
