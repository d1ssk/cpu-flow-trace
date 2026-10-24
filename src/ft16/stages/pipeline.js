/* Pipelined FT16 implementations.
 *
 * 5 stages: IF | ID | EX | MEM | WB. Results are forwarded from EX/MEM and
 * MEM/WB; a load (or CSRR) followed by a use stalls once. Branches, JAL and
 * JALR resolve in EX by comparing the actual next PC with the predicted
 * one. HALT, RETI and serialising instructions redirect from MEM, which is
 * also where traps are taken (stage 9), so exceptions are precise: flags
 * are written at the end of EX unless MEM redirects in the same cycle,
 * memory in MEM, registers in WB.
 *
 * Without caches (stage 6b) one memory serves both IF and MEM. With one
 * port (the default) a data access takes the port and IF waits: a
 * structural hazard. Stage 7 puts split instruction / data caches in front
 * of one main memory instead. */

import { CircuitBuilder } from '../sim/builder.js';
import { bundleWidth, bundlesFor } from '../sim/modules-pipeline.js';

const bottomSides = names => Object.fromEntries(names.map(n => [n, 'bottom']));

export function buildPipeline5(meta) {
  const f = meta.features;
  const sys = !!f.sys, cache = !!f.cache;
  const B = bundlesFor(sys);
  const b = new CircuitBuilder({ ...meta, family: 'pipeline', depth: 5 });
  const wM = bundleWidth(B.m), wEx = bundleWidth(B.ex);

  const FD = [['v', 1], ['pc1', 16], ['pn', 16], ['ir', 16], ...(sys ? [['iexc', 3]] : [])];
  const DE = [['v', 1], ['pc1', 16], ['pn', 16], ['a', 16], ['b', 16], ['imm', 16], ['ra', 3], ['rb', 3], ['rd', 3], ['ex', wEx], ['m', wM], ['wb', 3], ...(sys ? [['exc', 3]] : [])];
  const EM = [['v', 1], ['pc1', 16], ['alu', 16], ['addr', 16], ['data', 16], ['rd', 3], ['m', wM], ['wb', 3], ...(sys ? [['a', 16], ['imm', 16], ['npc', 16], ['exc', 3]] : [])];
  const MW = [['v', 1], ['pc1', 16], ['val', 16], ['rd', 3], ['we', 1]];

  // Placement: the pipeline turns at EX/MEM. IF, ID and EX run left to
  // right on the top row, each stage a column (main path on top, helpers
  // below); MEM and WB run right to left on the bottom row (mirrored
  // modules), so the write-back lands under the register file and the
  // drawing is not one long band. Pipeline registers get wide channels; a
  // corridor between the rows carries the backward wires (forwarding,
  // write-back, redirects). Flow control and the hazard and forwarding units
  // sit at the left of the bottom row, the memories on a row of their own.
  const P = 10, G = 5, CORRIDOR = 8;
  const rightOf = (...ids) => Math.max(...ids.filter(id => b.byId.has(id)).map(id => b.right(id, 0)));
  const leftOf = (...ids) => Math.min(...ids.filter(id => b.byId.has(id)).map(id => b.x(id)));
  const bottomOf = (...ids) => Math.max(...ids.filter(id => b.byId.has(id)).map(id => b.below(id, 0)));
  const mirror = true;

  // ---- IF ------------------------------------------------------------------
  b.add('PCMUX', 'MUX', { width: 16, n: 3, names: ['predicted', 'EX fix', 'MEM fix'], selSide: 'top' }, [0, 0], { label: 'NEXT PC' });
  b.add('PC', 'REG', { width: 16, en: true, enSide: 'top' }, [b.right('PCMUX'), b.alignPort('d', 'PCMUX.y')], { label: 'PC' });
  let fetch = 'PC.q';
  if (sys) { b.add('ITLB', 'TLB', { kind: 'I', defaults: { req: 1 }, excOut: true, wSide: 'bottom' }, [b.right('PC', G), b.alignPort('va', 'PC.q')], { label: 'I-TLB' }); fetch = 'ITLB.pa'; }
  const fetchMod = fetch.split('.')[0];
  if (cache) {
    // The I-cache stacks under (or beside) the address it looks up.
    if (sys) b.add('IAS', 'ASPLIT', {}, [b.x('ITLB'), b.below('ITLB', G)], { label: 'SPLIT' });
    else b.add('IAS', 'ASPLIT', {}, [b.right('PC', G), b.alignPort('addr', 'PC.q')], { label: 'SPLIT' });
    b.add('ICA', 'CARRAY', { kind: 'I', profile: meta.profile }, [b.right('IAS', G), b.alignPort('index', 'IAS.index')], { label: 'I-CACHE' });
    b.add('IHIT', 'CHIT', {}, [b.x('ICA'), b.below('ICA', G)], { label: 'TAG =' });
    b.add('ICC', 'CCTRL', { kind: 'I', defaults: { req: 1 } }, [b.x('ICA'), b.below('IHIT', G)], { label: 'I-CACHE CTRL' });
  }
  b.add('PCINC', 'INC', { width: 16 }, [b.x('PC'), b.below(sys ? 'ITLB' : 'PC', G)], { label: 'PC+1' });
  b.add('BTB', 'BTB', { wait: cache }, [b.x('PCMUX'), b.below('PCINC', G)], { label: 'BTB' });

  b.add('FD', 'PIPEREG', { fields: FD, consts: { v: 1 }, stageName: 'IF/ID', profile: meta.profile }, [rightOf('IHIT', 'ICA', 'ICC', 'BTB', fetchMod) + P, 0], { label: 'IF/ID' });

  // ---- ID ------------------------------------------------------------------
  b.add('DEC', 'PCTRL', { profile: meta.profile, bundles: B, sys, priv: sys }, [b.right('FD', P), 0], { label: 'DECODE' });
  b.add('FIELDS', 'FIELDS', {}, [b.x('DEC'), b.below('DEC', G)], { label: 'FIELDS' });
  b.add('RF', 'REGFILE', { bypass: true }, [b.x('DEC'), b.below('FIELDS', G)], { label: 'REGISTERS', sides: bottomSides(['we', 'wa', 'wd']) });
  // Outputs ordered by where they go: control to the top, the PC values to
  // the branch units further down.
  const deOrder = ['ex', 'v', 'a', 'b', 'imm', 'ra', 'rb', 'rd', 'm', 'wb', 'exc', 'pn', 'pc1'];
  b.add('DE', 'PIPEREG', { fields: DE, stageName: 'ID/EX' }, [rightOf('DEC', 'FIELDS', 'RF') + P, 0], { label: 'ID/EX', order: { right: deOrder } });

  // ---- EX ------------------------------------------------------------------
  b.add('UEX', 'UNPACK', { fields: B.ex }, [b.right('DE', P), 0], { label: 'EX CTRL' });
  b.add('FAMUX', 'MUX', { width: 16, n: 3, names: ['reg', 'EX/MEM', 'MEM/WB'], selWidth: 2, selSide: 'top' }, [b.right('UEX', G + (sys ? 5 : 3)), 0], { label: 'FWD A' });
  b.add('FBMUX', 'MUX', { width: 16, n: 3, names: ['reg', 'EX/MEM', 'MEM/WB'], selWidth: 2, selSide: 'top' }, [b.x('FAMUX'), b.below('FAMUX', G)], { label: 'FWD B' });
  b.add('FLCTL', 'FLAGCTL', { restore: sys }, [b.x('FAMUX'), b.below('FBMUX', G)], { label: 'FLAG CTRL' });
  b.add('BMUX', 'MUX', { width: 16, n: 2, names: ['b', 'imm'], selSide: 'top' }, [b.right('FAMUX', G), b.alignPort('in0', 'FBMUX.y')], { label: 'B SRC' });
  b.add('AGU', 'ADD', { width: 16, sign: 'a+imm', purpose: 'LD/ST の番地と JALR の行き先 (rs1 + 即値) を計算します。' }, [b.x('BMUX'), b.below('BMUX', G)], { label: 'ADDR' });
  b.add('BADD', 'ADD', { width: 16, sign: '+off', purpose: '分岐・JAL の行き先 PC+1 + オフセット を計算します。' }, [b.x('AGU'), b.below('AGU', G)], { label: 'TARGET' });
  b.add('ALU', 'ALU', {}, [b.right('BMUX', G), b.alignPort('b', 'BMUX.y')], { label: 'ALU' });
  b.add('EXMUX', 'MUX', { width: 16, n: 2, names: ['ALU', 'PC+1'], selSide: 'top' }, [b.right('ALU', G), b.alignPort('in0', 'ALU.y')], { label: 'EX RESULT' });
  b.add('BRU', 'BRU', {}, [b.x('ALU'), b.below('ALU', G)], { label: 'BRANCH' });
  b.add('FLAGS', 'REG', { width: 4, en: true, enSide: 'top', flags: true }, [b.x('ALU'), b.below('BRU', G)], { label: 'FLAGS' });
  if (sys) b.add('FMUX', 'MUX', { width: 4, n: 2, names: ['ALU', 'ESTAT'], selSide: 'top' }, [b.leftOf('FLAGS', G), b.alignPort('y', 'FLAGS.d')], { label: 'FLAG SRC' });
  // EX/MEM turns the pipeline: inputs from EX on the left, outputs down to
  // the MEM stage below, ordered right to left along the bottom row.
  const emOrder = ['pc1', 'rd', 'v', 'alu', 'npc', 'exc', 'a', 'imm', 'data', 'addr', 'wb', 'm'];
  b.add('EM', 'PIPEREG', { fields: EM, stageName: 'EX/MEM' }, [rightOf('EXMUX', 'BRU', 'FLAGS') + P, 0], {
    label: 'EX/MEM', sides: Object.fromEntries(EM.map(([n]) => [n, 'bottom'])), order: { bottom: emOrder },
  });

  // ---- MEM (bottom row, right to left) ------------------------------------
  const yB = bottomOf(...b.modules.map(m => m.id)) + CORRIDOR;
  b.add('UM', 'UNPACK', { fields: B.m }, [b.alignRight('EM'), yB], { label: 'MEM CTRL', mirror });
  b.add('UWB', 'UNPACK', { fields: B.wb }, [b.alignRight('UM'), b.below('UM', G)], { label: 'WB CTRL', mirror });
  let daddr = 'EM.addr';
  if (sys) {
    b.add('GATE', 'GATE', { signals: [['memWrite', 1], ['memRead', 1], ['halt', 1]] }, [b.alignRight('UM'), b.below('UWB', G)], { label: 'GATE', mirror });
    b.add('DTLB', 'TLB', { kind: 'D', defaults: { req: 1 }, wSide: 'bottom' }, [b.leftOf('UM', G + 5), yB], { label: 'D-TLB', mirror });
    daddr = 'DTLB.pa';
  }
  b.add('ADEC', 'ADEC', { re: true, ramWe: !cache }, [b.leftOf(sys ? 'DTLB' : 'UM', sys ? G : G + 3), yB], { label: 'ADDR DECODE', mirror });
  if (cache) {
    b.add('DAS', 'ASPLIT', {}, [b.alignRight('ADEC'), b.below('ADEC', G)], { label: 'SPLIT', mirror });
    b.add('DCA', 'CARRAY', { kind: 'D' }, [b.leftOf('DAS', G), b.alignPort('index', 'DAS.index')], { label: 'D-CACHE', mirror });
    b.add('DHIT', 'CHIT', {}, [b.alignRight('DCA'), b.below('DCA', G)], { label: 'TAG =', mirror });
    b.add('DCC', 'CCTRL', { kind: 'D' }, [b.alignRight('DCA'), b.below('DHIT', G)], { label: 'D-CACHE CTRL', mirror });
  }
  const yIo = cache ? bottomOf('DCC', 'DAS') + G + b.extra : b.below('ADEC', G);
  b.add('IO', 'IODEV', {}, [b.alignRight(cache ? 'DAS' : 'ADEC'), yIo], { label: 'I/O', mirror });
  b.add('TIMER', 'TIMER', {}, [b.leftOf('IO', G), yIo], { label: 'TIMER', mirror });
  const xRd = leftOf('ADEC', 'DCA', 'DHIT', 'DCC', 'TIMER') - G - b.extra;
  b.add('RDMUX', 'MUX', { width: 16, n: 3, names: ['RAM', 'I/O', 'TIMER'], selWidth: 2, selSide: 'top' }, [spec => xRd - spec.gw, yB], { label: 'READ SEL', mirror });
  b.add('RESMUX', 'MUX', { width: 16, n: 4, names: ['EX', 'MEM', 'EX', 'CSR'], consts: sys ? undefined : { 3: 0 }, selWidth: 2, selSide: 'top' }, [b.leftOf('RDMUX', G), yB], { label: 'RESULT', mirror });
  b.add('MRED', 'MREDIR', { sys, mFields: B.m }, [b.alignRight('RDMUX'), b.below('RESMUX', G)], { label: 'MEM REDIRECT', mirror });
  if (sys) {
    b.add('TRAP', 'PTRAP', {}, [b.alignRight('MRED'), b.below('MRED', G)], { label: 'TRAP', mirror });
    b.add('CSR', 'CSRFILE', { priv: true }, [b.alignRight('MRED'), b.below('TRAP', G)], { label: 'CSR', mirror });
  }
  b.add('MW', 'PIPEREG', { fields: MW, stageName: 'MEM/WB', defaults: { en: 1, clr: 0 } }, [spec => leftOf('RESMUX', 'MRED', 'TRAP', 'CSR') - P - b.extra - spec.gw, yB], { label: 'MEM/WB', mirror });

  // ---- bottom row, left: flow control, hazard and forwarding units --------
  b.add('CONFIG', 'CONFIG', { mode: 2 }, [0, yB], { label: 'HAZARD MODE' });
  b.add('HALT', 'HALTFF', { clr: sys }, [0, b.below('CONFIG', G)], { label: 'HALT' });
  b.add('NPC', 'NPC', { depth: 5, fwait: true, mwait: cache, cache }, [b.right('CONFIG', G), yB], { label: 'FLOW CTRL' });
  b.add('HAZ', 'HAZARD', { depth: 5, mFields: B.m }, [b.right('NPC', P + 2), yB], { label: 'HAZARD' });
  b.add('FWD', 'FWD', { depth: 5 }, [b.right('HAZ', G + 3), yB], { label: 'FORWARD' });

  // ---- memories: one row under the flow control --------------------------
  const yM = bottomOf('CONFIG', 'HALT', 'NPC', 'HAZ', 'FWD', 'MW') + CORRIDOR;
  if (cache) {
    b.add('ARB', 'ARB', {}, [b.x('HAZ'), yM], { label: 'BUS ARBITER' });
    b.add('MAIN', 'MAINMEM', { latency: 4 }, [b.right('ARB', G), yM], { label: 'MAIN MEMORY (4 clocks)' });
  } else {
    b.add('MEM', 'MEMORY', { data: true, arbitrated: true, profile: meta.profile }, [b.x('HAZ'), yM], {
      label: 'MEMORY', sides: { daddr: 'right', wd: 'right', rd: 'right', we: 'top', dreq: 'top' }, order: { right: ['idata', 'iwait', 'rd', 'daddr', 'wd'] },
    });
  }

  // ---- connections ---------------------------------------------------------
  const C = (from, ...to) => b.connect(from, ...to);
  C('CONFIG.mode', 'HAZ.mode', 'FWD.mode', 'BTB.mode');
  C('PCMUX.y', 'PC.d');
  C('PC.q', ...(sys ? ['ITLB.va'] : cache ? [] : ['MEM.iaddr']), 'PCINC.a', 'BTB.pc', ...(sys ? ['TRAP.pc'] : []));
  if (sys && !cache) C('ITLB.pa', 'MEM.iaddr');
  C('PCINC.y', 'FD.d_pc1', 'BTB.pc1');
  C('BTB.pn', 'PCMUX.in0', 'FD.d_pn');
  if (!cache) { C('MEM.idata', 'FD.d_ir'); C('MEM.iwait', 'NPC.fwait'); }
  C('NPC.sel', 'PCMUX.sel');
  C('NPC.pcEn', 'PC.en');
  C('NPC.fdEn', 'FD.en');
  C('NPC.fdClr', 'FD.clr');
  C('NPC.deEn', 'DE.en');
  C('NPC.deClr', 'DE.clr');
  C('NPC.emEn', 'EM.en');
  C('NPC.emClr', 'EM.clr');
  C('HALT.q', 'NPC.halted', ...(sys ? ['TRAP.halted'] : []));

  C('FD.v', 'DEC.v', 'DE.d_v');
  C('FD.pc1', 'DE.d_pc1');
  C('FD.pn', 'DE.d_pn');
  C('FD.ir', 'DEC.ir', 'FIELDS.ir');
  C('FIELDS.ra', 'RF.ra', 'DE.d_ra', 'HAZ.ra');
  C('FIELDS.rb', 'RF.rb', 'DE.d_rb', 'HAZ.rb');
  C('FIELDS.rd', 'DE.d_rd');
  C('FIELDS.imm', 'DE.d_imm');
  C('RF.da', 'DE.d_a');
  C('RF.db', 'DE.d_b');
  C('DEC.ex', 'DE.d_ex');
  C('DEC.m', 'DE.d_m');
  C('DEC.wb', 'DE.d_wb');
  C('DEC.useA', 'HAZ.useA');
  C('DEC.useB', 'HAZ.useB');
  C('DEC.ctl', 'HAZ.ctl');
  C('HAZ.stall', 'NPC.stall');
  C('HAZ.hold', 'NPC.hold');

  C('DE.v', 'EM.d_v');
  C('DE.pc1', 'EM.d_pc1', 'BRU.pc1', 'BTB.upc1', 'BADD.a', 'EXMUX.in1');
  C('DE.pn', 'BRU.pn');
  C('DE.a', 'FAMUX.in0');
  C('DE.b', 'FBMUX.in0');
  C('DE.imm', 'BMUX.in1', 'AGU.b', 'BADD.b', ...(sys ? ['EM.d_imm'] : []));
  C('DE.ra', 'FWD.ra');
  C('DE.rb', 'FWD.rb');
  C('DE.rd', 'EM.d_rd', 'HAZ.deRd');
  C('DE.ex', 'UEX.bus');
  C('DE.m', 'EM.d_m', 'HAZ.deM');
  C('DE.wb', 'EM.d_wb', 'HAZ.deWb');
  C('UEX.aluOp', 'ALU.op');
  C('UEX.aluSrc', 'BMUX.sel');
  C('UEX.flagWrite', 'FLCTL.exWrite');
  C('UEX.br', 'BRU.br');
  C('UEX.jal', 'BRU.jal');
  C('UEX.jalr', 'BRU.jalr');
  C('UEX.cond', 'BRU.cond');
  C('UEX.link', 'EXMUX.sel');
  C('FWD.selA', 'FAMUX.sel');
  C('FWD.selB', 'FBMUX.sel');
  C('FAMUX.y', 'ALU.a', 'AGU.a', ...(sys ? ['EM.d_a'] : []));
  C('FBMUX.y', 'BMUX.in0', 'EM.d_data');
  C('BMUX.y', 'ALU.b');
  C('ALU.y', 'EXMUX.in0');
  C('EXMUX.y', 'EM.d_alu');
  C('ALU.flags', sys ? 'FMUX.in0' : 'FLAGS.d');
  C('AGU.y', 'EM.d_addr', 'BRU.jtarget');
  C('BADD.y', 'BRU.target');
  C('FLCTL.en', 'FLAGS.en');
  C('FLAGS.q', 'BRU.flags', ...(sys ? ['CSR.flags'] : []));
  C('BRU.redirect', 'NPC.exRedir');
  C('BRU.npc', 'PCMUX.in1', 'BTB.target', ...(sys ? ['EM.d_npc'] : []));
  C('BRU.taken', 'BTB.taken');
  C('BRU.isBr', 'BTB.upd');

  C('EM.v', 'MW.d_v', ...(sys ? ['TRAP.v'] : []));
  C('EM.pc1', 'MW.d_pc1', 'MRED.pc1', ...(sys ? ['TRAP.pc1'] : []));
  C('EM.alu', 'RESMUX.in0', 'RESMUX.in2', 'FAMUX.in1', 'FBMUX.in1');
  C('EM.addr', sys ? 'DTLB.va' : 'ADEC.addr', ...(sys ? ['TRAP.dva'] : []));
  C('EM.data', 'IO.wd', 'TIMER.wd', ...(cache ? [] : ['MEM.wd']), ...(sys ? ['DTLB.wb', 'ITLB.wb'] : []));
  C('EM.rd', 'MW.d_rd', 'FWD.emRd', 'HAZ.emRd');
  C('EM.m', 'UM.bus', 'MRED.m', ...(sys ? ['TRAP.m'] : []));
  C('EM.wb', 'UWB.bus', 'FWD.emWb', 'HAZ.emWb');
  C('UWB.wbSel', 'RESMUX.sel');
  C('UWB.regWrite', 'MW.d_we');
  const physical = sys ? 'DTLB.pa' : 'EM.addr';
  if (sys) C(physical, 'ADEC.addr');
  C(physical, 'IO.addr', 'TIMER.addr', ...(cache ? [] : ['MEM.daddr']));
  C('ADEC.ioWe', 'IO.we');
  C('ADEC.tmWe', 'TIMER.we');
  C('ADEC.sel', 'RDMUX.sel');
  if (!cache) { C('ADEC.ramWe', 'MEM.we'); C('ADEC.ramReq', 'MEM.dreq'); C('MEM.rd', 'RDMUX.in0'); }
  C('IO.rd', 'RDMUX.in1');
  C('TIMER.rd', 'RDMUX.in2');
  C('RDMUX.y', 'RESMUX.in1');
  C('RESMUX.y', 'MW.d_val');
  C('MRED.redirect', 'NPC.memRedir', 'FLCTL.kill');
  C('MRED.target', 'PCMUX.in2');
  if (sys) {
    // Memory and HALT effects are cancelled when the MEM instruction faults.
    C('UM.memWrite', 'GATE.i_memWrite', 'DTLB.write');
    C('UM.memRead', 'GATE.i_memRead');
    C('UM.halt', 'GATE.i_halt');
    C('GATE.memWrite', 'ADEC.we', 'DCC.write');
    C('GATE.memRead', 'ADEC.re');
    C('GATE.halt', 'HALT.set');
  } else {
    C('UM.memWrite', 'ADEC.we', ...(cache ? ['DCC.write'] : []));
    C('UM.memRead', 'ADEC.re');
    C('UM.halt', 'HALT.set');
  }
  if (cache) { C('UM.fence', 'ICA.inval'); C('NPC.mwEn', 'MW.en'); }

  C('MW.rd', 'RF.wa', 'FWD.mwRd');
  C('MW.val', 'RF.wd', 'FAMUX.in2', 'FBMUX.in2');
  C('MW.we', 'RF.we', 'FWD.mwWe');

  if (sys) connectSystem(b);
  if (cache) connectCaches(b, { sys });

  const circuit = b.build();
  circuit.hooks = { beforeClock: pipelineBeforeClock };
  circuit.inspect = sim => pipelineState(sim, { sys, stages: [['IF', null], ['ID', 'FD'], ['EX', 'DE'], ['MEM', 'EM'], ['WB', 'MW']] });
  return circuit;
}

