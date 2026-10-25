import assert from 'node:assert/strict';
import reference from '../src/lab/reference.json' with { type: 'json' };
import { defaults, gameConfig, parseConfig, RULES_REVISION } from '../src/lab/config.js';
import { initGame, applyCommand, legalCommands, WORKER_BY_ID } from '../src/game/engine.js';
import { rowMachineCard } from '../src/game/row-economy.js';
import { productionPreview } from '../src/components/production-choices.js';
import { machineText } from '../src/lab/cards.js';
import { gameSession, loadGame } from '../src/lab/saved-game.js';
import { chooseCommand } from '../src/game/ai.js';

const c = defaults(), config = gameConfig(c);
const previousCards = reference.workers.filter(w => !w.power && w.deck !== 'Impiegati');
const previous = previousCards.map(w => rowMachineCard(w, { machineCash: true }));
const target = w => [3, 4].includes(w.v) && w.effect.verbo === 'prendi' && w.effect.f1.tipo === 'moneta' && w.effect.f1.q === 1;
const ids = previous.filter(target).map(w => w.id);
assert.equal(ids.length, 18);
assert.equal(previous.filter(w => target(w) && w.v === 3).length, 12);
assert.equal(previous.filter(w => target(w) && w.v === 4).length, 6);
initGame(config);
for (const old of previous) {
  const current = WORKER_BY_ID[old.id];
  const { effect, effectText, ...card } = current;
  const { effect: oldEffect, effectText: oldText, ...oldCard } = old;
  assert.deepEqual(card, oldCard, 'Values, nations, sectors and decks are unchanged');
  if (ids.includes(old.id)) {
    assert.deepEqual(effect, { verbo: 'perOgni', f1: { q: 1, tipo: 'moneta' }, f2: { conta: 'tensione' } });
    assert.match(machineText(current), /tensione prima della produzione/);
  } else assert.deepEqual(current, old, 'All other 54 machines are unchanged');
}

// One or two machines, in any department, pay the INITIAL tension in either production mode.
for (const role of ['terziario', 'secondario', 'primario']) for (const count of [1, 2]) {
  for (const tension of [0, 1, 2, 3, 4]) for (const protectedProduction of [false, true]) {
    const state = initGame(config), p = state.players[0], d = p.depts[role];
    state.phase = 'action'; p.node = d.sector; p.welfareTokens = 2;
    d.prod = 13; d.tension = tension;
    d.sopra = [Object.values(WORKER_BY_ID).find(w => w.sector === d.sector && !ids.includes(w.id)).id];
    d.sotto = ids.slice(0, count);
    const command = { type: 'activate', sector: d.sector, intensity: 1, ...(protectedProduction ? { welfareToken: true } : {}) };
    const frozen = structuredClone(state), after = applyCommand(state, command), next = after.players[0];
    assert.equal(next.coins - p.coins, count * tension);
    assert.equal(next.depts[role].tension, protectedProduction ? tension : Math.min(4, tension + 1));
    assert.equal(Object.values(next.resources).reduce((a, b) => a + b, 0), 4 - tension);
    assert.equal(next.welfareTokens, protectedProduction ? 1 : 2);
    assert.equal(productionPreview(state, command).coins, count * tension);
    assert.deepEqual(state, frozen, 'Production and preview preserve the prior state');
  }
}

// Installation pays full price, yields no income, and does not raise development.
let state = initGame(config), p = state.players[0];
state.phase = 'action'; p.node = 'Tessile';
const machine = WORKER_BY_ID[ids.find(id => WORKER_BY_ID[id].v === 4)];
const bank = state.nodeBanks.Tessile[0]; state.banks[bank] = [machine.id];
const hire = legalCommands(state).find(cmd => cmd.type === 'hire' && cmd.cardId === machine.id && cmd.side === 'sotto' && cmd.role === 'terziario');
const installed = applyCommand(state, hire);
assert.equal(installed.players[0].coins, p.coins - 4);
assert.equal(installed.players[0].depts.terziario.prod, 1);

// One-time config migration preserves edits; current custom fixed effects survive reloads.
const oldConfig = { ...structuredClone(c), rulesRevision: 3, workers: structuredClone(previousCards), welfareCost: 5 };
const migrated = parseConfig(JSON.stringify(oldConfig));
assert.equal(migrated.rulesRevision, RULES_REVISION);
assert.equal(migrated.welfareCost, 5);
assert.deepEqual(migrated.workers, c.workers);
assert.deepEqual(parseConfig(JSON.stringify(migrated)), migrated);
const edited = structuredClone(migrated);
edited.workers.find(w => w.id === ids[0]).effect = { verbo: 'prendi', f1: { q: 1, tipo: 'moneta' } };
assert.deepEqual(parseConfig(JSON.stringify(edited)), edited);

// Saved matches and undo snapshots retain the board, prices and new effect after resume.
const oldGameConfig = { ...config, workers: structuredClone(previousCards), rowEconomy: { ...config.rowEconomy, welfareCost: 9 } };
delete oldGameConfig.rowEconomy.tensionMachineCash;
const oldState = initGame(oldGameConfig);
oldState.phase = 'action'; oldState.players[0].node = 'Tessile';
oldState.players[0].depts.terziario.sopra = [previousCards.find(w => w.sector === 'Tessile' && !ids.includes(w.id)).id];
oldState.players[0].depts.terziario.sotto = ids.slice(0, 2);
oldState.players[0].depts.terziario.tension = 3;
const saved = { version: 1, savedAt: new Date().toISOString(), config: oldGameConfig, state: oldState, history: [oldState], paused: true };
const raw = JSON.stringify(saved), loaded = loadGame({ getItem: () => raw });
const resumed = gameSession(config, loaded);
for (const board of [resumed.state, ...resumed.history]) {
  assert.equal(board.rowEconomy.tensionMachineCash, true);
  assert.equal(board.rowEconomy.welfareCost, 9);
  assert.deepEqual(board.players, oldState.players);
  assert.equal(productionPreview(board, { type: 'activate', sector: 'Tessile', intensity: 1 }).coins, 6);
}
assert.equal(JSON.stringify(saved), raw);
assert.equal(loaded.config.workers.filter(w => w.effect.verbo === 'perOgni' && w.effect.f2?.conta === 'tensione').length, 18);

// Historical row-economy configurations still flatten their original effects as before.
initGame(oldGameConfig);
for (const old of previous) assert.deepEqual(WORKER_BY_ID[old.id], old);
const aiState = initGame(config);
aiState.phase = 'action'; aiState.players[0].node = 'Tessile';
aiState.players[0].depts.terziario.sopra = [previousCards.find(w => w.sector === 'Tessile').id];
aiState.players[0].depts.terziario.sotto = ids.slice(0, 2);
aiState.players[0].depts.terziario.tension = 3;
assert.doesNotThrow(() => applyCommand(aiState, chooseCommand(aiState)), 'Normal d6 search uses the updated engine');
console.log('OK: exactly 18 changed/54 unchanged, initial tension 0–4, one/two machines in all departments, both modes, previews, installation, config/save/undo migration, historical rules and d6.');
