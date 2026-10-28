import { PAGE_BITS } from '../isa/spec.js';

/* Identify the current PC/stage-register instructions, with a distinct
 * propagation or capture-wait phase. Never retain the completed instruction
 * after a clock: the new PC/stage registers identify the next work even while
 * their outputs travel. A completed HALT has no active annotation. */
export class InstructionCursor {
  constructor(sim) {
    this.sim = sim;
    this.update();
  }

  update() {
    const state = this.sim.circuit.inspect(this.sim);
    this.phase = state.halted ? 'halted' : this.sim.busy ? 'propagating' : 'waiting';
    this.tags = state.halted ? new Map() : this.capture(state);
    return this.tags;
  }

  capture(state = this.sim.circuit.inspect(this.sim)) {
    const sim = this.sim, tags = new Map();
    for (const stage of state.stages) {
      if (stage.valid === false || stage.pc === null || stage.pc === undefined) continue;
      let address = stage.pc;
      if (sim.modules.has('ITLB') && !state.kernel) {
        const entry = sim.state('ITLB').entries.find(e => e.valid && e.vpn === stage.pc >> PAGE_BITS);
        if (entry) address = (entry.ppn << PAGE_BITS) | (stage.pc & ((1 << PAGE_BITS) - 1));
      }
      tags.set(address, [...(tags.get(address) ?? []), stage.name]);
    }
    return tags;
  }
}
