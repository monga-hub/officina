import assert from 'node:assert/strict';
import { initGame, applyCommand, legalCommands, WORKER_BY_ID } from '../src/game/engine.js';
import { normalizeRowEconomy } from '../src/game/row-economy.js';
import { comparisonConfig } from './row-comparison-analysis.js';
import { newRowPressure, observeRowPressure } from '../src/game/row-pressure.js';
import { investmentUses, fixedScheduleYield } from './welfare-use-analysis.js';

const roles=['terziario','secondario','primario'];
const at=(s,node)=>{s.current=0;s.phase='action';s.pending=null;s.pendingQueue=[];s.sindacatoSession=null;s.players[0].node=node;return s;};
assert.equal(normalizeRowEconomy().welfareScope,'department');
assert.equal(normalizeRowEconomy({welfareScope:'invalid'}).welfareScope,'department');
const cfg=comparisonConfig(1907,2,4,6);cfg.rowEconomy.welfareScope='factory';
let s=initGame(cfg);const pressure=newRowPressure(s);
for(const role of roles) {s.players[0].depts[role].tension=2;cfg.startTension[role]=2;}
at(s,'Servizi');s.players[0].coins=2;
assert.ok(!legalCommands(s).some(c=>c.type==='investWelfare'));
s.players[0].coins=10;
assert.deepEqual(legalCommands(s).filter(c=>c.type==='investWelfare'),[{type:'investWelfare',scope:'factory'}]);
assert.throws(()=>applyCommand(s,{type:'investWelfare',role:'terziario'}));
let before=s,cmd={type:'investWelfare',scope:'factory'};
s=applyCommand(s,cmd);observeRowPressure(pressure,before,cmd,s);
assert.notEqual(s.current,0,'L’investimento conclude il turno');
assert.equal(s.players[0].coins,7);
assert.equal(s.players[0].industrialStats.welfareBuys,1);
assert.equal(s.players[0].industrialStats.welfareSpent,3);
assert.ok(roles.every(r=>s.players[0].depts[r].sustainableWelfare===1&&s.players[0].depts[r].tension===2));
assert.ok(roles.every(r=>s.players[1].depts[r].sustainableWelfare===0));
assert.ok(legalCommands(at(s,'Servizi')).some(c=>c.type==='investWelfare'));
// Acquisto ripetuto verificato su una copia: il seguito isola il beneficio del primo.
const repeat=applyCommand(s,{type:'investWelfare',scope:'factory'});
assert.equal(repeat.players[0].coins,4);
assert.equal(repeat.players[0].industrialStats.welfareBuys,2);
assert.equal(repeat.players[0].industrialStats.welfareSpent,6);
assert.ok(roles.every(r=>repeat.players[0].depts[r].sustainableWelfare===2));
assert.ok(roles.every(r=>repeat.players[0].depts[r].tension===2));
// I reparti sono ancora vuoti all’acquisto: il beneficio vale anche per assunzioni successive.
for(const role of roles) {
  const d=s.players[0].depts[role];d.sopra=[Object.values(WORKER_BY_ID).find(w=>!w.power&&w.sector===d.sector).id];d.prod=5;
  at(s,d.sector);cmd=legalCommands(s).find(c=>c.sustainableRow===0);assert.ok(cmd);
  const tensions=roles.map(r=>s.players[0].depts[r].tension);
  before=s;s=applyCommand(s,cmd);observeRowPressure(pressure,before,cmd,s);
  roles.forEach((r,i)=>assert.equal(s.players[0].depts[r].tension,tensions[i]-(r===role?1:0)));
}
const record={seed:1907,rows:4,config:cfg,pressure};
const uses=investmentUses(record);assert.equal(uses.length,1);assert.equal(uses[0].uses,3);assert.equal(uses[0].cost,3);assert.equal(uses[0].tensionReduced,3);
assert.equal(fixedScheduleYield(record).length,1);
assert.equal(fixedScheduleYield(record)[0].actualResources,3);
assert.equal(fixedScheduleYield(record)[0].withoutResources,6);
console.log('✓ welfare aziendale: un costo, un turno, tre reparti anche futuri; recupero locale, acquisti ripetibili, statistiche senza triplicare la spesa');
