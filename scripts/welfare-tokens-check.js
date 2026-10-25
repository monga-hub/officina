import assert from 'node:assert/strict';
import { defaults, playableConfig } from '../src/lab/config.js';
import { initGame, legalCommands, applyCommand, WORKER_BY_ID, hireCost } from '../src/game/engine.js';
import { availableWelfareTokens, repressionCost } from '../src/game/row-economy.js';
import { chooseCommand } from '../src/game/ai.js';
import { gameSession, loadGame, saveGame } from '../src/lab/saved-game.js';

const roles = ['terziario', 'secondario', 'primario'];
const config = playableConfig(defaults(), 2);
config.rowEconomy = { ...config.rowEconomy, welfareMode: 'tokens', welfareCost: 9,
  repressionBase: 2, repressionStep: 5, welfareScope: 'factory', welfareHireDiscount: true };
function fixture(node = 'Servizi', tokens = 0) {
  const state = initGame(config), p = state.players[0];
  state.phase = 'action'; p.node = node; p.coins = 30; p.welfareTokens = tokens;
  for (const role of roles) {
    const d = p.depts[role];
    d.prod = 13;
    d.sopra = [Object.values(WORKER_BY_ID).find(w => w.sector === d.sector).id];
  }
  return state;
}
const spend = (role, count = 1) => ({ type: 'spendWelfareToken', role, count });
const tension = p => roles.map(role => p.depts[role].tension);
const totalResources = p => Object.values(p.resources).reduce((a, b) => a + b, 0);

// New purchases cost nine and cannot be consumed in their purchase turn.
let state = fixture();
state.players[0].depts.terziario.tension = 3;
const original = structuredClone(state);
let after = applyCommand(state, { type: 'investWelfare', scope: 'factory' });
assert.deepEqual(state, original, 'Commands preserve the previous state');
assert.equal(after.players[0].coins, 21);
assert.equal(after.players[0].welfareTokens, 3);
assert.equal(after.current, 1);
assert.equal(after.pending, null, 'New tokens are not immediately offered for recovery');
assert.ok(roles.every(role => after.players[0].depts[role].sustainableWelfare === 0));
assert.equal(after.players[0].depts.terziario.tension, 3);
// Finish the other player's turn: all three are now ready on the purchaser's next turn.
after = applyCommand(after, legalCommands(after).find(c => c.type === 'move'));
after = applyCommand(after, legalCommands(after).find(c => ['pass', 'endTurn'].includes(c.type)));
assert.equal(after.current, 0);
assert.equal(availableWelfareTokens(after, after.players[0]), 3);

// Buying tokens is not a department visit, even when old tokens are available.
state = fixture('Servizi', 1);
state.players[0].depts.terziario.tension = 3;
after = applyCommand(state, { type: 'investWelfare', scope: 'factory' });
assert.equal(after.pending, null);
assert.equal(after.players[0].welfareTokens, 4);
assert.equal(after.players[0].depts.terziario.tension, 3);
assert.equal(after.current, 1);

// Protected production uses all available rows and activates cash machinery exactly once.
state = fixture('Tessile', 3);
const machine = Object.values(WORKER_BY_ID).find(w => w.effect?.verbo === 'prendi' && w.effect.f1.tipo === 'moneta');
state.players[0].depts.terziario.sotto = [machine.id];
state.players[0].depts.terziario.tension = 1;
state.players[0].depts.secondario.tension = 2;
const worker = WORKER_BY_ID[state.players[0].depts.terziario.sopra[0]];
state.players[0].depts.terziario.sustainableWelfare = 4;
const withoutTokens = structuredClone(state); withoutTokens.players[0].welfareTokens = 0; withoutTokens.players[0].depts.terziario.sustainableWelfare = 0;
assert.equal(hireCost(state, state.players[0], worker, 'terziario', 'sopra'), hireCost(withoutTokens, withoutTokens.players[0], worker, 'terziario', 'sopra'), 'Tokens never discount hiring; nationality discounts are independent');
assert.ok(!legalCommands(state).some(c => c.sustainableRow !== undefined), 'No old sustainable row choices');
after = applyCommand(state, { type: 'activate', sector: 'Tessile', intensity: 1, welfareToken: true });
assert.equal(totalResources(after.players[0]) - totalResources(state.players[0]), 3);
assert.equal(after.players[0].coins - state.players[0].coins, machine.effect.f1.q);
assert.equal(after.players[0].depts.terziario.tension, 1, 'Protection never heals');
assert.equal(after.players[0].welfareTokens, 2);
assert.equal(after.current, 1, 'No second token after protected production');
assert.equal(after.pending, null);
assert.throws(() => applyCommand(state, { type: 'activate', sector: 'Tessile', intensity: 1, sustainableRow: 0 }), /Azione non disponibile/);
assert.throws(() => applyCommand(state, { type: 'activate', sector: 'Tessile', intensity: 1, welfareToken: 'true' }), /Azione non disponibile/);
const noTokens = structuredClone(state); noTokens.players[0].welfareTokens = 0;
assert.throws(() => applyCommand(noTokens, { type: 'activate', sector: 'Tessile', intensity: 1, welfareToken: true }), /Azione non disponibile/);

