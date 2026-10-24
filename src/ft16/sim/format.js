import { hex } from '../isa/spec.js';

export function formatValue(value, width) {
  if (width === 1) return value ? 'H' : 'L';
  return `0x${hex(value, Math.ceil(width / 4))}`;
}

// Flags word: bit0 Z, bit1 C, bit2 N, bit3 V.
export const flagsText = f => `Z${f & 1} C${(f >> 1) & 1} N${(f >> 2) & 1} V${(f >> 3) & 1}`;
export const bin = (value, width) => value.toString(2).padStart(width, '0');
export { hex };
