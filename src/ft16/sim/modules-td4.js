import { message } from '../i18n/message.js';
/* Modules of the TD4 (stage 0). The blocks match the main site's whole-CPU
 * view (src/circuits/td4/layout.js): INPUT, ROM, DECODER, MUX, ALU,
 * NEXT PC, the DFF registers A, B, OUT, PC and C, and OUTPUT. Registers
 * use the generic REG module. */

import { disassembleTd4, td4Decode } from '../td4/isa.js';
import { formatValue, bin } from './format.js';
import { T, lines } from './metrics.js';

const P = (name, dir, width, side) => ({ name, dir, width, side: side ?? (dir === 'in' ? 'left' : 'right') });
const v = formatValue;

export const TD4IN = {
  delay: 1,
  title: '入力 (INPUT)',
  ports: () => [P('q', 'out', 4)],
  init: () => ({ sw: 0 }),
  comb: m => m.emit('q', m.state.sw & 15),
  view: m => [{ kind: 'switches', value: m.state.sw, module: m.id, n: 4 }],
  size: () => [{ kind: 'switches', n: 4 }],
  explain: (m, t = message) => [t("外部から入力する4 bit。スイッチ (左から 8・4・2・1) はクリックで切り替えられます。IN A / IN B 命令のときに MUX がこの値を選びます。"), t("現在の入力 = {0} ({1})", bin(m.state.sw & 15, 4), m.state.sw & 15)],
};

export const TD4ROM = {
  delay: 10,
  title: 'ROM (16 × 8 bit)',
  ports: () => [P('addr', 'in', 4), P('op', 'out', 4), P('im', 'out', 4)],
  init: (p, ctx) => ({ rom: [...(ctx.program?.rom ?? new Array(16).fill(0))] }),
  comb: m => { const byte = m.state.rom[m.in.addr] ?? 0; m.emit('op', byte >> 4); m.emit('im', byte & 15); },
  view: m => Array.from({ length: 8 }, (_, r) => ({
    cells: [r, r + 8].map(a => ({ text: `${a.toString(16).toUpperCase()} ${disassembleTd4(m.state.rom[a]).padEnd(9).slice(0, 9)}`, cls: a === m.in.addr ? 'on' : 'off' })),
  })),
  size: () => lines(8, 23),
  explain: (m, t = message) => {
    const byte = m.state.rom[m.in.addr] ?? 0;
    return [
      t("プログラムを収めた 16バイトの ROM。PC を番地として、命令の上位4 bit (オペコード) を DECODER へ、下位4 bit (即値) を ALU へ渡します。"),
      `addr = ${m.in.addr} → ${bin(byte >> 4, 4)} ${bin(byte & 15, 4)} : ${disassembleTd4(byte)}`,
      t("段階1以降では、命令はデータと同じ読み書きできるメモリに置かれます。"),
    ];
  },
};

export const TD4DEC = {
  delay: 4,
  title: 'デコーダ',
  ports: () => [P('op', 'in', 4), P('cf', 'in', 1), P('sel', 'out', 2), P('enA', 'out', 1), P('enB', 'out', 1), P('enOut', 'out', 1), P('jump', 'out', 1)],
  comb: m => { const d = td4Decode(m.in.op, m.in.cf); for (const k of ['sel', 'enA', 'enB', 'enOut', 'jump']) m.emit(k, d[k]); },
  view: m => {
    const d = td4Decode(m.in.op, m.in.cf);
    const dest = ['A', 'B', 'OUT', 'PC'][m.in.op >> 2];
    return [{ text: `op ${bin(m.in.op, 4)}`, cls: 'big' }, { text: `${['A', 'B', 'IN', '0'][d.sel]} -> ${dest}${dest === 'PC' ? (d.jump ? ' jump' : ' no jump') : ''}`, cls: 'small' }];
  },
  size: () => [T(7, 'big'), T(16, 'small')],
  explain: (m, t = message) => {
    const d = td4Decode(m.in.op, m.in.cf);
    return [
      t("オペコード 4 bit とキャリー C から、MUX の選択 (sel)、どのレジスタに書くか (enA・enB・enOut)、ジャンプするか (jump) を決めます。上位2 bitが書き込み先、下位2 bitが通常の MUX の選択です。ただし PC へのジャンプでは MUX は常に0を選びます。"),
      t("op = {0}, C = {1}: sel = {2}, 書き込み先 = {3}{4}", bin(m.in.op, 4), m.in.cf, ['A', 'B', 'IN', '0'][d.sel], ['A', 'B', 'OUT', t("PC (ジャンプ)")][m.in.op >> 2], m.in.op >> 2 === 3 ? (d.jump ? t(" → ジャンプする") : t(" → C = 1 なのでジャンプしない (JNC)")) : ''),
    ];
  },
};

