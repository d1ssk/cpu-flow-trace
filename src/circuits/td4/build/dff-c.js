import runtime from '../../../simulator/td4/dff-c.js';
const {DffCircuit}=runtime;
import gateNetworkAPI from './gate-network.js';
import simulationAPI from './simulation.js';
import geometryAPI from './geometry.js';
/* Positive-edge DFF: two cross-coupled NAND latches and a NAND inverter.
 * Only the routed wires take time; no DFF primitive or edge callback. */
const {GateCircuit}=gateNetworkAPI;
const {PROPAGATION_SPEED}=simulationAPI;
const {lengthOf}=geometryAPI;
function build() {
  const def={id:'dff-c',title:'DFF C · 1 bit',width:110,height:90,step:10,zoom:{min:1,max:6,step:.5},
    description:'NAND 9個で構成したマスター・スレーブ型DFF。CLKがLの間にマスターへ入力し、立ち上がりでQへ伝えます。',
    nodes:[],gates:[],wires:[],groups:[]},nodes={};
  const pin=(id,x,y,kind='JUNCTION',gate=null,initial=0)=>{const n={id,x,y,kind,gate,initial};nodes[id]=n;def.nodes.push(n);return id;};
  const link=(from,to,bends=[])=>{
    const a=nodes[from],b=nodes[to],points=[[a.x,a.y],...bends,[b.x,b.y]];
    def.wires.push({id:`${from}>${to}`,from,to,points,length:lengthOf(points)});
  };
  const gate=(id,x,y,initial=0)=>{
    def.gates.push({id,x,y,kind:'NAND'});
    pin(`${id}.a`,x-3,y,'PORT',id);pin(`${id}.b`,x+3,y,'PORT',id);
    pin(`${id}.y`,x,y+12,'SOURCE',id,initial);
  };
  for(const [id,x,y,kind] of [['D',55,0,'INPUT'],['CLK',0,45,'INPUT'],['Q',55,90,'OUTPUT']]) {
    pin(id,x,y,kind);def.groups.push({id,label:id,width:1,x,y,kind,ids:[id]});
  }
  gate('CK',14,3,1);
  for(const [prefix,y] of [['M',24],['S',60]])for(const [name,x] of [['S',20],['R',44],['Q',68],['N',92]])gate(`${prefix}${name}`,x,y,name==='N'||name==='S'||(prefix==='S'&&name==='R')?1:0);
  pin('clock',8,66);pin('inverted-clock-input',14,1);pin('master-enable',35,20);pin('slave-enable',35,56);
  link('CLK','clock',[[2,45],[2,66]]);link('clock','inverted-clock-input',[[8,1]]);
  link('inverted-clock-input','CK.a',[[11,1]]);link('inverted-clock-input','CK.b',[[17,1]]);
  link('CK.y','master-enable',[[35,15]]);
  // Match the direct clock route to the inverter path (102 units). Both
  // latches change phase together at their enable pins, including falling CLK.
  link('clock','slave-enable',[[8,51],[62.5,51],[62.5,56]]);
  link('D','MS.a',[[55,18],[17,18]]);
  for(const [p,y,enable] of [['M',24,'master-enable'],['S',60,'slave-enable']]) {
    const ey=nodes[enable].y;
    link(enable,`${p}S.b`,[[23,ey]]);link(enable,`${p}R.b`,[[47,ey]]);
    pin(`${p}-set`,20,y+15);link(`${p}S.y`,`${p}-set`);
    link(`${p}-set`,`${p}R.a`,[[32,y+15],[32,y-2],[41,y-2]]);
    link(`${p}-set`,`${p}Q.a`,[[56,y+15],[56,y-2],[65,y-2]]);
    link(`${p}R.y`,`${p}N.a`,[[44,y+18],[80,y+18],[80,y-2],[89,y-2]]);
    link(`${p}N.y`,`${p}Q.b`,[[92,y+20],[78,y+20],[78,y-2],[71,y-2]]);
    pin(`${p}-q`,68,y+14);link(`${p}Q.y`,`${p}-q`);
    link(`${p}-q`,`${p}N.b`,[[106,y+14],[106,y-2],[95,y-2]]);
  }
  link('M-q','SS.a',[[68,46],[17,46]]);
  link('S-q','Q',[[68,86],[55,86]]);
  // Match the main DFF C: 78 high and CLK entering from the right. Mirror
  // the fixed circuit and compress only its vertical coordinates.
  const scaleY=78/90,point=([x,y])=>[110-x,y*scaleY];
  for(const n of def.nodes)[n.x,n.y]=point([n.x,n.y]);
  for(const g of def.gates)[g.x,g.y]=point([g.x,g.y]);
  for(const g of def.groups)[g.x,g.y]=point([g.x,g.y]);
  for(const w of def.wires){w.points=w.points.map(point);w.length=lengthOf(w.points);}
  // The aspect ratio changes horizontal/vertical travel differently, so
  // rebalance the direct clock's loop using its actual new drawn length.
  const len=id=>def.wires.find(w=>w.id===id).length;
  const inverted=len('clock>inverted-clock-input')+len('inverted-clock-input>CK.a')+len('CK.y>master-enable');
  const direct=def.wires.find(w=>w.id==='clock>slave-enable'),adjust=(direct.length-inverted)/2;
  direct.points[2][0]+=adjust;direct.points[3][0]+=adjust;direct.length=lengthOf(direct.points);
  def.height=78;def.gateScaleY=scaleY;
  // Keep the 110-wide latch core unchanged. Match the A/B CLK-to-local-clock
  // path (8 + 416.2) with four regular U-folds entirely in the new right bay.
  def.width=158;def.clockTuningArea={x:110,y:0,width:48,height:78};
  nodes.CLK.x=def.width;def.groups.find(g=>g.id==='CLK').x=def.width;
  const clockWire=def.wires.find(w=>w.id==='CLK>clock'),baseline=nodes.clock.y;
  const points=[[def.width,39],[154,39],[154,baseline]];
  const baseLength=def.width-nodes.clock.x+baseline-39,depth=(8+416.2-baseLength)/8;
  for(let i=0;i<4;i++) {
    const x=146-i*8;
    points.push([x,baseline],[x,baseline-depth],[x-4,baseline-depth],[x-4,baseline]);
  }
  points.push([108,baseline],[nodes.clock.x,baseline]);
  clockWire.points=points;clockWire.length=lengthOf(points);
  return def;
}
const definition=build();
const api={definition,DffCircuit};export default api;
