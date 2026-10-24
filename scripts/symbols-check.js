import assert from 'node:assert/strict';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { createServer as createHttpServer } from 'node:http';
import { defaults } from '../src/lab/config.js';
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:{server:createHttpServer()},watch:null},optimizeDeps:{noDiscovery:true,entries:[]},appType:'custom'});
try {
  const {Amount,MachineEffect,Development}=await server.ssrLoadModule('/src/lab/GameSymbols.jsx');
  const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
  assert.match(render(Amount,{kind:'coin',value:0}),/aria-label="0 marchi"/);
  assert.match(render(Amount,{kind:'pv',value:15}),/class="amount-token amount-pv"/);
  assert.match(render(Amount,{kind:'pv',value:15}),/>15<\/span>/);
  assert.match(render(Development,{value:4}),/sviluppo \+4/);
  const cards=defaults().workers;
  for(const worker of cards){const html=render(MachineEffect,{worker});assert.ok(!/undefined|NaN/.test(html),worker.id);}
  const conversion={sector:'Chimica',effect:{verbo:'scambia',f1:{q:2,tipo:'risorsa',settore:'scelta'},f2:{q:3,tipo:'moneta'}}};
  const html=render(MachineEffect,{worker:conversion});
  assert.match(html,/2 risorse a scelta → 3 marchi/);
  assert.ok(html.indexOf('amount-choice')<html.indexOf('amount-coin'),'Resource payment must precede the coin reward');
  const local=render(MachineEffect,{worker:{sector:'Chimica',effect:{verbo:'prendi',f1:{q:2,tipo:'risorsa',settore:'carta'}}}});
  assert.match(local,/resource-Coloranti/);
  console.log('OK: symbol quantities, free entry, PV, every current machine, choice conversions and card-sector resources.');
} finally { await server.close(); }
