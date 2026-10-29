import fs from 'node:fs';
import assert from 'node:assert/strict';
import { defaults, gameConfig } from '../src/lab/config.js';
import { initGame, applyCommand, legalCommands, WORKER_BY_ID } from '../src/game/engine.js';
import { chooseCommand, evaluate, continuationValue, rolloutStats, resetRolloutStats } from '../src/game/ai.js';

function fixture(node, turn, tokens = 0, players = 3) {
  const c = defaults(); c.players = players;
  const s = initGame(gameConfig(c)), p = s.players[0];
  s.phase = 'action'; s.turn = turn; p.node = node; p.coins = 8; p.welfareTokens = tokens;
  const d = p.depts.terziario; d.prod = 9; d.tension = 4;
  d.sopra = [Object.values(WORKER_BY_ID).find(w => w.sector === 'Tessile').id];
  p.resources.Acciaio = 1;
  for (const bank of Object.keys(s.banks)) s.banks[bank] = [];
  for (const size of Object.keys(s.contracts)) s.contracts[size] = { deck: [], active: [] };
  s.contracts.small.active = [{
    card: { id: 'endgame-check', size: 'small', pv: [5, 3], reqs: [['Tessile', 'Tessile', 'Tessile', 'Metallurgica']], engine: null },
    doneReq: [false], places: [null, null],
  }];
  return s;
}
function decide(s) {
  const saved = structuredClone(s), cmd = chooseCommand(s);
  assert.ok(legalCommands(s).some(c => JSON.stringify(c) === JSON.stringify(cmd)));
  assert.deepEqual(s, saved, 'Search must preserve the input state');
  return cmd;
}

// Late spending needs a future use; unused tokens are neither points nor a purchase quota.
for (const players of [2, 3, 4]) {
  assert.notEqual(decide(fixture('Sindacato', 28, 0, players)).type, 'repress');
  assert.notEqual(decide(fixture('Servizi', 27, 0, players)).type, 'investWelfare');
  const stocked = fixture('Servizi', 24, 6, players);
  stocked.players[0].aiRecovery = 'welfare';
  assert.notEqual(decide(stocked).type, 'investWelfare');
}
const protectedState = fixture('Tessile', 26, 3);
assert.ok(legalCommands(protectedState).some(c => c.welfareToken), 'The human command remains legal');
assert.equal(decide(protectedState).welfareToken, undefined, 'At maximum tension protection changes nothing');

// Keep real investments: welfare funds recovery, production, then delivery; repression reopens three rows.
const useful = fixture('Servizi', 24); useful.players[0].aiRecovery = 'welfare';
assert.equal(decide(useful).type, 'investWelfare');
assert.deepEqual(decide(fixture('Sindacato', 25)), { type: 'repress', role: 'terziario' });

const end = fixture('Sindacato', 28); end.gameOver = true;
const value = evaluate(end, 0);
end.players[0].coins++;
assert.ok(evaluate(end, 0) > value, 'Coins decide equal final PV');
const rich = evaluate(end, 0);
end.players[0].contractsWon.push({ pv: 0 });
assert.ok(evaluate(end, 0) > rich, 'Contract count is the second tie-break');
end.players[0].coins = 0; end.players[0].contractsWon = [{ pv: 1 }];
assert.ok(evaluate(end, 0) > rich, 'A tie-break cannot outweigh a point');

// The final actor may still be playing after this player's last action: their engine is already spent.
for (const mode of ['normal', 'rotated', 'snake']) {
  const s = fixture('Sindacato', 28), playerId = mode === 'normal' ? 0 : 2;
  s.roundTurns = 1; s.current = mode === 'rotated' ? 0 : 1;
  if (mode === 'rotated') s.roundStart = 2;
  if (mode === 'snake') { s.snakeOrder = true; s.dir = -1; }
  const baseline = evaluate(s, playerId);
  s.players[playerId].depts.terziario.tension = 0;
  s.players[playerId].depts.terziario.prod = 16;
  s.players[playerId].resources.Tessuti += 20;
  assert.equal(evaluate(s, playerId), baseline, 'No future turn means no residual capacity value');
}

// Differential check: restore only the former repeated action calculation, with the same corrected policy.
const url = new URL('../src/game/ai.js', import.meta.url);
let source = fs.readFileSync(url, 'utf8').replace('const GREEDY_CACHE_LIMIT = 5000;', 'const GREEDY_CACHE_LIMIT = 0;');
const start = source.indexOf('function forwardStep('), stop = source.indexOf('\nfunction playForward', start);
assert.ok(start > 0 && stop > start);
source = source.slice(0, start) + `function forwardStep(state) {
  const cmd = chooseCommand(state);
  if (!cmd) return state;
  rolloutStats.stepsSimulated++;
  return timedApply(state, cmd);
}
` + source.slice(stop);
source = source.replace(/from '(\.\/[^']+)'/g, (_, path) => `from '${new URL(path, url).href}'`);
const repeated = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
let savedEvaluations = 0;
for (const players of [2, 3, 4]) {
  const s = fixture('Sindacato', 25, 0, players), snapshot = structuredClone(s);
  resetRolloutStats(); repeated.resetRolloutStats();
  assert.deepEqual(chooseCommand(s), repeated.chooseCommand(s));
  assert.equal(rolloutStats.stepsSimulated, repeated.rolloutStats.stepsSimulated);
  assert.equal(rolloutStats.beamExpanded, repeated.rolloutStats.beamExpanded);
  savedEvaluations += repeated.rolloutStats.evaluateCalls - rolloutStats.evaluateCalls;
  const after = applyCommand(s, legalCommands(s).find(c => c.type === 'repress'));
  assert.equal(continuationValue(after, 6, 0), repeated.continuationValue(after, 6, 0));
  assert.deepEqual(s, snapshot);
}
assert.ok(savedEvaluations > 0, 'Reuse removes repeated evaluation while retaining the same search');
console.log(`OK: useful welfare/repression retained; late waste and maximum-tension protection rejected; exact d6 decisions, values and branches preserved for 2/3/4 players (${savedEvaluations} repeated evaluations removed).`);
