import denseLayoutAPI from './dense-layout.js';
import geometryAPI from './geometry.js';
import clockBalanceAPI from './clock-balance.js';
/* Fit the final 1.3-unit circuit without mutating its source template. */
const {layout}=denseLayoutAPI;
const {lengthOf}=geometryAPI;
const near=(a,b)=>Math.abs(a-b)<1e-7;
const clone=value=>JSON.parse(JSON.stringify(value));
function fitDffContents(def){
  // Use most of each bit's space, reserving only the terminal routing lanes.
  // Uniform scaling preserves the local master/slave clock path ratios.
  const bits=clone(def.bits??[]),scale=bits.length?.92:.96;
  const xScale=x=>!bits.length||bits.some(b=>x>=b.x-1e-7&&x<=b.x+b.width+1e-7)?scale:1;
  const px=x=>{
    if(!bits.length)return def.width/2+(x-def.width/2)*scale;
    const bit=bits.find(b=>x>=b.x-1e-7&&x<=b.x+b.width+1e-7);
    return bit?bit.x+bit.width/2+(x-bit.x-bit.width/2)*scale:x;
  };
  const py=y=>def.height/2+(y-def.height/2)*scale,point=([x,y])=>[px(x),py(y)];
  const nodes=Object.fromEntries(def.nodes.map(n=>[n.id,n]));
  for(const n of def.nodes)if(!['INPUT','OUTPUT','CONSTANT'].includes(n.kind))[n.x,n.y]=point([n.x,n.y]);
  for(const w of def.wires)if(!w.terminal){
    w.points=w.points.map(point);
    if(!w.probe){w.points[0]=[nodes[w.from].x,nodes[w.from].y];w.points[w.points.length-1]=[nodes[w.to].x,nodes[w.to].y];}
    w.length=lengthOf(w.points);
  }
  for(const g of def.gates??[]){g.sx*=xScale(g.x);g.x=px(g.x);g.y=py(g.y);g.sy*=scale;}
  for(const m of def.modules??[]){m.width*=xScale(m.x);m.x=px(m.x);m.y=py(m.y);m.height*=scale;}
  for(const c of def.cells??[]){
    c.width*=xScale(c.x);c.x=px(c.x);c.y=py(c.y);c.height*=scale;
    c.channelHalf*=scale;c.leadHalf*=scale;
    for(const m of c.devices){m.mx=px(m.mx);m.my=py(m.my);m.gateX=px(m.gateX);m.bubbleX=px(m.bubbleX);}
    c.controlDots=c.controlDots.map(([name,x,y])=>[name,...point([x,y])]);c.outputDot=point(c.outputDot);
    for(const s of c.supplies){s.short=s.short.map(point);s.full=s.full.map(point);}
  }
  for(const bit of def.bits??[]){bit.x+=bit.width*(1-scale)/2;bit.width*=scale;}
  // External pins remain exact. Assign separate tracks on each used side,
  // instead of the old sub-unit-spaced perimeter wires.
  const sides=['top','right','bottom','left'],tracks={top:[],right:[],bottom:[],left:[]};
  for(const w of def.wires.filter(w=>w.terminal)){
    const output=nodes[w.to].kind==='OUTPUT',external=nodes[output?w.to:w.from],internal=nodes[output?w.from:w.to];
    const walk=direction=>{const result=[external.side];let i=sides.indexOf(external.side);while(sides[i]!==internal.side){i=(i+direction+4)%4;result.push(sides[i]);}return result;};
    const path=(sequence,bounds)=>{
      const project=n=>n.side==='left'||n.side==='right'?[bounds[n.side],n.y]:[n.x,bounds[n.side]];
      const result=[[external.x,external.y],project(external)];
      for(let i=1;i<sequence.length;i++){
        const pair=[sequence[i-1],sequence[i]],horizontal=pair.find(s=>s==='top'||s==='bottom'),vertical=pair.find(s=>s==='left'||s==='right');
        result.push([bounds[vertical],bounds[horizontal]]);
      }
      result.push(project(internal),[internal.x,internal.y]);return output?result.reverse():result;
    };
    const bounds={left:2,right:def.width-2,top:2,bottom:def.height-2},a=walk(1),b=walk(-1);
    const sequence=lengthOf(path(a,bounds))<=lengthOf(path(b,bounds))?a:b;
    for(const side of sequence){
      // Short, disjoint connections (notably OUT EN) can share a lane.
      // Avoid adding an unnecessary fifth top lane through the selector.
      const axis=side==='top'||side==='bottom'?'x':'y';
      const span=sequence.length===1?[Math.min(external[axis],internal[axis]),Math.max(external[axis],internal[axis])]:[-Infinity,Infinity];
      let lane=0;
      while(tracks[side][lane]?.some(([a,b])=>span[0]<b+2.2&&span[1]>a-2.2))lane++;
      (tracks[side][lane]??=[]).push(span);
      const inset=2+lane*2.2;bounds[side]=side==='right'?def.width-inset:side==='bottom'?def.height-inset:inset;
    }
    w.points=path(sequence,bounds).filter((p,i,all)=>!i||!near(p[0],all[i-1][0])||!near(p[1],all[i-1][1]));w.length=lengthOf(w.points);
  }
}
function bodies(def){
  if(def.view==='module')return def.modules;
  if(def.view==='mos')return def.cells.map(c=>({x:c.x-c.width/2,y:c.y,width:c.width,height:c.height}));
  return def.gates.map(g=>({x:g.x-6*g.sx,y:g.y,width:12*g.sx,height:12*g.sy*(def.gateScaleY??1)}));
}
function enlargeRegisterMos(def){
  // A monotone coordinate map expands the MOS rows and bit bodies while
  // compressing the empty corridors. Existing orthogonal routes keep their
  // topology and cannot start crossing a body under this transformation.
  const interpolate=knots=>value=>{
    let i=1;while(i<knots.length-1&&value>knots[i][0])i++;
    const [a,b]=[knots[i-1],knots[i]];
    return a[1]+(value-a[0])*(b[1]-a[1])/(b[0]-a[0]);
  };
  const mirrored=['PC','R'].includes(def.cpuModule),flip=x=>mirrored?def.width-x:x;
  const bits=def.bits.map(b=>({x:mirrored?def.width-b.x-b.width:b.x,width:b.width})).sort((a,b)=>a.x-b.x);
  const horizontal=interpolate([[0,0],...bits.flatMap(b=>[[b.x,b.x],[b.x+b.width,b.x+b.width*1.08]]),[475,475],[def.width,def.width]]);
  const px=x=>flip(horizontal(flip(x)));
  const unit=(def.height-8)/78*.92,offset=def.height/2+(4-def.height/2)*.92;
  const vertical=interpolate([[0,0],[2,2],[20,22],[21,23],[39,43],[41,44.5],[43,46.3],[46,48.5],[50,51],[53,53],[74,76],[78,78]].map(([a,b])=>[offset+a*unit,offset+b*unit]));
  const py=y=>y<offset||y>def.height-offset?y:vertical(y),point=([x,y])=>[px(x),py(y)];
  const nodes=Object.fromEntries(def.nodes.map(n=>[n.id,n]));
  for(const n of def.nodes)if(!['INPUT','OUTPUT','CONSTANT'].includes(n.kind)){
    [n.x,n.y]=point([n.x,n.y]);if(n.escape)n.escape=point(n.escape);
  }
  for(const w of def.wires){
    w.points=w.points.map(point);
    if(!w.probe){w.points[0]=[nodes[w.from].x,nodes[w.from].y];w.points[w.points.length-1]=[nodes[w.to].x,nodes[w.to].y];}
    if(w.terminal){
      const output=nodes[w.to].kind==='OUTPUT',external=nodes[output?w.to:w.from],adjacent=w.points[output?w.points.length-2:1];
      // Preserve the perpendicular approach to each unchanged CPU pin.
      if(['left','right'].includes(external.side))adjacent[1]=external.y;else adjacent[0]=external.x;
      w.points=w.points.flatMap((p,i,all)=>i&&!near(all[i-1][0],p[0])&&!near(all[i-1][1],p[1])?[[all[i-1][0],p[1]],p]:[p]);
    }
    w.length=lengthOf(w.points);
  }
  for(const c of def.cells){
    const left=px(c.x-c.width/2),right=px(c.x+c.width/2),bottom=py(c.y+c.height),sy=(bottom-py(c.y))/c.height;
    c.width=right-left;c.x=px(c.x);c.y=py(c.y);c.height*=sy;c.channelHalf*=sy;c.leadHalf*=sy;
    for(const m of c.devices){m.mx=px(m.mx);m.my=py(m.my);m.gateX=px(m.gateX);m.bubbleX=px(m.bubbleX);}
    c.controlDots=c.controlDots.map(([name,x,y])=>[name,...point([x,y])]);c.outputDot=point(c.outputDot);
    for(const s of c.supplies){s.short=s.short.map(point);s.full=s.full.map(point);}
  }
  for(const bit of def.bits){const right=px(bit.x+bit.width);bit.x=px(bit.x);bit.width=right-bit.x;}
  for(const c of def.cells){
    // Spend the spare room inside each CMOS cell on the transistor symbols
    // too. Ports stay fixed; internal leads and connected nets move together.
    const ux=c.width/22,uy=c.height/16;
    const stretchX=interpolate([[-11,-11],[-9,-10],[-6,-7.5],[6,7.5],[9,10],[11,11]]);
    const stretchY=interpolate([[0,0],[1,.3],[7,7.7],[8,8],[9,8.3],[15,15.7],[16,16]]);
    const cx=x=>Math.abs(x-c.x)>11*ux?x:c.x+stretchX((x-c.x)/ux)*ux;
    const cy=y=>y<c.y||y>c.y+c.height?y:c.y+stretchY((y-c.y)/uy)*uy;
    const cp=([x,y])=>[cx(x),cy(y)];
    for(const n of def.nodes)if(n.cell===c.id)[n.x,n.y]=cp([n.x,n.y]);
    for(const w of def.wires.filter(w=>w.internal===c.id)){
      w.points=w.points.map(cp);w.length=lengthOf(w.points);
    }
    c.channelHalf*=37/30;c.leadHalf*=37/30;
    for(const m of c.devices){m.mx=cx(m.mx);m.my=cy(m.my);m.gateX=cx(m.gateX);m.bubbleX=cx(m.bubbleX);}
    c.controlDots=c.controlDots.map(([name,x,y])=>[name,...cp([x,y])]);c.outputDot=cp(c.outputDot);
    for(const s of c.supplies){s.short=s.short.map(cp);s.full=s.full.map(cp);}
  }
  for(const w of def.wires)if(!w.probe){
    w.points[0]=[nodes[w.from].x,nodes[w.from].y];w.points[w.points.length-1]=[nodes[w.to].x,nodes[w.to].y];w.length=lengthOf(w.points);
  }
  clockBalanceAPI.balanceClockPhases(def,{transistorControls:true});
}
function clockBay(def){
  const branches=def.wires.filter(w=>w.clockBranch!==undefined);
  if(!branches.length)return;
  const bay=def.clockTuningArea,mirrored=['PC','R'].includes(def.cpuModule),fx=x=>mirrored?bay.x+bay.width-x:bay.x+x;
  const inset=def.view==='mos'?2:10;
  bay.x+=mirrored?inset:-inset;
  for(const w of branches){w.points=[...w.points.slice(0,2),[mirrored?bay.x+bay.width:bay.x,w.points[1][1]],...w.points.slice(-3)];w.length=lengthOf(w.points);}
  const common=Math.max(...branches.map(w=>w.length)),foldPoints=[];
  for(const w of branches){
    const count=w.clockBranch,lane=w.points[1][1],depth=count?(common-w.length)/(2*count):0,points=[];
    // 1 / 2 / 3 tall folds replace twelve short teeth. All vertical legs
    // are 2.5 units apart; the upper half of the edge bay is now occupied.
    const start=[0,6.5,16.5,31.5][count];
    if(depth>1e-7)for(let i=0;i<count;i++){
      const x=start-i*5;
      points.push([fx(x),lane],[fx(x),lane-depth],[fx(x-2.5),lane-depth],[fx(x-2.5),lane]);
    }
    w.points.splice(2,0,...points);w.length=lengthOf(w.points);foldPoints.push(...points);
  }
  bay.y=Math.min(...foldPoints.map(p=>p[1]))-2;
  bay.height=Math.max(...foldPoints.map(p=>p[1]))-bay.y+2;
}
function spreadPhaseFolds(def){
  const obstacles=bodies(def),margin=.8;
  const clear=(a,b)=>!obstacles.some(c=>near(a[0],b[0])?
    a[0]>c.x-margin&&a[0]<c.x+c.width+margin&&Math.max(a[1],b[1])>c.y-margin&&Math.min(a[1],b[1])<c.y+c.height+margin:
    a[1]>c.y-margin&&a[1]<c.y+c.height+margin&&Math.max(a[0],b[0])>c.x-margin&&Math.min(a[0],b[0])<c.x+c.width+margin);
  const compact=points=>{
    const unique=points.filter((p,i)=>!i||!near(p[0],points[i-1][0])||!near(p[1],points[i-1][1]));
    return unique.filter((p,i)=>!i||i===unique.length-1||!((near(unique[i-1][0],p[0])&&near(p[0],unique[i+1][0]))||(near(unique[i-1][1],p[1])&&near(p[1],unique[i+1][1]))));
  };
  for(const w of def.wires){
    if(w.clockBranch!==undefined||w.internal||w.points.length<9||!/clock|slave-enable|master-enable/.test(w.from+' '+w.to))continue;
    const original=clone(w.points),length=w.length;
    let points=clone(w.points),changed=true;
    while(changed){
      changed=false;
      outer:for(let i=0;i<points.length-3;i++)for(let j=points.length-1;j>i+2;j--){
        const a=points[i],b=points[j];
        if(!(near(a[0],b[0])||near(a[1],b[1]))||!clear(a,b))continue;
        if(lengthOf(points.slice(i,j+1))-lengthOf([a,b])<1e-7)continue;
        points.splice(i+1,j-i-1);points=compact(points);changed=true;break outer;
      }
    }
    const extra=length-lengthOf(points);
    if(extra<5.2)continue;
    const bit=def.bits?.find(b=>w.from.startsWith(b.prefix)),left=bit?bit.x+1:3,right=bit?bit.x+bit.width-1:def.width-3;
    let chosen;
    // Few wide folds, with the upper side of a free corridor preferred.
    for(let count=1;count<=6&&!chosen;count++)for(let i=1;i<points.length&&!chosen;i++)for(const sign of [-1,1]){
      const a=points[i-1],b=points[i],axis=near(a[0],b[0])?1:0,other=1-axis,step=(b[axis]-a[axis])/(count*2+1),depth=sign*extra/(2*count);
      if(Math.abs(step)<2.6||Math.abs(depth)<2.6)continue;
      const folds=[];
      for(let j=0;j<count;j++)for(const [offset,raised] of [[j*2+1,0],[j*2+1,1],[j*2+2,1],[j*2+2,0]]){
        const p=[...a];p[axis]+=step*offset;p[other]+=depth*raised;folds.push(p);
      }
      const path=[a,...folds,b];
      if(folds.some(([x,y])=>x<left||x>right||y<5||y>def.height-5)||path.slice(1).some((p,j)=>!clear(path[j],p)))continue;
      chosen=compact([...points.slice(0,i),...folds,...points.slice(i)]);break;
    }
    if(chosen&&chosen.length<original.length){w.points=chosen;w.length=lengthOf(chosen);}
  }
}
function build(base){
  const def=clone(base);def.id=`td4-${def.cpuModule}-${def.view}`;def.wireWidth=1.3;
  if(['ALU','MUX','DEC','NEXT'].includes(def.cpuModule))return layout(def,{finalPass:true});
  fitDffContents(def);
  if(def.view==='mos'&&def.bits)enlargeRegisterMos(def);
  clockBay(def);spreadPhaseFolds(def);return def;
}
export default {build};
