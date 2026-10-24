import fs from 'node:fs';
import assert from 'node:assert/strict';
import {initGame,applyCommand,legalCommands} from '../src/game/engine.js';
import {chooseCommand,continuationValue,evaluate,resetRolloutStats,rolloutStats} from '../src/game/ai.js';
const old=JSON.parse(fs.readFileSync('reports/welfare-beneficio-futuro-2026-10-16-d6-1907-c3.json'),(k,v)=>v?.$officinaNumber==='Infinity'?Infinity:v);
initGame(old.config);
for(const snap of old.baseline.snapshots){
  const s=applyCommand(applyCommand(snap.state,snap.move),snap.buy),frozen=structuredClone(s);
  const recorded=old.decisions.find(d=>d.seat===snap.seat).lookahead[0].buy;
  assert.equal(continuationValue(s,6,snap.seat),recorded,'Vecchia ricerca numericamente identica al report precedente');
  s.players[snap.seat].aiContinuation='forecast2';
  assert.equal(evaluate(s,snap.seat),evaluate(frozen,snap.seat),'Pesi invariati');
  assert.equal(continuationValue(s,0,snap.seat),evaluate(s,snap.seat,true));
  resetRolloutStats();const v=continuationValue(s,6,snap.seat);
  assert.ok(Number.isFinite(v)&&rolloutStats.beamForecasts>0&&rolloutStats.beamLayers<=6);
  s.players[snap.seat].aiContinuation='greedy';
  assert.ok(v>=continuationValue(s,6,snap.seat),'Percorso greedy sempre conservato');
  s.players[snap.seat].aiContinuation='beam2';assert.deepEqual(s,frozen);
}
// Fine partita: nessun rendimento futuro può giustificare una spesa senza PV.
for(const count of [1,2,4]){
  const cfg=structuredClone(old.config);cfg.players.forEach(p=>p.aiContinuation='forecast2');
  const s=initGame(cfg);s.turn=28;s.current=1;s.phase='action';s.players[1].node='Servizi';s.players[1].coins=50;
  for(const d of Object.values(s.players[1].depts))d.sustainableWelfare=count;
  assert.ok(legalCommands(s).some(c=>c.type==='investWelfare'));
  const frozen=structuredClone(s),cmd=chooseCommand(s);
  assert.notEqual(cmd.type,'investWelfare','Non compra per aumentare una quota di welfare');
  assert.ok(legalCommands(s).some(c=>JSON.stringify(c)===JSON.stringify(cmd)));
  assert.deepEqual(s,frozen);
  s.gameOver=true;assert.equal(continuationValue(s,6,1),evaluate(s,1,true));
}
console.log('✓ precedente identica, pesi invariati, d6, stati immutati, comandi legali, nessun secondo/terzo/quinto welfare inutile a fine partita');
