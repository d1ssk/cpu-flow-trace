/* Stage 0: the TD4 itself, drawn in the workbench style. The blocks and
 * their connections follow the main site's whole-CPU view
 * (src/circuits/td4/layout.js); the placement follows it too: INPUT, ROM,
 * C and DECODER on top, then MUX / NEXT PC, ALU / PC, A / OUT, B / OUTPUT.
 * Unlike the main site, the clock reaches every register at the same
 * instant here, as in all later stages. */

import { CircuitBuilder } from '../sim/builder.js';

export function buildTd4(meta) {
  const b = new CircuitBuilder({ ...meta, family: 'td4' });
  b.add('IN', 'TD4IN', {}, [0, 0], { label: 'INPUT' });
  b.add('ROM', 'TD4ROM', {}, [b.right('IN', 6), 0], { label: 'ROM 16x8', sides: { addr: 'right' }, order: { right: ['addr', 'op', 'im'] } });
  b.add('CF', 'REG', { width: 1 }, [b.right('ROM', 6), 0], { label: 'C' });
  b.add('DEC', 'TD4DEC', {}, [b.right('CF', 6), 0], { label: 'DECODER' });
  b.add('MUX', 'TD4MUX', {}, [b.x('IN'), b.below('ROM', 5)], { label: 'MUX A/B/IN/0' });
  b.add('ALU', 'TD4ALU', {}, [b.right('MUX', 6), b.alignPort('x', 'MUX.y')], { label: 'ALU 4-bit ADD' });
  b.add('NEXT', 'TD4NEXT', {}, [b.x('DEC'), b.below('DEC', 5)], { label: 'NEXT PC +1/JUMP' });
  b.add('PC', 'REG', { width: 4 }, [b.x('NEXT'), b.below('NEXT', 5)], { label: 'PC' });
  // As on the main site, A and B take D from above and send Q from their left edge to the MUX.
  const ab = { d: 'top', q: 'left' };
  b.add('A', 'REG', { width: 4, en: true, enSide: 'top' }, [b.x('MUX') + 4, b.below('ALU', 6)], { label: 'A', sides: ab });
  b.add('B', 'REG', { width: 4, en: true, enSide: 'top' }, [b.x('A'), b.below('A', 5)], { label: 'B', sides: ab });
  b.add('OUT', 'REG', { width: 4, en: true, enSide: 'top' }, [b.x('PC'), b.below('PC', 5)], { label: 'OUT' });
  b.add('OUTPUT', 'TD4OUT', {}, [b.right('OUT', 6), b.alignPort('data', 'OUT.q')], { label: 'OUTPUT' });

  const C = (from, ...to) => b.connect(from, ...to);
  C('IN.q', 'MUX.in');
  C('ROM.op', 'DEC.op');
  C('ROM.im', 'ALU.im');
  C('DEC.sel', 'MUX.sel');
  C('DEC.enA', 'A.en');
  C('DEC.enB', 'B.en');
  C('DEC.enOut', 'OUT.en');
  C('DEC.jump', 'NEXT.jump');
  C('MUX.y', 'ALU.x');
  C('ALU.sum', 'A.d', 'B.d', 'OUT.d', 'NEXT.result');
  C('ALU.cf', 'CF.d');
  C('NEXT.y', 'PC.d');
  C('A.q', 'MUX.a');
  C('B.q', 'MUX.b');
  C('PC.q', 'ROM.addr', 'NEXT.pc');
  C('CF.q', 'DEC.cf');
  C('OUT.q', 'OUTPUT.data');

  const circuit = b.build();
  circuit.hooks = {
    beforeClock(sim, info) {
      info.pc = sim.state('PC').value;
      info.retired = 1;
    },
  };
  circuit.inspect = sim => ({
    a: sim.state('A').value, b: sim.state('B').value, out: sim.state('OUT').value,
    pc: sim.state('PC').value, carry: sim.state('CF').value, input: sim.state('IN').sw & 15,
    halted: false, td4: true,
    stages: [{ name: 'EXEC', pc: sim.state('PC').value }],
  });
  return circuit;
}
