import { message } from '../i18n/message.js';
/* Modules for the multi-cycle implementation: one memory with a single
 * port that answers after a number of cycles (req/ready handshake), shared
 * by instruction fetch and data access, and the state-machine controller. */

import { disassemble } from '../isa/disassembler.js';
import { ALU, PROFILES, RAM_WORDS, condHolds, hex } from '../isa/spec.js';
import { decodeControl, WB } from './control.js';
import { formatValue } from './format.js';
import { T } from './metrics.js';
import { memoryRows, memorySize } from './modules.js';

const P = (name, dir, width, side) => ({ name, dir, width, side: side ?? (dir === 'in' ? 'left' : 'right') });
const v = formatValue;

/* A request is held until `ready`. With latency L, ready rises in the L-th
 * cycle of the request; a write happens on the edge where ready = H. */
const latencyOf = (p, ctx) => Math.max(1, ctx?.options?.memLatency ?? p.latency ?? 2);

export const SMEM = {
  delay: 5, // the access is spread over its latency cycles
  title: 'メモリ (1ポート・待ちあり)',
  ports: () => [P('addr', 'in', 16), P('wd', 'in', 16), P('req', 'in', 1, 'top'), P('we', 'in', 1, 'top'), P('rd', 'out', 16), P('ready', 'out', 1)],
  init: (p, ctx) => ({ words: [...(ctx.program?.mem ?? new Array(RAM_WORDS).fill(0))], count: 0, latency: latencyOf(p, ctx), lastWrite: -1 }),
  comb: m => {
    const ready = m.in.req && m.state.count >= m.state.latency - 1 ? 1 : 0;
    m.emit('ready', ready);
    m.emit('rd', ready ? m.state.words[m.in.addr] ?? 0 : 0);
  },
  edge: m => {
    const ready = m.in.req && m.state.count >= m.state.latency - 1;
    const count = m.in.req && !ready ? m.state.count + 1 : 0;
    if (ready && m.in.we) {
      const words = [...m.state.words]; words[m.in.addr] = m.in.wd;
      return { ...m.state, words, count, lastWrite: m.in.addr };
    }
    if (count === m.state.count && m.state.lastWrite === -1) return undefined;
    return { ...m.state, count, lastWrite: -1 };
  },
  view: m => [
    { text: m.in.req ? (m.state.count >= m.state.latency - 1 ? (m.in.we ? 'write done' : 'ready') : `wait ${m.state.count + 1}/${m.state.latency}`) : 'idle', cls: m.in.req ? 'small on' : 'small off' },
    ...memoryRows(m.state.words, { fetch: m.in.addr, data: m.in.addr, write: m.in.req && m.in.we ? m.in.addr : -1, last: m.state.lastWrite, profile: m.params.profile, codeRows: 4, dataRows: 2 }),
  ],
  size: () => [T(12, 'small'), ...memorySize({ codeRows: 4, dataRows: 2 })],
  explain: (m, t = message) => [
    t("命令もデータも収める 512語のメモリ。入口 (ポート) は1つで、読み書きに {0} クロックかかります。req = H の間、番地を保ったまま待ち、{1} クロック目に ready = H。書き込みは ready のクロックで行います。", m.state.latency, m.state.latency),
    t("マルチサイクルでは命令の取り込み (FETCH) とデータの読み書き (MEM) が別のクロックなので、番地のマルチプレクサで PC と ALUOUT を切り替えれば1ポートで足ります。"),
    m.in.req ? `${m.in.we ? t("書き込み") : t("読み出し")} [${v(m.in.addr, 16)}] — ${m.out.ready ? t("完了します。") : t("待ち ({0}/{1})", m.state.count + 1, m.state.latency)}` : t("要求はありません。"),
  ],
};

export const MC_STATES = ['FETCH', 'DECODE', 'EXEC', 'ALUWB', 'MEM', 'MEMWB'];
export const MC_STATE_DOC = {
  FETCH: 'PC の番地から命令を読み出して IR へ入れ、ALUで PC+1 を計算して PC を進める (割り込みはここで受け付け)',
  DECODE: 'IR の ra・rb でレジスタを読み A・B ラッチへ入れる。ALU は分岐先 PC+1+オフセット を先に計算して ALUOUT へ',
  EXEC: 'ALU で演算・番地計算、または分岐・JAL・JALR・CSR などを実行',
  ALUWB: 'ALUOUT をレジスタへ書き戻す',
  MEM: 'メモリ・I/Oを読み書き (ready まで待つ)',
  MEMWB: '読んだ値 (MDR) をレジスタへ',
};

