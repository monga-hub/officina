import assert from 'node:assert/strict';
import { defaults, gameConfig, ROLES } from '../src/lab/config.js';
import { initGame, legalCommands, applyCommand, WORKER_BY_ID, scorePlayer } from '../src/game/engine.js';
import { chooseCommand, continuationValue, evaluate, resetRolloutStats, rolloutStats } from '../src/game/ai.js';

function fixture({ node = 'Tessile', tension = [2, 1, 0], turn = 10, coins = 15 } = {}) {
  const config = defaults(); config.simulation.seed = 73121;
  const s = initGame(gameConfig(config)), p = s.players[0];
  s.phase = 'action'; s.turn = turn; p.node = node; p.coins = coins; p.welfareTokens = 1;
  ROLES.forEach((r, i) => {
    const d = p.depts[r]; d.prod = i === 0 ? 13 : 1; d.tension = tension[i];
    d.sopra = [Object.values(WORKER_BY_ID).find(w => w.sector === d.sector).id];
  });
  return s;
}
const produce = sector => ({ type: 'activate', sector, intensity: 1 });
const skip = { type: 'skipWelfareToken' };
const heal = role => ({ type: 'spendWelfareToken', role });
function decide(s) {
  const copy = structuredClone(s), command = chooseCommand(s);
  assert.ok(legalCommands(s).some(c => JSON.stringify(c) === JSON.stringify(command)));
  assert.deepEqual(s, copy, 'Search must not alter a live game or save');
  return command;
}
function nextAction(s, node, action, recovery = skip) {
  assert.equal(s.current, 1);
  // Give the opponent a legal, non-blocking turn, identical in both comparisons.
  const otherNode = s.players[1].node === 'Servizi' ? 'Borsa' : 'Servizi';
  s = applyCommand(s, legalCommands(s).find(c => c.type === 'move' && c.node === otherNode));
  s = applyCommand(s, legalCommands(s).find(c => ['pass', 'endTurn'].includes(c.type)));
  assert.equal(s.current, 0);
  s = applyCommand(s, legalCommands(s).find(c => c.type === 'move' && c.node === node));
  s = applyCommand(s, action);
  if (s.pending?.type === 'welfareToken') s = applyCommand(s, recovery);
  return s;
}

// Save a scarce token: the tempting recovery restores no row; the next one does.
const pending = applyCommand(fixture(), produce('Tessile'));
assert.equal(pending.pending.type, 'welfareToken');
const greedy = { ...pending, aiRollout: null };
assert.deepEqual(decide(greedy), heal('secondario'));
resetRolloutStats();
assert.deepEqual(decide(pending), skip);
assert.ok(rolloutStats.tokenDeferredForecasts >= 6);
assert.equal(rolloutStats.decisionsRollout, 0, 'Speculative choices must not recursively launch rollout decisions');
let saved = applyCommand(pending, skip), spent = applyCommand(pending, heal('secondario'));
saved = nextAction(saved, 'Chimica', produce('Chimica'), heal('terziario'));
spent = nextAction(spent, 'Chimica', produce('Chimica'));
saved = nextAction(saved, 'Tessile', produce('Tessile'));
spent = nextAction(spent, 'Tessile', produce('Tessile'));
assert.equal(saved.players[0].resGainedBy.produzione, spent.players[0].resGainedBy.produzione + 1);
assert.equal(saved.players[0].coins, spent.players[0].coins);

// Spend when waiting loses an actual production opportunity (only one own turn left).
const urgent = applyCommand(fixture({ node: 'Chimica', tension: [3, 0, 0], turn: 27, coins: 0 }), produce('Chimica'));
assert.deepEqual(decide(urgent), heal('terziario'));
const healed = nextAction(applyCommand(urgent, heal('terziario')), 'Tessile', produce('Tessile'));
const waited = nextAction(applyCommand(urgent, skip), 'Tessile', produce('Tessile'));
assert.equal(healed.players[0].resGainedBy.produzione, waited.players[0].resGainedBy.produzione + 1);
assert.equal(scorePlayer(healed, healed.players[0]).total, scorePlayer(waited, waited.players[0]).total + 1);

// Identical factory, different reserves: spending capacity matters without a stock bonus.
for (const tokens of [1, 2]) {
  const busy = fixture({ node: 'Chimica', tension: [2, 2, 0], coins: 0 });
  busy.players[0].welfareTokens = tokens;
  for (const d of Object.values(busy.players[0].depts)) d.prod = 13;
  const choice = decide(applyCommand(busy, produce('Chimica')));
  assert.equal(choice.type, tokens === 1 ? 'skipWelfareToken' : 'spendWelfareToken');
}

// Tokens have no artificial score, and neither weights nor gameplay settings vary with the search.
const s = fixture(), base = evaluate(s, 0), rules = structuredClone(s.rowEconomy);
for (const count of [0, 1, 3, 9]) {
  s.players[0].welfareTokens = count;
  assert.equal(evaluate(s, 0), base);
}
assert.deepEqual(s.rowEconomy, rules);
assert.equal(continuationValue(s, 0, 0), evaluate(s, 0, true));

// No purchase quota and no obligation to exhaust tokens at the end.
for (const count of [0, 1, 3]) {
  const last = fixture({ node: 'Servizi', tension: [0, 0, 0], turn: 28 });
  last.current = 1; last.roundTurns = 1;
  Object.assign(last.players[1], { node: 'Servizi', coins: 50, welfareTokens: count });
  assert.notEqual(decide(last).type, 'investWelfare');
}
const last = fixture({ turn: 28 }); last.current = 1; last.roundTurns = 1;
Object.assign(last.players[1], { node: 'Servizi', welfareTokens: 1 });
last.players[1].depts.terziario.tension = 1;
const finalChoice = applyCommand(last, { type: 'pass' });
assert.deepEqual(decide(finalChoice), skip, 'Equal final scores retain the token');
const end = applyCommand(finalChoice, skip);
assert.ok(end.gameOver);
assert.equal(continuationValue(end, 6, 1), evaluate(end, 1, true));
console.log('OK: d6 saves or spends according to future use, unchanged weights/rules, legal immutable choices, no pointless final purchase/use.');
