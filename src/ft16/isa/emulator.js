import {
  ALU, CAUSE, CSR, IO, IMM_ALU, PAGE_BITS, PAGE_WORDS, RAM_WORDS, STATUS_IE, STATUS_KERNEL, TARGET, TIMER_PRESCALE,
  TRAP_VECTOR, classify, condHolds, field, targetOf, u16,
} from './spec.js';

/* Instruction-level FT16 reference model. It exists only to check the
 * circuit implementations in tests; the viewer never drives a circuit from it.
 *
 * One step() is one single-cycle clock: it executes one instruction, takes a
 * trap, or idles while halted. The timer counts these steps, so interrupt
 * timing matches the single-cycle circuits exactly. */

/* ALU: returns the 16-bit result and the flags word (bit0 Z, bit1 C,
 * bit2 N, bit3 V). `writes` is false for PASS, which leaves the flags. */
export function aluCompute(op, a, b) {
  let y, c = 0, v = 0;
  const n = b & 15;
  switch (op) {
    case ALU.ADD: y = a + b; c = y > 0xFFFF ? 1 : 0; y &= 0xFFFF; v = ((a ^ y) & (b ^ y) & 0x8000) ? 1 : 0; break;
    case ALU.SUB: y = (a - b) & 0xFFFF; c = a < b ? 1 : 0; v = ((a ^ b) & (a ^ y) & 0x8000) ? 1 : 0; break;
    case ALU.AND: y = a & b; break;
    case ALU.OR: y = a | b; break;
    case ALU.XOR: y = a ^ b; break;
    case ALU.SHL: y = (a << n) & 0xFFFF; c = n ? (a >> (16 - n)) & 1 : 0; break;
    case ALU.SHR: y = a >> n; c = n ? (a >> (n - 1)) & 1 : 0; break;
    case ALU.SRA: { const s = (a << 16) >> 16; y = (s >> n) & 0xFFFF; c = n ? (s >> (n - 1)) & 1 : 0; break; }
    case ALU.PASS: return { y: b, flags: 0, writes: false };
    default: return { y: 0, flags: 0, writes: false };
  }
  const z = y === 0 ? 1 : 0, neg = (y >> 15) & 1;
  return { y, flags: z | (c << 1) | (neg << 2) | (v << 3), writes: true };
}

const blankTlb = () => Array.from({ length: 4 }, () => ({ valid: 0, vpn: 0, ppn: 0, w: 0, x: 0 }));
export const tlbEntry = (a, b) => ({ vpn: a >> PAGE_BITS, ppn: b >> PAGE_BITS, valid: b & 1, w: (b >> 1) & 1, x: (b >> 2) & 1 });

