import assert from 'node:assert/strict';
import {mainDefaults,gameConfig,parseConfig,loadMainConfig,STORAGE_KEY} from '../src/lab/config.js';
import {initGame,applyCommand,legalCommands,scorePlayer,roundObjectivePotential,WORKER_BY_ID} from '../src/game/engine.js';
import {chooseTimedCommand,evaluate} from '../src/game/ai.js';
import {CARDS,objectiveDeck,initRoundObjectives,cardPoints,objectiveMetrics,settleRoundObjectives,validRoundObjectives} from '../src/game/round-objectives.js';
import {gameSession,saveGame,loadGame,GAME_SAVE_KEY} from '../src/lab/saved-game.js';
const plain=x=>JSON.parse(JSON.stringify(x)),c=mainDefaults(),cfg=gameConfig(c),storage=()=>{const m=new Map();return{getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v)};};
assert.equal(cfg.roundObjectives,true);assert.equal(CARDS.length,12);
for(let seed=0;seed<30;seed++){const deck=objectiveDeck(seed);assert.equal(new Set(deck).size,12);assert.deepEqual(deck,objectiveDeck(seed));}
assert.notDeepEqual(objectiveDeck(1907),objectiveDeck(1908));
const enabled=initGame(cfg),disabled=initGame({...cfg,roundObjectives:false});
assert.deepEqual(enabled.banks,disabled.banks);assert.deepEqual(enabled.contracts,disabled.contracts);assert.deepEqual(enabled.players,disabled.players);
const metrics={tokens:3,coins:15,nations:4,repeatedNations:2,largestGroup:3,maxProd:18,minProd:9,donations:{economy:3,personnel:2,production:2},funds:{economy:3,personnel:3,production:3},departments:[{workers:4,prod:14,nations:3,machines:2,machineKinds:['fisso','tensione'],free:true,tension:1},{workers:2,prod:9,nations:2,machines:1,machineKinds:['continuita'],free:false,tension:3},{workers:1,prod:5,nations:1,machines:0,machineKinds:[],free:true,tension:0}]};
assert.deepEqual(CARDS.map(card=>[card.id,cardPoints(card.id,metrics,0).pv]),[['internazionale',6],['affiatata',6],['cosmopoliti',4],['organico',6],['automazione',2],['specializzato',6],['equilibrata',6],['complementare',4],['benessere',2],['riserva',6],['bilancio',6],['finanziamento',4]]);
assert.equal(cardPoints('riserva',{...metrics,departments:[],tokens:4},3).pv,6);
assert.equal(cardPoints('riserva',metrics,1).pv,4);
assert.equal(cardPoints('finanziamento',{...metrics,donations:{economy:3,personnel:0,production:0}},0).pv,2);
assert.equal(cardPoints('finanziamento',{...metrics,funds:{economy:2,personnel:3,production:2}},0).pv,0);
for(let r=0;r<4;r++){assert.equal(cardPoints('complementare',metrics,r).pv,4);assert.equal(cardPoints('complementare',{...metrics,departments:[...metrics.departments,{machineKinds:['continuita'],free:true}]},r).pv,6);}
for(const [turns,bounds] of [[28,[7,14,21]],[20,[4,11,17]],[12,[]],[4,[1,2,3]]]){
 const editor={...c,turns,roundRondel:{...c.roundRondel,bounds,firstSeats:bounds.map((_,i)=>i%3)}};let s=initGame(gameConfig(editor));const deck=s.roundObjectives.deck.slice(),saved=storage(),beforeInitial=plain(s);saveGame(gameConfig(editor),{state:s,history:[],paused:true},saved);assert.deepEqual(loadGame(saved).state,plain(s));
 while(!s.gameOver){const before=plain(s),rr=JSON.stringify(s.roundObjectives),legal=legalCommands(s),cmd=legal.find(c=>['pass','endTurn','skipWelfareToken'].includes(c.type))||legal[0];const next=applyCommand(s,cmd);assert.deepEqual(plain(s),before);assert.equal(JSON.stringify(s.roundObjectives),rr);assert.ok(validRoundObjectives(next.roundObjectives,3));s=next;}
 assert.deepEqual(s.roundObjectives.completed,[...bounds,turns]);assert.deepEqual(s.roundObjectives.deck,deck);assert.deepEqual(s.roundObjectives.active,[]);
 for(const p of s.players)assert.equal(scorePlayer(s,p).pvRoundCards,s.roundObjectives.log.reduce((n,row)=>n+row.awards[p.id].pv,0));
 const locked=plain(s.roundObjectives);settleRoundObjectives(s,turns,WORKER_BY_ID);assert.deepEqual(plain(s.roundObjectives),locked);
 saveGame(gameConfig(editor),{state:s,history:[beforeInitial],paused:true},saved);const restored=loadGame(saved);assert.deepEqual(restored.state,plain(s));assert.deepEqual(restored.history[0],beforeInitial);
 const bad=JSON.parse(saved.getItem(GAME_SAVE_KEY));bad.state.roundObjectives.banked[0]++;saved.setItem(GAME_SAVE_KEY,JSON.stringify(bad));assert.throws(()=>loadGame(saved),/leggibile/);
}
// The last player's optional cure must precede settlement, and preview draws remain unknown.
let s=initGame(cfg);Object.assign(s,{turn:7,current:2,roundTurns:2,roundStart:0,phase:'action'});s.players[2].node='Servizi';s.roundObjectives.deck=['finanziamento','riserva','bilancio',...CARDS.map(c=>c.id).filter(id=>!['finanziamento','riserva','bilancio'].includes(id))];s.roundObjectives.active=s.roundObjectives.deck.slice(0,3);
const cmd=legalCommands(s).find(c=>c.type==='investWelfare'&&c.count===3&&c.funds?.production===3);assert.ok(cmd);const before=plain(s),after=applyCommand(s,cmd);assert.deepEqual(plain(s),before);assert.equal(after.roundObjectives.log[0].awards[2].cards[0].pv,2);assert.equal(after.roundObjectives.log[0].awards[2].cards[1].pv,6);assert.equal(after.phase,'roundRondel');assert.ok(after.roundObjectives.contributions.every(x=>Object.values(x).every(n=>n===0)));
const preview=applyCommand({...s,roundObjectives:{...s.roundObjectives,preview:true}},cmd);assert.deepEqual(preview.roundObjectives.active,[]);assert.deepEqual(preview.roundObjectives.banked,after.roundObjectives.banked);
s=initGame(cfg);Object.assign(s,{turn:7,current:2,roundTurns:2,phase:'action'});s.players[2].node='Tessile';s.players[2].depts.terziario.tension=1;s.players[2].welfareTokens=1;s.players[2].welfareBoughtThisTurn=0;
let ending=applyCommand(s,{type:'pass'});assert.equal(ending.pending.type,'welfareToken');assert.equal(ending.roundObjectives.log.length,0);const cure=legalCommands(ending).find(c=>c.type==='spendWelfareToken');assert.ok(cure);ending=applyCommand(ending,cure);assert.equal(ending.roundObjectives.log.length,1);
// Legacy saved matches stay without retroactive cards; editor upgrades preserve custom layouts.
const legacy=storage();saveGame({...cfg,roundObjectives:false},{state:disabled,history:[],paused:true},legacy);assert.equal(loadGame(legacy).state.roundObjectives,undefined);assert.equal(gameSession(cfg,loadGame(legacy)).state.roundObjectives,undefined);
const oldEditor=structuredClone(c);delete oldEditor.roundObjectives;oldEditor.cityIncome=8;legacy.setItem(STORAGE_KEY,JSON.stringify(oldEditor));assert.equal(loadMainConfig(legacy).roundObjectives,true);assert.equal(loadMainConfig(legacy).cityIncome,8);assert.equal(parseConfig(JSON.stringify(oldEditor)).roundObjectives,false);
assert.throws(()=>gameConfig({...c,roundRondel:{...c.roundRondel,bounds:[2,4,6,8],firstSeats:[0,1,2,0]}}),/quattro round/);
s=initGame(cfg);const clean=plain(s),chosen=chooseTimedCommand(s,{budgetMs:80});assert.ok(legalCommands(s).some(c=>JSON.stringify(c)===JSON.stringify(chosen)));assert.deepEqual(plain(s),clean);
const potential=roundObjectivePotential(s,s.players[0]);assert.ok(Number.isFinite(potential));assert.ok(Number.isFinite(evaluate(s,0)));
console.log('OK: twelve v2 cards, seeded shuffle independent of worker decks, all card metrics, custom deadlines, immutable banking after cures, hidden preview draws, saved/undo validation and legacy preservation, legal timed AI.');
