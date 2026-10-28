import assert from 'node:assert/strict';
import { defaults, gameConfig, parseConfig } from '../src/lab/config.js';
import { initGame, applyCommand, legalCommands, hireCost, WORKER_BY_ID } from '../src/game/engine.js';
import { WELFARE_POLICIES, WELFARE_DISPLAY_POLICIES, welfarePolicy } from '../src/game/welfare-rondel.js';
import { availableWelfareTokens } from '../src/game/row-economy.js';
import { productionPreview } from '../src/components/production-choices.js';
import { rowActionPreview } from '../src/components/row-action-preview.js';
import { chooseCommand, resetRolloutStats, rolloutStats } from '../src/game/ai.js';
import { saveGame, loadGame, gameSession } from '../src/lab/saved-game.js';
import { runGame, textReport } from '../src/lab/run.js';

const editor=defaults(); editor.welfareRondel=true; editor.milestoneResource=true;
const config=gameConfig(editor);
assert.equal(parseConfig(JSON.stringify(editor)).welfareMaxSteps,3);
assert.throws(()=>gameConfig({...editor,welfareMaxSteps:4}),/massimo 3/);
function fixture(node='Servizi',policy=null) {
  const s=initGame(config),p=s.players[0];s.phase='action';p.node=node;p.coins=20;
  p.welfarePosition=policy==null?null:WELFARE_POLICIES.findIndex(x=>x.id===policy);
  return s;
}
function staff(s,role='terziario',mixed=false) {
  const d=s.players[0].depts[role],workers=Object.values(WORKER_BY_ID).filter(w=>w.sector===d.sector);
  d.sopra=[workers[0].id];if(mixed)d.sopra.push(workers.find(w=>w.nation!==workers[0].nation).id);
  d.prod=5;return d;
}
function hireFixture(policy,side='sopra',predicate=w=>w.v===2) {
  const s=fixture('Tessile',policy),w=Object.values(WORKER_BY_ID).find(w=>w.sector==='Tessile'&&predicate(w));
  assert.ok(w);s.banks[s.nodeBanks.Tessile[0]]=[w.id];
  const cmd=legalCommands(s).find(c=>c.type==='hire'&&c.cardId===w.id&&c.side===side&&c.role==='terziario');
  assert.ok(cmd);return {s,w,cmd};
}
const initial=fixture();initial.players[0].coins=6;
const commands=legalCommands(initial).filter(c=>c.type==='investWelfare');assert.equal(commands.length,3);
assert.deepEqual(commands.map(c=>[c.steps,c.position]),[[1,1],[2,2],[3,3]]);
assert.equal(welfarePolicy(initial,initial.players[0]),null);
assert.throws(()=>applyCommand(initial,{type:'investWelfare',steps:3,position:0}),/non disponibile/);
const secondVisit=structuredClone(initial);secondVisit.players[0].welfarePosition=3;
assert.ok(legalCommands(secondVisit).some(c=>c.type==='investWelfare'&&c.steps===3&&c.position===0),'Formation reachable on second visit after 3+3 steps');
assert.equal(WELFARE_DISPLAY_POLICIES.at(-1).id,'formation');
assert.ok(commands.every(c=>c.steps<=3));
const oldRules=structuredClone(initial);delete oldRules.rowEconomy.welfareMaxSteps;delete oldRules.rowEconomy.welfareFreeEntry;
assert.equal(legalCommands(oldRules).filter(c=>c.type==='investWelfare').length,36,'Existing saves retain six-step commands');
const frozen=structuredClone(initial);
for(const c of commands){
  const next=applyCommand(initial,c),p=next.players[0];
  assert.equal(p.coins,6-c.steps);assert.equal(p.welfareTokens,c.steps);assert.equal(p.welfarePosition,c.position);
  assert.equal(p.welfareRondelStats.visits.length,1);assert.equal(p.industrialStats.welfareSpent,c.steps);
  const preview=rowActionPreview(initial,c);assert.equal(preview.cost,c.steps);assert.equal(preview.welfareTokens.after,c.steps);
  assert.equal(preview.policy.after.id,WELFARE_POLICIES[c.position].id);
}
assert.deepEqual(initial,frozen,'Every preview/command must preserve its predecessor');
for(const c of [{steps:0,position:0},{steps:4,position:0},{steps:6,position:0},{steps:7,position:0},{steps:1.5,position:0},{steps:1,position:6},{steps:'1',position:0},{steps:1},{scope:'factory'}])assert.throws(()=>applyCommand(initial,{type:'investWelfare',...c}),/Azione non disponibile/);
const later=fixture('Servizi','mutualAid');later.players[1].welfarePosition=0;
const forward=legalCommands(later).filter(c=>c.type==='investWelfare');assert.equal(forward.length,3);
assert.equal(forward[0].position,0);assert.equal(forward[2].position,2);
assert.throws(()=>applyCommand(later,{type:'investWelfare',steps:2,position:0}));
assert.equal(applyCommand(later,forward[0]).players[0].welfarePosition,0,'Shared positions remain available');
let purchased=applyCommand(initial,{type:'investWelfare',steps:3,position:3});
assert.equal(purchased.turnFlags.welfareTokensPurchased,0,'The next actor has fresh flags');
purchased=applyCommand(purchased,legalCommands(purchased).find(c=>c.type==='move'));
purchased=applyCommand(purchased,legalCommands(purchased).find(c=>['pass','endTurn'].includes(c.type)));
assert.equal(purchased.current,0);assert.equal(availableWelfareTokens(purchased,purchased.players[0]),3);