// Neither ordinary nor protected production permits any recovery that turn.
after = applyCommand(state, { type: 'activate', sector: 'Tessile', intensity: 1 });
assert.equal(after.pending, null);
assert.equal(after.current, 1);
assert.equal(after.players[0].depts.terziario.tension, 2);
assert.equal(after.players[0].depts.secondario.tension, 2);
assert.equal(after.players[0].welfareTokens, 3);

// Finish every machinery choice before ending production, still without a recovery.
state = fixture('Tessile', 2);
const exchange = Object.values(WORKER_BY_ID).find(w => w.effect?.verbo === 'scambia' && w.effect.f1?.settore === 'scelta' && w.effect.f2?.settore === 'scelta');
assert.ok(exchange, 'The deck supplies a choice-based machine');
state.players[0].depts.terziario.sotto = [exchange.id, exchange.id];
state.players[0].depts.primario.tension = 2;
after = applyCommand(state, { type: 'activate', sector: 'Tessile', intensity: 1 });
assert.equal(after.pending.type, 'effect');
after = applyCommand(after, { type: 'resolveEffect', use: false });
assert.equal(after.pending.type, 'effect');
after = applyCommand(after, { type: 'resolveEffect', use: false });
assert.equal(after.pending, null);
assert.equal(after.current, 1);
assert.equal(after.players[0].welfareTokens, 2);

// Passing allows local recovery: choose one total quantity, bounded by stock and tension.
state = fixture('Tessile', 4);
for (const role of roles) state.players[0].depts[role].tension = 3;
after = applyCommand(state, { type: 'pass' });
assert.equal(after.pending.type, 'welfareToken');
assert.deepEqual(legalCommands(after), [spend('terziario', 1), spend('terziario', 2), spend('terziario', 3), { type: 'skipWelfareToken' }]);
for (const count of [1, 2, 3]) {
  const recovered = applyCommand(after, spend('terziario', count));
  assert.deepEqual(tension(recovered.players[0]), [3 - count, 3, 3]);
  assert.equal(recovered.players[0].welfareTokens, 4 - count);
  assert.equal(recovered.players[0].industrialStats.welfareTokensUsed, count);
  assert.equal(recovered.players[0].industrialStats.welfareRecoveries, 1);
  assert.equal(recovered.current, 1, 'One recovery decision finishes the original turn');
  assert.equal(recovered.pending, null);
}
assert.deepEqual(applyCommand(after, { type: 'spendWelfareToken', role: 'terziario' }), applyCommand(after, spend('terziario', 1)), 'Old one-token commands remain compatible when local and legal');
for (const count of [0, -1, 1.5, 4, 99, null, '2', NaN, Infinity])
  assert.throws(() => applyCommand(after, spend('terziario', count)), /Azione non disponibile/);
assert.throws(() => applyCommand(after, spend('secondario', 1)), /Azione non disponibile/, 'No remote healing');
const skipped = applyCommand(after, { type: 'skipWelfareToken' });
assert.equal(skipped.players[0].welfareTokens, 4);
assert.deepEqual(tension(skipped.players[0]), [3, 3, 3]);
assert.equal(skipped.current, 1);
const lowStock = structuredClone(after); lowStock.players[0].welfareTokens = 2;
assert.deepEqual(legalCommands(lowStock), [spend('terziario', 1), spend('terziario', 2), { type: 'skipWelfareToken' }]);
assert.throws(() => applyCommand(lowStock, spend('terziario', 3)), /Azione non disponibile/);
lowStock.turnFlags.welfareTokensPurchased = 1;
assert.deepEqual(legalCommands(lowStock), [spend('terziario', 1), { type: 'skipWelfareToken' }], 'Purchase cooldown still applies');

// Recovery quantities survive a real save/reload, including undo snapshots.
const storageData = new Map(), storage = {getItem:key=>storageData.get(key)??null,setItem:(key,value)=>storageData.set(key,value)};
saveGame(config, {state:after, history:[state, after], paused:true}, storage);
const saved = loadGame(storage), restored = gameSession(saved.config, saved);
assert.deepEqual(legalCommands(restored.state), legalCommands(after));
assert.equal(JSON.stringify(applyCommand(restored.state, spend('terziario', 3))), JSON.stringify(applyCommand(after, spend('terziario', 3))));
assert.deepEqual(legalCommands(restored.history.at(-1)), legalCommands(after));
const aiChoice = chooseCommand(restored.state);
assert.ok(legalCommands(restored.state).some(command=>JSON.stringify(command)===JSON.stringify(aiChoice)));
assert.equal(applyCommand(restored.state, aiChoice).current, 1);

