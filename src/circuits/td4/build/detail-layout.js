import templateLayout from './template-layout.js';
import gateNetworkAPI from './gate-network.js';
import geometryAPI from './geometry.js';
/* Compact NAND layouts use the TD4 footprint and exact external bit pins.
 * Only placement/routing changes; gate identities and connectivity stay intact. */
const {definition:cpu}=templateLayout;
const {Builder:NetworkBuilder}=gateNetworkAPI;
const {lengthOf}=geometryAPI;
const interfaces={
  mux:{module:'MUX',ports:{A:'a',B:'b',IN:'input',SEL:'sel',Y:'y'}},
  decoder:{module:'DEC',ports:{OP:'op',C:'cf',SEL:'sel',ENA:'enA',ENB:'enB',ENOUT:'enR',JUMP:'jump'}},
  'next-pc':{module:'NEXT',ports:{PC:'pc',RESULT:'result',JUMP:'jump',Y:'y'}},
};
// Describe connectivity without stale drawing coordinates. Placement is
// assigned once, at finish(), before any wire lengths are calculated.
class Builder extends NetworkBuilder {
  constructor(id,title,description){super(id,title,0,0,description);}
  group(id,label,width,kind='INPUT'){return super.group(id,label,width,0,0,kind);}
  nand(id,a,b){return super.nand(id,a,b,0,0);}
  mux(id,a,b,sel,notSel){return this.nand(id+'.Y',this.nand(id+'.A',a,notSel),this.nand(id+'.B',b,sel));}
  finish(){return finish(this);}
}
function footprint(def) {
  const spec=interfaces[def.id],m=cpu.modules.find(m=>m.id===spec.module);
  def.width=m.width;def.height=m.height;def.zoom={min:1,max:6,step:.5};def.step=10;
  const nodes=Object.fromEntries(def.nodes.map(n=>[n.id,n]));
  for(const g of def.groups) {
    if(g.kind==='CONSTANT'){Object.assign(g,{x:def.width-20,y:def.height-12});Object.assign(nodes[g.ids[0]],{x:g.x,y:g.y,escape:[g.x,g.y-2]});continue;}
    const port=cpu.ports[`${spec.module}.${spec.ports[g.id]}`];
    g.ids.forEach((id,bit)=>{
      const p=cpu.nodes.find(n=>n.id===port.bits[bit]),x=p.x-m.x,y=p.y-m.y;
      const side=x===0?'left':x===def.width?'right':y===0?'top':'bottom';
      const escape=[Math.round(x),Math.round(y)];
      if(side==='left')escape[0]=2;else if(side==='right')escape[0]=def.width-2;
      else if(side==='top')escape[1]=2;else escape[1]=def.height-2;
      Object.assign(nodes[id],{x,y,side,escape});
    });
    const first=nodes[g.ids[0]];Object.assign(g,{x:first.x,y:first.y,side:first.side});
  }
  return def;
}
function position(kind,id) {
  if(kind==='mux') {
    if(id==='NOT_SEL0')return [540,20];if(id==='NOT_SEL1')return [540,56];
    const [,bit,stage,part]=id.match(/^BIT(\d)\.(AB|IN_ZERO|SELECT)\.(A|B|Y)$/),x=76+Number(bit)*126;
    const center=x+(stage==='AB'?-24:stage==='IN_ZERO'?24:0),y=stage==='SELECT'?96:30;
    return [center+(part==='A'?-12:part==='B'?12:0),part==='Y'?y+32:y];
  }
  if(kind==='decoder')return {
    NOT_OP3:[70,12],NOT_OP2:[110,12],NOT_OP1:[150,12],NOT_OP0:[190,12],NOT_BRANCH:[250,12],BRANCH:[250,38],
    'ENA.N':[50,40],ENA:[50,68],'ENB.N':[100,40],ENB:[100,68],'ENOUT.N':[150,40],ENOUT:[150,68],
    SEL0:[190,38],SEL1:[290,38],OP0_OR_NOT_C:[350,12],NOT_JUMP:[350,40],JUMP:[350,68],
  }[id];
  if(id==='NOT_JUMP')return [410,24];if(id==='INC0')return [72,80];
  const bit=Number(id.match(/(?:INC|CARRY|BIT)(\d)/)[1]);
  if(id.startsWith('CARRY'))return [72+(bit-1)*94-32,90];
  const x=72+bit*94;
  if(id.startsWith('INC'))return id.endsWith('N1')?[x,28]:id.endsWith('N2')?[x-15,60]:id.endsWith('N3')?[x+15,60]:[x,90];
  return id.endsWith('.A')?[x-15,124]:id.endsWith('.B')?[x+15,124]:[x,154];
}
function finish(builder) {
  const def=footprint(builder.def);def.gateScale=.375;
  for(const g of def.gates) {
    [g.x,g.y]=position(def.id,g.id);g.scale=def.gateScale;
    for(const [p,dx,dy,ey] of [['a',-3,0,-2],['b',3,0,-2],['y',0,12,14]])Object.assign(builder.nodes[g.id+'.'+p],{x:g.x+dx,y:g.y+dy,escape:[g.x+dx,g.y+ey]});
  }
  def.obstacles=def.gates.map(g=>({id:g.id,x:g.x-6,y:g.y,width:12,height:12}));
  route(def,builder.links);return def;
}
function route(def,links) {
  const router=new Router(def),nodes=Object.fromEntries(def.nodes.map(n=>[n.id,n]));def.wires=[];
  for(const {from,to} of links) {
    const points=router.route(nodes[from],nodes[to]);
    def.wires.push({id:`${from}>${to}`,from,to,points,length:lengthOf(points)});
  }
}
class Router {
  constructor(def) {
    this.width=def.width;this.height=def.height;this.stride=def.width+1;this.blocked=new Set();this.edges=new Map();
    this.spacing=def.routing?.wireSpacing??1;this.turnCost=def.routing?.turnCost??1.5;this.bodyCosts=new Map();
    this.proximityCost=def.routing?.proximityCost??8;
    for(const c of def.obstacles)for(let x=Math.ceil(c.x);x<=c.x+c.width;x++)for(let y=Math.ceil(c.y);y<=c.y+c.height;y++)this.blocked.add(y*this.stride+x);
    if(def.routing?.bodyClearance)for(const c of def.obstacles){
      const pad=def.routing.bodyClearance;
      for(let x=Math.ceil(c.x-pad);x<=c.x+c.width+pad;x++)for(let y=Math.ceil(c.y-pad);y<=c.y+c.height+pad;y++){
        const distance=Math.max(c.x-x,x-c.x-c.width,c.y-y,y-c.y-c.height,0),key=y*this.stride+x;
        if(distance>0)this.bodyCosts.set(key,Math.max(this.bodyCosts.get(key)??0,(pad+1-distance)*4));
      }
    }
    // Keep MOS supply rails free in both supply-display modes. Signals may
    // cross a rail, but must not run along it and disappear underneath it.
    this.powerEdges=new Set();
    for(const points of def.supplyRoutes??[])for(let i=1;i<points.length;i++) {
      let [x,y]=points[i-1];const [tx,ty]=points[i],dx=Math.sign(tx-x),dy=Math.sign(ty-y);
      while(x!==tx||y!==ty){const a=y*this.stride+x,b=(y+dy)*this.stride+x+dx;this.powerEdges.add(a<b?`${a}:${b}`:`${b}:${a}`);x+=dx;y+=dy;}
    }
  }
  route(source,target) {
    const escape=n=>n.escape;
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
        if(this.powerEdges.has(edge(k,next)))continue;
        const owner=this.edges.get(edge(k,next)),occupied=owner&&owner!==source.id;
        // Price nearby parallel tracks, not just exact overlap. Crossings
        // remain possible; a fanout may reuse its own signal's trunk.
        let proximity=0;
        for(let offset=1;offset<this.spacing;offset++)for(const sign of [-1,1]){
          const shift=(dx===0?1:this.stride)*offset*sign,neighbor=this.edges.get(edge(k+shift,next+shift));
          if(neighbor&&neighbor!==source.id)proximity+=(this.spacing-offset)**2*this.proximityCost;
        }
        const cost=cur.cost+1+(d===dir?0:this.turnCost)+(occupied?80:0)+proximity+(this.bodyCosts.get(next)??0),state=next*4+d;
        if(cost>=(distance.get(state)??Infinity))continue;
        distance.set(state,cost);previous.set(state,cur.state);push({state,cost,score:cost+heuristic(next)});
      }
    }
    if(final===undefined)throw Error(`Cannot route detail ${source.id} → ${target.id}`);
    const path=[];for(let s=final;s!==undefined;s=previous.get(s))path.push(Math.floor(s/4));path.reverse();
    for(let i=1;i<path.length;i++)this.edges.set(edge(path[i-1],path[i]),source.id);
    // Keep external terminals at their exact shared coordinates; the short
    // entry/exit jogs join the integral routing grid orthogonally.
    const join=(n,e)=>n.side==='left'||n.side==='right'?[[n.x,n.y],[e[0],n.y],e]:[[n.x,n.y],[n.x,e[1]],e];
    const points=[...join(source,a),...path.map(k=>[k%this.stride,Math.floor(k/this.stride)]),...join(target,b).reverse()];
    const unique=points.filter((p,i)=>!i||p[0]!==points[i-1][0]||p[1]!==points[i-1][1]);
    return unique.filter((p,i)=>!i||i===unique.length-1||!((unique[i-1][0]===p[0]&&p[0]===unique[i+1][0])||(unique[i-1][1]===p[1]&&p[1]===unique[i+1][1])));
  }
}
const api={Builder,route};export default api;