export function createMachine({ profile, program }) {
  const s = {
    pc: 0, regs: new Array(8).fill(0), flags: 0, halted: false,
    status: STATUS_KERNEL, estat: 0, epc: 0, cause: 0, badva: 0, scratch: 0,
    mem: [...program.mem],
    led: 0, sw: 0, timer: { period: 0, count: 0, pending: 0 },
    tlb: { i: blankTlb(), d: blankTlb() },
    steps: 0, retired: 0, traps: [], ledLog: [],
  };

  const kernel = () => !profile.priv || (s.status & STATUS_KERNEL) !== 0;
  class Trap { constructor(cause, epc, badva) { Object.assign(this, { cause, epc, badva }); } }

  function translate(kind, va, write) {
    if (kernel()) return va;
    const entry = s.tlb[kind].find(e => e.valid && e.vpn === va >> PAGE_BITS);
    if (!entry) throw new Trap(kind === 'i' ? CAUSE.ITLB_MISS : CAUSE.DTLB_MISS, s.pc, va);
    if (kind === 'i' && !entry.x) throw new Trap(CAUSE.EXEC_PROTECT, s.pc, va);
    if (write && !entry.w) throw new Trap(CAUSE.WRITE_PROTECT, s.pc, va);
    return (entry.ppn << PAGE_BITS) | (va & (PAGE_WORDS - 1));
  }

  let timerWrite = false;
  function load(va) {
    const pa = translate('d', va, false);
    const t = targetOf(pa);
    if (t === TARGET.RAM) return s.mem[pa];
    if (!profile.mmio) return 0;
    if (pa === IO.LED) return s.led;
    if (pa === IO.SW) return s.sw;
    if (pa === IO.TIMER_PERIOD) return s.timer.period;
    if (pa === IO.TIMER_STATUS) return s.timer.pending;
    return 0;
  }
  function store(va, value) {
    const pa = translate('d', va, true);
    return () => {
      const t = targetOf(pa);
      if (t === TARGET.RAM) { s.mem[pa] = value; return; }
      if (!profile.mmio) return;
      if (pa === IO.LED) { s.led = value & 0xFF; s.ledLog.push({ step: s.steps, value: s.led }); }
      if (pa === IO.TIMER_PERIOD) { s.timer.period = value; s.timer.count = 0; timerWrite = true; }
      if (pa === IO.TIMER_STATUS) s.timer.pending = 0;
    };
  }

  function enterTrap({ cause, epc, badva }) {
    s.estat = (s.status & 3) | (s.flags << 2);
    s.status = STATUS_KERNEL;
    s.epc = epc; s.cause = cause;
    if (badva !== undefined) s.badva = badva;
    s.pc = TRAP_VECTOR; s.halted = false;
    s.traps.push({ step: s.steps, cause, epc });
  }

  function execute() {
    const pa = translate('i', s.pc, false);
    const word = pa < RAM_WORDS ? s.mem[pa] : 0;
    const ins = classify(word, profile);
    const next = u16(s.pc + 1);
    if (!ins.legal || (ins.privileged && !kernel())) {
      if (profile.priv) throw new Trap(CAUSE.ILLEGAL, s.pc);
      s.pc = next; return;
    }
    const R = s.regs;
    const write = (r, v) => { if (r) R[r] = u16(v); };
    const alu = (op, a, b, rd, keep) => {
      const r = aluCompute(op, a, b);
      if (r.writes) s.flags = r.flags;
      if (!keep) write(rd, r.y);
    };
    let commit = () => {};
    let pc = next;
    switch (ins.kind) {
      case 'NOP': case 'FENCEI': break;
      case 'HALT': s.halted = true; break;
      case 'EI': s.status |= STATUS_IE; break;
      case 'DI': s.status &= ~STATUS_IE; break;
      case 'RETI':
        pc = s.epc;
        s.status = profile.priv ? s.estat & 3 : (s.estat & 1) | STATUS_KERNEL;
        s.flags = (s.estat >> 2) & 15;
        break;
      case 'SYSCALL': throw new Trap(CAUSE.SYSCALL, next);
      case 'ALU': alu(ins.funct, R[ins.rs1], R[ins.rs2], ins.rd); break;
      case 'ADDI': case 'ANDI': case 'ORI': case 'XORI': case 'CMPI':
        alu(IMM_ALU[ins.kind], R[ins.rd], u16(field.imm9(word)), ins.rd, ins.kind === 'CMPI'); break;
      case 'LI': write(ins.rd, field.imm9(word)); break;
      case 'LUI': write(ins.rd, (word & 0x1FF) << 7); break;
      case 'SHI': alu([ALU.SHL, ALU.SHR, ALU.SRA][field.shKind(word)], R[ins.rs1], field.shAmount(word), ins.rd); break;
      case 'LD': write(ins.rd, load(u16(R[ins.rs1] + field.imm6(word)))); break;
      case 'ST': commit = store(u16(R[ins.rs1] + field.imm6(word)), R[ins.rd]); break;
      case 'BCC': if (condHolds(field.cond(word), s.flags)) pc = u16(next + field.off8(word)); break;
      case 'JAL': write(7, next); pc = u16(next + field.off12(word)); break;
      case 'JALR': pc = u16(R[ins.rs1] + field.imm6(word)); write(ins.rd, next); break;
      case 'CSRR': write(ins.rd, readCsr(field.csr(word))); break;
      case 'CSRW': writeCsr(field.csr(word), R[ins.rs1]); break;
      case 'TLBW': {
        const a = R[ins.rs1], b = R[ins.rs2];
        s.tlb[(a >> 4) & 1 ? 'i' : 'd'][a & 3] = tlbEntry(a, b);
        break;
      }
      default: throw new Error(`unhandled ${ins.kind}`);
    }
    commit();
    s.pc = pc;
    s.retired++;
  }

  function readCsr(n) {
    return [s.status, s.estat, s.epc, s.cause, s.badva, s.scratch][n];
  }
  function writeCsr(n, v) {
    if (n === CSR.STATUS) s.status = profile.priv ? v & 3 : (v & 1) | STATUS_KERNEL;
    if (n === CSR.ESTAT) s.estat = v & 0x3F;
    if (n === CSR.EPC) s.epc = v;
    if (n === CSR.CAUSE) s.cause = v;
    if (n === CSR.BADVA) s.badva = v;
    if (n === CSR.SCRATCH) s.scratch = v;
  }

  function tickTimer() {
    if (timerWrite || !s.timer.period) return;
    s.timer.count++;
    if (s.timer.count >= s.timer.period * TIMER_PRESCALE) { s.timer.count = 0; s.timer.pending = 1; }
  }

  function step() {
    timerWrite = false;
    const interrupt = profile.irq && (s.status & STATUS_IE) && s.timer.pending;
    // Snapshot so a faulting instruction leaves no architectural trace.
    const saved = JSON.stringify({ regs: s.regs, flags: s.flags, status: s.status, estat: s.estat, epc: s.epc, cause: s.cause, badva: s.badva, scratch: s.scratch, tlb: s.tlb, halted: s.halted });
    if (interrupt) enterTrap({ cause: CAUSE.TIMER, epc: s.pc });
    else if (!s.halted) {
      try { execute(); }
      catch (error) {
        if (!(error instanceof Trap)) throw error;
        Object.assign(s, JSON.parse(saved));
        enterTrap(error);
      }
    }
    tickTimer();
    s.steps++;
  }

  // A halted CPU without a possible interrupt can never run again.
  const stopped = () => s.halted && !(profile.irq && (s.status & STATUS_IE) && (s.timer.period || s.timer.pending));

  function run(limit = 100000) {
    while (!stopped() && s.steps < limit) step();
    return s;
  }

  return { state: s, step, run, stopped, setSwitches: v => { s.sw = v & 0xFF; } };
}
