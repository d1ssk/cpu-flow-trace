import { message } from '../i18n/message.js';
/* Module library. Each type defines:
 *   ports(params)  terminals: {name, dir: 'in'|'out', width, side}
 *   init(params, ctx)  initial internal state (sequential modules)
 *   comb(m)        zero-delay evaluation; outputs with m.emit(port, value)
 *   edge(m)        clock edge: returns the next state (or undefined)
 *   view(m)        rows drawn inside the module box (English: diagram text)
 *   size(params)   row templates bounding view(): the builder sizes the box
 *   explain(m, t)  localized inspector sentences: what and why now
 * Inputs are prefixed `i_` where an output shares the same name. */

import { aluCompute, tlbEntry } from '../isa/emulator.js';
import { disassemble } from '../isa/disassembler.js';
import {
  ALU_NAMES, CAUSE, CAUSE_NAMES, CAUSE_SHORT, COND_NAMES, CSR_NAMES, IO, PAGE_BITS, PAGE_WORDS, PROFILES, RAM_WORDS,
  STATUS_IE, STATUS_KERNEL, TARGET, TIMER_PRESCALE, TRAP_VECTOR, condHolds, hex, targetOf,
} from '../isa/spec.js';
import { SIGNALS, SIGNAL_DOC, decodeControl, decodeFields } from './control.js';
import { flagsText, formatValue } from './format.js';
import { T, lines, valueChars } from './metrics.js';
import { pipelineLibrary } from './modules-pipeline.js';
import { multicycleLibrary } from './modules-multicycle.js';
import { cacheLibrary } from './modules-cache.js';
import { td4Library } from './modules-td4.js';

export const P = (name, dir, width, side) => ({ name, dir, width, side: side ?? (dir === 'in' ? 'left' : 'right') });
const v = (value, width) => formatValue(value, width);
const full = PROFILES.full;

export const REG = {
  delay: 1,
  title: 'レジスタ',
  ports: p => [P('d', 'in', p.width), ...(p.en ? [P('en', 'in', 1, p.enSide ?? 'bottom')] : []), P('q', 'out', p.width)],
  init: p => ({ value: p.reset ?? 0 }),
  comb: m => m.emit('q', m.state.value),
  edge: m => (!m.params.en || m.in.en) && m.in.d !== m.state.value ? { value: m.in.d } : undefined,
  view: m => [{ text: m.params.flags ? flagsText(m.state.value) : v(m.state.value, m.params.width), cls: 'big' }],
  size: p => [T(p.flags ? 11 : valueChars(p.width), 'big')],
  explain: (m, t = message) => [
    t("クロックの立ち上がりで入力 d を取り込み、次の立ち上がりまで保持します。"),
    m.params.en ? t("書き込み許可 en = {0}。{1}", v(m.in.en, 1), m.in.en ? t("次のクロックで d の値に更新されます。") : t("次のクロックでも値を保持します。")) : t("書き込み許可はなく、毎クロック更新されます。"),
    t("現在 q = {0}、d に届いている値 = {1}", m.params.flags ? flagsText(m.state.value) : v(m.state.value, m.params.width), m.params.flags ? flagsText(m.in.d) : v(m.in.d, m.params.width)),
    ...(m.params.flags ? [t("Z: 結果が0、C: 桁上がり (減算では借り)、N: 結果の最上位ビット (負)、V: 符号付きのあふれ。")] : []),
  ],
};

export const HALTFF = {
  delay: 1,
  title: '停止フラグ',
  ports: p => [P('set', 'in', 1), ...(p.clr ? [P('clr', 'in', 1)] : []), P('q', 'out', 1)],
  init: () => ({ value: 0 }),
  comb: m => m.emit('q', m.state.value),
  edge: m => {
    const next = m.in.clr ? 0 : m.in.set ? 1 : m.state.value;
    return next !== m.state.value ? { value: next } : undefined;
  },
  view: m => [{ text: m.state.value ? 'HALTED' : 'RUN', cls: m.state.value ? 'big on' : 'big' }],
  size: () => [T(6, 'big')],
  explain: (m, t = message) => [
    t("HALT命令でセットされ、以後は命令を実行しません。割り込みが受け付けられるとクリアされます (HALTは割り込み待ちとしても使えます)。"),
    t("set = {0}, clr = {1}, 現在 {2}", v(m.in.set, 1), v(m.in.clr, 1), m.state.value ? t("停止中") : t("実行中")),
  ],
};

