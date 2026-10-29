import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gameConfig,validate,parseConfig} from '../src/lab/config.js';
import {initGame,applyCommand,legalCommands,hireCost,WORKER_BY_ID,forkForSearch} from '../src/game/engine.js';
import {WELFARE_FUNDS,policyBoosted,welfareAllocations,changeFund,policyFund,policyDescription} from '../src/game/welfare-funds.js';
import {WELFARE_POLICIES} from '../src/game/welfare-rondel.js';
import {saveGame,loadGame,gameSession} from '../src/lab/saved-game.js';
const c=JSON.parse(fs.readFileSync(new URL('../src/lab/latest-playtest.json',import.meta.url)));
c.roundRondel.fundThresholds={economy:3,personnel:4,production:3};validate(c);assert.deepEqual(parseConfig(JSON.stringify(c)),c);
const cfg=gameConfig(c),plain=x=>JSON.parse(JSON.stringify(x));
const fixture=(node='Servizi',policy='formation')=>{const s=initGame(cfg);s.phase='action';s.players[0].node=node;s.players[0].coins=20;s.players[0].welfarePosition=WELFARE_POLICIES.findIndex(p=>p.id===policy);return s;};
const fund=(s,id,amount)=>changeFund(s,id,amount);
const empty=fixture();assert.deepEqual(empty.roundRondel.funds,{economy:0,personnel:0,production:0});
assert.equal(legalCommands(empty).filter(x=>x.type==='investWelfare').length,19);
for(let n=1;n<=3;n++)for(const allocation of welfareAllocations(n)){
 const cmd={type:'investWelfare',count:n,funds:allocation},frozen=plain(empty),next=applyCommand(empty,cmd);
 assert.deepEqual(plain(empty),frozen);assert.deepEqual(next.roundRondel.funds,allocation);assert.equal(next.welfareBank,n);assert.equal(next.players[0].coins,20-n);assert.equal(next.players[0].welfareTokens,n);
 const search=applyCommand(forkForSearch(empty),cmd);assert.deepEqual(search.roundRondel.funds,allocation);assert.deepEqual(plain(empty),frozen);
}
for(const funds of [{economy:4,personnel:0,production:0},{economy:-1,personnel:1,production:1}])assert.throws(()=>applyCommand(empty,{type:'investWelfare',count:1,funds}));
assert.throws(()=>applyCommand(empty,{type:'investWelfare',count:1}));
let s=fixture('Sindacato');fund(s,'economy',3);fund(s,'personnel',4);fund(s,'production',3);s.players[0].depts.terziario.tension=2;
assert.ok(policyBoosted(s,'innovation'));assert.ok(!policyBoosted(s,'affinity'));assert.equal(policyFund('affinity').id,'personnel');assert.ok(!policyDescription(s,{id:'affinity',description:'Sconto fisso'}).upgraded);
const before=plain(s),repressed=applyCommand(s,{type:'repress',role:'terziario',fund:'economy'});
assert.deepEqual(plain(s),before);assert.equal(repressed.roundRondel.funds.economy,1);assert.equal(repressed.roundRondel.funds.personnel,4);assert.equal(repressed.roundRondel.funds.production,3);assert.equal(repressed.welfareBank,8);assert.equal(repressed.players[0].coins,22);assert.ok(!policyBoosted(repressed,'innovation'));
assert.equal(repressed.players[0].depts.terziario.tension,0);assert.equal(repressed.players[0].depts.secondario.tension,1);
fund(repressed,'economy',2);assert.ok(policyBoosted(repressed,'innovation'));
const cash=fixture('Sindacato');fund(cash,'production',1);cash.players[0].depts.terziario.tension=4;
assert.equal(applyCommand(cash,{type:'repress',role:'terziario',fund:'production'}).players[0].coins,21);
assert.equal(applyCommand(cash,{type:'repress',role:'terziario',fund:'economy'}).players[0].coins,20,'Empty target never steals from another fund');
function hiring(policy){const s=fixture('Tessile',policy),w=Object.values(WORKER_BY_ID).find(w=>w.sector==='Tessile'&&w.v===3);s.banks[s.nodeBanks.Tessile[0]]=[w.id];return {s,w,p:s.players[0],d:s.players[0].depts.terziario};}
for(const [policy,side,fid]of [['innovation','sotto','economy'],['integration','sopra','personnel']]){
 const {s,w,p}=hiring(policy);assert.equal(hireCost(s,p,w,'terziario',side),2);fund(s,fid,WELFARE_FUNDS.find(f=>f.id===fid).threshold);assert.equal(hireCost(s,p,w,'terziario',side),1);
}
for(const [pos,expected,bonus]of [[2,7,2],[16,20,1],[18,20,0]]){
 const {s,w,d}=hiring('formation');fund(s,'personnel',4);d.prod=pos;
 const cmd=legalCommands(s).find(x=>x.type==='hire'&&x.cardId===w.id&&x.side==='sopra'&&x.role==='terziario');const n=applyCommand(s,cmd);
 assert.equal(n.players[0].depts.terziario.prod,expected);assert.equal(n.players[0].welfareRondelStats.benefits.formation,bonus);
}
function production(policy,pos=11){const s=fixture('Tessile',policy),d=s.players[0].depts.terziario,ws=Object.values(WORKER_BY_ID).filter(w=>w.sector==='Tessile');d.prod=pos;d.sopra=[ws[0].id,ws.find(w=>w.nation!==ws[0].nation).id];fund(s,'production',3);return s;}
s=production('cooperation');let n=applyCommand(s,{type:'activate',sector:'Tessile',intensity:1});assert.equal(n.players[0].welfareRondelStats.benefits.cooperation,2);
for(const [pos,expected]of [[11,2],[2,1]]){
 s=production('mutualAid',pos);n=applyCommand(s,{type:'activate',sector:'Tessile',intensity:1});let used=0;
 while(n.pending){const cmds=legalCommands(n),cmd=cmds.find(c=>c.type==='resolveEffect'&&c.use&&c.take===(used?'Chimica':'Metallurgica'))||cmds.find(c=>c.type==='skipWelfareToken');assert.ok(cmd);if(cmd.type==='resolveEffect')used++;n=applyCommand(n,cmd);}
 assert.equal(used,expected);assert.equal(n.players[0].welfareRondelStats.benefits.mutualAid,expected);assert.equal(n.players[0].convCount.risorsaRisorsa,expected);
}
s=fixture('Borsa','reliability');fund(s,'economy',3);s.phase='borsa';s.players[0].resources={Tessuti:10,Acciaio:10,Coloranti:10};
const delivery=legalCommands(s).find(x=>x.type==='completeContract');assert.ok(delivery);n=applyCommand(s,delivery);assert.equal(n.players[0].welfareRondelStats.benefits.reliability,4);
const storageData=new Map(),storage={getItem:k=>storageData.get(k)??null,setItem:(k,v)=>storageData.set(k,v)};
saveGame(cfg,{state:repressed,history:[s],paused:true},storage);const saved=loadGame(storage);assert.ok(saved);assert.deepEqual(gameSession(saved.config,saved).state.roundRondel.funds,repressed.roundRondel.funds);
console.log('OK: three funds, every allocation, immutable search, thresholds/drop/recovery, targeted capped loot, all six upgrades, no future-resource conversion, save/resume.');
