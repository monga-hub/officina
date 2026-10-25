import assert from 'node:assert/strict';
import { defaults, gameConfig, parseConfig } from '../src/lab/config.js';
import { initGame, applyCommand, legalCommands, WORKER_BY_ID } from '../src/game/engine.js';
import { activeTrackEnd } from '../src/game/data.js';
import { rowPressureState } from '../src/game/row-pressure.js';
import { productionPreview } from '../src/components/production-choices.js';
import { runGame, textReport } from '../src/lab/run.js';
import { fingerprint } from '../src/lab/study.js';
import { saveGame, loadGame, gameSession } from '../src/lab/saved-game.js';
const c=defaults();c.productionThresholds=[2,6,10,14];c.milestoneResource=true;c.machineImmediate=true;c.simulation.ai='greedy';
const config=gameConfig(c);
assert.equal(initGame(config).sottoInstantEffect,true);
const legacy=defaults();delete legacy.productionThresholds;delete legacy.milestoneResource;delete legacy.machineImmediate;
assert.deepEqual(parseConfig(JSON.stringify(legacy)),defaults());
assert.deepEqual(parseConfig(JSON.stringify(c)),c);
assert.throws(()=>gameConfig({...c,productionThresholds:[2,5,4,14]}));
assert.equal(fingerprint(c),fingerprint({...c,name:c.name}));
assert.notEqual(fingerprint(c),fingerprint({...c,machineImmediate:false}));
assert.equal(activeTrackEnd(5,0,c.trackModel,true,c.productionThresholds),4);
assert.equal(activeTrackEnd(6,0,c.trackModel,true,c.productionThresholds),8);
assert.equal(activeTrackEnd(6,3,c.trackModel,true,c.productionThresholds),4);
function offer(predicate,side,position=1,tension=0) {
  const state=initGame(config),p=state.players[0],d=p.depts.terziario;
  state.phase='action';p.node='Tessile';p.coins=50;d.prod=position;d.tension=tension;
  const w=Object.values(WORKER_BY_ID).find(w=>w.sector==='Tessile'&&predicate(w));
  assert.ok(w);const bank=state.nodeBanks.Tessile[0];state.banks[bank]=[w.id];
  const command=legalCommands(state).find(cmd=>cmd.type==='hire'&&cmd.cardId===w.id&&cmd.side===side&&cmd.role==='terziario');
  assert.ok(command);return {state,command,w};
}
// An advance from 5 to 8 crosses the unlock at 6 once, even under fully covering tension.
let {state,command}=offer(w=>w.v===3,'sopra',5,4);
let next=applyCommand(state,command);
assert.equal(next.players[0].depts.terziario.prod,8);
assert.equal(next.players[0].resources.Tessuti-state.players[0].resources.Tessuti,1);
assert.equal(rowPressureState(next,next.players[0].depts.terziario).developed,2);
assert.equal(rowPressureState(next,next.players[0].depts.terziario).available,0);
// Crossing two milestones in one hire pays both. Stopping before one pays nothing.
({state,command}=offer(w=>w.v===4,'sopra',1));
state.rowEconomy.productionThresholds=[2,5,10,14];next=applyCommand(state,command);
assert.equal(next.players[0].resources.Tessuti-state.players[0].resources.Tessuti,2);
({state,command}=offer(w=>w.v===3,'sopra',2));next=applyCommand(state,command);
assert.equal(next.players[0].resources.Tessuti-state.players[0].resources.Tessuti,0);
// A second tension machine pays only its own immediate reward, then both work in production.
({state,command}=offer(w=>w.effect.verbo==='perOgni','sotto',6,3));
const first=Object.values(WORKER_BY_ID).find(w=>w.id!==command.cardId&&w.effect.verbo==='perOgni');
state.players[0].depts.terziario.sotto=[first.id];
state.players[0].depts.terziario.sopra=[Object.values(WORKER_BY_ID).find(w=>w.sector==='Tessile').id];
const frozen=structuredClone(state);next=applyCommand(state,command);
assert.equal(next.players[0].coins-state.players[0].coins,3-WORKER_BY_ID[command.cardId].v);
assert.equal(next.players[0].depts.terziario.sotto.length,2);assert.deepEqual(state,frozen);
next.phase='action';next.current=0;next.players[0].node='Tessile';
assert.equal(productionPreview(next,{type:'activate',sector:'Tessile',intensity:1}).coins,6);
// Conversion installation opens a real optional choice; it never grants its output for free.
({state,command}=offer(w=>w.effect.verbo==='scambia','sotto'));
state.players[0].resources={Tessuti:2,Acciaio:0,Coloranti:0};next=applyCommand(state,command);
assert.equal(next.pending.type,'effect');assert.equal(next.pending.cardId,command.cardId);
assert.deepEqual(next.players[0].resources,state.players[0].resources);
const choice=legalCommands(next).find(cmd=>cmd.use);assert.ok(choice);
const used=applyCommand(next,choice);assert.notDeepEqual(used.players[0].resources,next.players[0].resources);
const skipped=applyCommand(next,{type:'resolveEffect',use:false});assert.deepEqual(skipped.players[0].resources,next.players[0].resources);
// Immediate rewards and thresholds survive save, reload and undo.
let stored;saveGame(config,{state:next,history:[state],paused:true},{setItem:(k,v)=>stored=v});
const restored=gameSession(config,loadGame({getItem:()=>stored}));
assert.deepEqual(restored.state.rowEconomy.productionThresholds,c.productionThresholds);assert.equal(restored.state.sottoInstantEffect,true);assert.equal(restored.history[0].sottoInstantEffect,true);
// Completed games: replay, balanced finances, raw outputs and Markdown all agree, across all player counts.
for(const players of [2,3,4]) {
  const editor={...c,players},cfg=gameConfig(editor),g=await runGame(cfg);
  assert.ok(g.finalState.gameOver);assert.equal(g.study.verified.money,players);assert.equal(g.study.verified.resources,players);
  let replay=initGame(cfg);for(const cmd of g.commands)replay=applyCommand(replay,cmd);
  assert.deepEqual(replay,g.finalState);
  const ms=g.study.machines,ps=g.finalState.players;
  assert.equal(ms.filter(m=>m.kind==='tensione').reduce((n,m)=>n+m.immediate+m.recurring,0),ps.reduce((n,p)=>n+p.coinsGainedBy.lavTensione,0));
  assert.equal(ms.filter(m=>m.kind==='fisso').reduce((n,m)=>n+m.immediate+m.recurring,0),ps.reduce((n,p)=>n+p.coinsGainedBy.lavFisso,0));
  const report=textReport(editor,[g],'Parziale');assert.ok(report.startsWith('# OFFICINA'));assert.ok(report.includes('Configurazione completa'));assert.ok(!report.includes('NaN'));assert.ok(!report.includes('undefined'));
}
console.log('OK: optional milestones, one-time rewards, tension, second machine, conversion choices, save/undo, 2/3/4-player replays, exact per-machine income and Markdown reports.');

