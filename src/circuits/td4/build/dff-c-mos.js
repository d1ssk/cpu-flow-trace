import runtime from '../../../simulator/td4/dff-c-mos.js';
const {MosDffCircuit}=runtime;
import gateNetworkAPI from './gate-network.js';
import simulationAPI from './simulation.js';
import geometryAPI from './geometry.js';
import dffCAPI from './dff-c.js';
import cmosNandAPI from './cmos-nand.js';
/* Nine CMOS switch networks fill the 110 x 78 body. The right clock bay and
 * its complete input route are copied unchanged from the NAND representation. */
const {GateCircuit}=gateNetworkAPI;
const {PROPAGATION_SPEED}=simulationAPI;
const {lengthOf}=geometryAPI;
const {definition:base}=dffCAPI;
const {solve,topology}=cmosNandAPI;
function build() {
  const def={id:'dff-c-mos',width:base.width,height:base.height,groups:base.groups,bodyWidth:base.clockTuningArea.x,clockTuningArea:{...base.clockTuningArea},nodes:[],wires:[],cells:[]},nodes={};
  const pin=(id,x,y,kind='JUNCTION',extra={})=>{const n={id,x,y,kind,initial:0,...extra};def.nodes.push(n);nodes[id]=n;return n;};
  const wire=(from,to,bends=[],extra={})=>{const a=nodes[from],b=nodes[to],points=[[a.x,a.y],...bends,[b.x,b.y]];const w={id:`${from}>${to}`,from,to,points,length:lengthOf(points),...extra};def.wires.push(w);return w;};
  const probe=(id,cell,net,points)=>def.wires.push({id,from:null,to:null,points,length:lengthOf(points),internal:cell,probe:true,net});
  for(const id of ['D','CLK','Q']){const n=base.nodes.find(n=>n.id===id);pin(id,n.x,n.y,n.kind);}
  for(const gate of base.gates) {
    const positions={MS:[18,4],MR:[52,4],CK:[86,4],MQ:[18,29],MN:[52,29],SS:[86,29],SN:[18,54],SQ:[52,54],SR:[86,54]};
    const id=gate.id,[x,y]=positions[id];
    const initial=base.nodes.find(n=>n.id===`${id}.y`).initial;
    const c={id,x,y,width:30,height:20,devices:[],supplies:[]};def.cells.push(c);
    const path=points=>points.map(([dx,dy])=>[x+dx,y+dy]);
    pin(`${id}.a`,x,y,'JUNCTION',{gate:id,escape:[x,y-2]});
    pin(`${id}.b`,x,y+20,'JUNCTION',{gate:id,escape:[x,y+22]});
    pin(`${id}.y`,x-15,y+10,'JUNCTION',{gate:id,escape:[x-16,y+10],initial});
    for(const m of topology) {
      const dy=m.input==='a'?5:15,side=m.type==='p'?-1:1,deviceId=`${id}:${m.id}`;
      pin(deviceId,x+side*4,y+dy,'CONTROL',{cell:id,device:m.id});
      wire(`${id}.${m.input}`,deviceId,[[x,y+dy]],{internal:id,control:true});
      c.devices.push({...m,id:deviceId,localId:m.id,mx:x+side*8,my:y+dy,gateX:x+(m.type==='p'?-5.2:4),bubbleX:x-4.6});
    }
    pin(`${id}:core`,x-8,y+9,'CORE',{cell:id,initial});
    wire(`${id}:core`,`${id}.y`,path([[-13,9],[-13,10]]),{internal:id,net:'Y'});
    probe(`${id}:parallel`,id,'Y',path([[-8,19],[-13,19],[-13,10]]));
    probe(`${id}:return`,id,'Y',path([[8,1],[13,1],[13,10],[-13,10]]));
    probe(`${id}:series`,id,'X',path([[8,9],[8,11]]));
    for(const dy of [1,11])c.supplies.push({net:'VDD',short:path([[-9.5,dy],[-8,dy]]),full:[[0,y-2],...path([[-11,-2],[-11,dy],[-8,dy]])]});
    c.supplies.push({net:'GND',short:path([[8,19],[9.5,19]]),full:[...path([[8,19],[13,19],[13,22]]),[def.bodyWidth,y+22]]});
  }
  const clock=base.nodes.find(n=>n.id==='clock'),entry=base.wires.find(w=>w.id==='CLK>clock');
  pin('clock',clock.x,clock.y);wire('CLK','clock',entry.points.slice(1,-1).map(p=>[...p]));
  pin('clock-fork',102,51);pin('master-enable',37,26);pin('slave-enable',34.5,51);
  wire('clock','clock-fork',[],{clock:true});
  wire('clock-fork','CK.a',[[104,51],[104,55.5],[106,55.5],[106,2],[86,2]],{clock:true});
  wire('clock-fork','CK.b',[[102,52.5],[98,52.5],[98,53.5],[96,53.5],[96,52.5],[94,52.5],[94,53.5],[92,53.5],[92,52.5],[90,52.5],[90,53.5],[88,53.5],[88,52.5],[70,52.5],[70,28],[86,28]],{clock:true});
  wire('CK.y','master-enable',[[70,14],[70,26]],{clock:true});
  wire('master-enable','MS.b',[[18,26]],{clock:true});
  wire('master-enable','MR.b',[[37,28],[52,28]],{clock:true});
  // The inverter contributes 84 + 9 + 8 units before its Y terminal.
  // Match that transport on the direct phase; both latch pairs see their
  // clock controls at exactly the same modeled instant on either edge.
  wire('clock-fork','slave-enable',[],{clock:true});
  wire('slave-enable','SS.b',[[34.5,27.5],[70,27.5],[70,51],[86,51]],{clock:true});
  const folds=[];
  for(let i=0;i<5;i++){const x=40+i*8;folds.push([x,77],[x,75],[x+3,75],[x+3,77]);}
  wire('slave-enable','SR.b',[[34.5,77],...folds,[86,77]],{clock:true});
  // Find feedback drivers through the NAND drawing's junctions. The routes
  // themselves are computed afresh around the larger MOS switch networks.
  const incoming=Object.fromEntries(base.wires.map(w=>[w.to,w.from])),original=Object.fromEntries(base.nodes.map(n=>[n.id,n]));
  const driver=id=>['INPUT','SOURCE'].includes(original[id].kind)?id:driver(incoming[id]);
  const connected=new Set(def.wires.filter(w=>!w.probe).map(w=>w.to)),router=new MosRouter(def);
  for(const c of def.cells)for(const input of ['a','b']) {
    const to=`${c.id}.${input}`;if(connected.has(to))continue;
    const from=driver(incoming[to]);wire(from,to,router.route(nodes[from],nodes[to]).slice(1,-1));
  }
  const from=driver(incoming.Q);wire(from,'Q',router.route(nodes[from],nodes.Q).slice(1,-1));
  return def;
}
class MosRouter {
  constructor(def) {
    this.width=def.bodyWidth;this.height=def.height;this.stride=def.bodyWidth+1;this.blocked=new Set();this.edges=new Map();
    for(const c of def.cells)for(let x=c.x-c.width/2;x<=c.x+c.width/2;x++)for(let y=c.y;y<=c.y+c.height;y++)this.blocked.add(y*this.stride+x);
    // Reserve the full power routes even in the abbreviated view, so both
    // views share one signal layout without hiding signals under a rail.
    for(const c of def.cells)for(const supply of c.supplies)for(let i=1;i<supply.full.length;i++) {
      let [x,y]=supply.full[i-1].map(Math.round);const [tx,ty]=supply.full[i].map(Math.round),dx=Math.sign(tx-x),dy=Math.sign(ty-y);
      while(x!==tx||y!==ty) {
        const a=y*this.stride+x,b=(y+dy)*this.stride+x+dx;
        this.edges.set(a<b?`${a}:${b}`:`${b}:${a}`,supply.net);x+=dx;y+=dy;
      }
    }
  }
  route(source,target) {
    const escape=n=>n.escape??[Math.min(this.width-2,Math.round(n.x)),n.kind==='INPUT'?(n.y===0?2:Math.round(n.y)):this.height-2];
    const a=escape(source),b=escape(target),key=([x,y])=>y*this.stride+x,start=key(a),end=key(b);
    const edge=(a,b)=>a<b?`${a}:${b}`:`${b}:${a}`;
    const heuristic=k=>Math.abs(k%this.stride-b[0])+Math.abs(Math.floor(k/this.stride)-b[1]);
    const heap=[],distance=new Map(),previous=new Map();
    const push=item=>{let i=heap.length;heap.push(item);while(i){const p=(i-1)>>1;if(heap[p].score<=item.score)break;heap[i]=heap[p];i=p;}heap[i]=item;};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(2*i+1<heap.length){let c=2*i+1;if(c+1<heap.length&&heap[c+1].score<heap[c].score)c++;if(last.score<=heap[c].score)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
    distance.set(start*4,0);push({state:start*4,cost:0,score:heuristic(start)});let final;
    while(heap.length) {
      const cur=pop(),k=Math.floor(cur.state/4),dir=cur.state%4;
      if(distance.get(cur.state)!==cur.cost)continue;
      if(k===end){final=cur.state;break;}
      const x=k%this.stride,y=Math.floor(k/this.stride);
      for(const [d,[dx,dy]] of [[0,1],[1,0],[0,-1],[-1,0]].entries()) {
        const nx=x+dx,ny=y+dy;if(nx<2||nx>this.width-2||ny<2||ny>this.height-2)continue;
        const next=ny*this.stride+nx;if(this.blocked.has(next))continue;
        const owner=this.edges.get(edge(k,next)),occupied=owner&&owner!==source.id;
        const cost=cur.cost+1+(d===dir?0:1.5)+(occupied?80:0),state=next*4+d;
        if(cost>=(distance.get(state)??Infinity))continue;
        distance.set(state,cost);previous.set(state,cur.state);push({state,cost,score:cost+heuristic(next)});
      }
    }
    if(final===undefined)throw Error(`Cannot route MOS ${source.id} → ${target.id}`);
    const path=[];for(let s=final;s!==undefined;s=previous.get(s))path.push(Math.floor(s/4));path.reverse();
    for(let i=1;i<path.length;i++)this.edges.set(edge(path[i-1],path[i]),source.id);
    // Keep external terminals at their exact shared coordinates; the short
    // entry/exit jogs join the integral routing grid orthogonally.
    const points=[[source.x,source.y],[source.x,a[1]],...path.map(k=>[k%this.stride,Math.floor(k/this.stride)]),[target.x,b[1]],[target.x,target.y]];
    const unique=points.filter((p,i)=>!i||p[0]!==points[i-1][0]||p[1]!==points[i-1][1]);
    return unique.filter((p,i)=>!i||i===unique.length-1||!((unique[i-1][0]===p[0]&&p[0]===unique[i+1][0])||(unique[i-1][1]===p[1]&&p[1]===unique[i+1][1])));
  }
}
let cachedDefinition;
const definition=()=>cachedDefinition??=build();
const api={get definition(){return definition();},MosDffCircuit,MosRouter};export default api;
