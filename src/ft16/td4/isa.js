import { message } from '../i18n/message.js';
/* The TD4 instruction set for stage 0, copied (not imported) from the main
 * site: src/td4/instructions.ts and the decoder in src/simulator/td4/td4.js.
 *
 *   byte = opcode[7:4] immediate[3:0]
 *   dest = opcode[3:2]: 0 A, 1 B, 2 OUT, 3 PC (jump)
 *   MUX select = opcode[1:0] (A, B, IN, 0), forced to 0 for jumps
 *   ALU: sum = selected + immediate, carry = bit 4; C latches every clock
 *   jump when dest = 3 and (opcode[0] = 1 or C = 0) */

export const TD4_INSTRUCTIONS = [
  { opcode: 0x0, mnemonic: 'ADD A, im' },
  { opcode: 0x5, mnemonic: 'ADD B, im' },
  { opcode: 0x1, mnemonic: 'MOV A, B' },
  { opcode: 0x4, mnemonic: 'MOV B, A' },
  { opcode: 0x3, mnemonic: 'MOV A, im' },
  { opcode: 0x7, mnemonic: 'MOV B, im' },
  { opcode: 0x2, mnemonic: 'IN A' },
  { opcode: 0x6, mnemonic: 'IN B' },
  { opcode: 0x9, mnemonic: 'OUT B' },
  { opcode: 0xB, mnemonic: 'OUT im' },
  { opcode: 0xE, mnemonic: 'JNC im' },
  { opcode: 0xF, mnemonic: 'JMP im' },
];

export class Td4AssemblyError extends Error {
  constructor(errors) {
    super(errors.map(e => `line ${e.line}: ${e.message}`).join('\n'));
    this.errors = errors;
  }
}

/* A strict assembler for the twelve documented instructions (as on the main
 * site). Returns {rom: number[16], source: Map<addr, {line, text}>}. */
export function assembleTd4(source, t = message) {
  const rom = new Array(16).fill(0);
  const map = new Map();
  const errors = [];
  let count = 0;
  source.split(/\r?\n/).forEach((raw, index) => {
    const text = raw.split(';')[0].trim().toUpperCase().replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ');
    if (!text) return;
    if (count >= 16) { errors.push({ line: index + 1, message: t("ROM は16命令までです") }); return; }
    for (const spec of TD4_INSTRUCTIONS) {
      const pattern = spec.mnemonic.toUpperCase().replace(/, /g, ',');
      if (!pattern.endsWith('IM')) {
        if (text === pattern) { map.set(count, { line: index + 1, text: raw.trim() }); rom[count++] = spec.opcode << 4; return; }
        continue;
      }
      const prefix = pattern.slice(0, -2);
      if (!text.startsWith(prefix)) continue;
      const literal = text.slice(prefix.length);
      if (literal === 'A' || literal === 'B') continue;
      const immediate = Number(literal);
      if (!/^(?:\d+|0X[\dA-F]+|0B[01]+)$/.test(literal) || !Number.isInteger(immediate) || immediate > 15) {
        errors.push({ line: index + 1, message: t("即値は 0〜15 です: {0}", literal) });
      } else {
        map.set(count, { line: index + 1, text: raw.trim() });
        rom[count++] = (spec.opcode << 4) | immediate;
      }
      return;
    }
    errors.push({ line: index + 1, message: t("TD4 の命令ではありません: {0}", raw.trim()) });
  });
  if (!count) errors.push({ line: 1, message: t("命令がありません") });
  if (errors.length) throw new Td4AssemblyError(errors);
  return { rom, source: map };
}

const NAMES = { 0: 'ADD A,{}', 1: 'MOV A,B', 2: 'IN A', 3: 'MOV A,{}', 4: 'MOV B,A', 5: 'ADD B,{}', 6: 'IN B', 7: 'MOV B,{}', 9: 'OUT B', 11: 'OUT {}', 14: 'JNC {}', 15: 'JMP {}' };
export function disassembleTd4(byte) {
  const im = byte & 15, opcode = byte >> 4;
  const name = NAMES[opcode];
  if (!name) return `OP ${byte.toString(16).toUpperCase().padStart(2, '0')}`;
  // The hardware still adds the immediate field for MOV/IN/OUT B.
  return name.replace('{}', String(im)) + ([1, 2, 4, 6, 9].includes(opcode) && im ? ` (+${im})` : '');
}

/* Decoder outputs for an opcode and the carry flag. */
export function td4Decode(opcode, carry) {
  const dest = opcode >> 2;
  return {
    sel: dest === 3 ? 3 : opcode & 3,
    enA: dest === 0 ? 1 : 0, enB: dest === 1 ? 1 : 0, enOut: dest === 2 ? 1 : 0,
    jump: dest === 3 && ((opcode & 1) || !carry) ? 1 : 0,
  };
}

/* Reference model: one step is one clock. */
export function createTd4({ rom, input = 0 }) {
  const s = { a: 0, b: 0, out: 0, pc: 0, carry: 0, input, steps: 0 };
  function step() {
    const byte = rom[s.pc] ?? 0, opcode = byte >> 4, im = byte & 15;
    const d = td4Decode(opcode, s.carry);
    const x = [s.a, s.b, s.input, 0][d.sel];
    const sum = x + im;
    if (d.enA) s.a = sum & 15;
    if (d.enB) s.b = sum & 15;
    if (d.enOut) s.out = sum & 15;
    s.pc = d.jump ? sum & 15 : (s.pc + 1) & 15;
    s.carry = sum >> 4;
    s.steps++;
  }
  return { state: s, step, run: n => { for (let i = 0; i < n; i++) step(); return s; } };
}
