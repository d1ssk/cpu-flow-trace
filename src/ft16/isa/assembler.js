import { message } from '../i18n/message.js';
import { OP, ALU, SYS, CSROP, COND, COND_ALIASES, CSR, RAM_WORDS, SHIFT_KINDS, u16 } from './spec.js';

/* Two-pass FT16 assembler. Instructions and data share one memory.
 *
 *   label:   INSTR operands      ; comment
 *   .org  phys[, virt]   continue at physical word `phys`; labels use `virt`
 *   .word v, v, "text"   data words (one character per word)
 *   .fill n[, v]         n words of v (default 0)
 *   .equ  NAME, value
 *
 * Pseudo-instructions: MOV CMP NEG NOT JMP JR RET CALLR, LA (2 words:
 * LUI + ORI). Returns {mem: number[512], labels, source: Map<addr, info>}
 * or throws an AssemblyError listing every problem found. */

export class AssemblyError extends Error {
  constructor(errors) {
    super(errors.map(e => `line ${e.line}: ${e.message}`).join('\n'));
    this.errors = errors;
  }
}

const REG_NAMES = { SP: 6, LR: 7 };
const ALU_R = ['ADD', 'SUB', 'AND', 'OR', 'XOR', 'SHL', 'SHR', 'SRA'];
const ALU_I = ['ADDI', 'ANDI', 'ORI', 'XORI', 'CMPI', 'LI', 'LUI'];

