import runtime from '../../../simulator/td4/dff-c-module.js';
const {ModuleDffCircuit}=runtime;
import gateNetworkAPI from './gate-network.js';
import simulationAPI from './simulation.js';
import geometryAPI from './geometry.js';
import dffCAPI from './dff-c.js';
/* Level-sensitive latch primitives connected by timed wires, not a DFF edge
 * callback. Both latch enables change phase together at their terminals. */
const {GateCircuit}=gateNetworkAPI;
const {PROPAGATION_SPEED}=simulationAPI;
const {lengthOf}=geometryAPI;
const {definition:base}=dffCAPI;
function build() {
  const def={...base,id:'dff-c-module',nodes:[],wires:[],gates:[],modules:[
    {id:'M',label:'Master',x:4,y:6,width:80,height:28},
    {id:'S',label:'Slave',x:4,y:44,width:80,height:28},
    {id:'CK',label:'NOT',x:89,y:15,width:17,height:12},
  ]},nodes={};
  const pin=(id,x,y,kind='JUNCTION',gate=null,initial=0)=>{const n={id,x,y,kind,gate,initial};nodes[id]=n;def.nodes.push(n);};
  const link=(from,to,bends=[])=>{const a=nodes[from],b=nodes[to],points=[[a.x,a.y],...bends,[b.x,b.y]];def.wires.push({id:`${from}>${to}`,from,to,points,length:lengthOf(points)});};
  for(const id of ['D','CLK','Q','clock']){const n=base.nodes.find(n=>n.id===id);pin(id,n.x,n.y,n.kind);}
  pin('M.d',55,6,'PORT','M');pin('M.en',84,20,'PORT','M',1);pin('M.q',55,34,'SOURCE','M');
  pin('S.d',55,44,'PORT','S');pin('S.en',84,58,'PORT','S');pin('S.q',55,72,'SOURCE','S');
  pin('CK.d',106,21,'PORT','CK');pin('CK.q',89,21,'SOURCE','CK',1);
  const entry=base.wires.find(w=>w.id==='CLK>clock');link('CLK','clock',entry.points.slice(1,-1).map(p=>[...p]));
  link('D','M.d');link('M.q','S.d');link('S.q','Q');
  link('clock','CK.d',[[102,30],[108,30],[108,21]]);link('CK.q','M.en',[[89,20]]);
  const inverted=def.wires.find(w=>w.to==='CK.d').length+def.wires.find(w=>w.to==='M.en').length;
  const direct=Math.abs(nodes.clock.x-84)+Math.abs(nodes.clock.y-58),bottom=58+(inverted-direct)/2;
  link('clock','S.en',[[102,bottom],[88,bottom],[88,58]]);
  return def;
}
const definition=build();
function restore(sim,{D=0,CLK=0,Q=0}={}) {
  const settle=()=>{let n=0;while(sim.busy){if(++n>10000)throw Error('DFF restore did not settle');sim.next();}};
  const set=(id,value)=>{sim.setInput(id,value);settle();};
  sim.reset();set('D',Q);set('CLK',1);set('CLK',CLK);set('D',D);
  sim.time=0;sim.sequence=0;
  for(const w of Object.values(sim.wires)){w.initial=w.arrived;w.transitions=[];}
}
const api={definition,ModuleDffCircuit,restore};export default api;
