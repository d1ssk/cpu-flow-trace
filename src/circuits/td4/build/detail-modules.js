import runtime from '../../../simulator/td4/detail-modules.js';
const {ModuleCircuit}=runtime;
import gateNetworkAPI from './gate-network.js';
import simulationAPI from './simulation.js';
import detailLayoutAPI from './detail-layout.js';
import mux from './mux.js';
import decoder from './decoder.js';
import next_pc from './next-pc.js';
/* First-level combinational circuits. Each block evaluates arriving pins;
 * only the visible connecting wires contribute transport delay. */
const {GateCircuit}=gateNetworkAPI;
const {PROPAGATION_SPEED}=simulationAPI;
function build(base) {
  const {route}=detailLayoutAPI;
  const def={...base,nodes:base.nodes.filter(n=>['INPUT','OUTPUT','CONSTANT'].includes(n.kind)).map(n=>({...n})),groups:base.groups.map(g=>({...g,ids:[...g.ids]})),gates:[],wires:[],modules:[],obstacles:[]},links=[];
  const pin=(id,x,y,kind,extra={})=>def.nodes.push({id,x,y,kind,...extra});
  const wire=(from,to)=>links.push({from,to});
  const block=(id,kind,label,x,y,width,height)=>{const m={id,kind,label,x,y,width,height,inputs:[],outputs:[]};def.modules.push(m);def.obstacles.push(m);return m;};
  const port=(m,p,x,y,side,output=false)=>{
    const id=m.id+'.'+p,escape=[x,y];escape[side==='left'||side==='right'?0:1]+=side==='left'||side==='top'?-2:2;
    pin(id,x,y,output?'SOURCE':'PORT',{gate:m.id,port:p,side,escape});m[output?'outputs':'inputs'].push(p);return id;
  };
  if(base.id==='mux') {
    def.levelTitle='1 bit · 4:1 MUX × 4';def.description='1 bitの4入力MUXを4個接続。共通のSELで各bitのA・B・IN・0を選択します。';
    for(let bit=0;bit<4;bit++) {
      const x=30+132*bit,m=block(`MUX${bit}`,'MUX4',`4:1 MUX · bit ${bit}`,x,32,110,100);
      for(const [p,g,dx] of [['a','A',18],['b','B',40],['input','IN',62],['zero','ZERO',84]])wire(g==='ZERO'?'ZERO0':g+bit,port(m,p,x+dx,32,'top'));
      for(let i=0;i<2;i++)wire('SEL'+i,port(m,'s'+i,x+110,64+i*12,'right'));
      wire(port(m,'y',x+55,132,'bottom',true),'Y'+bit);
    }
  } else if(base.id==='next-pc') {
    def.levelTitle='Half adder × 4 + MUX × 4';def.description='半加算器4個に最下位の桁上がり入力1を加えてPC＋1を作り、2入力MUXでALU結果へのJUMPを選びます。';
    pin('ONE0',12,57,'CONSTANT',{initial:1,escape:[14,57]});def.groups.push({id:'ONE',label:'1',width:1,ids:['ONE0'],kind:'CONSTANT',x:12,y:57});
    for(let bit=0;bit<4;bit++) {
      const x=30+94*bit,h=block(`HA${bit}`,'HA',`Half adder · bit ${bit}`,x,32,76,50);
      wire('PC'+bit,port(h,'a',x+24,32,'top'));
      wire(bit?`HA${bit-1}.c`:'ONE0',port(h,'b',x,57,'left'));
      port(h,'c',x+76,57,'right',true);port(h,'s',x+24,82,'bottom',true);
      const m=block(`MUX${bit}`,'MUX2',`2:1 MUX · bit ${bit}`,x,116,76,42);
      wire(`HA${bit}.s`,port(m,'a',x+24,116,'top'));wire('RESULT'+bit,port(m,'b',x+52,116,'top'));
      wire('JUMP0',port(m,'sel',x+76,137,'right'));wire(port(m,'y',x+38,158,'bottom',true),'Y'+bit);
    }
  } else {
    def.levelTitle='DECODER';def.description='TD4と同じ命令Decoderを単一モジュールとして表示します。OPとCからSEL・書き込み許可・JUMPを生成します。';
    const m=block('DEC','DECODER','DECODER',24,14,394,66);
    for(let i=0;i<4;i++)wire('OP'+i,port(m,'op'+i,286+i*20,14,'top'));
    wire('C0',port(m,'cf',418,52,'right'));
    for(let i=0;i<2;i++)wire(port(m,'sel'+i,24,52+i*4,'left',true),'SEL'+i);
    for(const [p,g,x] of [['enA','ENA',160],['enB','ENB',210],['enOut','ENOUT',260],['jump','JUMP',360]])wire(port(m,p,x,80,'bottom',true),g+'0');
  }
  route(def,links);return def;
}
function evaluate(m,read) {
  const v=p=>read(m.id+'.'+p);
  if(m.kind==='MUX4')return {y:[v('a'),v('b'),v('input'),v('zero')][v('s0')+2*v('s1')]};
  if(m.kind==='MUX2')return {y:v('sel')?v('b'):v('a')};
  if(m.kind==='HA')return {s:v('a')^v('b'),c:v('a')&v('b')};
  const dest=v('op2')+2*v('op3'),branch=dest===3;
  return {sel0:branch?1:v('op0'),sel1:branch?1:v('op1'),enA:+(dest===0),enB:+(dest===1),enOut:+(dest===2),jump:+(branch&&(v('op0')||!v('cf')))};
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
const api={definitions,ModuleCircuit};export default api;
