import runtime from '../../../simulator/td4/alu-mos.js';
const {MosAdderCircuit}=runtime;
import simulationAPI from './simulation.js';
import geometryAPI from './geometry.js';
import aluAPI from './alu.js';
import cmosNandAPI from './cmos-nand.js';
/* CMOS NAND cells solve switch connectivity. Complementary gate-control
 * branches have equal drawn lengths; only wire transport consumes time. */
const {Transport,PROPAGATION_SPEED}=simulationAPI;
const {lengthOf}=geometryAPI;
const {definition:base}=aluAPI;
const {topology,solve}=cmosNandAPI;
// MOS has its own placement and routing. Only logical connections and the
// external terminals come from the NAND version, never its gate footprints.
function build() {
  const def={id:'alu-mos',width:base.width,height:base.height,inputs:base.inputs,outputs:base.outputs,
    portGroups:base.portGroups,nodes:[],wires:[],cells:[]};
  const byId={};
  const pin=(id,x,y,kind,extra={})=>{const n={id,x,y,kind,...extra};def.nodes.push(n);byId[id]=n;return n;};
  const addWire=(id,from,to,points,extra={})=>def.wires.push({id,from,to,points,length:lengthOf(points),...extra});
  for(const id of [...def.inputs,...def.outputs]) {
    const n=base.nodes.find(n=>n.id===id);pin(id,n.x,n.y,n.kind);
  }
  // Nine switch networks per bit in three rows. Each transistor has a
  // ten-unit channel, rather than being scaled into a NAND symbol.
  const positions=[[1,0],[2,0],[0,0],[1,1],[2,1],[2,2],[0,2],[1,2],[0,1]];
  for(let bit=0;bit<4;bit++)for(let i=0;i<9;i++) {
    const [col,row]=positions[i],x=26+(3-bit)*141+col*47,y=20+row*44,id=`B${bit}.N${i+1}`;
    const c={id,x,y,devices:[],supplies:[]};def.cells.push(c);
    const path=points=>points.map(([dx,dy])=>[x+dx,y+dy]);
    pin(`${id}.a`,x,y,'JUNCTION',{gate:id,escape:[x,y-4]});
    pin(`${id}.b`,x,y+36,'JUNCTION',{gate:id,escape:[x,y+38]});
    pin(`${id}.y`,x-20,y+17,'JUNCTION',{gate:id,escape:[x-22,y+17]});
    for(const m of topology) {
      const ry=m.input==='a'?8:26,side=m.type==='p'?-1:1,deviceId=`${id}:${m.id}`;
      pin(deviceId,x+side*5,y+ry,'CONTROL',{cell:id,device:m.id});
      const from=`${id}.${m.input}`,source=byId[from];
      addWire(`${from}>${deviceId}`,from,deviceId,[[source.x,source.y],[x,y+ry],[x+side*5,y+ry]],{internal:id,control:true});
      c.devices.push({...m,id:deviceId,localId:m.id,mx:x+side*11,my:y+ry,gateX:x+(m.type==='p'?-7:5),bubbleX:x-6});
    }
    const core=pin(`${id}:core`,x-11,y+15,'CORE',{cell:id});
    addWire(`${id}:drain`,core.id,`${id}.y`,path([[-11,15],[-17,15],[-17,17],[-20,17]]),{internal:id,net:'Y'});
    for(const [name,net,points] of [
      ['parallel','Y',[[-11,33],[-17,33],[-17,17]]],
      ['return','Y',[[11,1],[17,1],[17,17],[-17,17]]],
      ['series','X',[[11,15],[11,19]]],
    ])addWire(`${id}:${name}`,null,null,path(points),{internal:id,probe:true,net});
    for(const ry of [1,19])c.supplies.push({net:'VDD',short:path([[-13,ry],[-11,ry]]),full:[[0,y-2],...path([[-14,-2],[-14,ry],[-11,ry]])]});
    c.supplies.push({net:'GND',short:path([[11,33],[13,33]]),full:[...path([[11,33],[17,33],[17,40]]),[def.width,y+40]]});
  }
  // Collapse layout-only junctions from the NAND drawing to find each actual
  // driver. Wire delays are recalculated from the new MOS routes.
  const incoming=Object.fromEntries(base.wires.map(w=>[w.to,w.from]));
  const original=Object.fromEntries(base.nodes.map(n=>[n.id,n]));
  const driver=id=>original[id].kind==='INPUT'||original[id].kind==='SOURCE'?id:driver(incoming[id]);
  const links=[];
  for(const c of def.cells)for(const input of ['a','b'])links.push([driver(incoming[`${c.id}.${input}`]),`${c.id}.${input}`]);
  for(const id of def.outputs)links.push([driver(incoming[id]),id]);
  const router=new MosRouter(def);
  for(const [from,to] of links)addWire(`${from}>${to}`,from,to,router.route(byId[from],byId[to]));
  return def;
}
// One-unit routing lanes around the enlarged switch networks. Distinct
// signals pay a high cost for sharing a segment; MOS bodies are obstacles.
class MosRouter {
  constructor(def) {
    this.width=def.width;this.height=def.height;this.stride=def.width+1;this.blocked=new Set();this.edges=new Map();
    for(const c of def.cells)for(let x=c.x-19;x<=c.x+19;x++)for(let y=c.y;y<=c.y+36;y++)this.blocked.add(y*this.stride+x);
    // Reserve the full power routes even in the abbreviated view, so both
    // views share one signal layout without hiding signals under a rail.
    for(const c of def.cells)for(const supply of c.supplies)for(let i=1;i<supply.full.length;i++) {
      let [x,y]=supply.full[i-1];const [tx,ty]=supply.full[i],dx=Math.sign(tx-x),dy=Math.sign(ty-y);
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
const api={get definition(){return definition();},MosAdderCircuit,solve,topology};export default api;
