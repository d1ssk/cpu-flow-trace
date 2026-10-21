import transport from './transport.js';
const {Transport, PROPAGATION_SPEED} = transport;
  class GateCircuit extends Transport {
    constructor(definition) {super();this.definition=definition;this.reset();}
    reset() {
      const def=this.definition;this.time=0;this.sequence=0;this.queue=[];this.dirty=new Set();
      this.nodes=Object.fromEntries(def.nodes.map(n=>[n.id,{...n,output:0}]));
      this.gates=Object.fromEntries(def.gates.map(g=>[g.id,g]));
      const incoming=Object.fromEntries(def.wires.map(w=>[w.to,w.from])),visited=new Set(),active=new Set();
      const resolve=id=>{
        if(visited.has(id))return this.nodes[id].output;
        if(active.has(id))throw Error(`Combinational cycle: ${id}`);
        active.add(id);const n=this.nodes[id];
        if(n.kind==='SOURCE')n.output=1-(resolve(`${n.gate}.a`)&resolve(`${n.gate}.b`));
        else if(!['INPUT','CONSTANT'].includes(n.kind)) {
          if(!incoming[id])throw Error(`Unconnected pin: ${id}`);n.output=resolve(incoming[id]);
        }
        active.delete(id);visited.add(id);return n.output;
      };
      for(const n of def.nodes)resolve(n.id);
      this.wires=Object.fromEntries(def.wires.map(w=>{const value=this.nodes[w.from].output;return [w.id,{...w,delay:w.length/PROPAGATION_SPEED*1000,initial:value,source:value,arrived:value,transitions:[]}];}));
      this.fanout=Object.fromEntries(def.nodes.map(n=>[n.id,[]]));for(const w of Object.values(this.wires))this.fanout[w.from].push(w);
    }
    drive(id) {
      for(const w of this.fanout[id])this.send(w.id,this.nodes[id].output,value=>{
        const n=this.nodes[w.to];if(n.output===value)return;n.output=value;
        if(n.kind==='PORT')this.dirty.add(n.gate);else this.drive(n.id);
      });
    }
    flush() {
      for(const id of this.dirty) {
        const out=this.nodes[`${id}.y`],value=1-(this.nodes[`${id}.a`].output&this.nodes[`${id}.b`].output);
        if(out.output!==value){out.output=value;this.drive(out.id);}
      }
      this.dirty.clear();
    }
    setInput(id,value) {
      const n=this.nodes[id];if(n?.kind!=='INPUT'||![0,1].includes(value))throw Error('Invalid input');
      if(n.output!==value){n.output=value;this.drive(id);}
    }
    word(id) {const g=this.definition.groups.find(g=>g.id===id);return g.ids.reduce((n,key,bit)=>n+(this.nodes[key].output<<bit),0);}
    setWord(id,value) {
      const g=this.definition.groups.find(g=>g.id===id);
      if(!g||g.kind!=='INPUT'||!Number.isInteger(value)||value<0||value>=2**g.width)throw Error('Invalid word');
      g.ids.forEach((key,bit)=>this.setInput(key,(value>>bit)&1));
    }
  }
export default {GateCircuit};
