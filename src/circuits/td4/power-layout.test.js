import {test} from 'node:test';
import assert from 'node:assert/strict';
import api from './details.js';
import layoutAPI from './layout.js';
import powerAPI from './power-layout.js';
const {definition:layout}=layoutAPI,{build,crosses,overlaps,segments}=powerAPI;
await api.loadAll('mos');
const parts=Object.fromEntries(Object.keys(api.specs).map(id=>[id,{definition:api.definition(id,'mos')}]));
const power=build(layout,parts),branches=segments(power.branches);
test('exactly one full-height +V and GND rail, outside the CPU',()=>{
  assert.deepEqual(power.rails.map(r=>r.net),['VDD','GND']);
  assert.ok(power.rails[0].x<0&&power.rails[1].x>layout.width);
  assert.ok(power.top<Math.min(...layout.modules.filter(m=>parts[m.id]).map(m=>m.y)));
  assert.ok(power.bottom>Math.max(...layout.modules.map(m=>m.y+m.height)));
});
test('every MOS supply connects continuously to its own common rail',()=>{
  for(const m of layout.modules)for(const cell of parts[m.id]?.definition.cells??[])for(const s of cell.supplies){
    const endpoint=s.net==='VDD'?s.full[0]:s.full.at(-1),point=[m.x+endpoint[0],m.y+endpoint[1]];
    const paths=branches.filter(b=>b.net===s.net),rail=power.rails.find(r=>r.net===s.net);
    const on=(p,s)=>Math.abs(Math.hypot(p[0]-s.a[0],p[1]-s.a[1])+Math.hypot(p[0]-s.b[0],p[1]-s.b[1])-Math.hypot(s.a[0]-s.b[0],s.a[1]-s.b[1]))<1e-6;
    const todo=[point],seen=new Set();let connected=false;
    while(todo.length){const p=todo.pop();if(Math.abs(p[0]-rail.x)<1e-6){connected=true;break;}
      for(let i=0;i<paths.length;i++)if(!seen.has(i)&&on(p,paths[i])){seen.add(i);todo.push(paths[i].a,paths[i].b);}
    }
    assert.ok(connected,`${m.id} ${cell.id} ${s.net}`);
  }
});
test('supply extensions avoid MOS bodies and never share a segment with the opposite supply',()=>{
  const bodies=layout.modules.flatMap(m=>(parts[m.id]?.definition.cells??[]).map(c=>({x:m.x+c.x-c.width/2,y:m.y+c.y,width:c.width,height:c.height})));
  const internal=segments(layout.modules.flatMap(m=>(parts[m.id]?.definition.cells??[]).flatMap(c=>c.supplies.map(s=>({net:s.net,points:s.full.map(([x,y])=>[x+m.x,y+m.y])})))));
  for(const s of branches){
    assert.ok(s.a.every(Number.isFinite)&&s.b.every(Number.isFinite));
    assert.ok(Math.abs(s.a[0]-s.b[0])<1e-6||Math.abs(s.a[1]-s.b[1])<1e-6);
    assert.ok(!bodies.some(c=>crosses(s.a,s.b,c)),`body crossing at ${s.a}`);
    assert.ok(!branches.concat(internal).some(b=>b.net!==s.net&&overlaps(s.a,s.b,b)),`opposite supply overlap at ${s.a}`);
  }
});


test('power routes stay out of INPUT/ROM and the space above them',()=>{
  const excluded=layout.modules.filter(m=>['IN','ROM'].includes(m.id)).map(m=>({...m,y:-layout.height,height:layout.height+m.y+m.height}));
  for(const s of branches)assert.ok(!excluded.some(m=>crosses(s.a,s.b,m)),`power above external module: ${s.a} to ${s.b}`);
});
