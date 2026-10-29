import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as E from '../src/game/engine.js';
import * as A from '../src/game/ai.js';
const g=JSON.parse(fs.readFileSync(new URL('./fixtures/ai-welfare-games.json',import.meta.url))).timed0;
let s=E.initGame(g.config);
while(s.phase!=='move'||s.pending||!E.legalCommands(s).some(c=>c.node==='Servizi'))s=E.applyCommand(s,g.commands.shift());
s={...s,aiRollout:{depth:1,rollouts:1}};
function check(state,budgetMs,expected){
 const snapshot=JSON.stringify(state),cmd=A.chooseTimedCommand(state,budgetMs===undefined?{}:{budgetMs});
 assert.equal(A.lastDecision.budgetMs,expected);
 assert.equal(JSON.stringify(state),snapshot);
 assert.ok(E.legalCommands(state).some(c=>JSON.stringify(c)===JSON.stringify(cmd)));
 assert.ok(A.lastDecision.ms<expected+100);
 return cmd;
}
const move=check(s,undefined,15000);
const arrival=E.applyCommand(s,move);
if(arrival.phase==='action'&&!arrival.pending){A.chooseTimedCommand(arrival);assert.equal(A.lastDecision.reusedPlan,true);}
check(s,40,40);
const welfare=E.applyCommand(s,E.legalCommands(s).find(c=>c.node==='Servizi'));
check(welfare,undefined,15000);
check({...s,aiRollout:null},undefined,3000);
const ordinary=E.applyCommand(s,E.legalCommands(s).find(c=>c.type==='move'&&c.node!=='Servizi'&&c.node!=='Borsa'));
check(ordinary,undefined,3000);
for(const budgetMs of [0,-1,NaN,Infinity,null])assert.throws(()=>A.chooseTimedCommand(s,{budgetMs}),/Invalid AI budget/);
console.log('OK: adaptive Welfare/movement budget, explicit budget respected, early completion, plan reuse, ordinary decisions unchanged, legal immutable choices, invalid budgets rejected.');
