import test from 'node:test';
import assert from 'node:assert/strict';
import { stages, buildStage } from '../stages/index.js';
import { experiments } from '../experiments.js';
import { assembleFor } from '../sim/run.js';
import { Simulator } from '../sim/simulator.js';

for (const { id } of stages) test(`stage ${id}: restore pending arrivals and replay the connected circuit exactly`, () => {
  const experiment = experiments.find(p => p.stage === id);
  const circuit = buildStage(id);
  const sim = new Simulator(circuit, {
    program: assembleFor(circuit, experiment.source), initialState: experiment.initialState,
    options: { hazardMode: 2, memLatency: 2, mainLatency: 4, memPorts: 1 }, settleOnReset: false,
  });
  sim.next();
  assert.ok(sim.busy);
  const saved = sim.snapshot();
  const unmodified = structuredClone(saved);
  const replay = () => { sim.settle(); sim.runCycles(12); };
  replay();
  const result = sim.snapshot();
  assert.notDeepEqual(saved, result);
  for (let repeat = 0; repeat < 2; repeat++) {
    sim.restore(saved);
    assert.deepEqual(sim.snapshot(), saved);
    for (const event of sim.queue.items) {
      assert.ok(event.wire.transitions.includes(event.transition), 'pending arrivals share the displayed transition');
      assert.equal(event.wire.sink.module, sim.module(event.wire.to.split('.')[0]));
    }
    replay();
    assert.deepEqual(sim.snapshot(), result, 'memory, I/O, pipeline, timing, and causal traces replay deterministically');
  }
  assert.deepEqual(saved, unmodified, 'replaying does not mutate the checkpoint');
});

test('rewinding a pulse preserves both fronts and the later H then L arrivals', () => {
  const circuit = buildStage('0');
  const sim = new Simulator(circuit, { program: assembleFor(circuit, 'MOV A, 1\nJMP 0') });
  const wire = sim.wires.get('IN.q>MUX.in');
  sim.setExternal('IN', 'sw', 1);
  sim.advance(wire.delay / 4);
  sim.setExternal('IN', 'sw', 0);
  sim.advance(wire.delay / 4);
  const saved = sim.snapshot();
  const fractions = [0, 0.1, 0.3, 0.6, 1];
  const visible = fractions.map(f => sim.valueAt(wire, f));
  assert.deepEqual(visible, [0, 0, 1, 0, 0]);
  sim.settle();
  sim.clock();
  sim.restore(saved);
  assert.deepEqual(fractions.map(f => sim.valueAt(wire, f)), visible);
  sim.next();
  assert.equal(sim.input('MUX', 'in'), 1);
  sim.next();
  assert.equal(sim.input('MUX', 'in'), 0);
});
