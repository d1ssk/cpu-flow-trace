import runtime from '../../../simulator/td4/detail-mos.js';
const {MosCircuit}=runtime;
import gateNetworkAPI from './gate-network.js';
import simulationAPI from './simulation.js';
import geometryAPI from './geometry.js';
import cmosNandAPI from './cmos-nand.js';
import detailLayoutAPI from './detail-layout.js';
import mux from './mux.js';
import decoder from './decoder.js';
import next_pc from './next-pc.js';
/* The compact details' transistor circuits. NAND connectivity is retained;
 * MOS placement, power rails and signal routing are constructed independently. */
const {GateCircuit}=gateNetworkAPI;
const {PROPAGATION_SPEED}=simulationAPI;
const {lengthOf}=geometryAPI;
const {topology,solve}=cmosNandAPI;
function position(kind,id) {
  if(kind==='mux') {
    if(id==='NOT_SEL0')return [548,20,528,570];if(id==='NOT_SEL1')return [548,110,528,570];
    const [,bit,stage,part]=id.match(/^BIT(\d)\.(AB|IN_ZERO|SELECT)\.(A|B|Y)$/),left=Number(bit)*132;
    return [left+24+['A','B','Y'].indexOf(part)*42,12+['AB','IN_ZERO','SELECT'].indexOf(stage)*52,left,left+132];
  }
  const rows=kind==='decoder'?[
    ['NOT_OP3','NOT_OP2','NOT_OP1','NOT_OP0','NOT_BRANCH','BRANCH','OP0_OR_NOT_C','NOT_JUMP','JUMP'],
    ['ENA.N','ENA','ENB.N','ENB','ENOUT.N','ENOUT','SEL0','SEL1'],
  ]:[
    ['INC0','INC1.N1','INC1.N2','INC1.N3','INC2.N1','INC2.N2','INC2.N3'],
    ['NOT_JUMP','INC1.XOR','CARRY2','INC2.XOR','CARRY3','INC3.N1','INC3.N2'],
    ['BIT0.SELECT.A','BIT0.SELECT.B','BIT1.SELECT.A','BIT1.SELECT.B','INC3.N3','INC3.XOR','BIT3.SELECT.A'],
    ['BIT0.SELECT.Y','BIT1.SELECT.Y','BIT2.SELECT.A','BIT2.SELECT.B','BIT2.SELECT.Y','BIT3.SELECT.B','BIT3.SELECT.Y'],
  ];
  const row=rows.findIndex(r=>r.includes(id)),col=rows[row].indexOf(id);
  return kind==='decoder'?[26+48*col,10+44*row,0,442]:[30+62*col,12+46*row,0,442];
}
function build(base) {
  const {route}=detailLayoutAPI;
  const def={...base,gates:[],modules:[],nodes:base.nodes.filter(n=>['INPUT','OUTPUT','CONSTANT'].includes(n.kind)).map(n=>({...n})),wires:[],cells:[],obstacles:[]};
  def.description='pMOSを並列、nMOSを直列に接続した理想スイッチ回路。入力がMOSのゲートへ到着すると導通が変わり、出力の変化が次の配線を伝わります。';
  const nodes=Object.fromEntries(def.nodes.map(n=>[n.id,n]));
  const pin=(id,x,y,kind,extra={})=>{const n={id,x,y,kind,...extra};nodes[id]=n;def.nodes.push(n);return n;};
  const wire=(from,to,points,extra={})=>def.wires.push({id:`${from}>${to}`,from,to,points,length:lengthOf(points),...extra});
  for(const g of base.gates) {
    const id=g.id,[x,y,left,right]=position(base.id,id),path=points=>points.map(([dx,dy])=>[x+dx,y+dy]);
    const c={id,x,y,width:36,height:28,channelHalf:5,leadHalf:6,devices:[],supplies:[],controlDots:[['PA',x,y+7],['PB',x,y+21]],outputDot:[x-15,y+14]};def.cells.push(c);
    def.obstacles.push({id,x:x-18,y,width:36,height:28});
    pin(id+'.a',x,y,'JUNCTION',{gate:id,escape:[x,y-2]});
    pin(id+'.b',x,y+28,'JUNCTION',{gate:id,escape:[x,y+30]});
    pin(id+'.y',x-18,y+14,'JUNCTION',{gate:id,side:'left',escape:[x-20,y+14]});
    for(const m of topology) {
      const dy=m.input==='a'?7:21,side=m.type==='p'?-1:1,deviceId=id+':'+m.id;
      pin(deviceId,x+side*4,y+dy,'CONTROL',{cell:id,device:m.id});
      const from=id+'.'+m.input,n=nodes[from];
      wire(from,deviceId,[[n.x,n.y],[x,y+dy],[x+side*4,y+dy]],{internal:id,control:true});
      c.devices.push({...m,id:deviceId,localId:m.id,mx:x+side*10,my:y+dy,gateX:x+(m.type==='p'?-5.2:4),bubbleX:x-4.6});
    }
    pin(id+':core',x-10,y+13,'CORE',{cell:id});
    wire(id+':core',id+'.y',path([[-10,13],[-15,13],[-15,14],[-18,14]]),{internal:id,net:'Y'});
    for(const [name,net,points] of [['parallel','Y',[[-10,27],[-15,27],[-15,14]]],['return','Y',[[10,1],[15,1],[15,14],[-15,14]]],['series','X',[[10,13],[10,15]]]]) {
      const p=path(points);def.wires.push({id:id+':'+name,from:null,to:null,points:p,length:lengthOf(p),internal:id,probe:true,net});
    }
    for(const dy of [1,15])c.supplies.push({net:'VDD',short:path([[-12,dy],[-10,dy]]),full:[[left,y-3],...path([[-13,-3],[-13,dy],[-10,dy]])]});
    c.supplies.push({net:'GND',short:path([[10,27],[12,27]]),full:[...path([[10,27],[15,27],[15,31]]),[right,y+31]]});
  }
  def.supplyRoutes=def.cells.flatMap(c=>c.supplies.map(s=>s.full));
  const internal=def.wires;
  route(def,base.wires.map(({from,to})=>({from,to})));
  def.wires=[...def.wires,...internal];return def;
}
// Loading the simulator must not route circuits that are not being shown.
const definitions={};
for(const [id,name] of [['mux','FlowMux'],['decoder','FlowDecoder'],['next-pc','FlowNextPC']]) {
  let cached;
  Object.defineProperty(definitions,id,{enumerable:true,get(){
    const base=({mux,decoder,'next-pc':next_pc})[id];
    return cached??=(build(base));
  }});
}
const api={definitions,MosCircuit};export default api;
