import assert from 'node:assert/strict';
import { defaults, gameConfig, ROLES } from '../src/lab/config.js';
import { initGame, legalCommands, applyCommand, WORKER_BY_ID } from '../src/game/engine.js';
import { chooseCommand, continuationValue, evaluate, resetRolloutStats, rolloutStats } from '../src/game/ai.js';

function fixture({ node = 'Tessile', tension = [3, 0, 0], turn = 26, coins = 0, tokens = 3, prod = [13, 1, 1] } = {}) {
  const config = defaults(); config.simulation.seed = 73121;
  const s = initGame(gameConfig(config)), p = s.players[0];
  s.phase = 'action'; s.turn = turn; p.node = node; p.coins = coins; p.welfareTokens = tokens;
  ROLES.forEach((r, i) => {
    const d = p.depts[r]; d.prod = prod[i]; d.tension = tension[i];
    d.sopra = [Object.values(WORKER_BY_ID).find(w => w.sector === d.sector).id];
  });
  return s;
}
const produce = sector => ({ type: 'activate', sector, intensity: 1 });
const skip = { type: 'skipWelfareToken' };
const heal = count => ({ type: 'spendWelfareToken', role: 'terziario', count });
const recovery = s => applyCommand(s, legalCommands(s).find(c => ['pass', 'endTurn'].includes(c.type)));
function decide(s) {
  const copy = structuredClone(s), command = chooseCommand(s);
  assert.ok(legalCommands(s).some(c => JSON.stringify(c) === JSON.stringify(command)));
  assert.deepEqual(s, copy, 'Search must not alter a live game or save');
  return command;
}

// With three tokens, all local amounts are candidates, even if another department has tension.
const pending = recovery(fixture({ tension: [3, 4, 4] }));
assert.equal(pending.pending.type, 'welfareToken');
assert.deepEqual(legalCommands(pending), [heal(1), heal(2), heal(3), skip]);
for (const node of ['Servizi', 'Sindacato', 'Borsa']) {
  const away = recovery(fixture({ node, tension: [3, 4, 4] }));
  assert.notEqual(away.pending?.type, 'welfareToken');
}
const produced = applyCommand(fixture(), produce('Tessile'));
assert.notEqual(produced.pending?.type, 'welfareToken', 'Producing cannot be followed by a cure');

// Same reserve and tension, different developed capacity: compare every amount and keep surplus tokens.
// At this horizon there is one more possible visit to Tessile; extra recovery cannot improve its yield.
for (const [development, count] of [[5, 1], [9, 2], [13, 3]]) {
  const s = recovery(fixture({ prod: [development, 1, 1] }));
  resetRolloutStats();
  assert.deepEqual(decide(s), heal(count), `Recover only the ${count} rows that can be used`);
  assert.ok(rolloutStats.tokenDeferredForecasts >= 6);
  assert.equal(rolloutStats.decisionsRollout, 0, 'Speculative choices must not recursively launch rollout decisions');
  const used = applyCommand(s, heal(count));
  assert.equal(used.players[0].welfareTokens, 3 - count);
  assert.equal(used.players[0].depts.terziario.tension, 3 - count);
  assert.ok(continuationValue(used, 6, 0) > continuationValue(applyCommand(s, skip), 6, 0));
  if (count < 3) assert.equal(continuationValue(used, 6, 0), continuationValue(applyCommand(s, heal(3)), 6, 0));
}

// Reserve sensitivity without a bonus for owning tokens: one token does not improve this final plan.
const scarce = recovery(fixture({ tokens: 1 }));
assert.deepEqual(decide(scarce), skip);
assert.equal(continuationValue(applyCommand(scarce, heal(1)), 6, 0), continuationValue(applyCommand(scarce, skip), 6, 0));
assert.deepEqual(decide(recovery(fixture({ tokens: 3 }))), heal(3));

// Tokens have no artificial score, and neither weights nor gameplay settings vary with the search.
const s = fixture(), base = evaluate(s, 0), rules = structuredClone(s.rowEconomy);
for (const count of [0, 1, 3, 9]) {
  s.players[0].welfareTokens = count;
  assert.equal(evaluate(s, 0), base);
}
assert.deepEqual(s.rowEconomy, rules);
assert.equal(s.rowEconomy.welfareCost, 9);
assert.equal(s.rowEconomy.repressionBase, 2);
assert.equal(continuationValue(s, 0, 0), evaluate(s, 0, true));

// No purchase quota and no obligation to exhaust tokens at the end.
for (const count of [0, 1, 3]) {
  const last = fixture({ node: 'Servizi', tension: [0, 0, 0], turn: 28 });
  last.current = 1; last.roundTurns = 1;
  Object.assign(last.players[1], { node: 'Servizi', coins: 50, welfareTokens: count });
  assert.notEqual(decide(last).type, 'investWelfare');
}
const last = fixture({ turn: 28 }); last.current = 1; last.roundTurns = 1;
Object.assign(last.players[1], { node: 'Tessile', welfareTokens: 3 });
last.players[1].depts.terziario.tension = 3;
const finalChoice = recovery(last);
assert.deepEqual(decide(finalChoice), skip, 'No future production means no need to heal');
const end = applyCommand(finalChoice, skip);
assert.ok(end.gameOver);
assert.equal(continuationValue(end, 6, 1), evaluate(end, 1, true));
console.log('OK: d6 evaluates local recovery amounts 1/2/3 and conservation, respects production/location, keeps weights and costs unchanged.');
