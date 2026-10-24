import assert from 'node:assert/strict';
import { defaults, playableConfig } from '../src/lab/config.js';
import { initGame, applyCommand, legalCommands, WORKER_BY_ID } from '../src/game/engine.js';
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
console.log('OK: automatic game saves restore rules, registry, decks, choices, undo, pause and results; invalid saves and write failures preserve stored data.');
