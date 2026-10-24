import { assemble } from '../isa/assembler.js';
import { createMachine } from '../isa/emulator.js';
import { buildStage, stageById } from '../stages/index.js';
import { createCpu, cpuStopped } from '../sim/run.js';

export function runReference(stageId, program, steps) {
  const stage = stageById(stageId);
  const machine = createMachine({ profile: stage.profile, program: assemble(program.source) });
  if (program.switches) machine.setSwitches(program.switches);
  if (steps) for (let i = 0; i < steps; i++) machine.step();
  else machine.run(50000);
  return machine.state;
}

export function runCircuit(stageId, program, { cycles, maxCycles = 30000, options } = {}) {
  const circuit = buildStage(stageId);
  const sim = createCpu(circuit, program.source, { switches: program.switches, options });
  let count = 0;
  for (;;) {
    sim.settle();
    if (cycles !== undefined ? count >= cycles : cpuStopped(sim) || count >= maxCycles) break;
    sim.clock();
    count++;
  }
  return { sim, state: circuit.inspect(sim), cycles: count };
}

/* Architectural state shared by every FT16 implementation. */
export function architectural(state, features) {
  const out = { pc: state.pc, regs: state.regs, flags: state.flags, halted: state.halted, mem: state.mem };
  if (features.irq || features.mmio) out.led = state.led;
  return out;
}
export const referenceView = architectural;