// Formation crosses the extra threshold once, even under tension; a full track gives no fictitious step.
let {s,w,cmd}=hireFixture('formation');s.players[0].depts.terziario.prod=2;s.players[0].depts.terziario.tension=4;
let next=applyCommand(s,cmd);assert.equal(next.players[0].depts.terziario.prod,5);assert.equal(next.players[0].resources.Tessuti,1);
assert.equal(next.players[0].welfareRondelStats.benefits.formation,1);
s.players[0].depts.terziario.prod=16;next=applyCommand(s,cmd);assert.equal(next.players[0].welfareRondelStats.benefits.formation,0);

({s,w,cmd}=hireFixture('integration', 'sopra',w=>w.v===3));
assert.equal(hireCost(s,s.players[0],w,cmd.role,cmd.side),2);next=applyCommand(s,cmd);
assert.equal(next.players[0].welfareRondelStats.benefits.integration,1);
s.players[0].depts.terziario.sopra=[w.id];
assert.equal(hireCost(s,s.players[0],w,cmd.role,cmd.side),2,'Same-nation discount applies, not integration again');
({s,w,cmd}=hireFixture('innovation','sotto',w=>w.v===3));
assert.equal(hireCost(s,s.players[0],w,cmd.role,cmd.side),2);next=applyCommand(s,cmd);
assert.equal(next.players[0].welfareRondelStats.benefits.innovation,1);
w.v=1;assert.equal(hireCost(s,s.players[0],w,cmd.role,cmd.side),1,'Minimum price one');

s=fixture('Tessile','cooperation');staff(s,'terziario',true);
const production={type:'activate',sector:'Tessile',intensity:1};
assert.equal(productionPreview(s,production).coins,1);next=applyCommand(s,production);
assert.equal(next.players[0].coins-s.players[0].coins,1);assert.equal(next.players[0].coinsGainedBy.politicaWelfare,1);
assert.equal(next.players[0].welfareRondelStats.benefits.cooperation,1);
s.players[0].depts.terziario.sopra.pop();next=applyCommand(s,production);assert.equal(next.players[0].coins,s.players[0].coins);

s=fixture('Borsa','reliability');s.phase='borsa';for(const k in s.players[0].resources)s.players[0].resources[k]=20;
cmd=legalCommands(s).find(c=>c.type==='completeContract');next=applyCommand(s,cmd);
assert.equal(next.players[0].coins-s.players[0].coins,s.rowEconomy.contractCoins[cmd.size]+2);
assert.equal(next.players[0].welfareRondelStats.benefits.reliability,2);assert.equal(next.players[0].coinsGainedBy.politicaWelfare,2);