export const MC_OUTPUTS = {
  next: 3, pcWrite: 1, pcSel: 2, maSel: 1, memReq: 1, memWrite: 1, irWrite: 1, mdrWrite: 1, regWrite: 1, wbSel: 2,
  aSel: 1, bSel: 2, aluOp: 4, outWrite: 1, flagWrite: 1, flagSrc: 1, csrWrite: 1, ei: 1, di: 1, reti: 1, halt: 1, trap: 1,
};

/* Next-state and output logic of the controller (outputs depend on the
 * state, the instruction in IR, flags and the ready signal). */
export function multicycleControl({ state, ir, flags, ready, irq, halted }, profile, t = message) {
  const o = Object.fromEntries(Object.keys(MC_OUTPUTS).map(k => [k, 0]));
  const c = decodeControl(ir, profile);
  const name = MC_STATES[state] ?? 'FETCH';
  let why = '', short = '';
  switch (name) {
    case 'FETCH':
      if (irq) { Object.assign(o, { trap: 1, pcWrite: 1, pcSel: 3, next: 0 }); why = t("割り込み要求があり許可されているので、命令を読む前にトラップします。"); short = 'interrupt: trap'; break; }
      if (halted) { o.next = 0; why = t("停止中: 割り込みを待ちます。"); short = 'halted'; break; }
      Object.assign(o, { memReq: 1, maSel: 0 });
      if (ready) { Object.assign(o, { irWrite: 1, pcWrite: 1, pcSel: 0, aSel: 0, bSel: 2, aluOp: ALU.ADD, next: 1 }); why = t("命令語が届いたので IR へ入れ、PC ← PC+1。次は DECODE。"); short = 'IR <- mem, PC <- PC+1'; }
      else { o.next = 0; why = t("メモリの応答待ち。"); short = 'wait for memory'; }
      break;
    case 'DECODE':
      Object.assign(o, { aSel: 0, bSel: 1, aluOp: ALU.ADD, outWrite: 1, next: 2 });
      why = t("A・B ラッチにレジスタ値が入ります。ALU は PC+1+オフセット (分岐先) を計算して ALUOUT へ。次は EXEC。");
      short = 'A,B <- regs; ALUOUT <- target';
      break;
    case 'EXEC': {
      o.next = 0;
      const k = c.kind;
      if (['ALU', 'ADDI', 'ANDI', 'ORI', 'XORI', 'CMPI', 'LI', 'LUI', 'SHI'].includes(k)) {
        Object.assign(o, { outWrite: 1, aSel: 1, bSel: c.aluSrc ? 1 : 0, aluOp: c.aluOp, flagWrite: c.flagWrite, next: c.regWrite ? 3 : 0 });
        why = t("ALU で {0} を計算して ALUOUT へ。{1}", k, c.regWrite ? t("次は ALUWB。") : t("結果は書き戻さないので FETCH へ。"));
        short = `ALUOUT <- ${k}`;
      } else if (k === 'LD' || k === 'ST') {
        Object.assign(o, { outWrite: 1, aSel: 1, bSel: 1, aluOp: ALU.ADD, next: 4 }); why = t("番地 rs1 + 即値 を計算。次は MEM。"); short = 'ALUOUT <- rs1+imm';
      } else if (k === 'BCC') {
        const take = condHolds(c.cond, flags);
        Object.assign(o, { pcWrite: take ? 1 : 0, pcSel: 1 }); why = take ? t("分岐成立: PC ← ALUOUT (DECODEで計算した行き先)。") : t("分岐不成立: PC はそのまま。"); short = take ? 'taken: PC <- ALUOUT' : 'not taken';
      } else if (k === 'JAL') {
        Object.assign(o, { pcWrite: 1, pcSel: 1, regWrite: c.regWrite, wbSel: WB.LINK }); why = t("r7 ← PC (= 戻り番地 PC+1)、PC ← ALUOUT。"); short = 'r7 <- PC; PC <- ALUOUT';
      } else if (k === 'JALR') {
        Object.assign(o, { pcWrite: 1, pcSel: 0, aSel: 1, bSel: 1, aluOp: ALU.ADD, regWrite: c.regWrite, wbSel: WB.LINK }); why = t("PC ← rs1 + 即値 (ALU)、rd ← 戻り番地。"); short = 'rd <- PC; PC <- rs1+imm';
      } else if (k === 'CSRR') { Object.assign(o, { regWrite: c.regWrite, wbSel: WB.CSR }); why = 'rd ← CSR。'; short = 'rd <- CSR'; }
      else if (k === 'CSRW') { o.csrWrite = 1; why = 'CSR ← rs1。'; short = 'CSR <- rs1'; }
      else if (k === 'EI' || k === 'DI') { o[k.toLowerCase()] = 1; why = k === 'EI' ? t("割り込みを許可。") : t("割り込みを禁止。"); short = k; }
      else if (k === 'HALT') { o.halt = 1; why = t("停止フラグをセット。"); short = 'halt'; }
      else if (k === 'RETI') { Object.assign(o, { reti: 1, pcWrite: 1, pcSel: 2, flagWrite: 1, flagSrc: 1 }); why = t("PC ← EPC、フラグと割り込み許可を ESTAT から戻す。"); short = 'PC <- EPC'; }
      else { why = t("この命令は何もしません。"); short = 'nothing'; }
      break;
    }
    case 'ALUWB':
      Object.assign(o, { regWrite: 1, wbSel: WB.ALU, next: 0 }); why = t("rd ← ALUOUT。次の命令へ。"); short = 'rd <- ALUOUT';
      break;
    case 'MEM':
      Object.assign(o, { memReq: 1, maSel: 1, memWrite: c.memWrite });
      if (!ready) { o.next = 4; why = t("メモリの応答待ち。"); short = 'wait for memory'; break; }
      if (c.memWrite) { o.next = 0; why = t("書き込み完了。"); short = 'store done'; }
      else { Object.assign(o, { mdrWrite: 1, next: 5 }); why = t("読んだ値を MDR へ。次は MEMWB。"); short = 'MDR <- mem'; }
      break;
    case 'MEMWB':
      Object.assign(o, { regWrite: c.regWrite, wbSel: WB.MEM, next: 0 }); why = 'rd ← MDR。'; short = 'rd <- MDR';
      break;
    default: break;
  }
  return { o, why, short, name, kind: c.kind };
}

