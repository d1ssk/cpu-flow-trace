import test from 'node:test';
import assert from 'node:assert/strict';
import { allPrograms } from '../programs/index.js';
import { programFits, stageById } from '../stages/index.js';
import { MODE_NAMES } from '../sim/modules-pipeline.js';
import { CAUSE } from '../isa/spec.js';
import { architectural, referenceView, runCircuit, runReference } from './helpers.js';

const stage = stageById('9');
const timingDependent = new Set(['os', 'double', 'scanner']);

for (const program of allPrograms.filter(p => programFits(stage, p) && !timingDependent.has(p.id))) {
  for (const mode of [1, 3]) {
    test(`stage 9 (${MODE_NAMES[mode]}) runs ${program.id} to the same final state`, () => {
      const reference = runReference('9', program);
      const { state, sim } = runCircuit('9', program, { maxCycles: 60000, options: { hazardMode: mode } });
      assert.deepEqual(architectural(state, stage.features), referenceView(reference, stage.features));
      assert.equal(sim.retired, reference.retired);
    });
  }
}

// The operating system's interleaving depends on timing; its results do not.
for (const id of ['8', '9']) {
  for (const mode of id === '9' ? [0, 2, 3] : [undefined]) {
    test(`stage ${id}${mode !== undefined ? ` (${MODE_NAMES[mode]})` : ''} runs the mini OS to the same results`, () => {
      const program = allPrograms.find(p => p.id === 'os');
      const reference = runReference(id, program);
      const { state, sim } = runCircuit(id, program, { maxCycles: 200000, options: { hazardMode: mode } });
      assert.equal(state.halted, true);
      assert.equal(state.led, 0x7F);
      const pick = mem => ({ a: mem[0x1A0], b: mem[0x1E0], alive: mem[10], kills: mem[12], codeA: mem.slice(0x180, 0x1A0), codeB: mem.slice(0x1C0, 0x1E0) });
      assert.deepEqual(pick(state.mem), pick(reference.mem));
      assert.deepEqual({ a: state.mem[0x1A0], b: state.mem[0x1E0], alive: state.mem[10], kills: state.mem[12] }, { a: 15, b: 120, alive: 0, kills: 1 });
      assert.ok(sim.trapCount > 30, 'timer, system call and TLB refill traps occurred');
      assert.ok(sim.trapCauses.has(CAUSE.EXEC_PROTECT), 'B was stopped by an execute-protection fault (W^X)');
    });
  }
}
