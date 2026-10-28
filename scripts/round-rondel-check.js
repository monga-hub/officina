import assert from 'node:assert/strict';
import fs from 'node:fs';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { createServer } from 'vite';
import { gameConfig, parseConfig, validate, playableConfig } from '../src/lab/config.js';
import { initGame, applyCommand, legalCommands, scorePlayer } from '../src/game/engine.js';
import { WELFARE_POLICIES } from '../src/game/welfare-rondel.js';
import { initRoundRondel, roundRondelCommands, applyRoundRondel } from '../src/game/round-rondel.js';
import { gameSession, saveGame, loadGame } from '../src/lab/saved-game.js';
const preset=JSON.parse(fs.readFileSync(new URL('../src/lab/latest-playtest.json',import.meta.url),'utf8'));
// Preserve coverage of the previous six-position saved-game rules.
delete preset.roundRondel.startingPolicy;delete preset.roundRondel.extraStepCost;delete preset.roundRondel.mandatoryMove;preset.roundRondel.freeEntry=true;
validate(preset);assert.deepEqual(parseConfig(JSON.stringify(preset)),preset);
assert.throws(()=>validate({...preset,players:2}),/3 giocatori/);
assert.throws(()=>validate({...preset,turns:32}),/28 turni/);
assert.equal(playableConfig(preset,1,'study').aiRollout.depth,6);
assert.equal(playableConfig(preset,1,'rapid').aiRollout.depth,2);
const config=gameConfig(preset);let state=initGame(config),first,second;
while(!state.gameOver){
 const legal=legalCommands(state);
 if(state.phase==='roundRondel'){
  if(state.roundRondel.active.index===0)first??=structuredClone(state);else second??=structuredClone(state);
  const before=JSON.stringify(state),p=state.players[state.current];
  const cmd=legal.find(c=>c.type==='advanceRoundRondel');
  const next=applyCommand(state,cmd||legal[0]);assert.equal(JSON.stringify(state),before);
  assert.equal(next.players[p.id].coins,p.coins);assert.equal(next.players[p.id].welfareTokens,p.welfareTokens);
  assert.equal(next.welfareBank,state.welfareBank);state=next;
 }else state=applyCommand(state,legal.find(c=>c.type==='pass'||c.type==='endTurn'||c.type==='skipWelfareToken')||legal[0]);
}
assert.ok(first&&second);assert.equal(first.turn,10);assert.equal(second.turn,19);assert.equal(state.turn,28);assert.deepEqual(state.roundRondel.completed,[0,1]);
const zero=structuredClone(first);zero.players[zero.current].coins=0;
assert.equal(legalCommands(zero).filter(c=>c.type==='advanceRoundRondel').length,6);
for(let position=0;position<6;position++){
 const fixture=structuredClone(zero);fixture.players[fixture.current].welfarePosition=position;
 const commands=roundRondelCommands(fixture);assert.equal(commands.length,4);assert.ok(commands.every(c=>c.type==='keepRoundRondel'||c.steps<=3));
}
const map=new Map(),storage={getItem:k=>map.get(k)??null,setItem:(k,v)=>map.set(k,v)};
for(const snapshot of [first,second]){
 saveGame(config,{state:snapshot,history:[initGame(config)],paused:true},storage);
 const saved=loadGame(storage),restored=gameSession(saved.config,saved);
 assert.deepEqual(JSON.parse(JSON.stringify(restored.state)),JSON.parse(JSON.stringify(snapshot)));assert.deepEqual(legalCommands(restored.state),legalCommands(snapshot));
}
for(const p of state.players){p.coins=29;assert.equal(scorePlayer(state,p).pvCoins,2);}
const server=await createServer({server:{middlewareMode:true,hmr:false,ws:false},appType:'custom'});
try{
 const {default:Choice}=await server.ssrLoadModule('/src/components/RoundRondelChoice.jsx');
 const human=structuredClone(zero);human.players[human.current].isAI=false;
 const html=renderToStaticMarkup(React.createElement(Choice,{state:human,player:human.players[human.current],legal:legalCommands(human),dispatch(){}}));
 for(const name of ['Formazione','Cooperazione','Innovazione','Affidabilità','Integrazione','Mutuo soccorso'])assert.ok(html.includes(name));
 for(const policy of WELFARE_POLICIES)assert.ok(html.includes(policy.description));
 assert.ok(html.includes('Primo ingresso libero'));assert.ok(html.includes('Gratis'));
 const remaining=structuredClone(human);remaining.players[remaining.current].welfarePosition=0;
 const stay=renderToStaticMarkup(React.createElement(Choice,{state:remaining,player:remaining.players[remaining.current],legal:[{type:'keepRoundRondel'}],dispatch(){}}));
 assert.ok(stay.includes(WELFARE_POLICIES[0].description));
 const {default:Rondel}=await server.ssrLoadModule('/src/components/WelfareRondel.jsx');
 const compact=renderToStaticMarkup(React.createElement(Rondel,{state:human,player:human.players[human.current]}));
 assert.ok(compact.includes('Cooperazione'));assert.ok(!compact.includes('Produci con almeno due nazionalità'));assert.ok(!compact.includes('Ogni operaio assunto'));
 const {default:Setup}=await server.ssrLoadModule('/src/lab/PlaySetup.jsx');
 assert.ok(renderToStaticMarkup(React.createElement(Setup,{c:preset,set(){},onStart(){}})).includes('Gioca l’ultima versione testata'));
 const {machineText}=await server.ssrLoadModule('/src/lab/cards.js');
 assert.match(machineText(preset.workers.find(w=>w.effect.continuity)),/ogni riga raggiunta e libera/);
}finally{await server.close();}
console.log('OK: free round policies, first entry, 3-step limit, checkpoints 9/18, 28 normal turns, config/save/resume, coin PV and human choices.');
