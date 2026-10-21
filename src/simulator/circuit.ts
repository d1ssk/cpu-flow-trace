import { evaluateNand } from '../circuits/nand';
import { Transport, lengthOf, PROPAGATION_SPEED } from './transport';
import type { Bit, CircuitDefinition, Signal } from './types';

/** A connected, acyclic NAND demonstration. Sequential circuits will supply
 * their own initialization/settling policy when DFF and TD4 are integrated. */
export class Circuit extends Transport {
  readonly values: Record<string, Signal> = {};
  private readonly dirty = new Set<string>();

  constructor(readonly definition: CircuitDefinition) {
    super();
    for (const input of definition.inputs) this.values[input] = 0;
    // Definitions are topologically ordered. Settle before observation starts.
    for (const gate of definition.gates) {
      for (const port of ['a', 'b']) {
        const wire = definition.wires.find(w => w.to === `${gate.id}.${port}`);
        if (!wire || this.values[wire.from] === undefined) throw new Error(`Unconnected input: ${gate.id}.${port}`);
        this.values[wire.to] = this.values[wire.from];
      }
      this.values[`${gate.id}.y`] = evaluateNand(this.values[`${gate.id}.a`], this.values[`${gate.id}.b`]);
    }
    for (const wire of definition.wires) {
      const value = this.values[wire.from];
      const length = lengthOf(wire.points);
      if (value === undefined || length <= 0) throw new Error(`Invalid wire: ${wire.id}`);
      this.values[wire.to] = value;
      this.wires[wire.id] = {
        ...wire, length, delay: length / PROPAGATION_SPEED * 1000,
        initial: value, source: value, arrived: value, transitions: [],
      };
    }
  }

  private drive(id: string) {
    for (const wire of this.definition.wires.filter(w => w.from === id)) {
      this.send(wire.id, this.values[id], value => {
        if (this.values[wire.to] === value) return;
        this.values[wire.to] = value;
        if (wire.to.includes('.')) this.dirty.add(wire.to.split('.')[0]);
      });
    }
  }

  protected override flush() {
    for (const id of this.dirty) {
      const output = evaluateNand(this.values[`${id}.a`], this.values[`${id}.b`]);
      if (this.values[`${id}.y`] !== output) {
        this.values[`${id}.y`] = output;
        this.drive(`${id}.y`);
      }
    }
    this.dirty.clear();
  }

  setInput(id: string, value: Bit) {
    if (!this.definition.inputs.includes(id) || (value !== 0 && value !== 1)) throw new Error('Invalid input');
    if (this.values[id] === value) return;
    this.values[id] = value;
    this.drive(id);
  }
}