export const MUX = {
  delay: 2,
  title: 'マルチプレクサ',
  ports: p => [
    ...Array.from({ length: p.n }, (_, i) => (p.consts?.[i] !== undefined ? null : P(`in${i}`, 'in', p.width))).filter(Boolean),
    P('sel', 'in', p.selWidth ?? Math.max(1, Math.ceil(Math.log2(p.n))), p.selSide ?? 'bottom'),
    P('y', 'out', p.width),
  ],
  comb: m => {
    const sel = m.in.sel;
    m.emit('y', m.params.consts?.[sel] ?? m.in[`in${sel}`] ?? 0);
  },
  view: m => (m.params.names ?? []).map((name, i) => ({ text: `${i} ${name}`, cls: i === m.in.sel ? 'on' : 'off' })),
  size: p => (p.names ?? []).map(name => T(name.length + 2)),
  explain: (m, t = message) => {
    const names = m.params.names ?? [];
    return [
      t("sel の値で入力を1つ選び、y へそのまま出します。"),
      t("sel = {0} → {1} を選択、y = {2}", m.in.sel, names[m.in.sel] ?? `in${m.in.sel}`, v(m.out.y, m.params.width)),
    ];
  },
};

export const INC = {
  delay: 4,
  title: '加算器 (+1)',
  ports: p => [P('a', 'in', p.width), P('y', 'out', p.width)],
  comb: m => m.emit('y', (m.in.a + (m.params.k ?? 1)) & ((1 << m.params.width) - 1)),
  view: m => [{ text: `+${m.params.k ?? 1}`, cls: 'big' }],
  size: () => [T(2, 'big')],
  explain: (m, t = message) => [t("入力に {0} を足します。a = {1} → y = {2}", m.params.k ?? 1, v(m.in.a, m.params.width), v(m.out.y, m.params.width))],
};

export const ADD = {
  delay: 6,
  title: '加算器',
  ports: p => [P('a', 'in', p.width), P('b', 'in', p.width), P('y', 'out', p.width)],
  comb: m => m.emit('y', (m.in.a + m.in.b) & ((1 << m.params.width) - 1)),
  view: m => [{ text: m.params.sign ?? 'a+b', cls: 'big' }],
  size: p => [T((p.sign ?? 'a+b').length, 'big')],
  explain: (m, t = message) => [t(m.params.purpose ?? t("2つの値を加算します。")), `a = ${v(m.in.a, m.params.width)}, b = ${v(m.in.b, m.params.width)} → y = ${v(m.out.y, m.params.width)}`],
};

const ALU_NOTES = {
  ADD: 'a + b。16 bitを超えた桁上がりが C、符号付きのあふれが V。', SUB: 'a − b。a < b (符号なし) のとき借りが生じ C = 1。符号付きのあふれが V。',
  AND: 'ビットごとの AND。C = V = 0。', OR: 'ビットごとの OR。C = V = 0。', XOR: 'ビットごとの XOR。C = V = 0。',
  SHL: 'a を b ビット左へずらし、最後に押し出されたビットが C。', SHR: 'a を b ビット右へずらし (上は0)、最後に押し出されたビットが C。',
  SRA: 'a を b ビット右へずらし、符号ビットを複製します (算術シフト)。', PASS: 'b をそのまま通します (フラグは作りません)。',
};
export const ALU_MODULE = {
  delay: 8,
  title: 'ALU',
  ports: () => [P('a', 'in', 16), P('b', 'in', 16), P('op', 'in', 4, 'top'), P('y', 'out', 16), P('flags', 'out', 4)],
  comb: m => {
    const r = aluCompute(m.in.op, m.in.a, m.in.b);
    m.emit('y', r.y);
    m.emit('flags', r.flags);
  },
  view: m => [{ text: ALU_NAMES[m.in.op] ?? '?', cls: 'big' }, { text: flagsText(m.out.flags), cls: 'small' }],
  size: () => [T(4, 'big'), T(11, 'small')],
  explain: (m, t = message) => {
    const op = ALU_NAMES[m.in.op] ?? '?';
    return [
      `op = ${m.in.op} (${op}): ${t(ALU_NOTES[op] ?? '')}`,
      `a = ${v(m.in.a, 16)}, b = ${v(m.in.b, 16)} → y = ${v(m.out.y, 16)}, ${flagsText(m.out.flags)}`,
      t("Z は結果が0、N は結果の bit 15 (符号付きで負) のとき1。フラグを更新するかは制御回路の flagWrite が決めます。"),
    ];
  },
};

