import { instructions, type ProgramLine } from './instructions';

export type AssemblyErrorCode = 'emptyProgram' | 'invalidInstruction' | 'invalidImmediate' | 'tooManyInstructions';
export interface AssemblyError { line: number; code: AssemblyErrorCode }
export type AssemblyResult = { ok: true; lines: ProgramLine[] } | { ok: false; errors: AssemblyError[] };

// A strict assembler for the twelve documented TD4 instructions, sharing the
// instruction definitions used by the reference and machine-code encoder.
export function assemble(source: string): AssemblyResult {
  const lines: ProgramLine[] = [];
  const errors: AssemblyError[] = [];
  let count = 0;
  source.split(/\r?\n/).forEach((raw, index) => {
    const text = raw.split(';')[0].trim().toUpperCase().replace(/\s*,\s*/g, ',').replace(/\s+/g, ' ');
    if (!text) return;
    count++;
    if (count > 16) {
      errors.push({ line: index + 1, code: 'tooManyInstructions' });
      return;
    }
    for (const spec of instructions) {
      const pattern = spec.mnemonic.toUpperCase().replace(/, /g, ',');
      if (!pattern.endsWith('IM')) {
        if (text === pattern) { lines.push({ instruction: spec.mnemonic }); return; }
        continue;
      }
      const prefix = pattern.slice(0, -2);
      if (!text.startsWith(prefix)) continue;
      const literal = text.slice(prefix.length);
      // A register operand may match a later register-to-register instruction.
      if (literal === 'A' || literal === 'B') continue;
      const immediate = Number(literal);
      if (!/^(?:\d+|0X[\dA-F]+|0B[01]+)$/.test(literal) || !Number.isInteger(immediate) || immediate > 15) {
        errors.push({ line: index + 1, code: 'invalidImmediate' });
      } else {
        lines.push({ instruction: spec.mnemonic, immediate });
      }
      return;
    }
    errors.push({ line: index + 1, code: 'invalidInstruction' });
  });
  if (!count) errors.push({ line: 1, code: 'emptyProgram' });
  return errors.length ? { ok: false, errors } : { ok: true, lines };
}
