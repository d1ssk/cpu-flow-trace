/* FT16 instruction set: shared constants for the assembler, the reference
 * emulator and the control units. Every implementation (single-cycle,
 * multi-cycle, pipelined) executes this same architecture.
 *
 * 16-bit words, word addressing. Instructions and data live in the same
 * memory (von Neumann / stored program). Eight registers, r0 always reads 0.
 * By convention r6 is the stack pointer and r7 the link register. */

export const WORD_BITS = 16;
export const MASK = 0xFFFF;
export const REGISTER_COUNT = 8;
export const SP = 6, LR = 7;
export const RAM_WORDS = 512;          // this implementation: 0x0000–0x01FF
export const RESET_PC = 0x0000;
export const TRAP_VECTOR = 0x0001;
export const PAGE_BITS = 5;            // 32-word pages
export const PAGE_WORDS = 1 << PAGE_BITS;

// Major opcode, instruction bits [15:12].
export const OP = {
  SYS: 0x0, ALU: 0x1, ADDI: 0x2, ANDI: 0x3, ORI: 0x4, XORI: 0x5, CMPI: 0x6, LI: 0x7,
  LUI: 0x8, LD: 0x9, ST: 0xA, BCC: 0xB, JAL: 0xC, JALR: 0xD, SHI: 0xE, CSR: 0xF,
};
export const OP_NAMES = ['SYS', 'ALU', 'ADDI', 'ANDI', 'ORI', 'XORI', 'CMPI', 'LI', 'LUI', 'LD', 'ST', 'Bcc', 'JAL', 'JALR', 'SHI', 'CSR'];

// ALU operations. R-type funct [2:0] uses 0–7; PASS forwards operand b.
export const ALU = { ADD: 0, SUB: 1, AND: 2, OR: 3, XOR: 4, SHL: 5, SHR: 6, SRA: 7, PASS: 8 };
export const ALU_NAMES = ['ADD', 'SUB', 'AND', 'OR', 'XOR', 'SHL', 'SHR', 'SRA', 'PASS'];
// Immediate ALU opcodes and the ALU operation each uses.
export const IMM_ALU = { ADDI: ALU.ADD, ANDI: ALU.AND, ORI: ALU.OR, XORI: ALU.XOR, CMPI: ALU.SUB, LI: ALU.PASS, LUI: ALU.PASS };
export const SHIFT_KINDS = ['SHLI', 'SHRI', 'SRAI'];

export const SYS = { NOP: 0, HALT: 1, EI: 2, DI: 3, RETI: 4, SYSCALL: 5, FENCEI: 6 };
export const SYS_NAMES = ['NOP', 'HALT', 'EI', 'DI', 'RETI', 'SYSCALL', 'FENCEI'];
export const CSROP = { CSRR: 0, CSRW: 1, TLBW: 2 };

// Branch conditions, bits [11:8] of Bcc. Flags: Z zero, C borrow/carry,
// N negative (bit 15), V signed overflow.
export const COND_NAMES = ['JMP', 'JZ', 'JNZ', 'JC', 'JNC', 'JN', 'JNN', 'JV', 'JNV', 'JLT', 'JGE', 'JGT', 'JLE', 'JA', 'JBE'];
export const COND = Object.fromEntries(COND_NAMES.map((n, i) => [n, i]));
export const COND_ALIASES = { JEQ: 'JZ', JNE: 'JNZ', JB: 'JC', JAE: 'JNC', JMI: 'JN', JPL: 'JNN' };

// Flags word: bit0 Z, bit1 C, bit2 N, bit3 V.
export const FLAG = { Z: 1, C: 2, N: 4, V: 8 };
export function condHolds(cond, flags) {
  const z = flags & 1, c = (flags >> 1) & 1, n = (flags >> 2) & 1, v = (flags >> 3) & 1;
  switch (cond) {
    case 0: return true;
    case 1: return z === 1;
    case 2: return z === 0;
    case 3: return c === 1;
    case 4: return c === 0;
    case 5: return n === 1;
    case 6: return n === 0;
    case 7: return v === 1;
    case 8: return v === 0;
    case 9: return n !== v;
    case 10: return n === v;
    case 11: return z === 0 && n === v;
    case 12: return z === 1 || n !== v;
    case 13: return c === 0 && z === 0;
    case 14: return c === 1 || z === 1;
    default: return false;
  }
}

export const CSR = { STATUS: 0, ESTAT: 1, EPC: 2, CAUSE: 3, BADVA: 4, SCRATCH: 5 };
export const CSR_NAMES = Object.keys(CSR);

export const CAUSE = { NONE: 0, TIMER: 1, SYSCALL: 2, ILLEGAL: 3, ITLB_MISS: 4, DTLB_MISS: 5, WRITE_PROTECT: 6, EXEC_PROTECT: 7 };
export const CAUSE_NAMES = ['-', 'タイマ割り込み', 'システムコール', '不正・特権命令', '命令TLBミス', 'データTLBミス', '書き込み保護違反', '実行保護違反'];
export const CAUSE_SHORT = ['-', 'timer', 'syscall', 'illegal', 'ITLB miss', 'DTLB miss', 'write fault', 'exec fault'];

// STATUS: bit0 IE, bit1 KERNEL. ESTAT: bit0 IE, bit1 KERNEL, bits 5:2 flags.
export const STATUS_IE = 1, STATUS_KERNEL = 2;

