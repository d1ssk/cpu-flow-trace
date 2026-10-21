import helpers from './svg-helpers.js';
import geometry from '../../simulator/td4/geometry.js';
const {wire}=helpers.helpers,{pathOf}=geometry;
  function mos(sim,full) {
    let markup=`<g class="mos-supplies" data-supply-mode="${full?'full':'short'}">`;
    for(const c of sim.definition.cells)for(const [i,s] of c.supplies.entries()) {
      const points=full?s.full:s.short,cut=s.net==='VDD'?points[0]:points.at(-1);
      markup+=`<path class="supply-${s.net}" data-supply="${c.id}:${i}" data-supply-net="${s.net}" d="${pathOf(points)}"/>`;
      if(!full)markup+=`<path class="supply-${s.net}" d="M${cut[0]-.2} ${cut[1]-.4}l.4 .8"/>`;
    }
    markup+='</g>'+Object.values(sim.wires).map(w=>wire(w)).join('');
    for(const c of sim.definition.cells) {
      for(const [device,x,y] of c.controlDots??[['PA',c.x,c.y+5],['PB',c.x,c.y+15]])markup+=`<circle cx="${x}" cy="${y}" r=".65" data-control-fill="${c.id}:${device}"/>`;
      const [outX,outY]=c.outputDot??[c.x-13,c.y+10];
      markup+=`<circle cx="${outX}" cy="${outY}" r=".65" data-net-fill="${c.id}:Y"/>`;
      for(const m of c.devices) {
        const {mx,my,gateX}=m,channel=c.channelHalf??3,lead=c.leadHalf??4;
        markup+=`<g data-mos="${m.id}" role="button" tabindex="0" aria-label="${c.id} ${m.localId} ${m.type}MOSを観察">
          <title>${c.id} · ${m.localId} · ${m.type}MOS</title>
          <rect class="mos-hit" x="${Math.min(mx,gateX)-.5}" y="${my-lead}" width="${Math.abs(mx-gateX)+1}" height="${lead*2}"/>
          <path class="mos-lead" data-net-stroke="${c.id}:${m.a}" d="M${mx} ${my-lead}v${lead-channel}"/>
          <path class="mos-lead" data-net-stroke="${c.id}:${m.b}" d="M${mx} ${my+channel}v${lead-channel}"/>
          <path class="focus mos-channel" data-channel="${m.id}" d="M${mx} ${my-channel}v${channel*2}"/>
          <path class="mos-gate" data-control-stroke="${m.id}" d="M${gateX} ${my-channel}v${channel*2}"/>
          ${m.type==='p'?`<circle class="mos-bubble" cx="${m.bubbleX}" cy="${my}" r=".6" data-control-stroke="${m.id}"/>`:''}
        </g>`;
      }
    }
    return markup;
  }
export default {mos};
