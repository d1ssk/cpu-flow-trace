import circuit from './circuit.js';
import full from './full-circuit.js';
import details from './details.js';

export const views = ['overview', 'module', 'nand', 'mos-short', 'mos-power'] as const;
export type View = typeof views[number];
export type DetailView = Exclude<View, 'overview'>;
export type Signal = number | 'Z' | 'X';
export type Words = Record<string, number>;
export interface Node { id: string; kind: string; output: Signal; x: number; y: number; gate?: string; stage?: string }
export interface Wire {
  id: string; from: string; to: string; layoutId?: string; net?: string;
  points: number[][]; length: number; delay: number;
  source: Signal; arrived: Signal; initial: Signal;
  transitions: { time: number; value: Signal }[];
}
export interface Group { id: string; label: string; kind: string; width: number; ids: string[] }
export interface Part {
  time: number; busy: boolean; nodes: Record<string, Node>; wires: Record<string, Wire>;
  definition: { title: string; width: number; height: number; groups: Group[]; nodes: Node[] };
  cells?: Record<string, { nets: Record<string, Signal>; devices: { id: string; type: string; on: boolean; a: string; b: string }[] }>;
  word(id: string): number; setWord(id: string, value: number): void;
  setInput(id: string, value: number): void; advance(delta: number): void; next(): boolean; reset(): void;
}
export interface Cpu {
  time: number; busy: boolean; ready: boolean; clockActive: boolean; cycles: number;
  rom: number[]; lastExecuted: { address: number; byte: number } | null;
  nodes: Record<string, Node>; wires: Record<string, Wire>; parts?: Record<string, Part>;
  value(id: string): number; setInput(id: string, value: number): void;
  requestCycle(): boolean; advance(delta: number): void; next(): boolean; reset(): void;
  snapshot(): Words;
}
export interface Spec { title: string; ports: Record<string, string> }
// The migrated logical kernels remain plain ES modules. This boundary describes
// the public protocol used by React, without coupling it to a specific kernel.
export const detailRuntime = details as unknown as {
  specs: Record<string, Spec>;
  load(id: string, view: DetailView): Promise<void>; loadAll(view: View): Promise<void>;
  create(id: string, view: DetailView): Part; restore(part: Part, words: Words): void; settle(part: Part): void;
};
const BlockCpu = circuit.TD4Circuit as unknown as new (bytes: number[]) => Cpu;
const DetailedCpu = full.DetailedTD4Circuit as unknown as new (bytes: number[], view: DetailView) => Cpu;
export function createCpu(bytes: number[], view: View): Cpu {
  return view === 'overview' ? new BlockCpu(bytes) : new DetailedCpu(bytes, view);
}
export const settleCpu = full.settle as (cpu: Cpu) => void;
export const switchCpu = full.switchView as unknown as (cpu: Cpu, view: View) => Cpu;
export function parseView(value: string | null, detail = false): View {
  return views.includes(value as View) && (!detail || value !== 'overview') ? value as View : 'mos-power';
}
