import type { Point } from '../../simulator/types';

export const viewport = { width: 640, height: 800 };
export const inputPositions: readonly Point[] = [[140, 85], [260, 85], [380, 85], [500, 85]];
export const outputPositions: readonly Point[] = [[140, 700], [260, 700], [380, 700], [500, 700]];
export const gates = [
  { id: 'U1', kind: 'NAND', x: 200, y: 240 },
  { id: 'U2', kind: 'NAND', x: 440, y: 240 },
  { id: 'U3', kind: 'NAND', x: 320, y: 410 },
  { id: 'U4', kind: 'NAND', x: 380, y: 550 },
] as const;
export const junctions = [
  { x: 200, y: 305, wire: 'U1-U3', distance: 22 },
  { x: 440, y: 305, wire: 'U2-U3', distance: 22 },
  { x: 320, y: 480, wire: 'U3-U4a', distance: 27 },
  { x: 367, y: 480, wire: 'U3-U4a', distance: 74 },
] as const;
