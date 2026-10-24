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
const spend = role => ({ type: 'spendWelfareToken', role });
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

// An old token remains usable when buying a new pack; new ones still stay locked.
state = fixture('Servizi', 1);
state.players[0].depts.terziario.tension = 3;
after = applyCommand(state, { type: 'investWelfare', scope: 'factory' });
assert.equal(after.pending.type, 'welfareToken');
assert.equal(after.players[0].welfareTokens, 4);
assert.equal(availableWelfareTokens(after, after.players[0]), 1);
after = applyCommand(after, spend('terziario'));
assert.equal(after.players[0].welfareTokens, 3);
assert.equal(after.players[0].depts.terziario.tension, 2);
assert.equal(after.current, 1, 'Spending once finishes the original turn');
assert.throws(() => applyCommand(after, spend('terziario')), /Azione non disponibile/);

// Protected production uses all available rows and activates cash machinery exactly once.
state = fixture('Tessile', 3);
const machine = Object.values(WORKER_BY_ID).find(w => w.effect?.verbo === 'prendi' && w.effect.f1.tipo === 'moneta');
state.players[0].depts.terziario.sotto = [machine.id];
state.players[0].depts.terziario.tension = 1;
state.players[0].depts.secondario.tension = 2;
const worker = WORKER_BY_ID[state.players[0].depts.terziario.sopra[0]];
state.players[0].depts.terziario.sustainableWelfare = 4;
assert.equal(hireCost(state, state.players[0], worker, 'terziario', 'sopra'), worker.v, 'Tokens never discount hiring');
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

// Normal production raises its own tension, then permits healing an idle department.
after = applyCommand(state, { type: 'activate', sector: 'Tessile', intensity: 1 });
assert.equal(after.pending.type, 'welfareToken');
assert.equal(after.players[0].depts.terziario.tension, 2);
assert.deepEqual(legalCommands(after), [spend('secondario'), { type: 'skipWelfareToken' }]);
assert.throws(() => applyCommand(after, spend('terziario')), /Azione non disponibile/, 'Cannot heal a department produced this turn');
const skipped = applyCommand(after, { type: 'skipWelfareToken' });
assert.equal(skipped.players[0].welfareTokens, 3);
assert.equal(skipped.current, 1);
after = applyCommand(after, spend('secondario'));
assert.equal(after.players[0].welfareTokens, 2);
assert.equal(after.players[0].depts.secondario.tension, 1);

// Recovery happens after all machinery choices and survives save/restore JSON.
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
assert.equal(after.pending.type, 'welfareToken');
const storageData=new Map(), storage={getItem:key=>storageData.get(key)??null,setItem:(key,value)=>storageData.set(key,value)};
saveGame(config,{state:after,history:[state],paused:true},storage);
const saved=loadGame(storage), restored=gameSession(saved.config,saved);
assert.deepEqual(legalCommands(restored.state),legalCommands(after),'Recovery options survive a real saved-game round trip');
assert.equal(restored.state.turnFlags.producedRole,'terziario');
const aiChoice=chooseCommand(restored.state);
assert.ok(legalCommands(restored.state).some(command=>JSON.stringify(command)===JSON.stringify(aiChoice)),'The AI resolves a token choice legally');
assert.equal(applyCommand(restored.state,aiChoice).current,1,'AI recovery finishes the pending turn');
after = applyCommand(JSON.parse(JSON.stringify(after)), spend('primario'));
assert.equal(after.current, 1);
assert.equal(after.players[0].depts.primario.tension, 1);

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
state.players[1].node = 'Servizi'; state.players[1].welfareTokens = 1;
state.players[1].depts.primario.tension = 1;
after = applyCommand(state, { type: 'pass' });
assert.equal(after.gameOver, false);
assert.equal(after.pending.type, 'welfareToken');
after = applyCommand(after, spend('primario'));
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

// Reproduce the discussed four-turn example with equal, empty-node movement costs.
function example(welfare) {
  let s = fixture(welfare ? 'Servizi' : 'Sindacato');
  const cashMachine = Object.values(WORKER_BY_ID).find(w => w.effect?.verbo === 'prendi' && w.effect.f1.tipo === 'moneta' && w.effect.f1.q === 2);
  s.players[0].coins = 15;
  s.players[0].depts.terziario.tension = 3;
  for (const role of roles) s.players[0].depts[role].sotto = [cashMachine.id];
  const commands = [
    welfare ? { type: 'investWelfare', scope: 'factory' } : { type: 'repress', role: 'terziario' },
    { type: 'activate', sector: 'Metallurgica', intensity: 1 },
    { type: 'activate', sector: 'Chimica', intensity: 1 },
    { type: 'activate', sector: 'Tessile', intensity: 1, ...(welfare ? { welfareToken: true } : {}) },
  ];
  for (const [index, command] of commands.entries()) {
    s.phase = 'action';
    if (command.sector) s.players[0].node = command.sector;
    s = applyCommand(s, command);
    if (welfare && (index === 1 || index === 2)) s = applyCommand(s, spend('terziario'));
    assert.equal(s.current, 1);
    s = applyCommand(s, legalCommands(s).find(c => c.type === 'move'));
    s = applyCommand(s, legalCommands(s).find(c => ['pass', 'endTurn'].includes(c.type)));
  }
  const p = s.players[0];
  return { produced: p.resGainedBy.produzione, stored: totalResources(p), coins: p.coins, tension: tension(p), tokens: p.welfareTokens };
}
assert.deepEqual(example(false), { produced: 10, stored: 10, coins: 19, tension: [1, 2, 2], tokens: 0 });
assert.deepEqual(example(true), { produced: 11, stored: 10, coins: 12, tension: [1, 1, 1], tokens: 0 });
console.log('OK: token purchase cooldown, one-use limit, full protected production, idle recovery, pending choices, final turn, fixed redistribution and legacy rules.');
