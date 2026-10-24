import { effectChoiceLabel } from '../src/components/effect-choice.js';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaults, validate, parseConfig, gameConfig, playableConfig } from '../src/lab/config.js';
import { initGame, applyCommand, scorePlayer, legalCommands } from '../src/game/engine.js';
import { chooseCommand } from '../src/game/ai.js';
import { runGame, summarize } from '../src/lab/run.js';
import { cardArtKey, machineText } from '../src/lab/cards.js';
import { rowMachineCard } from '../src/game/row-economy.js';
import { STAR_NODE_BANKS, STAR_MARKETS } from '../src/lab/markets.js';
import { contractNeeds, missingResources } from '../src/lab/contract-needs.js';
const needs=contractNeeds(['Tessile','Metallurgica','Metallurgica'],{Tessuti:0,Acciaio:3,Coloranti:9});
assert.deepEqual(needs,[{resource:'Tessuti',required:1,owned:0,missing:1},{resource:'Acciaio',required:2,owned:3,missing:0}]);
assert.equal(missingResources(needs),'1 tessuto');
assert.equal(missingResources(contractNeeds(['Chimica'],{Coloranti:1})), '');
assert.equal(missingResources(contractNeeds([])), '');
const reference=JSON.parse(fs.readFileSync(new URL('../src/lab/reference.json',import.meta.url)));
const c=defaults(),cfg=gameConfig(c);
// The pending UI must describe the exact formula and quantities used by the engine.
const swapCard={id:'test-swap',sector:'Chimica',effect:{verbo:'scambia',f1:{q:2,tipo:'risorsa',settore:'scelta'},f2:{q:2,tipo:'risorsa',settore:'scelta'}}};
assert.equal(effectChoiceLabel(swapCard),'2 risorse a scelta → 2 risorse a scelta');
assert.equal(effectChoiceLabel(swapCard,{give:'Chimica',take:'Tessile'}),'2 coloranti → 2 tessuti');
assert.equal(effectChoiceLabel({effect:{type:'swap_res_any'}},{give:'Chimica',take:'Metallurgica'}),'1 coloranti → 1 acciaio');
assert.equal(effectChoiceLabel({effect:{type:'buy_res_2m'}},{take:'Tessile'}),'2 marchi → 1 tessuti');
assert.equal(effectChoiceLabel({effect:{type:'swap_res_3m'}},{give:'Chimica'}),'1 coloranti → 3 marchi');
assert.equal(effectChoiceLabel({...swapCard,effect:{verbo:'scambia',f1:{q:1,tipo:'risorsa',settore:'carta'},f2:{q:3,tipo:'risorsa',settore:'scelta'}}},{take:'Tessile'}),'1 coloranti → 3 tessuti');
let effectState=initGame(playableConfig(c,1));
effectState.phase='resolving';
effectState.players[0].resources={Tessuti:0,Acciaio:2,Coloranti:6};
effectState.pending={type:'effect',playerId:0,cardId:swapCard.id,card:swapCard,role:'primario'};
const effectOptions=legalCommands(effectState).filter(cmd=>cmd.use);
assert.equal(effectOptions.length,4);
for(const cmd of effectOptions){
  assert.ok(effectChoiceLabel(swapCard,cmd).includes(' → '));
  const resolved=applyCommand(effectState,cmd);
  const resource={Tessile:'Tessuti',Metallurgica:'Acciaio',Chimica:'Coloranti'};
  assert.equal(resolved.players[0].resources[resource[cmd.give]],effectState.players[0].resources[resource[cmd.give]]-2);
  assert.equal(resolved.players[0].resources[resource[cmd.take]],effectState.players[0].resources[resource[cmd.take]]+2);
  assert.equal(resolved.pending,null);assert.equal(resolved.current,1);
}
const skipped=applyCommand(effectState,{type:'resolveEffect',use:false});
assert.deepEqual(skipped.players[0].resources,effectState.players[0].resources);
assert.equal(skipped.pending,null);assert.equal(skipped.current,1);

for(const w of c.workers){
  assert.ok(fs.existsSync(new URL(`../src/lab/assets/workers/${cardArtKey(w)}.jpg`,import.meta.url)),`Missing portrait for ${w.id}`);
  assert.ok(!machineText(rowMachineCard(w,{machineCash:true})).includes('undefined'));
}
assert.equal(machineText({sector:'Chimica',effect:{verbo:'scambia',f1:{q:1,tipo:'risorsa',settore:'scelta'},f2:{q:3,tipo:'moneta'}}}),'1 risorsa a scelta → 3 marchi');
assert.equal(machineText({sector:'Tessile',effect:{verbo:'prendi',f1:{q:2,tipo:'risorsa',settore:'carta'}}}),'Prendi 2 tessuti');
const historicalConfig={...reference,seed:1907,headless:true,players:cfg.players};
const expected=initGame({...historicalConfig, workers:reference.workers.filter(w=>!w.power),
  nodeBanks:structuredClone(STAR_NODE_BANKS), singleContractVisit:true,
  slots:{...reference.slots,direzione:{sopra:0,sotto:0}}});