export const REGFILE = {
  delay: 4,
  title: 'レジスタファイル',
  ports: () => [
    P('ra', 'in', 3), P('rb', 'in', 3), P('wa', 'in', 3), P('wd', 'in', 16), P('we', 'in', 1, 'top'),
    P('da', 'out', 16), P('db', 'out', 16),
  ],
  init: () => ({ regs: new Array(8).fill(0) }),
  comb: m => {
    const { ra, rb, wa, wd, we } = m.in;
    const read = r => (r === 0 ? 0 : m.params.bypass && we && wa === r ? wd : m.state.regs[r]);
    m.emit('da', read(ra));
    m.emit('db', read(rb));
  },
  edge: m => {
    if (!m.in.we || m.in.wa === 0 || m.state.regs[m.in.wa] === m.in.wd) return undefined;
    const regs = [...m.state.regs]; regs[m.in.wa] = m.in.wd;
    return { regs };
  },
  view: m => [0, 1, 2, 3].map(row => ({
    cells: [row, row + 4].map(r => ({
      text: `r${r} ${hex(m.state.regs[r])}`,
      cls: m.in.we && m.in.wa === r && r ? 'write' : m.in.ra === r || m.in.rb === r ? 'on' : '',
    })),
  })),
  size: () => lines(4, 15),
  explain: (m, t = message) => [
    t("8本の16 bitレジスタ。r0 は常に 0 で、書き込みは捨てられます (SP = r6、リンクレジスタ = r7 は使い方の約束)。読み出しポート2つ (ra→da, rb→db) は組み合わせ回路で即座に読み、書き込みはクロックの立ち上がりで行います。"),
    t("読み出し: r{0} → da = {1}, r{2} → db = {3}", m.in.ra, v(m.out.da, 16), m.in.rb, v(m.out.db, 16)),
    m.in.we ? t("次のクロックで r{0} ← {1} を書き込みます。", m.in.wa, v(m.in.wd, 16)) : t("書き込み許可 we = L のため、次のクロックでは書き込みません。"),
    ...(m.params.bypass ? [t("同じクロックで書き込むレジスタを読む場合は、書き込み値を直接読み出しへ回します (内部バイパス)。")] : []),
  ],
};

/* Rows shared by every memory view: a map of the whole memory with the
 * fetch and data addresses marked, a code window and a data window. */
export function memoryRows(words, { fetch, data, write, last, profile = full, codeRows = 5, dataRows = 3 }) {
  const rows = [{ kind: 'map', words, fetch, data, write, last }];
  if (fetch !== undefined) {
    for (let a = fetch - 1; a < fetch - 1 + codeRows; a++) {
      if (a < 0 || a >= words.length) { rows.push({ text: '' }); continue; }
      rows.push({ text: `${hex(a, 3)} ${hex(words[a])} ${disassemble(words[a], profile, a)}`, cls: a === fetch ? 'on code' : 'off code' });
    }
  }
  if (data !== undefined && dataRows) {
    const base = Math.max(0, Math.min(words.length - dataRows * 4, ((data >= 0 && data < words.length ? data : 0) & ~3) - 4));
    for (let r = 0; r < dataRows; r++) {
      const start = base + r * 4;
      rows.push({
        cells: [{ text: `${hex(start, 3)}:`, cls: 'off' }, ...[0, 1, 2, 3].map(k => {
          const a = start + k;
          return { text: hex(words[a] ?? 0), cls: a === write ? 'write' : a === data ? 'on' : a === last ? 'last' : '' };
        })],
      });
    }
  }
  return rows;
}
export const memorySize = ({ code = true, data = true, codeRows = 5, dataRows = 3 } = {}) => [
  { kind: 'map' }, ...(code ? lines(codeRows, 28) : []), ...(data ? lines(dataRows, 24) : []),
];

/* Unified memory for instructions and data (stages 1–4, 6, 8). The fetch
 * port reads the word at PC; the data port reads and writes. With
 * `arbitrated` (a pipeline option of one physical port), a data access
 * takes the port and the fetch side must wait (structural hazard). */
export const MEMORY = {
  delay: 10,
  title: 'メモリ (命令とデータ)',
  ports: p => [
    P('iaddr', 'in', 16),
    ...(p.data ? [P('daddr', 'in', 16), P('wd', 'in', 16), P('we', 'in', 1, 'top'), ...(p.arbitrated ? [P('dreq', 'in', 1, 'top')] : [])] : []),
    P('idata', 'out', 16), ...(p.data ? [P('rd', 'out', 16)] : []), ...(p.arbitrated ? [P('iwait', 'out', 1)] : []),
  ],
  init: (p, { program, options }) => ({ words: [...(program?.mem ?? new Array(RAM_WORDS).fill(0))], lastWrite: -1, ports: p.arbitrated ? options?.memPorts ?? 1 : 2 }),
  comb: m => {
    const words = m.state.words;
    const blocked = m.params.arbitrated && m.state.ports === 1 && m.in.dreq;
    m.emit('idata', blocked ? 0 : words[m.in.iaddr] ?? 0);
    if (m.params.data) m.emit('rd', words[m.in.daddr] ?? 0);
    if (m.params.arbitrated) m.emit('iwait', blocked ? 1 : 0);
  },
  edge: m => {
    if (!m.params.data || !m.in.we || targetOf(m.in.daddr) !== TARGET.RAM) return m.state.lastWrite === -1 ? undefined : { ...m.state, lastWrite: -1 };
    const words = [...m.state.words]; words[m.in.daddr] = m.in.wd;
    return { ...m.state, words, lastWrite: m.in.daddr };
  },
  view: m => [
    ...(m.params.arbitrated ? [{ text: m.state.ports === 1 ? (m.in.dreq ? '1 port: data uses it' : '1 port: fetch') : '2 ports (ideal)', cls: m.in.dreq && m.state.ports === 1 ? 'small on' : 'small' }] : []),
    ...memoryRows(m.state.words, {
      fetch: m.in.iaddr, data: m.params.data ? m.in.daddr : undefined, write: m.params.data && m.in.we ? m.in.daddr : -1,
      last: m.state.lastWrite, profile: m.params.profile,
    }),
  ],
  size: p => [...(p.arbitrated ? [T(22, 'small')] : []), ...memorySize({ data: p.data })],
  explain: (m, t = message) => {
    const lines = [
      t("命令もデータも収める 512語 × 16 bit の読み書きメモリ (番地 0x000〜0x1FF)。プログラムはリセット時にここへ置かれています (起動ROMが読み込んだ後の状態から始めます)。上の帯はメモリ全体で、青が命令の番地、橙がデータの番地です。"),
      t("命令側: iaddr = {0} → {1} : {2}", v(m.in.iaddr, 16), hex(m.out.idata), disassemble(m.out.idata, m.params.profile ?? full, m.in.iaddr)),
    ];
    if (m.params.data) {
      lines.push(t("データ側: daddr = {0} の内容 = {1}{2}", v(m.in.daddr, 16), v(m.out.rd, 16), m.in.we ? t("。we = H: 次のクロックで [{0}] ← {1}", v(m.in.daddr, 16), v(m.in.wd, 16)) : ''));
      if (!m.params.arbitrated) lines.push(t("1クロックで命令の取り込みとデータの読み書きを同時に行うため、番地の入口 (ポート) が2つあります。"));
    }
    if (m.params.arbitrated) {
      lines.push(m.state.ports === 1
        ? t("ポートは1つ。MEM段がデータを読み書きするクロックは命令を取り込めず、iwait = H で IF 段を待たせます (構造ハザード)。{0}", m.in.dreq ? t("いまデータ側が使っています。") : '')
        : t("設定で2ポートの理想的なメモリにしています。命令とデータを同時に扱えるので構造ハザードは起きません。"));
    }
    return lines;
  },
};

