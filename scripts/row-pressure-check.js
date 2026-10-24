import assert from 'node:assert/strict';
import { initGame, applyCommand, WORKER_BY_ID } from '../src/game/engine.js';
import { studyConfig } from './row-economy-config.js';
import { rowPressureState, newRowPressure, observeRowPressure, sampleRowPressureStart, summarizeRowPressure } from '../src/game/row-pressure.js';

const state = initGame(studyConfig());
const d = state.players[0].depts.terziario;
d.sopra = [Object.values(WORKER_BY_ID).find(w=>!w.power && w.sector===d.sector).id];
for (let pos=0; pos<=24; pos++) for (let tension=0; tension<=6; tension++) {
  d.prod=pos; d.tension=tension;
  const physicalRows=Array.from({length:6},(_,i)=>({ developed:pos>i*4, covered:i>=6-tension }));
  const measured=rowPressureState(state,d);
  assert.equal(measured.developed,physicalRows.filter(r=>r.developed).length);
  assert.equal(measured.blocked,physicalRows.filter(r=>r.developed && r.covered).length);
}
console.log('✓ 175 combinazioni sviluppo/tensione confrontate con le righe fisiche');

function produce(tension, sustainable=false) {
  const s=structuredClone(state); const dept=s.players[0].depts.terziario;
  s.phase='action'; s.current=0; s.players[0].node=dept.sector;
  dept.prod=5; dept.tension=tension; dept.sustainableWelfare=1;
  const cmd={type:'activate',sector:dept.sector,intensity:1,...(sustainable?{sustainableRow:tension===6?-1:0}:{})};
  const frozen=JSON.stringify(s), stats=newRowPressure(s), after=applyCommand(s,cmd);
  observeRowPressure(stats,s,cmd,after);
  assert.equal(JSON.stringify(s),frozen,'osservazione non muta lo stato');
  return stats;
}
let p=produce(4).productions[0];
assert.equal(p.before.blocked,0); assert.equal(p.after.blocked,1); assert.equal(p.modeLostRows,0);
p=produce(5).productions[0];assert.equal(p.before.blocked,1); assert.equal(p.modeLostRows,1);
p=produce(5,true).productions[0];assert.equal(p.before.blocked,1); assert.equal(p.modeLostRows,0);assert.equal(p.after.blocked,0);
p=produce(6,true).productions[0];assert.equal(p.modeLostRows,1);assert.equal(p.actualRows,0);
const sum=summarizeRowPressure([produce(4),produce(5),produce(5,true),produce(6,true)]);
assert.equal(sum.all.n,4);assert.equal(sum.all.blockedBefore,3);assert.equal(sum.all.lost,2);assert.equal(sum.all.potential,6);
assert.equal(sum.recoveries.find(x=>x.type==='sustainable').reopened,2);
console.log('✓ incasso prima del blocco, rinuncia sostenibile e perdita effettiva distinti');

const observed=newRowPressure(state);state.phase='move';state.pending=null;
sampleRowPressureStart(observed,state);sampleRowPressureStart(observed,state);
assert.equal(observed.starts.length,3);
assert.equal(observed.starts.filter(x=>x.staffed).length,1);
state.tracks.terziario[2]={coins:1};assert.equal(newRowPressure(state).unitRows,false);
console.log('✓ una fotografia per turno, reparti vuoti esclusi e template non uniforme riconosciuto');