assert.deepEqual(initGame(cfg),expected,'Lab rules: no employees, adjacent markets and one contract per visit');
const adjacent={Tessile:['A','E'],Metallurgica:['A','B'],Chimica:['B','C'],Servizi:['C','D'],Sindacato:['D','E']};
assert.deepEqual(STAR_NODE_BANKS,adjacent);
assert.equal(STAR_MARKETS.length,5);
for(const [node,banks] of Object.entries(adjacent)){
  const initial=initGame(playableConfig(c,1));
  const there=applyCommand(initial,legalCommands(initial).find(cmd=>cmd.type==='move'&&cmd.node===node));
  const hires=legalCommands(there).filter(cmd=>cmd.type==='hire');
  assert.deepEqual([...new Set(hires.map(cmd=>cmd.bank))].sort(),[...banks].sort(),`${node}: both neighbouring markets, no others`);
  assert.equal(new Set(hires.map(cmd=>cmd.cardId)).size,2);
  for(const bank of banks){
    for(const side of ['sopra','sotto']){
      const cmd=hires.find(cmd=>cmd.bank===bank&&cmd.side===side);
      assert.ok(cmd,`${node}: ${bank} can be installed ${side}`);
      const after=applyCommand(there,cmd);
      assert.deepEqual(after.banks[bank],there.banks[bank].slice(1),'Bought card reveals next card in the same physical deck');
      for(const other of there.bankIds.filter(id=>id!==bank))assert.deepEqual(after.banks[other],there.banks[other]);
    }
  }
}
// One City delivery pays once, replaces the card and immediately hands off play.
function cityFixture(){
  let state=initGame(playableConfig(c,1));
  state.players[0].node='Tessile';
  state.players[0].resources={Tessuti:3,Acciaio:3,Coloranti:3};
  return applyCommand(state,legalCommands(state).find(cmd=>cmd.type==='move'&&cmd.node==='Borsa'));
}
const city=cityFixture(),cityActions=legalCommands(city);
assert.ok(!cityActions.some(cmd=>cmd.type==='hire'),'City never allows card purchases');
const ended=applyCommand(city,cityActions.find(cmd=>cmd.type==='endTurn'));
assert.equal(ended.current,1);assert.equal(ended.phase,'move');
assert.equal(ended.players[0].contractsWon.length,0);
const delivery=cityActions.find(cmd=>cmd.type==='completeContract'&&cmd.size==='small');
const oldCard=city.contracts.small.active[delivery.slotIndex].card;
const delivered=applyCommand(city,delivery);
assert.equal(delivered.current,1,'Delivery immediately passes to the next player');
assert.equal(delivered.phase,'move');
assert.equal(delivered.players[0].contractsWon.length,1);
assert.equal(delivered.players[0].contractsWon[0].pv,oldCard.pv[0]);
assert.equal(delivered.players[0].coins,city.players[0].coins+c.contractCoins.small);
assert.equal(Object.values(delivered.players[0].resources).reduce((a,b)=>a+b,0),9-oldCard.reqs[delivery.reqIndex].length);
assert.notEqual(delivered.contracts.small.active[delivery.slotIndex]?.card.id,oldCard.id);
assert.ok(!legalCommands(delivered).some(cmd=>cmd.type==='completeContract'));
assert.equal(delivered.roundTurns,city.roundTurns+1,'Delivery finishes the turn exactly once');
const finalCity=cityFixture();finalCity.turn=finalCity.roundLimit;finalCity.roundTurns=finalCity.nPlayers-1;
const finalDelivery=legalCommands(finalCity).find(cmd=>cmd.type==='completeContract');
const finalResult=applyCommand(finalCity,finalDelivery);
assert.ok(finalResult.gameOver,'A delivery on the final turn completes the game');
assert.equal(finalResult.players[0].contractsWon.length,1);
console.log('OK: City purchases forbidden; single delivery pays once, hands off play and ends the final round.');
assert.deepEqual(parseConfig(JSON.stringify(c)),c,'Configuration round trip');
const oldSave={...structuredClone(c),directionSlots:7,welfareCost:5,workers:structuredClone(reference.workers)};
oldSave.workers.find(w=>!w.power).v=7;
const migrated=parseConfig(JSON.stringify(oldSave));
assert.equal(migrated.welfareCost,5);assert.equal(migrated.workers[0].v,7);
assert.ok(!('directionSlots' in migrated));assert.ok(migrated.workers.every(w=>!w.power&&w.deck!=='Impiegati'));
assert.ok(oldSave.workers.some(w=>w.power),'Migration must not mutate the source');
assert.throws(()=>validate(oldSave),'Unmigrated employee cards cannot enter a new game');
let atRepression=initGame(playableConfig(c,1));
atRepression=applyCommand(atRepression,legalCommands(atRepression).find(m=>m.type==='move'&&m.node==='Sindacato'));
assert.ok(!atRepression.bankIds.includes('Impiegati'));
assert.ok(legalCommands(atRepression).every(m=>m.role!=='direzione'&&m.bank!=='Impiegati'));
const aiDecision=chooseCommand(atRepression);
assert.ok(aiDecision&&aiDecision.role!=='direzione'&&aiDecision.bank!=='Impiegati');
const manual=playableConfig(c,1,'study');
assert.deepEqual(manual,gameConfig(c,{humans:1}),'Manual study game uses exactly the validated d6 rules');
const fastManual=playableConfig(c,1,'rapid');
assert.deepEqual({...fastManual,aiRollout:manual.aiRollout},manual,'Rapid play only changes search depth');
assert.equal(fastManual.aiRollout.depth,2);assert.equal(c.simulation.depth,6,'Playing must not mutate batch settings');
assert.ok(playableConfig(c,2).players.every(p=>!p.isAI));
assert.throws(()=>playableConfig(c,3));assert.throws(()=>playableConfig(c,1,'unknown'));
for(const mutate of [x=>x.players=1,x=>x.track.pop(),x=>x.simulation.ai='forcedWelfare',x=>x.workers[1].id=x.workers[0].id,x=>x.contracts.small[0].reqs=[[]],x=>x.race.incentive=20,x=>x.contractCount[2].small=0]){
  const bad=structuredClone(c);mutate(bad);assert.throws(()=>validate(bad));
}
const edit=structuredClone(c);edit.welfareCost=5;edit.repressionBase=3;edit.repressionStep=2;edit.startingCoins[0]=23;edit.machineSlots[0]=1;edit.contractCoins.small=7;edit.cityIncome=4;edit.race.podium[0]=11;
edit.contracts.small.forEach(x=>x.pv[0]=23);
edit.track[2]={coins:3};edit.workers[0].effect={verbo:'prendi',f1:{q:9,tipo:'moneta'}};
const changed=initGame(gameConfig(edit));
assert.equal(changed.players[0].coins,23);assert.equal(changed.rowEconomy.welfareCost,5);assert.equal(changed.rowEconomy.repressionBase,3);assert.equal(changed.rowEconomy.repressionStep,2);
assert.equal(changed.rowEconomy.contractCoins.small,7);assert.deepEqual(changed.tracks.terziario[2],{coins:3});
for(const slot of changed.contracts.small.active)assert.equal(slot.card.pv[0],23,'Per-card points must not be overwritten by legacy global PV');
const rapid=defaults();rapid.simulation.ai='greedy';const rapidCfg=gameConfig(rapid);
const game=await runGame(rapidCfg);
assert.equal(game.turns,28);assert.equal(game.people.length,2);
assert.ok(game.commands.every(m=>m.role!=='direzione'&&m.bank!=='Impiegati'),'AI games cannot buy employees');
let replay=initGame(rapidCfg);for(const cmd of game.commands)replay=applyCommand(replay,cmd);
assert.ok(replay.gameOver);assert.deepEqual(replay.players.map(p=>scorePlayer(replay,p).total),game.people.map(p=>p.total));
const summary=summarize([game]);assert.equal(summary.players,2);assert.equal(summary.welfareHistogram.reduce((n,r)=>n+r.count*r.players,0),game.people.reduce((n,p)=>n+p.stats.welfareBuys,0));
for(const n of [3,4]){const many=defaults();many.players=n;many.simulation.ai='greedy';const g=await runGame(gameConfig(many));assert.equal(g.people.length,n);assert.equal(g.turns,28);}
for(const model of ['righe4','righe3']){const many=defaults();const {TRACK_MODELS}=await import('../src/game/data.js');many.trackModel=model;many.track=structuredClone(TRACK_MODELS[model].track);many.simulation.ai='greedy';assert.equal((await runGame(gameConfig(many))).turns,28);}
console.log('OK: reference rules without employees; saved-config migration; no employee purchases by humans or AI; validation; full games with 2/3/4 players and each row format; replay; counters.');
const full=new URL('../reports/laboratorio-verifica-2026-10-16-d6.json',import.meta.url);
if(fs.existsSync(full)){
  const actual=JSON.parse(fs.readFileSync(full));const previous=JSON.parse(fs.readFileSync(new URL('../reports/ia-utilizzi-futuri-2026-10-16-d6-1907-c3-forecast2-forecast2.json',import.meta.url))).baseline;
  assert.deepEqual(actual.people.map(p=>p.total),previous.people.map(p=>p.total));assert.deepEqual(actual.people.map(p=>p.stats),previous.people.map(p=>p.stats));
  assert.deepEqual(actual.pressure,previous.pressure);
  let s=initGame(historicalConfig);for(const cmd of actual.commands)s=applyCommand(s,cmd);assert.ok(s.gameOver);assert.deepEqual(s.players.map(p=>scorePlayer(s,p).total),previous.people.map(p=>p.total));
  console.log('OK: historical d6 study still replays with its original rules (including employees).');
}
