import assert from 'node:assert/strict';
import fs from 'node:fs';
import { investmentUses, pairedMetrics, fixedScheduleYield } from './welfare-use-analysis.js';

const sample={seed:1,rows:4,config:{rowEconomy:{welfareCost:3}},pressure:{unitRows:true,
 actions:[{type:'investWelfare',seat:0,role:'A',seq:0,turn:1},{type:'investWelfare',seat:0,role:'B',seq:3,turn:4}],
 productions:[
  {seat:0,role:'A',seq:1,turn:2,sustainable:true,before:{tension:0},after:{tension:0},voluntaryUnusedRows:1,actualRows:1},
  {seat:0,role:'A',seq:2,turn:3,sustainable:true,before:{tension:4},after:{tension:3},voluntaryUnusedRows:0,actualRows:0}],
 recoveries:[{seat:0,role:'A',seq:1,type:'sustainable',reduction:0,reopened:0},{seat:0,role:'A',seq:2,type:'sustainable',reduction:1,reopened:1}]} };
const [used,unused]=investmentUses(sample);
assert.equal(used.uses,2);assert.equal(used.tensionReduced,1);assert.equal(used.preventiveAtZero,1);
assert.equal(used.tensionAdvantage,2,'A zero previeni +1; al massimo recuperi −1 senza un ulteriore +1 evitabile');
assert.equal(used.foregoneResources,1);assert.equal(used.reopened,1);assert.equal(unused.uses,0);
const rs=JSON.parse(fs.readFileSync('reports/confronto-4-6-righe-2026-10-15-d6.json')).records.filter(r=>r.rows===4);
const schedule={seed:1,rows:4,config:{startTension:{A:2}},pressure:{actions:[{type:'investWelfare',seat:0,role:'A'}],recoveries:[],
  productions:[
    {seq:1,seat:0,role:'A',sustainable:true,before:{tension:2,developed:2},after:{tension:1},actualRows:1},
    {seq:2,seat:0,role:'A',sustainable:false,before:{tension:1,developed:2},after:{tension:2},actualRows:2},
    {seq:3,seat:0,role:'A',sustainable:false,before:{tension:2,developed:2},after:{tension:3},actualRows:2} ]}};
assert.equal(fixedScheduleYield(schedule)[0].difference,2,'Recupero sostenibile: rinuncia a 1 risorsa adesso, preserva 3 risorse dopo');
for(const r of rs) {
 const uses=investmentUses(r);
 assert.equal(uses.length,r.people.reduce((n,p)=>n+p.stats.welfareBuys,0));
 assert.equal(uses.reduce((n,p)=>n+p.uses,0),r.people.reduce((n,p)=>n+p.stats.sustainableProductions,0));
 const same=pairedMetrics(r,r,r.people[0].playerId);
 assert.ok(Object.values(same.difference).every(v=>v===0));
 assert.equal(fixedScheduleYield(r).length,uses.length);
}
console.log('✓ acquisto inutilizzato, prevenzione a tensione zero, recupero a limite e rinuncia produttiva distinti');
console.log('✓ contabilità degli investimenti e confronto individuale verificati sulle 12 partite di riferimento');
