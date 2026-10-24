// Self-check: trigger di fine partita "mazzi commesse esauriti".
// Quando le 3 pile di pesca sono vuote (commesse scoperte restano sul tabellone), si completa il giro
// corrente fino al primo giocatore, poi conteggio finale (semantica finalRound, non immediato).
// Uso: node scripts/contracts-empty-check.js
import assert from 'node:assert';
import fs from 'node:fs';
import { initGame, applyCommand, legalCommands } from '../src/game/engine.js';
import { chooseCommand } from '../src/game/ai.js';

const ok = (c, m) => { assert.ok(c, m); console.log('✓ ' + m); };
const bl = JSON.parse(fs.readFileSync(new URL('../src/game/baseline-config.json', import.meta.url)));
bl.newWorkers = bl.workers;
const SIZES = ['small', 'medium', 'large'];
const nPlayers = 4;
const MAX_STEPS = 20000;

function runToEnd(state) {
  let steps = 0;
  while (!state.gameOver && steps < MAX_STEPS) {
    const cmd = chooseCommand(state);
    if (!cmd) throw new Error(`AI senza mossa (phase=${state.phase})`);
    const legal = legalCommands(state);
    const isLegal = legal.some(l => JSON.stringify(l) === JSON.stringify(cmd)) ||
      ['trattativa', 'resolveEffect', 'strikeBlock'].includes(cmd.type);
    if (!isLegal && cmd.type !== 'pass') throw new Error(`Comando non legale: ${JSON.stringify(cmd)}`);
    state = applyCommand(state, cmd);
    steps++;
  }
  return { state, steps };
}

// ---- Trigger: mazzi svuotati a inizio partita ----
{
  const s = initGame({ ...bl, seed: 4242, players: Array.from({ length: nPlayers }, (_, i) => ({ name: `AI${i + 1}`, isAI: true })) });
  for (const size of SIZES) s.contracts[size].deck = []; // svuota SOLO le pile di pesca, non gli slot scoperti
  const activeBefore = SIZES.reduce((n, size) => n + s.contracts[size].active.filter(Boolean).length, 0);
  ok(activeBefore > 0, `commesse scoperte sul tabellone all'avvio del test: ${activeBefore}`);
  ok(!s.finalRound && !s.gameOver, 'partita non ancora in ultimo giro né finita prima del primo turno');

  const { state, steps } = runToEnd(s);
  ok(state.gameOver, `partita terminata (${steps} step)`);
  ok(state.finalRound, 'finalRound attivato dal trigger mazzi esauriti');
  ok(state.turn === 1, `chiusa nel giro corrente fino al primo giocatore (turn=${state.turn})`);
  const activeAfter = SIZES.reduce((n, size) => n + state.contracts[size].active.filter(Boolean).length, 0);
  ok(SIZES.every(size => state.contracts[size].deck.length === 0), 'tutte le pile di pesca vuote a fine partita');
  ok(activeAfter >= 0 && activeBefore > 0, `le commesse restano sul tabellone (attive residue: ${activeAfter})`);
}

// ---- Sanità: senza svuotare i mazzi il trigger NON scatta a inizio partita ----
{
  const s = initGame({ ...bl, seed: 4242, players: Array.from({ length: nPlayers }, (_, i) => ({ name: `AI${i + 1}`, isAI: true })) });
  const anyDeck = SIZES.some(size => s.contracts[size].deck.length > 0);
  ok(anyDeck, 'con mazzi pieni almeno una pila ha carte da pescare (trigger non pre-attivato)');
  ok(s.endMode === 'contracts', "endMode default = 'contracts' (mazzetti)");
}

// ---- Toggle 'clock': con mazzi intatti chiude il Clock a soglia (vecchio comportamento) ----
{
  const s = initGame({ ...bl, endMode: 'clock', seed: 4242, players: Array.from({ length: nPlayers }, (_, i) => ({ name: `AI${i + 1}`, isAI: true })) });
  ok(s.endMode === 'clock', "endMode='clock' rispettato");
  const { state, steps } = runToEnd(s);
  ok(state.gameOver, `modalità clock: partita terminata (${steps} step)`);
  ok(state.finalRound && state.clock >= state.clockThreshold, `chiusa dal Clock a soglia (${state.clock}/${state.clockThreshold})`);
}

// ---- Toggle 'clock': mazzi vuoti NON chiudono al giro 1 (trigger mazzetti inerte in modalità clock) ----
{
  const s = initGame({ ...bl, endMode: 'clock', seed: 4242, players: Array.from({ length: nPlayers }, (_, i) => ({ name: `AI${i + 1}`, isAI: true })) });
  for (const size of SIZES) s.contracts[size].deck = [];
  const { state } = runToEnd(s);
  ok(state.turn > 1, `mazzi vuoti in modalità clock non chiudono al giro 1 (turn=${state.turn})`);
}

console.log('\n✓ contracts-empty-check: trigger fine partita per mazzi commesse esauriti ok');
