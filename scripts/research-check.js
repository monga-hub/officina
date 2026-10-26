import assert from 'node:assert/strict';
import { researchSummary } from '../src/lab/research.js';
const events=[
 {turn:1,seat:0,type:'investWelfare',node:'Servizi',policyBefore:null,policyAfter:0,steps:1,spent:1,tokensGained:1,availableActions:['hire','investWelfare'],availablePolicies:[0,1]},
 {turn:2,seat:0,type:'hire',side:'sopra',policyBenefits:{formation:1}},
 {turn:3,seat:0,type:'investWelfare',node:'Servizi',policyBefore:0,policyAfter:0,steps:6,spent:6,tokensGained:6,availableActions:['investWelfare'],availablePolicies:[0]},
 {turn:4,seat:0,type:'hire',side:'sopra',policyBenefits:{formation:1}},
 {turn:5,seat:0,type:'investWelfare',node:'Servizi',policyBefore:0,policyAfter:1,steps:1,spent:1,tokensGained:1},
 {turn:6,seat:0,type:'activate',role:'terziario',protected:true,policyBenefits:{cooperation:1}},
 {turn:7,seat:0,type:'repress',node:'Sindacato',role:'terziario',spent:2,availableActions:['repress','hire'],affected:[{role:'terziario',before:{available:0},after:{available:2}}]},
 {turn:8,seat:0,type:'spendWelfareToken',role:'terziario',tokens:2},
 {turn:8,seat:0,type:'activate',role:'terziario',policyBenefits:{cooperation:1}},
 {turn:9,seat:0,type:'investWelfare',policyBefore:1,policyAfter:2,steps:1,spent:1,tokensGained:1},
 {turn:10,seat:1,type:'hire',side:'sotto',node:'Sindacato',availableActions:['hire']},
].map((e,seq)=>({...e,seq}));
const game={seed:1,turns:10,finalState:{players:[{id:0,welfareTokens:3},{id:1,welfareTokens:0}]},study:{events,productions:events.filter(e=>e.type==='activate')}};
const r=researchSummary([game]);
assert.equal(r.players,2);assert.equal(r.totalTurns,20);
assert.equal(r.participation.find(p=>p.id==='production').playerPercent,50);
assert.equal(r.participation.find(p=>p.id==='production').turnPercent,10);
assert.equal(r.fullLaps,1);assert.equal(r.firstEntries,1);assert.equal(r.purchasedTokens,9);
assert.deepEqual(r.spells.map(s=>[s.futureTurns,s.value,s.unused]),[[2,1,false],[2,1,false],[4,2,false],[1,0,true]]);
assert.deepEqual(r.spells.map(s=>s.directCoinReturn),[null,null,2,0]);
assert.equal(r.policyCoinReturn,2,'Development steps must not be added to coin returns');
assert.equal(r.policies[0].offeredTurns,2);assert.equal(r.policies[0].chosenWhenOfferedPercent,100);
assert.equal(r.interventions.find(e=>e.type==='repress').followingProductions,1);
assert.equal(r.interventions.find(e=>e.type==='repress').reopened,2);
assert.equal(r.interventions.find(e=>e.type==='spendWelfareToken').tokens,2);
assert.deepEqual(r.opportunities[1],{node:'Sindacato',measuredTurns:2,actionAffordable:1,choseAction:1,choseCard:1,neitherAffordable:0});
const doubled=researchSummary([game,game]);assert.equal(doubled.players,4);assert.equal(doubled.policies[0].players,2);assert.equal(doubled.policies[0].offeredTurns,4);
assert.equal(doubled.participation.find(p=>p.id==='production').playerPercent,50);
const old=structuredClone(game);delete old.study.events[5].protected;old.commands=events.map(e=>({type:e.type}));old.commands[5].welfareToken=true;
assert.equal(researchSummary([old]).participation.find(p=>p.id==='protection').events,1);
assert.equal(researchSummary([]).participation[0].playerPercent,null);
console.log('Research checks passed: denominators, intervals, currencies, opportunities, interventions and historical protection.');