// Card purchases can cure the visited department even if the card has another sector.
state = fixture('Tessile', 3);
for (const role of roles) state.players[0].depts[role].tension = 3;
const hire = legalCommands(state).find(c => c.type === 'hire' && c.side === 'sopra' && c.role !== 'terziario');
assert.ok(hire, 'Fixture offers a card for another department');
after = applyCommand(state, hire);
assert.equal(after.pending.type, 'welfareToken');
assert.ok(legalCommands(after).filter(c => c.type === 'spendWelfareToken').every(c => c.role === 'terziario'));
const beforeCoins = after.players[0].coins;
after = applyCommand(after, spend('terziario', 3));
assert.deepEqual(tension(after.players[0]), [0, 3, 3]);
assert.equal(after.players[0].coins, beforeCoins, 'Spending tokens has no extra coin cost');

// Every department uses its node, not a fixed role; tension zero offers no recovery.
for (const role of roles) {
  state = fixture('Tessile', 2);
  state.players[0].node = state.players[0].depts[role].sector;
  state.players[0].depts[role].tension = 2;
  after = applyCommand(state, {type:'pass'});
  assert.deepEqual(legalCommands(after), [spend(role, 1), spend(role, 2), {type:'skipWelfareToken'}]);
  state.players[0].depts[role].tension = 0;
  assert.equal(applyCommand(state, {type:'pass'}).pending, null);
}

// Old remote or post-production pending decisions can be skipped after reload/undo.
for (const node of ['Borsa', 'Servizi', 'Sindacato', 'Tessile']) {
  state = fixture(node, 3);
  state.players[0].depts.terziario.tension = 3;
  state.phase = 'resolving';
  state.pending = {type:'welfareToken', playerId:0, options:['terziario']};
  if (node === 'Tessile') state.turnFlags.producedRole = 'terziario';
  saveGame(config, {state, history:[state], paused:true}, storage);
  const legacySave = loadGame(storage), resumed = gameSession(legacySave.config, legacySave);
  for (const snapshot of [resumed.state, resumed.history[0]]) {
    assert.deepEqual(legalCommands(snapshot), [{type:'skipWelfareToken'}]);
    assert.throws(() => applyCommand(snapshot, spend('terziario', 1)), /Azione non disponibile/);
    const continued = applyCommand(snapshot, {type:'skipWelfareToken'});
    assert.equal(continued.current, 1);
    assert.equal(continued.pending, null);
    assert.equal(continued.players[0].welfareTokens, 3);
    assert.equal(continued.players[0].depts.terziario.tension, 3);
  }
}

// Repression has a fixed price and affects even empty departments, capped at four.
state = fixture('Sindacato');
state.players[0].repressions = 9;
roles.forEach((role, i) => { state.players[0].depts[role].tension = [3, 0, 4][i]; });
state.players[0].depts.secondario.sopra = [];
assert.equal(repressionCost(state, state.players[0]), 2);
after = applyCommand(state, { type: 'repress', role: 'terziario' });
assert.deepEqual(tension(after.players[0]), [0, 1, 4]);
assert.equal(after.players[0].coins, 28);
assert.equal(after.players[0].industrialStats.tensionExternal, 1, 'Only actual spillover is counted');
assert.throws(() => applyCommand(state, { type: 'repress', role: 'secondario' }), /Azione non disponibile/);

// Final-turn recovery resolves before scoring; no extra turn is granted.
state = fixture('Servizi', 0);
state.current = 1; state.roundTurns = 1; state.turn = state.roundLimit;
state.players[1].node = 'Chimica'; state.players[1].welfareTokens = 3;
state.players[1].depts.primario.tension = 3;
after = applyCommand(state, { type: 'pass' });
assert.equal(after.gameOver, false);
assert.equal(after.pending.type, 'welfareToken');
after = applyCommand(after, spend('primario', 3));
assert.equal(after.gameOver, true);
assert.equal(after.players[1].depts.primario.tension, 0);
assert.equal(after.players[1].welfareTokens, 0);

// Existing saves keep permanent welfare, discounts and escalating -2 repression.
const legacyConfig = structuredClone(config);
delete legacyConfig.rowEconomy.welfareMode;
Object.assign(legacyConfig.rowEconomy, { welfareCost: 3, repressionStep: 1, welfareHireDiscount: true });
state = initGame(legacyConfig); state.phase = 'action'; state.players[0].node = 'Servizi';
after = applyCommand(state, { type: 'investWelfare', scope: 'factory' });
assert.equal(after.players[0].welfareTokens, 0);
assert.ok(roles.every(role => after.players[0].depts[role].sustainableWelfare === 1));
state.players[0].node = 'Sindacato'; state.players[0].repressions = 2;
state.players[0].depts.terziario.tension = 3;
after = applyCommand(state, { type: 'repress', role: 'terziario' });
assert.equal(after.players[0].coins, state.players[0].coins - 4);
assert.deepEqual(tension(after.players[0]), [1, 0, 0]);

console.log('OK: local multi-token recovery, production exclusion, quantity validation, save/reload/undo, fixed costs and legacy rules.');