export const FIELDS = {
  delay: 1,
  title: '命令フィールド',
  ports: () => [P('ir', 'in', 16), P('ra', 'out', 3), P('rb', 'out', 3), P('rd', 'out', 3), P('imm', 'out', 16)],
  comb: m => { const f = decodeFields(m.in.ir); m.emit('ra', f.ra); m.emit('rb', f.rb); m.emit('rd', f.rd); m.emit('imm', f.imm); },
  view: m => [{ text: decodeFields(m.in.ir).format, cls: 'small' }],
  size: () => [T(14, 'small')],
  explain: (m, t = message) => {
    const f = decodeFields(m.in.ir);
    return [
      t("命令語のビットを分けて、読むレジスタ・書くレジスタ・即値を取り出します。命令の形式 (オペコードの上位ビット) で選ぶ小さなマルチプレクサと、即値の符号拡張を含みます。"),
      t("{0} の形式: {1} → ra = r{2}, rb = r{3}, rd = r{4}, imm = {5}", hex(m.in.ir), f.format, f.ra, f.rb, f.rd, v(f.imm, 16)),
      t("2オペランドの即値命令 (ADDI など) は rd を読んで rd へ書き、ST は rd の値を書き込みます。JAL の書き込み先は r7 (リンクレジスタ) に固定です。"),
    ];
  },
};

function controlInputs(p) {
  return [P('ir', 'in', 16), ...(p.haltInput ? [P('halted', 'in', 1)] : []), ...(p.kernelInput ? [P('kernel', 'in', 1)] : [])];
}
export const CONTROL = {
  delay: 4,
  title: '制御回路 (デコーダ)',
  ports: p => [...controlInputs(p), ...Object.entries(p.outputs).map(([name, width]) => P(name, 'out', width ?? SIGNALS[name]))],
  comb: m => {
    const kernel = m.params.kernelInput ? m.in.kernel : 1;
    const c = decodeControl(m.in.ir, m.params.profile, { kernel });
    const stop = m.params.haltInput && m.in.halted;
    for (const name of Object.keys(m.params.outputs)) m.emit(name, stop ? 0 : c[name]);
  },
  view: m => {
    const active = Object.keys(m.params.outputs).filter(k => m.out[k]);
    return [
      { text: disassemble(m.in.ir, m.params.profile), cls: 'big' },
      { text: active.length ? active.map(k => (m.params.outputs[k] > 1 ? `${k}=${m.out[k]}` : k)).join(' ') : '(all L)', cls: 'small' },
    ];
  },
  size: p => [T(20, 'big'), T(Math.min(60, Object.keys(p.outputs).length * 6), 'small')],
  explain: (m, t = message) => {
    const kernel = m.params.kernelInput ? m.in.kernel : 1;
    const c = decodeControl(m.in.ir, m.params.profile, { kernel });
    const out = [t("命令 {0} = {1} を解読し、各部への制御信号を出します。", hex(m.in.ir), disassemble(m.in.ir, m.params.profile))];
    if (m.params.haltInput && m.in.halted) out.push(t("停止中のため、すべての制御信号を L にしています。"));
    if (c.illegal) out.push(m.params.kernelInput && !kernel && c.ins.privileged ? t("ユーザーモードでは実行できない特権命令です → 例外。") : t("定義されていない命令です → 例外。"));
    for (const name of Object.keys(m.params.outputs)) {
      if (m.out[name]) out.push(`${name} = ${m.out[name]} : ${t(SIGNAL_DOC[name] ?? '')}`);
    }
    return out;
  },
};

