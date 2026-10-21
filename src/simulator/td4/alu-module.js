import transport from './transport.js';
const {Transport, PROPAGATION_SPEED} = transport;
  class ModuleAdderCircuit extends Transport {
    constructor(circuitDefinition) {super();this.definition=circuitDefinition;this.reset();}
    reset(inputs={}) {
      const definition=this.definition;
      this.time=0;this.sequence=0;this.queue=[];this.dirty=new Set();
      this.nodes=Object.fromEntries(definition.nodes.map(n=>[n.id,{...n,output:n.kind==='INPUT'?(inputs[n.id]??0):0}]));
      const incoming=Object.fromEntries(definition.wires.map(w=>[w.to,w.from])),visited=new Set();
      const resolve=id=>{
        if(visited.has(id))return this.nodes[id].output;
        const n=this.nodes[id];
        if(n.kind==='SOURCE') {
          const a=resolve(`${n.stage}.a`),b=resolve(`${n.stage}.b`),c=resolve(`${n.stage}.cin`);
          n.output=id.endsWith('.s')?a^b^c:(a&b)|((a^b)&c);
        } else if(n.kind!=='INPUT')n.output=resolve(incoming[id]);
        visited.add(id);return n.output;
      };
      for(const n of definition.nodes)resolve(n.id);
      this.wires=Object.fromEntries(definition.wires.map(w=>{const value=this.nodes[w.from].output;return [w.id,{...w,delay:w.length/PROPAGATION_SPEED*1000,initial:value,source:value,arrived:value,transitions:[]}];}));
      this.fanout=Object.fromEntries(definition.nodes.map(n=>[n.id,[]]));for(const w of Object.values(this.wires))this.fanout[w.from].push(w);
    }
    output(id,value) {
      if(this.nodes[id].output===value)return;this.nodes[id].output=value;
      for(const w of this.fanout[id])this.send(w.id,value,v=>{const n=this.nodes[w.to];if(n.output===v)return;if(n.kind==='PORT'){n.output=v;this.dirty.add(n.stage);}else this.output(n.id,v);});
    }
    flush() {
      for(const id of this.dirty) {
        const a=this.nodes[`${id}.a`].output,b=this.nodes[`${id}.b`].output,c=this.nodes[`${id}.cin`].output;
        this.output(`${id}.s`,a^b^c);this.output(`${id}.cout`,(a&b)|((a^b)&c));
      }
      this.dirty.clear();
    }
    setInput(id,value) {if(this.nodes[id]?.kind!=='INPUT'||![0,1].includes(value))throw Error('Invalid input');this.output(id,value);}
  }
export default {ModuleAdderCircuit};
