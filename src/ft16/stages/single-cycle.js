/* Single-cycle FT16 implementations (stages 1–4 and 8). Every instruction
 * completes in one clock: the clock edge commits the results computed by
 * the combinational path from PC through memory and ALU. Because fetch and
 * data access happen in the same cycle, the one memory needs two ports.
 * Features are added in the order of the learning path. */

import { CircuitBuilder } from '../sim/builder.js';
import { TRAP_VECTOR } from '../isa/spec.js';

export function buildSingleCycle(meta) {
  const f = meta.features; // mem, call, irq (with MMIO), priv
  const b = new CircuitBuilder({ ...meta, family: 'single' });

  // Control signals exposed by the decoder at this stage.
  const outputs = { pcSrc: 3, cond: 4, halt: 1, regWrite: 1, aluSrc: 1, aluOp: 4, flagWrite: 1 };
  if (f.mem) Object.assign(outputs, { wbSel: 2, memWrite: 1 });
  if (f.irq) Object.assign(outputs, { flagSrc: 1, csrWrite: 1, ei: 1, di: 1, reti: 1 });
  if (f.priv) Object.assign(outputs, { memAccess: 1, tlbWrite: 1, syscall: 1, illegal: 1 });
  const order = ['pcSrc', 'cond', 'aluOp', 'aluSrc', 'flagSrc', 'wbSel', 'memAccess', 'syscall', 'illegal',
    'regWrite', 'flagWrite', 'memWrite', 'halt', 'csrWrite', 'ei', 'di', 'reti', 'tlbWrite'];
  const ordered = Object.fromEntries(order.filter(k => k in outputs).map(k => [k, outputs[k]]));
  const bottom = Object.fromEntries(Object.keys(ordered).map(k => [k, 'bottom']));

  // Gate (stage 4+): a trap or HALT cancels every state-changing signal.
  const gated = ['regWrite', 'flagWrite', 'memWrite', 'halt', 'csrWrite', 'ei', 'di', 'reti', ...(f.priv ? ['tlbWrite'] : [])].map(n => [n, 1]);
  const G = f.irq ? sig => `GATE.${sig}` : sig => `CTRL.${sig}`;

  const pcNames = ['PC+1', 'target'];
  if (f.call) pcNames.push('rs1+imm');
  if (f.irq) pcNames.push('EPC', 'vector');
  const wbNames = ['ALU', 'MEM'];
  if (f.call) wbNames.push('PC+1');
  if (f.irq) wbNames.push('CSR');

  // ---- datapath band ------------------------------------------------------
  b.add('PCMUX', 'MUX', { width: 16, n: pcNames.length, names: pcNames, consts: f.irq ? { 4: TRAP_VECTOR } : undefined, selWidth: 3, selSide: 'top' },
    [0, 0], { label: 'NEXT PC' });
  b.add('PC', 'REG', { width: 16, en: true, enSide: 'top' }, [b.right('PCMUX'), b.alignPort('d', 'PCMUX.y')], { label: 'PC' });
  let fetch = 'PC.q';
  if (f.priv) {
    b.add('ITLB', 'TLB', { kind: 'I', defaults: { req: 1 }, wSide: 'bottom' }, [b.right('PC'), b.alignPort('va', 'PC.q')], { label: 'I-TLB' });
    fetch = 'ITLB.pa';
  }
  // Instruction port on the left/top, data port on the right.
  b.add('MEM', 'MEMORY', { data: !!f.mem, profile: meta.profile }, [b.right(fetch.split('.')[0], 5), b.alignPort('iaddr', fetch)],
    { label: f.mem ? 'MEMORY (2 ports)' : 'MEMORY', sides: { daddr: 'right', wd: 'right', we: 'top' }, order: { right: ['idata', 'rd', 'daddr', 'wd'] } });
  // Stages 1–3 fold the datapath: fetch on the first row, register read,
  // ALU and write-back on a second row below it, so the drawing is not one
  // long band. Stages 4 and 8 keep one row with the devices underneath.
  const folded = !f.irq;
  b.add('FIELDS', 'FIELDS', {}, [b.right('MEM', f.mem ? 8 : 5), b.alignPort('ir', 'MEM.idata')], { label: 'FIELDS' });
  if (folded) b.add('RF', 'REGFILE', {}, [b.x('MEM') + 12, b.below('MEM', 6)], { label: 'REGISTERS' });
  else b.add('RF', 'REGFILE', {}, [b.right('FIELDS'), b.alignPort('ra', 'FIELDS.ra')], { label: 'REGISTERS' });
  b.add('BMUX', 'MUX', { width: 16, n: 2, names: ['rb', 'imm'], selSide: 'top' }, [b.right('RF', f.irq ? 8 : 5), b.alignPort('in0', 'RF.db', 2)], { label: 'B SRC' });
  b.add('ALU', 'ALU', {}, [b.right('BMUX'), b.alignPort('b', 'BMUX.y')], { label: 'ALU' });
  if (f.mem) {
    b.add('AGU', 'ADD', { width: 16, sign: 'a+imm', purpose: 'LD/ST の番地 (と JALR の行き先) rs1 + 即値 を計算します。' },
      [b.x('RF'), b.below('RF', f.priv ? 8 : 6)], { label: 'ADDR' });
  }
  b.add('FLAGS', 'REG', { width: 4, en: true, enSide: 'top', flags: true }, [b.x('ALU'), b.below('ALU', 6)], { label: 'FLAGS' });
  if (f.irq) b.add('FMUX', 'MUX', { width: 4, n: 2, names: ['ALU', 'ESTAT'], selSide: 'top' }, [b.leftOf('FLAGS', 5), b.alignPort('y', 'FLAGS.d')], { label: 'FLAG SRC' });
  if (f.mem) {
    b.add('WBMUX', 'MUX', { width: 16, n: wbNames.length, names: wbNames, selWidth: 2, selSide: 'top' }, [b.right('ALU', 6), b.alignPort('in0', 'ALU.y')], { label: 'WRITE BACK' });
  }

  // ---- next PC: adders below PC, selection logic on top ----------------------
  b.add('PCINC', 'INC', { width: 16 }, [b.x('PC'), b.below('PC', 5)], { label: 'PC+1' });
  b.add('BADD', 'ADD', { width: 16, sign: '+off', purpose: '分岐・JAL の行き先 PC+1 + オフセット を計算します (PC相対)。' },
    [b.x('PC'), b.below('PCINC', 4)], { label: 'TARGET' });

  // ---- control (top) ---------------------------------------------------------
  b.add('CTRL', 'CONTROL', { profile: meta.profile, outputs: ordered, haltInput: !f.irq, kernelInput: f.priv },
    [b.x('FIELDS'), b.above(folded ? 'FIELDS' : 'RF', 6)], { label: 'CONTROL', sides: bottom });
  if (f.irq) {
    // The gate sits between the decoder and the datapath; the decoder moves up.
    b.add('GATE', 'GATE', { signals: gated, halted: true, ctlSide: 'left' }, [b.alignPortX('i_regWrite', 'CTRL.regWrite'), b.above('RF', 6)], {
      label: 'WRITE GATE', hideLabels: ['top'],
      // kill faces TRAP (right of the decoder, or top-left with TLBs); halted faces HALT.
      sides: { ...Object.fromEntries(gated.map(([n]) => [`i_${n}`, 'top'])), ...Object.fromEntries(gated.map(([n]) => [n, 'bottom'])), kill: f.priv ? 'left' : 'right' },
    });
    b.move('CTRL', undefined, b.above('GATE', 4));
  }
  const pcselSides = { pcSrc: 'right', cond: 'right', flags: 'right', halted: 'right', take: 'right', sel: 'bottom', en: 'bottom' };
  b.add('PCSEL', 'PCSEL', { selWidth: 3, halt: true, trap: f.irq }, [b.leftOf('CTRL', 6), b.alignBottom('CTRL')], { label: 'PC SELECT', sides: pcselSides });
  b.add('HALT', 'HALTFF', { clr: f.irq }, [b.leftOf('PCSEL', 4), b.alignBottom('PCSEL')], { label: 'HALT' });

  // ---- data side (stage 4+): devices on the data bus; traps ----------------
  const gapLow = f.priv ? 10 : 6;
  if (f.priv) b.add('DTLB', 'TLB', { kind: 'D', wSide: 'top' }, [b.x('MEM'), Math.max(b.below('AGU', gapLow), b.below('MEM', gapLow))], { label: 'D-TLB' });
  if (f.irq) {
    const yDev = Math.max(b.below('AGU', gapLow), b.below('MEM', gapLow));
    b.add('ADEC', 'ADEC', {}, [b.x(f.priv ? 'DTLB' : 'MEM') + (f.priv ? b.w('DTLB') + 6 : 0), yDev], { label: 'ADDR DECODE' });
    b.add('IO', 'IODEV', {}, [b.right('ADEC', 5), yDev], { label: 'I/O' });
    b.add('TIMER', 'TIMER', {}, [b.right('IO', 5), yDev], { label: 'TIMER' });
    b.add('RDMUX', 'MUX', { width: 16, n: 3, names: ['RAM', 'I/O', 'TIMER'], selWidth: 2, selSide: 'top' }, [b.right('TIMER', 5), yDev], { label: 'READ SEL' });
    // Trap logic and CSRs sit beside the decoder and the gate they work with.
    // With TLBs, most trap inputs (TLBs, PC) and outputs (PC SELECT, HALT) are on the left.
    if (f.priv) b.add('TRAP', 'TRAP', { priv: true }, [b.leftOf('HALT', 6), b.alignBottom('CTRL')], { label: 'TRAP' });
    else b.add('TRAP', 'TRAP', { priv: false }, [b.right('CTRL', 6), b.y('CTRL')], { label: 'TRAP' });
    b.add('CSR', 'CSRFILE', { priv: f.priv }, [b.right(f.priv ? 'CTRL' : 'TRAP', f.priv ? 10 : 6), b.above('WBMUX', f.priv ? 9 : 6)], { label: 'CSR' });
  }

  // ---- connections -----------------------------------------------------------
  const C = (from, ...to) => b.connect(from, ...to);
  C('PCMUX.y', 'PC.d');
  C('PC.q', f.priv ? 'ITLB.va' : 'MEM.iaddr', 'PCINC.a', ...(f.irq ? ['TRAP.pc'] : []));
  if (f.priv) C('ITLB.pa', 'MEM.iaddr');
  C('PCINC.y', 'PCMUX.in0', 'BADD.a', ...(f.call ? ['WBMUX.in2'] : []), ...(f.priv ? ['TRAP.pcInc'] : []));
  C('BADD.y', 'PCMUX.in1');
  C('MEM.idata', 'CTRL.ir', 'FIELDS.ir');
  C('FIELDS.ra', 'RF.ra');
  C('FIELDS.rb', 'RF.rb');
  C('FIELDS.rd', 'RF.wa');
  C('FIELDS.imm', 'BMUX.in1', 'BADD.b', ...(f.mem ? ['AGU.b'] : []), ...(f.irq ? ['CSR.num'] : []));
  C('RF.da', 'ALU.a', ...(f.mem ? ['AGU.a'] : []), ...(f.irq ? ['CSR.wd'] : []), ...(f.priv ? ['ITLB.wa', 'DTLB.wa'] : []));
  C('RF.db', 'BMUX.in0', ...(f.mem ? ['MEM.wd'] : []), ...(f.irq ? ['IO.wd', 'TIMER.wd'] : []), ...(f.priv ? ['ITLB.wb', 'DTLB.wb'] : []));
  C('BMUX.y', 'ALU.b');
  C('ALU.y', f.mem ? 'WBMUX.in0' : 'RF.wd');
  C('ALU.flags', f.irq ? 'FMUX.in0' : 'FLAGS.d');
  C('FLAGS.q', 'PCSEL.flags', ...(f.irq ? ['CSR.flags'] : []));
  C('CTRL.aluOp', 'ALU.op');
  C('CTRL.aluSrc', 'BMUX.sel');
  C('CTRL.pcSrc', 'PCSEL.pcSrc');
  C('CTRL.cond', 'PCSEL.cond');
  C('PCSEL.sel', 'PCMUX.sel');
  C('PCSEL.en', 'PC.en');
  C('HALT.q', 'PCSEL.halted', f.irq ? 'GATE.halted' : 'CTRL.halted', ...(f.irq ? ['TRAP.halted'] : []));
  if (f.irq) for (const [name] of gated) C(`CTRL.${name}`, `GATE.i_${name}`);
  C(G('regWrite'), 'RF.we');
  C(G('flagWrite'), 'FLAGS.en');
  C(G('halt'), 'HALT.set');

  if (f.mem) {
    const addr = 'AGU.y';
    const physical = f.priv ? 'DTLB.pa' : addr;
    if (f.call) C(addr, 'PCMUX.in2');
    if (f.priv) {
      C(addr, 'DTLB.va', 'TRAP.dva');
      C('CTRL.memAccess', 'DTLB.req');
      C('CTRL.memWrite', 'DTLB.write');
    }
    C(physical, 'MEM.daddr', ...(f.irq ? ['ADEC.addr', 'IO.addr', 'TIMER.addr'] : []));
    C('CTRL.wbSel', 'WBMUX.sel');
    C('WBMUX.y', 'RF.wd');
    if (f.irq) {
      C(G('memWrite'), 'ADEC.we');
      C('ADEC.ramWe', 'MEM.we');
      C('ADEC.ioWe', 'IO.we');
      C('ADEC.tmWe', 'TIMER.we');
      C('ADEC.sel', 'RDMUX.sel');
      C('MEM.rd', 'RDMUX.in0');
      C('IO.rd', 'RDMUX.in1');
      C('TIMER.rd', 'RDMUX.in2');
      C('RDMUX.y', 'WBMUX.in1');
      C('TIMER.irq', 'TRAP.irq');
      C('CSR.ie', 'TRAP.ie');
      C('TRAP.take', 'GATE.kill', 'PCSEL.take', 'HALT.clr', 'CSR.take');
      C('TRAP.cause', 'CSR.cause');
      C('TRAP.epc', 'CSR.epcIn');
      C('CSR.epc', 'PCMUX.in3');
      C('CSR.eflags', 'FMUX.in1');
      C('FMUX.y', 'FLAGS.d');
      C('CTRL.flagSrc', 'FMUX.sel');
      C('CSR.rd', 'WBMUX.in3');
      C(G('csrWrite'), 'CSR.we');
      for (const s of ['ei', 'di', 'reti']) C(G(s), `CSR.${s}`);
    } else {
      C(G('memWrite'), 'MEM.we');
      C('MEM.rd', 'WBMUX.in1');
    }
    if (f.priv) {
      C('CSR.kernel', 'ITLB.kernel', 'DTLB.kernel', 'CTRL.kernel');
      C(G('tlbWrite'), 'ITLB.we', 'DTLB.we');
      C('ITLB.miss', 'TRAP.itlbMiss');
      C('ITLB.fault', 'TRAP.ifault');
      C('DTLB.miss', 'TRAP.dtlbMiss');
      C('DTLB.fault', 'TRAP.wfault');
      C('CTRL.illegal', 'TRAP.illegal');
      C('CTRL.syscall', 'TRAP.syscall');
      C('TRAP.badva', 'CSR.badva');
    }
  }

  const circuit = b.build();
  circuit.hooks = {
    beforeClock(sim, info) {
      const halted = sim.state('HALT').value;
      const take = f.irq ? sim.output('TRAP', 'take') : 0;
      info.pc = sim.state('PC').value;
      info.retired = !halted && !take ? 1 : 0;
      info.trap = take ? sim.output('TRAP', 'cause') : 0;
    },
  };
  circuit.inspect = sim => singleCycleState(sim, f);
  return circuit;
}

export function singleCycleState(sim, f) {
  const s = {
    pc: sim.state('PC').value,
    regs: [...sim.state('RF').regs],
    flags: sim.state('FLAGS').value,
    halted: !!sim.state('HALT').value,
    mem: [...sim.state('MEM').words],
    stages: [{ name: 'EXEC', pc: sim.state('PC').value }],
  };
  if (f.irq) {
    Object.assign(s, { led: sim.state('IO').led, csr: { ...sim.state('CSR') } });
    s.ie = !!(s.csr.status & 1);
    s.timer = { ...sim.state('TIMER') };
  }
  if (f.priv) s.kernel = !!(s.csr.status & 2);
  return s;
}
