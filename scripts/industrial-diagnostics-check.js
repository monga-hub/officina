import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initGame, applyCommand, legalCommands, WORKER_BY_ID } from '../src/game/engine.js';
import { industrialPreset } from '../src/game/industrial.js';
import { runOneGame, formatReport } from '../src/game/batchsim.js';
import { newIndustrialDiagnostics, observeIndustrial, industrialResourceBalance, formatIndustrialDiagnostics } from '../src/game/industrial-diagnostics.js';
const base = JSON.parse(fs.readFileSync(new URL('../src/game/baseline-config.json', import.meta.url)));
const cfg = industrialPreset({ ...base, seed: 1907, headless: true, nPlayers: 2, players: [{ name: 'A', isAI: true }, { name: 'B', isAI: true }] });
function setup() {
  const s = initGame(cfg), d = s.players[0].depts.terziario;
  d.sopra = Object.values(WORKER_BY_ID).filter(w => !w.power && w.sector === d.sector).slice(0, 2).map(w => w.id);
  s.current = 0; s.phase = 'action'; s.players[0].node = d.sector;
  return s;
}
function step(s, cmd, diag) {
  const before = JSON.stringify(s), after = applyCommand(s, cmd);
  observeIndustrial(diag, s, cmd, after);
  assert.equal(JSON.stringify(s), before, 'osservatore non muta lo stato originale');
  return after;
}
for (const intensity of [1, 2]) {
  const s = setup(), diag = newIndustrialDiagnostics(), d = s.players[0].depts.terziario;
  d.welfare = ['efficiency']; d.tension = 2;
  step(s, { type: 'activate', sector: d.sector, intensity }, diag);
  assert.equal(diag.productions[0].welfareBonus, intensity === 1 ? 1 : 0);
  assert.equal(diag.productions[0].welfareSuspended, intensity === 2);
}
console.log('✓ Mensa posseduta: distingue beneficio e sospensione dopo la spinta');
let s = setup(); const diag = newIndustrialDiagnostics();
s.turn = 13; s.players[0].depts.terziario.tension = 6; s.players[0].coins = 50;
s = step(s, { type: 'activate', sector: s.players[0].node, intensity: 1 }, diag);
assert.equal(diag.crises.length, 1); assert.equal(diag.crises[0].turn, 13);
s.current = 0; s.turn = 14; s.phase = 'move';
s = step(s, legalCommands(s).find(c => c.type === 'move' && c.node === 'Sindacato'), diag);
assert.equal(diag.visits[0].affordable, true);
s = step(s, { type: 'restartDepartment', role: 'terziario' }, diag);
assert.equal(diag.crises[0].restartTurn, 14);
s.current = 0; s.turn = 15; s.phase = 'action'; s.pending = null; s.players[0].node = s.players[0].depts.terziario.sector;
s = step(s, { type: 'activate', sector: s.players[0].node, intensity: 1 }, diag);
assert.equal(diag.productions.at(-1).turn, 15);
console.log('✓ Crisi, visita con cassa, riapertura e produzione successiva restano collegate');
const flow = industrialResourceBalance([{ resGainedBy: [{ produzione: 10, scambio: 2 }], resSpentByCat: [{ commesse: 3, scambio: 2, welfare: 2 }], resFinalByType: [{ A: 3, B: 1 }], resPerPV: 2, resDiscarded: [1] }]);
assert.equal(flow.difference, 0); assert.equal(flow.terminal, 2); assert.equal(flow.remainder, 2); assert.equal(flow.sinks.welfare, 2);
console.log('✓ Bilancio distingue Welfare, scambi, scarti e conversione finale');
const saved = JSON.parse(fs.readFileSync(new URL('../reports/quadra-greedy-2026-10-08.json', import.meta.url)));
for (const row of saved) {
  const g = runOneGame(row.config);
  assert.deepEqual(JSON.parse(JSON.stringify(g.results)), row.game.results, 'nessun effetto sul punteggio');
  assert.deepEqual(g.activationLog, row.game.activationLog, 'nessun effetto sulle decisioni');
  assert.equal(industrialResourceBalance([g]).difference, 0);
  assert.equal(g.industrial.diagnostics.checkpoints.length, g.results.length * 4);
  assert.equal(g.industrial.diagnostics.buys.length, g.industrial.players.reduce((a,p) => a + p.welfareBuys, 0));
  assert.equal(g.industrial.diagnostics.crises.length, g.industrial.players.reduce((a,p) => a + p.shutdowns, 0));
  assert.equal(g.industrial.diagnostics.productions.length, g.activationLog.length);
  const report = formatReport([g], row.config);
  assert.ok(!report.includes('abbandona un tracciato'));
  assert.ok(!report.includes('NaN'));
  assert.ok(report.includes('bonus sospeso'));
  assert.ok(report.includes('blocchi') || report.includes('Blocchi'));
  if (g.results.length === 2) {
    const fixture = { ...g, industrial: { ...g.industrial, diagnostics: diag } };
    const text = formatIndustrialDiagnostics([fixture]).join('\n');
    assert.match(text, /Fermate nate nei turni 8–14: 1; riaperte 1; hanno poi prodotto 1/);
  }
}
console.log('✓ Sei partite salvate: stessi risultati e mosse, bilancio chiuso, checkpoint per ciascun giocatore');
const legacy = runOneGame({ ...base, seed:1907, headless:true, players:Array.from({length:4}, (_,i)=>({name:`AI ${i}`,isAI:true})) });
const old = JSON.parse(fs.readFileSync(new URL('../reports/quadra-greedy-2026-10-08.json', import.meta.url)));
assert.equal(legacy.industrial, undefined);
assert.ok(formatReport([legacy], {...base,nPlayers:4}).includes('TRACCIATI'));
const historical = old[0].game;
assert.ok(formatIndustrialDiagnostics([historical]).join('\n').includes('non disponibile'));
console.log('✓ Report originale disponibile; le vecchie partite dichiarano i dettagli mancanti');
