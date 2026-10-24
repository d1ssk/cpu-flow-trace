import { Simulator } from './simulator.js';
import { assemble } from '../isa/assembler.js';
import { assembleTd4 } from '../td4/isa.js';

/* Assembles a source for the circuit's instruction set (TD4 for stage 0). */
export function assembleFor(circuit, source, t) {
  return circuit.family === 'td4' ? assembleTd4(source, t) : assemble(source, t);
}

/* Runs a circuit cycle by cycle without animation until the CPU stops. */
export function createCpu(circuit, source, { switches = 0, options = {} } = {}) {
  const program = typeof source === 'string' ? assembleFor(circuit, source) : source;
  const sim = new Simulator(circuit, { program, options });
  const sw = switchModule(sim);
  if (switches && sw) sim.setExternal(sw, 'sw', switches);
  return sim;
}

/* The module holding the switches: I/O (FT16) or INPUT (TD4). */
export const switchModule = sim => (sim.modules.has('IO') ? 'IO' : sim.modules.has('IN') ? 'IN' : null);

export function cpuStopped(sim) {
  const s = sim.circuit.inspect(sim);
  if (!s.halted) return false;
  if (!s.ie) return true;
  return !(s.timer?.period || s.timer?.pending);
}

export function runCpu(sim, maxCycles = 20000) {
  for (let i = 0; i < maxCycles; i++) {
    sim.settle();
    if (cpuStopped(sim)) return sim;
    sim.clock();
  }
  sim.settle();
  return sim;
}