const PC_SOURCES = ['PC+1', 'target', 'rs1+imm', 'EPC', 'vector'];
export const PCSEL = {
  delay: 2,
  title: '次PC選択',
  ports: p => [
    P('pcSrc', 'in', 3), P('cond', 'in', 4), P('flags', 'in', 4),
    ...(p.halt ? [P('halted', 'in', 1)] : []), ...(p.trap ? [P('take', 'in', 1)] : []),
    P('sel', 'out', p.selWidth), P('en', 'out', 1),
  ],
  comb: m => {
    const r = nextPc(m.in);
    m.emit('sel', r.sel);
    m.emit('en', m.in.take || !m.in.halted ? 1 : 0);
  },
  view: m => [{ text: PC_SOURCES[m.out.sel] ?? '?', cls: 'big' }, { text: m.in.pcSrc === 1 ? `${COND_NAMES[m.in.cond]} ${m.out.sel ? 'taken' : 'not taken'}` : '', cls: 'small' }],
  size: () => [T(7, 'big'), T(13, 'small')],
  explain: (m, t = message) => {
    const out = [t("命令の種類・分岐条件・フラグから、次のPCをどこから取るか決めます。")];
    if (m.in.take) out.push(t("トラップ (割り込み・例外) が発生したので、トラップベクタへ飛びます。"));
    else if (m.in.halted) out.push(t("停止中なので PC を更新しません (en = L)。"));
    else if (m.in.pcSrc === 1) out.push(t("条件分岐 {0}: フラグ {1} → {2}", COND_NAMES[m.in.cond], flagsText(m.in.flags), m.out.sel ? t("成立、分岐先 (PC+1+オフセット) へ") : t("不成立、PC+1 へ")));
    else out.push([t("通常の命令: PC+1"), '', t("JAL: PC+1+オフセット の番地へ (戻り番地 PC+1 は r7 へ)"), t("JALR: レジスタ+オフセット の番地へ (RET はこの形)"), t("RETI: EPC (戻り番地) へ")][m.in.pcSrc] ?? '');
    return out;
  },
};
function nextPc({ pcSrc, cond, flags, take }) {
  let sel = 0;
  if (pcSrc === 1) sel = condHolds(cond, flags) ? 1 : 0;
  if (pcSrc === 2) sel = 1;
  if (pcSrc === 3) sel = 2;
  if (pcSrc === 4) sel = 3;
  if (take) sel = 4;
  return { sel };
}

const TARGET_NAMES = ['RAM', 'I/O', 'TIMER', 'none'];
export const ADEC = {
  delay: 2,
  title: 'アドレスデコーダ',
  ports: p => [
    P('addr', 'in', 16), P('we', 'in', 1), ...(p.re ? [P('re', 'in', 1)] : []),
    ...(p.re ? [P('ramReq', 'out', 1)] : []), ...(p.ramWe === false ? [] : [P('ramWe', 'out', 1)]),
    ...(p.io === false ? [] : [P('ioWe', 'out', 1), P('tmWe', 'out', 1), P('sel', 'out', 2)]),
  ],
  comb: m => {
    const { addr, we, re } = m.in;
    const t = targetOf(addr);
    if (m.params.re) m.emit('ramReq', (we || re) && t === TARGET.RAM ? 1 : 0);
    if (m.params.ramWe !== false) m.emit('ramWe', we && t === TARGET.RAM ? 1 : 0);
    if (m.params.io !== false) {
      m.emit('ioWe', we && t === TARGET.IO ? 1 : 0);
      m.emit('tmWe', we && t === TARGET.TIMER ? 1 : 0);
      m.emit('sel', t);
    }
  },
  view: m => [{ text: TARGET_NAMES[targetOf(m.in.addr)], cls: 'big' }],
  size: () => [T(5, 'big')],
  explain: (m, t = message) => [
    t("メモリマップドI/O: 番地で行き先を振り分けます。0x0000〜0x01FF は RAM、0xFFF0〜0xFFF1 は LED・スイッチ、0xFFF2〜0xFFF3 はタイマ。CPUからは同じ LD/ST 命令に見えます。"),
    `addr = ${v(m.in.addr, 16)} → ${['RAM', t("I/O (LED・スイッチ)"), t("タイマ"), t("どこにもつながっていない番地 (読むと0)")][targetOf(m.in.addr)]}`,
  ],
};