/* Trap, CSR and TLB wiring for the integrated pipeline (stage 9). */
function connectSystem(b) {
  const C = (from, ...to) => b.connect(from, ...to);
  C('ITLB.exc', 'FD.d_iexc');
  C('FD.iexc', 'DEC.iexc');
  C('DEC.exc', 'DE.d_exc');
  C('DE.exc', 'EM.d_exc');
  C('EM.exc', 'TRAP.exc');
  C('EM.npc', 'TRAP.npc');
  C('EM.a', 'ITLB.wa', 'DTLB.wa', 'CSR.wd');
  C('EM.imm', 'CSR.num');
  C('UM.reti', 'CSR.reti');
  C('UM.ei', 'CSR.ei');
  C('UM.di', 'CSR.di');
  C('UM.csrWrite', 'CSR.we');
  C('UM.tlbWrite', 'ITLB.we', 'DTLB.we');
  C('UM.flagSrc', 'FMUX.sel', 'FLCTL.restore');
  C('CSR.rd', 'RESMUX.in3');
  C('CSR.kernel', 'ITLB.kernel', 'DTLB.kernel', 'DEC.kernel');
  C('CSR.ie', 'TRAP.ie');
  C('CSR.epc', 'MRED.epc');
  C('CSR.eflags', 'FMUX.in1');
  C('FMUX.y', 'FLAGS.d');
  C('TIMER.irq', 'TRAP.irq');
  C('DTLB.miss', 'TRAP.dtlbMiss');
  C('DTLB.fault', 'TRAP.wfault');
  C('TRAP.take', 'CSR.take', 'MRED.trap', 'HALT.clr');
  C('TRAP.fault', 'GATE.kill', 'MW.clr');
  C('TRAP.cause', 'CSR.cause');
  C('TRAP.epc', 'CSR.epcIn');
  C('TRAP.badva', 'CSR.badva');
}

