import assert from 'node:assert/strict';
import {readFileSync,existsSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {createServer as createHttpServer} from 'node:http';

const manifest=JSON.parse(readFileSync(new URL('../src/lab/assets/approved/manifest.json',import.meta.url)));
const server=await createServer({configFile:false,server:{middlewareMode:true,hmr:{server:createHttpServer()},watch:null},optimizeDeps:{noDiscovery:true,entries:[]},appType:'custom'});
const render=(component,props)=>renderToStaticMarkup(React.createElement(component,props));
try {
  const {mainDefaults,gameConfig}=await server.ssrLoadModule('/src/lab/config.js');
  const {initGame,WORKER_BY_ID}=await server.ssrLoadModule('/src/game/engine.js');
  const {STAR_EDGES}=await server.ssrLoadModule('/src/game/data.js');
  const {default:Card}=await server.ssrLoadModule('/src/lab/WorkerCard.jsx');
  const {cardArtKey}=await server.ssrLoadModule('/src/lab/cards.js');
  const {default:PlayerBoard}=await server.ssrLoadModule('/src/lab/PlayerBoard.jsx');
  const {default:StarBoard}=await server.ssrLoadModule('/src/lab/StarBoard.jsx');
  const {Amount}=await server.ssrLoadModule('/src/components/Amount.jsx');
  const {default:ResourceIcon}=await server.ssrLoadModule('/src/lab/ResourceIcon.jsx');
  const state=initGame(gameConfig(mainDefaults(),{humans:3}));
  assert.equal(manifest.revision,21);
  assert.equal(manifest.cardCount,75);
  assert.deepEqual(Object.keys(manifest.cards).sort(),mainDefaults().workers.map(w=>w.id).sort());
  for(const source of manifest.sources)assert.ok(existsSync(fileURLToPath(new URL(`../src/lab/assets/approved/${source.file}`,import.meta.url))),source.file);
  for(const [id,entry] of Object.entries(manifest.cards)) {
    const w=WORKER_BY_ID[id];
    assert.equal(entry.portrait,`portrait-${cardArtKey(w)}.jpg`,id);
    const html=render(Card,{worker:w,onInspect(){}});
    assert.match(html,new RegExp(entry.portrait.replace('.','\\.')));
    assert.match(html,new RegExp(`Valore e sviluppo: ${w.v}`));
    assert.match(html,/^<button type="button"/);
    assert.ok(manifest.nations[w.nation]&&manifest.bands[w.nation],id);
    assert.doesNotMatch(html,/undefined|NaN/);
  }
  for(const [sector,name] of [['Tessile','textile'],['Chimica','chemical'],['Metallurgica','metal']]) {
    assert.match(render(Amount,{kind:sector,value:12}),new RegExp(`resource-${name}\\.png`));
    assert.match(render(ResourceIcon,{resource:sector,department:true}),new RegExp(`approved/${name}\\.png`));
  }
  const changed={...WORKER_BY_ID[Object.keys(manifest.cards)[0]],v:8,effect:{verbo:'prendi',f1:{tipo:'moneta',q:4},continuity:true,continuityRowsPerCoin:2}};
  const custom=render(Card,{worker:changed});
  assert.match(custom,/Valore e sviluppo: 8/);
  assert.match(custom,/ogni due righe raggiunte e libere/);
  assert.doesNotMatch(custom,/printed-machine-effect/,'Custom curves must not display the standard printed multiplier');
  const player=structuredClone(state.players[0]);
  Object.values(player.depts).forEach(d=>{d.prod=12;d.tension=2;});
  const board=render(PlayerBoard,{state,player});
  assert.equal((board.match(/blocked-production/g)||[]).length,24,'Two blocked rows in each of three departments');
  assert.equal((board.match(/aria-label="Segnalino produzione"/g)||[]).length,3);
  assert.deepEqual([...board.matchAll(/aria-label="Reparto ([^"]+)"/g)].map(m=>m[1]),['Tessile','Chimica','Metallurgica']);
  assert.equal((board.match(/class="opposed-cell /g)||[]).length,60);
  for(const [model,count] of [['righe3',54],['righe4',72],['righe4corte',48]]) {
    const customBoard=render(PlayerBoard,{state:{...state,trackModel:model},player});
    assert.equal((customBoard.match(/class="opposed-cell /g)||[]).length,count,model);
  }
  const modified=structuredClone(state);modified.tracks.terziario[3].res=2;
  assert.match(render(PlayerBoard,{state:modified,player}),/2 Tessuti/,'Custom rewards remain live');
  const star=render(StarBoard,{state,dispatch(){}});
  assert.deepEqual([...star.matchAll(/data-route="([^"]+)"/g)].map(m=>m[1]),STAR_EDGES.map(e=>e.join('-')));
  assert.equal((star.match(/data-node=/g)||[]).length,6);
  const disabled=structuredClone(state);disabled.rowEconomy.welfarePoliciesEnabled.affinity=false;
  assert.equal((render(StarBoard,{state:disabled,dispatch(){}}).match(/aria-label="Giocatore /g)||[]).length,(star.match(/aria-label="Giocatore /g)||[]).length,'A disabled bonus must not erase the player markers');
  assert.equal((star.match(/data-bank=/g)||[]).length,5);
  assert.equal((star.match(/data-policy=/g)||[]).length,7);
  assert.equal((star.match(/class="board-day /g)||[]).length,28);
  assert.match(star,/main-board\.jpg/);
  console.log('OK: all 75 approved card mappings, live values, symbol shapes, player markers, custom presets and rendered star routes.');
} finally {await server.close();}
