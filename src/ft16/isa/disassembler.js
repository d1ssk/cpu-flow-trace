import { ALU_NAMES, COND_NAMES, CSR_NAMES, PROFILES, SHIFT_KINDS, classify, field, hex, u16 } from './spec.js';

/* Text of one instruction word. With `pc` (the instruction's own address),
 * PC-relative targets are shown as absolute addresses. */
export function disassemble(word, profile = PROFILES.full, pc) {
  const i = classify(word, profile);
  const r = n => `r${n}`;
  const num = v => (v < 0 ? `-${-v}` : `${v}`);
  const target = off => (pc === undefined ? `${off >= 0 ? '+' : ''}${off}` : `0x${hex(u16(pc + 1 + off))}`);
  let text;
  switch (i.kind) {
    case 'NOP': case 'HALT': case 'EI': case 'DI': case 'RETI': case 'SYSCALL': case 'FENCEI': text = i.kind; break;
    case 'ALU': {
      const name = ALU_NAMES[i.funct];
      if (name === 'SUB' && i.rd === 0) text = `CMP ${r(i.rs1)}, ${r(i.rs2)}`;
      else if (name === 'ADD' && i.rs2 === 0) text = `MOV ${r(i.rd)}, ${r(i.rs1)}`;
      else text = `${name} ${r(i.rd)}, ${r(i.rs1)}, ${r(i.rs2)}`;
      break;
    }
    case 'LUI': text = `LUI ${r(i.rd)}, 0x${hex(word & 0x1FF, 3)}`; break;
    case 'ADDI': case 'ANDI': case 'ORI': case 'XORI': case 'CMPI': case 'LI': text = `${i.kind} ${r(i.rd)}, ${num(field.imm9(word))}`; break;
    case 'LD': case 'ST': {
      const off = field.imm6(word);
      text = `${i.kind} ${r(i.rd)}, [${r(i.rs1)}${off ? (off > 0 ? `+${off}` : `${off}`) : ''}]`;
      break;
    }
    case 'BCC': text = `${COND_NAMES[field.cond(word)]} ${target(field.off8(word))}`; break;
    case 'JAL': text = `JAL ${target(field.off12(word))}`; break;
    case 'JALR': {
      const off = field.imm6(word);
      if (i.rd === 0 && i.rs1 === 7 && !off) text = 'RET';
      else if (i.rd === 0) text = `JR ${r(i.rs1)}${off ? `, ${num(off)}` : ''}`;
      else text = `JALR ${r(i.rd)}, ${r(i.rs1)}${off ? `, ${num(off)}` : ''}`;
      break;
    }
    case 'SHI': text = `${SHIFT_KINDS[field.shKind(word)]} ${r(i.rd)}, ${r(i.rs1)}, ${field.shAmount(word)}`; break;
    case 'CSRR': text = `CSRR ${r(i.rd)}, ${CSR_NAMES[field.csr(word)]}`; break;
    case 'CSRW': text = `CSRW ${CSR_NAMES[field.csr(word)]}, ${r(i.rs1)}`; break;
    case 'TLBW': text = `TLBW ${r(i.rs1)}, ${r(i.rs2)}`; break;
    default: text = `.word 0x${hex(word)}`;
  }
  return i.legal || i.kind === 'UNDEF' ? text : `${text} (n/a)`;
}
