import test from 'node:test';
import assert from 'node:assert/strict';
import { allPrograms } from '../programs/index.js';
import { programFits, stageById } from '../stages/index.js';
import { architectural, referenceView, runCircuit, runReference } from './helpers.js';

const endless = new Set(['double', 'scanner']);

for (const id of [1, 2, 3, 4, 8]) {
  const stage = stageById(id);
  for (const program of allPrograms.filter(p => programFits(stage, p))) {
    test(`stage ${id} runs ${program.id} like the reference model`, () => {
      const steps = endless.has(program.id) ? 300 : undefined;
      const reference = runReference(id, program, steps);
      const { state, cycles } = runCircuit(id, program, { cycles: steps });
      assert.deepEqual(architectural(state, stage.features), referenceView(reference, stage.features));
      // A single-cycle CPU uses exactly one clock per reference step.
      assert.equal(cycles, reference.steps);
    });
  }
}
