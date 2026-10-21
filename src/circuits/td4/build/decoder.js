import detailLayoutAPI from './detail-layout.js';
const {Builder}=detailLayoutAPI;
const b=new Builder('decoder','DECODER','OP[3:2]で書き込み先を選択。11ではSELを11に固定し、OP0 または ¬C がHならJUMPを出力します。ENは正論理です。');
const op=b.group('OP','OP [0–3]',4),cf=b.group('C','C',1)[0];
const n3=b.invert('NOT_OP3',op[3]),n2=b.invert('NOT_OP2',op[2]);
const n1=b.invert('NOT_OP1',op[1]),n0=b.invert('NOT_OP0',op[0]);
const nd=b.nand('NOT_BRANCH',op[3],op[2]),d=b.invert('BRANCH',nd);
for(const [name,a,c] of [['ENA',n3,n2],['ENB',n3,op[2]],['ENOUT',op[3],n2]]) {
  const neg=b.nand(`${name}.N`,a,c),value=b.invert(name,neg);
  b.link(value,b.group(name,name,1,'OUTPUT')[0]);
}
const sel=b.group('SEL','SEL [0–1]',2,'OUTPUT');
b.link(b.nand('SEL0',n0,nd),sel[0]);b.link(b.nand('SEL1',n1,nd),sel[1]);
const condition=b.nand('OP0_OR_NOT_C',n0,cf);
const nj=b.nand('NOT_JUMP',d,condition),jump=b.invert('JUMP',nj);
b.link(jump,b.group('JUMP','JUMP',1,'OUTPUT')[0]);
const definition=b.finish();export default definition;
