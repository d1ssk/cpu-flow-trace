import transport from './transport.js';
const {Transport, PROPAGATION_SPEED} = transport;
import network from './gate-network.js';
const {GateCircuit}=network;
  class ModuleDffCircuit extends GateCircuit {
    constructor(circuitDefinition){super(circuitDefinition);}
    reset() {
      this.time=0;this.sequence=0;this.queue=[];this.dirty=new Set();
      this.nodes=Object.fromEntries(this.definition.nodes.map(n=>[n.id,{...n,output:n.initial}]));
      this.wires=Object.fromEntries(this.definition.wires.map(w=>{const value=this.nodes[w.from].output;return [w.id,{...w,delay:w.length/PROPAGATION_SPEED*1000,initial:value,source:value,arrived:value,transitions:[]}];}));
      this.fanout=Object.fromEntries(this.definition.nodes.map(n=>[n.id,[]]));
      for(const w of Object.values(this.wires))this.fanout[w.from].push(w);
    }
    flush() {
      for(const id of this.dirty) {
        const value=this.nodes[`${id}.d`].output,out=this.nodes[`${id}.q`];
        const kind=this.definition.modules.find(m=>m.id===id)?.kind??(id==='CK'?'NOT':'LATCH');
        if(kind==='LATCH'&&!this.nodes[`${id}.en`].output)continue;
        const next=kind==='NOT'?1-value:kind==='MUX'?(this.nodes[`${id}.en`].output?value:this.nodes[`${id}.h`].output):value;
        if(out.output!==next){out.output=next;this.drive(out.id);}
      }
      this.dirty.clear();
    }
  }
  // Rebuild a stable state through real input transitions. A representation
  // switch preserves the held bit even when D differs from it at CLK=H.
export default {ModuleDffCircuit};
