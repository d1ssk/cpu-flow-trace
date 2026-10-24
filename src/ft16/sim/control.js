import { ALU, IMM, IMM_ALU, OP, classify, field, immediate } from '../isa/spec.js';

/* Instruction decoding shared by the control units. The reference emulator
 * implements the instruction set independently, so tests compare two
 * separate descriptions of the same architecture. */

export const WB = { ALU: 0, MEM: 1, LINK: 2, CSR: 3 };
export const WB_NAMES = ['ALU', 'MEM', 'PC+1', 'CSR'];
export const PCSRC = { SEQ: 0, BR: 1, JAL: 2, JALR: 3, RETI: 4 };

export const SIGNALS = {
  regWrite: 1, wbSel: 2, aluOp: 4, aluSrc: 1, flagWrite: 1, flagSrc: 1,
  memRead: 1, memWrite: 1, memAccess: 1, pcSrc: 3, cond: 4, halt: 1, ei: 1, di: 1, reti: 1, syscall: 1,
  csrWrite: 1, tlbWrite: 1, fence: 1, illegal: 1,
};

export const SIGNAL_DOC = {
  regWrite: 'レジスタファイルへ書き込む (書き込み先が r0 なら L)',
  wbSel: '書き戻す値の選択 (0 ALU / 1 メモリ / 2 PC+1 (戻り番地) / 3 CSR)',
  aluOp: 'ALUの演算 (0 ADD 1 SUB 2 AND 3 OR 4 XOR 5 SHL 6 SHR 7 SRA 8 PASS)',
  aluSrc: 'ALUのB入力 (0 レジスタ / 1 即値)',
  flagWrite: 'フラグ Z・C・N・V を更新する',
  flagSrc: 'フラグの値 (0 ALU / 1 ESTATから復帰)',
  memRead: 'メモリ (データ側) を読む',
  memWrite: 'メモリ (データ側) へ書く',
  memAccess: 'データ側のメモリを使う (読み書き)',
  pcSrc: '次のPC (0 PC+1 / 1 条件分岐 / 2 JAL / 3 JALR / 4 RETI)',
  cond: '分岐条件 (0 常に 1 Z 2 NZ 3 C 4 NC … 9 LT 10 GE 11 GT 12 LE 13 A 14 BE)',
  halt: 'CPUを停止する',
  ei: '割り込みを許可', di: '割り込みを禁止', reti: '割り込みから復帰',
  syscall: 'システムコール例外', csrWrite: 'CSRへ書き込む', tlbWrite: 'TLBへ書き込む',
  fence: '命令キャッシュを無効にして取り込み直す (FENCEI)',
  illegal: '不正命令・特権違反',
};

const TWO_OPERAND = new Set(['ADDI', 'ANDI', 'ORI', 'XORI', 'CMPI']);
const IMM_OF = {
  ADDI: IMM.I9, ANDI: IMM.I9, ORI: IMM.I9, XORI: IMM.I9, CMPI: IMM.I9, LI: IMM.I9, LUI: IMM.U9,
  LD: IMM.I6, ST: IMM.I6, JALR: IMM.I6, BCC: IMM.B8, JAL: IMM.J12, SHI: IMM.SH4,
};
export const FORMAT_NAMES = {
  ALU: 'R (rd,rs1,rs2)', ADDI: 'I9 (rd,imm)', ANDI: 'I9 (rd,imm)', ORI: 'I9 (rd,imm)', XORI: 'I9 (rd,imm)', CMPI: 'I9 (rd,imm)',
  LI: 'I9 (rd,imm)', LUI: 'U9 (imm<<7)', LD: 'I6 [rs1+imm]', ST: 'I6 [rs1+imm]', JALR: 'I6 rs1+imm', BCC: 'B8 PC-rel',
  JAL: 'J12 PC-rel', SHI: 'SH (rs1,n)', CSRR: 'CSR', CSRW: 'CSR', TLBW: 'R (rs1,rs2)',
};

