import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initGame, legalCommands, WORKER_BY_ID } from '../src/game/engine.js';
import { evaluate, chooseCommand } from '../src/game/ai.js';
import { comparisonConfig } from './row-comparison-analysis.js';
import { runOneGame } from '../src/game/batchsim.js';

const cfg=comparisonConfig(1907,2,4,6), s=initGame(cfg), p=s.players[0], d=p.depts.terziario;
assert.equal(p.aiEvaluation,'baseline','Nessuna variante sperimentale promossa a default');
d.sopra=[Object.values(WORKER_BY_ID).find(w=>!w.power&&w.sector===d.sector).id];
s.phase='action';p.node='Servizi';
for(const turn of [1,10,25,28]) for(const tension of [0,2,4]) {
  s.turn=turn;d.tension=tension;
  p.aiEvaluation='baseline';d.sustainableWelfare=0;
  const oldWithout=evaluate(s,0), legal=legalCommands(s);
  d.sustainableWelfare=1;const oldWith=evaluate(s,0);
  p.aiEvaluation='observed';d.sustainableWelfare=0;
  assert.equal(evaluate(s,0),oldWithout,'Nessun cambiamento di valore per gli altri investimenti');
  assert.deepEqual(legalCommands(s),legal,'Stesse opzioni legali, incluso acquistare welfare');
  d.sustainableWelfare=1;
  assert.equal(evaluate(s,0),oldWithout,'Il possesso inutilizzato non ha un premio');
  p.aiEvaluation='rollout-return';
  assert.equal(evaluate(s,0),oldWith,'La policy delle continuazioni resta identica');
  assert.equal(evaluate(s,0,true),oldWithout,'Il confronto finale non premia il possesso');
  assert.ok(Math.abs(oldWith-oldWithout-Math.min(4,(28-turn)/5)*2.3)<1e-10);
  p.node=d.sector;
  assert.ok(legalCommands(s).some(c=>c.sustainableRow!==undefined),'La produzione sostenibile resta disponibile');
  p.node='Servizi';
}
s.gameOver=true;
p.aiEvaluation='baseline';const terminal=evaluate(s,0);
p.aiEvaluation='observed';assert.equal(evaluate(s,0),terminal,'Stesso punteggio reale finale');
console.log('✓ stesse azioni e punteggio finale; unico delta = rimozione del premio di possesso');

// Una riga accessibile: stessa resa, recupero al posto dell'aumento di tensione.
// Nessun premio al possesso è necessario per riconoscere il vantaggio dell'uso.
s.gameOver=false;s.turn=10;s.aiRollout=null;p.node=d.sector;p.coins=0;
for(const bank of Object.keys(s.banks)) s.banks[bank]=[];
d.prod=1;d.tension=2;
const chosen=chooseCommand(s);
assert.equal(chosen.type,'activate');assert.equal(chosen.sustainableRow,0);
console.log('✓ welfare già disponibile usato quando dà la stessa resa e meno tensione');

const old=JSON.parse(fs.readFileSync('reports/confronto-4-6-righe-2026-10-15-d6.json')).records.find(r=>r.seed===1907&&r.rows===4);
const replay=runOneGame({...old.config,players:old.config.players.map(p=>({...p,aiEvaluation:'baseline'}))});
assert.ok(!replay.failed);assert.equal(replay.turns,28);
assert.deepEqual(JSON.parse(JSON.stringify(replay.rowPressure)),old.pressure,'Riproduzione completa delle scelte osservate');
for(const actual of replay.results) {
  const previous=old.people.find(p=>p.playerId===actual.playerId);
  for(const k of Object.keys(actual)) assert.deepEqual(JSON.parse(JSON.stringify(actual[k])),previous[k]);
}
console.log('✓ vecchia IA d6: stesso seed, stessi punteggi e intera telemetria identica al report precedente');

for(const [version,report] of [['observed','ia-neutrale'],['rollout-return','ia-rollout-return']]) {
  const record=JSON.parse(fs.readFileSync(`reports/${report}-2026-10-15-d6.json`)).records.find(r=>r.seed===1907&&r.versions[0]===version);
  const game=runOneGame(record.config);
  assert.ok(!game.failed);assert.equal(game.turns,28);
  assert.deepEqual(JSON.parse(JSON.stringify(game.rowPressure)),record.pressure);
  for(const actual of game.results) {
    const previous=record.people.find(p=>p.playerId===actual.playerId);
    for(const k of Object.keys(actual)) assert.deepEqual(JSON.parse(JSON.stringify(actual[k])),previous[k]);
  }
  console.log(`✓ ${version} d6: codice integrato riproduce punteggi e telemetria dell'esperimento`);
}