export const TD4MUX = {
  delay: 2,
  title: 'マルチプレクサ',
  ports: () => [P('a', 'in', 4), P('b', 'in', 4), P('in', 'in', 4), P('sel', 'in', 2, 'top'), P('y', 'out', 4)],
  comb: m => m.emit('y', [m.in.a, m.in.b, m.in.in, 0][m.in.sel]),
  view: m => ['A', 'B', 'IN', '0'].map((n, i) => ({ text: `${i} ${n}`, cls: i === m.in.sel ? 'on' : 'off' })),
  size: () => lines(4, 4),
  explain: (m, t = message) => [t("A・B・外部入力・0 から、ALU に送る4 bitを選びます。"), `sel = ${m.in.sel} → ${['A', 'B', 'IN', '0'][m.in.sel]}, y = ${m.out.y}`],
};

export const TD4ALU = {
  delay: 6,
  title: 'ALU (4 bit 加算)',
  ports: () => [P('x', 'in', 4), P('im', 'in', 4), P('sum', 'out', 4), P('cf', 'out', 1)],
  comb: m => { const s = m.in.x + m.in.im; m.emit('sum', s & 15); m.emit('cf', s >> 4); },
  view: () => [{ text: 'x+im', cls: 'big' }],
  size: () => [T(4, 'big')],
  explain: (m, t = message) => [t("MUX の値と即値を加算します。4 bitを超えた桁上がりが C になります。TD4 の ALU は加算だけです。"), `${m.in.x} + ${m.in.im} = ${m.in.x + m.in.im} → sum = ${m.out.sum}, carry = ${m.out.cf}`],
};

export const TD4NEXT = {
  delay: 4,
  title: '次のPC (+1 / ジャンプ)',
  ports: () => [P('pc', 'in', 4), P('result', 'in', 4), P('jump', 'in', 1), P('y', 'out', 4)],
  comb: m => m.emit('y', m.in.jump ? m.in.result : (m.in.pc + 1) & 15),
  view: m => [{ text: m.in.jump ? 'JUMP' : '+1', cls: 'big' }],
  size: () => [T(4, 'big')],
  explain: (m, t = message) => [t("通常は PC+1、ジャンプのときは ALU の結果 (0 + 即値 = 行き先) を次の PC に選びます。"), t("jump = {0} → 次の PC = {1}", v(m.in.jump, 1), m.out.y)],
};

export const TD4OUT = {
  delay: 1,
  title: '出力 (OUTPUT)',
  ports: () => [P('data', 'in', 4)],
  view: m => [{ kind: 'leds', value: m.in.data, n: 4 }],
  size: () => [{ kind: 'leds', n: 4 }],
  explain: (m, t = message) => [t("OUT レジスタの4 bitを LED に表示します (左から 8・4・2・1)。"), t("出力 = {0} ({1})", bin(m.in.data, 4), m.in.data)],
};

export const td4Library = { TD4IN, TD4ROM, TD4DEC, TD4MUX, TD4ALU, TD4NEXT, TD4OUT };
