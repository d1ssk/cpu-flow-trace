import geometry from './geometry.js';
const {lengthOf}=geometry;
const near=(a,b)=>Math.abs(a-b)<1e-7;
const length=w=>w.length=lengthOf(w.points);
function balanceClockPhases(def,{transistorControls=false}={}) {
  if(!def.groups.some(g=>g.id==='CLK'))return;
  const incoming=Object.fromEntries(def.wires.filter(w=>!w.probe).map(w=>[w.to,w]));
  const prefixes=def.bits?[0,1,2,3].map(i=>`B${i}.`):[''];
  // Determine phase travel through connected passive wires and the NOT.
  // Balance its two inputs first, then the four latch control inputs.
  for(const p of prefixes) {
    const start=p+'clock';
    const travel=(id,seen=new Set())=>{
      if(id===start)return 0;
      if(seen.has(id))throw Error('Clock cycle '+id);seen.add(id);
      if(id===p+'CK.q')return travel(p+'CK.d',seen);
      if(id===p+'CK.y'&&def.view==='nand')return travel(p+'CK.a',seen);
      if(id===p+'CK:core')return travel(p+'CK:PA',seen);
      const w=incoming[id];if(!w)throw Error('Missing clock driver '+id);
      return w.length+travel(w.from,seen);
    };
    if(def.view==='mos') {
      const ids=['a','b'].map(x=>p+'CK.'+x),times=ids.map(x=>travel(x)),max=Math.max(...times);
      ids.forEach((id,i)=>detour(def,incoming[id],max-times[i]));
    }
    const ids=def.view==='module'?['M.en','S.en']:['MS.b','MR.b','SS.b','SR.b'];
    // MOS rows may have different heights: include the final connection
    // from each cell's input to its actual transistor control terminal.
    const times=ids.map(id=>travel(p+(transistorControls&&def.view==='mos'?id.replace('.b',':PB'):id))),max=Math.max(...times);
    ids.forEach((id,i)=>detour(def,incoming[p+id],max-times[i]));
  }
}
// Add physical wire travel in a free strip alongside an existing segment.
// No delay overrides: the little folds are drawn and measured like any wire.
function detour(def,w,extra) {
  if(extra<1e-7)return;
  const bodies=(def.modules??[]).concat((def.cells??[]).map(c=>({x:c.x-c.width/2,y:c.y,width:c.width,height:c.height})));
  if(def.view==='nand')for(const g of def.gates)bodies.push({x:g.x-6*g.sx,y:g.y,width:12*g.sx,height:12*(def.gateScaleY??1)*g.sy});
  const clear=(a,b)=>!bodies.some(c=>{
    const e=.05;
    return near(a[0],b[0])?a[0]>c.x+e&&a[0]<c.x+c.width-e&&Math.max(a[1],b[1])>c.y+e&&Math.min(a[1],b[1])<c.y+c.height-e:
      a[1]>c.y+e&&a[1]<c.y+c.height-e&&Math.max(a[0],b[0])>c.x+e&&Math.min(a[0],b[0])<c.x+c.width-e;
  });
  for(let folds=1;folds<=40;folds++)for(let i=1;i<w.points.length;i++)for(const sign of [-1,1]) {
    const a=w.points[i-1],b=w.points[i],axis=near(a[0],b[0])?1:0,other=1-axis,span=b[axis]-a[axis];
    if(Math.abs(span)<(folds*2+1)*.45)continue;
    const depth=sign*extra/(2*folds),step=span/(folds*2+1),pts=[];
    for(let j=0;j<folds;j++)for(const [offset,raised] of [[j*2+1,0],[j*2+1,1],[j*2+2,1],[j*2+2,0]]) {
      const p=[...a];p[axis]+=offset*step;p[other]+=depth*raised;pts.push(p);
    }
    const route=[a,...pts,b];
    if(route.some(([x,y])=>x<8||x>def.width-8||y<8||y>def.height-8))continue;
    if(route.slice(1).some((p,j)=>!clear(route[j],p)))continue;
    w.points.splice(i,0,...pts);length(w);return;
  }
  throw Error(`No space to tune ${def.cpuModule} ${def.view} ${w.id} +${extra}`);
}

export default {balanceClockPhases};
