import dffCAPI from './dff-c.js';
import geometryAPI from './geometry.js';
/* Four identical copies of the C NAND latch pair, plus D/Q selection for
 * active-high EN. Clock length compensation lives entirely in the right bay. */
const {definition:cell,DffCircuit}=dffCAPI;
const {lengthOf}=geometryAPI;
function build({enable=true}={}) {
  const def={id:'dff-ab',title:'DFF A / B · 4 bit',width:508,height:78,step:10,zoom:{min:1,max:6,step:.5},gateScaleY:cell.gateScaleY,
    description:'DFF Cと同じNANDラッチを横に4個接続。EN=HでDを取り込み、EN=LでQを帰還して保持します。右端の折り返し配線で4 bitのCLK到着を揃えます。',
    nodes:[],gates:[],wires:[],groups:[],bits:[],clockTuningArea:{x:440,y:0,width:68,height:78}};
  const nodes={};
  const pin=(id,x,y,kind='JUNCTION',gate=null,initial=0)=>{const n={id,x,y,kind,gate,initial};nodes[id]=n;def.nodes.push(n);return id;};
  const link=(from,to,bends=[],extra={})=>{
    const a=nodes[from],b=nodes[to],points=[[a.x,a.y],...bends,[b.x,b.y]];
    const w={id:`${from}>${to}`,from,to,points,length:lengthOf(points),...extra};def.wires.push(w);return w;
  };
  const nand=(id,x,y,initial)=>{
    def.gates.push({id,x,y,kind:'NAND'});
    pin(`${id}.a`,x-3,y,'PORT',id);pin(`${id}.b`,x+3,y,'PORT',id);
    pin(`${id}.y`,x,y+12*def.gateScaleY,'SOURCE',id,initial);
  };
  pin('CLK',508,39,'INPUT');pin('clock-root',500,39);link('CLK','clock-root');
  if(enable) {
    pin('EN',466,0,'INPUT');pin('enable-trunk',506,58);pin('enable-bus',506,76);
    link('EN','enable-trunk',[[506,0]]);link('enable-trunk','enable-bus');
    nand('NOT_EN',470,60,1);
    link('enable-trunk','NOT_EN.a',[[467,58]]);link('enable-trunk','NOT_EN.b',[[473,58]]);
    pin('not-enable-bus',470,73);link('NOT_EN.y','not-enable-bus');
  }
  const data=[],outputs=[],branches=[],clockLanes=[41,43,46,50];
  for(let bit=0;bit<4;bit++) {
    const prefix=`B${bit}.`,dx=bit*110;
    def.bits.push({bit,x:dx,width:110,prefix});
    for(const n of cell.nodes)if(!['D','CLK'].includes(n.id))pin(prefix+n.id,n.x+dx,n.y,n.kind,n.gate?prefix+n.gate:null,n.initial);
    for(const g of cell.gates)def.gates.push({...g,id:prefix+g.id,x:g.x+dx});
    for(const w of cell.wires)if(!['D','CLK'].includes(w.from))def.wires.push({...w,id:prefix+w.id,from:prefix+w.from,to:prefix+w.to,points:w.points.map(([x,y])=>[x+dx,y])});
    data.push(pin(`D${bit}`,dx+55,0,'INPUT'));outputs.push(prefix+'Q');
    if(enable) {
      nand(prefix+'HOLD',dx+18,3,1);nand(prefix+'LOAD',dx+42,3,1);nand(prefix+'SELECT',dx+66,3,0);
      link(prefix+'S-q',prefix+'HOLD.a',[[dx+42,72],[dx+2,72],[dx+2,2.5],[dx+15,2.5]]);
      link('not-enable-bus',prefix+'HOLD.b',[[dx+8,73],[dx+8,2.7],[dx+21,2.7]]);
      link(`D${bit}`,prefix+'LOAD.a',[[dx+55,2.4],[dx+39,2.4]]);
      link('enable-bus',prefix+'LOAD.b',[[dx+10,76],[dx+10,2.9],[dx+45,2.9]]);
      link(prefix+'HOLD.y',prefix+'SELECT.a',[[dx+18,16],[dx+60,16],[dx+60,2.5],[dx+63,2.5]]);
      link(prefix+'LOAD.y',prefix+'SELECT.b',[[dx+42,17],[dx+74,17],[dx+74,2.7],[dx+69,2.7]]);
      link(prefix+'SELECT.y',prefix+'MS.a',[[dx+66,18.2],[dx+93,18.2]]);
    } else {
      const dataWire=cell.wires.find(w=>w.from==='D');
      link(`D${bit}`,prefix+'MS.a',dataWire.points.slice(1,-1).map(([x,y])=>[x+dx,y]));
    }
    const lane=clockLanes[bit],target=nodes[prefix+'clock'];
    branches.push(link('clock-root',target.id,[[500,lane],[440,lane],[dx+108,lane],[dx+108,target.y]],{clockBranch:bit}));
  }
  // Each branch has its own 12-unit-wide folding strip in the 68-unit bay.
  // Four U-shaped folds add exactly 8*h of travel. The remaining route is
  // unchanged and all four copies receive the same edge at their clock node.
  const commonLength=Math.max(...branches.map(w=>w.length));
  for(const w of branches) {
    const bit=w.clockBranch,extra=commonLength-w.length;
    if(extra>0) {
      const lane=clockLanes[bit],height=extra/8,right=456+bit*14,folds=[];
      for(let i=0;i<4;i++) {
        const x=right-i*3;folds.push([x,lane],[x,lane-height],[x-2,lane-height],[x-2,lane]);
      }
      w.points.splice(2,0,...folds);w.length=lengthOf(w.points);
    }
  }
  def.groups=[{id:'D',label:'D',width:4,ids:data,kind:'INPUT'},
    ...(enable?[{id:'EN',label:'EN',width:1,ids:['EN'],kind:'INPUT'}]:[]),
    {id:'CLK',label:'CLK',width:1,ids:['CLK'],kind:'INPUT'},
    {id:'Q',label:'Q',width:4,ids:outputs,kind:'OUTPUT'}];
  return def;
}
const definition=build();
class DffABCircuit extends DffCircuit {constructor(){super(definition);}}
const api={definition,DffABCircuit,build};export default api;
