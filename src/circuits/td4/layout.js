
/* Fixed TD4 module layout. The simulation uses these exact wire routes.
 * INPUT and ROM sit above MUX. The left stack uses compact routing gaps;
 * B and OUTPUT share a bottom edge. A/B feedback runs from their left edges
 * straight into the left routing lanes, leaving the lower gaps for inputs.
 * ROM terminals face right; ALU immediate data enters at its upper right. */
  const BIT_PITCH=2.5;
  const definition={width:1120,height:750,modules:[],ports:{},wires:[]};
  const modules=definition.modules, ports=definition.ports;
  function mod(id,title,x,y,width,height,description) {
    modules.push({id,title,x,y,width,height,description});
  }
  function pin(id,x,y,width=1,kind='input',axis='x',side='top') {
    ports[id]={id,module:id.split('.')[0],x,y,width,kind,axis,side};
  }
  const point=(port,bit)=>[port.x+(port.axis==='y'?0:bit*BIT_PITCH),port.y+(port.axis==='x'?0:bit*BIT_PITCH)];
  function wire(from,to,route=()=>[]) {
    const a=ports[from],b=ports[to];
    if(a.width!==b.width)throw Error(`Port width mismatch: ${from} → ${to}`);
    for(let bit=0;bit<a.width;bit++) {
      const start=point(a,bit),end=point(b,bit);
      definition.wires.push({id:`${from}>${to}:${bit}`,from,to,bit,points:[start,...route(bit,start,end),end]});
    }
  }

  mod('IN','INPUT · 4 bit',44,10,200,65,'外部から入力する4 bit。MUXへ接続。');
  pin('IN.q',144,75,4,'output');
  mod('ROM','ROM · 16 × 8',260,10,264,110,'PCを番地として、命令の上位4 bitをDecoder、下位4 bitをALUへ渡します。');
  pin('ROM.addr',524,20,4,'input','y','right');
  // All ROM bundles leave the right edge, ordered by their routing lanes.
  pin('ROM.op',524,34,4,'output','y','right');pin('ROM.im',524,110,4,'output','y','right');
  mod('DEC','DECODER',752,46,330,94,'命令とCから、MUXの選択、各レジスタの書き込み許可、ジャンプを指定します。');
  pin('DEC.op',955,46,4);pin('DEC.cf',752,80,1,'input','y','left');
  pin('DEC.sel',752,98,2,'output','y','left');
  for(const [i,id] of ['A','B','R'].entries())pin(`DEC.en${id}`,800+i*50,140,1,'output');
  pin('DEC.jump',1000,140,1,'output');
  mod('MUX','MUX · A / B / IN / 0',44,132,480,132,'A・B・外部入力・0から、ALUに送る4 bitを選択します。');
  pin('MUX.a',44,180,4,'input','y','left');pin('MUX.b',44,230,4,'input','y','left');
  pin('MUX.input',144,132,4);pin('MUX.sel',524,230,2,'input','y','right');pin('MUX.y',294,264,4,'output');
  const aluHeight=166*480/570;
  mod('ALU','ALU · 4 bit ADD',44,276,480,aluHeight,'MUXの値と即値を加算。SUMをA・B・OUT・Next PC、桁上がりをCへ渡します。');
  pin('ALU.x',294,276,4);pin('ALU.im',524,300,4,'input','y','right');
  pin('ALU.sum',340,276+aluHeight,4,'output');pin('ALU.cf',524,342,1,'output','y','right');
  mod('NEXT','NEXT PC · +1 / JUMP',752,158,330,152,'通常はPC+1、ジャンプ時はALUのSUMを次のPCに選択します。');
  pin('NEXT.pc',1082,258,4,'input','y','right');pin('NEXT.result',800,310,4,'input','x','bottom');
  pin('NEXT.jump',1000,158);pin('NEXT.y',975,310,4,'output');

  const registers=[
    {id:'A',label:'A',x:44,y:443,width:508,height:136,bits:4,dx:300,qx:44},
    {id:'B',label:'B',x:44,y:595,width:508,height:136,bits:4,dx:300,qx:44},
    {id:'PC',label:'PC',x:574,y:343,width:508,height:116,bits:4,dx:975,qx:990},
    {id:'R',label:'OUT',x:574,y:503,width:508,height:136,bits:4,dx:900,qx:990},
    {id:'CF',label:'C',x:548,y:46,width:176,height:128,bits:1,dx:618,qx:618},
  ];
  for(const {id,label,x,y,width,height,bits,dx,qx} of registers) {
    mod(id,`DFF · ${label} · ${bits} bit`,x,y,width,height,
      id==='CF'?'ALUの桁上がりを保持し、Decoderの条件分岐へ接続。':
      id==='PC'?'次の命令の番地を保持。ROMとNext PCへ接続。':
      `${label}の4 bitを保持。クロック端子と書き込み許可端子を備えます。`);
    pin(`${id}.d`,dx,y,bits);
    if(['A','B','R'].includes(id))pin(`${id}.en`,x+466,y);
    const side=['A','B','CF'].includes(id)?'right':'left';
    pin(`${id}.clk`,side==='right'?x+width:x,y+height/2,1,'input','y',side);
    const leftOutput=['A','B'].includes(id);
    pin(`${id}.q`,qx,leftOutput?y+height/2-(bits-1)*BIT_PITCH/2:y+height,bits,
      'output',leftOutput?'y':'x',leftOutput?'left':'bottom');
  }
  // Carry data and clock enter from below; Q faces the decoder directly.
  pin('CF.d',618,174,1,'input','x','bottom');pin('CF.q',724,80,1,'output','y','right');
  pin('CF.clk',668,174,1,'input','x','bottom');
  mod('CLOCK','CLOCK',610,240,80,40,'各DFFへクロックを分配。周囲の折り返し配線で長さを揃えて同時に取り込みます。');
  pin('CLOCK.CF',668,240,1,'output');
  pin('CLOCK.A',610,250,1,'output','y','left');
  pin('CLOCK.B',610,270,1,'output','y','left');
  pin('CLOCK.PC',646,280,1,'output');
  pin('CLOCK.R',684,280,1,'output');
  // Lower the right-hand group together, with a tighter PC / OUT gap.
  // OUTPUT retains its alignment with the bottom of register B.
  const rightDrop=16,outGapReduction=12;
  for(const id of ['CF','CLOCK','DEC','NEXT','PC','R']){
    const dy=rightDrop-(id==='R'?outGapReduction:0);
    modules.find(m=>m.id===id).y+=dy;
    for(const p of Object.values(ports))if(p.module===id)p.y+=dy;
  }
  // Separate folding bays above, left of, and below CLOCK. Each route leaves
  // its bay before joining the narrow register lanes; no other wire crosses
  // a fold. Timing still comes exclusively from these visible wire lengths.
  const clockRoutes={
    CF:[[668,230+rightDrop],[668,ports['CF.clk'].y]],
    A:[[602,250+rightDrop],[556,250+rightDrop],[556,511],[552,511]],
    B:[[559,270+rightDrop],[559,663],[552,663]],
    PC:[[646,282+rightDrop],[567,282+rightDrop],[567,ports['PC.clk'].y],[574,ports['PC.clk'].y]],
    R:[[684,286+rightDrop],[652,286+rightDrop],[652,314+rightDrop],[570,314+rightDrop],[570,ports['R.clk'].y],[574,ports['R.clk'].y]],
  };
  const length=points=>points.slice(1).reduce((sum,p,i)=>sum+Math.hypot(p[0]-points[i][0],p[1]-points[i][1]),0);
  const clockLength=id=>length([point(ports[`CLOCK.${id}`],0),...clockRoutes[id]]);
  const commonLength=Math.max(...Object.keys(clockRoutes).map(clockLength));
  definition.clockFolds={};
  for(const id of ['CF','A','PC','R']) {
    const depth=(commonLength-clockLength(id))/8,[x,y]=clockRoutes[id][0],folds=[];
    for(let i=0;i<4;i++) {
      if(id==='CF')folds.push([x,y-i*8],[x-depth,y-i*8],[x-depth,y-i*8-4],[x,y-i*8-4]);
      else {
        const direction=id==='A'?-1:1;
        folds.push([x-i*8,y],[x-i*8,y+direction*depth],[x-i*8-4,y+direction*depth],[x-i*8-4,y]);
      }
    }
    definition.clockFolds[id]=folds;
    clockRoutes[id].splice(0,1,...folds);
  }
  for(const [id,route] of Object.entries(clockRoutes))wire(`CLOCK.${id}`,`${id}.clk`,()=>route.slice(0,-1));
  mod('OUT','OUTPUT · 4 bit',874,666,220,65,'OUTレジスタからの4 bit出力。');
  pin('OUT.data',990,666,4);

  wire('IN.q','MUX.input');
  wire('ROM.op','DEC.op',(_,a,b)=>[[b[0],a[1]]]);
  wire('ROM.im','ALU.im',(i,a,b)=>[[530+i*2.5,a[1]],[530+i*2.5,b[1]]]);
  // Give SEL its own lanes: left of carry D and well clear of EN A on the right.
  wire('DEC.sel','MUX.sel',(i,a,b)=>[[730+i*4,a[1]],[730+i*4,186+rightDrop+i*2.5],[542+i*2.5,186+rightDrop+i*2.5],[542+i*2.5,b[1]]]);
  wire('DEC.enA','A.en',(_,a,b)=>[[a[0],a[1]+5],[742,a[1]+5],[742,330+rightDrop],[550,330+rightDrop],[550,436],[b[0],436]]);
  // Keep EN B centered between A's right edge (552) and PC's left edge (574).
  wire('DEC.enB','B.en',(_,a,b)=>[[a[0],a[1]+8],[748,a[1]+8],[748,334+rightDrop],[563,334+rightDrop],[563,592],[b[0],592]]);
  wire('DEC.enR','R.en',(_,a,b)=>[[a[0],a[1]+11],[1103,a[1]+11],[1103,b[1]-3],[b[0],b[1]-3]]);
  wire('DEC.jump','NEXT.jump');wire('MUX.y','ALU.x');
  pin('SUM.bus',340,424,4,'junction','diagonal');
  pin('SUM.left',300,424,4,'junction','diagonal');
  pin('SUM.right',800,316+rightDrop,4,'junction','diagonal');
  wire('ALU.sum','SUM.bus');wire('SUM.bus','SUM.left');wire('SUM.bus','SUM.right',(i,a,b)=>[[532+i*2.5,a[1]],[532+i*2.5,b[1]]]);
  wire('SUM.left','A.d',(_,a,b)=>[[b[0],a[1]]]);
  wire('SUM.left','B.d',(i,a,b)=>[[31+i*1.5,a[1]],[31+i*1.5,584+i*2],[b[0],584+i*2]]);
  wire('SUM.right','R.d',(i,a,b)=>[[1110+i*2,a[1]],[1110+i*2,b[1]-11+i*2],[b[0],b[1]-11+i*2]]);
  wire('SUM.right','NEXT.result',(_,a,b)=>[[b[0],a[1]]]);
  wire('ALU.cf','CF.d',(_,a,b)=>[[548,a[1]],[548,200+rightDrop],[b[0],200+rightDrop]]);
  wire('NEXT.y','PC.d');
  wire('A.q','MUX.a',(i,a,b)=>[[8+i*2.5,a[1]],[8+i*2.5,b[1]]]);
  wire('B.q','MUX.b',(i,a,b)=>[[20+i*2.5,a[1]],[20+i*2.5,b[1]]]);
  pin('PC.bus',1090,258+rightDrop,4,'junction','diagonal');
  wire('PC.q','PC.bus',(i,a,b)=>[[a[0],a[1]+3+i*2.5],[b[0],a[1]+3+i*2.5]]);
  wire('PC.bus','ROM.addr',(_,a,b)=>[[a[0],b[1]]]);wire('PC.bus','NEXT.pc',(_,a,b)=>[[a[0],b[1]]]);
  wire('CF.q','DEC.cf');
  wire('R.q','OUT.data');
export default {definition,point};
