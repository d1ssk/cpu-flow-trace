import test from 'node:test';
import assert from 'node:assert/strict';
import { allPrograms } from '../programs/index.js';
import { programFits, stageById } from '../stages/index.js';
import { MODE_NAMES } from '../sim/modules-pipeline.js';
import { architectural, referenceView, runCircuit, runReference } from './helpers.js';

const endless = new Set(['double', 'scanner']);

for (const id of ['6a', '6b', '7']) {
  const stage = stageById(id);
  for (const program of allPrograms.filter(p => programFits(stage, p) && !endless.has(p.id))) {
    for (const mode of [0, 1, 2, 3]) {
      for (const memPorts of stage.features.cache ? [undefined] : [1, 2]) {
        const ports = memPorts ? `, ${memPorts} port${memPorts > 1 ? 's' : ''}` : '';
        test(`stage ${id} (${MODE_NAMES[mode]}${ports}) runs ${program.id} to the same final state`, () => {
          const reference = runReference(id, program);
          const { state, sim } = runCircuit(id, program, { maxCycles: 20000, options: { hazardMode: mode, memPorts } });
          assert.deepEqual(architectural(state, stage.features), referenceView(reference, stage.features));
          assert.equal(sim.retired, reference.retired, 'every instruction retires once');
        });
      }
    }
  }
}

// The instruction cache does not see stores: without FENCEI, stage 7 keeps
// executing the old instruction (1 + 1 = 2) where the architecture says 101.
test('stage 7 needs FENCEI after rewriting an instruction', () => {
  const program = allPrograms.find(p => p.id === 'selfmod');
  const stale = { ...program, source: program.source.replace(/^\s*FENCEI.*$/m, '    NOP') };
  assert.equal(runCircuit('7', program, { options: { hazardMode: 2 } }).state.regs[1], 101);
  assert.equal(runCircuit('7', stale, { options: { hazardMode: 2 } }).state.regs[1], 2);
  assert.equal(runReference('7', stale).regs[1], 101, 'the reference model fetches the new word');
});

// A branch the predictor has learned is rewritten into a non-branch at the
// same address: the stale "taken" prediction must be corrected in EX.
test('a prediction for an instruction that is not a branch is corrected', () => {
  const program = { id: 'stale-prediction', source: `    LI   r1, 0
    LI   r2, 3
loop:
    ADDI r2, -1
spot:
    JNZ  loop           ; taken twice: the predictor learns "taken"
    CMPI r1, 0
    JNZ  done           ; second time through: finish
    LI   r5, spot
    LI   r6, newins
    LD   r3, [r6]
    ST   r3, [r5]       ; spot becomes ADDI r1, 1 (not a branch)
    FENCEI
    LI   r2, 5
    JMP  loop
done:
    HALT                ; r1 = 1, r2 = 4
newins:
    ADDI r1, 1
` };
  for (const id of ['6a', '6b', '7', '9']) {
    const stage = stageById(id);
    const reference = runReference(id, program);
    assert.deepEqual([reference.regs[1], reference.regs[2]], [1, 4]);
    const { state } = runCircuit(id, program, { options: { hazardMode: 3 } });
    assert.deepEqual(architectural(state, stage.features), referenceView(reference, stage.features), `stage ${id}`);
  }
});

// CMP writes "r0", which is discarded: an instruction right after it that
// reads r0 must still see 0 (no forwarding of the CMP result).
test('r0 reads 0 right after CMP in every pipeline and setting', () => {
  const program = { id: 'r0-after-cmp', source: `    LI   r1, 5
    LI   r2, 7
    LI   r4, 9
    CMP  r1, r2        ; SUB r0, r1, r2: the result is discarded
    MOV  r3, r4        ; ADD r3, r4, r0
    CMP  r2, r1
    LD   r5, [r0+data] ; base r0
    CMP  r1, r4
    ADD  r6, r0, r4
    HALT
data: .word 1234
` };
  for (const id of ['6a', '6b', '7']) {
    const stage = stageById(id);
    const reference = runReference(id, program);
    assert.deepEqual([reference.regs[3], reference.regs[5], reference.regs[6]], [9, 1234, 9]);
    for (const mode of [0, 1, 2, 3]) {
      const { state } = runCircuit(id, program, { options: { hazardMode: mode } });
      assert.deepEqual(architectural(state, stage.features), referenceView(reference, stage.features), `stage ${id} mode ${mode}`);
    }
  }
});
