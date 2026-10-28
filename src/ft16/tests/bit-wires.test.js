import test from 'node:test';
import assert from 'node:assert/strict';
import { stages, buildStage } from '../stages/index.js';
import { bitLane, bitPin, lanePoint, laneProgress } from '../view/bit-wires.js';

for (const stage of stages) test(`stage ${stage.id}: every bit lane reaches its own source and sink pin`, () => {
  const circuit = buildStage(stage.id);
  const ports = new Map(circuit.modules.flatMap(m => m.ports.map(p => [`${m.id}.${p.name}`, p])));
  for (const wire of circuit.wires) {
    const paths = new Set();
    for (let bit = 0; bit < wire.width; bit++) {
      const lane = bitLane(wire, bit);
      assert.equal(laneProgress(lane, 0), 0);
      assert.equal(laneProgress(lane, 1), 1);
      for (let i = 1; i < lane.timing.length; i++) {
        assert.ok(lane.timing[i].at > lane.timing[i - 1].at);
        assert.ok(lane.timing[i].distance > lane.timing[i - 1].distance);
      }
      assert.deepEqual(lane.points[0], bitPin(ports.get(wire.from), bit), `${wire.id}[${bit}] source`);
      assert.deepEqual(lane.points.at(-1), bitPin(ports.get(wire.to), bit), `${wire.id}[${bit}] sink`);
      assert.deepEqual(lanePoint(lane, 0), lane.points[0]);
      const end = lanePoint(lane, 1);
      assert.ok(Math.hypot(end[0] - lane.points.at(-1)[0], end[1] - lane.points.at(-1)[1]) < 1e-8);
      for (let i = 1; i < lane.points.length; i++) {
        const a = lane.points[i - 1], b = lane.points[i];
        assert.ok(a[0] === b[0] || a[1] === b[1], `${wire.id}: orthogonal lane`);
        assert.ok(lane.lengths[i - 1] > 0, `${wire.id}: no collapsed/reversed segments`);
        for (const axis of [0, 1]) assert.equal(Math.sign(b[axis] - a[axis]), Math.sign(wire.points[i][axis] - wire.points[i - 1][axis]));
      }
      paths.add(JSON.stringify(lane.points));
    }
    assert.equal(paths.size, wire.width, `${wire.id}: distinct bit lanes`);
  }
});

test('fan-out wavefronts stay together on their shared trunk despite different sink lengths and bends', () => {
  const a = { width: 16, points: [[0, 0], [100, 0], [100, 100]], length: 200 };
  const b = { width: 16, points: [[0, 0], [150, 0], [150, -100]], length: 250 };
  for (let bit = 0; bit < 16; bit++) {
    const left = bitLane(a, bit), right = bitLane(b, bit);
    for (const travelled of [0, 25, 60, 95]) {
      const p = lanePoint(left, laneProgress(left, travelled / a.length));
      const q = lanePoint(right, laneProgress(right, travelled / b.length));
      assert.ok(Math.hypot(p[0] - q[0], p[1] - q[1]) < 1e-8);
      assert.ok(Math.abs(p[0] - travelled) < 1e-8);
    }
  }
});