export const IODEV = {
  delay: 3,
  title: 'I/O (LED・スイッチ)',
  ports: () => [P('addr', 'in', 16), P('wd', 'in', 16), P('we', 'in', 1, 'bottom'), P('rd', 'out', 16)],
  init: () => ({ led: 0, sw: 0 }),
  comb: m => m.emit('rd', m.in.addr === IO.LED ? m.state.led : m.in.addr === IO.SW ? m.state.sw : 0),
  edge: m => (m.in.we && m.in.addr === IO.LED && (m.in.wd & 0xFF) !== m.state.led ? { ...m.state, led: m.in.wd & 0xFF } : undefined),
  view: m => [{ kind: 'leds', value: m.state.led }, { kind: 'switches', value: m.state.sw, module: m.id }],
  size: () => [{ kind: 'leds' }, { kind: 'switches' }],
  explain: (m, t = message) => [
    t("0xFFF0 へ書くと下位8 bitが LED に表示され、0xFFF1 を読むとスイッチの状態が得られます。スイッチはクリックで切り替えられます。"),
    t("LED = {0}, スイッチ = {1}", v(m.state.led, 8), v(m.state.sw, 8)),
  ],
};

export const TIMER = {
  delay: 1,
  title: 'タイマ',
  ports: () => [P('addr', 'in', 16), P('wd', 'in', 16), P('we', 'in', 1, 'bottom'), P('rd', 'out', 16), P('irq', 'out', 1)],
  init: () => ({ period: 0, count: 0, pending: 0 }),
  comb: m => {
    m.emit('rd', m.in.addr === IO.TIMER_PERIOD ? m.state.period : m.in.addr === IO.TIMER_STATUS ? m.state.pending : 0);
    m.emit('irq', m.state.pending);
  },
  edge: m => {
    let { period, count, pending } = m.state;
    let wrote = false;
    if (m.in.we && m.in.addr === IO.TIMER_PERIOD) { period = m.in.wd; count = 0; wrote = true; }
    if (m.in.we && m.in.addr === IO.TIMER_STATUS) pending = 0;
    if (!wrote && period) { count++; if (count >= period * TIMER_PRESCALE) { count = 0; pending = 1; } }
    return period === m.state.period && count === m.state.count && pending === m.state.pending ? undefined : { period, count, pending };
  },
  view: m => [{ text: `period ${m.state.period}` }, { text: `tick ${Math.floor(m.state.count / TIMER_PRESCALE)}` }, { text: m.state.pending ? 'irq H' : 'irq L', cls: m.state.pending ? 'on' : 'off' }],
  size: () => lines(3, 12),
  explain: (m, t = message) => [
    t("クロックを数え (4クロックで1カウント)、周期 (0xFFF2) に達すると割り込み要求 irq を H にします。0xFFF3 へ書くと要求を取り下げます (受け付け確認)。"),
    t("周期 = {0}, カウント = {1}, 要求 = {2}", m.state.period, m.state.count, m.state.pending ? 'H' : 'L'),
  ],
};

export const GATE = {
  delay: 1,
  title: '書き込みゲート',
  ports: p => [
    ...p.signals.map(([name, width]) => P(`i_${name}`, 'in', width)),
    P('kill', 'in', 1, p.ctlSide ?? 'bottom'), ...(p.halted ? [P('halted', 'in', 1, p.ctlSide ?? 'bottom')] : []), ...(p.wait ? [P('wait', 'in', 1, p.ctlSide ?? 'bottom')] : []),
    ...p.signals.map(([name, width]) => P(name, 'out', width)),
  ],
  comb: m => {
    const off = m.in.kill || m.in.halted || m.in.wait;
    for (const [name] of m.params.signals) m.emit(name, off ? 0 : m.in[`i_${name}`]);
  },
  view: m => [{ text: m.in.kill ? 'trap: cancel' : m.in.halted ? 'halted: off' : m.in.wait ? 'wait: hold' : 'pass', cls: m.in.kill || m.in.halted || m.in.wait ? 'on' : 'off' }],
  size: () => [T(12)],
  explain: (m, t = message) => [
    t("命令の結果を状態に書き込む信号 (レジスタ・メモリ・フラグ・CSRなど) をまとめて通します。トラップが起きたときと停止中は、すべて L にして命令の効果を取り消します。"),
    m.in.kill ? t("いまトラップが発生しているので、この命令の書き込みはすべて取り消されます。") : m.in.halted ? t("停止中のため書き込みはありません。") : m.in.wait ? t("メモリの完了を待っている間は、書き込みを保留します。") : t("トラップはないので、制御回路の信号をそのまま通します。"),
  ],
};

