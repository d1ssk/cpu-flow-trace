import transport from './transport.js';
const {Transport, PROPAGATION_SPEED} = transport;
const evaluate=(kind,a,b)=>1-(a&b);
  class GateAdderCircuit extends Transport {
    constructor(definition) { super();this.definition=definition;this.kind='gate-adder';this.reset(); }
    reset(inputs={}) {
      const def=this.definition;
      this.time=0;this.sequence=0;this.queue=[];this.dirty=new Set();
      this.nodes=Object.fromEntries(def.nodes.map(n=>[n.id,{...n,output:n.kind==='INPUT'?(inputs[n.id]??0):0}]));
      this.gates=Object.fromEntries(def.gates.map(g=>[g.id,g]));
      const incoming=Object.fromEntries(def.wires.map(w=>[w.to,w.from]));
      const visited=new Set(),active=new Set();
      // Compute the stable initial state through the DAG, including NAND's
      // initial high outputs, without introducing artificial startup pulses.
      const resolve=id=>{
        if(visited.has(id))return this.nodes[id].output;
        if(active.has(id))throw new Error(`Cycle at ${id}`);
        active.add(id);
        const n=this.nodes[id];
        if(n.kind==='SOURCE') {
          const g=this.gates[n.gate];
          n.output=evaluate(g.kind,resolve(`${g.id}.a`),resolve(`${g.id}.b`));
        } else if(n.kind!=='INPUT') {
          if(!incoming[id])throw new Error(`Unconnected node: ${id}`);
          n.output=resolve(incoming[id]);
        }
        active.delete(id);visited.add(id);return n.output;
      };
      for(const n of def.nodes)resolve(n.id);
      this.wires=Object.fromEntries(def.wires.map(w=>{
        const value=this.nodes[w.from].output;
        return [w.id,{...w,delay:w.length/PROPAGATION_SPEED*1000,
          initial:value,source:value,arrived:value,transitions:[]}];
      }));
      this.fanout=Object.fromEntries(def.nodes.map(n=>[n.id,[]]));
      for(const w of Object.values(this.wires))this.fanout[w.from].push(w);
    }
    drive(id) {
      for(const w of this.fanout[id])this.send(w.id,this.nodes[id].output,value=>{
        const n=this.nodes[w.to];
        if(n.output===value)return;
        n.output=value;
        if(n.kind==='PORT')this.dirty.add(n.gate);
        else this.drive(n.id);
      });
    }
    flush() {
      for(const id of this.dirty) {
        const g=this.gates[id],out=this.nodes[`${id}.y`];
        const value=evaluate(g.kind,this.nodes[`${id}.a`].output,this.nodes[`${id}.b`].output);
        if(out.output!==value){out.output=value;this.drive(out.id);}
      }
      this.dirty.clear();
    }
    setInput(id,value) {
      const n=this.nodes[id];
      if(n?.kind!=='INPUT'||![0,1].includes(value))throw new Error('Invalid input');
      if(n.output!==value){n.output=value;this.drive(id);}
    }
  }
export default {GateAdderCircuit};
