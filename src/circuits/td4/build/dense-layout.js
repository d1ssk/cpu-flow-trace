import detailLayoutAPI from './detail-layout.js';
import geometryAPI from './geometry.js';
/* Native v2 combinational layouts: component dimensions are chosen from the
 * available rows/columns, rather than scaling a v1 page and its empty space. */
const {route}=detailLayoutAPI;
const {lengthOf}=geometryAPI;
const rows={
  DEC:[['NOT_OP3','NOT_OP2','NOT_OP1','NOT_OP0','NOT_BRANCH','BRANCH','OP0_OR_NOT_C','NOT_JUMP','JUMP'],['ENA.N','ENA','ENB.N','ENB','ENOUT.N','ENOUT','SEL0','SEL1']],
  NEXT:[['INC0','INC1.N1','INC1.N2','INC1.N3','INC2.N1','INC2.N2','INC2.N3'],['NOT_JUMP','INC1.XOR','CARRY2','INC2.XOR','CARRY3','INC3.N1','INC3.N2'],['BIT0.SELECT.A','BIT0.SELECT.B','BIT1.SELECT.A','BIT1.SELECT.B','INC3.N3','INC3.XOR','BIT3.SELECT.A'],['BIT0.SELECT.Y','BIT1.SELECT.Y','BIT2.SELECT.A','BIT2.SELECT.B','BIT2.SELECT.Y','BIT3.SELECT.B','BIT3.SELECT.Y']],
};
function placement(id,key,view){
  if(id==='MUX'){
    if(key.startsWith('NOT_SEL'))return {x:458,y:key.endsWith('0')?12:76,width:view==='mos'?32:19,height:view==='mos'?34:20};
    const [,bit,stage,part]=key.match(/^BIT(\d)\.(AB|IN_ZERO|SELECT)\.(A|B|Y)$/);
    return {x:22+Number(bit)*108+['A','B','Y'].indexOf(part)*35,y:view==='mos'?7+['AB','IN_ZERO','SELECT'].indexOf(stage)*42:[7,53,100][['AB','IN_ZERO','SELECT'].indexOf(stage)],width:view==='mos'?30:19,height:view==='mos'?34:20};
  }
  if(id==='ALU'){
    const [,bit,index]=key.match(/^B(\d).N(\d)$/),b=3-Number(bit),i=Number(index)-1;
    if(view==='mos'){
      const [col,row]=[[1,0],[2,0],[0,0],[1,1],[2,1],[2,2],[0,2],[1,2],[0,1]][i];
      return {x:23+b*118+col*39,y:7+row*44,width:34,height:38};
    }
    const [dx,row]=[[0,0],[-23,1],[23,1],[0,2],[0,3],[-23,4],[23,4],[0,5],[-49,4]][i];
    return {x:68+b*118+dx,y:5+row*22,width:17,height:18};
  }
  const row=rows[id].findIndex(r=>r.includes(key)),col=rows[id][row].indexOf(key);
  return id==='DEC'?{x:20+col*36,y:view==='mos'?7+row*44:7+row*55,width:view==='mos'?30:19,height:view==='mos'?35:20}:
    {x:24+col*47,y:6+row*(view==='mos'?37:41),width:view==='mos'?36:19,height:view==='mos'?29:20};
}
function layout(def,{finalPass=false}={}){
  const id=def.cpuModule,view=def.view;
  if(!['ALU','MUX','DEC','NEXT'].includes(id))return def;
  const incoming=Object.fromEntries(def.wires.filter(w=>!w.probe).map(w=>[w.to,w.from]));
  const oldNodes=Object.fromEntries(def.nodes.map(n=>[n.id,n]));
  const driver=key=>{
    const n=oldNodes[key];
    return ['INPUT','CONSTANT','SOURCE'].includes(n.kind)||(view==='mos'&&n.gate&&key.endsWith('.y'))?key:driver(incoming[key]);
  };
  const outputs=def.groups.filter(g=>g.kind==='OUTPUT').flatMap(g=>g.ids);
  const links=[];
  const wire=(from,to)=>links.push({from,to});
  const blocks=def.modules??def.stages?.filter(m=>m.id)??[];
  if(view==='module')for(const m of blocks)for(const n of def.nodes.filter(n=>(n.gate===m.id||n.stage===m.id)&&n.kind==='PORT'))wire(driver(incoming[n.id]),n.id);
  else for(const c of view==='nand'?def.gates:def.cells)for(const p of ['a','b'])wire(driver(incoming[c.id+'.'+p]),c.id+'.'+p);
  for(const key of outputs)wire(driver(incoming[key]),key);
  def.nodes=def.nodes.filter(n=>['INPUT','OUTPUT','CONSTANT'].includes(n.kind)||(view==='module'?(n.gate||n.stage):n.gate||n.cell));
  const nodes=Object.fromEntries(def.nodes.map(n=>[n.id,n]));
  // Prefer long straight runs. Clearance is a soft preference: a short
  // pinch near a pin is better than repeatedly weaving between tracks.
  def.routing={turnCost:id==='ALU'&&view==='nand'?1.5:24};
  if(['MUX','DEC','NEXT'].includes(id)&&view!=='mos')Object.assign(def.routing,{wireSpacing:4,bodyClearance:2,turnCost:64,proximityCost:1});
  if(finalPass)Object.assign(def.routing,{wireSpacing:view==='mos'||id==='ALU'?3:4,bodyClearance:2,turnCost:64,proximityCost:1});
  def.obstacles=[];def.scale={x:1,y:1};def.supplyRoutes=[];
  const escape=n=>{
    const x=Math.max(2,Math.min(def.width-2,Math.round(n.x))),y=Math.max(2,Math.min(Math.floor(def.height)-2,Math.round(n.y)));
    n.escape=n.side==='left'?[2,y]:n.side==='right'?[def.width-2,y]:n.side==='top'?[x,2]:n.side==='bottom'?[x,Math.floor(def.height)-2]:[x,y];
  };
  for(const n of def.nodes.filter(n=>['INPUT','OUTPUT','CONSTANT'].includes(n.kind))){
    if(n.kind==='CONSTANT')Object.assign(n,{x:def.width-4,y:def.height-4});escape(n);
  }
  for(const g of def.groups.filter(g=>g.kind==='CONSTANT')){g.x=nodes[g.ids[0]].x;g.y=nodes[g.ids[0]].y;}
  let internal=[];
  if(view==='nand'){
    for(const g of def.gates){
      const p=placement(id,g.id,view);Object.assign(g,p,{sx:1,sy:1});g.shape={width:p.width,height:p.height,bubble:1.2};
      for(const [key,dx,dy,side] of [['a',-Math.floor(p.width/4),0,'top'],['b',Math.floor(p.width/4),0,'top'],['y',0,p.height,'bottom']]){
        const n=nodes[g.id+'.'+key];Object.assign(n,{x:p.x+dx,y:p.y+dy,side,escape:[Math.round(p.x+dx),Math.round(p.y+dy+(key==='y'?2:-2))]});
      }
      def.obstacles.push({id:g.id,x:p.x-p.width/2,y:p.y,width:p.width,height:p.height});
    }
  }else if(view==='mos'){
    for(const c of def.cells){
      const p=placement(id,c.id,view);
      if(finalPass){p.width-=4;p.y+=2;p.height-=4;}
      const sx=p.width/c.width,sy=p.height/c.height,oldX=c.x,oldY=c.y;
      const pt=([x,y])=>[p.x+(x-oldX)*sx,p.y+(y-oldY)*sy];
      for(const n of def.nodes.filter(n=>n.gate===c.id||n.cell===c.id))[n.x,n.y]=pt([n.x,n.y]);
      for(const w of def.wires.filter(w=>w.internal===c.id)) {w.points=w.points.map(pt);w.length=lengthOf(w.points);internal.push(w);}
      for(const m of c.devices){[m.mx,m.my]=pt([m.mx,m.my]);m.gateX=p.x+(m.gateX-oldX)*sx;m.bubbleX=p.x+(m.bubbleX-oldX)*sx;}
      c.channelHalf*=sy;c.leadHalf*=sy;c.controlDots=c.controlDots.map(([name,x,y])=>[name,...pt([x,y])]);c.outputDot=pt(c.outputDot);
      for(const s of c.supplies){s.short=s.short.map(pt);s.full=s.full.map(pt);const end=s.net==='VDD'?0:s.full.length-1;s.full[end][0]=s.net==='VDD'?2:def.width-2;
        if(s.net==='VDD'){s.full[0][1]=s.full[1][1]=p.y-2;}else{s.full.at(-1)[1]=s.full.at(-2)[1]=p.y+p.height+1;}}
      Object.assign(c,p);
      for(const [key,side] of [['a','top'],['b','bottom'],['y','left']]){
        const n=nodes[c.id+'.'+key];n.side=side;n.escape=key==='y'?[Math.floor(p.x-p.width/2)-2,Math.round(n.y)]:[Math.round(n.x),key==='a'?Math.floor(p.y)-2:Math.ceil(p.y+p.height)+2];
      }
      def.obstacles.push({id:c.id,x:p.x-p.width/2,y:p.y,width:p.width,height:p.height});
      def.supplyRoutes.push(...c.supplies.map(s=>s.full.map(p=>p.map(Math.round))));
    }
  }else{
    for(const [index,m] of blocks.entries()){
      let p;
      if(id==='DEC')p={x:38,y:23,width:254,height:48};
      else if(id==='MUX')p={x:14+index*118,y:24,width:96,height:82};
      else if(id==='ALU')p={x:9+(3-m.bit)*118,y:9,width:104,height:def.height-18};
      else {const bit=Number(m.id.at(-1));p={x:13+bit*81,y:m.kind==='HA'?18:101,width:61,height:m.kind==='HA'?45:33};}
      const sx=p.width/m.width,sy=p.height/m.height;
      for(const n of def.nodes.filter(n=>n.gate===m.id||n.stage===m.id)){
        let x=p.x+(n.x-m.x)*sx,y=p.y+(n.y-m.y)*sy;
        if(id==='DEC'&&['DEC.cf','DEC.sel0','DEC.sel1'].includes(n.id)){
          x=p.x;y=p.y+{'DEC.cf':10,'DEC.sel0':28,'DEC.sel1':40}[n.id];
        }
        const side=Math.abs(x-p.x)<.01?'left':Math.abs(x-p.x-p.width)<.01?'right':Math.abs(y-p.y)<.01?'top':'bottom';
        Object.assign(n,{x,y,side,escape:[Math.round(x+(side==='left'?-2:side==='right'?2:0)),Math.round(y+(side==='top'?-2:side==='bottom'?2:0))]});
      }
      Object.assign(m,p);def.obstacles.push({...m});
    }
  }
  route(def,links);def.wires.push(...internal);
  return def;
}
const api={layout,placement};export default api;
