import transport from './transport.js';
const {Transport, PROPAGATION_SPEED} = transport;
import network from './gate-network.js';
const {GateCircuit}=network;
  function evaluate(m,read) {
    const v=p=>read(m.id+'.'+p);
    if(m.kind==='MUX4')return {y:[v('a'),v('b'),v('input'),v('zero')][v('s0')+2*v('s1')]};
    if(m.kind==='MUX2')return {y:v('sel')?v('b'):v('a')};
    if(m.kind==='HA')return {s:v('a')^v('b'),c:v('a')&v('b')};
    const dest=v('op2')+2*v('op3'),branch=dest===3;
    return {sel0:branch?1:v('op0'),sel1:branch?1:v('op1'),enA:+(dest===0),enB:+(dest===1),enOut:+(dest===2),jump:+(branch&&(v('op0')||!v('cf')))};
  }

  class ModuleCircuit extends GateCircuit {
    reset(words={}) {
      const def=this.definition;this.time=0;this.sequence=0;this.queue=[];this.dirty=new Set();
      this.nodes=Object.fromEntries(def.nodes.map(n=>[n.id,{...n,output:n.initial??0}]));
      for(const g of def.groups.filter(g=>g.kind==='INPUT'))g.ids.forEach((id,bit)=>this.nodes[id].output=((words[g.id]??0)>>bit)&1);
      this.modules=Object.fromEntries(def.modules.map(m=>[m.id,m]));
      const incoming=Object.fromEntries(def.wires.map(w=>[w.to,w.from])),visited=new Set();
      const resolve=id=>{
        if(visited.has(id))return this.nodes[id].output;
        const n=this.nodes[id];
        if(n.kind==='SOURCE')n.output=evaluate(this.modules[n.gate],resolve)[n.port];
        else if(!['INPUT','CONSTANT'].includes(n.kind))n.output=resolve(incoming[id]);
        visited.add(id);return n.output;
      };
      for(const n of def.nodes)resolve(n.id);
      this.wires=Object.fromEntries(def.wires.map(w=>{const value=this.nodes[w.from].output;return [w.id,{...w,delay:w.length/PROPAGATION_SPEED*1000,initial:value,source:value,arrived:value,transitions:[]}];}));
      this.fanout=Object.fromEntries(def.nodes.map(n=>[n.id,[]]));for(const w of Object.values(this.wires))this.fanout[w.from].push(w);
    }
    flush() {
      for(const id of this.dirty)for(const [p,value] of Object.entries(evaluate(this.modules[id],key=>this.nodes[key].output))) {
        const n=this.nodes[id+'.'+p];if(n.output!==value){n.output=value;this.drive(n.id);}
      }
      this.dirty.clear();
    }
  }
export default {ModuleCircuit};
