import assert from 'node:assert/strict';
import { defaults, playableConfig } from '../src/lab/config.js';
import { initGame, legalCommands, applyCommand, WORKER_BY_ID } from '../src/game/engine.js';
import { productionChoices, productionPreview } from '../src/components/production-choices.js';
const config=playableConfig(defaults(),2);
config.rowEconomy={...config.rowEconomy,welfareMode:'permanent',welfareCost:3,welfareHireDiscount:true,repressionStep:1};
const initial=initGame(config),role='terziario',p=initial.players[0],d=p.depts[role];
const worker=Object.values(WORKER_BY_ID).find(w=>w.sector===d.sector);
const machine=Object.values(WORKER_BY_ID).find(w=>w.effect?.verbo==='prendi'&&w.effect.f1.tipo==='moneta');
d.sopra=[worker.id];d.sotto=[machine.id];d.prod=13;
initial.phase='action';p.node=d.sector;
const resources=p=>Object.values(p.resources).reduce((a,b)=>a+b,0);
function checkPreview(state,command,expected) {
  const frozen=structuredClone(state),registry=structuredClone(WORKER_BY_ID);
  const result=productionPreview(state,command);
  assert.deepEqual(result,expected);
  assert.deepEqual(state,frozen,'Preview must not alter the live game');
  assert.deepEqual(WORKER_BY_ID,registry,'Preview must not alter the card registry');
  return result;
}
const yields=(tessuti=0,acciaio=0,coloranti=0)=>({Tessuti:tessuti,Acciaio:acciaio,Coloranti:coloranti});
for(const [welfare,tension,expected] of [[1,0,1],[2,0,2],[3,0,3],[5,0,4],[2,3,1],[2,4,0]]){
  const s=structuredClone(initial),dept=s.players[0].depts[role];
  dept.sustainableWelfare=welfare;dept.tension=tension;
  const commands=legalCommands(s).filter(c=>c.type==='activate');
  const choices=productionChoices(s,commands);
  assert.equal(choices.length,2,'Only Intensa and Sostenibile are displayed');
  const sustainable=choices.find(c=>c.sustainableRow!==undefined);
  const after=applyCommand(s,sustainable);
  assert.equal(resources(after.players[0])-resources(s.players[0]),expected,`${welfare} welfare, tension ${tension}`);
  assert.equal(after.players[0].coins-s.players[0].coins,machine.effect.f1.q,'Machines activate once');
  assert.equal(after.players[0].depts[role].tension,Math.max(0,tension-1));
  checkPreview(s,sustainable,{resources:yields(expected),coins:machine.effect.f1.q,tension:Math.max(0,tension-1),conversions:[]});
  const intenseCommand=choices.find(c=>c.sustainableRow===undefined);
  const intense=applyCommand(s,intenseCommand);
  assert.equal(resources(intense.players[0])-resources(s.players[0]),4-tension);
  assert.equal(intense.players[0].coins-s.players[0].coins,machine.effect.f1.q);
  checkPreview(s,intenseCommand,{resources:yields(4-tension),coins:machine.effect.f1.q,tension:Math.min(4,tension+1),conversions:[]});
}
assert.equal(productionChoices(initial,legalCommands(initial).filter(c=>c.type==='activate')).length,1,'No welfare: only intense');
const legacy=structuredClone(initial);legacy.players[0].depts[role].sustainableWelfare=2;
assert.doesNotThrow(()=>applyCommand(legacy,{type:'activate',sector:d.sector,intensity:1,sustainableRow:[1,3]}),'Old saved commands stay replayable');
const previous=[{sector:'Tessile',intensity:1},{sector:'Tessile',intensity:2}];
assert.equal(productionChoices({rowEconomy:{enabled:false}},previous),previous);
const blocked=structuredClone(initial);
blocked.players[0].depts[role].sopra=[Object.values(WORKER_BY_ID).find(w=>w.sector===d.sector&&w.id!==machine.id).id];
blocked.players[0].depts[role].blocked=[machine.id];
checkPreview(blocked,legalCommands(blocked).find(c=>c.type==='activate'),{resources:yields(4),coins:0,tension:1,conversions:[]});

