import assert from 'node:assert/strict';
import {defaults,gameConfig,parseConfig} from '../src/lab/config.js';
import {initGame,applyCommand,WORKER_BY_ID,forkForSearch} from '../src/game/engine.js';
import {productionPreview} from '../src/components/production-choices.js';
import {rowActionPreview} from '../src/components/row-action-preview.js';
import {machineText} from '../src/lab/cards.js';
import {runGame} from '../src/lab/run.js';
import {saveGame,loadGame,gameSession} from '../src/lab/saved-game.js';
const curve=[0,4,12,24,40],c=defaults();c.machineImmediate=true;
const ids=[];c.workers=c.workers.map(w=>{if(w.effect.verbo!=='perOgni'||w.effect.f2?.conta!=='tensione')return w;ids.push(w.id);return {...w,effect:{...w.effect,tensionRewards:[...curve]}};});
assert.equal(ids.length,18);assert.deepEqual(parseConfig(JSON.stringify(c)),c);
for(const bad of [[0,4],null,[0,4,12,-1,40],[0,4,12,24,Infinity]]){
 const x=structuredClone(c);x.workers.find(w=>ids.includes(w.id)).effect.tensionRewards=bad;assert.throws(()=>gameConfig(x),/curva|Curva/);
}
const config=gameConfig(c);
for(const role of ['terziario','secondario','primario'])for(const count of [1,2])for(const tension of [0,1,2,3,4])for(const protect of [false,true]){
 const s=initGame(config),p=s.players[0],d=p.depts[role];s.phase='action';p.node=d.sector;p.welfareTokens=2;d.prod=13;d.tension=tension;d.sopra=[c.workers.find(w=>w.sector===d.sector).id];d.sotto=ids.slice(0,count);
 const cmd={type:'activate',sector:d.sector,intensity:1,...(protect?{welfareToken:true}:{})},frozen=structuredClone(s),next=applyCommand(s,cmd);
 assert.equal(next.players[0].coins-p.coins,count*curve[tension]);assert.equal(next.players[0].coinsGainedBy.lavTensione,count*curve[tension]);assert.equal(productionPreview(s,cmd).coins,count*curve[tension]);assert.equal(applyCommand(forkForSearch(s),cmd).players[0].coins,next.players[0].coins);assert.deepEqual(s,frozen);
}
const s=initGame(config),p=s.players[0],w=c.workers.find(w=>ids.includes(w.id));s.phase='action';p.node=w.sector;p.coins=30;const role=Object.keys(p.depts).find(r=>p.depts[r].sector===w.sector);p.depts[role].tension=3;s.banks[s.nodeBanks[w.sector][0]]=[w.id];p.depts[role].sotto=[ids.find(id=>id!==w.id)];
const cmd={type:'hire',bank:s.nodeBanks[w.sector][0],cardId:w.id,role,side:'sotto'},next=applyCommand(s,cmd);assert.equal(next.players[0].coins-p.coins,24-w.v);assert.equal(rowActionPreview(s,cmd).income,24,'Only the new machine pays at installation');assert.match(machineText(w),/3→24/);
let stored;saveGame(config,{state:next,history:[s],paused:true},{setItem:(k,v)=>stored=v});const restored=gameSession(config,loadGame({getItem:()=>stored}));assert.deepEqual(loadGame({getItem:()=>stored}).config.workers.find(x=>x.id===w.id).effect.tensionRewards,curve);
for(const players of [2,3,4]){
 const cfg=gameConfig({...c,players,turns:10,simulation:{...c.simulation,ai:'greedy',seed:1907}}),g=await runGame(cfg);let replay=initGame(cfg);for(const command of g.commands)replay=applyCommand(replay,command);assert.deepEqual(replay,g.finalState);assert.equal(g.study.verified.money,players);assert.equal(g.study.verified.machineIncome,players);
}
console.log('OK: curve 0/4/12/24/40, schema and round-trip, single/pair in every department, initial tension 0–4, protection, search/preview, second installation pays once, saved games and verified 2/3/4-player finance/replays.');
