import layout from '../../circuits/td4/layout.js';
import powerLayout from '../../circuits/td4/power-layout.js';
import parts from './part-view.js';
import {hex,binary,disassemble} from '../../td4/format';
import {localizeSvg} from './svg-locale';
import {overviewRegisters} from './overview-registers';
const {definition,point}=layout;
const {modules,ports,wires,width,height}=definition;
const byId=Object.fromEntries(modules.map(m=>[m.id,m]));
const registers=['A','B','PC','R','CF'];
const color=value=>value===1?'#b76557':'#8d9596';
const level=value=>value?'H':'L';
const path=points=>points.map(([x,y],i)=>`${i?'L':'M'}${x} ${y}`).join('');
const text=(x,y,value,cls='module-caption',anchor='middle')=>`<text x="${x}" y="${y}" class="${cls}" text-anchor="${anchor}">${value}</text>`;
const displayPort=id=>id.replace(/^DEC\./,'DECODER.').replace(/^NEXT\./,'NEXT PC.').replace(/^CF\./,'C.').replace(/^R\./,'OUT DFF.');
const captions={MUX:'SELECT → Y',ALU:'X + im → SUM / C',DEC:'SELECT · ENABLE · JUMP',NEXT:'PC + 1 / SUM → Dpc'};
  function connectedWires(moduleId) {
    const touched=new Set(),junctions=new Set();
    let changed=true;
    while(changed) {
      changed=false;
      for(const w of wires) {
        if(touched.has(w.id))continue;
        if([w.from,w.to].some(id=>ports[id].module===moduleId||junctions.has(id))) {
          touched.add(w.id);changed=true;
          for(const id of [w.from,w.to])if(ports[id].kind==='junction')junctions.add(id);
        }
      }
    }
    return touched;
  }

