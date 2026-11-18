import assert from 'node:assert/strict';
import {mainDefaults,gameConfig,parseConfig,loadMainConfig,STORAGE_KEY,PREVIOUS_STORAGE_KEY} from '../src/lab/config.js';
import {initGame,applyCommand,legalCommands,scorePlayer,WORKER_BY_ID} from '../src/game/engine.js';
import {evaluate} from '../src/game/ai.js';
import {initRoundObjectives,settleRoundObjectives,CARDS} from '../src/game/round-objectives.js';
import {gameSession,saveGame,loadGame,GAME_SAVE_KEY} from '../src/lab/saved-game.js';
const storage=()=>{const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
const editor={...mainDefaults(),roundObjectives:true,finalCoinPV:true,finalResourcePV:true};
for(const key of [STORAGE_KEY,PREVIOUS_STORAGE_KEY]){
 const store=storage(),raw=JSON.stringify(editor);store.setItem(key,raw);
 const loaded=loadMainConfig(store);assert.equal(loaded.roundObjectives,false);
 assert.equal(loaded.finalCoinPV,true);assert.equal(loaded.finalResourcePV,true);
 assert.equal(store.getItem(key),raw,'Reading preferences must not rewrite user storage');
}
assert.equal(parseConfig(JSON.stringify(editor)).roundObjectives,false);
const config=gameConfig(editor);assert.equal(config.roundObjectives,undefined);
assert.equal(initGame({...config,roundObjectives:true}).roundObjectives,undefined,'Legacy flag cannot enable new requests');

// Reconstruct an actual legacy save, including an awarded round and an undo state.
const oldConfig={...config,roundObjectives:true},legacy=initGame(config);
legacy.roundObjectives=initRoundObjectives(legacy.nPlayers,config.seed,[7,14,21,28],true);
legacy.roundObjectives.deck=['bilancio','riserva','finanziamento',...CARDS.map(c=>c.id).filter(id=>!['bilancio','riserva','finanziamento'].includes(id))];
legacy.roundObjectives.active=legacy.roundObjectives.deck.slice(0,3);
legacy.players[0].coins=60;legacy.players[0].resources={Tessuti:2,Acciaio:3,Coloranti:4};
legacy.players[0].contractsWon=[{id:'already-delivered',pv:5}];
const history=structuredClone(legacy);
legacy.turn=7;settleRoundObjectives(legacy,7,WORKER_BY_ID);legacy.turn=8;
assert.ok(legacy.roundObjectives.banked[0]>0);
const before=structuredClone(legacy),store=storage();
const raw=JSON.stringify({version:1,savedAt:'2026-11-18T08:00:00Z',config:oldConfig,state:legacy,history:[history],paused:true});
store.setItem(GAME_SAVE_KEY,raw);
const migrated=loadGame(store);
assert.equal(store.getItem(GAME_SAVE_KEY),raw,'Loading keeps the original save until the next autosave');
for(const entry of [migrated.config,migrated.state,...migrated.history])assert.equal(entry.roundObjectives,undefined);
assert.deepEqual(legacy,before,'Migration must not mutate the source state');
assert.deepEqual(migrated.state.players,legacy.players);
assert.deepEqual(migrated.state.contracts,legacy.contracts);
assert.deepEqual(migrated.state.roundRondel,legacy.roundRondel,'Welfare funds and policies are preserved');
assert.equal(migrated.state.turn,8);
const score=scorePlayer(migrated.state,migrated.state.players[0]);
assert.equal(score.pvContracts,5);assert.equal(score.pvCoins,6);assert.equal(score.pvResources,2);assert.equal(score.total,13);
assert.equal(scorePlayer(legacy,legacy.players[0]).total,13,'Raw legacy banked requests no longer count either');
assert.equal(evaluate(legacy,0),evaluate({...legacy,roundObjectives:undefined},0),'AI ignores legacy request rewards');
const session=gameSession(config,migrated);assert.deepEqual(session.state,migrated.state);
saveGame(migrated.config,session,store);assert.deepEqual(loadGame(store).state,migrated.state);
const undone=gameSession(config,{...migrated,state:migrated.history[0],history:[]});
assert.equal(undone.state.roundObjectives,undefined);

// Old final standings are recalculated without request points, preserving other PV.
const completed=JSON.parse(raw);completed.state.gameOver=true;completed.state.phase='done';
completed.state.results=[{playerId:0,total:999,pvRoundCards:999}];store.setItem(GAME_SAVE_KEY,JSON.stringify(completed));
const final=loadGame(store);assert.equal(final.state.results.find(p=>p.playerId===0).total,13);
assert.ok(final.state.results.every(p=>p.pvRoundCards===undefined));

// The former request deadline still runs the rondel, but never awards requests.
let boundary=initGame(config);Object.assign(boundary,{turn:7,current:2,roundTurns:2,roundStart:0,phase:'action'});
boundary.players[2].node='Servizi';boundary.roundObjectives=structuredClone(history.roundObjectives);
const invest=legalCommands(boundary).find(c=>c.type==='investWelfare'&&c.count===3&&c.funds?.production===3);assert.ok(invest);
const advanced=applyCommand(boundary,invest);assert.equal(advanced.phase,'roundRondel');
assert.deepEqual(advanced.roundObjectives,boundary.roundObjectives,'No request settlement or contribution side effect');
assert.ok(!advanced.log.some(e=>e.text.startsWith('Richieste round')));

// Contract delivery still pays its PV and replaces the market card.
let city=initGame(config);city.phase='borsa';city.players[0].resources={Tessuti:20,Acciaio:20,Coloranti:20};
const deliver=legalCommands(city).find(c=>c.type==='completeContract');assert.ok(deliver);
const delivered=applyCommand(city,deliver);assert.equal(delivered.players[0].contractsWon.length,1);
assert.ok(scorePlayer(delivered,delivered.players[0]).pvContracts>0);
assert.equal(delivered.roundObjectives,undefined);
console.log('OK: requests retired from preferences, new games, legacy saves/history/final scores, AI and round triggers; contract PV, final conversions and Welfare preserved.');
