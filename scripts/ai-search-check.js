import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults,gameConfig} from '../src/lab/config.js';
import {initGame,applyCommand,legalCommands,forkForSearch,scorePlayer,WORKER_BY_ID} from '../src/game/engine.js';
import * as ai from '../src/game/ai.js';
const url=new URL('../src/game/ai.js',import.meta.url);
const source=fs.readFileSync(url,'utf8').replace('const GREEDY_CACHE_LIMIT = 5000;','const GREEDY_CACHE_LIMIT = 0;').replaceAll('state = forkForSearch(state);','').replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${new URL(p,url).href}'`);
const reference=await import(`data:text/javascript;base64,${Buffer.from(source+'\nexport { reachableNeedBySector };').toString('base64')}`);
const plain=x=>JSON.parse(JSON.stringify(x));
function freeze(o){if(!o||typeof o!=='object'||Object.isFrozen(o))return;Object.freeze(o);Object.values(o).forEach(freeze);}
const metrics = new Set(['coinsGainedBy','coinsSpentBy','coinsHistory','resHistory','industrialStats','welfareRondelStats','nodeVisits','activationTurns','activationsBySector','convCount','convAttempts','resGainedBy','resSpentByCat','resGen','resSpent','sottoVal','welfareLog','borsaLog','borsaBuys']);
const gameplayPlayers = s => s.players.map(p=>Object.fromEntries(Object.entries(p).filter(([k,v])=>v && typeof v==='object' && !metrics.has(k))));
function freezePrediction(s) {
 gameplayPlayers(s).forEach(freeze);
 freeze(s.pending); freeze(s.pendingQueue); freeze(s.strikeLog);
}
let transitions=0;
// Every real transition remains identical to a forked prediction in all gameplay fields and scores.
for(const players of [2,3,4])for(const rondel of [false,true]){
 const c=defaults();c.players=players;c.turns=8;c.welfareRondel=rondel;c.machineImmediate=true;c.milestoneResource=true;c.simulation.ai='greedy';
 let real=initGame(gameConfig(c)),sim=forkForSearch(real);const original=structuredClone(real);freeze(real);
 while(!real.gameOver){
  freezePrediction(sim);
  if ([1,4].includes(real.turn)) for (const command of legalCommands(real)) {
   const expected = applyCommand(real,command), predicted = applyCommand(sim,command);
   assert.deepEqual(gameplayPlayers(predicted),gameplayPlayers(expected),'Sibling predictions must preserve all gameplay collections');
  }
  const command=ai.chooseCommand(real);assert.deepEqual(command,ai.chooseCommand(sim));
  real=applyCommand(real,command);sim=applyCommand(sim,command);transitions++;
  assert.deepEqual(legalCommands(real),legalCommands(sim));
  assert.deepEqual(real.players.map(p=>scorePlayer(real,p)),sim.players.map(p=>scorePlayer(sim,p)));
  for(let i=0;i<players;i++)for(const key of ['coins','resources','depts','welfareTokens','welfarePosition','contractsWon','resCapLost','repressions'])assert.deepEqual(real.players[i][key],sim.players[i][key]);
 }
 assert.deepEqual(original.players.map(p=>p.coins),c.startingCoins.slice(0,players));
 assert.ok(real.players.every(p=>p.coinsHistory.length===8));
 assert.ok(sim.players.every(p=>p.coinsHistory.length===0),'Predictions must not build history arrays');
}
// Requirements depend on actual open cards, completion flags and the player's unlocked sizes.
{
 const c=defaults(),s=initGame(gameConfig(c)),p=s.players[0];
 s.contractMilestoneReq={small:0,medium:1,large:2};
 for(const [size,sector,n]of [['small','Tessile',2],['medium','Metallurgica',3],['large','Chimica',4]])
  s.contracts[size]={deck:[],active:[{card:{reqs:[Array(n).fill(sector)]},doneReq:[false]}]};
 assert.deepEqual(reference.reachableNeedBySector(s,p),{Tessile:2,Metallurgica:0,Chimica:0});
 p.depts.terziario.prod=s.milestonePos.terziario;
 assert.deepEqual(reference.reachableNeedBySector(s,p),{Tessile:2,Metallurgica:3,Chimica:0});
 p.depts.secondario.prod=s.milestonePos.secondario;s.contracts.small.active[0].doneReq[0]=true;
 assert.deepEqual(reference.reachableNeedBySector(s,p),{Tessile:0,Metallurgica:3,Chimica:4});
}
let cacheHits=0,saved=0;
for(const players of [2,3,4]){
 const c=defaults();c.players=players;c.welfareRondel=true;c.simulation.ai='forecast2';c.simulation.depth=2;
 let s=initGame(gameConfig(c));s=applyCommand(s,legalCommands(s).find(c=>c.type==='move'&&c.node==='Servizi'));
 const snapshot=structuredClone(s);freeze(s);ai.resetRolloutStats();reference.resetRolloutStats();
 assert.deepEqual(ai.chooseCommand(s),reference.chooseCommand(s));assert.deepEqual(s,snapshot);
 assert.equal(ai.rolloutStats.beamExpanded,reference.rolloutStats.beamExpanded);
 assert.equal(ai.rolloutStats.stepsSimulated,reference.rolloutStats.stepsSimulated);
 cacheHits+=ai.rolloutStats.greedyCacheHits;saved+=reference.rolloutStats.evaluateCalls-ai.rolloutStats.evaluateCalls;
 // Different prices/decks/turns must never inherit the previous decision's cache.
 const changed=structuredClone(s);changed.players[0].coins=1;changed.turn=27;changed.aiRollout.depth=6;
 assert.deepEqual(ai.chooseCommand(changed),reference.chooseCommand(changed));
 const after=applyCommand(s,legalCommands(s).find(c=>c.type==='investWelfare'&&c.steps===1));
 assert.equal(ai.continuationValue(after,2,0),reference.continuationValue(after,2,0));
}
assert.ok(cacheHits>0&&saved>0);
// Unsupported shared payouts retain the fully isolated engine.
const c=defaults(),legacy=initGame(gameConfig(c));legacy.industrial.welfareScoring='quarter';assert.equal(forkForSearch(legacy),legacy);
// Permanent Welfare edits department counters; employee hiring edits Direction and several tracks.
for (const scope of ['department','factory']) {
 const c=defaults(),s=initGame(gameConfig(c)); s.rowEconomy.welfareMode='permanent';s.rowEconomy.welfareScope=scope;
 s.phase='action';s.players[0].node='Servizi';
 const sim=forkForSearch(s);freezePrediction(sim);
 const commands=legalCommands(s).filter(c=>c.type==='investWelfare');assert.ok(commands.length);
 for (const command of commands)
  assert.deepEqual(gameplayPlayers(applyCommand(sim,command)),gameplayPlayers(applyCommand(s,command)));
}
{
 const config=gameConfig(defaults()),catalog=JSON.parse(fs.readFileSync(new URL('../src/lab/reference.json',import.meta.url)));
 config.workers.push(catalog.workers.find(w=>w.power));config.nodeBanks.Sindacato.push('Impiegati');config.slots.direzione.sopra=3;
 const s=initGame(config),p=s.players[0];p.node='Sindacato';p.coins=100;s.phase='action';
 const sim=forkForSearch(s);freezePrediction(sim);
 const commands=legalCommands(s).filter(c=>c.type==='hire'&&WORKER_BY_ID[c.cardId]?.power);assert.ok(commands.length);
 for(const command of commands)
  assert.deepEqual(gameplayPlayers(applyCommand(sim,command)),gameplayPlayers(applyCommand(s,command)));
}
{
 const c=defaults();c.welfareRondel=true;
 let s=initGame(gameConfig(c));s.phase='action';const p=s.players[0];p.node='Tessile';p.welfarePosition=5;
 p.depts.terziario.prod=9;p.depts.terziario.sopra=[Object.values(WORKER_BY_ID).find(w=>w.sector==='Tessile').id];
 s=applyCommand(s,legalCommands(s).find(c=>c.type==='activate'));
 assert.equal(s.pending?.type,'effect');s.pendingQueue.push(structuredClone(s.pending));
 const sim=forkForSearch(s);freezePrediction(sim);
 for(const command of legalCommands(s)) {
  const actual=applyCommand(s,command),predicted=applyCommand(sim,command);
  assert.deepEqual(gameplayPlayers(predicted),gameplayPlayers(actual));
  assert.deepEqual(predicted.pending,actual.pending);assert.deepEqual(predicted.pendingQueue,actual.pendingQueue);
 }
}
{
 const s=initGame(gameConfig(defaults()));s.phase='action';s.players[0].node='Tessile';
 const sim=forkForSearch(s);freezePrediction(sim);
 const hire=legalCommands(s).find(c=>c.type==='hire');assert.ok(hire);
 for(const command of [{...hire,side:'missing'},{...hire,cardId:'missing'}])
  assert.throws(()=>applyCommand(sim,command),/Azione non disponibile/);
}
console.log(`OK: ${transitions} transitions, 2/3/4-player full games, unchanged gameplay/scores, isolated metrics, exact choices/forecast values, cache invalidation; ${cacheHits} hits and ${saved} evaluations avoided.`);