// Large-contract preset changes reach the engine and migrate once without overwriting later edits.
const reduced=defaults();assert.ok(reduced.contracts.large.every(card=>card.pv[0]===13));
assert.ok(reduced.contracts.small.every(card=>card.pv[0]===5));assert.ok(reduced.contracts.medium.every(card=>card.pv[0]===9));
const former=structuredClone(reduced);former.presetRevision=1;former.contracts.large.forEach(card=>card.pv[0]=15);former.contracts.large[0].pv[0]=12;
const migrated=parseConfig(JSON.stringify(former));assert.equal(migrated.contracts.large[0].pv[0],12);assert.ok(migrated.contracts.large.slice(1).every(card=>card.pv[0]===13));
assert.equal(former.contracts.large[1].pv[0],15);
const edited=structuredClone(migrated);edited.contracts.large[1].pv[0]=15;assert.deepEqual(parseConfig(JSON.stringify(edited)),edited);
const delivery=initGame(gameConfig(reduced));delivery.phase='borsa';delivery.players[0].node='Borsa';
for(const d of Object.values(delivery.players[0].depts))d.prod=16;
for(const key of Object.keys(delivery.players[0].resources))delivery.players[0].resources[key]=20;
const large=legalCommands(delivery).find(cmd=>cmd.type==='completeContract'&&cmd.size==='large');assert.ok(large);
assert.equal(applyCommand(delivery,large).players[0].contractsWon.at(-1).pv,13);
console.log('OK: large contracts award 13 PV, small/medium unchanged, old defaults migrate once and custom values survive.');
