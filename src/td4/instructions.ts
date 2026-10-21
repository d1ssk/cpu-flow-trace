export const instructions = [
  { opcode: 0x0, mnemonic: 'ADD A, im', ja: 'A に即値を加算', en: 'Add immediate to A' },
  { opcode: 0x5, mnemonic: 'ADD B, im', ja: 'B に即値を加算', en: 'Add immediate to B' },
  { opcode: 0x1, mnemonic: 'MOV A, B', ja: 'B を A に転送', en: 'Copy B into A' },
  { opcode: 0x4, mnemonic: 'MOV B, A', ja: 'A を B に転送', en: 'Copy A into B' },
  { opcode: 0x3, mnemonic: 'MOV A, im', ja: '即値を A に転送', en: 'Load immediate into A' },
  { opcode: 0x7, mnemonic: 'MOV B, im', ja: '即値を B に転送', en: 'Load immediate into B' },
  { opcode: 0x2, mnemonic: 'IN A', ja: '入力を A に読み込む', en: 'Read input into A' },
  { opcode: 0x6, mnemonic: 'IN B', ja: '入力を B に読み込む', en: 'Read input into B' },
  { opcode: 0x9, mnemonic: 'OUT B', ja: 'B を出力', en: 'Write B to output' },
  { opcode: 0xb, mnemonic: 'OUT im', ja: '即値を出力', en: 'Write immediate to output' },
  { opcode: 0xe, mnemonic: 'JNC im', ja: 'C=0 なら指定番地へ', en: 'Jump if carry is clear' },
  { opcode: 0xf, mnemonic: 'JMP im', ja: '指定番地へジャンプ', en: 'Jump to address' },
] as const;

export type InstructionName = typeof instructions[number]['mnemonic'];
export interface ProgramLine { instruction: InstructionName; immediate?: number }
export function encode(line: ProgramLine): number {
  const spec = instructions.find(item => item.mnemonic === line.instruction);
  const immediate = line.immediate ?? 0;
  if (!spec || !Number.isInteger(immediate) || immediate < 0 || immediate > 15) throw new Error('Invalid TD4 instruction');
  return (spec.opcode << 4) | immediate;
}
export function formatInstruction(line: ProgramLine): string {
  return line.instruction.replace('im', String(line.immediate ?? 0));
}
