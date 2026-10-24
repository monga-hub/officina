import assert from 'node:assert/strict';
import { defaults, playableConfig } from '../src/lab/config.js';
import { initGame, applyCommand, WORKER_BY_ID } from '../src/game/engine.js';
import { rowActionPreview } from '../src/components/row-action-preview.js';

const legacyConfig=playableConfig(defaults(),2);
legacyConfig.rowEconomy={...legacyConfig.rowEconomy,welfareMode:'permanent',welfareCost:3,welfareHireDiscount:true,repressionStep:1};
const initial=initGame(legacyConfig);
initial.phase='action';
initial.players[0].coins=30;
initial.players[0].resources={Tessuti:4,Acciaio:3,Coloranti:2};
const roles=['terziario','secondario','primario'];

function preview(state,command) {
  const saved=structuredClone(state),registry=structuredClone(WORKER_BY_ID);
  const result=rowActionPreview(state,command);
  assert.deepEqual(state,saved,'A preview must not change the live game');
  assert.deepEqual(WORKER_BY_ID,registry,'A preview must not change the card registry');
  const actor=state.players[state.current];
  const after=applyCommand(state,command).players.find(p=>p.id===actor.id);
  assert.deepEqual(after.resources,actor.resources,'Recovery and welfare do not produce resources');
  assert.equal(result.cost,actor.coins-after.coins);
  return result;
}

// Recovery can lower tension without reopening a developed row.
for(const [i,[prod,tension,available,nextAvailable]] of [
  [13,1,3,4],[1,1,1,1],[13,3,1,3],[13,4,0,2],[5,3,1,2],
].entries()) {
  const state=structuredClone(initial),p=state.players[0],d=p.depts.terziario;
  p.node='Sindacato';p.repressions=i;d.prod=prod;d.tension=tension;
  const result=preview(state,{type:'repress',role:'terziario'});
  assert.equal(result.cost,2+i,'The price includes all earlier repressions');
  assert.equal(result.departments.length,1);
  const {before,after}=result.departments[0];
  assert.equal(before.tension,tension);
  assert.equal(after.tension,Math.max(0,tension-2));
  assert.equal(before.available,available);
  assert.equal(after.available,nextAvailable);
  assert.equal(after.welfare,before.welfare);
}

const factory=structuredClone(initial);
factory.players[0].node='Servizi';factory.rowEconomy.welfareCost=7;
roles.forEach((role,i)=>Object.assign(factory.players[0].depts[role],{
  prod:5+4*i,tension:2+i,sustainableWelfare:i,
}));
const investment=preview(factory,{type:'investWelfare',scope:'factory'});
assert.equal(investment.cost,7);
assert.equal(investment.departments.length,3);
investment.departments.forEach(({before,after},i)=>{
  assert.equal(before.welfare,i);assert.equal(after.welfare,i+1);
  assert.equal(after.sustainableLimit,i+1,'The limit describes future production capacity');
  assert.equal(after.hireDiscount,i+1,'Hiring discounts accumulate with welfare');
  assert.equal(after.tension,before.tension,'Buying welfare does not lower tension immediately');
  assert.equal(after.available,before.available,'Buying welfare does not reopen rows');
});
assert.equal(investment.departments[2].after.available,0);
assert.equal(investment.departments[2].after.sustainableLimit,3,'Future capacity is not current output');

const local=structuredClone(factory);
local.rowEconomy.welfareScope='department';local.rowEconomy.welfareHireDiscount=false;
const localInvestment=preview(local,{type:'investWelfare',role:'terziario'});
assert.equal(localInvestment.departments.length,1);
assert.equal(localInvestment.departments[0].after.welfare,1);
assert.equal(localInvestment.departments[0].after.sustainableLimit,1);
assert.equal(localInvestment.departments[0].after.hireDiscount,0);
const localAfter=applyCommand(local,{type:'investWelfare',role:'terziario'}).players[0];
for(const role of ['secondario','primario'])
  assert.deepEqual(localAfter.depts[role],local.players[0].depts[role],'Department welfare leaves other departments alone');

const capped=structuredClone(factory);
for(const role of roles) Object.assign(capped.players[0].depts[role],{
  sustainableWelfare:5,sopra:[],blocked:[],
});
for(const {before,after} of preview(capped,{type:'investWelfare',scope:'factory'}).departments) {
  assert.equal(before.sustainableLimit,4);assert.equal(after.sustainableLimit,4);
  assert.equal(after.welfare,6);assert.equal(after.hireDiscount,6);
  assert.equal(after.staffed,false,'Capacity does not promise production without workers');
}

// The final action still previews the actor, even when the game ends.
for(const type of ['repress','investWelfare']) {
  const state=structuredClone(initial);
  state.current=1;state.roundTurns=1;state.turn=state.roundLimit;
  const p=state.players[1];p.coins=29;p.repressions=4;
  p.node=type==='repress'?'Sindacato':'Servizi';
  p.depts.primario.tension=4;p.depts.primario.prod=13;
  p.depts.primario.sustainableWelfare=2;
  const command=type==='repress'?{type,role:'primario'}:{type,scope:'factory'};
  assert.ok(applyCommand(state,command).gameOver);
  const result=preview(state,command);
  assert.equal(result.cost,type==='repress'?6:3);
  const department=result.departments.find(d=>d.before.sector===p.depts.primario.sector);
  assert.equal(department.after.tension,type==='repress'?2:4);
  assert.equal(department.after.welfare,type==='repress'?2:3);
}
const tokens=initGame(playableConfig(defaults(),2));
tokens.phase='action';tokens.players[0].node='Sindacato';tokens.players[0].coins=30;
tokens.players[0].repressions=7;
roles.forEach((role,i)=>Object.assign(tokens.players[0].depts[role],{prod:13,tension:[3,1,4][i]}));
const repression=preview(tokens,{type:'repress',role:'terziario'});
assert.equal(repression.cost,2,'Redistribution has a fixed price');
assert.deepEqual(repression.departments.map(d=>[d.before.tension,d.after.tension]),[[3,0],[1,2],[4,4]]);
assert.deepEqual(repression.departments.map(d=>d.after.available),[4,2,0]);
tokens.players[0].node='Servizi';tokens.players[0].welfareTokens=2;
const bundle=preview(tokens,{type:'investWelfare',scope:'factory'});
assert.equal(bundle.cost,9);
assert.deepEqual(bundle.welfareTokens,{before:2,after:5});
bundle.departments.forEach(({before,after})=>{
  assert.equal(after.tension,before.tension);
  assert.equal(after.hireDiscount,0);
  assert.equal(after.sustainableLimit,0);
});
tokens.players[0].node='Chimica';tokens.players[0].welfareTokens=3;
const recovering=applyCommand(tokens,{type:'pass'});
assert.equal(recovering.pending.type,'welfareToken');
for(const count of [1,2,3]) {
  const recovery=preview(recovering,{type:'spendWelfareToken',role:'primario',count});
  assert.equal(recovery.cost,0);
  assert.deepEqual(recovery.welfareTokens,{before:3,after:3-count});
  assert.equal(recovery.departments[0].before.tension,4);
  assert.equal(recovery.departments[0].after.tension,4-count);
  assert.equal(recovery.departments[0].after.available,count);
}
console.log('OK: legacy previews; fixed-price redistribution across all departments, token purchase/recovery, row availability and immutable state.');
