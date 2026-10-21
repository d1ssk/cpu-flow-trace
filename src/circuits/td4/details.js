import loaders from './loaders.js';
import specs from './specs.json' with { type: 'json' };
import alu from '../../simulator/td4/alu.js';
import aluModule from '../../simulator/td4/alu-module.js';
import aluMos from '../../simulator/td4/alu-mos.js';
import dff from '../../simulator/td4/dff-c.js';
import dffModule from '../../simulator/td4/dff-c-module.js';
import dffMos from '../../simulator/td4/dff-c-mos.js';
import modules from '../../simulator/td4/detail-modules.js';
import mos from '../../simulator/td4/detail-mos.js';
import network from '../../simulator/td4/gate-network.js';

const types={
 ALU:{nand:alu.GateAdderCircuit,module:aluModule.ModuleAdderCircuit,mos:aluMos.MosAdderCircuit},
 combinational:{nand:network.GateCircuit,module:modules.ModuleCircuit,mos:mos.MosCircuit},
 register:{nand:dff.DffCircuit,module:dffModule.ModuleDffCircuit,mos:dffMos.MosDffCircuit},
};
const definitions=new Map(),pending=new Map();
const normalized=view=>view.startsWith('mos')?'mos':view;
async function load(id,view) {
 if(!specs[id])throw Error('Unknown module '+id);
 const mode=normalized(view),key=id+'-'+mode;
 if(!['module','nand','mos'].includes(mode))throw Error('Unknown view '+view);
 if(definitions.has(key))return;
 if(!pending.has(key))pending.set(key,loaders[key]()
  .then(data=>{definitions.set(key,data.default);})
  .finally(()=>pending.delete(key)));
 await pending.get(key);
}
async function loadAll(view){if(view!=='overview')await Promise.all(Object.keys(specs).map(id=>load(id,view)));}
function definition(id,view){
 const def=definitions.get(id+'-'+normalized(view));
 if(!def)throw Error('Circuit not loaded: '+id+' / '+view);
 return def;
}
function create(id,view='nand') {
 view=normalized(view);
 const group=id==='ALU'?'ALU':['MUX','DEC','NEXT'].includes(id)?'combinational':'register';
 const sim=new types[group][view](definition(id,view));
 if(id==='ALU') {
  sim.word=function(group){return this.definition.groups.find(g=>g.id===group).ids.reduce((v,id,i)=>v|(this.nodes[id].output<<i),0);};
  sim.setWord=function(group,value){this.definition.groups.find(g=>g.id===group).ids.forEach((id,i)=>this.setInput(id,(value>>i)&1));};
 }
 return sim;
}
  function settle(sim){let n=0;while(sim.busy){if(++n>30000)throw Error('Detail failed to settle');sim.next();}}
  function restore(sim,words) {
    const set=(id,v)=>{sim.setWord(id,v);settle(sim);};
    if(sim.definition.groups.some(g=>g.id==='CLK')) {
      const enabled=sim.definition.groups.some(g=>g.id==='EN');
      if(enabled)set('EN',1);set('D',words.Q);set('CLK',1);set('CLK',words.CLK);if(enabled)set('EN',words.EN);set('D',words.D);
    } else for(const g of sim.definition.groups.filter(g=>g.kind==='INPUT'))set(g.id,words[g.id]);
    sim.time=0;sim.sequence=0;for(const w of Object.values(sim.wires)){w.initial=w.arrived;w.transitions=[];}
  }

export default {specs,definition,create,restore,settle,load,loadAll};
