import assert from 'node:assert/strict';
import { defaults, playableConfig } from '../src/lab/config.js';
import { initGame, applyCommand, legalCommands, scorePlayer, WORKER_BY_ID } from '../src/game/engine.js';
import { GAME_SAVE_KEY, SAVED_UNDO_LIMIT, gameSession, loadGame, saveGame } from '../src/lab/saved-game.js';
const data=new Map(),storage={getItem:key=>data.get(key)??null,setItem:(key,value)=>data.set(key,value)};
const plain=value=>JSON.parse(JSON.stringify(value));
const config=playableConfig(defaults(),2);
assert.equal(loadGame(storage),null);
let session=gameSession(config);
const initial=session.state;
const move=legalCommands(initial).find(c=>c.type==='move'&&c.node==='Chimica');
session={state:applyCommand(initial,move),history:[initial],paused:true};
saveGame(config,session,storage);
const firstRaw=data.get(GAME_SAVE_KEY);
// Editing another game's cards must not change the resumed game's registry or rules.
const other=structuredClone(config);other.workers[0].v=19;initGame(other);
let restored=gameSession(loadGame(storage).config,loadGame(storage));
assert.equal(WORKER_BY_ID[config.workers[0].id].v,config.workers[0].v);
assert.deepEqual(plain(restored),plain(session));
assert.deepEqual(legalCommands(restored.state),legalCommands(session.state));
const hire=legalCommands(session.state).find(c=>c.type==='hire'&&c.side==='sopra');
assert.deepEqual(plain(applyCommand(restored.state,hire)),plain(applyCommand(session.state,hire)));
// A machine decision survives a reload, including the card snapshot and resolution queue.
const pending=structuredClone(initial);
pending.phase='resolving';pending.players[0].resources={Tessuti:0,Acciaio:1,Coloranti:4};
pending.pending={type:'effect',playerId:0,cardId:'saved-machine',role:'primario',card:{id:'saved-machine',sector:'Chimica',effect:{verbo:'scambia',f1:{q:1,tipo:'risorsa',settore:'scelta'},f2:{q:1,tipo:'risorsa',settore:'scelta'}}}};
saveGame(config,{state:pending,history:[initial,session.state],paused:false},storage);
const pendingSave=loadGame(storage);
restored=gameSession(pendingSave.config,pendingSave);
assert.deepEqual(legalCommands(restored.state),legalCommands(pending));
const conversion=legalCommands(pending).find(c=>c.use&&c.give==='Chimica'&&c.take==='Tessile');
const after=applyCommand(restored.state,conversion);
assert.deepEqual(plain(after),plain(applyCommand(pending,conversion)));
assert.equal(after.pending,null);assert.equal(after.current,1);
// Undo state, pause and completed-game results also survive round trips.
const history=Array.from({length:60},()=>initial);
saveGame(config,{state:session.state,history,paused:true},storage);
assert.equal(loadGame(storage).history.length,SAVED_UNDO_LIMIT);
const undoState=loadGame(storage).history.at(-1);
saveGame(config,{state:undoState,history:[],paused:true},storage);
assert.deepEqual(plain(loadGame(storage).state),plain(initial));
const finalConfig={...config,roundLimit:1};let final=initGame(finalConfig);
while(!final.gameOver){const commands=legalCommands(final);const cmd=commands.find(c=>c.type==='pass'||c.type==='endTurn')||commands.find(c=>c.type==='move');assert.ok(cmd);final=applyCommand(final,cmd);}
saveGame(finalConfig,{state:final,history:[],paused:false},storage);
const finished=loadGame(storage);assert.ok(gameSession(finished.config,finished).state.gameOver);assert.deepEqual(finished.state.results,plain(final.results));
// Storage failures must leave the last valid record untouched, not pretend to have saved.
const previous=data.get(GAME_SAVE_KEY);
assert.throws(()=>saveGame(config,session,{...storage,setItem(){throw new Error('QuotaExceededError');}}));
assert.equal(data.get(GAME_SAVE_KEY),previous);
assert.throws(()=>loadGame({getItem(){throw new Error('SecurityError');}}));
for(const invalid of ['{broken',JSON.stringify({version:2}),JSON.stringify({version:1,config:{players:[]}})]){
 data.set(GAME_SAVE_KEY,invalid);assert.throws(()=>loadGame(storage));assert.equal(data.get(GAME_SAVE_KEY),invalid);
}
data.set(GAME_SAVE_KEY,firstRaw);assert.equal(loadGame(storage).state.phase,'action');
// A price update applies to new games, never to a saved match or its undo history.
const oldPrice=structuredClone(config);oldPrice.rowEconomy.welfareCost=9;
const oldSession=gameSession(oldPrice);oldSession.history=[structuredClone(oldSession.state)];
saveGame(oldPrice,oldSession,storage);
const oldPriceSave=loadGame(storage),oldPriceRestored=gameSession(oldPriceSave.config,oldPriceSave);
assert.equal(defaults().welfareCost,4);
assert.equal(oldPriceSave.config.rowEconomy.welfareCost,9);
assert.deepEqual(plain(oldPriceRestored),plain(oldSession));
assert.equal(oldPriceRestored.state.rowEconomy.welfareCost,9);
assert.equal(oldPriceRestored.history[0].rowEconomy.welfareCost,9);
// Existing matches and their Undo snapshots adopt only the scoring change.
const bonusConfig=structuredClone(oldPrice);delete bonusConfig.contractsOnly;
bonusConfig.raceObjectives={enabled:true,podium:[7,5,3],list:[{id:'race_same',type:'sopra_same_nation',n:3,enabled:true}]};
bonusConfig.tracks.terziario[1]={res:1,pv:8};bonusConfig.tracks.terziario[2]={pv:5};
const bonusState=initGame(bonusConfig);
bonusState.phase='borsa';bonusState.players[0].node='Borsa';bonusState.players[0].coins=100;
bonusState.racesThisVisit=1;bonusState.raceObjectives.list[0].claims=[0];
bonusState.players[1].contractsWon=[{pv:9}];
const bonusFinal=structuredClone(bonusState);bonusFinal.gameOver=true;bonusFinal.phase='done';
bonusFinal.results=bonusFinal.players.map(p=>scorePlayer(bonusFinal,p)).sort((a,b)=>b.total-a.total);
assert.equal(bonusFinal.results[0].playerId,0);
bonusFinal.log.push({turn:bonusFinal.turn,text:'FINE PARTITA. Vince il precedente primo classificato.'});
const legacySave={version:1,savedAt:new Date().toISOString(),config:bonusConfig,state:bonusFinal,history:[bonusState],paused:true};
const legacyRaw=JSON.stringify(legacySave);data.set(GAME_SAVE_KEY,legacyRaw);
const updated=loadGame(storage);
assert.equal(data.get(GAME_SAVE_KEY),legacyRaw,'Loading never overwrites the stored match');
assert.equal(updated.config.contractsOnly,true);assert.equal(updated.config.raceObjectives.enabled,false);
assert.deepEqual(updated.config.tracks.terziario[1],{res:1});assert.equal(updated.config.tracks.terziario[2],null);
for(const state of [updated.state,...updated.history]){
 assert.equal(state.contractsOnly,true);assert.equal(state.raceObjectives.enabled,false);assert.equal(state.racesThisVisit,0);
 assert.equal(state.rowEconomy.welfareCost,9);assert.equal(scorePlayer(state,state.players[0]).total,0);
 assert.equal(scorePlayer(state,state.players[1]).total,9);
 assert.deepEqual(state.players,bonusState.players);assert.deepEqual(state.banks,bonusState.banks);
 assert.equal(state.turn,bonusState.turn);assert.equal(state.current,bonusState.current);
}
assert.equal(updated.state.results[0].playerId,1);assert.equal(updated.state.results[0].total,9);
assert.ok(updated.state.log.at(-1).text.includes(`${updated.state.players[1].name} con 9 PV`));
assert.ok(legalCommands(updated.history[0]).some(c=>c.type==='borsaExit'),'Undo does not retain the old race restriction');
assert.ok(!legalCommands(updated.history[0]).some(c=>c.type==='completeRace'));
const directResume=gameSession(bonusConfig,legacySave);
assert.deepEqual(plain(directResume.state),plain(updated.state));
assert.equal(JSON.stringify(legacySave),legacyRaw,'Migration must not mutate its source');
saveGame(updated.config,directResume,storage);
assert.deepEqual(plain(loadGame(storage).state),plain(updated.state),'Migration is idempotent');
console.log('OK: automatic game saves restore rules, registry, decks, choices, undo, pause and results; invalid saves and write failures preserve stored data.');
