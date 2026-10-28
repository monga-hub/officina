import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {createServer} from 'vite';
import {gameConfig,parseConfig,validate} from '../src/lab/config.js';
import {initGame,scorePlayer} from '../src/game/engine.js';
import {evaluate} from '../src/game/ai.js';
import {saveGame,loadGame,gameSession} from '../src/lab/saved-game.js';
const c=JSON.parse(fs.readFileSync(new URL('../src/lab/latest-playtest.json',import.meta.url)));
validate(c);assert.deepEqual(parseConfig(JSON.stringify(c)),c);
assert.throws(()=>validate({...c,finalResourcePV:'yes'}));
const config=gameConfig(c),s=initGame(config),p=s.players[0];
assert.equal(s.finalResourcePV,true);assert.equal(s.rules.resPerPV,3);assert.equal(s.rules.coinsPerPV,10);
p.coins=29;p.contractsWon=[{pv:9}];
for(const [resources,pv] of [[[0,0,0],0],[[2,2,2],2],[[3,0,0],0],[[5,4,0],0],[[5,4,2],2],[[6,3,8],3],[[10,10,10],10]]){
 p.resources=Object.fromEntries(['Tessuti','Acciaio','Coloranti'].map((r,i)=>[r,resources[i]]));
 const score=scorePlayer(s,p);assert.equal(score.pvResources,pv);assert.equal(score.total,9+2+pv);
 for(const key of ['pvWelfare','pvObjectives','pvTrack','pvStrikes','pvBorsa','pvFactoryMajority','pvDeptComplete','pvRace'])assert.equal(score[key],0);
 assert.equal(scorePlayer({...s,finalResourcePV:false},p).pvResources,0);
}
p.resources={Tessuti:1,Acciaio:1,Coloranti:1};
const without=evaluate({...s,finalResourcePV:false},0);assert.ok(Math.abs(evaluate(s,0)-without-10)<1e-9,'AI recognizes an earned resource point without changing other weights');
const done={...s,gameOver:true,phase:'done'};
const terminal=evaluate(done,0);p.resources.Tessuti=2;assert.equal(evaluate(done,0),terminal,'Extra copies of only one type do not add a point');p.resources.Acciaio=2;p.resources.Coloranti=2;assert.ok(Math.abs(evaluate(done,0)-terminal-10)<1e-9,'Final AI value uses exact score');
const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
saveGame(config,{state:done,history:[initGame(config)],paused:true},storage);
const saved=loadGame(storage),resumed=gameSession(saved.config,saved).state;
assert.equal(resumed.finalResourcePV,true);assert.equal(resumed.rules.resPerPV,3);assert.equal(scorePlayer(resumed,resumed.players[0]).pvResources,2);
const legacy=structuredClone(config);delete legacy.finalResourcePV;
const old=initGame(legacy);old.players[0].resources={Tessuti:9,Acciaio:9,Coloranti:9};assert.equal(scorePlayer(old,old.players[0]).pvResources,0);
const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try{
 const {default:LiveGame}=await server.ssrLoadModule('/src/lab/LiveGame.jsx');
 const html=renderToStaticMarkup(React.createElement(LiveGame,{config,resume:saved,onSaved(){},onClose(){}}));
 assert.ok(html.includes('PV commesse'));assert.ok(html.includes('PV marchi'));assert.ok(html.includes('PV risorse'));
 fs.writeFileSync('/private/tmp/officina-resource-score-preview.html',html);
}finally{await server.close();}
console.log('OK: final resource PV for complete sets of three different types, separate coin/contract totals, AI intermediate/terminal values, save/resume, legacy games and final score breakdown.');