function splitOperands(text) {
  const out = [];
  let depth = 0, current = '', quote = false;
  for (const ch of text) {
    if (ch === '"') quote = !quote;
    if (!quote && ch === '[') depth++;
    if (!quote && ch === ']') depth--;
    if (!quote && ch === ',' && depth === 0) { out.push(current.trim()); current = ''; continue; }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

export function assemble(source, t = message) {
  const lines = source.split(/\r?\n/).map((raw, index) => {
    let text = raw, quote = false;
    for (let i = 0; i < text.length; i++) {
      if (text[i] === '"') quote = !quote;
      if (!quote && text[i] === ';') { text = text.slice(0, i); break; }
    }
    return { number: index + 1, text: text.trim(), raw };
  });
  const errors = [];
  const symbols = new Map();
  const fail = (line, message) => errors.push({ line: line.number, message });

  function evaluate(expression, line, pass) {
    const text = expression.trim().replace(/\s+/g, '');
    const terms = text.match(/[+-]?[^+-]+/g);
    if (!terms) { fail(line, t("値がありません: {0}", expression)); return 0; }
    let total = 0;
    for (const term of terms) {
      const sign = term[0] === '-' ? -1 : 1;
      const body = term.replace(/^[+-]/, '');
      let value;
      if (/^0x[0-9a-f]+$/i.test(body)) value = parseInt(body.slice(2), 16);
      else if (/^0b[01]+$/i.test(body)) value = parseInt(body.slice(2), 2);
      else if (/^\d+$/.test(body)) value = parseInt(body, 10);
      else if (/^'.'$/.test(body)) value = body.charCodeAt(1);
      else if (/^[A-Za-z_.][\w.]*$/.test(body)) {
        const key = body.toUpperCase();
        if (symbols.has(key)) value = symbols.get(key);
        else if (pass === 2) { fail(line, t("未定義の名前: {0}", body)); value = 0; }
        else value = 0;
      } else { fail(line, t("値を読めません: {0}", body)); value = 0; }
      total += sign * value;
    }
    return total;
  }

  /* A signed field of `bits` bits. 16-bit values near 0xFFFF count as
   * negative, so `[r0+0xFFF0]` and `LI r1, 0xFF00` work as written. */
  function signed(value, bits, line, pass, what) {
    let v = value;
    if (v >= 0x10000 - (1 << (bits - 1)) && v <= 0xFFFF) v -= 0x10000;
    if (pass === 2 && (v < -(1 << (bits - 1)) || v >= 1 << (bits - 1))) {
      fail(line, t("{0}が {1} bit ({2}〜{3}) に収まりません: {4}", what, bits, -(1 << (bits - 1)), (1 << (bits - 1)) - 1, value));
    }
    return v & ((1 << bits) - 1);
  }
  function unsigned(value, bits, line, pass, what) {
    if (pass === 2 && (value < 0 || value >= 1 << bits)) fail(line, t("{0}が {1} bit (0〜{2}) に収まりません: {3}", what, bits, (1 << bits) - 1, value));
    return value & ((1 << bits) - 1);
  }

  function register(text, line) {
    const token = (text ?? '').trim().toUpperCase();
    if (token in REG_NAMES) return REG_NAMES[token];
    const match = /^R([0-7])$/.exec(token);
    if (!match) { fail(line, t("レジスタ r0〜r7 が必要です: {0}", text ?? '')); return 0; }
    return Number(match[1]);
  }

  // [rN], [rN+e], [rN-e], [e] (base r0)
  function memory(text, line, pass) {
    const token = (text ?? '').replace(/\s+/g, '');
    const m = /^\[(.*)\]$/.exec(token);
    if (!m) { fail(line, t("[rN+オフセット] の形式が必要です: {0}", text ?? '')); return [0, 0]; }
    const inner = m[1];
    const reg = /^(R[0-7]|SP|LR)(?=$|[+-])/i.exec(inner);
    if (!reg) return [0, signed(evaluate(inner, line, pass), 6, line, pass, t("オフセット"))];
    const base = register(reg[1], line);
    const rest = inner.slice(reg[1].length);
    return [base, rest ? signed(evaluate(rest, line, pass), 6, line, pass, t("オフセット")) : 0];
  }

  const R = (op, rd, rs1, rs2, f) => (op << 12) | ((rd & 7) << 9) | ((rs1 & 7) << 6) | ((rs2 & 7) << 3) | (f & 7);
  const I9 = (op, rd, imm) => (op << 12) | ((rd & 7) << 9) | (imm & 0x1FF);
  const I6 = (op, rd, rs1, imm) => (op << 12) | ((rd & 7) << 9) | ((rs1 & 7) << 6) | (imm & 0x3F);

  /* Returns the encoded words of one instruction at virtual address `pc`. */
  function encode(mnemonic, operands, line, pass, pc) {
    const expect = (...counts) => {
      if (!counts.includes(operands.length)) fail(line, t("{0} のオペランドは{1}個です", mnemonic, counts.join(t("または"))));
    };
    const value = i => evaluate(operands[i] ?? '0', line, pass);
    const relative = (i, bits) => signed(value(i) - (pc + 1), bits, line, pass, t("分岐先までの距離"));
    let m = mnemonic;
    if (m in COND_ALIASES) m = COND_ALIASES[m];
    if (m in SYS) { expect(0); return [(OP.SYS << 12) | SYS[m]]; }
    if (ALU_R.includes(m)) {
      expect(2, 3);
      const [d, a, b] = operands.length === 3 ? operands : [operands[0], operands[0], operands[1]];
      return [R(OP.ALU, register(d, line), register(a, line), register(b, line), ALU[m])];
    }
    if (m === 'CMP') { expect(2); return [R(OP.ALU, 0, register(operands[0], line), register(operands[1], line), ALU.SUB)]; }
    if (m === 'MOV') { expect(2); return [R(OP.ALU, register(operands[0], line), register(operands[1], line), 0, ALU.ADD)]; }
    if (m === 'NEG') { expect(1, 2); return [R(OP.ALU, register(operands[0], line), 0, register(operands.at(-1), line), ALU.SUB)]; }
    if (m === 'NOT') { expect(1); return [I9(OP.XORI, register(operands[0], line), 0x1FF)]; }
    if (ALU_I.includes(m)) {
      expect(2);
      const imm = m === 'LUI' ? unsigned(value(1), 9, line, pass, t("即値")) : signed(value(1), 9, line, pass, t("即値"));
      return [I9(OP[m], register(operands[0], line), imm)];
    }
    if (m === 'LA') {
      expect(2);
      const v = u16(value(1)), rd = register(operands[0], line);
      return [I9(OP.LUI, rd, v >> 7), I9(OP.ORI, rd, v & 0x7F)];
    }
    if (m === 'LD' || m === 'ST') {
      expect(2);
      const [base, offset] = memory(operands[1], line, pass);
      return [I6(OP[m], register(operands[0], line), base, offset)];
    }
    if (m in COND) { expect(1); return [(OP.BCC << 12) | (COND[m] << 8) | relative(0, 8)]; }
    if (m === 'JAL') { expect(1); return [(OP.JAL << 12) | relative(0, 12)]; }
    if (m === 'JALR') {
      expect(2, 3);
      return [I6(OP.JALR, register(operands[0], line), register(operands[1], line), operands[2] ? signed(value(2), 6, line, pass, t("オフセット")) : 0)];
    }
    if (m === 'JR') { expect(1, 2); return [I6(OP.JALR, 0, register(operands[0], line), operands[1] ? signed(value(1), 6, line, pass, t("オフセット")) : 0)]; }
    if (m === 'CALLR') { expect(1); return [I6(OP.JALR, 7, register(operands[0], line), 0)]; }
    if (m === 'RET') { expect(0); return [I6(OP.JALR, 0, 7, 0)]; }
    if (SHIFT_KINDS.includes(m)) {
      expect(2, 3);
      const [d, a, n] = operands.length === 3 ? operands : [operands[0], operands[0], operands[1]];
      const amount = unsigned(evaluate(n ?? '0', line, pass), 4, line, pass, t("シフト量"));
      return [(OP.SHI << 12) | (register(d, line) << 9) | (register(a, line) << 6) | (SHIFT_KINDS.indexOf(m) << 4) | amount];
    }
    if (m === 'CSRR' || m === 'CSRW') {
      expect(2);
      const [regText, csrText] = m === 'CSRR' ? operands : [operands[1], operands[0]];
      const name = (csrText ?? '').toUpperCase();
      const number = name in CSR ? CSR[name] : unsigned(evaluate(csrText ?? '0', line, pass), 3, line, pass, t("CSR番号"));
      const reg = register(regText, line);
      return [m === 'CSRR' ? R(OP.CSR, reg, 0, number, CSROP.CSRR) : R(OP.CSR, 0, reg, number, CSROP.CSRW)];
    }
    if (m === 'TLBW') { expect(2); return [R(OP.CSR, 0, register(operands[0], line), register(operands[1], line), CSROP.TLBW)]; }
    fail(line, t("不明な命令: {0}", mnemonic));
    return [0];
  }

  let result;
  const duplicates = [];
  for (const pass of [1, 2]) {
    const mem = new Array(RAM_WORDS).fill(0);
    const used = new Set();
    const sourceMap = new Map();
    let phys = 0, virt = 0;
    const put = (line, word, info) => {
      if (phys >= RAM_WORDS || phys < 0) { fail(line, t("メモリの範囲 (0〜0x{0}) の外です", (RAM_WORDS - 1).toString(16))); return false; }
      if (pass === 2 && used.has(phys)) fail(line, t("番地 0x{0} が重複しています", phys.toString(16)));
      used.add(phys);
      mem[phys] = u16(word);
      if (info) sourceMap.set(phys, { line: line.number, virtual: virt, ...info });
      phys++; virt++;
      return true;
    };
    for (const line of lines) {
      let text = line.text;
      if (!text) continue;
      const label = /^([A-Za-z_.][\w.]*)\s*:/.exec(text);
      if (label) {
        const key = label[1].toUpperCase();
        if (pass === 1 && symbols.has(key)) duplicates.push({ line: line.number, message: t("ラベルが重複しています: {0}", label[1]) });
        if (pass === 1) symbols.set(key, virt);
        text = text.slice(label[0].length).trim();
        if (!text) continue;
      }
      const [head] = text.split(/\s+/);
      const rest = text.slice(head.length).trim();
      const directive = head.toLowerCase();
      if (directive === '.equ') {
        const [name, val] = splitOperands(rest);
        symbols.set((name ?? '').toUpperCase(), evaluate(val ?? '0', line, pass));
        continue;
      }
      if (directive === '.org') {
        const args = splitOperands(rest);
        phys = evaluate(args[0] ?? '0', line, pass);
        virt = args.length > 1 ? evaluate(args[1], line, pass) : phys;
        continue;
      }
      if (directive === '.word') {
        for (const item of splitOperands(rest)) {
          const values = /^".*"$/.test(item) ? [...item.slice(1, -1)].map(ch => ch.charCodeAt(0)) : [evaluate(item, line, pass)];
          for (const v of values) if (!put(line, v, { data: true })) break;
        }
        continue;
      }
      if (directive === '.fill') {
        const [n, v] = splitOperands(rest);
        const count = evaluate(n ?? '0', line, pass), fill = v ? evaluate(v, line, pass) : 0;
        for (let i = 0; i < count; i++) if (!put(line, fill, { data: true })) break;
        continue;
      }
      if (directive.startsWith('.')) { fail(line, t("不明な指示: {0}", head)); continue; }
      const mnemonic = head.toUpperCase();
      const words = encode(mnemonic, splitOperands(rest), line, pass, virt);
      words.forEach((w, i) => put(line, w, { text: line.raw.trim(), part: i }));
    }
    if (pass === 1) errors.length = 0;
    result = { mem, labels: Object.fromEntries(symbols), source: sourceMap };
  }
  errors.unshift(...duplicates);
  if (errors.length) throw new AssemblyError(errors);
  return result;
}
