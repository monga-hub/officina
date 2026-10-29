import assert from 'node:assert/strict';
import {mainDefaults,loadMainConfig,validateMainConfig,defaults,parseConfig,gameConfig,STORAGE_KEY,PREVIOUS_STORAGE_KEY} from '../src/lab/config.js';
import {initGame,applyCommand,legalCommands} from '../src/game/engine.js';
import {beginRoundRondel,roundRondelCommands,roundRondelCost} from '../src/game/round-rondel.js';
import {DEFAULT_ROUND_POLICY_ORDER,movePolicy,welfareDisplayPolicies,welfarePolicies,welfarePolicy} from '../src/game/welfare-rondel.js';
import {gameSession,saveGame,loadGame,GAME_SAVE_KEY} from '../src/lab/saved-game.js';
import {productionPreview} from '../src/components/production-choices.js';
const plain=x=>JSON.parse(JSON.stringify(x));
const storage=()=>{const values=new Map();return {getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v)};};
const fresh=mainDefaults();validateMainConfig(fresh);
assert.equal(fresh.players,3);assert.equal(fresh.turns,28);assert.equal(fresh.trackModel,'righe5x4');
assert.equal(fresh.roundRondel.startingPolicy,'affinity');assert.deepEqual(fresh.roundRondel.fundThresholds,{economy:3,personnel:4,production:3});
assert.deepEqual(fresh.roundRondel.bounds,[7,14,21]);assert.deepEqual(fresh.roundRondel.firstSeats,[0,1,2]);
const prior=structuredClone(fresh);prior.roundRondel.bounds=[9,18];prior.roundRondel.firstSeats=[0,1];
assert.deepEqual(parseConfig(JSON.stringify(prior)).roundRondel.bounds,[7,14,21]);
let calendar=initGame(gameConfig(fresh));const deadlines=[];
while(!calendar.gameOver){
 const legal=legalCommands(calendar);
 if(calendar.phase==='roundRondel'&&calendar.roundRondel.active.at===0)deadlines.push([calendar.roundRondel.active.endTurn,calendar.current]);
 calendar=applyCommand(calendar,legal.find(c=>['pass','endTurn','skipWelfareToken'].includes(c.type))||legal[0]);
}
assert.deepEqual(deadlines,[[7,0],[14,1],[21,2]]);assert.equal(calendar.roundRondel.log.length,9);assert.equal(calendar.turn,28);
assert.deepEqual(calendar.roundRondel.completed,[0,1,2]);
assert.deepEqual(loadMainConfig(storage()),fresh);
const old=storage(),legacy=JSON.stringify(defaults());old.setItem(PREVIOUS_STORAGE_KEY,legacy);
assert.deepEqual(loadMainConfig(old),fresh);assert.equal(old.getItem(PREVIOUS_STORAGE_KEY),legacy,'old settings kept intact');
assert.throws(()=>validateMainConfig(defaults()),/precedente/);
const changed=mainDefaults();changed.track[2]={...changed.track[2],res:0};changed.track[3]={res:2};
changed.roundRondel.policyOrder=movePolicy(DEFAULT_ROUND_POLICY_ORDER,'formation','cooperation');
assert.deepEqual(changed.roundRondel.policyOrder,['affinity','formation','cooperation','innovation','reliability','integration','mutualAid']);
assert.deepEqual(DEFAULT_ROUND_POLICY_ORDER,['affinity','cooperation','innovation','reliability','integration','mutualAid','formation']);
assert.deepEqual(movePolicy(changed.roundRondel.policyOrder,'affinity','mutualAid'),['formation','cooperation','innovation','reliability','integration','mutualAid','affinity']);
const stored=storage();stored.setItem(STORAGE_KEY,JSON.stringify(changed));assert.deepEqual(loadMainConfig(stored),changed);
old.setItem(PREVIOUS_STORAGE_KEY,JSON.stringify(changed));assert.deepEqual(loadMainConfig(old),changed,'keep custom settings already using the main rules');
assert.deepEqual(parseConfig(JSON.stringify(changed)),changed);
for(const source of DEFAULT_ROUND_POLICY_ORDER)for(const target of DEFAULT_ROUND_POLICY_ORDER){
 const c=mainDefaults();c.roundRondel.policyOrder=movePolicy(DEFAULT_ROUND_POLICY_ORDER,source,target);
 const state=initGame(gameConfig(c));state.turn=8;beginRoundRondel(state,7);
 const available=roundRondelCommands(state),start=c.roundRondel.policyOrder.indexOf('affinity');
 assert.equal(available.length,6);
 for(const command of available)assert.equal(welfarePolicies(state)[command.position].id,c.roundRondel.policyOrder[(start+command.steps)%7]);
 state.players[state.current].coins=0;assert.deepEqual(roundRondelCommands(state).map(c=>c.steps),[1,2,3]);
}
const snapshot=structuredClone(changed),human=gameConfig(changed,{humans:1}),sim=gameConfig(changed);
assert.deepEqual(human.tracks,sim.tracks);assert.deepEqual(human.roundRondel,sim.roundRondel);assert.deepEqual(human.aiRollout,sim.aiRollout);
assert.deepEqual(changed,snapshot);assert.deepEqual(mainDefaults(),fresh,'starting another match must not reload the preset over edits');
const production=initGame(human),p=production.players[0];p.node='Tessile';p.depts.terziario.prod=3;p.depts.terziario.sopra=[human.workers.find(w=>w.sector==='Tessile').id];production.phase='action';
const activate=legalCommands(production).find(c=>c.type==='activate'&&!c.welfareToken);assert.ok(activate);
const produced=applyCommand(production,activate);assert.equal(produced.players[0].resources.Tessuti-p.resources.Tessuti,2,'moved resource changes the actual production');
const original=initGame(gameConfig(fresh));assert.equal(original.tracks.terziario[2].res,1);assert.equal(original.tracks.terziario[3],null);
// Screenshot regression: 8 textiles + 2 steel must not discard the next production.
const warehouse=initGame(gameConfig(fresh)),owner=warehouse.players[0];
warehouse.phase='action';owner.node='Tessile';owner.resources={Tessuti:8,Acciaio:2,Coloranti:0};
Object.assign(owner.depts.terziario,{prod:15,tension:0,sopra:[human.workers.find(w=>w.sector==='Tessile').id]});
const produce=legalCommands(warehouse).find(c=>c.type==='activate'&&!c.welfareToken);
assert.equal(productionPreview(warehouse,produce).resources.Tessuti,4);
const income=applyCommand(warehouse,produce).players[0];
assert.equal(income.resources.Tessuti,12);assert.equal(income.resources.Acciaio,2);assert.equal(income.resCapLost,0);
const cappedSave={version:1,savedAt:new Date().toISOString(),config:gameConfig(fresh),state:structuredClone(warehouse),history:[structuredClone(warehouse)],paused:true};
for(const rules of [cappedSave.config,cappedSave.state,...cappedSave.history]){
 rules.borsaFabbriche.resourceCap.enabled=true;
 for(const player of rules.players)if(player.resCap)player.resCap.enabled=true;
}
const capStore=storage(),oldSave=JSON.stringify(cappedSave);capStore.setItem(GAME_SAVE_KEY,oldSave);
const restored=loadGame(capStore);assert.equal(capStore.getItem(GAME_SAVE_KEY),oldSave,'Loading preserves the original stored data until the next save');
assert.equal(restored.config.borsaFabbriche.resourceCap.enabled,false);
for(const state of [restored.state,...restored.history]){
 assert.ok(state.players.every(p=>!p.resCap.enabled));
 assert.equal(productionPreview(state,produce).resources.Tessuti,4,'Resumed and undo states have unlimited storage');
 assert.deepEqual(state.players[0].resources,owner.resources,'Migration preserves existing resources');
}
let round=initGame(human);round.turn=8;assert.ok(round.players.every(p=>welfarePolicy(round,p).id==='affinity'));beginRoundRondel(round,7);
assert.deepEqual(welfareDisplayPolicies(round).map(p=>p.id),changed.roundRondel.policyOrder);
const commands=roundRondelCommands(round);assert.equal(commands[0].steps,1);assert.equal(welfarePolicies(round)[commands[0].position].id,'formation');
for(const c of commands){assert.equal(roundRondelCost(round.roundRondel,c.steps),Math.max(0,c.steps-3));}
round=applyCommand(round,commands[0]);assert.equal(welfarePolicy(round,round.players[0]).id,'formation');
const session={...gameSession(human),state:round,history:[initGame(human)],paused:true};
saveGame(human,session,stored);const saved=loadGame(stored);
assert.deepEqual(plain(saved.state),plain(round));assert.deepEqual(saved.config.roundRondel.policyOrder,changed.roundRondel.policyOrder);
assert.deepEqual(saved.history[0].roundRondel.policyOrder,changed.roundRondel.policyOrder);
for(const order of [[],['affinity'],[...DEFAULT_ROUND_POLICY_ORDER.slice(0,-1),'affinity'],[...DEFAULT_ROUND_POLICY_ORDER.slice(0,-1),'unknown']]){
 const invalid=mainDefaults();invalid.roundRondel.policyOrder=order;assert.throws(()=>gameConfig(invalid),/ordine/);
 const config=gameConfig(fresh);config.roundRondel.policyOrder=order;assert.throws(()=>initGame(config),/policy order/);
}
console.log('OK: single main preset, preserved editor settings and old data, identical table/simulation rules, moved-resource production, reordered legal moves/costs, stable starting Affinity, save/resume/undo and invalid-order rejection.');
