import detailLayoutAPI from './detail-layout.js';
const {Builder}=detailLayoutAPI;
const b=new Builder('next-pc','NEXT PC · +1 / JUMP','PC＋1の桁上がりを左のbit 0から右へ伝えます。JUMP=LでPC＋1、HでALU結果を選択します。1111＋1は0000に戻ります。');
const pc=b.group('PC','PC [0–3]',4),result=b.group('RESULT','ALU結果 [0–3]',4),jump=b.group('JUMP','JUMP',1)[0];
const nj=b.invert('NOT_JUMP',jump),out=b.group('Y','次PC [0–3]',4,'OUTPUT');
let carry=pc[0];
for(let bit=0;bit<4;bit++) {
  let increment;
  if(bit===0)increment=b.invert('INC0',pc[0]);
  else {
    const n=b.nand(`INC${bit}.N1`,pc[bit],carry);
    const left=b.nand(`INC${bit}.N2`,pc[bit],n),right=b.nand(`INC${bit}.N3`,carry,n);
    increment=b.nand(`INC${bit}.XOR`,left,right);
    if(bit<3)carry=b.invert(`CARRY${bit+1}`,n);
  }
  b.link(b.mux(`BIT${bit}.SELECT`,increment,result[bit],jump,nj),out[bit]);
}
const definition=b.finish();export default definition;
