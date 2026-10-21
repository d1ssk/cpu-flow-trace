import { test } from 'node:test';
import assert from 'node:assert/strict';
import { assemble } from './assembler';
import { encode, formatInstruction, instructions } from './instructions';
import { programs } from './programs';

test('all twelve instructions assemble to their documented opcodes', () => {
  const result = assemble('ADD A, 15\nADD B, 15\nMOV A, B\nMOV B, A\nMOV A, 15\nMOV B, 15\nIN A\nIN B\nOUT B\nOUT 15\nJNC 15\nJMP 15');
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.lines.map(encode), [0x0f, 0x5f, 0x10, 0x40, 0x3f, 0x7f, 0x20, 0x60, 0x90, 0xbf, 0xef, 0xff]);
});
test('sample editing preserves ROM bytes and accepts lowercase, whitespace, comments and number bases', () => {
  for (const program of programs) {
    const result = assemble(program.lines.map(formatInstruction).join('\n'));
    assert.equal(result.ok, true);
    if (result.ok) assert.deepEqual(result.lines.map(encode), program.lines.map(encode));
  }
  const result = assemble('; example\r\n mov\ta , 0xf ; comment\r\n\n out 0b0011\n jmp 00');
  assert.equal(result.ok, true);
  if (result.ok) assert.deepEqual(result.lines.map(encode), [0x3f, 0xb3, 0xf0]);
});
test('invalid input fails atomically and reports original source line numbers', () => {
  assert.deepEqual(assemble('; comment\n\nOUT 16\nHALT'), { ok: false, errors: [
    { line: 3, code: 'invalidImmediate' }, { line: 4, code: 'invalidInstruction' },
  ] });
  for (const literal of ['-1', '1.5', '0x10', '0b10000', 'NaN', '1e1', '2 extra', '0b2']) {
    assert.equal(assemble(`OUT ${literal}`).ok, false, literal);
  }
  for (const text of ['MOV A,A', 'IN C', 'OUT A', 'ADD A', 'MOV A,', 'OUT', 'JMP']) {
    assert.equal(assemble(text).ok, false, text);
  }
  assert.deepEqual(assemble(' ; nothing\n'), { ok: false, errors: [{ line: 1, code: 'emptyProgram' }] });
});
test('ROM capacity is exactly sixteen instructions, excluding comments and blank lines', () => {
  assert.equal(assemble(Array(16).fill('OUT 0\n; comment\n').join('\n')).ok, true);
  assert.deepEqual(assemble(Array(17).fill('OUT 0').join('\n')), { ok: false, errors: [{ line: 17, code: 'tooManyInstructions' }] });
  assert.equal(instructions.length, 12);
});