export function drawCpu(svg,sim,view,locale){
 let detailGraphics=[];
  function bitCells(m,count) {
    const pitch=count===1?32:42,start=m.x+m.width/2-(count-1)*pitch/2,y=m.y+m.height*.62;
    return Array.from({length:count},(_,i)=>`<rect class="bit-cell" x="${start+i*pitch-12}" y="${y-13}" width="24" height="26" rx="2"/><text x="${start+i*pitch}" y="${y+4}" text-anchor="middle" class="module-caption" data-register="${m.id}" data-bit="${count-1-i}">0</text>${count>1?text(start+i*pitch,y+25,count-1-i,'bit-label'):''}`).join('');
  }
  function romCells(m) {
    const column=(m.width-24)/2,bitPitch=Math.min(21,(column-53.5)/7);
    return Array.from({length:16},(_,address)=>{
      const left=m.x+12+Math.floor(address/8)*column,top=m.y+25+address%8*9.5;
      return `<g data-rom-word="${address}" role="img"><title></title><rect class="rom-highlight" x="${left}" y="${top}" width="${column-12}" height="9.5" rx="2"/>`+
        text(left+4,top+7.5,hex(address),'rom-address','start')+
        Array.from({length:8},(_,bit)=>`<circle data-rom-bit="${7-bit}" cx="${left+35+bit*bitPitch}" cy="${top+4.75}" r="3.6"/>`).join('')+'</g>';
    }).join('');
  }
  function drawModule(m) {
    if(sim.parts?.[m.id])return `<g class="module detail-circuit" data-module="${m.id}" data-detail-root="${m.id}" transform="translate(${m.x} ${m.y})" role="button" tabindex="0" aria-label="${m.title}の詳細回路"><title>${m.title}</title>${parts.draw(sim.parts[m.id],view)}</g>`;

    const {id,x,y,width:w,height:h}=m;
    const title=view==='overview'?(overviewRegisters[id]?.title??m.title):m.title;
    const titleY=y+(id==='ROM'?17:id==='CLOCK'?15:registers.includes(id)?30:['IN','OUT'].includes(id)?20:24);
    let markup=`<g class="module" data-module="${id}" tabindex="0" role="button" aria-pressed="false" aria-label="${title}の接続を確認"><title>${title}</title><rect class="module-box ${id==='OUT'?'output-box':''}" x="${x}" y="${y}" width="${w}" height="${h}" rx="4"/>${id==='ROM'?text(x+16,titleY,title,'rom-title','start'):text(x+w/2,titleY,title,id==='OUT'?'module-title output-title':'module-title')}`;
    if(id==='ROM')markup+=`<text x="${x+w-16}" y="${y+17}" class="rom-current" text-anchor="end" data-rom-current></text>`+romCells(m);
    else if(registers.includes(id))markup+=bitCells(m,id==='CF'?1:4);
    else if(id==='IN'||id==='OUT'){
      for(let bit=0;bit<4;bit++) {
        const key=`${id==='IN'?'I':'O'}${bit}`,node=sim.nodes[key],cx=node.x,cy=node.y;
        markup+=id==='IN'
          ?`<g data-input="${key}" tabindex="0" role="button" aria-label="入力 bit ${bit} の L / H を切り替える" aria-pressed="false"><circle class="io-bit input-bit" cx="${cx}" cy="${cy}" r="11"/><text x="${cx}" y="${cy+4}" class="io-state" text-anchor="middle" data-input-state="${key}"></text>${text(cx,cy+25,bit,'io-label')}</g>`
          :`<g><circle class="io-bit output-bit" data-io="${key}" cx="${cx}" cy="${cy}" r="12"/>${text(cx,cy+21,bit,'io-label')}</g>`;
      }
    } else if(id==='CLOCK')markup+=`<path class="clock-glyph" d="M${x+15} ${y+30}h8v-8h10v8h10v-8h10v8h4"/>`;
    else markup+=`<text x="${x+w/2}" y="${y+h*.62}" text-anchor="middle" class="module-caption" data-summary="${id}">${captions[id]}</text>`;
    if(registers.includes(id)) {
      const clk=ports[`${id}.clk`],direction=clk.side==='right'?-1:1;
      const clockPath=clk.side==='bottom'?`M${clk.x-6} ${clk.y}l6 -8 6 8`:
        `M${clk.x} ${clk.y-6}l${direction*8} 6 ${-direction*8} 6`;
      markup+=`<path class="clock-glyph" d="${clockPath}"/>`;
      if(clk.side==='bottom')markup+=text(clk.x,clk.y-12,'CLK','port-label');
    }
    return markup+'</g>';
  }
  function drawPorts() {
    const names={a:'A',b:'B',input:'IN',sel:'SEL',x:'X',im:'im',sum:'SUM',cf:'C',op:'op',addr:'ADDR',jump:'JMP',result:'SUM',pc:'PC',y:'Y',d:'D',q:'Q',en:'EN',data:'D'};
    let markup='';
    for(const p of Object.values(ports)) {
      for(let bit=0;bit<p.width;bit++) {
        const [x,y]=point(p,bit);
        markup+=`<circle data-pin="${p.id}" data-bit="${bit}" class="${p.kind==='junction'?'junction':'pin'}" cx="${x}" cy="${y}" r="${p.kind==='junction'?2:1.3}"/>`;
      }
      const m=byId[p.module],key=p.id.split('.')[1];
      if(sim.parts?.[p.module])continue;
      if(!m||p.kind==='junction'||p.module==='CLOCK'||['IN','OUT','ROM'].includes(p.module)||key==='clk')continue;
      let x=p.x+(p.axis==='x'?(p.width-1)*1.25:0),y=p.y,anchor='middle';
      if(p.side==='left'){x+=12;y+=5;anchor='start';}
      else if(p.side==='right'){x-=12;y+=5;anchor='end';}
      else if(Math.abs(p.y-m.y)<.1)y+=13;
      else y-=7;
      markup+=text(x,y,names[key]??key,'port-label',anchor);
    }
    return `<g aria-hidden="true" style="pointer-events:none">${markup}</g>`;
  }
  const drawing=document.createElementNS('http://www.w3.org/2000/svg','g');
  let graphics=[];
  function draw(){
  // Reserve the same rail gutters in every mode; coordinates and scale stay fixed.
  svg.setAttribute('viewBox',`-32 0 ${width+64} ${height}`);
  drawing.innerHTML=wires.map(w=>`<g class="wire-group" data-wire="${w.id}" role="button" tabindex="0" aria-pressed="false" aria-label="${displayPort(w.from)} → ${displayPort(w.to)} bit ${w.bit}"><path class="wire-clearance" d="${path(w.points)}"/><path class="wire" d="${path(w.points)}"/><g class="wave-layers"></g><path class="wire-hit" d="${path(w.points)}"/></g>`).join('')+modules.map(drawModule).join('')+drawPorts();
  svg.append(drawing);
  if(view==='overview'){
    const boundary=document.createElementNS('http://www.w3.org/2000/svg','g');
    boundary.setAttribute('class','cpu-boundary');
    boundary.innerHTML='<path d="M0 126H536V46H1120V654H566V744H0Z"/>';
    drawing.prepend(boundary);
    const annotation=document.createElementNS('http://www.w3.org/2000/svg','text');
    annotation.setAttribute('class','cpu-annotation');annotation.setAttribute('x','44');annotation.setAttribute('y','120');annotation.textContent='CPU';
    drawing.append(annotation);
  }
  if(view==='mos-power'){
    const power=powerLayout.build(definition,sim.parts);
    const powerGroup=document.createElementNS('http://www.w3.org/2000/svg','g');powerGroup.classList.add('cpu-supplies');
    powerGroup.innerHTML=power.rails.map(r=>`<path data-power-rail="${r.net}" class="supply-${r.net}" d="M${r.x} ${power.top}V${power.bottom}"/>${text(r.x,power.top-7,r.label,'power-label')}`).join('')+power.branches.map(b=>`<path class="supply-${b.net}" data-power-branch="${b.module}" d="${path(b.points)}"/>`).join('')+power.dots.map(d=>`<circle class="supply-${d.net}" cx="${d.x}" cy="${d.y}" r="1.5"/>`).join('');
    drawing.prepend(powerGroup);
  }
  detailGraphics=parts.graphics(svg);
  graphics=sim.definition.wires.map(w=>{
    const group=[...svg.querySelectorAll('[data-wire]')].find(el=>el.dataset.wire===w.layoutId);
    const line=group.querySelector('.wire');
    if(Math.abs(line.getTotalLength()-w.length)>.02)throw Error(`Wire length mismatch: ${w.id}`);
    return {id:w.id,line,layers:group.querySelector('.wave-layers')};
  });

  }
  draw();
  localizeSvg(svg,locale);

  function render(instructionAddress) {
    if(sim.parts)parts.render(sim,detailGraphics);
    for(const {id,line,layers} of graphics) {
      const w=sim.wires[id];line.style.stroke=color(w.initial);
      layers.innerHTML=w.transitions.map(t=>{
        const distance=Math.min(w.length,Math.max(0,(sim.time-t.time)/w.delay*w.length));
        if(!distance)return '';
        const p=line.getPointAtLength(distance);
        return `<path class="wire wave" d="${line.getAttribute('d')}" style="stroke:${color(t.value)}" stroke-dasharray="${distance} ${w.length+1}"/><circle cx="${p.x}" cy="${p.y}" r="1.8" fill="${color(t.value)}"/>`;
      }).join('');
    }
    svg.querySelectorAll('[data-pin]').forEach(el=>el.style.fill=color((sim.value(el.dataset.pin)>>Number(el.dataset.bit))&1));
    svg.querySelectorAll('[data-register]').forEach(el=>{
      const value=(sim.value(`${el.dataset.register}.q`)>>Number(el.dataset.bit))&1;
      el.textContent=value;el.style.fill=color(value);
    });
    svg.querySelectorAll('[data-input-state]').forEach(el=>{const value=sim.value(el.dataset.inputState);el.textContent=level(value);el.style.fill=color(value);});
    svg.querySelectorAll('[data-io]').forEach(el=>el.style.fill=color(sim.value(el.dataset.io)));
    svg.querySelectorAll('[data-input]').forEach(el=>{
      el.setAttribute('aria-pressed',String(Boolean(sim.value(el.dataset.input))));
      el.setAttribute('aria-disabled',String(sim.clockActive));
      if(sim.clockActive)el.setAttribute('aria-describedby','td4-input-locked');else el.removeAttribute('aria-describedby');
    });
    svg.querySelectorAll('[data-rom-word]').forEach(el=>{
      const address=Number(el.dataset.romWord),current=address===instructionAddress;
      el.classList.toggle('current',current);
      if(current)el.setAttribute('aria-current','true');else el.removeAttribute('aria-current');
      const description=`${hex(address)}: ${binary(sim.rom[address],8)} · ${disassemble(sim.rom[address])}${current?(locale==='ja'?' · 実行対象':' · Current instruction'):''}`;
      el.setAttribute('aria-label',description);el.querySelector('title').textContent=description;
      el.querySelectorAll('[data-rom-bit]').forEach(bit=>bit.style.fill=color((sim.rom[address]>>Number(bit.dataset.romBit))&1));
    });
    svg.querySelector('[data-rom-current]').textContent=`${hex(instructionAddress)}: ${hex(sim.rom[instructionAddress])}`;
    const summaries={MUX:`${['A','B','IN','0'][sim.value('MUX.sel')]} → ${binary(sim.value('MUX.y'),4)}`,ALU:`${sim.value('ALU.x')} + ${sim.value('ALU.im')} = ${sim.value('ALU.sum')} · C ${sim.value('ALU.cf')}`,DEC:`SEL ${binary(sim.value('DEC.sel'),2)} · EN ${['R','B','A'].map(id=>sim.value(`DEC.en${id}`)).join('')} · JMP ${sim.value('DEC.jump')}`,NEXT:`${sim.value('NEXT.pc')} → ${sim.value('NEXT.y')}`};
    svg.querySelectorAll('[data-summary]').forEach(el=>el.textContent=summaries[el.dataset.summary]);
    const clock=svg.querySelector('[data-module="CLOCK"] .clock-glyph');clock.style.stroke=color(sim.value('CLK'));
  }

function select(selection){
 const touched=selection?.kind==='module'?connectedWires(selection.id):new Set(selection?.kind==='wire'?[selection.id]:[]);
 const neighbors=new Set(wires.filter(w=>touched.has(w.id)).flatMap(w=>[ports[w.from].module,ports[w.to].module]));
 svg.querySelectorAll('[data-module]').forEach(el=>{
  const active=selection?.kind==='module'&&el.dataset.module===selection.id;
  el.classList.toggle('selected',active);el.classList.toggle('connected',neighbors.has(el.dataset.module)&&!active);
  el.setAttribute('aria-pressed',String(active));
 });
 svg.querySelectorAll('[data-wire]').forEach(el=>{
  const active=touched.has(el.dataset.wire);el.classList.toggle('active',active);
  el.setAttribute('aria-pressed',String(selection?.kind==='wire'&&selection.id===el.dataset.wire));
 });
 svg.querySelectorAll('[data-detail-root] .inspected').forEach(el=>el.classList.remove('inspected'));
 if(selection?.kind==='detail'){
  const group=[...svg.querySelectorAll('[data-detail-root]')].find(el=>el.dataset.detailRoot===selection.module);
  const picked=[...group.querySelectorAll('[data-detail-wire],[data-gate],[data-part-module],[data-mos],[data-output]')].find(el=>el.dataset[selection.attribute]===selection.id);
  picked?.classList.add('inspected');
 }
}

 return {render,select};
}