export const TRAP = {
  delay: 3,
  title: 'トラップ判定',
  ports: p => [
    P('irq', 'in', 1), P('ie', 'in', 1), P('halted', 'in', 1),
    ...(p.priv ? [P('itlbMiss', 'in', 1), P('ifault', 'in', 1), P('illegal', 'in', 1), P('syscall', 'in', 1), P('dtlbMiss', 'in', 1), P('wfault', 'in', 1), P('dva', 'in', 16)] : []),
    P('pc', 'in', 16), ...(p.priv ? [P('pcInc', 'in', 16)] : []),
    P('take', 'out', 1), P('cause', 'out', 3), P('epc', 'out', 16), ...(p.priv ? [P('badva', 'out', 16)] : []),
  ],
  comb: m => {
    const i = m.in;
    let cause = 0, epc = i.pc, badva = 0;
    if (i.irq && i.ie) cause = CAUSE.TIMER;
    else if (m.params.priv && !i.halted) {
      if (i.itlbMiss) { cause = CAUSE.ITLB_MISS; badva = i.pc; }
      else if (i.ifault) { cause = CAUSE.EXEC_PROTECT; badva = i.pc; }
      else if (i.illegal) cause = CAUSE.ILLEGAL;
      else if (i.syscall) { cause = CAUSE.SYSCALL; epc = i.pcInc; }
      else if (i.dtlbMiss) { cause = CAUSE.DTLB_MISS; badva = i.dva; }
      else if (i.wfault) { cause = CAUSE.WRITE_PROTECT; badva = i.dva; }
    }
    m.emit('take', cause ? 1 : 0);
    m.emit('cause', cause);
    m.emit('epc', epc);
    if (m.params.priv) m.emit('badva', badva);
  },
  view: m => [{ text: m.out.take ? CAUSE_SHORT[m.out.cause] : 'no trap', cls: m.out.take ? 'on big' : 'off' }],
  size: () => [T(11, 'big')],
  explain: (m, t = message) => {
    const i = m.in;
    const out = [t("割り込み要求と、命令が起こした例外を調べ、トラップを起こすか決めます。優先順位: 割り込み > 命令TLBミス > 実行保護 > 不正命令 > システムコール > データTLBミス > 書き込み保護。")];
    out.push(t("irq = {0}, 割り込み許可 IE = {1}{2}", v(i.irq, 1), v(i.ie, 1), i.irq && !i.ie ? t(" (要求はあるが禁止中)") : ''));
    if (m.out.take) out.push(t("→ {0}。EPC ← {1}、PC ← ベクタ {2}", CAUSE_NAMES[m.out.cause], v(m.out.epc, 16), v(TRAP_VECTOR, 16)));
    else out.push(t("→ トラップなし。命令は通常どおり完了します。"));
    return out;
  },
};

export const CSRFILE = {
  delay: 3,
  title: 'CSR (制御・状態レジスタ)',
  ports: p => [
    P('num', 'in', 16), P('wd', 'in', 16), P('we', 'in', 1), P('take', 'in', 1), P('cause', 'in', 3), P('epcIn', 'in', 16),
    ...(p.priv ? [P('badva', 'in', 16)] : []), P('flags', 'in', 4), P('reti', 'in', 1), P('ei', 'in', 1), P('di', 'in', 1),
    P('rd', 'out', 16), P('ie', 'out', 1), ...(p.priv ? [P('kernel', 'out', 1)] : []), P('epc', 'out', 16), P('eflags', 'out', 4),
  ],
  init: () => ({ status: STATUS_KERNEL, estat: 0, epc: 0, cause: 0, badva: 0, scratch: 0 }),
  comb: m => {
    const s = m.state;
    m.emit('rd', [s.status, s.estat, s.epc, s.cause, s.badva, s.scratch][m.in.num & 7] ?? 0);
    m.emit('ie', s.status & STATUS_IE ? 1 : 0);
    if (m.params.priv) m.emit('kernel', s.status & STATUS_KERNEL ? 1 : 0);
    m.emit('epc', s.epc);
    m.emit('eflags', (s.estat >> 2) & 15);
  },
  edge: m => {
    const s = { ...m.state }, i = m.in, priv = m.params.priv;
    if (i.take) {
      s.estat = (s.status & 3) | (i.flags << 2);
      s.status = STATUS_KERNEL; s.epc = i.epcIn; s.cause = i.cause;
      if (priv && i.cause >= CAUSE.ITLB_MISS) s.badva = i.badva;
    } else if (i.reti) s.status = priv ? s.estat & 3 : (s.estat & 1) | STATUS_KERNEL;
    else if (i.ei) s.status |= STATUS_IE;
    else if (i.di) s.status &= ~STATUS_IE;
    else if (i.we) {
      const n = i.num & 7, w = i.wd;
      if (n === 0) s.status = priv ? w & 3 : (w & 1) | STATUS_KERNEL;
      if (n === 1) s.estat = w & 0x3F;
      if (n === 2) s.epc = w;
      if (n === 3) s.cause = w;
      if (n === 4) s.badva = w;
      if (n === 5) s.scratch = w;
    }
    return JSON.stringify(s) === JSON.stringify(m.state) ? undefined : s;
  },
  view: m => {
    const s = m.state;
    return [
      { text: `STATUS IE${s.status & 1}${m.params.priv ? (s.status & 2 ? ' KERNEL' : ' USER') : ''}` },
      { text: `EPC ${hex(s.epc)} ESTAT ${hex(s.estat, 2)}` },
      { text: `CAUSE ${s.cause}${m.params.priv ? ` BADVA ${hex(s.badva)}` : ''}` },
    ];
  },
  size: () => lines(3, 19),
  explain: (m, t = message) => {
    const s = m.state;
    return [
      t("トラップの状態を保持します。STATUS (割り込み許可・モード)、ESTAT (トラップ前の STATUS とフラグ)、EPC (戻り番地)、CAUSE (原因)、BADVA (問題の番地)、SCRATCH。"),
      m.in.take ? t("トラップ: 次のクロックで EPC ← {0}, CAUSE ← {1}, 割り込み禁止・カーネルモードへ。", v(m.in.epcIn, 16), m.in.cause) :
        m.in.reti ? t("RETI: 次のクロックで STATUS を ESTAT から戻します。") :
          m.in.we ? t("CSRW: 次のクロックで {0} ← {1}", CSR_NAMES[m.in.num & 7], v(m.in.wd, 16)) : t("今回は更新しません。"),
      t("現在: {0}", CSR_NAMES.map((n, i) => `${n}=${hex([s.status, s.estat, s.epc, s.cause, s.badva, s.scratch][i])}`).join(' ')),
    ];
  },
};

