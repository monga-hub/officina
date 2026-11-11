import assert from 'node:assert/strict';
import { chooseLabCommand, chooseTimedCommand, lastDecision } from '../src/game/ai.js';
import { applyCommand, hireCost, initGame, legalCommands, WORKER_BY_ID } from '../src/game/engine.js';
import { activeMachineIds } from '../src/game/row-economy.js';
import { gameConfig, mainDefaults, parseConfig } from '../src/lab/config.js';
import { newStudy, observeStudy } from '../src/lab/study.js';

const editor = mainDefaults();
assert.equal(editor.machineReserve, true);
assert.equal(parseConfig(JSON.stringify(editor)).machineReserve, true);
const legacy = { ...editor, machineReserve: false };
assert.equal(parseConfig(JSON.stringify(legacy)).machineReserve, false);
assert.equal(initGame(gameConfig(legacy)).machineReserve, undefined);

const cfg = gameConfig({ ...editor, machineImmediate: false }, { seed: 1909 });
assert.ok(cfg.machineReserve && cfg.rowEconomy.machineImmediate && cfg.rowEconomy.machinesRequireOpenRow);
assert.equal(cfg.rowEconomy.conversionMachines, false);
const state = initGame(cfg);
state.phase = 'action';
const player = state.players[0];
player.node = 'Servizi';
player.coins = 50;
const department = player.depts.terziario;
department.prod = 13;
department.tension = 1;
const fixed = Object.values(WORKER_BY_ID).filter(w => w.effect?.verbo === 'prendi' &&
  w.effect.f1.tipo === 'moneta' && !w.effect.continuity && !w.power);
const small = fixed.find(w => w.effect.f1.q === 1);
const medium = fixed.find(w => w.effect.f1.q === 2);
const large = fixed.find(w => w.effect.f1.q === 3);
department.sotto = [small.id, medium.id];
department.slotTurn.sotto = [1, 1];
department.sopra = [fixed.find(w => ![small.id, medium.id, large.id].includes(w.id)).id];
for (const bank of Object.values(state.banks)) {
  for (const id of [...department.sotto, ...department.sopra, large.id]) {
    const index = bank.indexOf(id);
    if (index !== -1) bank.splice(index, 1);
  }
}
state.banks.C.unshift(large.id);
const install = legalCommands(state).find(c => c.type === 'hire' && c.side === 'sotto' &&
  c.role === 'terziario' && c.cardId === large.id);
assert.ok(install);
assert.ok(!legalCommands({ ...state, machineReserve: false }).some(c => c.type === 'hire' &&
  c.side === 'sotto' && c.role === 'terziario'));
const cost = hireCost(state, player, large, 'terziario', 'sotto');
const installed = applyCommand(state, install);
assert.equal(installed.players[0].coins, player.coins - cost + 3);
assert.deepEqual(installed.players[0].depts.terziario.sotto, [small.id, medium.id, large.id]);
const blocked = structuredClone(state);
blocked.players[0].depts.terziario.tension = 4;
assert.equal(applyCommand(blocked, install).players[0].coins, player.coins - cost);

const production = structuredClone(installed);
production.phase = 'action';
production.current = 0;
production.players[0].node = 'Tessile';
const produce = legalCommands(production).find(c => c.type === 'activate' && !c.welfareToken);
assert.ok(produce);
assert.deepEqual(activeMachineIds(production, production.players[0].depts.terziario, WORKER_BY_ID), [large.id, medium.id]);
const produced = applyCommand(production, produce);
assert.equal(produced.players[0].sottoVal.baseC - production.players[0].sottoVal.baseC, 5);
const study = newStudy(state);
observeStudy(study, state, install, installed);
assert.equal(study.machines[0].immediate, 3);

const start = initGame(cfg);
const choose = () => {
  const command = chooseLabCommand(start);
  assert.ok(legalCommands(start).some(c => JSON.stringify(c) === JSON.stringify(command)));
  assert.equal(lastDecision.budgetStates, 300000);
  assert.ok(lastDecision.states <= 300000);
  return [command, lastDecision.states, lastDecision.completedDepth];
};
assert.deepEqual(choose(), choose());
const bounded = chooseTimedCommand(start, { budgetStates: 1 });
assert.ok(legalCommands(start).some(c => JSON.stringify(c) === JSON.stringify(bounded)));
assert.equal(lastDecision.states, 1);
assert.equal(lastDecision.timedOut, true);
const city = initGame(cfg);
city.phase = 'borsa';
const cityCommand = chooseLabCommand(city);
assert.ok(legalCommands(city).some(c => JSON.stringify(c) === JSON.stringify(cityCommand)));
assert.equal(lastDecision.budgetStates, 100000);
assert.ok(lastDecision.states <= 100000);
console.log('OK: third installation, immediate payout and blocked rows, best two at production, opt-out and deterministic state budget.');