/* Stages 7 and 9: caches and the shared main memory replace the memory. */
function connectCaches(b, { sys }) {
  const C = (from, ...to) => b.connect(from, ...to);
  const fetch = sys ? 'ITLB.pa' : 'PC.q';
  C(fetch, 'IAS.addr', 'ARB.iAddr');
  C('IAS.index', 'ICA.index');
  C('IAS.offset', 'ICA.offset');
  C('IAS.tag', 'IHIT.tag', 'ICA.ftag');
  C('ICA.tag', 'IHIT.ctag');
  C('ICA.valid', 'IHIT.valid');
  C('ICA.data', 'FD.d_ir');
  C('IHIT.hit', 'ICC.hit');
  C('ICC.memReq', 'ARB.iReq');
  C('ICC.fill', 'ICA.fill');
  C('ICC.wait', 'NPC.fwait');
  C('ARB.iReady', 'ICC.ready');

  const addr = sys ? 'DTLB.pa' : 'EM.addr';
  C(addr, 'DAS.addr', 'ARB.dAddr');
  C('DAS.index', 'DCA.index');
  C('DAS.offset', 'DCA.offset');
  C('DAS.tag', 'DHIT.tag', 'DCA.ftag');
  C('DCA.tag', 'DHIT.ctag');
  C('DCA.valid', 'DHIT.valid');
  C('DCA.data', 'RDMUX.in0');
  C('DHIT.hit', 'DCC.hit');
  C('ADEC.ramReq', 'DCC.req');
  C('DCC.memReq', 'ARB.dReq');
  C('DCC.memWe', 'ARB.dWe');
  C('DCC.fill', 'DCA.fill');
  C('DCC.upd', 'DCA.upd');
  C('DCC.wait', 'NPC.mwait', 'BTB.hold', ...(sys ? ['TRAP.wait'] : []));
  C('ARB.dReady', 'DCC.ready');
  C('EM.data', 'ARB.dWd', 'DCA.wd');
  C('MAIN.line', 'ICA.fline', 'DCA.fline');
  C('ARB.req', 'MAIN.req');
  C('ARB.addr', 'MAIN.addr');
  C('ARB.we', 'MAIN.we');
  C('ARB.wd', 'MAIN.wd');
  C('MAIN.ready', 'ARB.ready');
}

