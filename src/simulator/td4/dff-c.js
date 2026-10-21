import transport from './transport.js';
const {Transport, PROPAGATION_SPEED} = transport;
import network from './gate-network.js';
const {GateCircuit}=network;
  class DffCircuit extends GateCircuit {
    constructor(circuitDefinition){super(circuitDefinition);}
    reset() {
      const def=this.definition;this.time=0;this.sequence=0;this.queue=[];this.dirty=new Set();
      this.nodes=Object.fromEntries(def.nodes.map(n=>[n.id,{...n,output:n.initial}]));
      this.gates=Object.fromEntries(def.gates.map(g=>[g.id,g]));
      // Start in a known stable Q=0 state; reset is a page operation, not an
      // extra reset pin on this circuit. Settle the feedback without advancing time.
      let settled=false;
      for(let pass=0;pass<100;pass++) {
        let changed=false;
        for(const w of def.wires) {
          const n=this.nodes[w.to],value=this.nodes[w.from].output;
          if(n.output!==value){n.output=value;changed=true;}
        }
        for(const g of def.gates) {
          for(const port of ['a','b']) {
            const id=`${g.id}.${port}`,w=def.wires.find(w=>w.to===id);
            this.nodes[id].output=this.nodes[w.from].output;
          }
          const n=this.nodes[`${g.id}.y`],value=1-(this.nodes[`${g.id}.a`].output&this.nodes[`${g.id}.b`].output);
          if(n.output!==value){n.output=value;changed=true;}
        }
        if(!changed){settled=true;break;}
      }
      if(!settled)throw Error('DFF reset did not settle');
      this.wires=Object.fromEntries(def.wires.map(w=>{
        const value=this.nodes[w.from].output;
        return [w.id,{...w,delay:w.length/PROPAGATION_SPEED*1000,initial:value,source:value,arrived:value,transitions:[]}];
      }));
      this.fanout=Object.fromEntries(def.nodes.map(n=>[n.id,[]]));
      for(const w of Object.values(this.wires))this.fanout[w.from].push(w);
    }
  }
export default {DffCircuit};
