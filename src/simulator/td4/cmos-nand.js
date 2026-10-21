
/* Shared ideal-switch connectivity for a four-transistor CMOS NAND. */
  const topology=[
    {id:'PA',type:'p',input:'a',a:'VDD',b:'Y'},
    {id:'PB',type:'p',input:'b',a:'VDD',b:'Y'},
    {id:'NA',type:'n',input:'a',a:'Y',b:'X'},
    {id:'NB',type:'n',input:'b',a:'X',b:'GND'},
  ];
  function solve(controls) {
    const devices=topology.map(m=>({...m,control:controls[m.id],on:m.type==='p'?controls[m.id]===0:controls[m.id]===1}));
    const adjacent={VDD:[],GND:[],Y:[],X:[]};
    for(const m of devices)if(m.on){adjacent[m.a].push(m.b);adjacent[m.b].push(m.a);}
    const nets={};
    for(const start of Object.keys(adjacent)) {
      const seen=new Set(),pending=[start];
      while(pending.length){const n=pending.pop();if(seen.has(n))continue;seen.add(n);pending.push(...adjacent[n]);}
      nets[start]=seen.has('VDD')?(seen.has('GND')?'X':1):seen.has('GND')?0:'Z';
    }
    return {devices,nets};
  }
  const api={topology,solve};export default api;
