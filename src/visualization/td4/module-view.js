import detailView from './detail-view.js';
import parts from './part-view.js';
import {localizeSvg} from './svg-locale';
export function drawDetail(svg,part,id,view,locale){
 svg.setAttribute('viewBox',`0 0 ${part.definition.width} ${part.definition.height}`);
 svg.innerHTML=`<g data-detail-root="${id}" class="detail-circuit">${detailView.draw(part,view)
  .replaceAll('data-wire=','data-detail-wire=').replaceAll('data-module=','data-part-module=')}</g>`;
 localizeSvg(svg,locale);
 const graphics=parts.graphics(svg);
 for(const {wires} of graphics)for(const {id,line} of wires){
  if(Math.abs(line.getTotalLength()-part.wires[id].length)>.02)throw Error('Wire length mismatch: '+id);
 }
 function render(){parts.render({parts:{[id]:part},time:part.time},graphics);}
 render();return {render};
}
