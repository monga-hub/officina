import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as E from '../src/game/engine.js';
import * as A from '../src/game/ai.js';
const game=JSON.parse(fs.readFileSync(new URL('./fixtures/ai-welfare-games.json',import.meta.url))).funds0;
let state=E.initGame(game.config);
for(const command of game.commands){
  if(state.turn===13&&state.current===1&&command.type==='investWelfare')break;
  state=E.applyCommand(state,command);
}
assert.equal(state.turn,13);
// Keep this affordability case at two coins when earlier hiring discounts change.
state.players[state.current].coins=2;
const evidence=[];
function decide(label,s){
 const snapshot=JSON.stringify(s);A.resetRolloutStats();
 const command=A.chooseTimedCommand(s,{budgetMs:3000});
 assert.equal(JSON.stringify(s),snapshot);
 assert.ok(E.legalCommands(s).some(c=>JSON.stringify(c)===JSON.stringify(command)));
 assert.ok(A.lastDecision.ms<3000,JSON.stringify(A.lastDecision));
 const comparison=A.rolloutStats.perDecisionLog.filter(x=>x.compared&&x.depth===A.lastDecision.completedDepth&&x.turn===s.turn&&x.seat===s.current).at(-1);
 assert.ok(comparison,'retain the last complete comparison');
 assert.equal(comparison.compared.length,E.legalCommands(s).length,'compare every allocation and alternative');
 evidence.push({label,command,...A.lastDecision,comparison});return command;
}
const buy=decide('usable tokens',state);
assert.equal(buy.type,'investWelfare');
// Exact quantity depends on reaching d6; slower hosts can finish a shallower search in three seconds.
const snapshot=JSON.stringify(state),complete=A.chooseCommand(state);
assert.equal(JSON.stringify(state),snapshot);
assert.equal(complete.type,'investWelfare');
assert.equal(complete.count,2,'the completed d6 forecast prefers two; three is not affordable');
const stocked=structuredClone(state);stocked.players[stocked.current].welfareTokens=20;
stocked.roundRondel.funds={economy:3,personnel:4,production:3};stocked.welfareBank=10;
assert.notEqual(decide('same factory, sufficient stock and active funds',stocked).type,'investWelfare');
assert.ok(evidence.at(-1).comparison.compared.some(x=>x.withoutPurchaseValue>=x.value),'same future plan attainable without purchase');
const last=structuredClone(state);last.turn=28;
assert.notEqual(decide('no future turn to use new tokens',last).type,'investWelfare');
const poor=structuredClone(state);poor.players[poor.current].coins=0;
assert.equal(E.legalCommands(poor).some(c=>c.type==='investWelfare'),false);
const fixed=A.evaluate(state,state.current);
for(const n of [0,1,3,20]){
 const s=structuredClone(state);s.players[s.current].welfareTokens=n;
 assert.equal(A.evaluate(s,s.current),fixed,'no artificial score for holding tokens');
}
if(process.argv.includes('--save'))fs.writeFileSync('reports/ai-performance/welfare-tre-secondi-controlli.json',JSON.stringify(evidence,null,2));
console.log('OK: useful purchase and quantity, sufficient stock, endgame restraint, affordability, all allocations, same-path no-purchase comparison, legal immutable decisions within budget.');
// A skipped optional prompt may be absent after not buying; it is not proof tokens are useful.
const aiURL=new URL('../src/game/ai.js',import.meta.url);
const probeSource=fs.readFileSync(aiURL,'utf8').replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${new URL(p,aiURL).href}'`)+'\nexport {followCommands};';
const probe=await import('data:text/javascript;base64,'+Buffer.from(probeSource).toString('base64'));
E.initGame(game.config);
const noTokens=E.applyCommand(state,{type:'pass'});
assert.equal(noTokens.pending,null);
const normalized=probe.followCommands(noTokens,[{type:'skipWelfareToken'}]);
assert.deepEqual(JSON.parse(JSON.stringify(normalized)),JSON.parse(JSON.stringify(noTokens)));
assert.equal(probe.followCommands(noTokens,[{type:'spendWelfareToken',role:'primario',count:1}]),null);
console.log('OK: absent optional recovery prompts are normalized, actual unavailable token spending is rejected.');
