// Base geometry used to construct the combinational source templates.
// The CPU's actual connected layout is ../layout.js.
import geometry from './geometry.js';
const {lengthOf}=geometry;
const BIT_PITCH=2.5;
const definition={id:'td4',width:1120,height:735,nodes:[],wires:[],modules:[],ports:{}};
const byId={};
// Word ports are only a convenience for module logic. Every physical pin,
// connection, propagation event and rendered wire carries exactly one bit.
function pin(id,x,y,width=1,kind='PORT',module=null,axis='x') {
  const bits=[];
  for(let bit=0;bit<width;bit++) {
    const key=width===1?id:`${id}[${bit}]`;
    const n={id:key,x:x+(axis!=='y'?bit*BIT_PITCH:0),y:y+(axis!=='x'?bit*BIT_PITCH:0),width:1,kind,module,bit};
    byId[key]=n;definition.nodes.push(n);bits.push(key);
  }
  definition.ports[id]={id,x,y,width,kind,module,bits,axis};return id;
}
function mod(id,title,x,y,width,height) {const m={id,title,x,y,width,height};definition.modules.push(m);return m;}
function wire(from,to,route=()=>[]) {
  const a=definition.ports[from],b=definition.ports[to];
  if(a.width!==b.width)throw new Error(`Port width mismatch: ${from} → ${to}`);
  for(let bit=0;bit<a.width;bit++) {
    const source=byId[a.bits[bit]],target=byId[b.bits[bit]];
    const points=[[source.x,source.y],...route(bit,source,target),[target.x,target.y]];
    definition.wires.push({id:`${source.id}>${target.id}`,from:source.id,to:target.id,width:1,points,length:lengthOf(points)});
  }
}
// Keep the overall footprint fixed; narrow routing channels leave more
// space for modules. Bit pitch is independent of the module dimensions.
mod('IN','INPUT · 4 bit',229,10,200,65);
for(let bit=0;bit<4;bit++)pin(`I${bit}`,399-bit*46,47,1,'INPUT','IN');
pin('IN.q',324,75,4,'SOURCE','IN');
mod('ROM','ROM · 16 × 8',640,10,442,110);
pin('ROM.addr',1082,60,4,'PORT','ROM','y');pin('ROM.op',955,120,4,'SOURCE','ROM');pin('ROM.im',700,120,4,'SOURCE','ROM');
mod('DEC','DECODER',640,138,442,94);
pin('DEC.op',955,138,4,'PORT','DEC');pin('DEC.cf',1082,190,1,'PORT','DEC');
pin('DEC.sel',640,190,2,'SOURCE','DEC','y');
for(const [i,id] of ['A','B','R'].entries())pin(`DEC.en${id}`,800+i*50,232,1,'SOURCE','DEC');
pin('DEC.jump',1000,232,1,'SOURCE','DEC');
mod('MUX','MUX · A / B / IN / 0',44,92,570,165);
pin('MUX.a',44,140,4,'PORT','MUX','y');pin('MUX.b',44,210,4,'PORT','MUX','y');
pin('MUX.input',324,92,4,'PORT','MUX');pin('MUX.sel',614,190,2,'PORT','MUX','y');pin('MUX.y',324,257,4,'SOURCE','MUX');
mod('ALU','ALU · 4 bit ADD',44,274,570,166);
pin('ALU.x',324,274,4,'PORT','ALU');pin('ALU.im',570,274,4,'PORT','ALU');
pin('ALU.sum',400,440,4,'SOURCE','ALU');pin('ALU.cf',99,440,1,'SOURCE','ALU');
mod('NEXT','NEXT PC · +1 / JUMP',640,250,442,190);
pin('NEXT.pc',1082,350,4,'PORT','NEXT','y');pin('NEXT.result',800,440,4,'PORT','NEXT');
pin('NEXT.jump',1000,250,1,'PORT','NEXT');pin('NEXT.y',975,440,4,'SOURCE','NEXT');
// Carry and CLOCK sit above the two left registers. Every DFF is 78 high.
const registers=[
  {id:'A',label:'A',x:44,y:550,width:4,dx:300,qx:200},
  {id:'B',label:'B',x:44,y:648,width:4,dx:300,qx:200},
  {id:'PC',label:'PC',x:574,y:464,width:4,dx:900,qx:990},
  {id:'R',label:'OUT',x:574,y:564,width:4,dx:900,qx:990},
  {id:'CF',label:'C',x:44,y:464,width:1,dx:99,qx:99},
];
for(const {id,label,x,y,width,dx,qx} of registers) {
  const height=78;
  mod(id,`DFF · ${label} · ${width} bit`,x,y,width===1?158:508,height);
  pin(`${id}.d`,dx,y,width,'PORT',id);
  if(['A','B','R'].includes(id))pin(`${id}.en`,x+466,y,1,'PORT',id);
  const rightClock=['A','B','CF'].includes(id);
  pin(`${id}.clk`,rightClock?x+(width===1?158:508):x,y+39,1,'PORT',id);
  definition.ports[`${id}.clk`].side=rightClock?'right':'left';
  pin(`${id}.q`,qx,y+height,width,'SOURCE',id);
}
const clockX=391,clockRight=511;
mod('CLOCK','CLOCK',clockX,464,clockRight-clockX,32);
pin('CLK',411,480,1,'SOURCE','CLOCK');
definition.clockTuningArea={x:202,y:464,width:360,height:78};
// Separate horizontal strips beside CLOCK hold four evenly spaced U-folds
// each. A small fold on the left compensates for C's wider clock bay.
const clockRoutes={
  A:[[519,470],[558,470],[558,589]],
  B:[[560,476],[560,687]],
  R:[[515,482],[515,488],[519,488],[562,488],[562,603]],
  PC:[[513,488],[513,510],[519,510],[551,510],[551,503]],
  CF:[[383,480],[383,508],[379,508],[379,480],[371,480],[371,503]],
};
for(const [i,id] of ['A','B','R','PC'].entries())pin(`CLOCK.${id}`,clockRight,470+i*6,1,'SOURCE','CLOCK');
pin('CLOCK.CF',clockX,480,1,'SOURCE','CLOCK');
const routePoints=(id,route)=>{
  const a=byId[`CLOCK.${id}`],b=byId[`${id}.clk`];
  return [[a.x,a.y],...route,[b.x,b.y]];
};
const commonClockLength=Math.max(...Object.entries(clockRoutes).map(([id,route])=>lengthOf(routePoints(id,route))));
for(const id of ['A','R','PC']) {
  const route=clockRoutes[id],index=route.findIndex(([x])=>x===519),[left,baseline]=route[index];
  const folds=4,pitch=8,toothWidth=4,height=(commonClockLength-lengthOf(routePoints(id,route)))/(2*folds);
  const points=[];
  for(let i=0;i<folds;i++) {
    const x=left+i*pitch;
    points.push([x,baseline],[x,baseline+height],[x+toothWidth,baseline+height],[x+toothWidth,baseline]);
  }
  route.splice(index,1,...points);
}
for(const [id,route] of Object.entries(clockRoutes))wire(`CLOCK.${id}`,`${id}.clk`,()=>route);
mod('OUT','OUTPUT · 4 bit',874,667,220,65);
pin('OUT.data',990,667,4,'PORT','OUT');
for(let bit=0;bit<4;bit++)pin(`O${bit}`,1064-bit*51,704,1,'OUTPUT','OUT');
wire('IN.q','MUX.input');wire('ROM.op','DEC.op');
wire('ROM.im','ALU.im',(i,a,b)=>[[a.x,125+i*BIT_PITCH],[618+i*BIT_PITCH,125+i*BIT_PITCH],[618+i*BIT_PITCH,261+i*BIT_PITCH],[b.x,261+i*BIT_PITCH]]);
wire('DEC.sel','MUX.sel');
wire('DEC.enA','A.en',(_,a,b)=>[[a.x,237],[630,237],[630,456],[554,456],[554,544],[b.x,544]]);
wire('DEC.enB','B.en',(_,a,b)=>[[a.x,240],[633,240],[633,452],[572,452],[572,646],[b.x,646]]);
wire('DEC.enR','R.en',(_,a,b)=>[[a.x,243],[1108,243],[1108,558],[b.x,558]]);
wire('DEC.jump','NEXT.jump');wire('MUX.y','ALU.x');
// Junctions retain separate one-bit transport even when grouped as a bus.
pin('SUM.bus',400,444,4,'JUNCTION',null,'diagonal');
pin('SUM.left',300,444,4,'JUNCTION',null,'diagonal');
pin('SUM.right',800,444,4,'JUNCTION',null,'diagonal');
wire('ALU.sum','SUM.bus');
wire('SUM.bus','SUM.left');wire('SUM.bus','SUM.right');
wire('SUM.left','A.d');
wire('SUM.left','B.d',(i,a,b)=>[[38+i*1.5,a.y],[38+i*1.5,640+i*2],[b.x,640+i*2]]);
wire('SUM.right','R.d',(i,a,b)=>[[564+i*2,a.y],[564+i*2,548+i*2],[b.x,548+i*2]]);
wire('SUM.right','NEXT.result',(_,a,b)=>[[b.x,a.y]]);
wire('ALU.cf','CF.d');
wire('NEXT.y','PC.d',(i,a,b)=>[[a.x,448+i*2.5],[b.x,448+i*2.5]]);
wire('A.q','MUX.a',(i,a,b)=>[[a.x,632+i*2],[8+i*BIT_PITCH,632+i*2],[8+i*BIT_PITCH,b.y]]);
wire('B.q','MUX.b',(i,a,b)=>[[a.x,730+i],[24+i*BIT_PITCH,730+i],[24+i*BIT_PITCH,b.y]]);
pin('PC.bus',1090,350,4,'JUNCTION',null,'diagonal');
wire('PC.q','PC.bus',(i,a,b)=>[[a.x,546+i*2.5],[b.x,546+i*2.5]]);
wire('PC.bus','ROM.addr',(_,a,b)=>[[a.x,b.y]]);wire('PC.bus','NEXT.pc');
wire('CF.q','DEC.cf',(_,a,b)=>[[a.x,546],[208,546],[208,458],[1112,458],[1112,b.y]]);
wire('R.q','OUT.data');


export default {definition};
