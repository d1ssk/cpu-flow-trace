/* Multi-cycle FT16 (stage 5): the stage-4 instruction set executed in
 * several short clock cycles per instruction. One ALU computes PC+1,
 * branch targets, addresses and results in different cycles; one memory
 * port serves instruction fetch and data access in different cycles;
 * latches (IR, A, B, ALUOUT, MDR) carry values between cycles; a state
 * machine sequences the datapath and waits for the memory's ready. */

import { CircuitBuilder } from '../sim/builder.js';
import { MC_STATES } from '../sim/modules-multicycle.js';
import { TRAP_VECTOR } from '../isa/spec.js';

export function buildMultiCycle(meta) {
  const b = new CircuitBuilder({ ...meta, family: 'multi' });

  // ---- datapath: fetch on the first row; registers, ALU and write-back on a
  // second row below the memory; the data-side devices on a third row --------
  b.add('PCMUX', 'MUX', { width: 16, n: 4, names: ['ALU', 'ALUOUT', 'EPC', 'vector'], consts: { 3: TRAP_VECTOR }, selSide: 'top' }, [0, 0], { label: 'NEXT PC' });
  b.add('PC', 'REG', { width: 16, en: true, enSide: 'top' }, [b.right('PCMUX'), b.alignPort('d', 'PCMUX.y')], { label: 'PC' });
  b.add('MADDR', 'MUX', { width: 16, n: 2, names: ['PC', 'ALUOUT'], selSide: 'top' }, [b.right('PC'), b.alignPort('in0', 'PC.q')], { label: 'ADDR SEL' });
  b.add('MEM', 'SMEM', { profile: meta.profile, latency: 2 }, [b.right('MADDR', 5), b.alignPort('addr', 'MADDR.y')], { label: 'MEMORY (1 port)' });
  b.add('IR', 'REG', { width: 16, en: true, enSide: 'top' }, [b.right('MEM', 6), b.alignPort('d', 'MEM.rd')], { label: 'IR' });
  b.add('FIELDS', 'FIELDS', {}, [b.right('IR'), b.alignPort('ir', 'IR.q')], { label: 'FIELDS' });
  b.add('RF', 'REGFILE', {}, [b.x('MADDR') + 6, b.below('MEM', 6)], { label: 'REGISTERS' });
  b.add('AREG', 'REG', { width: 16 }, [b.right('RF'), b.alignPort('d', 'RF.da')], { label: 'A' });
  b.add('BREG', 'REG', { width: 16 }, [b.x('AREG'), b.below('AREG', 4)], { label: 'B' });
  b.add('AMUX', 'MUX', { width: 16, n: 2, names: ['PC', 'A'], selSide: 'top' }, [b.right('AREG', 5), b.alignPort('in1', 'AREG.q')], { label: 'ALU A' });
  b.add('BSRC', 'MUX', { width: 16, n: 3, names: ['B', 'imm', '1'], consts: { 2: 1 }, selWidth: 2, selSide: 'top' }, [b.x('AMUX'), b.below('AMUX', 4)], { label: 'ALU B' });
  b.add('ALU', 'ALU', {}, [b.right('AMUX', 5), b.alignPort('a', 'AMUX.y')], { label: 'ALU (shared)' });
  b.add('ALUOUT', 'REG', { width: 16, en: true, enSide: 'top' }, [b.right('ALU', 5), b.alignPort('d', 'ALU.y')], { label: 'ALUOUT' });
  b.add('WBMUX', 'MUX', { width: 16, n: 4, names: ['ALUOUT', 'MDR', 'PC', 'CSR'], selSide: 'top' }, [b.right('ALUOUT', 5), b.alignPort('in0', 'ALUOUT.q')], { label: 'WRITE BACK' });
  b.add('FMUX', 'MUX', { width: 4, n: 2, names: ['ALU', 'ESTAT'], selSide: 'top' }, [b.x('ALU'), b.below('BSRC', 5)], { label: 'FLAG SRC' });
  b.add('FLAGS', 'REG', { width: 4, en: true, enSide: 'top', flags: true }, [b.right('FMUX', 5), b.alignPort('d', 'FMUX.y')], { label: 'FLAGS' });

  // ---- data side below the datapath ---------------------------------------
  const yLow = Math.max(b.below('FLAGS', 6), b.below('BREG', 6));
  b.add('ADEC', 'ADEC', { re: true }, [b.x('MADDR'), yLow], { label: 'ADDR DECODE' });
  b.add('IO', 'IODEV', {}, [b.right('ADEC', 5), yLow], { label: 'I/O' });
  b.add('TIMER', 'TIMER', {}, [b.right('IO', 5), yLow], { label: 'TIMER' });
  b.add('RDMUX', 'MUX', { width: 16, n: 3, names: ['RAM', 'I/O', 'TIMER'], selWidth: 2, selSide: 'top' }, [b.right('TIMER', 5), yLow], { label: 'READ SEL' });
  b.add('RDY', 'MUX', { width: 1, n: 4, names: ['RAM', 'I/O', 'TIMER', '-'], consts: { 1: 1, 2: 1, 3: 1 }, selSide: 'top' }, [b.right('RDMUX', 5), yLow], { label: 'READY SEL' });
  b.add('MDR', 'REG', { width: 16, en: true, enSide: 'top' }, [b.right('RDY', 5), yLow], { label: 'MDR' });

  // ---- controller on top -------------------------------------------------
  const order = ['pcSel', 'pcWrite', 'maSel', 'memReq', 'memWrite', 'irWrite', 'regWrite', 'wbSel', 'aSel', 'bSel', 'aluOp', 'outWrite',
    'flagWrite', 'flagSrc', 'mdrWrite', 'csrWrite', 'ei', 'di', 'reti', 'halt', 'trap'];
  b.add('MC', 'MCCTRL', { profile: meta.profile }, [b.x('MEM'), b.above('IR', 15)], { label: 'CONTROL (state machine)', order: { bottom: order } });
  b.add('STATE', 'REG', { width: 3 }, [b.right('MC', 5), b.alignPort('d', 'MC.next')], { label: 'STATE' });
  b.add('HALT', 'HALTFF', { clr: true }, [b.leftOf('MC', 5), b.y('MC')], { label: 'HALT' });
  // Trap logic and CSRs on the top right, near the controller and the write-back side.
  b.add('TRAP', 'TRAP', { priv: false }, [b.right('STATE', 6), b.y('MC')], { label: 'TRAP' });
  b.add('CSR', 'CSRFILE', { priv: false }, [b.right('FIELDS', 5), b.below('TRAP', 6)], { label: 'CSR', sides: { flags: 'bottom' } });

  const C = (from, ...to) => b.connect(from, ...to);
  C('STATE.q', 'MC.state');
  C('MC.next', 'STATE.d');
  C('PCMUX.y', 'PC.d');
  C('PC.q', 'MADDR.in0', 'AMUX.in0', 'WBMUX.in2', 'TRAP.pc');
  C('MADDR.y', 'MEM.addr', 'ADEC.addr', 'IO.addr', 'TIMER.addr');
  C('MEM.rd', 'IR.d', 'RDMUX.in0');
  C('MEM.ready', 'RDY.in0');
  C('IR.q', 'MC.ir', 'FIELDS.ir');
  C('FIELDS.ra', 'RF.ra');
  C('FIELDS.rb', 'RF.rb');
  C('FIELDS.rd', 'RF.wa');
  C('FIELDS.imm', 'BSRC.in1', 'CSR.num');
  C('RF.da', 'AREG.d');
  C('RF.db', 'BREG.d');
  C('AREG.q', 'AMUX.in1', 'CSR.wd');
  C('BREG.q', 'BSRC.in0', 'MEM.wd', 'IO.wd', 'TIMER.wd');
  C('AMUX.y', 'ALU.a');
  C('BSRC.y', 'ALU.b');
  C('ALU.y', 'ALUOUT.d', 'PCMUX.in0');
  C('ALU.flags', 'FMUX.in0');
  C('FMUX.y', 'FLAGS.d');
  C('FLAGS.q', 'MC.flags', 'CSR.flags');
  C('ALUOUT.q', 'WBMUX.in0', 'MADDR.in1', 'PCMUX.in1');
  C('ADEC.ramReq', 'MEM.req');
  C('ADEC.ramWe', 'MEM.we');
  C('ADEC.ioWe', 'IO.we');
  C('ADEC.tmWe', 'TIMER.we');
  C('ADEC.sel', 'RDMUX.sel', 'RDY.sel');
  C('IO.rd', 'RDMUX.in1');
  C('TIMER.rd', 'RDMUX.in2');
  C('RDMUX.y', 'MDR.d');
  C('RDY.y', 'MC.ready');
  C('MDR.q', 'WBMUX.in1');
  C('WBMUX.y', 'RF.wd');
  C('CSR.rd', 'WBMUX.in3');
  C('CSR.epc', 'PCMUX.in2');
  C('CSR.eflags', 'FMUX.in1');
  C('CSR.ie', 'TRAP.ie');
  C('TIMER.irq', 'TRAP.irq');
  C('TRAP.take', 'MC.irq');
  C('TRAP.cause', 'CSR.cause');
  C('TRAP.epc', 'CSR.epcIn');
  C('HALT.q', 'MC.halted', 'TRAP.halted');

  C('MC.pcSel', 'PCMUX.sel');
  C('MC.pcWrite', 'PC.en');
  C('MC.maSel', 'MADDR.sel');
  C('MC.memReq', 'ADEC.re');
  C('MC.memWrite', 'ADEC.we');
  C('MC.irWrite', 'IR.en');
  C('MC.mdrWrite', 'MDR.en');
  C('MC.regWrite', 'RF.we');
  C('MC.wbSel', 'WBMUX.sel');
  C('MC.aSel', 'AMUX.sel');
  C('MC.bSel', 'BSRC.sel');
  C('MC.aluOp', 'ALU.op');
  C('MC.outWrite', 'ALUOUT.en');
  C('MC.flagWrite', 'FLAGS.en');
  C('MC.flagSrc', 'FMUX.sel');
  C('MC.csrWrite', 'CSR.we');
  C('MC.ei', 'CSR.ei');
  C('MC.di', 'CSR.di');
  C('MC.reti', 'CSR.reti');
  C('MC.halt', 'HALT.set');
  C('MC.trap', 'CSR.take', 'HALT.clr');

  const circuit = b.build();
  circuit.hooks = {
    beforeClock(sim, info) {
      const state = sim.state('STATE').value, next = sim.output('MC', 'next');
      info.state = MC_STATES[state];
      info.trap = sim.output('MC', 'trap') ? sim.output('TRAP', 'cause') : 0;
      if (state === 0 && next === 1) sim.meta.current = sim.state('PC').value;
      info.pc = sim.meta.current;
      info.retired = state !== 0 && next === 0 ? 1 : 0;
    },
  };
  circuit.inspect = sim => {
    const csr = { ...sim.state('CSR') };
    const state = MC_STATES[sim.state('STATE').value];
    return {
      pc: sim.state('PC').value,
      regs: [...sim.state('RF').regs],
      flags: sim.state('FLAGS').value,
      halted: !!sim.state('HALT').value && state === 'FETCH',
      mem: [...sim.state('MEM').words],
      led: sim.state('IO').led,
      csr, ie: !!(csr.status & 1), timer: { ...sim.state('TIMER') },
      atBoundary: state === 'FETCH',
      // In FETCH the instruction at PC is being read; afterwards PC has moved on.
      stages: [{ name: state, pc: state === 'FETCH' ? sim.state('PC').value : sim.meta.current }],
    };
  };
  return circuit;
}
