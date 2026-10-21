import runtime from '../../../simulator/td4/gate-network.js';
const {GateCircuit}=runtime;
import simulationAPI from './simulation.js';
import geometryAPI from './geometry.js';
/* Two-input NAND networks. Logic runs only when routed wire events arrive. */
const {Transport,PROPAGATION_SPEED}=simulationAPI;
const {lengthOf}=geometryAPI;
class Builder {
  constructor(id,title,width,height,description) {
    this.def={id,title,width,height,description,nodes:[],gates:[],wires:[],groups:[],labels:[]};this.nodes={};this.links=[];
  }
  pin(id,x,y,kind,gate=null) {
    if(this.nodes[id])throw Error(`Duplicate pin: ${id}`);
    const n={id,x,y,kind,gate};this.nodes[id]=n;this.def.nodes.push(n);return id;
  }
  group(id,label,width,x,y,kind='INPUT') {
    const ids=Array.from({length:width},(_,bit)=>this.pin(`${id}${bit}`,x+bit*8,y,kind));
    this.def.groups.push({id,label,width,ids,kind,x,y});return ids;
  }
  nand(id,a,b,x,y) {
    this.def.gates.push({id,kind:'NAND',x,y});
    this.pin(`${id}.a`,x-8,y,'PORT',id);this.pin(`${id}.b`,x+8,y,'PORT',id);
    const out=this.pin(`${id}.y`,x,y+32,'SOURCE',id);
    this.link(a,`${id}.a`);this.link(b,`${id}.b`);return out;
  }
  invert(id,a,x,y) {return this.nand(id,a,a,x,y);}
  link(from,to) {this.links.push({from,to});}
  mux(id,a,b,sel,notSel,x,y) {
    const left=this.nand(`${id}.A`,a,notSel,x-40,y);
    const right=this.nand(`${id}.B`,b,sel,x+40,y);
    return this.nand(`${id}.Y`,left,right,x,y+80);
  }
  finish() {
    const router=new Router(this.def);
    for(const {from,to} of this.links) {
      const points=router.route(this.nodes[from],this.nodes[to]);
      this.def.wires.push({id:`${from}>${to}`,from,to,points,length:lengthOf(points)});
    }
    return this.def;
  }
}
// Orthogonal routing on an 8-unit grid. Gate bodies are obstacles. Distinct
// signals avoid shared segments; crossings have no electrical connection.
class Router {
  constructor(def) {
    this.cols=def.width/8+1;this.rows=def.height/8+1;this.blocked=new Set();this.edges=new Map();
    for(const g of def.gates)for(let x=g.x-16;x<=g.x+16;x+=8)for(let y=g.y;y<=g.y+32;y+=8)this.blocked.add(this.key(x/8,y/8));
  }
  key(x,y) {return y*this.cols+x;}
  edge(a,b) {return a<b?`${a}:${b}`:`${b}:${a}`;}
  route(source,target) {
    const start=this.key(source.x/8,source.y/8+1),end=this.key(target.x/8,target.y/8-1);
    const heap=[],distance=new Map(),previous=new Map();
    const push=item=>{let i=heap.length;heap.push(item);while(i){const p=(i-1)>>1;if(heap[p].score<=item.score)break;heap[i]=heap[p];i=p;}heap[i]=item;};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(2*i+1<heap.length){let c=2*i+1;if(c+1<heap.length&&heap[c+1].score<heap[c].score)c++;if(last.score<=heap[c].score)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
    const heuristic=key=>Math.abs(key%this.cols-end%this.cols)+Math.abs(Math.floor(key/this.cols)-Math.floor(end/this.cols));
    const initial=start*4;distance.set(initial,0);push({state:initial,cost:0,score:heuristic(start)});
    let final;
    while(heap.length) {
      const current=pop(),key=Math.floor(current.state/4),dir=current.state%4;
      if(current.cost!==distance.get(current.state))continue;
      if(key===end){final=current.state;break;}
      const x=key%this.cols,y=Math.floor(key/this.cols);
      for(const [direction,[dx,dy]] of [[0,1],[1,0],[0,-1],[-1,0]].entries()) {
        const nx=x+dx,ny=y+dy;if(nx<1||nx>=this.cols-1||ny<3||ny>=this.rows-1)continue;
        const next=this.key(nx,ny);if(this.blocked.has(next))continue;
        const owners=this.edges.get(this.edge(key,next));
        const occupied=owners&&(!owners.has(source.id)||owners.size>1);
        const cost=current.cost+1+(direction===dir?0:.35)+(occupied?40:0);
        const state=next*4+direction;
        if(cost>=(distance.get(state)??Infinity))continue;
        distance.set(state,cost);previous.set(state,current.state);push({state,cost,score:cost+heuristic(next)});
      }
    }
    if(final===undefined)throw Error(`Cannot route ${source.id} → ${target.id}`);
    const path=[];
    for(let state=final;state!==undefined;state=previous.get(state))path.push(Math.floor(state/4));
    path.reverse();
    for(let i=1;i<path.length;i++) {
      const edge=this.edge(path[i-1],path[i]);if(!this.edges.has(edge))this.edges.set(edge,new Set());this.edges.get(edge).add(source.id);
    }
    const points=[[source.x,source.y],...path.map(k=>[(k%this.cols)*8,Math.floor(k/this.cols)*8]),[target.x,target.y]];
    return points.filter((p,i)=>i===0||i===points.length-1||!((points[i-1][0]===p[0]&&p[0]===points[i+1][0])||(points[i-1][1]===p[1]&&p[1]===points[i+1][1])));
  }
}
const api={Builder,GateCircuit};export default api;
