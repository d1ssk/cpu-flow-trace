import {test} from 'node:test';
import assert from 'node:assert/strict';
import api from './details.js';
import computed from './build/details.js';
import routing from './build/detail-layout.js';
import layoutAPI from './layout.js';
import geometry from '../../simulator/td4/geometry.js';
import transport from '../../simulator/td4/transport.js';
const {specs,restore,settle,create,definition}=api;
const {definition:layout,point}=layoutAPI;
const {lengthOf}=geometry,{PROPAGATION_SPEED}=transport;
for(const view of ['module','nand','mos'])await api.loadAll(view);
const views=['module','nand','mos'];
const set=(sim,id,value)=>{sim.setWord(id,value);settle(sim);};
const near=(a,b)=>Math.abs(a-b)<1e-7;
for(const id of ['A','B','PC','R'])for(const view of views){
  test(`${id} ${view}: bits run from 3 to 0 left to right and capture the matching physical cell`,()=>{
    const s=create(id,view),bits=[...s.definition.bits].sort((a,b)=>a.x-b.x);
    assert.deepEqual(bits.map(b=>b.bit),[3,2,1,0]);
    if(id!=='PC')set(s,'EN',1);
    for(let bit=0;bit<4;bit++){
      set(s,'CLK',0);set(s,'D',1<<bit);set(s,'CLK',1);
      assert.equal(s.word('Q'),1<<bit);
      for(const cell of bits){
        const q=s.nodes[`edge:${cell.prefix}Q`];
        assert.ok(q.x>=cell.x&&q.x<=cell.x+cell.width,'held output belongs to the labeled cell');
        assert.equal(q.output,+(cell.bit===bit),'one-hot input reaches the matching physical bit');
      }
    }
  });
}
for(const id of Object.keys(specs))for(const view of views) {
  test(`${id} ${view}: CPU footprint, exact terminals, real orthogonal wire lengths and connected topology`,()=>{
    const sim=create(id,view),def=sim.definition,m=layout.modules.find(m=>m.id===id),targets=new Set();
    assert.deepEqual(computed.definition(id,view),JSON.parse(JSON.stringify(def)),'saved circuit exactly matches freshly computed geometry and topology');
    assert.deepEqual([def.width,def.height],[m.width,m.height]);
    for(const group of def.groups) {
      const p=layout.ports[id+'.'+specs[id].ports[group.id]];if(!p)continue;
      group.ids.forEach((key,bit)=>assert.deepEqual([sim.nodes[key].x,sim.nodes[key].y],point(p,bit).map((v,i)=>v-(i?m.y:m.x))));
    }
    for(const w of def.wires) {
      assert.ok(w.length>0,w.id);assert.equal(w.length,lengthOf(w.points));assert.equal(sim.wires[w.id].delay,w.length/PROPAGATION_SPEED*1000);
      if(!w.probe){assert.ok(!targets.has(w.to),w.to);targets.add(w.to);assert.deepEqual(w.points[0],[sim.nodes[w.from].x,sim.nodes[w.from].y]);assert.deepEqual(w.points.at(-1),[sim.nodes[w.to].x,sim.nodes[w.to].y]);}
      for(const [x,y] of w.points)assert.ok(x>=-1e-8&&y>=-1e-8&&x<=def.width+1e-8&&y<=def.height+1e-8,`${w.id} in frame: ${x},${y}`);
      for(let i=1;i<w.points.length;i++)assert.ok(near(w.points[i][0],w.points[i-1][0])||near(w.points[i][1],w.points[i-1][1]),w.id);
    }
    const bodies=view==='nand'&&!def.gates.some(g=>g.shape)?def.gates.map(g=>({id:g.id,x:g.x-6*g.sx,y:g.y,width:12*g.sx,height:12*g.sy*(def.gateScaleY??1)})):view==='nand'&&def.gates.some(g=>g.shape)?def.obstacles:view==='mos'?def.cells.map(c=>({id:c.id,x:c.x-c.width/2,y:c.y,width:c.width,height:c.height})):(def.modules??def.stages?.filter(s=>s.id)??[]);
    for(const w of def.wires.filter(w=>!w.internal))for(let i=1;i<w.points.length;i++)for(const c of bodies) {
      const [ax,ay]=w.points[i-1],[bx,by]=w.points[i],e=1e-6;
      const cross=near(ax,bx)?ax>c.x+e&&ax<c.x+c.width-e&&Math.max(ay,by)>c.y+e&&Math.min(ay,by)<c.y+c.height-e:
        ay>c.y+e&&ay<c.y+c.height-e&&Math.max(ax,bx)>c.x+e&&Math.min(ax,bx)<c.x+c.width-e;
      assert.equal(cross,false,`${w.id} crosses ${c.id}`);
    }
    if(def.cells)for(const c of def.cells)for(const input of ['a','b']) {
      const pair=def.wires.filter(w=>w.control&&w.from===c.id+'.'+input);assert.equal(pair.length,2);assert.ok(near(pair[0].length,pair[1].length));
    }
    const branches=def.wires.filter(w=>w.clockBranch!==undefined);
    if(branches.length){assert.equal(branches.length,4);assert.ok(branches.every(w=>near(w.length,branches[0].length)));const bay=def.clockTuningArea;for(const w of branches)for(const [x,y] of w.points.slice(2,-4))assert.ok(x>=bay.x&&x<=bay.x+bay.width&&y>=bay.y&&y<=bay.y+bay.height,'folds stay at the edge');}
  });
}
for(const view of views) {
  test(`ALU ${view}: all 512 additions through connected wires`,()=>{
    const s=create('ALU',view);
    for(let a=0;a<16;a++)for(let b=0;b<16;b++)for(let cin=0;cin<2;cin++) {
      set(s,'X',a);set(s,'im',b);set(s,'Cin',cin);const sum=a+b+cin;
      assert.equal(s.word('S'),sum&15);assert.equal(s.word('C'),sum>>4);
    }
  });
  test(`DEC ${view}: every opcode and carry`,()=>{
    const s=create('DEC',view);
    for(let op=0;op<16;op++)for(let c=0;c<2;c++){
      set(s,'OP',op);set(s,'C',c);const dest=op>>2;
      assert.equal(s.word('SEL'),dest===3?3:op&3);
      for(const [i,key] of ['ENA','ENB','ENOUT'].entries())assert.equal(s.word(key),+(dest===i));
      assert.equal(s.word('JUMP'),+(dest===3&&((op&1)||!c)));
    }
  });
  test(`MUX ${view}: all data words, selections and independent bit positions`,()=>{
    const s=create('MUX',view);
    for(let a=0;a<16;a++)for(let b=0;b<16;b++)for(let input=0;input<16;input++){
      s.setWord('A',a);s.setWord('B',b);s.setWord('IN',input);settle(s);
      for(let sel=0;sel<4;sel++){set(s,'SEL',sel);assert.equal(s.word('Y'),[a,b,input,0][sel]);}
    }
  });
  test(`NEXT ${view}: increment, overflow and jump for all values`,()=>{
    const s=create('NEXT',view);
    for(let pc=0;pc<16;pc++)for(let result=0;result<16;result++)for(let jump=0;jump<2;jump++){
      set(s,'PC',pc);set(s,'RESULT',result);set(s,'JUMP',jump);assert.equal(s.word('Y'),jump?result:(pc+1)&15);
    }
  });
}
for(const id of ['CF','A','B','PC','R'])for(const view of views) {
  test(`${id} ${view}: every held/data word, enable, capture and falling/high hold`,()=>{
    const s=create(id,view),enabled=['A','B','R'].includes(id),limit=id==='CF'?2:16;
    for(let held=0;held<limit;held++)for(let data=0;data<limit;data++)for(const en of enabled?[0,1]:[1]){
      s.reset();if(enabled)set(s,'EN',1);set(s,'D',held);set(s,'CLK',1);set(s,'CLK',0);
      if(enabled)set(s,'EN',en);set(s,'D',data);assert.equal(s.word('Q'),held);
      s.setWord('CLK',1);assert.equal(s.word('Q'),held);settle(s);const expected=en?data:held;assert.equal(s.word('Q'),expected);
      set(s,'D',limit-1-data);if(enabled)set(s,'EN',1-en);assert.equal(s.word('Q'),expected);
      s.setWord('CLK',0);while(s.busy){s.next();assert.equal(s.word('Q'),expected,'falling edge does not overwrite Q');}
    }
  });
  test(`${id} ${view}: all bit clock phases coincide on both edges; switching retains held state`,()=>{
    const s=create(id,view),enabled=['A','B','R'].includes(id),limit=id==='CF'?2:16;
    if(enabled)set(s,'EN',1);set(s,'D',limit-1);
    for(const edge of [1,0]) {
      const names=view==='module'?['M.en','S.en']:view==='nand'?['MS.b','MR.b','SS.b','SR.b']:['MS:PB','MS:NB','MR:PB','SS:PB','SS:NB','SR:PB'];
      const ids=(id==='CF'?['']:[0,1,2,3].map(i=>`B${i}.`)).flatMap(p=>names.map(n=>p+n)),prev=ids.map(n=>s.nodes[n].output),times={};
      s.setWord('CLK',edge);while(s.busy){s.next();ids.forEach((n,i)=>{if(s.nodes[n].output!==prev[i])times[n]??=s.time;});}
      assert.equal(Object.keys(times).length,ids.length);assert.ok(near(Math.max(...Object.values(times)),Math.min(...Object.values(times))));
    }
    for(let q=0;q<limit;q++)for(const clk of [0,1]) {
      s.reset();restore(s,{D:limit-1-q,CLK:clk,Q:q,EN:0});assert.equal(s.word('Q'),q);assert.equal(s.word('D'),limit-1-q);assert.equal(s.time,0);assert.equal(s.busy,false);
    }
  });
}
test('same physical MOS circuit for both supply displays; source geometry remains unchanged',()=>{
  for(const id of Object.keys(specs)){assert.equal(definition(id,'mos-short'),definition(id,'mos-power'));assert.notEqual(definition(id,'nand'),computed.specs[id].bases.nand);}
  assert.equal(computed.specs.A.bases.nand.height,78);assert.equal(computed.specs.ALU.bases.nand.width,570);
});

