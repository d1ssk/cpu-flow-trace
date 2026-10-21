import transport from './transport.js';
const {Transport, PROPAGATION_SPEED} = transport;
  function normalizeProgram(bytes) {
    if(!Array.isArray(bytes)||bytes.length<1||bytes.length>16||bytes.some(n=>!Number.isInteger(n)||n<0||n>255))
      throw new Error('ROM must contain 1–16 bytes');
    return Array.from({length:16},(_,i)=>bytes[i]??0);
  }

  class TD4Circuit extends Transport {
    constructor(bytes, circuitDefinition) {
      super();this.definition=circuitDefinition;this.kind='td4';this.rom=normalizeProgram(bytes);this.reset();
    }
    loadProgram(bytes) {const rom=normalizeProgram(bytes);this.rom=rom;this.reset();}
    reset() {
      this.time=0;this.sequence=0;this.queue=[];this.dirty=new Set();this.lastClock={};this.cycles=0;this.lastExecuted=null;
      this.nodes=Object.fromEntries(this.definition.nodes.map(n=>[n.id,{...n,output:0}]));
      this.wires=Object.fromEntries(this.definition.wires.map(w=>[w.id,{...w,
        delay:w.length/PROPAGATION_SPEED*1000,initial:0,source:0,arrived:0,transitions:[]} ]));
      this.fanout=Object.fromEntries(this.definition.nodes.map(n=>[n.id,[]]));
      for(const w of Object.values(this.wires))this.fanout[w.from].push(w);
      // Reset exposes the first fetch and settling as ordinary wire events.
      for(const id of ['ROM','DEC','MUX','ALU','NEXT','OUT'])this.evaluate(id);
    }
    value(id) {
      const port=this.definition.ports[id];
      return port?port.bits.reduce((word,key,bit)=>word|(this.nodes[key].output<<bit),0):this.nodes[id].output;
    }
    output(id,value) {
      const bits=this.definition.ports[id]?.bits??[id];
      bits.forEach((key,bit)=>{
        const next=(value>>bit)&1;
        if(this.nodes[key].output===next)return;
        this.nodes[key].output=next;this.drive(key);
      });
    }
    drive(id) {
      for(const w of this.fanout[id])this.send(w.id,this.value(id),value=>{
        const n=this.nodes[w.to];if(n.output===value)return;n.output=value;
        if(n.kind==='JUNCTION')this.drive(n.id);else this.dirty.add(n.module);
      });
    }
    evaluate(id) {
      const v=port=>this.value(`${id}.${port}`),out=(port,value)=>this.output(`${id}.${port}`,value);
      if(id==='ROM') {const byte=this.rom[v('addr')];out('op',byte>>4);out('im',byte&15);}
      if(id==='DEC') {
        const opcode=v('op'),dest=opcode>>2;
        out('sel',dest===3?3:opcode&3);
        for(const [index,reg] of ['A','B','R'].entries())out(`en${reg}`,dest===index?1:0);
        out('jump',dest===3&&((opcode&1)||!v('cf'))?1:0);
      }
      if(id==='MUX')out('y',[v('a'),v('b'),v('input'),0][v('sel')]);
      if(id==='ALU') {const sum=v('x')+v('im');out('sum',sum&15);out('cf',sum>>4);}
      if(id==='NEXT')out('y',v('jump')?v('result'):(v('pc')+1)&15);
      if(['A','B','R','PC','CF'].includes(id)) {
        const clock=v('clk');
        if(!this.lastClock[id]&&clock) {
          if(id==='PC') {
            const pc=v('q');this.lastExecuted={address:pc,byte:this.rom[pc]};this.cycles++;
          }
          if(['PC','CF'].includes(id)||v('en'))out('q',v('d'));
        }
        this.lastClock[id]=clock;
      }
      if(id==='OUT')for(let bit=0;bit<4;bit++)this.output(`O${bit}`,(v('data')>>bit)&1);
    }
    flush() {const pending=[...this.dirty];this.dirty.clear();for(const id of pending)this.evaluate(id);}
    setInput(id,value) {
      if(this.nodes[id]?.kind!=='INPUT'||![0,1].includes(value))throw new Error('Invalid input');
      // Keep external inputs stable while a clock pulse is being distributed.
      if(this.clockActive)throw new Error('Clock pulse in progress');
      this.nodes[id].output=value;
      this.output('IN.q',[0,1,2,3].reduce((n,bit)=>n+(this.value(`I${bit}`)<<bit),0));
    }
    get clockActive() {return Boolean(this.value('CLK')||['A','B','R','PC','CF'].some(id=>this.value(`${id}.clk`)));}
    get ready() {return !this.busy&&!this.clockActive;}
    setClock(value) {
      this.output('CLK',value);
      for(const id of ['A','B','R','PC','CF'])this.output(`CLOCK.${id}`,value);
    }
    requestCycle() {
      if(!this.ready)return false;
      this.setClock(1);
      const pulseWidth=2*this.wires['CLOCK.A>A.clk'].delay;
      this.queue.push({time:this.time+pulseWidth,order:this.sequence++,action:()=>this.setClock(0)});
      this.queue.sort((a,b)=>a.time-b.time||a.order-b.order);return true;
    }
    snapshot() {return Object.fromEntries(Object.entries({a:'A',b:'B',out:'R',pc:'PC',carry:'CF'}).map(([key,id])=>[key,this.value(`${id}.q`)]));}
  }
export default {TD4Circuit};
