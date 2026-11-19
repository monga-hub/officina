import assert from 'node:assert/strict';
import { mainDefaults, gameConfig } from '../src/lab/config.js';
import { initGame, legalCommands, applyCommand } from '../src/game/engine.js';

const approved = {
  Metallurgica: ['Sindacato', 'Servizi'],
  Sindacato: ['Metallurgica', 'Tessile'],
  Tessile: ['Sindacato', 'Chimica'],
  Chimica: ['Tessile', 'Servizi'],
  Servizi: ['Chimica', 'Metallurgica'],
};
const poles = Object.keys(approved);
function position(from, players = 2, starMovement = true) {
  const config = gameConfig(mainDefaults());
  const state = initGame({ ...config, players: config.players.slice(0, players), roundRondel: undefined, starMovement });
  assert.equal(state.nPlayers, players);
  state.phase = 'move';
  state.players.forEach(p => { p.node = 'Borsa'; p.coins = 20; });
  state.players[state.current].node = from;
  return state;
}
const moves = state => legalCommands(state).filter(c => c.type === 'move');
for (const from of poles) {
  const state = position(from), legal = moves(state);
  assert.deepEqual(legal.map(c => c.node).sort(), [...approved[from], 'Borsa'].sort(), `${from}: only the two opposite poles and City`);
  for (const command of legal) {
    assert.equal(command.cost, 0);
    assert.equal(applyCommand(state, command).players[state.current].node, command.node);
  }
  for (const to of poles.filter(n => n !== from && !approved[from].includes(n))) {
    assert.throws(() => applyCommand(state, { type: 'move', node: to, cost: 1 }), /disponibile|collegato/, `${from} cannot buy an adjacent-pole move`);
  }
}
assert.deepEqual(moves(position('Borsa')).map(c => c.node).sort(), poles.sort(), 'City can still reach every pole');
const occupied = position('Chimica');
occupied.players.find(p => p.id !== occupied.current).node = 'Tessile';
const enter = moves(occupied).find(c => c.node === 'Tessile');
assert.equal(enter.cost, 1, 'Second-seat entry price is unchanged');
assert.equal(applyCommand(occupied, enter).players[occupied.current].coins, 19);
for (const [players, enabled] of [[2, false], [3, true], [3, false]]) {
  assert.equal(moves(position('Chimica', players, enabled)).length, 5, 'Other movement modes remain unrestricted');
}
console.log('OK: approved 1v1 star edges, forbidden adjacent poles, City access and other movement modes.');
