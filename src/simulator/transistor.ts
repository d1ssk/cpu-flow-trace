import { lengthOf, PROPAGATION_SPEED, Transport } from './transport';
import type { Bit, Signal, WireDefinition } from './types';

export type MosType = 'n' | 'p';
export type TransistorInput = 'gate' | 'source';

const connections: WireDefinition[] = [
  { id: 'gate', from: 'gate-switch', to: 'G', points: [[72, 62], [110, 62], [110, 48], [128, 48]] },
  { id: 'source', from: 'source-switch', to: 'S', points: [[72, 20], [140, 20], [140, 36]] },
  { id: 'drain', from: 'D', to: 'probe', points: [[140, 60], [140, 76], [192, 76]] },
];

/** A single ideal switch with an undriven drain when open. Only wires add delay;
 * there is no capacitance, body diode, or analog transistor model here. */
export class TransistorExperiment extends Transport {
  type: MosType = 'n';
  readonly inputs: Record<TransistorInput, Bit> = { gate: 0, source: 1 };

  constructor() {
    super();
    for (const definition of connections) {
      const value: Signal = definition.id === 'drain' ? 'Z' : this.inputs[definition.id as TransistorInput];
      const length = lengthOf(definition.points);
      this.wires[definition.id] = {
        ...definition, length, delay: length / PROPAGATION_SPEED * 1000,
        initial: value, source: value, arrived: value, transitions: [],
      };
    }
  }

  get conducting() { return this.wires.gate.arrived === (this.type === 'n' ? 1 : 0); }
  get drain(): Signal { return this.conducting ? this.wires.source.arrived : 'Z'; }

  setInput(input: TransistorInput, value: Bit) {
    this.inputs[input] = value;
    this.send(input, value, () => {});
  }

  setType(type: MosType) {
    this.type = type;
    this.flush();
  }

  protected override flush() {
    // Transport batches simultaneous arrivals before evaluating the device.
    this.send('drain', this.drain, () => {});
  }
}
