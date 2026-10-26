import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaults, gameConfig } from '../src/lab/config.js';
import { initGame, applyCommand, legalCommands, WORKER_BY_ID } from '../src/game/engine.js';
import * as ai from '../src/game/ai.js';
const url=new URL('../src/game/ai.js',import.meta.url);
const source=fs.readFileSync(url,'utf8').replace('if (planned && planned.key === planKey(state))','if (false && planned && planned.key === planKey(state))').replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${new URL(p,url).href}'`);
const old=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function fixture(players,rondel){
 const c=defaults();c.players=players;c.welfareRondel=rondel;c.simulation.ai='forecast2';c.simulation.depth=6;
 const s=initGame(gameConfig(c));s.turn=26;s.phase='move';const p=s.players[0];p.node='Borsa';p.coins=2;p.welfareTokens=2;
 for(const bank in s.banks)s.banks[bank]=[];
 for(const size in s.contracts)s.contracts[size]={deck:[],active:[]};
 s.contracts.small.active=[{card:{id:'plan-test',size:'small',pv:[5,3],reqs:[['Tessile','Tessile','Tessile']],engine:null},doneReq:[false],places:[null,null]}];
 const d=p.depts.terziario;d.prod=9;d.tension=0;d.sopra=[Object.values(WORKER_BY_ID).find(w=>w.sector==='Tessile').id];
 return s;
}
const results=[];
for(const players of [2,3,4])for(const rondel of [false,true]){
 const s=fixture(players,rondel),snapshot=structuredClone(s),runs={};
 for(const[name,impl]of[['before',old],['after',ai]]){
  impl.resetRolloutStats();const t=performance.now();const move=impl.chooseCommand(s),moved=applyCommand(s,move),action=impl.chooseCommand(moved);
  assert.equal(moved.phase,'action');assert.ok(legalCommands(moved).some(c=>JSON.stringify(c)===JSON.stringify(action)));
  runs[name]={ms:performance.now()-t,move,action,evaluations:impl.rolloutStats.evaluateCalls,reused:impl.rolloutStats.reusedMovePlans};
 }
 assert.deepEqual(runs.after.move,runs.before.move);assert.deepEqual(runs.after.action,runs.before.action);
 assert.equal(runs.after.reused,1);assert.ok(runs.after.evaluations<runs.before.evaluations);assert.deepEqual(s,snapshot);
 // An edited state must invalidate the plan; do not reuse it across undo or rule changes.
 ai.chooseCommand(s);const changed=applyCommand(s,runs.after.move);changed.players[0].coins+=1;
 const reused=ai.rolloutStats.reusedMovePlans;assert.deepEqual(ai.chooseCommand(changed),old.chooseCommand(changed));assert.equal(ai.rolloutStats.reusedMovePlans,reused);
 // The worker card registry is external to the saved state and belongs to the key too.
 ai.chooseCommand(s);const moved=applyCommand(s,runs.after.move),worker=Object.values(WORKER_BY_ID)[0],value=worker.v;
 worker.v+=1;const reusedBefore=ai.rolloutStats.reusedMovePlans;
 assert.deepEqual(ai.chooseCommand(moved),old.chooseCommand(moved));assert.equal(ai.rolloutStats.reusedMovePlans,reusedBefore);worker.v=value;
 results.push({players,rondel,...runs});
}
if(process.argv.includes('--save')){fs.mkdirSync('reports/ai-performance',{recursive:true});fs.writeFileSync('reports/ai-performance/move-plan.json',JSON.stringify(results,null,2));}
console.log('OK: exact d6 movement/action pairs; reuse removes duplicate search; edited states and card changes invalidate; 2/3/4 players, rondel on/off.');
