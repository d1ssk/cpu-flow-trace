/* Reuse the 1.3-unit detail drawings at their native CPU pin coordinates. */
import helpers from './svg-helpers.js';
import detail from './detail-view.js';
const {color}=helpers;
  function draw(part,view){
    return detail.draw(part,view,{embedded:true})
      .replaceAll('data-module=','data-part-module=').replaceAll('data-wire=','data-detail-wire=');
  }
  function graphics(svg){
    return [...svg.querySelectorAll('[data-detail-root]')].map(group=>({
      id:group.dataset.detailRoot,group,
      wires:[...group.querySelectorAll('[data-detail-wire]')].map(el=>({id:el.dataset.detailWire,line:el.querySelector('.wire-base'),layers:el.querySelector('.wave-layers')})),
      nodes:[...group.querySelectorAll('[data-node]')],strokes:[...group.querySelectorAll('[data-stroke-node]')],
      latches:[...group.querySelectorAll('[data-latch-output]')],
      values:[...group.querySelectorAll('[data-module-value]')],channels:[...group.querySelectorAll('[data-channel]')],
      nets:['control-fill','control-stroke','net-fill','net-stroke'].flatMap(attr=>[...group.querySelectorAll(`[data-${attr}]`)].map(el=>({el,key:el.getAttribute('data-'+attr),control:attr.startsWith('control'),property:attr.endsWith('fill')?'fill':'stroke'}))),
    }));
  }
  function render(sim,items){
    for(const item of items){
      const part=sim.parts[item.id];
      for(const {id,line,layers} of item.wires){
        const w=part.wires[id];line.style.stroke=color(w.initial);line.setAttribute('stroke-dasharray',typeof w.initial==='number'?'':'.6 .6');
        layers.innerHTML=w.transitions.map(t=>{
          const distance=Math.min(w.length,Math.max(0,(sim.time-t.time)/w.delay*w.length));
          return distance?`<path class="wire" d="${line.getAttribute('d')}" style="stroke:${color(t.value)}" stroke-dasharray="${distance} ${w.length+1}"/>`:'';
        }).join('');
      }
      for(const el of item.nodes)el.setAttribute('fill',color(part.nodes[el.dataset.node].output));
      for(const el of item.strokes)el.setAttribute('stroke',color(part.nodes[el.dataset.strokeNode].output));
      for(const el of item.latches)el.setAttribute('data-held-value',part.nodes[el.dataset.latchOutput].output);
      for(const el of item.values){
        const id=el.dataset.moduleValue;
        el.textContent=part.definition.nodes.filter(n=>(n.gate===id||n.stage===id)&&n.kind==='SOURCE').map(n=>`${n.id.split('.').at(-1).toUpperCase()} ${part.nodes[n.id].output}`).join(' · ');
      }
      for(const {el,key,control,property} of item.nets){const [id,net]=key.split(':');el.setAttribute(property,color(control?part.nodes[key].output:part.cells[id].nets[net]));}
      for(const el of item.channels){const [id,device]=el.dataset.channel.split(':'),m=part.cells[id].devices.find(m=>m.id===device);el.setAttribute('stroke',color(m.on?part.cells[id].nets[m.b]:0));el.setAttribute('stroke-dasharray',m.on?'':'.3 .2');}
    }
  }
export default {draw,graphics,render};
