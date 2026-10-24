import test from 'node:test';
import assert from 'node:assert/strict';
import { lessons } from './lessons';
import { buildStage, stages } from '../../ft16/stages/index.js';
for (const stage of stages) test(`lesson ${stage.id} links to modules present in its circuit`, () => {
  const circuit = buildStage(stage.id);
  for (const m of lessons[stage.id].modules) assert.ok(circuit.modules.some((spec: { id: string }) => spec.id === m.id), m.id);
});