test('native combinational packing enlarges devices and uses the upper/lower edges',()=>{
  const dimensions={ALU:{nand:[17,18],mos:[34,38]},MUX:{nand:[19,20],mos:[30,34]},DEC:{nand:[19,20],mos:[30,35]},NEXT:{nand:[19,20],mos:[36,29]}};
  for(const [id,views] of Object.entries(dimensions))for(const [view,[minWidth,minHeight]] of Object.entries(views)){
    const def=definition(id,view),parts=view==='nand'?def.gates.map(g=>({...g,...g.shape})):def.cells;
    assert.ok(parts.every(p=>p.width>=minWidth-(view==='mos'?4:0)&&p.height>=minHeight-(view==='mos'?4:0)),`${id} ${view} device size`);
    assert.ok(Math.min(...parts.map(p=>p.y))<=9,`${id} ${view} top margin`);
    assert.ok(def.height-Math.max(...parts.map(p=>p.y+p.height))<=14,`${id} ${view} bottom margin`);
    if(view==='nand'&&id!=='ALU')for(const p of parts){assert.ok(p.width<=17*1.15);assert.ok(p.height<=18*1.15);}
    const bounds=parts.map(p=>({x:p.x-p.width/2,y:p.y,width:p.width,height:p.height}));
    for(let i=0;i<bounds.length;i++)for(let j=i+1;j<bounds.length;j++){
      const a=bounds[i],b=bounds[j];assert.ok(a.x+a.width<=b.x||b.x+b.width<=a.x||a.y+a.height<=b.y||b.y+b.height<=a.y,'devices do not overlap');
    }
    if(view==='mos')for(const c of def.cells)for(const s of c.supplies)for(const [x,y] of s.full)assert.ok(x>=0&&x<=def.width&&y>=0&&y<=def.height);
  }
});
test('clock compensation uses compact edge bays; C has no unnecessary matching meander',()=>{
  for(const id of ['A','B','PC','R'])for(const view of views){
    const d=definition(id,view),bay=d.clockTuningArea;
    assert.equal(bay.width,36);assert.ok(bay.height<=76);assert.ok(bay.width*bay.height<2800);
    {
      assert.ok(bay.y<20,'clock folds use the upper edge space');
      for(const w of d.wires.filter(w=>w.clockBranch>0)){
        const folds=w.points.slice(2,-4);assert.equal(folds.length,w.clockBranch*4,'one, two, or three tall folds');
        const columns=folds.filter((_,i)=>i%2===0).map(p=>p[0]).sort((a,b)=>a-b);
        for(let i=1;i<columns.length;i++)assert.ok(columns[i]-columns[i-1]>=2.5-1e-7,'fold legs leave space for 1.3-unit wires');
      }
    }
    assert.ok(d.bits.every(b=>b.width>=106),'released bay width goes to latch bodies');
    {
      const bits=[...d.bits].sort((a,b)=>a.x-b.x);
      for(let i=1;i<bits.length;i++){
        const gap=bits[i].x-bits[i-1].x-bits[i-1].width;
        assert.ok(view==='mos'?gap>=.7&&gap<=1:gap>=9&&gap<=10,'bit spacing leaves a narrow routing corridor');
      }
    }
  }
  for(const view of views){const d=definition('CF',view);assert.equal(d.clockTuningArea,undefined);assert.ok(d.wires.find(w=>w.id==='CLK>clock').points.length<=4);}
});

