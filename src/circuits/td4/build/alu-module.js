import runtime from '../../../simulator/td4/alu-module.js';
const {ModuleAdderCircuit}=runtime;
import simulationAPI from './simulation.js';
import geometryAPI from './geometry.js';
import aluAPI from './alu.js';
/* Four full-adder primitives, connected by timed carry wires. */
const {Transport,PROPAGATION_SPEED}=simulationAPI;
const {lengthOf}=geometryAPI;
const {definition:base}=aluAPI;
function build() {
  const def={id:'alu-module',width:base.width,height:base.height,nodes:[],wires:[],stages:[],inputs:[...base.inputs],outputs:[...base.outputs],portGroups:base.portGroups.map(g=>({...g,ids:[...g.ids]}))};
  const nodes={};
  function pin(id,x,y,kind,stage) {const n={id,x,y,kind,stage};nodes[id]=n;def.nodes.push(n);}
  function wire(from,to,bends=[]) {const a=nodes[from],b=nodes[to],points=[[a.x,a.y],...bends,[b.x,b.y]];def.wires.push({id:`${from}>${to}`,from,to,points,length:lengthOf(points)});}
  for(const n of base.nodes.filter(n=>['INPUT','OUTPUT'].includes(n.kind)))pin(n.id,n.x,n.y,n.kind);
  for(let bit=0;bit<4;bit++) {
    const id=`FA${bit}`,x=438-bit*136,y=30,width=112,height=108;
    def.stages.push({id,bit,x,y,width,height});
    pin(`${id}.a`,x+32,y,'PORT',id);pin(`${id}.b`,x+80,y,'PORT',id);
    pin(`${id}.cin`,x+width,84,'PORT',id);pin(`${id}.cout`,x,84,'SOURCE',id);pin(`${id}.s`,x+56,y+height,'SOURCE',id);
    for(const [prefix,port,offset] of [['A','a',0],['B','b',5]]) {
      const from=nodes[`${prefix}${bit}`],to=nodes[`${id}.${port}`],lane=10+offset+bit*1.2;
      wire(from.id,to.id,[[from.x,lane],[to.x,lane]]);
    }
    const output=nodes[`S${bit}`],lane=146+bit*3;
    wire(`${id}.s`,output.id,[[x+56,lane],[output.x,lane]]);
    if(bit)wire(`FA${bit-1}.cout`,`${id}.cin`);
  }
  wire('Cin','FA0.cin',[[560,nodes.Cin.y],[560,84]]);
  wire('FA3.cout','Cout',[[12,84],[12,162],[nodes.Cout.x,162]]);
  return def;
}
const definition=build();
const api={definition,ModuleAdderCircuit};export default api;
