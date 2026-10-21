import helpers from './svg-helpers.js';
import mos from './mos-view.js';
const {wire,text}=helpers.helpers;
  function draw(sim,view,{embedded=false}={}) {
    const def=sim.definition,{width,height}=def,{x:sx,y:sy}=def.scale;
    let html=`<rect class="detail-frame" x=".3" y=".3" width="${width-.6}" height="${height-.6}"/>`;
    const bay=def.clockTuningArea;
    if(bay)html+=`<rect class="clock-bay" data-clock-bay="" x="${bay.x}" y="${bay.y}" width="${bay.width}" height="${bay.height}"/>${text(bay.x+bay.width/2,bay.y+bay.height-5,'CLK 等長化','detail-port','text-anchor="middle"')}`;
    if(view.startsWith('mos'))html+=mos.mos(sim,view==='mos-power');
    else html+=Object.values(sim.wires).map(w=>wire(w)).join('');
    for(const g of def.gates??[]) {
      let shape;
      if(g.shape||def.gateShape){const {width:w,height:h,bubble:b}=g.shape??def.gateShape,r=w/2;shape=`<path class="focus gate-body" d="M${-r} 0h${w}v${h-2*b-r}a${r} ${r} 0 0 1-${w} 0Z"/><circle class="gate-body" cy="${h-b}" r="${b}"/>`;}
      else {const s=g.scale??.375,y=def.gateScaleY??1;shape=`<g transform="scale(${s/.375} ${y*s/.375})"><path class="focus gate-body" d="M-6 0h12v4a6 6 0 0 1-12 0Z"/><circle class="gate-body" cy="11" r="1"/></g>`;}
      html+=`<g data-gate="${g.id}" role="button" tabindex="0" aria-label="${g.id} NANDを観察" transform="translate(${g.x} ${g.y}) scale(${g.sx??sx} ${g.sy??sy})"><title>${g.id}</title>${shape}</g>`;
    }
    const blocks=def.modules??def.stages?.filter(m=>m.id)??[];
    for(const m of blocks) {
      const inverter=m.kind==='NOT'||m.id==='CK';
      const [title,subtitle]=m.label.split(' · ');
      const latchOutput=['Master','Slave'].includes(title)?`${m.id}.q`:null;
      // A narrow half-adder gets two full-size lines. Wider blocks can keep
      // their title on one line; the bit index is secondary information.
      const lines=title==='Half adder'&&m.width<90?['Half','adder']:[title];
      const font=Math.min(title==='4:1 MUX'?16:26,lines.length===2?(m.height-19)/2.1:m.height*(subtitle?.3:.32),(m.width-6)/(.62*Math.max(...lines.map(s=>s.length))));
      const baseline=lines.length===2?m.y+4+font:m.y+m.height*(inverter?.65:subtitle?.42:.44);
      const titleMarkup=lines.map((line,i)=>text(m.x+m.width/2,baseline+i*font*1.05,line,'module-title',`text-anchor="middle" style="font-size:${font}px"`)).join('')+(subtitle&&lines.length===1?text(m.x+m.width/2,m.y+m.height*.64,subtitle,'module-subtitle',`text-anchor="middle" style="font-size:${Math.min(9,font*.65)}px"`):'');
      html+=`<g data-module="${m.id}" role="button" tabindex="0" aria-label="${m.id} ${m.label}を観察"><title>${m.label}</title><rect class="focus module-body" ${latchOutput?`data-latch-output="${latchOutput}"`:''} x="${m.x}" y="${m.y}" width="${m.width}" height="${m.height}" rx="1"/>${titleMarkup}<text x="${m.x+m.width/2}" y="${m.y+m.height*(lines.length===2?.87:.82)}" class="module-live" text-anchor="middle" data-module-value="${m.id}" ${inverter?'visibility="hidden"':''}></text></g>`;
      if(inverter)continue;
      for(const n of def.nodes.filter(n=>(n.gate===m.id||n.stage===m.id)&&['PORT','SOURCE'].includes(n.kind))) {
        const side=Math.abs(n.x-m.x)<.01?'left':Math.abs(n.x-m.x-m.width)<.01?'right':Math.abs(n.y-m.y)<.01?'top':'bottom';
        html+=text(n.x+(side==='left'?2:side==='right'?-2:0),n.y+(side==='top'?5:-2),n.id.split('.').at(-1).toUpperCase(),'module-pin',`text-anchor="${side==='left'?'start':side==='right'?'end':'middle'}"`);
      }
    }
    for(const b of def.bits??[])html+=text(b.x+b.width/2,height-10,`bit ${b.bit}`,'detail-port','text-anchor="middle"');
    for(const n of def.nodes)if(n.kind==='JUNCTION'&&!n.gate)html+=`<circle cx="${n.x}" cy="${n.y}" r=".55" data-node="${n.id}"/>`;
    for(const g of def.groups) {
      const {side,x,y}=g;
      html+=text(side==='left'?4:side==='right'?width-4:x-3,side==='top'?5:side==='bottom'?height-2:y-3,g.id,'detail-port',`text-anchor="${side==='left'?'start':'end'}"`);
      for(const id of g.ids){const n=sim.nodes[id],input=n.kind==='INPUT'&&!embedded;
        html+=`<g ${input?`data-input="${id}"`:`data-output="${id}"`} role="button" tabindex="0" aria-label="${id} ${input?'を切り替える':'を観察'}"><title>${id}</title><circle cx="${n.x}" cy="${n.y}" r=".85" data-node="${id}"/><circle class="terminal-hit" cx="${n.x}" cy="${n.y}" r="2"/></g>`;
      }
    }
    return html;
  }
export default {draw};
