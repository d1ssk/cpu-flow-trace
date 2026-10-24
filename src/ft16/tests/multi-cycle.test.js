import test from 'node:test';
import assert from 'node:assert/strict';
import { allPrograms } from '../programs/index.js';
import { programFits, stageById, buildStage } from '../stages/index.js';
import { createCpu } from '../sim/run.js';
import { architectural, referenceView, runCircuit, runReference } from './helpers.js';

const stage = stageById(5);

for (const program of allPrograms.filter(p => programFits(stage, p) && !['double', 'scanner'].includes(p.id))) {
  test(`stage 5 runs ${program.id} to the same final state`, () => {
    const reference = runReference(5, program);
    const { state, sim } = runCircuit(5, program, { maxCycles: 60000 });
    assert.deepEqual(architectural(state, stage.features), referenceView(reference, stage.features));
    assert.equal(sim.retired, reference.retired);
    assert.ok(sim.cycle > reference.retired * 3, 'several clocks per instruction');
  });
}

for (const latency of [1, 3]) {
  test(`stage 5 with a ${latency}-cycle memory runs fact`, () => {
    const program = allPrograms.find(p => p.id === 'fact');
    const reference = runReference(5, program);
    const { state } = runCircuit(5, program, { maxCycles: 60000, options: { memLatency: latency } });
    assert.deepEqual(architectural(state, stage.features), referenceView(reference, stage.features));
  });
}

test('stage 5 matches the reference after the same number of retired instructions', () => {
  const program = allPrograms.find(p => p.id === 'double');
  const reference = runReference(5, program, 200);
  const sim = createCpu(buildStage(5), program.source, { switches: program.switches });
  while (sim.retired < reference.retired) { sim.settle(); sim.clock(); }
  sim.settle();
  while (!sim.circuit.inspect(sim).atBoundary) { sim.clock(); sim.settle(); }
  assert.deepEqual(architectural(sim.circuit.inspect(sim), stage.features), referenceView(reference, stage.features));
});
