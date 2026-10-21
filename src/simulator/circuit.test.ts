import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Circuit } from './circuit';
import { demoCircuit } from '../circuits/demo';
import { evaluateNand } from '../circuits/nand';
import { PROPAGATION_SPEED } from './transport';

function settle(sim: Circuit) {
  let events = 0;
  while (sim.busy) {
    assert.ok(++events < 100, 'Demo must settle');
    sim.next();
  }
}

test('connected NAND network produces all sixteen input combinations', () => {
  for (let word = 0; word < 16; word++) {
    const sim = new Circuit(demoCircuit);
    for (let bit = 0; bit < 4; bit++) sim.setInput(`I${bit}`, (word >> bit & 1) as 0 | 1);
    settle(sim);
    const first = 1 - ((word & 1) & (word >> 1 & 1));
    const second = 1 - ((word >> 2 & 1) & (word >> 3 & 1));
    const third = 1 - (first & second);
    assert.deepEqual(demoCircuit.outputs.map(id => sim.values[id]), [first, second, third, 1 - third]);
  }
});

test('input, gate, and output change only at their successive arrival times', () => {
  const sim = new Circuit(demoCircuit);
  sim.setInput('I0', 1); sim.setInput('I1', 1);
  const inputDelay = sim.wires['I0-U1'].delay;
  sim.advance(inputDelay / 2);
  assert.equal(sim.valueAt('I0-U1', 0.25), 1);
  assert.equal(sim.valueAt('I0-U1', 0.75), 0);
  assert.equal(sim.values['U1.y'], 1);
  assert.equal(sim.values.O0, 1);
  sim.advance(inputDelay / 2);
  assert.equal(sim.values['U1.y'], 0);
  assert.equal(sim.values.O0, 1);
  sim.advance(sim.wires['U1-O0'].delay);
  assert.equal(sim.values.O0, 0);
});

test('same-time arrivals are evaluated together, without artificial glitches', () => {
  const sim = new Circuit(demoCircuit);
  sim.setInput('I0', 1); settle(sim);
  sim.setInput('I0', 0); sim.setInput('I1', 1);
  sim.advance(sim.wires['I0-U1'].delay);
  assert.equal(sim.values['U1.y'], 1);
  assert.deepEqual(sim.wires['U1-O0'].transitions, []);
});

test('short pulses survive and outcomes do not depend on animation frame size', () => {
  const prepare = () => {
    const sim = new Circuit(demoCircuit);
    sim.setInput('I0', 1); sim.setInput('I1', 1);
    sim.advance(20);
    sim.setInput('I0', 0);
    return sim;
  };
  const coarse = prepare();
  const fine = prepare();
  coarse.advance(800);
  for (let i = 0; i < 80; i++) fine.advance(10);
  assert.deepEqual(coarse.values, fine.values);
  assert.deepEqual(coarse.wires, fine.wires);
  assert.equal(coarse.wires['U1-O0'].transitions.length, 2);
  const [fall, rise] = coarse.wires['U1-O0'].transitions;
  assert.equal(rise.time - fall.time, 20);
  settle(coarse); settle(fine);
  assert.deepEqual(coarse.values, fine.values);
});

test('reset by replacement discards pending events and restores the initial word', () => {
  let sim = new Circuit(demoCircuit);
  sim.setInput('I0', 1);
  sim.advance(50);
  assert.equal(sim.busy, true);
  sim = new Circuit(demoCircuit);
  assert.equal(sim.busy, false);
  assert.equal(sim.time, 0);
  assert.deepEqual(demoCircuit.inputs.map(id => sim.values[id]), [0, 0, 0, 0]);
  assert.deepEqual(demoCircuit.outputs.map(id => sim.values[id]), [1, 1, 0, 1]);
});

test('wire timing is fixed in model units, with unknown signals kept explicit', () => {
  const sim = new Circuit(demoCircuit);
  for (const wire of Object.values(sim.wires)) assert.equal(wire.delay, wire.length / PROPAGATION_SPEED * 1000);
  assert.equal(evaluateNand('X', 1), 'X');
  assert.equal(evaluateNand('Z', 1), 'X');
  assert.equal(evaluateNand('X', 0), 1);
  assert.throws(() => sim.advance(-1));
  assert.throws(() => sim.setInput('missing', 1));
});