// Memory-mapped I/O occupies the top 16 words of the address space; [r0-16]
// reaches it without a base register.
export const IO_BASE = 0xFFF0;
export const IO = { LED: 0xFFF0, SW: 0xFFF1, TIMER_PERIOD: 0xFFF2, TIMER_STATUS: 0xFFF3 };
// The timer counts one tick every TIMER_PRESCALE clock cycles.
export const TIMER_PRESCALE = 4;

// Address decoding shared by every implementation.
export const TARGET = { RAM: 0, IO: 1, TIMER: 2, NONE: 3 };
export function targetOf(addr) {
  if (addr < RAM_WORDS) return TARGET.RAM;
  if (addr === IO.LED || addr === IO.SW) return TARGET.IO;
  if (addr === IO.TIMER_PERIOD || addr === IO.TIMER_STATUS) return TARGET.TIMER;
  return TARGET.NONE;
}

/* Feature profiles. A stage implements one profile; instructions outside the
 * profile execute as NOP, except under `priv`, where they raise ILLEGAL. */
export const PROFILES = {
  core:   { name: 'core',   mem: false, call: false, mmio: false, irq: false, priv: false },
  mem:    { name: 'mem',    mem: true,  call: false, mmio: false, irq: false, priv: false },
  call:   { name: 'call',   mem: true,  call: true,  mmio: false, irq: false, priv: false },
  mmio:   { name: 'mmio',   mem: true,  call: true,  mmio: true,  irq: false, priv: false },
  system: { name: 'system', mem: true,  call: true,  mmio: true,  irq: true,  priv: false },
  full:   { name: 'full',   mem: true,  call: true,  mmio: true,  irq: true,  priv: true },
};

export const sext = (value, bits) => {
  const m = 1 << (bits - 1);
  return ((value & ((1 << bits) - 1)) ^ m) - m;
};
export const u16 = value => value & MASK;

export const field = {
  op: w => (w >> 12) & 15,
  rd: w => (w >> 9) & 7,
  rs1: w => (w >> 6) & 7,
  rs2: w => (w >> 3) & 7,
  funct: w => w & 7,
  imm9: w => sext(w, 9),
  imm6: w => sext(w, 6),
  off8: w => sext(w, 8),
  off12: w => sext(w, 12),
  cond: w => (w >> 8) & 15,
  shKind: w => (w >> 4) & 3,
  shAmount: w => w & 15,
  csr: w => (w >> 3) & 7,
};

/* Immediate formats, selected by the control unit (immSel). */
export const IMM = { NONE: 0, I9: 1, U9: 2, I6: 3, B8: 4, J12: 5, SH4: 6 };
export const IMM_NAMES = ['-', 'imm9', 'imm9<<7', 'imm6', 'off8', 'off12', 'sh4'];
export function immediate(word, sel) {
  switch (sel) {
    case IMM.I9: return u16(field.imm9(word));
    case IMM.U9: return u16((word & 0x1FF) << 7);
    case IMM.I6: return u16(field.imm6(word));
    case IMM.B8: return u16(field.off8(word));
    case IMM.J12: return u16(field.off12(word));
    case IMM.SH4: return field.shAmount(word);
    default: return 0;
  }
}

/* Decodes a word into an instruction kind and checks it against a profile.
 * Returns {kind, op, rd, rs1, rs2, ..., legal, privileged}. Undefined
 * encodings give kind 'UNDEF'. */
export function classify(word, profile) {
  const op = field.op(word), funct = field.funct(word);
  const base = { word, op, rd: field.rd(word), rs1: field.rs1(word), rs2: field.rs2(word), funct };
  let kind = 'UNDEF', needs = null, privileged = false;
  switch (op) {
    case OP.SYS:
      kind = SYS_NAMES[funct] ?? 'UNDEF';
      if (['EI', 'DI', 'RETI'].includes(kind)) needs = 'irq';
      if (kind === 'SYSCALL') needs = 'priv';
      if (kind === 'FENCEI') needs = 'mem';
      privileged = ['HALT', 'EI', 'DI', 'RETI'].includes(kind);
      break;
    case OP.ALU: kind = 'ALU'; break;
    case OP.ADDI: case OP.ANDI: case OP.ORI: case OP.XORI: case OP.CMPI: case OP.LI: case OP.LUI:
      kind = OP_NAMES[op]; break;
    case OP.LD: kind = 'LD'; needs = 'mem'; break;
    case OP.ST: kind = 'ST'; needs = 'mem'; break;
    case OP.BCC: kind = field.cond(word) < COND_NAMES.length ? 'BCC' : 'UNDEF'; break;
    case OP.JAL: kind = 'JAL'; needs = 'call'; break;
    case OP.JALR: kind = 'JALR'; needs = 'call'; break;
    case OP.SHI: kind = field.shKind(word) < 3 ? 'SHI' : 'UNDEF'; break;
    case OP.CSR:
      kind = ['CSRR', 'CSRW', 'TLBW'][funct] ?? 'UNDEF';
      if (kind === 'CSRR' || kind === 'CSRW') { needs = 'irq'; if (field.csr(word) > CSR.SCRATCH) kind = 'UNDEF'; }
      if (kind === 'TLBW') needs = 'priv';
      privileged = kind !== 'UNDEF';
      break;
    default: break;
  }
  const legal = kind !== 'UNDEF' && (!needs || profile[needs]);
  return { ...base, kind, legal, privileged };
}

export const hex = (value, digits = 4) => (value >>> 0).toString(16).toUpperCase().padStart(digits, '0');
