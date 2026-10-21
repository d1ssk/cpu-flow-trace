import dffAbAPI from './dff-ab.js';
import dffPcOutAPI from './dff-pc-out.js';
import dffCModuleAPI from './dff-c-module.js';
import dffCMosAPI from './dff-c-mos.js';
import cmosNandAPI from './cmos-nand.js';
import geometryAPI from './geometry.js';
/* Four connected latch pairs. Keep the complete NAND clock distribution in
 * every view; place MOS and latch modules around its four horizontal lanes. */
const {build,DffABCircuit}=dffAbAPI;
const {definitions:left,DffPCOutCircuit}=dffPcOutAPI;
const {ModuleDffCircuit}=dffCModuleAPI;
const {MosDffCircuit,MosRouter}=dffCMosAPI;
const {topology}=cmosNandAPI;
const {lengthOf}=geometryAPI;
function builder(base,mode) {
  const def={id:`${base.id}-${mode}`,title:base.title,width:508,height:78,groups:base.groups,bits:base.bits.map(b=>({...b})),clockTuningArea:{...base.clockTuningArea},nodes:[],wires:[],modules:[],cells:[]};
  const nodes={};
  const pin=(id,x,y,kind='JUNCTION',extra={})=>{const n={id,x,y,kind,initial:0,...extra};nodes[id]=n;def.nodes.push(n);return n;};
  const wire=(from,to,bends=[],extra={})=>{
    const a=nodes[from],b=nodes[to],points=[[a.x,a.y],...bends,[b.x,b.y]];
    const w={id:`${from}>${to}`,from,to,points,length:lengthOf(points),...extra};def.wires.push(w);return w;
  };
  for(const g of base.groups)for(const id of g.ids){const n=base.nodes.find(n=>n.id===id);pin(id,n.x,n.y,n.kind);}
  const clocks=base.wires.filter(w=>w.from==='CLK'||w.clockBranch!==undefined);
  for(const id of new Set(clocks.flatMap(w=>[w.from,w.to])))if(!nodes[id]){const n=base.nodes.find(n=>n.id===id);pin(id,n.x,n.y,n.kind);}
  for(const w of clocks)def.wires.push({...w,points:w.points.map(p=>[...p])});
  return {def,nodes,pin,wire};
}
function moduleRegister(base,enable) {
  const {def,nodes,pin,wire}=builder(base,'module');
  if(enable){pin('enable-bus',506,77);wire('EN','enable-bus',[[506,0]]);}
  for(let bit=0;bit<4;bit++) {
    const p=`B${bit}.`,dx=bit*110;
    const mod=(id,label,kind,x,y,width,height)=>def.modules.push({id:p+id,label,kind,x:x+dx,y,width,height});
    const port=(id,x,y,gate,initial=0,kind='PORT')=>pin(p+id,dx+x,y,kind,{gate:p+gate,initial});
    mod('M','Master','LATCH',4,17,88,22);mod('S','Slave','LATCH',4,54,88,22);mod('CK','NOT','NOT',94,16,14,11);
    for(const [id,d,q,en,initial] of [['M',17,39,28,1],['S',54,76,65,0]]) {
      port(`${id}.d`,55,d,id);port(`${id}.en`,92,en,id,initial);port(`${id}.q`,55,q,id,0,'SOURCE');
    }
    port('CK.d',108,21.5,'CK');port('CK.q',94,21.5,'CK',1,'SOURCE');
    pin(p+'clock-fork',dx+102,52);wire(p+'clock',p+'clock-fork');
    wire(p+'clock-fork',p+'CK.d',[[dx+108,52]]);
    wire(p+'CK.q',p+'M.en',[[dx+94,28]]);
    wire(p+'clock-fork',p+'S.en',[[dx+102,41],[dx+94,41],[dx+94,65]]);
    wire(p+'M.q',p+'S.d');wire(p+'S.q',p+'Q');
    if(enable) {
      mod('SEL','D / Q 選択','MUX',4,1,88,12);
      port('SEL.d',55,1,'SEL');port('SEL.h',4,7,'SEL');port('SEL.en',92,7,'SEL');port('SEL.q',55,13,'SEL',0,'SOURCE');
      wire(`D${bit}`,p+'SEL.d');wire(p+'SEL.q',p+'M.d');
      wire(p+'S.q',p+'SEL.h',[[dx+2,76],[dx+2,7]]);
      wire('enable-bus',p+'SEL.en',[[dx+109.5,77],[dx+109.5,7]]);
    } else wire(`D${bit}`,p+'M.d');
  }
  return def;
}
function mosCell(b,id,x,y,initial,leftEdge,rightEdge) {
  const {def,pin,wire}=b,c={id,x,y,width:22,height:16,devices:[],supplies:[],channelHalf:2.5,leadHalf:3};def.cells.push(c);
  const path=points=>points.map(([dx,dy])=>[x+dx,y+dy]);
  pin(id+'.a',x,y,'JUNCTION',{gate:id,escape:[x,y-1]});pin(id+'.b',x,y+16,'JUNCTION',{gate:id,escape:[x,y+1+16]});
  pin(id+'.y',x-11,y+8,'JUNCTION',{gate:id,escape:[x-12,y+8],initial});
  for(const m of topology) {
    const dy=m.input==='a'?4:12,side=m.type==='p'?-1:1,deviceId=`${id}:${m.id}`;
    pin(deviceId,x+side*3,y+dy,'CONTROL',{cell:id,device:m.id});
    wire(`${id}.${m.input}`,deviceId,[[x,y+dy]],{internal:id,control:true});
    c.devices.push({...m,id:deviceId,localId:m.id,mx:x+side*6,my:y+dy,gateX:x+(m.type==='p'?-4.2:3),bubbleX:x-3.6});
  }
  pin(id+':core',x-6,y+7,'CORE',{cell:id,initial});wire(id+':core',id+'.y',path([[-9,7],[-9,8]]),{internal:id,net:'Y'});
  for(const [name,net,points] of [['parallel','Y',[[-6,15],[-9,15],[-9,8]]],['return','Y',[[6,1],[9,1],[9,8],[-9,8]]],['series','X',[[6,7],[6,9]]]]) {
    const route=path(points);def.wires.push({id:`${id}:${name}`,from:null,to:null,points:route,length:lengthOf(route),internal:id,probe:true,net});
  }
  for(const dy of [1,9])c.supplies.push({net:'VDD',short:path([[-7.5,dy],[-6,dy]]),full:[[leftEdge,y-1],...path([[-8,-1],[-8,dy],[-6,dy]])]});
  c.supplies.push({net:'GND',short:path([[6,15],[7.5,15]]),full:[...path([[6,15],[9,15],[9,17]]),[rightEdge,y+17]]});
  c.controlDots=[['PA',x,y+4],['PB',x,y+12]];c.outputDot=[x-9,y+8];
}
function mosRegister(base,enable) {
  const b=builder(base,'mos'),{def,nodes,pin,wire}=b;
  const incoming=Object.fromEntries(base.wires.map(w=>[w.to,w.from])),original=Object.fromEntries(base.nodes.map(n=>[n.id,n]));
  const driver=id=>['INPUT','SOURCE'].includes(original[id].kind)?id:driver(incoming[id]);
  if(enable) {
    pin('enable-trunk',506,58);pin('enable-bus',506,77.5);pin('not-enable-bus',470,74);
    wire('EN','enable-trunk',[[506,0]]);wire('enable-trunk','enable-bus');
    mosCell(b,'NOT_EN',470,57,1,440,508);
    wire('enable-trunk','NOT_EN.a',[[506,55],[470,55]]);
    wire('enable-trunk','NOT_EN.b',[[506,75],[470,75]]);
    wire('NOT_EN.y','not-enable-bus',[[457,65],[457,74]]);
  }
  for(let bit=0;bit<4;bit++) {
    const p=`B${bit}.`,dx=bit*110,startCells=def.cells.length;
    const positions=enable?{HOLD:[14,3],LOAD:[40,3],SELECT:[66,3],CK:[90,3],MS:[14,22],MR:[40,22],MQ:[66,22],MN:[90,22],SS:[14,54],SR:[40,54],SQ:[66,54],SN:[90,54]}:
      {MQ:[14,3],MN:[52,3],CK:[90,3],MS:[14,22],MR:[40,22],SN:[90,22],SS:[14,54],SR:[40,54],SQ:[78,54]};
    for(const [name,[x,y]] of Object.entries(positions))mosCell(b,p+name,dx+x,y,original[p+name+'.y'].initial,dx,dx+110);
    pin(p+'clock-fork',dx+104,51);pin(p+'clock-split',dx+104,52);pin(p+'master-enable',dx+27,40);pin(p+'slave-enable',dx+27,72);
    const bends=points=>points.map(([x,y])=>[dx+x,y]);
    wire(p+'clock',p+'clock-fork',bends([[102,51]]),{clock:true});
    wire(p+'clock-fork',p+'CK.a',bends([[108,51],[108,1],[90,1]]),{clock:true});
    wire(p+'clock-fork',p+'clock-split',[],{clock:true});
    wire(p+'clock-split',p+'CK.b',bends([[104,53],[78,53],[78,21],[90,21]]),{clock:true});
    wire(p+'CK.y',p+'master-enable',bends([[78,11],[78,40]]),{clock:true});
    wire(p+'master-enable',p+'MS.b',bends([[14,40]]),{clock:true});wire(p+'master-enable',p+'MR.b',bends([[40,40]]),{clock:true});
    const folds=[];for(let i=0;i<6;i++){const x=4+i*4;folds.push([x,76],[x,75],[x+2,75],[x+2,76]);}
    wire(p+'clock-split',p+'slave-enable',bends([[2,52],[2,76],...folds,[27,76]]),{clock:true});
    wire(p+'slave-enable',p+'SS.b',bends([[14,72]]),{clock:true});wire(p+'slave-enable',p+'SR.b',bends([[40,72]]),{clock:true});
    if(enable) {
      wire('enable-bus',p+'LOAD.b',bends([[109.5,77.5],[109.5,20],[40,20]]));
      wire('not-enable-bus',p+'HOLD.b',bends([[1,74],[1,20],[14,20]]));
    }
    // Route data and feedback independently in each 110-wide bit. The four
    // distribution lanes at y=41..50 contain no MOS bodies.
    const localCells=def.cells.slice(startCells).map(c=>({...c,x:c.x-dx,supplies:[]}));
    const router=new MosRouter({bodyWidth:110,height:78,cells:localCells});
    const local=n=>({...n,x:n.x-dx,escape:n.escape?[n.escape[0]-dx,n.escape[1]]:undefined});
    const route=(from,to)=>wire(from,to,router.route(local(nodes[from]),local(nodes[to])).slice(1,-1).map(([x,y])=>[x+dx,y]));
    const connected=new Set(def.wires.filter(w=>!w.probe).map(w=>w.to));
    for(const c of def.cells.slice(startCells))for(const input of ['a','b']) {
      const to=c.id+'.'+input;if(connected.has(to))continue;route(driver(incoming[to]),to);
    }
    route(p+'SQ.y',p+'Q');
  }
  return def;
}
function orient(def,kind) {
  if(kind==='ab')return def;
  def.id=def.id.replace('dff-ab',`dff-${kind}`);def.title=left[kind].title;def.clockTuningArea.x=0;
  const mirror=([x,y])=>[508-x,y];
  for(const n of def.nodes){n.x=508-n.x;if(n.escape)n.escape=mirror(n.escape);}
  for(const w of def.wires){w.points=w.points.map(mirror);w.length=lengthOf(w.points);}
  for(const m of def.modules)m.x=508-m.x-m.width;
  for(const bit of def.bits)bit.x=508-bit.x-bit.width;
  for(const c of def.cells) {
    c.x=508-c.x;c.outputDot=mirror(c.outputDot);c.controlDots=c.controlDots.map(([id,x,y])=>[id,508-x,y]);
    for(const m of c.devices)for(const key of ['mx','gateX','bubbleX'])m[key]=508-m[key];
    for(const s of c.supplies){s.short=s.short.map(mirror);s.full=s.full.map(mirror);}
  }
  if(kind==='out') {
    const en=def.nodes.find(n=>n.id==='EN');en.x=466;
    const w=def.wires.find(w=>w.from==='EN'),target=def.nodes.find(n=>n.id===w.to);
    w.points=[[466,0],[466,1],[target.x,1],[target.x,target.y]];w.length=lengthOf(w.points);
  }
  return def;
}
const definitions={};
for(const kind of ['ab','pc','out']) {
  const enable=kind!=='pc',base=build({enable});
  definitions[kind]={module:orient(moduleRegister(base,enable),kind),mos:orient(mosRegister(base,enable),kind)};
}
function create(kind,view) {
  if(view==='nand')return kind==='ab'?new DffABCircuit():new DffPCOutCircuit(kind);
  return view==='module'?new ModuleDffCircuit(definitions[kind].module):new MosDffCircuit(definitions[kind].mos);
}
function restore(sim,{D=0,CLK=0,Q=0,EN=0}={}) {
  const enabled=sim.definition.groups.some(g=>g.id==='EN');
  const set=(id,value)=>{sim.setWord(id,value);let n=0;while(sim.busy){if(++n>20000)throw Error('Register restore did not settle');sim.next();}};
  sim.reset();if(enabled)set('EN',1);set('D',Q);set('CLK',1);set('CLK',CLK);if(enabled)set('EN',EN);set('D',D);
  sim.time=0;sim.sequence=0;for(const w of Object.values(sim.wires)){w.initial=w.arrived;w.transitions=[];}
}
const api={definitions,create,restore};export default api;