const tlbMatch = (m, va) => m.state.entries.find(e => e.valid && e.vpn === va >> PAGE_BITS);
export const TLB = {
  delay: 6,
  title: 'TLB',
  ports: p => [
    P('va', 'in', 16), P('kernel', 'in', 1), P('req', 'in', 1), ...(p.kind === 'D' ? [P('write', 'in', 1)] : []),
    P('we', 'in', 1, p.wSide ?? 'top'), P('wa', 'in', 16, p.wSide ?? 'top'), P('wb', 'in', 16, p.wSide ?? 'top'),
    P('pa', 'out', 16), P('miss', 'out', 1), P('fault', 'out', 1), ...(p.excOut ? [P('exc', 'out', 3)] : []),
  ],
  init: () => ({ entries: Array.from({ length: 4 }, () => ({ valid: 0, vpn: 0, ppn: 0, w: 0, x: 0 })) }),
  comb: m => {
    const { va, kernel, req, write } = m.in;
    const entry = kernel ? null : tlbMatch(m, va);
    const miss = !kernel && req && !entry ? 1 : 0;
    const fault = !kernel && req && entry && (m.params.kind === 'I' ? !entry.x : write && !entry.w) ? 1 : 0;
    m.emit('pa', entry ? (entry.ppn << PAGE_BITS) | (va & (PAGE_WORDS - 1)) : va);
    m.emit('miss', miss);
    m.emit('fault', fault);
    // Pipelines carry a fetch exception with the instruction as a cause code.
    if (m.params.excOut) m.emit('exc', miss ? CAUSE.ITLB_MISS : fault ? CAUSE.EXEC_PROTECT : 0);
  },
  edge: m => {
    const { we, wa, wb } = m.in;
    if (!we || ((wa >> 4) & 1) !== (m.params.kind === 'I' ? 1 : 0)) return undefined;
    const entries = m.state.entries.map(e => ({ ...e }));
    entries[wa & 3] = tlbEntry(wa, wb);
    return { entries };
  },
  view: m => m.state.entries.map((e, i) => ({
    text: `${i} ${e.valid ? `${hex(e.vpn << PAGE_BITS)}>${hex(e.ppn << PAGE_BITS)} ${e.w ? 'W' : '-'}${e.x ? 'X' : '-'}` : '-'}`,
    cls: !m.in.kernel && e.valid && e.vpn === m.in.va >> PAGE_BITS ? 'on' : 'off',
  })),
  size: () => lines(4, 15),
  explain: (m, t = message) => {
    const kind = m.params.kind === 'I' ? t("命令") : t("データ");
    const out = [t("{0}用TLB: 仮想番地の上位 11 bit (ページ番号) を物理ページへ変換します。ページは32語。4エントリをすべて同時に比較します (全連想)。エントリには書き込み可 (W) と実行可 (X) の権限があります。", kind)];
    if (m.in.kernel) out.push(t("カーネルモードでは変換せず、仮想番地 = 物理番地です。"));
    else if (m.out.miss) out.push(t("ページ {0} に一致する有効なエントリがありません → TLBミス例外。OSが補充します。", hex(m.in.va & ~(PAGE_WORDS - 1))));
    else out.push(`${v(m.in.va, 16)} → ${v(m.out.pa, 16)}`);
    if (m.out.fault) out.push(m.params.kind === 'I' ? t("実行可 (X) でないページの命令を取り込もうとしました → 実行保護違反 (W^X)。") : t("書き込み可 (W) でないページへの書き込み → 書き込み保護違反。"));
    if (m.in.we && ((m.in.wa >> 4) & 1) === (m.params.kind === 'I' ? 1 : 0)) out.push(t("TLBW: 次のクロックでエントリを書き換えます。"));
    return out;
  },
};

export const library = {
  REG, HALTFF, MUX, INC, ADD, ALU: ALU_MODULE, REGFILE, MEMORY, FIELDS, CONTROL, PCSEL,
  ADEC, IODEV, TIMER, GATE, TRAP, CSRFILE, TLB,
  ...multicycleLibrary, ...pipelineLibrary, ...cacheLibrary, ...td4Library,
};
