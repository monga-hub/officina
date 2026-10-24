import assert from 'node:assert/strict';
import {initGame,applyCommand,legalCommands,WORKER_BY_ID} from '../src/game/engine.js';
import {comparisonConfig} from './row-comparison-analysis.js';
import {newRowPressure,observeRowPressure} from '../src/game/row-pressure.js';

const cfg=comparisonConfig(1907,2,4,6);
Object.assign(cfg.rowEconomy,{welfareScope:'factory',welfareHireDiscount:true});
const initial=initGame(cfg),role='terziario',d=initial.players[0].depts[role];
const worker=Object.values(WORKER_BY_ID).find(w=>!w.power&&w.sector===d.sector);
const machine=Object.values(WORKER_BY_ID).find(w=>!w.power&&w.effect?.verbo==='prendi'&&w.effect.f1.tipo==='moneta');
assert.ok(worker&&machine);
d.sopra=[worker.id];d.sotto=[machine.id];d.prod=9;d.sustainableWelfare=2;
initial.current=0;initial.phase='action';initial.pending=null;initial.pendingQueue=[];initial.players[0].node=d.sector;
const choices=s=>legalCommands(s).filter(c=>c.sustainableRow!==undefined);
assert.deepEqual(choices(initial).map(c=>c.sustainableRow),[[0,1],[0,2],[1,2]]);
const resources=p=>Object.values(p.resources).reduce((a,b)=>a+b,0);
for(const command of choices(initial)) {
  const before=JSON.stringify(initial),pressure=newRowPressure(initial);
  const after=applyCommand(initial,JSON.parse(JSON.stringify(command)));
  observeRowPressure(pressure,initial,command,after);
  assert.equal(JSON.stringify(initial),before);
  assert.equal(resources(after.players[0])-resources(initial.players[0]),2);
  assert.equal(after.players[0].coins-initial.players[0].coins,machine.effect.f1.q,'Macchinario una sola volta');
  assert.equal(pressure.productions[0].actualRows,2);
  assert.equal(pressure.productions[0].voluntaryUnusedRows,1);
}
for(const rows of [[0,0],[0,3],[0,1,2]]) assert.throws(()=>applyCommand(initial,{type:'activate',sector:d.sector,intensity:1,sustainableRow:rows}));
for(const [count,position,tension,expected] of [[1,9,0,1],[2,9,2,2],[2,9,3,1],[2,9,4,0],[3,9,0,3],[5,13,0,4]]) {
  const s=structuredClone(initial),dept=s.players[0].depts[role];
  dept.sustainableWelfare=count;dept.prod=position;dept.tension=tension;
  const command=choices(s)[0],after=applyCommand(s,command),pressure=newRowPressure(s);
  observeRowPressure(pressure,s,command,after);
  assert.equal(resources(after.players[0])-resources(s.players[0]),expected);
  assert.equal(pressure.productions[0].actualRows,expected);
  assert.equal(after.players[0].depts[role].tension,Math.max(0,tension-1));
  assert.equal(after.players[0].coins-s.players[0].coins,machine.effect.f1.q);
}
const different=structuredClone(initial);different.players[0].depts[role].sotto=[];
different.tracks[role][1]={res:1};different.tracks[role][5]={coins:2};different.tracks[role][9]={res:2};
const after=applyCommand(different,{type:'activate',sector:d.sector,intensity:1,sustainableRow:[1,2]});
assert.equal(resources(after.players[0])-resources(different.players[0]),2);
assert.equal(after.players[0].coins-different.players[0].coins,2);
console.log('✓ welfare 1/2/3/5: righe multiple a scelta, limite sviluppo/tensione, zero righe, recupero −1, macchinari una volta, telemetria e comandi non validi');
