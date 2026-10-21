import transport from './transport.js';
const {Transport, PROPAGATION_SPEED} = transport;
import cmos from './cmos-nand.js';
const {solve,topology}=cmos;
  class MosAdderCircuit extends Transport {
    constructor(circuitDefinition) {super();this.definition=circuitDefinition;this.reset();}
    reset(inputs={}) {
      const definition=this.definition;
      this.time=0;this.sequence=0;this.queue=[];this.dirty=new Set();this.cells={};
      this.nodes=Object.fromEntries(definition.nodes.map(n=>[n.id,{...n,output:n.kind==='INPUT'?(inputs[n.id]??0):0}]));
      const incoming=Object.fromEntries(definition.wires.filter(w=>!w.probe).map(w=>[w.to,w.from])),visited=new Set(),active=new Set();
      const resolve=id=>{
        if(visited.has(id))return this.nodes[id].output;if(active.has(id))throw Error(`Cycle at ${id}`);active.add(id);
        const n=this.nodes[id];
        if(n.kind==='CORE') {
          const cell=solve(Object.fromEntries(topology.map(m=>[m.id,resolve(`${n.cell}:${m.id}`)])));this.cells[n.cell]=cell;n.output=cell.nets.Y;
        } else if(n.kind!=='INPUT')n.output=resolve(incoming[id]);
        active.delete(id);visited.add(id);return n.output;
      };
      for(const n of definition.nodes)resolve(n.id);
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
        const cell=solve(Object.fromEntries(topology.map(m=>[m.id,this.nodes[`${id}:${m.id}`].output])));this.cells[id]=cell;
        const core=this.nodes[`${id}:core`];if(core.output!==cell.nets.Y){core.output=cell.nets.Y;this.drive(core.id);}
        for(const w of this.probes[id])this.send(w.id,cell.nets[w.net],()=>{});
      }
      this.dirty.clear();
    }
    setInput(id,value) {
      const n=this.nodes[id];if(n?.kind!=='INPUT'||![0,1].includes(value))throw Error('Invalid input');
      if(n.output!==value){n.output=value;this.drive(id);}
    }
  }
export default {MosAdderCircuit};
