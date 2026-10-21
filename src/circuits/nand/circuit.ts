import type { Signal } from '../../simulator/types';

// Same ideal-switch topology as workbench/circuits.js: parallel pMOS,
// series nMOS. Internal analog behavior and device delays are not modeled.
export const transistors = [
  { id: 'PA', type: 'p', control: 'a', from: 'VDD', to: 'Y' },
  { id: 'PB', type: 'p', control: 'b', from: 'VDD', to: 'Y' },
  { id: 'NA', type: 'n', control: 'a', from: 'Y', to: 'MID' },
  { id: 'NB', type: 'n', control: 'b', from: 'MID', to: 'GND' },
] as const;

export function evaluateNand(a: Signal, b: Signal): Signal {
  if (a === 0 || b === 0) return 1;
  if (typeof a !== 'number' || typeof b !== 'number') return 'X';
  const inputs = { a, b };
  const adjacency: Record<string, string[]> = { VDD: [], GND: [], Y: [], MID: [] };
  for (const device of transistors) {
    if (inputs[device.control] === (device.type === 'p' ? 0 : 1)) {
      adjacency[device.from].push(device.to);
      adjacency[device.to].push(device.from);
    }
  }
  const seen = new Set<string>();
  const pending = ['Y'];
  while (pending.length) {
    const net = pending.pop()!;
    if (seen.has(net)) continue;
    seen.add(net);
    pending.push(...adjacency[net]);
  }
  return seen.has('VDD') ? (seen.has('GND') ? 'X' : 1) : seen.has('GND') ? 0 : 'Z';
}
