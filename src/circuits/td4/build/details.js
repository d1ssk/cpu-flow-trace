import metadata from '../specs.json' with {type:'json'};
import layout from '../layout.js';
import dense from './dense-layout.js';
import fit from './fit-layout.js';
import clock from './clock-balance.js';
const {balanceClockPhases}=clock;
import alu from './alu.js';
import aluModule from './alu-module.js';
import aluMos from './alu-mos.js';
import dff from './dff-c.js';
import dffModule from './dff-c-module.js';
import dffMos from './dff-c-mos.js';
import ab from './dff-ab.js';
import left from './dff-pc-out.js';
import register from './dff-register-variants.js';
import modules from './detail-modules.js';
import mos from './detail-mos.js';
import geometry from './geometry.js';
import mux from './mux.js';
import decoder from './decoder.js';
import nextPC from './next-pc.js';
const {lengthOf}=geometry;
const sources={mux,decoder,'next-pc':nextPC};
// Port mappings and labels are shared with the runtime. Only the build
// process attaches source geometry; these templates never enter the browser.
const bases={
  ALU:{nand:alu.definition,module:aluModule.definition,mos:aluMos.definition},
  CF:{nand:dff.definition,module:dffModule.definition,mos:dffMos.definition},
};
for(const [id,kind] of [['A','ab'],['B','ab'],['PC','pc'],['R','out']]) {
  bases[id]={nand:kind==='ab'?ab.definition:left.definitions[kind],...register.definitions[kind]};
}
for(const [id,file] of [['MUX','mux'],['DEC','decoder'],['NEXT','next-pc']]) {
  bases[id]={nand:sources[file],module:modules.definitions[file],mos:mos.definitions[file]};
}
const specs=Object.fromEntries(Object.entries(metadata).map(([id,spec])=>[id,{...spec,bases:bases[id]}]));
const clone=value=>JSON.parse(JSON.stringify(value));
const length=w=>w.length=lengthOf(w.points);
const near=(a,b)=>Math.abs(a-b)<1e-7;
function adapt(base,id,view) {
  const def=clone(base),m=layout.definition.modules.find(m=>m.id===id),isDff=!!base.clockTuningArea,margin=isDff?4:8;
  const sx=(m.width-2*margin)/base.width,sy=(m.height-2*margin)/base.height;
  const mirrored=['PC','R'].includes(id),available=m.width-2*margin;
  // Reclaim the old full-height clock bay for the latch bodies. Keep the EN
  // inverter at its normal width inside a 36-unit edge strip; C needs no
  // inter-bit compensation and only retains a 10-unit entry corridor.
  const canonical=x=>{
    if(id==='CF')return x<=110?x*(available-10)/110:available-10+(x-110)*10/48;
    if(x<=440)return x*(available-36)/440;
    if(x<=458)return available-36+(x-440)/3;
    if(x<=482)return available-30+(x-458);
    return available-6+(x-482)*6/26;
  };
  const px=x=>!isDff?margin+x*sx:mirrored?m.width-margin-canonical(base.width-x):margin+canonical(x);
  const localSx=x=>(px(x+.001)-px(x-.001))/.002;
  // PC has no input selector, but its shorter outer frame must not shrink
  // the shared latch/NAND symbols. Spend the empty vertical bands instead.
  let py=y=>margin+y*sy;
  if(id==='PC'&&view!=='mos') {
    const reference=layout.definition.modules.find(m=>m.id==='R');
    const bodyScale=(reference.height-2*margin)/base.height;
    const intervals=(view==='module'?base.modules.map(m=>[m.y,m.y+m.height]):base.gates.map(g=>[g.y,g.y+12*(base.gateScaleY??1)])).sort((a,b)=>a[0]-b[0]);
    const merged=[];
    for(const [a,b] of intervals){const last=merged.at(-1);if(last&&a<=last[1])last[1]=Math.max(last[1],b);else merged.push([a,b]);}
    const occupied=merged.reduce((sum,[a,b])=>sum+b-a,0);
    const gapScale=(m.height-2*margin-occupied*bodyScale)/(base.height-occupied);
    if(gapScale<=0)throw Error('PC symbols do not fit in the frame');
    py=y=>margin+y*gapScale+merged.reduce((sum,[a,b])=>sum+Math.max(0,Math.min(y,b)-a)*(bodyScale-gapScale),0);
  }
  const point=([x,y])=>[px(x),py(y)];
  const pos=o=>{[o.x,o.y]=point([o.x,o.y]);};
  const box=o=>{const width=px(o.x+o.width)-px(o.x),height=id==='PC'&&view!=='mos'?py(o.y+o.height)-py(o.y):o.height*sy;pos(o);o.width=width;o.height=height;};
  def.id=`v2-${id}-${view}`;def.title=specs[id].title;def.width=m.width;def.height=m.height;def.view=view;def.cpuModule=id;
  def.step=10;def.scale={x:sx,y:sy};def.originalSize={width:base.width,height:base.height};
  for(const n of def.nodes){pos(n);if(n.escape)n.escape=point(n.escape);}
  for(const w of def.wires){w.points=w.points.map(point);length(w);}
  for(const g of def.gates??[]){g.sx=localSx(g.x);const h=12*(base.gateScaleY??1);g.sy=id==='PC'&&view!=='mos'?(py(g.y+h)-py(g.y))/h:sy;pos(g);}
  for(const b of def.modules??[])box(b);
  for(const b of def.stages??[])if(b.id){box(b);b.label=`Full adder · bit ${b.bit}`;}else b.center=margin+b.center*sx;
  for(const b of def.bits??[]){const w=px(b.x+b.width)-px(b.x);b.x=px(b.x);b.width=w;}
  if(def.clockTuningArea)box(def.clockTuningArea);
  for(const c of def.cells??[]) {
    const defaultChannel=id==='ALU'?5:id==='CF'?3:5,defaultLead=id==='ALU'?7:id==='CF'?4:6;
    c.controlDots??=[['PA',c.x,c.y+(id==='ALU'?8:5)],['PB',c.x,c.y+(id==='ALU'?26:15)]];
    c.outputDot??=[c.x-(id==='ALU'?17:13),c.y+(id==='ALU'?17:10)];
    c.controlDots=c.controlDots.map(([name,x,y])=>[name,...point([x,y])]);c.outputDot=point(c.outputDot);
    const cw=c.width??38,w=px(c.x+cw/2)-px(c.x-cw/2);pos(c);c.width=w;c.height=(c.height??36)*sy;
    c.channelHalf=(c.channelHalf??defaultChannel)*sy;c.leadHalf=(c.leadHalf??defaultLead)*sy;
    for(const device of c.devices){[device.mx,device.my]=point([device.mx,device.my]);device.gateX=px(device.gateX);device.bubbleX=px(device.bubbleX);}
    for(const s of c.supplies){s.short=s.short.map(point);s.full=s.full.map(point);}
  }
  // Reserve a perimeter for the changed v2 interfaces. The old boundary
  // nodes become passive junctions, never disconnected display-only pins.
  def.groups=clone(base.groups??base.portGroups.map(g=>({id:g.label,label:g.label,ids:g.ids,width:g.ids.length,kind:base.inputs.includes(g.ids[0])?'INPUT':'OUTPUT'})));
  const nodes=Object.fromEntries(def.nodes.map(n=>[n.id,n]));
  let laneIndex=0;
  for(const g of def.groups) {
    if(g.kind==='CONSTANT'){const n=nodes[g.ids[0]];g.x=n.x;g.y=n.y;continue;}
    const port=layout.definition.ports[id+'.'+specs[id].ports[g.id]];
    // Cin is an experiment-only pin (the CPU ties it to zero).
    const side=port?(port.x===m.x?'left':port.x===m.x+m.width?'right':port.y===m.y?'top':'bottom'):'left';
    for(const [bit,key] of g.ids.entries()) {
      const old=nodes[key],oldId='edge:'+key,oldPoint=[old.x,old.y];
      const oldSide=near(old.x,margin)?'left':near(old.x,m.width-margin)?'right':near(old.y,margin)?'top':near(old.y,m.height-margin)?'bottom':(old.y<m.height/2?'top':'bottom');
      const [x,y]=port?layout.point(port,bit).map((v,i)=>v-(i?m.y:m.x)):[0,m.height*.52];
      old.id=oldId;old.kind='JUNCTION';old.gate=null;old.side=oldSide;
      for(const w of def.wires){if(w.from===key)w.from=oldId;if(w.to===key)w.to=oldId;}
      const external={id:key,x,y,kind:g.kind,initial:0,side};def.nodes.push(external);nodes[key]=external;nodes[oldId]=old;
      const inset=1.1+(laneIndex++%24)*.23;
      const bounds={left:inset,right:m.width-inset,top:inset,bottom:m.height-inset};
      const project=(p,s)=>s==='left'||s==='right'?[bounds[s],p[1]]:[p[0],bounds[s]];
      const a=project([x,y],side),b=project(oldPoint,oldSide),sides=['top','right','bottom','left'];
      const perimeter=(start,end,forward)=>{
        const p=[start];let s=sides.indexOf(side),target=sides.indexOf(oldSide);
        while(s!==target){const next=(s+(forward?1:3))%4,corner={top:[bounds.left,bounds.top],right:[bounds.right,bounds.top],bottom:[bounds.right,bounds.bottom],left:[bounds.left,bounds.bottom]};p.push(corner[sides[forward?next:s]]);s=next;}
        p.push(end);return p;
      };
      const clockwise=perimeter(a,b,true),counter=perimeter(a,b,false);
      let points=[[x,y],...(lengthOf(clockwise)<=lengthOf(counter)?clockwise:counter),oldPoint];
      if(g.kind==='OUTPUT')points=points.reverse();
      def.wires.push({id:`terminal:${key}`,from:g.kind==='INPUT'?key:oldId,to:g.kind==='INPUT'?oldId:key,points,length:lengthOf(points),terminal:true});
    }
    const first=nodes[g.ids[0]];Object.assign(g,{x:first.x,y:first.y,side});
  }
  if(id==='CF'){
    const w=def.wires.find(w=>w.id==='CLK>clock'),a=nodes[w.from],b=nodes[w.to];
    w.points=[[a.x,a.y],[m.width-6,a.y],[m.width-6,b.y],[b.x,b.y]];length(w);
    delete def.clockTuningArea;
  }
  tuneClock(def,point);
  // Source identifiers in the wire ids remain stable for inspection/tests.
  const descriptions={
    ALU:'Xとimを加算し、Sと桁上がりCを出力します。Cinはこの詳細回路の実験用入力で、TD4本体では0です。',
    MUX:'SEL=0・1・2・3で、それぞれA・B・IN・0を選びます。各bitは独立した配線で伝播します。',
    DEC:'OPと保持されたCから、SEL、レジスタの書き込み許可、JUMPを生成します。',
    NEXT:'半加算器の桁上がりでPC＋1を作ります。JUMP=1ならRESULTを選択し、15＋1は0に戻ります。',
    CF:'CLK=Lの間にMasterへDを通し、立ち上がりでSlaveへ渡してQに保持します。D・CLKは下、Qは右の端子です。',
    PC:'4組のMaster／Slaveで次のPCを保持します。左端の折り返し配線で各bitのクロック到着を揃えます。',
    A:'EN=1でD、EN=0でQの帰還を選んで保持します。右端の折り返し配線で各bitのクロック到着を揃えます。',
    B:'EN=1でD、EN=0でQの帰還を選んで保持します。右端の折り返し配線で各bitのクロック到着を揃えます。',
    R:'EN=1でD、EN=0でQの帰還を選んで保持します。左端の折り返し配線で各bitのクロック到着を揃えます。',
  };
  def.description=descriptions[id];
  return dense.layout(def);
}
function tuneClock(def,point) {
  const branches=def.wires.filter(w=>w.clockBranch!==undefined);
  if(branches.length) {
    const mirrored=['PC','R'].includes(def.cpuModule),px=x=>point([mirrored?508-x:x,0])[0];
    const nodes=Object.fromEntries(def.nodes.map(n=>[n.id,n]));
    for(const w of branches) {
      const bit=w.clockBranch,lane=point([0,[41,43,46,50][bit]])[1],a=nodes[w.from],b=nodes[w.to];
      w.points=[[a.x,a.y],[a.x,lane],[px(440),lane],[px(bit*110+108),lane],[px(bit*110+108),b.y],[b.x,b.y]];length(w);
    }
    const common=Math.max(...branches.map(w=>w.length));
    const foldPoints=[];
    for(const w of branches) {
      const depth=(common-w.length)/8,lane=w.points[1][1],folds=[];
      if(depth>1e-8)for(let i=0;i<4;i++){
        const bay=def.clockTuningArea,x=10+(w.clockBranch-1)*11-i*2.4;
        const fx=v=>mirrored?bay.x+bay.width-v:bay.x+v;
        folds.push([fx(x),lane],[fx(x),lane-depth],[fx(x-1.3),lane-depth],[fx(x-1.3),lane]);
      }
      foldPoints.push(...folds);w.points.splice(2,0,...folds);length(w);
    }
    const bay=def.clockTuningArea,ys=foldPoints.map(p=>p[1]);
    bay.y=Math.min(...ys)-2;bay.height=Math.max(...ys)-bay.y+2;
  }
  balanceClockPhases(def);
}

const cache={};
function definition(id,view='nand') {
 view=view.startsWith('mos')?'mos':view;
 if(!specs[id]?.bases[view])throw Error('Unknown circuit '+id+' / '+view);
 return cache[id+view]??=fit.build(adapt(specs[id].bases[view],id,view));
}
export default {specs,definition};
