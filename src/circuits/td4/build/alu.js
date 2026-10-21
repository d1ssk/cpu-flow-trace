import runtime from '../../../simulator/td4/alu.js';
const {GateAdderCircuit}=runtime;
import simulationAPI from './simulation.js';
import geometryAPI from './geometry.js';
/* Compact NAND full adder derived from workbench/gate-adder.js.
 * Every connection uses Transport with its displayed length. */
const {Transport,PROPAGATION_SPEED}=simulationAPI;
const {lengthOf}=geometryAPI;
const evaluate=(kind,a,b)=>1-(a&b);
function build() {
  const def={id:'alu-nand',width:535,height:145,nodes:[],gates:[],wires:[],stages:[],inputs:[],outputs:[]};
  const nodes={};
  function pin(id,x,y,kind='JUNCTION',gate=null) {
    const n={id,x,y,kind,gate};
    nodes[id]=n;def.nodes.push(n);
    if(kind==='INPUT')def.inputs.push(id);
    if(kind==='OUTPUT')def.outputs.push(id);
    return id;
  }
  function connect(from,to,bends=[]) {
    const a=nodes[from],b=nodes[to];
    const points=[[a.x,a.y],...bends,[b.x,b.y]].filter((p,i,all)=>
      i===0||p[0]!==all[i-1][0]||p[1]!==all[i-1][1]);
    def.wires.push({id:`${from}>${to}`,from,to,points,length:lengthOf(points)});
  }
  function gate(id,kind,x,y) {
    def.gates.push({id,kind,x,y});
    pin(`${id}.a`,x-11,y-1.2/.195,'PORT',id);pin(`${id}.b`,x+11,y-1.2/.195,'PORT',id);
    pin(`${id}.y`,x,y+44+.8/.195,'SOURCE',id);
    return `${id}.y`;
  }
  let previousCarry;
  for(let bit=0;bit<4;bit++) {
    const center=1020-bit*280,p=`B${bit}`;
    def.stages.push({bit,center});
    const pt=(x,y)=>[center+x,y];
    const tap=(name,x,y)=>pin(`${p}.${name}`,center+x,y);
    const g=(name,kind,x,y)=>gate(`${p}.${name}`,kind,center+x,y);
    const link=(from,to,...bends)=>connect(from,to,bends.map(([x,y])=>pt(x,y)));
    pin(`A${bit}`,center-48,80,'INPUT');pin(`B${bit}`,center+48,80,'INPUT');
    const a=tap('A',-48,112),b=tap('B',48,124);
    link(`A${bit}`,a);link(`B${bit}`,b);
    const cinX=110,cinY=330;
    const cin=pin(bit===0?'Cin':`C${bit}`,center+cinX,cinY,bit===0?'INPUT':'JUNCTION');
    if(previousCarry) {
      const from=nodes[previousCarry],channel=center+130;
      connect(previousCarry,cin,[[channel,from.y],[channel,cinY]]);
    }
    const c=tap('C',88,350);
    link(cin,c,[cinX,350]);
    let sum,carry;
    const n1=g('N1','NAND',0,140),n2=g('N2','NAND',-48,208);
    const n3=g('N3','NAND',48,208),n4=g('N4','NAND',0,276);
    const n5=g('N5','NAND',0,364),n6=g('N6','NAND',-48,432);
    const n7=g('N7','NAND',48,432);
    sum=g('N8','NAND',0,500);carry=g('N9','NAND',-102,432);
    const ab=tap('ABn',0,194),abLeft=tap('ABleft',-37,194);
    const xor=tap('P',0,330),pc=tap('PCn',0,420),pcLeft=tap('PCleft',-37,420);
    link(a,`${p}.N1.a`,[-11,112]);
    link(b,`${p}.N1.b`,[11,124]);
    link(a,`${p}.N2.a`,[-76,112],[-76,180],[-59,180]);
    link(b,`${p}.N3.b`,[76,124],[76,180],[59,180]);
    link(n1,ab);
    link(ab,abLeft);link(abLeft,`${p}.N2.b`);
    link(ab,`${p}.N3.a`,[37,194]);
    link(n2,`${p}.N4.a`,[-48,264],[-11,264]);
    link(n3,`${p}.N4.b`,[48,264],[11,264]);
    link(n4,xor);
    link(xor,`${p}.N5.a`,[-11,330]);
    link(xor,`${p}.N6.a`,[-76,330],[-76,404],[-59,404]);
    link(c,`${p}.N5.b`,[11,350]);
    link(c,`${p}.N7.b`,[88,420],[59,420]);
    link(n5,pc);
    link(pc,pcLeft);link(pcLeft,`${p}.N6.b`);
    link(pc,`${p}.N7.a`,[37,420]);
    link(n6,`${p}.N8.a`,[-48,488],[-11,488]);
    link(n7,`${p}.N8.b`,[48,488],[11,488]);
    link(abLeft,`${p}.N9.a`,[-132,194],[-132,420],[-113,420]);
    link(pcLeft,`${p}.N9.b`,[-91,420]);
    pin(`S${bit}`,center,590,'OUTPUT');
    link(sum,`S${bit}`);
    previousCarry=carry;
    if(bit===3) {
      pin('Cout',center-102,590,'OUTPUT');link(carry,'Cout');
    }
  }
  // Use the former terminal-label space for taller gates. Each row keeps
  // enough routing space above its pins; every drawn wire is still simulated.
  const rows=[140,208,276,364,432,500];
  const levels=[[80,0],[112,14.4],[124,15.8]];
  for(const [i,y] of rows.entries()) {
    levels.push([y-1.2/.195,17+i*19.5],[y+44+.8/.195,33.2+i*19.5]);
  }
  levels.push([590,def.height]);
  function vertical(y) {
    const i=levels.findIndex(([source])=>source>=y);
    if(i===0)return levels[0][1];
    if(i<0)return levels.at(-1)[1];
    const [a,ya]=levels[i-1],[b,yb]=levels[i];
    return ya+(y-a)/(b-a)*(yb-ya);
  }
  const point=([x,y])=>[8+(x-48)*519/1082,vertical(y)];
  for(const n of def.nodes) [n.x,n.y]=point([n.x,n.y]);
  for(const g of def.gates) [g.x,g.y]=point([g.x,g.y-1.2/.195]);
  for(const stage of def.stages) stage.center=point([stage.center,80])[0];
  for(const w of def.wires)w.points=w.points.map(point);
  // Four distinct one-bit wires enter/leave together, as on the TD4 module.
  // There is no shared bus value: each bit retains its own transport delay.
  def.portGroups=[
    {label:'X',ids:[0,1,2,3].map(i=>`A${i}`),x:260,y:0},
    {label:'im',ids:[0,1,2,3].map(i=>`B${i}`),x:490,y:0},
    {label:'S',ids:[0,1,2,3].map(i=>`S${i}`),x:330,y:def.height},
    {label:'C',ids:['Cout'],x:55*def.width/570,y:def.height},
    {label:'Cin',ids:['Cin'],x:535,y:nodes.Cin.y},
  ];
  for(const group of def.portGroups)for(const [bit,id] of group.ids.entries()) {
    const n=nodes[id];n.x=group.x+bit*3;n.y=group.y;
    if(n.kind==='INPUT') {
      const w=def.wires.find(w=>w.from===id),target=nodes[w.to];
      const lane=id.startsWith('A')?5.5+bit*1.1:9.9+bit*1.1;
      w.points=id==='Cin'?[[n.x,n.y],[target.x,n.y],[target.x,target.y]]:
        [[n.x,n.y],[n.x,lane],[target.x,lane],[target.x,target.y]];
    } else {
      const w=def.wires.find(w=>w.to===id),source=nodes[w.from];
      const lane=id==='Cout'?def.height-3:def.height-10+bit*1.6;
      w.points=[[source.x,source.y],[source.x,lane],[n.x,lane],[n.x,n.y]];
    }
  }
  // Match the enlarged TD4 ALU while preserving the compact fixed topology.
  const scaleX=570/def.width,scaleY=166/def.height;
  for(const n of def.nodes) {n.x*=scaleX;n.y*=scaleY;}
  for(const g of def.gates) {g.x*=scaleX;g.y*=scaleY;}
  for(const group of def.portGroups) {group.x*=scaleX;group.y*=scaleY;}
  for(const stage of def.stages)stage.center*=scaleX;
  for(const w of def.wires)w.points=w.points.map(([x,y])=>[x*scaleX,y*scaleY]);
  def.width=570;def.height=166;
  def.gateShape={width:15*scaleX,height:16.2*scaleY,bubble:.9};
  for(const w of def.wires)w.length=lengthOf(w.points);
  def.counts=def.gates.reduce((counts,g)=>(counts[g.kind]=(counts[g.kind]??0)+1,counts),{});
  return def;
}
const definition=build();
const api={definition,GateAdderCircuit};
export default api;
