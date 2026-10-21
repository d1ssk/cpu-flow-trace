import base from './circuit.js';
import details from './details.js';
  const registers=['A','B','PC','R','CF'];
  class DetailedTD4Circuit extends base.TD4Circuit {
    constructor(bytes,view='module',previous=null){
      super(bytes);this.view=view;this.reset(previous);
    }
    reset(previous=null){
      this.parts=null;this.pendingInstruction=null;super.reset();
      if(!this.view)return;
      this.queue=[];this.dirty.clear();
      for(const n of Object.values(this.nodes))n.output=0;
      for(const w of Object.values(this.wires)){w.initial=0;w.source=0;w.arrived=0;w.transitions=[];}
      this.parts=Object.fromEntries(Object.keys(details.specs).map(id=>[id,details.create(id,this.view)]));
      if(previous){
        for(const [id,part] of Object.entries(this.parts)){
          const words=Object.fromEntries(part.definition.groups.map(g=>[g.id,details.specs[id].ports[g.id]?previous.value(id+'.'+details.specs[id].ports[g.id]):part.word(g.id)]));
          details.restore(part,words);
        }
        this.cycles=previous.cycles;this.lastExecuted=previous.lastExecuted;
        for(let bit=0;bit<4;bit++)this.nodes['I'+bit].output=previous.value('I'+bit);
      }
      // Shared queue accessors preserve the exact timestamp of every nested
      // send, including events emitted during another circuit's flush.
      for(const [id,part] of Object.entries(this.parts)){
        for(const key of ['time','sequence','queue'])Object.defineProperty(part,key,{get:()=>this[key],set:value=>{this[key]=value;},configurable:true});
        const outputs=new Map(part.definition.groups.filter(g=>g.kind==='OUTPUT').flatMap(g=>g.ids.map((key,bit)=>[key,this.definition.ports[id+'.'+details.specs[id].ports[g.id]].bits[bit]])));
        const method=part.drive?'drive':'output',drive=part[method].bind(part);
        part[method]=(key,...args)=>{drive(key,...args);if(outputs.has(key))this.output(outputs.get(key),part.nodes[key].output);};
        for(const [key,target] of outputs)this.output(target,part.nodes[key].output);
      }
      this.output('IN.q',[0,1,2,3].reduce((n,bit)=>n|(this.value('I'+bit)<<bit),0));
      for(const id of ['ROM',...Object.keys(this.parts),'OUT'])this.evaluate(id);
    }
    evaluate(id){
      const part=this.parts?.[id];
      if(!part){super.evaluate(id);return;}
      for(const g of part.definition.groups.filter(g=>g.kind==='INPUT'&&details.specs[id].ports[g.id]))part.setWord(g.id,this.value(id+'.'+details.specs[id].ports[g.id]));
    }
    flush(){
      super.flush();
      for(const part of Object.values(this.parts??{}))part.flush();
      // Hold the high phase until the entire connected circuit settles. This
      // prevents a short external pulse from overtaking a detailed latch.
      if(this.parts&&!this.queue.length&&this.value('CLK')){
        if(this.pendingInstruction){this.lastExecuted=this.pendingInstruction;this.pendingInstruction=null;this.cycles++;}
        this.setClock(0);
      }
    }
    advance(delta){
      super.advance(delta);
      for(const part of Object.values(this.parts??{}))for(const w of Object.values(part.wires))while(w.transitions.length&&w.transitions[0].time+w.delay<=this.time)w.initial=w.transitions.shift().value;
    }
    requestCycle(){
      if(!this.ready)return false;
      const address=this.value('PC.q');this.pendingInstruction={address,byte:this.rom[address]};
      this.setClock(1);return true;
    }
  }
  function settle(sim){let count=0;while(sim.busy){if(++count>100000)throw Error('TD4 detail did not settle');sim.next();}}
  function switchView(previous,view){
    settle(previous);
    if(view!=='overview'){const next=new DetailedTD4Circuit(previous.rom,view,previous);settle(next);next.time=0;return next;}
    const sim=new base.TD4Circuit(previous.rom);
    for(const id of registers)sim.output(id+'.q',previous.value(id+'.q'));
    for(let bit=0;bit<4;bit++)sim.setInput('I'+bit,previous.value('I'+bit));
    sim.cycles=previous.cycles;sim.lastExecuted=previous.lastExecuted;settle(sim);
    sim.time=0;return sim;
  }
export default {DetailedTD4Circuit,switchView,settle};