test('NAND routing separates parallel signals without repeated short detours',()=>{
  const {route}=routing;
  const crowdedLength=d=>{
    const segments=d.wires.flatMap(w=>w.points.slice(1).map((b,i)=>({from:w.from,a:w.points[i],b}))).filter(s=>lengthOf([s.a,s.b])>4);
    let total=0;
    for(let i=0;i<segments.length;i++)for(let j=i+1;j<segments.length;j++){
      const a=segments[i],b=segments[j];if(a.from===b.from)continue;
      const axis=a.a[0]===a.b[0]?1:0;if(axis!==(b.a[0]===b.b[0]?1:0))continue;
      const distance=Math.abs(a.a[1-axis]-b.a[1-axis]);
      const overlap=Math.min(Math.max(a.a[axis],a.b[axis]),Math.max(b.a[axis],b.b[axis]))-Math.max(Math.min(a.a[axis],a.b[axis]),Math.min(b.a[axis],b.b[axis]));
      if(distance<3&&overlap>4)total+=overlap;
    }
    return total;
  };
  for(const id of ['MUX','DEC','NEXT']){
    const current=definition(id,'nand'),baseline=structuredClone(current);delete baseline.routing;
    route(baseline,current.wires.map(({from,to})=>({from,to})));
    assert.ok(crowdedLength(current)<crowdedLength(baseline)*.2,`${id}: long parallel runs are separated`);
    const bends=current.wires.reduce((sum,w)=>sum+w.points.length-2,0);
    const shortRuns=current.wires.reduce((sum,w)=>sum+w.points.slice(2,-1).filter((p,i)=>lengthOf([w.points[i+1],p])<4).length,0);
    assert.ok(bends<=current.wires.length*5,`${id}: at most five bends per wire on average`);
    assert.ok(shortRuns<=current.wires.length*.25,`${id}: short intermediate jogs stay exceptional`);
  }
});


test('PC keeps the same latch and NAND dimensions as the other 4-bit registers',()=>{
  const pc=definition('PC','module'),gates=definition('PC','nand');
  for(const id of ['A','B','R']) {
    const other=definition(id,'module'),otherGates=definition(id,'nand');
    for(const m of pc.modules.filter(m=>m.kind==='LATCH')) {
      const reference=other.modules.find(n=>n.id===m.id);
      assert.ok(near(m.width,reference.width)&&near(m.height,reference.height),`${id} ${m.id} size`);
    }
    for(const g of gates.gates) {
      const reference=otherGates.gates.find(n=>n.id===g.id);
      assert.ok(near(g.sx,reference.sx)&&near(g.sy*(gates.gateScaleY??1),reference.sy*(otherGates.gateScaleY??1)),`${id} ${g.id} size`);
    }
  }
});
