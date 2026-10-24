import test from 'node:test';
import assert from 'node:assert/strict';
import { td4Programs } from '../td4/programs.js';
import { assembleTd4, createTd4, disassembleTd4 } from '../td4/isa.js';
import { buildStage } from '../stages/index.js';
import { createCpu } from '../sim/run.js';

const pick = s => ({ a: s.a, b: s.b, out: s.out, pc: s.pc, carry: s.carry });

for (const program of td4Programs) {
  for (const input of [program.switches, 0, 9, 15]) {
    test(`stage 0 runs ${program.id} (input ${input}) like the TD4 reference`, () => {
      const rom = assembleTd4(program.source).rom;
      const reference = createTd4({ rom, input });
      const sim = createCpu(buildStage('0'), program.source, { switches: input });
      for (let cycle = 0; cycle < 120; cycle++) {
        sim.settle();
        assert.deepEqual(pick(sim.circuit.inspect(sim)), pick(reference.state), `cycle ${cycle}`);
        sim.clock();
        reference.step();
      }
    });
  }
}

test('the TD4 assembler matches the main site encoding', () => {
  const { rom } = assembleTd4('MOV A, 3\nADD B, 15\nIN A\nOUT B\nOUT 12\nJNC 6\nJMP 0\nMOV B, A');
  assert.deepEqual(rom.slice(0, 8), [0x33, 0x5F, 0x20, 0x90, 0xBC, 0xE6, 0xF0, 0x40]);
  assert.equal(disassembleTd4(0x9F), 'OUT B (+15)');
  assert.throws(() => assembleTd4('ADD A, 16'));
});

test('the TD4 counter outputs 1, 2, 3 ... through the circuit', () => {
  const program = td4Programs.find(p => p.id === 'counter');
  const sim = createCpu(buildStage('0'), program.source);
  const seen = [];
  for (let i = 0; i < 20; i++) { sim.settle(); seen.push(sim.circuit.inspect(sim).out); sim.clock(); }
  assert.deepEqual([...new Set(seen)].slice(0, 5), [0, 1, 2, 3, 4]);
});
