import shared from '../../simulator/td4/td4.js';
import layoutAPI from './layout.js';
import geometry from '../../simulator/td4/geometry.js';
const {definition:layout,point}=layoutAPI;
const {lengthOf}=geometry;
  const definition={...layout,id:'td4-v2',nodes:[],ports:{},wires:[]};
  for(const p of Object.values(layout.ports)) {
    const bits=Array.from({length:p.width},(_,bit)=>p.width===1?p.id:`${p.id}[${bit}]`);
    const kind={input:'PORT',output:'SOURCE',junction:'JUNCTION'}[p.kind];
    definition.ports[p.id]={...p,bits,kind};
    bits.forEach((id,bit)=>{
      const [x,y]=point(p,bit);
      definition.nodes.push({id,x,y,width:1,kind,module:p.module,bit});
    });
  }
  for(const w of layout.wires)definition.wires.push({
    ...w,id:`${definition.ports[w.from].bits[w.bit]}>${definition.ports[w.to].bits[w.bit]}`,
    from:definition.ports[w.from].bits[w.bit],to:definition.ports[w.to].bits[w.bit],
    layoutId:w.id,width:1,length:lengthOf(w.points),
  });
  for(const [prefix,module,kind] of [['I','IN','INPUT'],['O','OUT','OUTPUT']]) {
    const m=layout.modules.find(m=>m.id===module);
    for(let bit=0;bit<4;bit++)definition.nodes.push({id:`${prefix}${bit}`,x:m.x+m.width-30-bit*(module==='IN'?46:51),y:m.y+37,width:1,kind,module,bit});
  }
  definition.nodes.push({id:'CLK',width:1,kind:'SOURCE',module:'CLOCK'});
  class TD4Circuit extends shared.TD4Circuit {
    constructor(bytes) {super(bytes,definition);}
  }
export default {TD4Circuit,definition};
