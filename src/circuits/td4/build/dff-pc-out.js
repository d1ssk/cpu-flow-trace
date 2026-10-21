import dffAbAPI from './dff-ab.js';
import dffCAPI from './dff-c.js';
import geometryAPI from './geometry.js';
/* Left-entry four-bit registers. PC always loads; OUT has the A/B enable mux.
 * Mirroring preserves every latch and clock-path length, including C sync. */
const {build}=dffAbAPI;
const {DffCircuit}=dffCAPI;
const {lengthOf}=geometryAPI;
function register(id,enable) {
  const def=build({enable});
  def.id=`dff-${id}`;def.title=`DFF ${id==='pc'?'PC':'OUT'} · 4 bit`;
  def.description=enable
    ?'A・Bと同じNANDラッチとD/Q選択回路。EN=HでDを取り込み、EN=Lで保持します。左端の折り返しで4 bitのCLK到着を揃えます。'
    :'NAND 9個のラッチを4組接続。CLKの立ち上がりごとにDを取り込みます。次のPC値の計算はNEXT PCが担当し、左端の折り返しで4 bitのCLK到着を揃えます。';
  const mirror=([x,y])=>[def.width-x,y];
  for(const n of def.nodes)n.x=def.width-n.x;
  for(const g of def.gates)g.x=def.width-g.x;
  for(const w of def.wires){w.points=w.points.map(mirror);w.length=lengthOf(w.points);}
  for(const bit of def.bits)bit.x=def.width-bit.x-bit.width;
  def.clockTuningArea.x=0;
  if(enable) {
    // OUT's EN remains at the TD4 terminal's local x=466. Route above the
    // NAND bodies to the mirrored enable trunk without touching D terminals.
    const en=def.nodes.find(n=>n.id==='EN'),trunk=def.nodes.find(n=>n.id==='enable-trunk');
    en.x=466;
    const wire=def.wires.find(w=>w.from==='EN');
    wire.points=[[en.x,en.y],[en.x,1],[trunk.x,1],[trunk.x,trunk.y]];
    wire.length=lengthOf(wire.points);
  }
  return def;
}
const definitions={pc:register('pc',false),out:register('out',true)};
class DffPCOutCircuit extends DffCircuit {
  constructor(id){if(!definitions[id])throw Error(`Unknown register: ${id}`);super(definitions[id]);}
}
const api={definitions,DffPCOutCircuit};export default api;
