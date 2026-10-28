import test from 'node:test';
import assert from 'node:assert/strict';
import { stages, buildStage } from '../stages/index.js';
import { Simulator } from '../sim/simulator.js';
import { assembleFor } from '../sim/run.js';

function setup(stage = '1') {
  const circuit = buildStage(stage);
  const program = assembleFor(circuit, stage === '0' ? 'MOV A, 1\nMOV B, 2\nJMP 0' : 'LI r1, 1\nLI r2, 2\nHALT');
  return new Simulator(circuit, { program, settleOnReset: false });
}

test('first write data travels to the register before a clock can capture it', () => {
  const sim = setup();
  const wire = sim.wires.get('ALU.y>RF.wd');
  assert.ok(sim.busy);
  assert.equal(sim.time, 0);
  assert.equal(sim.input('RF', 'wd'), 0);
  assert.equal(sim.state('RF').regs[1], 0);
  assert.equal(sim.clock(), false);
  while (wire.source !== 1) assert.ok(sim.next());
  const arrival = wire.transitions.find(t => t.value === 1).time + wire.delay;
  sim.advance(arrival - sim.time - 1e-5);
  assert.equal(sim.input('RF', 'wd'), 0);
  assert.equal(sim.state('RF').regs[1], 0);
  sim.advance(1e-5);
  assert.equal(sim.input('RF', 'wd'), 1);
  assert.equal(sim.state('RF').regs[1], 0, 'arrival alone does not clock the register');
  sim.settle();
  assert.equal(sim.state('RF').regs[1], 0);
  sim.clock();
  assert.equal(sim.state('RF').regs[1], 1);
});

test('memory read highlight waits for its address wire, and later register writes wait for the clock', () => {
  const sim = setup();
  sim.settle();
  sim.clock();
  const memory = sim.module('MEM');
  const fetch = () => memory.def.view(memory).find(r => r.kind === 'map').fetch;
  const address = sim.wires.get('PC.q>MEM.iaddr');
  assert.equal(sim.state('PC').value, 1);
  assert.equal(fetch(), 0);
  sim.advance(address.delay - 1e-5);
  assert.equal(fetch(), 0);
  sim.advance(1e-5);
  assert.equal(fetch(), 1);
  assert.ok(sim.busy, 'memory reads on local arrival, without waiting for unrelated wires');
  while (sim.busy) {
    assert.equal(sim.state('RF').regs[2], 0);
    sim.next();
    for (const w of sim.wires.values()) {
      assert.equal(w.sink.module.in[w.sink.port], sim.valueAt(w, 1), `${w.id}: terminal agrees with wave arrival`);
    }
  }
  assert.equal(sim.input('RF', 'wd'), 2);
  assert.equal(sim.state('RF').regs[2], 0);
  sim.clock();
  assert.equal(sim.state('RF').regs[2], 2);
});

for (const { id } of stages) test(`stage ${id}: visible startup and reset preserve connected-circuit results`, () => {
  const animated = setup(id);
  const batch = new Simulator(animated.circuit, { program: animated.program });
  const state = sim => [...sim.modules.values()].map(m => ({ id: m.id, in: m.in, out: m.out, state: m.state }));
  assert.ok(animated.busy);
  animated.settle();
  assert.deepEqual(state(animated), state(batch));
  for (let i = 0; i < 3; i++) {
    animated.clock(); batch.clock();
    animated.settle(); batch.settle();
    assert.deepEqual(state(animated), state(batch));
  }
  animated.reset(); batch.reset();
  assert.equal(animated.time, 0);
  assert.ok(animated.busy);
  animated.settle();
  assert.deepEqual(state(animated), state(batch));
});
