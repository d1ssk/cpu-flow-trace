/* 3-stage pipeline (stage 6a): IF | DX (decode + register read + execute)
 * | MW (memory + write-back). A result is forwarded from MW to DX in the
 * same cycle, so loads need no stall, but that path — memory read, result
 * select, ALU — is long, so the clock cannot be as fast as with 5 stages.
 * One memory serves IF and MW; with one port they collide. */

import { CircuitBuilder } from '../sim/builder.js';
import { bundleWidth, bundlesFor } from '../sim/modules-pipeline.js';
import { pipelineBeforeClock, pipelineState } from './pipeline.js';

const bottomSides = names => Object.fromEntries(names.map(n => [n, 'bottom']));

export function buildPipeline3(meta) {
  const B = bundlesFor(false);
  const b = new CircuitBuilder({ ...meta, family: 'pipeline', depth: 3 });
  const wM = bundleWidth(B.m);
  const FD = [['v', 1], ['pc1', 16], ['pn', 16], ['ir', 16]];
  const XM = [['v', 1], ['pc1', 16], ['alu', 16], ['addr', 16], ['data', 16], ['rd', 3], ['m', wM], ['wb', 3]];

  // Placement as in the 5-stage pipeline: IF and DX on the top row, the
  // pipeline turning at DX/MW, MW on the bottom row right to left (mirrored
  // modules), flow control at the left of the bottom row, the memory below.
  const P = 10, G = 5, CORRIDOR = 8;
  const rightOf = (...ids) => Math.max(...ids.map(id => b.right(id, 0)));
  const bottomOf = (...ids) => Math.max(...ids.map(id => b.below(id, 0)));
  const mirror = true;

  // ---- IF ------------------------------------------------------------------
  b.add('PCMUX', 'MUX', { width: 16, n: 3, names: ['predicted', 'DX fix', 'MW fix'], selSide: 'top' }, [0, 0], { label: 'NEXT PC' });
  b.add('PC', 'REG', { width: 16, en: true, enSide: 'top' }, [b.right('PCMUX'), b.alignPort('d', 'PCMUX.y')], { label: 'PC' });
  b.add('PCINC', 'INC', { width: 16 }, [b.x('PC'), b.below('PC', G)], { label: 'PC+1' });
  b.add('BTB', 'BTB', {}, [b.x('PCMUX'), b.below('PCINC', G)], { label: 'BTB' });
  b.add('FD', 'PIPEREG', { fields: FD, consts: { v: 1 }, stageName: 'IF/DX', profile: meta.profile }, [rightOf('BTB', 'PC') + P, 0], { label: 'IF/DX' });

  // ---- DX ------------------------------------------------------------------
  b.add('DEC', 'PCTRL', { profile: meta.profile, bundles: B }, [b.right('FD', P), 0], { label: 'DECODE' });
  b.add('FIELDS', 'FIELDS', {}, [b.x('DEC'), b.below('DEC', G)], { label: 'FIELDS' });
  b.add('RF', 'REGFILE', { bypass: false }, [b.x('DEC'), b.below('FIELDS', G)], { label: 'REGISTERS', sides: bottomSides(['we', 'wa', 'wd']) });
  b.add('UEX', 'UNPACK', { fields: B.ex }, [rightOf('DEC', 'FIELDS', 'RF') + G, 0], { label: 'DX CTRL' });
  b.add('FAMUX', 'MUX', { width: 16, n: 3, names: ['reg', '-', 'MW'], consts: { 1: 0 }, selWidth: 2, selSide: 'top' }, [b.right('UEX', G + 5), 0], { label: 'FWD A' });
  b.add('FBMUX', 'MUX', { width: 16, n: 3, names: ['reg', '-', 'MW'], consts: { 1: 0 }, selWidth: 2, selSide: 'top' }, [b.x('FAMUX'), b.below('FAMUX', G)], { label: 'FWD B' });
  b.add('FLCTL', 'FLAGCTL', {}, [b.x('FAMUX'), b.below('FBMUX', G)], { label: 'FLAG CTRL' });
  b.add('BMUX', 'MUX', { width: 16, n: 2, names: ['b', 'imm'], selSide: 'top' }, [b.right('FAMUX', G), b.alignPort('in0', 'FBMUX.y')], { label: 'B SRC' });
  b.add('AGU', 'ADD', { width: 16, sign: 'a+imm', purpose: 'LD/ST の番地と JALR の行き先 (rs1 + 即値) を計算します。' }, [b.x('BMUX'), b.below('BMUX', G)], { label: 'ADDR' });
  b.add('BADD', 'ADD', { width: 16, sign: '+off', purpose: '分岐・JAL の行き先 PC+1 + オフセット を計算します。' }, [b.x('AGU'), b.below('AGU', G)], { label: 'TARGET' });
  b.add('ALU', 'ALU', {}, [b.right('BMUX', G), b.alignPort('b', 'BMUX.y')], { label: 'ALU' });
  b.add('EXMUX', 'MUX', { width: 16, n: 2, names: ['ALU', 'PC+1'], selSide: 'top' }, [b.right('ALU', G), b.alignPort('in0', 'ALU.y')], { label: 'EX RESULT' });
  b.add('BRU', 'BRU', {}, [b.x('ALU'), b.below('ALU', G)], { label: 'BRANCH' });
  b.add('FLAGS', 'REG', { width: 4, en: true, enSide: 'top', flags: true }, [b.x('ALU'), b.below('BRU', G)], { label: 'FLAGS' });
  // DX/MW turns the pipeline: outputs go down to the MW stage below.
  const xmOrder = ['rd', 'pc1', 'alu', 'v', 'data', 'addr', 'wb', 'm'];
  b.add('XM', 'PIPEREG', { fields: XM, stageName: 'DX/MW' }, [rightOf('EXMUX', 'BRU', 'FLAGS') + P, 0], {
    label: 'DX/MW', sides: Object.fromEntries(XM.map(([n]) => [n, 'bottom'])), order: { bottom: xmOrder },
  });

  // ---- MW (bottom row, right to left) -------------------------------------
  const yB = bottomOf(...b.modules.map(m => m.id)) + CORRIDOR;
  b.add('UM', 'UNPACK', { fields: B.m }, [b.alignRight('XM'), yB], { label: 'MW CTRL', mirror });
  b.add('UWB', 'UNPACK', { fields: B.wb }, [b.alignRight('UM'), b.below('UM', G)], { label: 'WB CTRL', mirror });
  b.add('ADEC', 'ADEC', { re: true }, [b.leftOf('UM', G + 3), yB], { label: 'ADDR DECODE', mirror });
  b.add('IO', 'IODEV', {}, [b.alignRight('ADEC'), b.below('ADEC', G)], { label: 'I/O', mirror });
  b.add('TIMER', 'TIMER', {}, [b.leftOf('IO', G), b.y('IO')], { label: 'TIMER', mirror });
  const xRd = Math.min(b.x('ADEC'), b.x('TIMER')) - G - b.extra;
  b.add('RDMUX', 'MUX', { width: 16, n: 3, names: ['RAM', 'I/O', 'TIMER'], selWidth: 2, selSide: 'top' }, [spec => xRd - spec.gw, yB], { label: 'READ SEL', mirror });
  b.add('RESMUX', 'MUX', { width: 16, n: 4, names: ['EX', 'MEM', 'EX', '-'], consts: { 3: 0 }, selWidth: 2, selSide: 'top' }, [b.leftOf('RDMUX', G), yB], { label: 'RESULT', mirror });
  b.add('MRED', 'MREDIR', { mFields: B.m }, [b.alignRight('RDMUX'), b.below('RESMUX', G)], { label: 'MW REDIRECT', mirror });

  // ---- bottom row, left: flow control, hazard and forwarding units --------
  b.add('CONFIG', 'CONFIG', { mode: 2 }, [0, yB], { label: 'HAZARD MODE' });
  b.add('HALT', 'HALTFF', {}, [0, b.below('CONFIG', G)], { label: 'HALT' });
  b.add('NPC', 'NPC', { depth: 3, fwait: true }, [b.right('CONFIG', G), yB], { label: 'FLOW CTRL' });
  b.add('HAZ', 'HAZARD', { depth: 3, mFields: B.m }, [b.right('NPC', P), yB], { label: 'HAZARD' });
  b.add('FWD', 'FWD', { depth: 3 }, [b.right('HAZ', G + 3), yB], { label: 'FORWARD' });

  // ---- memory: a row under the flow control -------------------------------
  const yM = bottomOf('CONFIG', 'HALT', 'NPC', 'HAZ', 'FWD') + CORRIDOR;
  b.add('MEM', 'MEMORY', { data: true, arbitrated: true, profile: meta.profile }, [b.x('HAZ'), yM], {
    label: 'MEMORY', sides: { daddr: 'right', wd: 'right', rd: 'right', we: 'top', dreq: 'top' }, order: { right: ['idata', 'iwait', 'rd', 'daddr', 'wd'] },
  });

  const C = (from, ...to) => b.connect(from, ...to);
  C('CONFIG.mode', 'HAZ.mode', 'FWD.mode', 'BTB.mode');
  C('PCMUX.y', 'PC.d');
  C('PC.q', 'MEM.iaddr', 'PCINC.a', 'BTB.pc');
  C('PCINC.y', 'FD.d_pc1', 'BTB.pc1');
  C('BTB.pn', 'PCMUX.in0', 'FD.d_pn');
  C('MEM.idata', 'FD.d_ir');
  C('MEM.iwait', 'NPC.fwait');
  C('NPC.sel', 'PCMUX.sel');
  C('NPC.pcEn', 'PC.en');
  C('NPC.fdEn', 'FD.en');
  C('NPC.fdClr', 'FD.clr');
  C('NPC.deEn', 'XM.en');
  C('NPC.deClr', 'XM.clr');
  C('HALT.q', 'NPC.halted');

  C('FD.v', 'DEC.v', 'XM.d_v');
  C('FD.pc1', 'XM.d_pc1', 'BRU.pc1', 'BTB.upc1', 'BADD.a', 'EXMUX.in1');
  C('FD.pn', 'BRU.pn');
  C('FD.ir', 'DEC.ir', 'FIELDS.ir');
  C('FIELDS.ra', 'RF.ra', 'HAZ.ra', 'FWD.ra');
  C('FIELDS.rb', 'RF.rb', 'HAZ.rb', 'FWD.rb');
  C('FIELDS.rd', 'XM.d_rd');
  C('FIELDS.imm', 'BMUX.in1', 'AGU.b', 'BADD.b');
  C('RF.da', 'FAMUX.in0');
  C('RF.db', 'FBMUX.in0');
  C('DEC.ex', 'UEX.bus');
  C('DEC.m', 'XM.d_m');
  C('DEC.wb', 'XM.d_wb');
  C('DEC.useA', 'HAZ.useA');
  C('DEC.useB', 'HAZ.useB');
  C('DEC.ctl', 'HAZ.ctl');
  C('HAZ.stall', 'NPC.stall');
  C('HAZ.hold', 'NPC.hold');
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
  C('FAMUX.y', 'ALU.a', 'AGU.a');
  C('FBMUX.y', 'BMUX.in0', 'XM.d_data');
  C('BMUX.y', 'ALU.b');
  C('ALU.y', 'EXMUX.in0');
  C('EXMUX.y', 'XM.d_alu');
  C('ALU.flags', 'FLAGS.d');
  C('AGU.y', 'XM.d_addr', 'BRU.jtarget');
  C('BADD.y', 'BRU.target');
  C('FLCTL.en', 'FLAGS.en');
  C('FLAGS.q', 'BRU.flags');
  C('BRU.redirect', 'NPC.exRedir');
  C('BRU.npc', 'PCMUX.in1', 'BTB.target');
  C('BRU.taken', 'BTB.taken');
  C('BRU.isBr', 'BTB.upd');

  C('XM.pc1', 'MRED.pc1');
  C('XM.alu', 'RESMUX.in0', 'RESMUX.in2');
  C('XM.addr', 'ADEC.addr', 'IO.addr', 'TIMER.addr', 'MEM.daddr');
  C('XM.data', 'IO.wd', 'TIMER.wd', 'MEM.wd');
  C('XM.rd', 'RF.wa', 'FWD.mwRd', 'HAZ.deRd');
  C('XM.m', 'UM.bus', 'HAZ.deM', 'MRED.m');
  C('XM.wb', 'UWB.bus', 'HAZ.deWb');
  C('UWB.wbSel', 'RESMUX.sel');
  C('UWB.regWrite', 'RF.we', 'FWD.mwWe');
  C('UM.memWrite', 'ADEC.we');
  C('UM.memRead', 'ADEC.re');
  C('UM.halt', 'HALT.set');
  C('ADEC.ramWe', 'MEM.we');
  C('ADEC.ramReq', 'MEM.dreq');
  C('ADEC.ioWe', 'IO.we');
  C('ADEC.tmWe', 'TIMER.we');
  C('ADEC.sel', 'RDMUX.sel');
  C('MEM.rd', 'RDMUX.in0');
  C('IO.rd', 'RDMUX.in1');
  C('TIMER.rd', 'RDMUX.in2');
  C('RDMUX.y', 'RESMUX.in1');
  C('RESMUX.y', 'RF.wd', 'FAMUX.in2', 'FBMUX.in2');
  C('MRED.redirect', 'NPC.memRedir', 'FLCTL.kill');
  C('MRED.target', 'PCMUX.in2');

  const circuit = b.build();
  circuit.hooks = { beforeClock: pipelineBeforeClock };
  circuit.inspect = sim => pipelineState(sim, { sys: false, stages: [['IF', null], ['DX', 'FD'], ['MW', 'XM']] });
  return circuit;
}
