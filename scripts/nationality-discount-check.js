import assert from 'node:assert/strict';
import { defaults, gameConfig, parseConfig, RULES_REVISION } from '../src/lab/config.js';
import { initGame, hireCost, legalCommands, applyCommand, WORKER_BY_ID } from '../src/game/engine.js';
import { normalizeRowEconomy } from '../src/game/row-economy.js';
import { chooseCommand } from '../src/game/ai.js';
import { GAME_SAVE_KEY, loadGame, gameSession } from '../src/lab/saved-game.js';

const config = gameConfig(defaults());
assert.equal(config.rowEconomy.sameNationHireDiscount, true);
assert.equal(config.rowEconomy.welfareCost, 4);
assert.equal(normalizeRowEconomy().sameNationHireDiscount, false);
assert.equal(normalizeRowEconomy({ sameNationHireDiscount: 'true' }).sameNationHireDiscount, false);
const previous = { ...defaults(), rulesRevision: 2, welfareCost: 5 };
const migrated = parseConfig(JSON.stringify(previous));
assert.equal(migrated.rulesRevision, RULES_REVISION);
assert.equal(migrated.welfareCost, 5, 'Migrating the hiring rule preserves edited prices');
assert.equal(gameConfig(migrated).rowEconomy.sameNationHireDiscount, true);

for (const role of ['terziario', 'secondario', 'primario']) {
  for (const value of [2, 3, 4]) {
    const state = initGame(config), p = state.players[0], d = p.depts[role];
    const card = Object.values(WORKER_BY_ID).find(w => w.sector === d.sector && w.v === value);
    const matches = Object.values(WORKER_BY_ID).filter(w => w.id !== card.id && w.sector === d.sector && w.nation === card.nation);
    for (let count = 0; count <= 3; count++) {
      d.sopra = matches.slice(0, count).map(w => w.id);
      assert.equal(hireCost(state, p, card, role, 'sopra'), Math.max(1, value - count));
      assert.equal(hireCost(state, p, card, role, 'sotto'), value, 'Machines are never discounted');
      assert.equal(hireCost(state, state.players[1], card, role, 'sopra'), value, 'Other players get no discount');
    }
    const different = Object.values(WORKER_BY_ID).find(w => w.sector === d.sector && w.nation !== card.nation);
    d.sopra = [different.id]; d.sotto = matches.map(w => w.id);
    const otherRole = Object.keys(p.depts).find(r => r !== role && r !== 'direzione');
    p.depts[otherRole].sopra = Object.values(WORKER_BY_ID).filter(w => w.sector === p.depts[otherRole].sector && w.nation === card.nation).map(w => w.id);
    assert.equal(hireCost(state, p, card, role, 'sopra'), value, 'Other nations, departments and Sotto do not count');

    state.phase = 'action'; p.node = d.sector; p.coins = 1; d.prod = 1;
    d.sopra = matches.map(w => w.id); d.sotto = [];
    const bank = state.nodeBanks[p.node][0]; state.banks[bank] = [card.id];
    const command = legalCommands(state).find(c => c.type === 'hire' && c.cardId === card.id && c.role === role && c.side === 'sopra');
    assert.ok(command, 'One marco suffices for the discounted hire');
    assert.ok(!legalCommands(state).some(c => c.type === 'hire' && c.cardId === card.id && c.side === 'sotto'));
    const original = structuredClone(state), spent = p.coinsSpentBy.lavoratori;
    const after = applyCommand(state, command);
    assert.deepEqual(state, original, 'Commands preserve the previous state');
    assert.equal(after.players[0].coins, 0);
    assert.equal(after.players[0].coinsSpentBy.lavoratori - spent, 1);
    assert.equal(after.players[0].depts[role].prod, 1 + value, 'Development uses printed value');
    p.coins = 0;
    assert.ok(!legalCommands(state).some(c => c.type === 'hire' && c.cardId === card.id));
    assert.throws(() => applyCommand(state, command), /Azione non disponibile/);

    state.rowEconomy.sameNationHireDiscount = false;
    assert.equal(hireCost(state, p, card, role, 'sopra'), value, 'Historical configurations retain their prices');
  }
}

// Old matches and their undo states gain the rule without changing their prices or cards.
const oldConfig = structuredClone(config);
delete oldConfig.rowEconomy.sameNationHireDiscount;
oldConfig.rowEconomy.welfareCost = 9;
const oldState = initGame(oldConfig);
const saved = { version: 1, savedAt: new Date().toISOString(), config: oldConfig, state: oldState, history: [oldState], paused: true };
const raw = JSON.stringify(saved), storage = { getItem: key => key === GAME_SAVE_KEY ? raw : null };
const loaded = loadGame(storage), resumed = gameSession(config, loaded);
for (const rules of [loaded.config, resumed.state, ...resumed.history]) {
  assert.equal(rules.rowEconomy.sameNationHireDiscount, true);
  assert.equal(rules.rowEconomy.welfareCost, 9);
}
assert.deepEqual(resumed.state.players, oldState.players);
assert.deepEqual(resumed.state.banks, oldState.banks);
assert.equal(JSON.stringify(saved), raw, 'Loading does not mutate old saves');

// The normal search path can execute discounted hires, at a node without a competing production.
const aiState = initGame(config), aiPlayer = aiState.players[0];
aiState.phase = 'action'; aiPlayer.node = 'Servizi'; aiPlayer.coins = 1;
const worker = Object.values(WORKER_BY_ID).find(w => w.sector === 'Tessile' && w.v === 4);
aiPlayer.depts.terziario.sopra = Object.values(WORKER_BY_ID).filter(w => w.sector === 'Tessile' && w.nation === worker.nation && w.id !== worker.id).map(w => w.id);
for (const bank of aiState.nodeBanks.Servizi) aiState.banks[bank] = [];
aiState.banks[aiState.nodeBanks.Servizi[0]] = [worker.id];
const decision = chooseCommand(aiState);
assert.equal(decision.type, 'hire');
assert.equal(decision.side, 'sopra');
assert.equal(applyCommand(aiState, decision).players[0].coins, 0);
console.log('OK: cumulative nationality discount, floor 1, local Sopra only, real payment and printed development, old saves/undo, welfare 4/3 and d6 AI.');
