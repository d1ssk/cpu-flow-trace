import {test} from 'node:test';
import assert from 'node:assert/strict';
import cpu from './circuit.js';
import details from './details.js';
import full from './full-circuit.js';
import geometry from '../../simulator/td4/geometry.js';
import transport from '../../simulator/td4/transport.js';
import {programs as samples} from '../../td4/programs/index.ts';
import {encode} from '../../td4/instructions.ts';
const names={'counter':'counter','led-blink':'blink','input-output':'input','ramen-timer':'ramen'};
const programs=Object.fromEntries(samples.map(p=>[names[p.id]??p.id,{name:p.title.en,bytes:p.lines.map(encode)}]));
const {TD4Circuit,definition}=cpu;
const {lengthOf}=geometry;
const {PROPAGATION_SPEED}=transport;
function settle(sim) {let count=0;while(sim.busy){assert.ok(++count<1000,'CPU must settle');sim.next();}}
function cycle(sim) {settle(sim);assert.equal(sim.requestCycle(),true);settle(sim);}
function input(sim,value) {for(let bit=0;bit<4;bit++)sim.setInput(`I${bit}`,(value>>bit)&1);settle(sim);}
test('double and half programs calculate all 16 inputs and hold their result at the final address',()=>{
  for(const [id,result] of [['double-input',n=>n*2%16],['half-input',n=>Math.floor(n/2)]]){
    for(let n=0;n<16;n++){
      const sim=new TD4Circuit(programs[id].bytes);input(sim,n);
      for(let i=0;i<100;i++)cycle(sim);
      assert.equal(sim.snapshot().out,result(n),`${id}: input ${n}`);
      assert.equal(sim.snapshot().pc,7);
      input(sim,(n+1)%16);
      for(let i=0;i<8;i++)cycle(sim);
      assert.equal(sim.snapshot().out,result(n),'input changes do not restart the calculation');
    }
  }
});
// Independent instruction-level oracle used only in tests. Noncanonical
// opcodes retain the original hardware's source/destination behavior.
function reference(state,byte,port) {
  const op=byte>>4,im=byte&15;
  const source=[state.a,state.b,port,0,state.a,state.b,port,0,state.a,state.b,port,0,0,0,0,0][op];
  const sum=source+im,next={...state,pc:(state.pc+1)%16,carry:sum>=16?1:0};
  if(op<4)next.a=sum%16;
  else if(op<8)next.b=sum%16;
  else if(op<12)next.out=sum%16;
  else if(op%2===1||state.carry===0)next.pc=sum%16;
  return next;
}
test('all 256 instruction bytes match hardware decode from nonzero registers and both carry states',()=>{
  for(let byte=0;byte<256;byte++)for(const carry of [0,1]) {
    const sim=new TD4Circuit([0x7b,0x90,0x3f,carry?0x01:0x00,byte]);
    input(sim,6);for(let i=0;i<4;i++)cycle(sim);
    const before=sim.snapshot();assert.equal(before.carry,carry);
    cycle(sim);assert.deepEqual(sim.snapshot(),reference(before,byte,6),`byte ${byte}, C=${carry}`);
  }
});
test('sample programs execute via the netlist, including carry-dependent ramen loops',()=>{
  for(const program of Object.values(programs)) {
    const sim=new TD4Circuit(program.bytes);let expected={a:0,b:0,out:0,pc:0,carry:0};
    for(let i=0;i<250;i++) {
      const port=i%16;input(sim,port);
      expected=reference(expected,sim.rom[expected.pc],port);cycle(sim);
      assert.deepEqual(sim.snapshot(),expected,`${program.name}: ${i}`);
      assert.equal(sim.value('OUT.data'),expected.out);
      assert.equal(sim.cycles,i+1);
    }
  }
});
test('visible clock folds synchronize capture with ordinary length-based propagation',()=>{
  const sim=new TD4Circuit([0xb3,0xb6]);settle(sim);
  const clocks=Object.values(sim.wires).filter(w=>w.to.endsWith('.clk'));
  assert.equal(clocks.length,5);assert.equal(new Set(clocks.map(w=>w.length)).size,1);
  for(const w of clocks) {
    const points=w.points.filter((p,i)=>!i||p[0]!==w.points[i-1][0]||p[1]!==w.points[i-1][1]);
    for(let i=2;i<points.length;i++) {
      const [a,b,c]=points.slice(i-2,i+1);
      assert.ok((b[0]-a[0])*(c[0]-b[0])+(b[1]-a[1])*(c[1]-b[1])>=0,`${w.id} must not retrace a segment`);
    }
  }
  assert.ok(definition.modules.find(m=>m.id==='CLOCK').width<158);
  for(const w of Object.values(sim.wires)) {
    assert.equal(w.length,lengthOf(w.points));assert.equal(w.delay,w.length/PROPAGATION_SPEED*1000);
    assert.equal(w.width,1);
  }
  for(const id of ['CF','A','PC','R']) {
    const w=clocks.find(w=>w.to===`${id}.clk`),folds=Array.from({length:4},(_,i)=>w.points.slice(1+i*4,5+i*4));
    const depths=folds.map(([a,b,c,d])=>{
      assert.equal(lengthOf([b,c]),4);
      assert.equal(lengthOf([a,b]),lengthOf([c,d]));
      return lengthOf([a,b]);
    });
    assert.ok(depths[0]>0);assert.equal(new Set(depths).size,1);
  }
  // Folding bays must remain unobstructed, including by other CLK routes.
  const overlaps=(a,b,c,d)=>Math.max(Math.min(a,b),Math.min(c,d))<=Math.min(Math.max(a,b),Math.max(c,d));
  for(const [id,folds] of Object.entries(definition.clockFolds)) {
    for(let i=1;i<folds.length;i++)for(const w of definition.wires) {
      if(w.from===`CLOCK.${id}`)continue;
      const [a,b]=[folds[i-1],folds[i]];
      for(let j=1;j<w.points.length;j++) {
        const [c,d]=[w.points[j-1],w.points[j]];
        assert.equal(overlaps(a[0],b[0],c[0],d[0])&&overlaps(a[1],b[1],c[1],d[1]),false,`${id} fold intersects ${w.id}`);
      }
    }
  }
  const delay=clocks[0].delay;assert.ok(sim.requestCycle());assert.equal(sim.requestCycle(),false);
  assert.throws(()=>sim.setInput('I0',1),/Clock pulse/);
  sim.advance(delay-.01);assert.equal(sim.cycles,0);assert.equal(sim.value('R.q'),0);
  sim.next();assert.equal(sim.cycles,1);assert.equal(sim.value('PC.q'),1);assert.equal(sim.value('R.q'),3);
  assert.equal(sim.value('OUT.data'),0);assert.equal(sim.value('ROM.addr'),0);
  const wire=sim.wires['R.q[0]>OUT.data[0]'];sim.advance(wire.delay/2);
  assert.equal(sim.valueAt(wire.id,.25),1);assert.equal(sim.valueAt(wire.id,.75),0);
  settle(sim);assert.equal(sim.value('OUT.data'),3);assert.equal(sim.value('R.d'),6);
});
test('every routed wire has one driver and stays outside modules',()=>{
  assert.equal(new Set(definition.wires.map(w=>w.to)).size,definition.wires.length);
  for(const w of definition.wires)for(let i=1;i<w.points.length;i++) {
    const [a,b]=[w.points[i-1],w.points[i]];
    assert.ok(a[0]===b[0]||a[1]===b[1],w.id);
    for(const m of definition.modules) {
      const hidden=a[0]===b[0]
        ?a[0]>m.x&&a[0]<m.x+m.width&&Math.max(a[1],b[1])>m.y&&Math.min(a[1],b[1])<m.y+m.height
        :a[1]>m.y&&a[1]<m.y+m.height&&Math.max(a[0],b[0])>m.x&&Math.min(a[0],b[0])<m.x+m.width;
      assert.equal(hidden,false,`${w.id} hidden by ${m.id}`);
    }
  }
});
test('all input values, PC wrap, reset during propagation and time-step independence',()=>{
  const sim=new TD4Circuit(programs.input.bytes);
  for(let value=0;value<16;value++){input(sim,value);cycle(sim);cycle(sim);assert.equal(sim.value('OUT.data'),value);cycle(sim);}
  const wrap=new TD4Circuit(Array(16).fill(0));for(let i=0;i<16;i++)cycle(wrap);assert.equal(wrap.value('PC.q'),0);
  const a=new TD4Circuit(programs.blink.bytes),b=new TD4Circuit(programs.blink.bytes);
  settle(a);settle(b);a.requestCycle();b.requestCycle();a.advance(20000);for(let i=0;i<2000;i++)b.advance(10);
  assert.deepEqual(a.nodes,b.nodes);assert.deepEqual(a.wires,b.wires);
  a.requestCycle();a.advance(100);a.reset();settle(a);
  assert.deepEqual(a.snapshot(),{a:0,b:0,out:0,pc:0,carry:0});assert.equal(a.cycles,0);assert.equal(a.value('R.d'),3);
  assert.throws(()=>a.loadProgram([256]));assert.equal(a.rom[0],0xb3);
  a.loadProgram([0xbf]);cycle(a);assert.equal(a.value('OUT.data'),15);
});
