
/* Static ideal supply rails. Junction dots identify joins; unmarked crossings
 * (including crossings of signal wires) are not connections. */
  const near=(a,b)=>Math.abs(a-b)<1e-7;
  const compact=points=>points.filter((p,i)=>!i||i===points.length-1||!((near(points[i-1][0],p[0])&&near(p[0],points[i+1][0]))||(near(points[i-1][1],p[1])&&near(p[1],points[i+1][1]))));
  const segments=paths=>paths.flatMap(w=>w.points.slice(1).map((b,i)=>({net:w.net,a:w.points[i],b})));
  function crosses(a,b,m){
    const e=1e-7;
    return near(a[0],b[0])?a[0]>m.x+e&&a[0]<m.x+m.width-e&&Math.max(a[1],b[1])>m.y+e&&Math.min(a[1],b[1])<m.y+m.height-e:
      a[1]>m.y+e&&a[1]<m.y+m.height-e&&Math.max(a[0],b[0])>m.x+e&&Math.min(a[0],b[0])<m.x+m.width-e;
  }
  function overlaps(a,b,s){
    const axis=near(a[0],b[0])?1:0,other=1-axis;
    return near(a[other],s.a[other])&&near(a[other],s.b[other])&&Math.min(Math.max(a[axis],b[axis]),Math.max(s.a[axis],s.b[axis]))-Math.max(Math.min(a[axis],b[axis]),Math.min(s.a[axis],s.b[axis]))>1e-7;
  }
  function route(start,end,obstacles,{gap=1.5,reserved=[],bounds=null}={}){
    const clear=(a,b)=>!obstacles.some(m=>crosses(a,b,m))&&!reserved.some(s=>overlaps(a,b,s));
    if((near(start[0],end[0])||near(start[1],end[1]))&&clear(start,end))return [start,end];
    const coordinates=(axis)=>{
      const pos=axis?'y':'x',size=axis?'height':'width';
      const values=[start[axis],end[axis],...obstacles.flatMap(m=>[m[pos]-gap,m[pos]+m[size]+gap])];
      return [...new Set(values)].filter(v=>!bounds||(v>=bounds[pos]&&v<=bounds[pos]+bounds[size])).sort((a,b)=>a-b);
    };
    const xs=coordinates(0),ys=coordinates(1);
    const key=(x,y)=>y*xs.length+x,point=k=>[xs[k%xs.length],ys[Math.floor(k/xs.length)]];
    const first=key(xs.indexOf(start[0]),ys.indexOf(start[1])),last=key(xs.indexOf(end[0]),ys.indexOf(end[1]));
    const distance=new Map([[first,0]]),prev=new Map(),heap=[];
    const push=item=>{let i=heap.length;heap.push(item);while(i){const p=(i-1)>>1;if(heap[p].cost<=item.cost)break;heap[i]=heap[p];i=p;}heap[i]=item;};
    const pop=()=>{const first=heap[0],last=heap.pop();if(heap.length){let i=0;while(2*i+1<heap.length){let c=2*i+1;if(c+1<heap.length&&heap[c+1].cost<heap[c].cost)c++;if(last.cost<=heap[c].cost)break;heap[i]=heap[c];i=c;}heap[i]=last;}return first;};
    push({key:first,cost:0});
    while(heap.length){
      const item=pop(),current=item.key;if(item.cost!==distance.get(current))continue;if(current===last)break;
      const x=current%xs.length,y=Math.floor(current/xs.length),a=point(current);
      for(const [nx,ny] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
        if(nx<0||nx>=xs.length||ny<0||ny>=ys.length)continue;
        const next=key(nx,ny),b=point(next);if(!clear(a,b))continue;
        const cost=item.cost+Math.abs(a[0]-b[0])+Math.abs(a[1]-b[1]);
        if(cost>=(distance.get(next)??Infinity))continue;
        distance.set(next,cost);prev.set(next,current);push({key:next,cost});
      }
    }
    if(!distance.has(last))throw Error('Cannot connect supply rail at '+start);
    const result=[];for(let k=last;k!==undefined;k=prev.get(k))result.push(point(k));return compact(result.reverse());
  }
  function build(layout,parts){
    const rails=[{net:'VDD',label:'+V',x:-16},{net:'GND',label:'GND',x:layout.width+16}],branches=[],dots=[];
    // Keep the CPU supply network below the external INPUT/ROM area,
    // including the space above them, ready for a separate CPU package.
    const external=layout.modules.filter(m=>['IN','ROM'].includes(m.id));
    const obstacles=layout.modules.concat(external.map(m=>({...m,y:-layout.height,height:layout.height+m.y+m.height})));
    const top=Math.min(...layout.modules.filter(m=>parts[m.id]).map(m=>m.y))-6;
    const supplyPaths=layout.modules.flatMap(m=>(parts[m.id]?.definition.cells??[]).flatMap(c=>c.supplies.map(s=>({net:s.net,points:s.full.map(([x,y])=>[x+m.x,y+m.y])}))));
    const supplySegments=segments(supplyPaths);
    for(const m of layout.modules){
      const part=parts[m.id];if(!part)continue;
      for(const rail of rails){
        const supplies=part.definition.cells.flatMap(c=>c.supplies.filter(s=>s.net===rail.net));
        const mirrored=['PC','R'].includes(m.id),left=(rail.net==='VDD')!==mirrored;
        const x=left?m.x-2:m.x+m.width+2;
        const ends=new Map();
        for(const s of supplies){
          const p=rail.net==='VDD'?s.full[0]:s.full.at(-1),end=[m.x+p[0],m.y+p[1]];
          ends.set(end.join(','),end);
        }
        const bodies=part.definition.cells.map(c=>({x:m.x+c.x-c.width/2,y:m.y+c.y,width:c.width,height:c.height}));
        for(const end of ends.values()){
          const reserved=supplySegments.concat(segments(branches)).filter(s=>s.net!==rail.net);
          const points=route(end,[x,end[1]],bodies,{gap:rail.net==='VDD'?1:1.7,reserved,bounds:{x:m.x-2,y:m.y-2,width:m.width+4,height:m.height+4}});
          branches.push({net:rail.net,module:m.id,points});dots.push({net:rail.net,x,y:end[1]});
        }
        const y=m.y-(rail.net==='VDD'?4:6),maxY=Math.max(...[...ends.values()].map(p=>p[1]));
        branches.push({net:rail.net,module:m.id,points:[[x,y],[x,maxY]]});
        // Upper CPU branches already descend below ROM. Continue that
        // horizontal run straight to +V, without climbing back around INPUT.
        const railY=rail.net==='VDD'?Math.max(y,...external.map(m=>m.y+m.height+4)):y;
        const points=route([x,y],[rail.x,railY],obstacles,{bounds:{x:-32,y:0,width:layout.width+64,height:layout.height},gap:rail.net==='VDD'?4:6,reserved:segments(branches).filter(s=>s.net!==rail.net)});
        branches.push({net:rail.net,module:m.id,points});dots.push({net:rail.net,x:rail.x,y:railY});
      }
    }
    // Mark branch joins along shared trunks, as well as the explicit rail
    // taps. Opposite-net and signal crossings never receive a junction dot.
    const lines=segments(branches);
    for(const s of lines)for(const p of [s.a,s.b])if(lines.some(other=>other!==s&&other.net===s.net&&
      (near(other.a[0],other.b[0])?near(p[0],other.a[0])&&p[1]>Math.min(other.a[1],other.b[1])+1e-7&&p[1]<Math.max(other.a[1],other.b[1])-1e-7:
        near(p[1],other.a[1])&&p[0]>Math.min(other.a[0],other.b[0])+1e-7&&p[0]<Math.max(other.a[0],other.b[0])-1e-7)))dots.push({net:s.net,x:p[0],y:p[1]});
    const uniqueDots=[...new Map(dots.map(d=>[`${d.net}:${d.x.toFixed(6)}:${d.y.toFixed(6)}`,d])).values()];
    return {rails,branches,dots:uniqueDots,top,bottom:layout.height-5};
  }
  const api={build,crosses,overlaps,segments};export default api;