export function pipelineBeforeClock(sim, info) {
  const last = sim.modules.has('MW') ? 'MW' : 'XM';
  const s = sim.state(last).values;
  info.retired = s.v && (last === 'XM' || sim.input('MW', 'en')) ? 1 : 0;
  info.pc = s.v ? (s.pc1 - 1) & 0xFFFF : null;
  if (sim.modules.has('TRAP')) info.trap = sim.output('TRAP', 'take') ? sim.output('TRAP', 'cause') : 0;
  const n = sim.module('NPC');
  const fetchWait = n.in.fwait && !n.in.mwait && n.out.fdClr && !n.in.exRedir && !n.in.memRedir;
  info.stall = sim.output('HAZ', 'stall') ? 'data' : n.out.fdClr && sim.output('HAZ', 'hold') ? 'control'
    : fetchWait ? (sim.modules.has('MEM') ? 'structural' : 'fetch') : null;
  info.flush = sim.output('BRU', 'redirect') || sim.output('MRED', 'redirect') ? 1 : 0;
}

export function pipelineState(sim, { sys, stages }) {
  const regs = stages.map(([name, id]) => {
    if (!id) return { name, pc: sim.state('PC').value, valid: !sim.state('HALT').value };
    const s = sim.state(id).values;
    return { name, pc: (s.pc1 - 1) & 0xFFFF, valid: !!s.v };
  });
  const csr = sys ? { ...sim.state('CSR') } : null;
  const drained = regs.slice(1).every(r => !r.valid);
  return {
    pc: sim.state('PC').value,
    regs: [...sim.state('RF').regs],
    flags: sim.state('FLAGS').value,
    halted: !!sim.state('HALT').value && drained,
    mem: [...sim.state(sim.modules.has('MEM') ? 'MEM' : 'MAIN').words],
    led: sim.state('IO').led,
    timer: { ...sim.state('TIMER') },
    ...(sys ? { csr, ie: !!(csr.status & 1), kernel: !!(csr.status & 2) } : {}),
    stages: regs,
  };
}
