import detailLayoutAPI from './detail-layout.js';
const {Builder}=detailLayoutAPI;
const b=new Builder('mux','MUX · A / B / IN / 0','SEL=00 → A、01 → B、10 → IN、11 → 0。各bitを3個の2:1選択回路で構成し、各選択回路はNAND 3個を接続しています。');
const a=b.group('A','A [0–3]',4),c=b.group('B','B [0–3]',4),input=b.group('IN','IN [0–3]',4);
const sel=b.group('SEL','SEL [0–1]',2),zero=b.group('ZERO','0',1,'CONSTANT')[0];
const ns0=b.invert('NOT_SEL0',sel[0]),ns1=b.invert('NOT_SEL1',sel[1]);
const out=b.group('Y','Y [0–3]',4,'OUTPUT');
for(let bit=0;bit<4;bit++) {
  const ab=b.mux(`BIT${bit}.AB`,a[bit],c[bit],sel[0],ns0);
  const iz=b.mux(`BIT${bit}.IN_ZERO`,input[bit],zero,sel[0],ns0);
  b.link(b.mux(`BIT${bit}.SELECT`,ab,iz,sel[1],ns1),out[bit]);
}
const definition=b.finish();export default definition;
