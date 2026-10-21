import { test } from 'node:test';
import assert from 'node:assert/strict';
import { encode } from './instructions';
import { programs } from './programs';

test('LED example ROM bytes match the standard TD4 example from the cited source', () => {
  assert.deepEqual(programs.find(p => p.id === 'led-blink')!.lines.map(encode), [0xb3,0xb6,0xbc,0xb8,0xb8,0xbc,0xb6,0xb3,0xb1,0xf0]);
});
test('kitchen timer ROM matches the supplied ten-instruction assembly', () => {
  assert.deepEqual(programs.find(p => p.id === 'kitchen-timer')!.lines.map(encode), [0x60,0x90,0x3d,0x01,0xe3,0x51,0xe1,0xb0,0xbf,0xf7]);
});
test('encoding rejects immediate values outside the 4-bit range', () => {
  for (const immediate of [-1, 16, 1.5, NaN]) assert.throws(() => encode({ instruction: 'OUT im', immediate }));
});

test('count up and input/output samples preserve the workbench ROM sequences', () => {
  assert.deepEqual(programs.find(p => p.id === 'counter')!.lines.map(encode), [0x30,0x01,0x40,0x90,0xf1]);
  assert.deepEqual(programs.find(p => p.id === 'input-output')!.lines.map(encode), [0x60,0x90,0xf0]);
});
