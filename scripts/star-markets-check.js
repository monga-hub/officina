import assert from 'node:assert/strict';
import { defaults, mainDefaults, gameConfig } from '../src/lab/config.js';
import { initGame, legalCommands, applyCommand, hireCost, WORKER_BY_ID } from '../src/game/engine.js';
import { chooseCommand } from '../src/game/ai.js';
import { NODE_BANKS } from '../src/game/data.js';
import { GAME_SAVE_KEY, loadGame, saveGame, gameSession } from '../src/lab/saved-game.js';

const physical = {
  Tessile: ['A', 'E'], Metallurgica: ['A', 'B'], Chimica: ['B', 'C'],
  Servizi: ['D', 'E'], Sindacato: ['C', 'D'],
};
const previous = { ...physical, Servizi: ['C', 'D'], Sindacato: ['D', 'E'] };
const plain = value => JSON.parse(JSON.stringify(value));
let purchases = 0, rejections = 0;
for (const settings of [defaults(), mainDefaults()]) for (const players of settings.roundRondel?.enabled ? [3] : [2, 3, 4]) {
  const config = gameConfig({ ...settings, players, simulation: { ...settings.simulation, ai: 'greedy' } });
  function at(node) {
    const state = initGame(config);
    state.phase = 'action';
    state.players[state.current].node = node;
    state.players[state.current].coins = 100;
    return state;
  }
  for (const [node, banks] of [...Object.entries(physical), ['Borsa', []]]) {
    const state = at(node), before = plain(state), player = state.players[state.current];
    const legal = legalCommands(state), hires = legal.filter(c => c.type === 'hire');
    assert.deepEqual([...new Set(hires.map(c => c.bank))].sort(), banks, `${players} players, ${node}: physical markets`);
    const choice = chooseCommand(state);
    assert.ok(legal.some(c => JSON.stringify(c) === JSON.stringify(choice)), 'AI uses the same legal actions');
    for (const bank of banks) for (const side of ['sopra', 'sotto']) {
      const cmd = hires.find(c => c.bank === bank && c.side === side);
      assert.ok(cmd, `${node}: ${bank} available ${side}`);
      const cost = hireCost(state, player, WORKER_BY_ID[cmd.cardId], cmd.role, side);
      const after = applyCommand(state, cmd), buyer = after.players[state.current];
      assert.equal(buyer.coinsSpentBy.lavoratori - player.coinsSpentBy.lavoratori, cost, 'Purchase payment unchanged');
      assert.ok(buyer.depts[cmd.role][side].includes(cmd.cardId), 'The purchased card is installed');
      assert.deepEqual(after.banks[bank], state.banks[bank].slice(1), 'Only the purchased card leaves its deck');
      for (const other of state.bankIds.filter(id => id !== bank)) assert.deepEqual(after.banks[other], state.banks[other]);
      const poor = structuredClone(state);
      poor.players[state.current].coins = cost - 1;
      assert.throws(() => applyCommand(poor, cmd), /Azione non disponibile/, 'No unaffordable purchase');
      purchases++;
    }
    for (const bank of ['C', 'E'].filter(id => !banks.includes(id))) {
      const allowedNode = Object.keys(physical).find(n => physical[n].includes(bank));
      const commands = legalCommands(at(allowedNode)).filter(c => c.type === 'hire' && c.bank === bank);
      for (const side of ['sopra', 'sotto']) {
        const cmd = commands.find(c => c.side === side);
        assert.ok(cmd);
        assert.throws(() => applyCommand(state, cmd), /Azione non disponibile/, `${node}: ${bank} forbidden ${side}`);
        rejections++;
      }
    }
    assert.deepEqual(plain(state), before, 'Purchases and rejected commands preserve their predecessor');
  }
}

// Resume and Undo must not restore the old C/E access. Only the exact previous
// lab mapping migrates; prices, cards, decks and custom/legacy maps survive.
const config = gameConfig(defaults());
config.rowEconomy.welfareCost = 9;
config.nodeBanks = structuredClone(previous);
const initial = initGame(config), state = structuredClone(initial);
state.phase = 'action'; state.players[state.current].node = 'Sindacato';
const record = { version: 1, savedAt: new Date().toISOString(), config, state, history: [initial], paused: true };
let raw = JSON.stringify(record);
const storage = { getItem: key => key === GAME_SAVE_KEY ? raw : null, setItem: (key, value) => { assert.equal(key, GAME_SAVE_KEY); raw = value; } };
const expected = structuredClone(record);
for (const rules of [expected.config, expected.state, ...expected.history]) rules.nodeBanks = structuredClone(physical);
const restored = loadGame(storage);
assert.equal(raw, JSON.stringify(record), 'Read does not overwrite the original save');
assert.deepEqual(plain(restored), plain(expected), 'Only the physical market mapping changes');
assert.deepEqual(gameSession(config, record), { state: expected.state, history: expected.history, paused: true });
assert.ok(legalCommands(restored.state).some(c => c.type === 'hire' && c.bank === 'C'));
assert.ok(!legalCommands(restored.state).some(c => c.type === 'hire' && c.bank === 'E'));
saveGame(restored.config, gameSession(restored.config, restored), storage);
assert.deepEqual(loadGame(storage).state, plain(restored.state), 'Migration is idempotent');
for (const mapping of [{ ...physical, Tessile: ['A'] }, NODE_BANKS]) {
  const custom = structuredClone(record);
  for (const rules of [custom.config, custom.state, ...custom.history]) rules.nodeBanks = structuredClone(mapping);
  raw = JSON.stringify(custom);
  assert.deepEqual(loadGame(storage), plain(custom), 'Custom and legacy mappings remain unchanged');
}
assert.deepEqual(initGame({ seed: 1907, players: [{ name: 'A' }, { name: 'B' }] }).nodeBanks, NODE_BANKS, 'Legacy engine defaults remain unchanged');
const custom = { ...gameConfig(defaults()), nodeBanks: { ...physical, Tessile: ['A'] }, starMovement: false };
assert.deepEqual(initGame(custom).nodeBanks, custom.nodeBanks, 'Explicit engine configuration remains authoritative');
console.log(`OK: physical markets A–E, ${purchases} purchases with payment/card checks, ${rejections} forbidden C/E purchases, 2/3/4 players, AI, save/resume/Undo and custom/legacy preservation.`);
