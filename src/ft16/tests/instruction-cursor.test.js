import test from 'node:test';
import assert from 'node:assert/strict';
import { stages, buildStage } from '../stages/index.js';
import { createCpu, cpuStopped, assembleFor } from '../sim/run.js';
import { Simulator } from '../sim/simulator.js';
import { InstructionCursor } from '../view/instruction-cursor.js';

function setup(stage, source) {
  const sim = createCpu(buildStage(stage), source);
  return { sim, cursor: new InstructionCursor(sim) };
}

function clock(sim, cursor) {
  sim.clock();
  let events = 0;
  while (sim.busy) {
    cursor.update();
    assert.notEqual(cursor.phase, 'waiting', 'no capture-wait annotation during propagation');
    sim.next();
    assert.ok(++events < 10000);
  }
  return cursor.update();
}

for (const { id } of stages) test(`stage ${id}: startup propagation becomes capture-wait, including reset`, () => {
  const circuit = buildStage(id);
  const program = assembleFor(circuit, id === '0' ? 'MOV A, 1\nJMP 0' : 'LI r1, 1\nHALT');
  const sim = new Simulator(circuit, { program, settleOnReset: false });
  for (let reset = 0; reset < 2; reset++) {
    const cursor = new InstructionCursor(sim);
    assert.ok(sim.busy);
    assert.equal(cursor.phase, 'propagating');
    assert.ok(cursor.tags.has(0));
    while (sim.busy) {
      assert.ok(cursor.update().has(0));
      assert.equal(cursor.phase, 'propagating');
      sim.next();
    }
    assert.equal(sim.cycle, 0);
    assert.ok(cursor.update().has(0));
    assert.equal(cursor.phase, 'waiting');
    clock(sim, cursor);
    sim.reset();
  }
});

test('TD4 cursor follows the new PC immediately, including jumps, then becomes capture-wait', () => {
  const { sim, cursor } = setup('0', 'MOV A, 1\nJMP 0');
  assert.deepEqual([...cursor.tags], [[0, ['EXEC']]]);
  for (const pc of [1, 0]) {
    sim.clock();
    assert.deepEqual([...cursor.update()], [[pc, ['EXEC']]]);
    assert.equal(cursor.phase, 'propagating');
    sim.settle();
    assert.deepEqual([...cursor.update()], [[pc, ['EXEC']]]);
    assert.equal(cursor.phase, 'waiting');
  }
  clock(sim, cursor);
  sim.reset();
  assert.deepEqual([...new InstructionCursor(sim).tags], [[0, ['EXEC']]]);
});

test('single-cycle cursor clears completed HALT instead of marking it as waiting', () => {
  const { sim, cursor } = setup('1', 'LI r1, 1\nHALT\nLI r2, 9');
  assert.deepEqual([...clock(sim, cursor)], [[1, ['EXEC']]]);
  assert.deepEqual([...clock(sim, cursor)], []);
  assert.equal(cpuStopped(sim), true);
  assert.equal(new InstructionCursor(sim).tags.size, 0);
  assert.equal(sim.state('PC').value, 2, 'raw PC remains observable independently');
});

test('multi-cycle cursor advances phases after settling and retains the IR instruction until completion', () => {
  const { sim, cursor } = setup('5', 'LI r1, 1\nHALT');
  for (const [pc, phase] of [[0, 'FETCH'], [0, 'DECODE'], [0, 'EXEC'], [0, 'ALUWB'], [1, 'FETCH']]) {
    assert.deepEqual([...clock(sim, cursor)], [[pc, [phase]]]);
  }
});

for (const stage of ['6a', '6b', '7', '9']) test(`stage ${stage}: pipeline annotations distinguish propagation and clear after HALT drains`, () => {
  const { sim, cursor } = setup(stage, 'LI r1, 1\nHALT');
  for (let i = 0; !cpuStopped(sim); i++) {
    assert.ok(i < 100);
    clock(sim, cursor);
  }
  assert.equal(cursor.tags.size, 0, 'completed HALT is not waiting for capture');
});

test('cursor follows the current physical listing address while mode/TLB signals propagate', () => {
  const { sim, cursor } = setup('8', 'LI r1, 1\nHALT');
  // Capture a user-mode instruction, then change mapping/context while
  // propagation is pending. The propagation marker follows the new context.
  sim.state('CSR').status = 0;
  sim.state('ITLB').entries = [{ valid: true, vpn: 0, ppn: 2 }];
  const expected = cursor.update();
  assert.deepEqual([...expected.keys()], [64]);
  sim.clock();
  assert.equal(sim.busy, true);
  sim.state('ITLB').entries[0].ppn = 3;
  assert.deepEqual([...cursor.update().keys()], [97]);
  assert.equal(cursor.phase, 'propagating');
  sim.settle();
  assert.deepEqual([...cursor.update().keys()], [97]);
});

test('an external input changes the same instruction from capture-wait to propagation and back', () => {
  const { sim, cursor } = setup('0', 'IN A\nJMP 0');
  assert.deepEqual([...cursor.tags], [[0, ['EXEC']]]);
  sim.setExternal('IN', 'sw', 1);
  while (sim.busy) {
    assert.deepEqual([...cursor.update()], [[0, ['EXEC']]]);
    assert.equal(cursor.phase, 'propagating');
    sim.next();
  }
  assert.equal(sim.cycle, 0);
  assert.deepEqual([...cursor.update()], [[0, ['EXEC']]]);
  assert.equal(cursor.phase, 'waiting');
});