/* Register numbers and immediate of a word: what the FIELDS module does
 * with a few small multiplexers controlled by the opcode bits.
 *   ra: register read on port a (rd for two-operand immediates, else rs1)
 *   rb: register read on port b (rd for ST, which stores it, else rs2)
 *   rd: destination (r7 for JAL)
 *   imm: the immediate in the instruction's format (CSR number for CSR ops) */
export function decodeFields(word) {
  const kind = classify(word, { mem: true, call: true, mmio: true, irq: true, priv: true }).kind;
  const op = field.op(word);
  const ra = TWO_OPERAND.has(kind) ? field.rd(word) : field.rs1(word);
  const rb = kind === 'ST' ? field.rd(word) : field.rs2(word);
  const rd = op === OP.JAL ? 7 : field.rd(word);
  const sel = IMM_OF[kind] ?? IMM.NONE;
  const imm = op === OP.CSR ? field.csr(word) : immediate(word, sel);
  return { kind, ra, rb, rd, imm, sel, format: FORMAT_NAMES[kind] ?? '-' };
}

/* Which read ports an instruction really uses (for hazard detection). */
export function readsOf(kind) {
  const useA = ['ALU', 'ADDI', 'ANDI', 'ORI', 'XORI', 'CMPI', 'SHI', 'LD', 'ST', 'JALR', 'CSRW', 'TLBW'].includes(kind);
  const useB = ['ALU', 'ST', 'TLBW'].includes(kind);
  return { useA: useA ? 1 : 0, useB: useB ? 1 : 0 };
}

const blank = () => Object.fromEntries(Object.keys(SIGNALS).map(k => [k, 0]));

export function decodeControl(word, profile, { kernel = 1 } = {}) {
  const ins = classify(word, profile);
  const c = blank();
  if (!ins.legal || (ins.privileged && !kernel)) {
    if (profile.priv) c.illegal = 1;
    return { ...c, kind: ins.kind, ins };
  }
  const alu = (op, src, write = true) => Object.assign(c, { aluOp: op, aluSrc: src, flagWrite: op === ALU.PASS ? 0 : 1, regWrite: write ? 1 : 0, wbSel: WB.ALU });
  switch (ins.kind) {
    case 'HALT': c.halt = 1; break;
    case 'EI': c.ei = 1; break;
    case 'DI': c.di = 1; break;
    case 'RETI': Object.assign(c, { reti: 1, pcSrc: PCSRC.RETI, flagWrite: 1, flagSrc: 1 }); break;
    case 'SYSCALL': c.syscall = 1; break;
    case 'FENCEI': c.fence = 1; break;
    case 'ALU': alu(ins.funct, 0); break;
    case 'ADDI': case 'ANDI': case 'ORI': case 'XORI': case 'LI': case 'LUI': alu(IMM_ALU[ins.kind], 1); break;
    case 'CMPI': alu(ALU.SUB, 1, false); break;
    case 'SHI': alu([ALU.SHL, ALU.SHR, ALU.SRA][field.shKind(word)], 1); break;
    case 'LD': Object.assign(c, { memRead: 1, regWrite: 1, wbSel: WB.MEM }); break;
    case 'ST': c.memWrite = 1; break;
    case 'BCC': Object.assign(c, { pcSrc: PCSRC.BR, cond: field.cond(word) }); break;
    case 'JAL': Object.assign(c, { pcSrc: PCSRC.JAL, regWrite: 1, wbSel: WB.LINK }); break;
    case 'JALR': Object.assign(c, { pcSrc: PCSRC.JALR, regWrite: 1, wbSel: WB.LINK }); break;
    case 'CSRR': Object.assign(c, { regWrite: 1, wbSel: WB.CSR }); break;
    case 'CSRW': c.csrWrite = 1; break;
    case 'TLBW': c.tlbWrite = 1; break;
    default: break;
  }
  // Writes to r0 are discarded: the decoder never asks for them.
  if (c.regWrite && decodeFields(word).rd === 0) c.regWrite = 0;
  c.memAccess = c.memRead | c.memWrite;
  return { ...c, kind: ins.kind, ins };
}