s=fixture('Tessile','mutualAid');staff(s);next=applyCommand(s,production);
assert.ok(next.pending.welfareRondel);assert.equal(next.players[0].resources.Tessuti,2);
assert.deepEqual(legalCommands(next).filter(c=>c.use).map(c=>c.take),['Metallurgica','Chimica']);
const converted=applyCommand(next,{type:'resolveEffect',use:true,take:'Metallurgica'});
assert.equal(converted.players[0].resources.Tessuti,1);assert.equal(converted.players[0].resources.Acciaio,1);
assert.equal(converted.players[0].welfareRondelStats.benefits.mutualAid,1);assert.equal(converted.current,1);
assert.throws(()=>applyCommand(next,{type:'resolveEffect',use:true,take:'Tessile'}));
assert.equal(applyCommand(next,{type:'resolveEffect',use:false}).players[0].resources.Tessuti,2);
s.players[0].depts.terziario.tension=4;s.players[0].resources.Tessuti=5;
assert.equal(applyCommand(s,production).pending,null,'Old stock alone cannot trigger mutual aid');
// Existing machine choices remain queued behind the policy, each offered exactly once.
s=fixture('Tessile','mutualAid');staff(s);
s.players[0].depts.terziario.sotto=[Object.values(WORKER_BY_ID).find(w=>w.effect.verbo==='scambia').id];
next=applyCommand(s,production);assert.equal(next.pending.welfareRondel,true);assert.equal(next.pendingQueue.length,1);
next=applyCommand(next,{type:'resolveEffect',use:false});assert.equal(next.pending.type,'effect');assert.ok(!next.pending.welfareRondel);
next=applyCommand(next,{type:'resolveEffect',use:false});assert.equal(next.current,1);

const memory=new Map(),storage={getItem:k=>memory.get(k)??null,setItem:(k,v)=>memory.set(k,v)};
s=fixture('Tessile','mutualAid');staff(s);next=applyCommand(s,production);
saveGame(config,{state:next,history:[s],paused:true},storage);
const plain=v=>JSON.parse(JSON.stringify(v));
const restored=loadGame(storage);assert.deepEqual(plain(restored.state),plain(next));assert.deepEqual(plain(gameSession(config,restored).history),plain([s]));
assert.ok(applyCommand(restored.state,{type:'resolveEffect',use:true,take:'Chimica'}).players[0].resources.Coloranti);
const legacy=defaults();delete legacy.welfareRondel;assert.equal(parseConfig(JSON.stringify(legacy)).welfareRondel,false);
assert.equal(welfarePolicy(initGame(gameConfig(defaults())),{welfarePosition:0}),null);

// End-to-end games include conservation, report counters and legal replay under each player count.
for(const players of [2,3,4]){
 const c={...editor,players,turns:8,simulation:{...editor.simulation,ai:'greedy',seed:45600+players}},cfg=gameConfig(c);
 const game=await runGame(cfg);let replay=initGame(cfg);
 for(const command of game.commands)replay=applyCommand(replay,command);
 assert.deepEqual(replay,game.finalState);assert.equal(game.study.verified.money,players);assert.equal(game.study.verified.resources,players);
 const report=textReport(c,[game],'Completata');assert.ok(report.includes('## Rondella Welfare'));assert.ok(!report.includes('NaN'));assert.ok(!report.includes('undefined'));
}
// Search only sees reachable first-entry destinations.
s=fixture();s.players[0].coins=1;s.turn=27;s.aiRollout={depth:2,rollouts:1};
for(const p of s.players)p.aiContinuation='forecast2';
for(const bank in s.banks)s.banks[bank]=[];
const untouched=structuredClone(s);resetRolloutStats();cmd=chooseCommand(s);
assert.ok(legalCommands(s).some(c=>JSON.stringify(c)===JSON.stringify(cmd)));
assert.ok(rolloutStats.perDecisionLog.some(d=>d.node==='Servizi'&&d.nCandidates===2));assert.deepEqual(s,untouched);
// A cheap policy visit can be selected for future investments, without a token purchase quota.
s=fixture();s.rowEconomy.welfareFreeEntry=true;s.players[0].coins=3;s.players[0].depts.terziario.prod=2;s.players[1].coins=0;
s.turn=3;s.aiRollout={depth:2,rollouts:1};for(const bank in s.banks)s.banks[bank]=[];
s.banks.A=[Object.values(WORKER_BY_ID).find(w=>w.sector==='Tessile'&&w.v===2).id];
cmd=chooseCommand(s);assert.equal(cmd.type,'investWelfare');assert.equal(cmd.steps,1);
console.log('OK: six policies, 1–3 steps/tokens/cost, Formation last, legacy free-entry/six-step saves, shared slots, fixed start and second-visit Formation, real bonuses, floor one, pending queues, old saves, save/undo, immutable previews, AI alternatives, verified 2/3/4-player replays and Markdown reports.');
