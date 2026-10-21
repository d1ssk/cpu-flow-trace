import {test} from 'node:test';
import assert from 'node:assert/strict';
import cpu from './circuit.js';
import details from './details.js';
import full from './full-circuit.js';
import geometry from '../../simulator/td4/geometry.js';
import transport from '../../simulator/td4/transport.js';
import {programs as samples} from '../../td4/programs/index.ts';
import {encode} from '../../td4/instructions.ts';
const names={'counter':'counter','led-blink':'blink','input-output':'input','kitchen-timer':'kitchen'};
const programs=Object.fromEntries(samples.map(p=>[names[p.id]??p.id,{name:p.title.en,bytes:p.lines.map(encode)}]));
const {TD4Circuit,definition}=cpu;
const {lengthOf}=geometry;
const {PROPAGATION_SPEED}=transport;
const {DetailedTD4Circuit,settle,switchView}=full;
for(const view of ['module','nand','mos'])await details.loadAll(view);
const snapshot=s=>JSON.stringify(s.snapshot());
for(const view of ['module','nand','mos-short']){
  test(`${view}: arithmetic programs handle odd inputs and 4-bit overflow`,()=>{
    for(const [id,result] of [['double-input',n=>n*2%16],['half-input',n=>Math.floor(n/2)]]){
      for(const n of [1,7,8,15]){
        const s=new DetailedTD4Circuit(programs[id].bytes,view);
        for(let bit=0;bit<4;bit++)s.setInput(`I${bit}`,(n>>bit)&1);
        settle(s);
        let cycles=0;
        while(s.snapshot().pc!==7){assert.ok(++cycles<100);assert.ok(s.requestCycle());settle(s);}
        assert.equal(s.snapshot().out,result(n),`${id}: input ${n}`);
      }
    }
  });
  test(`${view}: connected internal circuits match all presets, including carry branches`,()=>{
    for(const preset of Object.keys(programs)){
      const s=new DetailedTD4Circuit(programs[preset].bytes,view),reference=new TD4Circuit(programs[preset].bytes);
      if(preset==='input')for(const sim of [s,reference]){sim.setInput('I0',1);sim.setInput('I3',1);}
      settle(s);settle(reference);
      for(let i=0;i<(preset==='kitchen'?260:24);i++){
        assert.ok(s.requestCycle());reference.requestCycle();settle(s);settle(reference);
        assert.equal(snapshot(s),snapshot(reference),`${preset} cycle ${i}`);
      }
      assert.equal(s.cycles,reference.cycles);
    }
  });
  test(`${view}: switching during propagation retains ROM, inputs and final held state`,()=>{
    const s=new DetailedTD4Circuit(programs.input.bytes,view);
    s.setInput('I1',1);s.setInput('I3',1);settle(s);
    s.requestCycle();s.next();assert.ok(s.busy);
    const next=switchView(s,'nand');settle(next);
    assert.equal(snapshot(next),snapshot(s));assert.equal(next.value('IN.q'),10);
    assert.equal(JSON.stringify(next.rom),JSON.stringify(s.rom));assert.equal(next.cycles,s.cycles);
    for(const target of ['module','mos-short','overview']){
      const changed=switchView(next,target);settle(changed);assert.equal(snapshot(changed),snapshot(next));
      changed.requestCycle();settle(changed);assert.equal(changed.value('R.q'),10);
    }
  });
  test(`${view}: internal events share CPU time and output terminals directly drive external wires`,()=>{
    const s=new DetailedTD4Circuit(programs.blink.bytes,view);let steps=0,travel=false;
    while(s.busy){
      s.next();assert.ok(++steps<100000);
      for(const [id,part] of Object.entries(s.parts)){
        assert.equal(part.time,s.time);assert.equal(part.queue,s.queue);
        for(const g of part.definition.groups.filter(g=>g.kind==='OUTPUT'))assert.equal(part.word(g.id),s.value(id+'.'+details.specs[id].ports[g.id]));
        travel ||= Object.values(part.wires).some(w=>w.source!==w.arrived);
      }
    }
    assert.ok(travel,'visible internal transport occurs before settling');
  });
}
