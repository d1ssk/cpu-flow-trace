import transport from './transport.js';
const {Transport, PROPAGATION_SPEED} = transport;
import network from './gate-network.js';
const {GateCircuit}=network;
import cmos from './cmos-nand.js';
const {solve,topology}=cmos;
  class MosDffCircuit extends GateCircuit {
    constructor(circuitDefinition){super(circuitDefinition);}
    reset() {
      const definition=this.definition;
      this.time=0;this.sequence=0;this.queue=[];this.dirty=new Set();this.cells={};
      this.nodes=Object.fromEntries(definition.nodes.map(n=>[n.id,{...n,output:n.initial}]));
      // Seed a known Q=0 latch state, then fill its passive wires before
      // resolving switches. Reset is not an electrical power-up simulation.
      for(let pass=0;pass<32;pass++)for(const w of definition.wires.filter(w=>!w.probe))this.nodes[w.to].output=this.nodes[w.from].output;
      let settled=false;
      for(let pass=0;pass<200;pass++) {
        let changed=false;
        for(const w of definition.wires.filter(w=>!w.probe)) {
          const n=this.nodes[w.to],value=this.nodes[w.from].output;
          if(n.output!==value){n.output=value;changed=true;}
        }
        for(const c of definition.cells) {
          const solved=solve(Object.fromEntries(topology.map(m=>[m.id,this.nodes[`${c.id}:${m.id}`].output])));
          this.cells[c.id]=solved;const out=this.nodes[`${c.id}:core`];
          if(out.output!==solved.nets.Y){out.output=solved.nets.Y;changed=true;}
        }
        if(!changed){settled=true;break;}
      }
      if(!settled)throw Error('MOS feedback reset did not settle');
      this.wires=Object.fromEntries(definition.wires.map(w=>{const value=w.probe?this.cells[w.internal].nets[w.net]:this.nodes[w.from].output;return [w.id,{...w,delay:w.length/PROPAGATION_SPEED*1000,initial:value,source:value,arrived:value,transitions:[]}];}));
      this.fanout=Object.fromEntries(definition.nodes.map(n=>[n.id,[]]));this.probes=Object.fromEntries(definition.cells.map(c=>[c.id,[]]));
      for(const w of Object.values(this.wires))if(w.probe)this.probes[w.internal].push(w);else this.fanout[w.from].push(w);
    }
    drive(id) {
      for(const w of this.fanout[id])this.send(w.id,this.nodes[id].output,value=>{
        const n=this.nodes[w.to];if(n.output===value)return;n.output=value;
        if(n.kind==='CONTROL')this.dirty.add(n.cell);else this.drive(n.id);
      });
    }
    flush() {
      for(const id of this.dirty) {
        const solved=solve(Object.fromEntries(topology.map(m=>[m.id,this.nodes[`${id}:${m.id}`].output])));this.cells[id]=solved;
        const out=this.nodes[`${id}:core`];if(out.output!==solved.nets.Y){out.output=solved.nets.Y;this.drive(out.id);}
        for(const w of this.probes[id])this.send(w.id,solved.nets[w.net],()=>{});
      }
      this.dirty.clear();
    }
  }
export default {MosDffCircuit};
