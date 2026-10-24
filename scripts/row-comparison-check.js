import assert from 'node:assert/strict';
import fs from 'node:fs';
import { comparisonConfig, responsesToBlocks, responseSummary } from './row-comparison-analysis.js';
import { initGame, applyCommand, WORKER_BY_ID } from '../src/game/engine.js';
import { activeTrackEnd, trackGridPos, inferTrackModel } from '../src/game/data.js';
import { runOneGame } from '../src/game/batchsim.js';

for (const rows of [4,6]) {
  const cfg=comparisonConfig(1907,2,rows,0), s=initGame(cfg), d=s.players[0].depts.terziario;
  assert.equal(inferTrackModel(cfg),cfg.trackModel);
  assert.equal(s.industrial.tensionLimit,rows);
  assert.equal(s.trackMax,rows*4);
  assert.deepEqual(trackGridPos(1,rows*4,cfg.trackModel),[0,0]);
  assert.deepEqual(trackGridPos(rows*4,rows*4,cfg.trackModel),[rows-1,0]);
  for(let p=0;p<=rows*4;p++) for(let t=0;t<=rows;t++) {
    const physical=Array.from({length:rows},(_,i)=>p>i*4&&i<rows-t).filter(Boolean).length;
    assert.equal(activeTrackEnd(p,t,cfg.trackModel,true),physical*4);
  }
  d.prod=5; d.tension=rows-1;
  s.phase='action';s.current=0;s.players[0].node='Sindacato';s.players[0].coins=30;
  const out=applyCommand(s,{type:'repress',role:'terziario'});
  assert.equal(out.players[0].depts.terziario.tension,rows-3);
  assert.equal(out.players[0].coins,28);
  d.sopra=[Object.values(WORKER_BY_ID).find(w=>!w.power&&w.sector===d.sector).id];
  d.tension=rows-2;s.players[0].node=d.sector;
  const prod=applyCommand(s,{type:'activate',sector:d.sector,intensity:1});
  assert.equal(prod.activationLog.at(-1).track,2,'Incasso prima che la nuova tensione blocchi una riga');
  assert.equal(prod.players[0].depts.terziario.tension,rows-1);
}
assert.deepEqual(trackGridPos(1,16),[3,0],'Classico invariato');
assert.equal(inferTrackModel({tracks:{terziario:Array(17).fill(null)}}),'classico','Nessuna reinterpretazione dei vecchi salvataggi');
console.log('✓ geometria di entrambe le plance, copertura, incasso prima del blocco, repressione −2 e compatibilità');

const c=(seq,turn,role='A')=>({seq,turn,seat:0,role,cause:'activate'});
const a=(seq,turn,type,role)=>({seq,turn,seat:0,type,role});
let eps=responsesToBlocks({contacts:[c(0,10),c(5,15)],actions:[a(1,11,'hire','B'),a(2,12,'activate','B'),a(3,13,'repress','A'),a(4,14,'activate','A')],productions:[a(2,12,'activate','B'),a(4,14,'activate','A')],recoveries:[{...a(3,13,'repress','A'),reduction:2}]});
assert.equal(eps.length,1);assert.equal(eps[0].response,'produce_altro');assert.ok(eps[0].returned&&eps[0].recoveredBeforeReturn);assert.equal(eps[0].otherBeforeReturn,1);
eps=responsesToBlocks({contacts:[c(0,20),c(3,28,'B')],actions:[a(1,21,'activate','B')],productions:[a(1,21,'activate','B')],recoveries:[]});
assert.ok(eps[0].neverProducedAgainButOther);assert.equal(eps[1].remaining,0);assert.equal(responseSummary(eps.filter(e=>e.remaining>0)).n,1);
for(const reduction of [0,1]) {
  eps=responsesToBlocks({contacts:[c(0,10)],actions:[a(1,11,'activate','A')],productions:[a(1,11,'activate','A')],recoveries:[{...a(1,11,'activate','A'),reduction}]});
  assert.equal(eps[0].response,reduction?'recupera':'produce_stesso');
}
console.log('✓ cambio reparto seguito da ritorno, recupero effettivo, mancato ritorno e blocco finale distinti');

const cfg=comparisonConfig(1907,2,6,2), game=runOneGame(cfg);
const old=JSON.parse(fs.readFileSync('reports/cuscinetto-tensione-2026-10-15-d2.json')).records.find(r=>r.seed===1907&&r.label==='Scelta libera');
assert.deepEqual(game.rowPressure.starts,old.pressure.starts);
assert.deepEqual(game.rowPressure.productions.map(({seq,...r})=>r),old.pressure.productions);
for(const p of game.results) {
  const previous=old.people.find(x=>x.playerId===p.playerId);
  for(const k of Object.keys(p)) assert.deepEqual(JSON.parse(JSON.stringify(p[k])),previous[k]);
}
console.log('✓ partita 6 righe precedente riprodotta: produzioni, osservazioni e punteggi identici');