export const MCCTRL = {
  delay: 4,
  title: '制御回路 (状態機械)',
  ports: () => [
    P('state', 'in', 3), P('ir', 'in', 16), P('flags', 'in', 4), P('ready', 'in', 1), P('irq', 'in', 1), P('halted', 'in', 1),
    ...Object.entries(MC_OUTPUTS).map(([k, w]) => P(k, 'out', w, k === 'next' ? 'right' : 'bottom')),
  ],
  comb: m => {
    const { o } = multicycleControl(m.in, m.params.profile);
    for (const [k, value] of Object.entries(o)) m.emit(k, value);
  },
  view: m => {
    const r = multicycleControl(m.in, m.params.profile);
    return [
      { kind: 'states', states: MC_STATES, current: m.in.state, next: m.out.next },
      { text: disassemble(m.in.ir, m.params.profile ?? PROFILES.full), cls: 'big' },
      { text: r.short, cls: 'small' },
    ];
  },
  size: () => [{ kind: 'states', n: MC_STATES.length }, T(20, 'big'), T(30, 'small')],
  explain: (m, t = message) => {
    const r = multicycleControl(m.in, m.params.profile, t);
    return [
      t("状態レジスタの値 (いまの段階) と IR の命令から、このクロックで動かす部分と次の状態を決めます。1命令を複数のクロックに分け、ALU やメモリを段階ごとに使い回します。"),
      t("現在の状態: {0} — {1}", r.name, MC_STATE_DOC[r.name]),
      `IR = ${disassemble(m.in.ir, m.params.profile)} (${hex(m.in.ir)})`,
      r.why,
      t("次の状態: {0}", MC_STATES[m.out.next]),
    ];
  },
};

export const multicycleLibrary = { SMEM, MCCTRL };