// Use real engine cards for fixed exchanges and two queued optional exchanges.
const cards=[
  {id:'preview-fixed',effect:{verbo:'scambia',f1:{q:3,tipo:'risorsa',settore:'Tessile'},f2:{q:5,tipo:'moneta'}}},
  {id:'preview-choice-res',effect:{verbo:'scambia',f1:{q:1,tipo:'risorsa',settore:'scelta'},f2:{q:1,tipo:'risorsa',settore:'scelta'}}},
  {id:'preview-choice-coins',effect:{verbo:'scambia',f1:{q:1,tipo:'risorsa',settore:'scelta'},f2:{q:3,tipo:'moneta'}}},
  {id:'preview-cash',effect:{verbo:'prendi',f1:{q:4,tipo:'moneta'}}},
  {id:'preview-steel',effect:{verbo:'prendi',f1:{q:2,tipo:'risorsa',settore:'Metallurgica'}}},
].map(card=>({...worker,...card}));
const custom=initGame({...config,rowEconomy:{...config.rowEconomy,machineCash:false},workers:[...config.workers,...cards]});
custom.phase='action';custom.players[0].node=d.sector;
const customDept=custom.players[0].depts[role];
customDept.prod=1;customDept.sopra=[worker.id];custom.players[0].resources.Tessuti=2;
customDept.sotto=['preview-fixed','preview-steel'];
checkPreview(custom,legalCommands(custom).find(c=>c.type==='activate'),{resources:yields(-2,2),coins:5,tension:1,conversions:[]});
customDept.sotto=['preview-choice-res','preview-choice-coins','preview-cash'];
const optionalCommand=legalCommands(custom).find(c=>c.type==='activate');
const optionalResult=applyCommand(custom,optionalCommand);
assert.equal(optionalResult.pending.cardId,'preview-choice-res');
assert.equal(optionalResult.pendingQueue[0].cardId,'preview-choice-coins');
checkPreview(custom,optionalCommand,{
  resources:yields(1),coins:4,tension:1,
  conversions:[WORKER_BY_ID['preview-choice-res'],WORKER_BY_ID['preview-choice-coins']],
});

// Last player, final turn: totals must still belong to the actor, not another seat.
const final=structuredClone(custom);final.current=1;final.roundTurns=1;final.turn=final.roundLimit;
const finalPlayer=final.players[1],finalDept=finalPlayer.depts[role];
finalPlayer.node=d.sector;finalPlayer.coins=30;finalPlayer.resources.Tessuti=7;
finalDept.sopra=[worker.id];finalDept.sotto=['preview-cash'];finalDept.prod=5;finalDept.tension=1;
const finalCommand=legalCommands(final).find(c=>c.type==='activate');
assert.ok(applyCommand(final,finalCommand).gameOver);
checkPreview(final,finalCommand,{resources:yields(2),coins:4,tension:2,conversions:[]});

// Token protection keeps all accessible rows and stays a separate choice.
const tokens=initGame(playableConfig(defaults(),2));
tokens.phase='action';tokens.players[0].node=d.sector;tokens.players[0].welfareTokens=3;
Object.assign(tokens.players[0].depts[role],{sopra:[worker.id],sotto:[machine.id],prod:13,tension:2});
tokens.players[0].depts.secondario.tension=1;
const tokenChoices=productionChoices(tokens,legalCommands(tokens).filter(c=>c.type==='activate'));
assert.equal(tokenChoices.length,2,'Intense and protected are both visible');
const protectedCommand=tokenChoices.find(c=>c.welfareToken);
checkPreview(tokens,protectedCommand,{resources:yields(2),coins:machine.effect.f1.q,tension:2,conversions:[]});
assert.equal(applyCommand(tokens,protectedCommand).players[0].welfareTokens,2);
const tokenIntense=tokenChoices.find(c=>!c.welfareToken);
checkPreview(tokens,tokenIntense,{resources:yields(2),coins:machine.effect.f1.q,tension:3,conversions:[]});
assert.equal(applyCommand(tokens,tokenIntense).pending,null,'Producing never opens a recovery choice');
assert.equal(applyCommand(tokens,tokenIntense).players[0].welfareTokens,3,'Ordinary production keeps the tokens');
const fullWarehouse=structuredClone(tokens);
fullWarehouse.players[0].resCap={enabled:true,base:10,perFactory:[]};
fullWarehouse.players[0].resources.Tessuti=9;
for(const command of tokenChoices) {
  const result=productionPreview(fullWarehouse,command);
  assert.equal(Object.values(result.resources).reduce((a,b)=>a+b,0),1,'Optional welfare recovery must not bypass the warehouse limit in previews');
}
tokens.turnFlags.welfareTokensPurchased=3;
assert.equal(productionChoices(tokens,legalCommands(tokens).filter(c=>c.type==='activate')).length,1,'Newly purchased tokens do not offer protection');
console.log('OK: legacy and token production choices; exact immutable previews, once-only machines, conversions, final actor and fresh-token availability.');
