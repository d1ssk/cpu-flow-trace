import test from 'node:test';
import assert from 'node:assert/strict';
import { TransistorExperiment } from './transistor';

test('both ideal MOS types pass H and L only while conducting; OFF leaves Z', () => {
  for (const type of ['n', 'p'] as const) for (const gate of [0, 1] as const) for (const source of [0, 1] as const) {
    const sim = new TransistorExperiment();
    sim.setType(type); sim.setInput('gate', gate); sim.setInput('source', source);
    sim.advance(2000);
    assert.equal(sim.conducting, gate === (type === 'n' ? 1 : 0));
    assert.equal(sim.wires.drain.arrived, sim.conducting ? source : 'Z');
    assert.equal(sim.busy, false);
  }
});

test('gate arrival opens the channel before the signal reaches the drain probe', () => {
  const sim = new TransistorExperiment();
  sim.setInput('gate', 1);
  sim.advance(sim.wires.gate.delay / 2);
  assert.equal(sim.valueAt('gate', 0.25), 1);
  assert.equal(sim.valueAt('gate', 0.75), 0);
  assert.equal(sim.conducting, false);
  assert.equal(sim.wires.drain.arrived, 'Z');
  sim.advance(sim.wires.gate.delay / 2);
  assert.equal(sim.conducting, true);
  assert.equal(sim.wires.drain.source, 1);
  assert.equal(sim.wires.drain.arrived, 'Z');
  sim.advance(sim.wires.drain.delay);
  assert.equal(sim.wires.drain.arrived, 1);
});

test('rapid source toggles keep both wavefronts and propagate through an open channel', () => {
  const sim = new TransistorExperiment();
  sim.setInput('gate', 1); sim.advance(2000);
  sim.setInput('source', 0); sim.advance(50); sim.setInput('source', 1);
  assert.equal(sim.wires.source.transitions.length, 2);
  sim.advance(sim.wires.source.delay + sim.wires.drain.delay - 50);
  assert.equal(sim.wires.drain.arrived, 0);
  sim.advance(51);
  assert.equal(sim.wires.drain.arrived, 1);
  sim.setInput('gate', 0); sim.advance(2000);
  assert.equal(sim.wires.drain.arrived, 'Z');
});
