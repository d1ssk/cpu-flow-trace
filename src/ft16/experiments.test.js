import test from 'node:test';
import assert from 'node:assert/strict';
import { experiments } from './experiments.js';
import { stages, buildStage, programFits } from './stages/index.js';
import { Simulator } from './sim/simulator.js';
import { assembleFor, cpuStopped, switchModule } from './sim/run.js';

for (const stage of stages) test(`stage ${stage.id} has a minimal experiment`, () => {
  assert.ok(experiments.some(e => e.stage === stage.id && programFits(stage, e)));
});
for (const e of experiments) {
  const modes = e.stage.startsWith('6') || e.stage === '9' ? [0, 1, 2, 3] : [2];
  for (const mode of modes) test(`${e.id}: circuit reaches explained result (mode ${mode})`, () => {
    const circuit = buildStage(e.stage);
    const sim = new Simulator(circuit, { program: assembleFor(circuit, e.source), initialState: e.initialState, options: { hazardMode: mode } });
    if (e.switches) sim.setExternal(switchModule(sim), 'sw', e.switches);
    let cycles = 0;
    while (cycles < (e.cycles ?? 500)) {
      sim.settle();
      if (!e.cycles && cpuStopped(sim)) break;
      sim.clock(); cycles++;
    }
    sim.settle();
    if (!e.cycles) assert.ok(cpuStopped(sim), `did not halt after ${cycles} clocks`);
    const s = circuit.inspect(sim), expected = e.expected;
    for (const [r, value] of Object.entries(expected.regs ?? {})) assert.equal(s.regs[r], value, `r${r}`);
    for (const [addr, value] of Object.entries(expected.mem ?? {})) assert.equal(s.mem[addr], value, `M[${addr}]`);
    for (const key of ['a', 'out', 'pc', 'led', 'flags']) if (key in expected) assert.equal(s[key], expected[key], key);
    if ('trapCount' in expected) assert.equal(sim.trapCount, expected.trapCount);
    if ('epc' in expected) assert.equal(s.csr.epc, expected.epc);
    // Reset must recreate the fixture, not retain execution mutations.
    sim.reset();
    for (const [id, patch] of Object.entries(e.initialState ?? {})) {
      for (const [key, value] of Object.entries(patch)) assert.deepEqual(sim.state(id)[key], value, `${id}.${key} reset`);
    }
  });
}
