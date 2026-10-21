export type Bit = 0 | 1;
export type Signal = Bit | 'X' | 'Z';
export type Point = readonly [number, number];
export interface WireDefinition {
  id: string;
  from: string;
  to: string;
  points: readonly Point[];
}
export interface WireState extends WireDefinition {
  length: number;
  delay: number;
  initial: Signal;
  source: Signal;
  arrived: Signal;
  transitions: { time: number; value: Signal }[];
}
export interface GateDefinition {
  id: string;
  kind: 'NAND';
  x: number;
  y: number;
}
export interface CircuitDefinition {
  id: string;
  inputs: readonly string[];
  outputs: readonly string[];
  gates: readonly GateDefinition[];
  wires: readonly WireDefinition[];
}
