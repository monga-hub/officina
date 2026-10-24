import assert from 'node:assert/strict';
import { studyConfig } from './row-economy-config.js';
import { initGame, applyCommand, legalCommands, WORKER_BY_ID, workerCapacity } from '../src/game/engine.js';
import { activeTrackEnd } from '../src/game/data.js';
import { repressionCost } from '../src/game/row-economy.js';

let checks = 0;
const test = (name, fn) => { fn(); checks++; console.log('✓', name); };
const at = (s, node) => { s.current = 0; s.phase = node === 'Borsa' ? 'borsa' : 'action'; s.players[0].node = node; s.pending = null; s.pendingQueue = []; s.sindacatoSession = null; return s; };
function setup() {
  const s = initGame(studyConfig());
  const d = s.players[0].depts.terziario;
  d.sopra = [Object.values(WORKER_BY_ID).find(w => !w.power && w.sector === d.sector).id];
  return s;
}
test('ingresso nella riga: anche i bonus dopo il segnalino producono', () => {
  let s = setup(); const d = s.players[0].depts.terziario;
  d.prod = 5; d.tension = 0; s.tracks.terziario[8] = { res: 2 };
  assert.equal(activeTrackEnd(5, 0, 'righe4', true), 8);
  s = applyCommand(at(s, d.sector), { type: 'activate', sector: d.sector, intensity: 1 });
  assert.equal(s.players[0].resources.Tessuti, 4);
  assert.equal(s.players[0].depts.terziario.tension, 1);
});
test('welfare pagato una volta; scelta della riga, recupero dopo la resa e macchinari attivi', () => {
  let s = setup(); s.players[0].coins = 10;
  s = applyCommand(at(s, 'Servizi'), { type: 'investWelfare', role: 'terziario' });
  assert.equal(s.players[0].coins, 7);
  const d = s.players[0].depts.terziario; d.prod = 13; d.tension = 3;
  const machine = Object.values(WORKER_BY_ID).find(w => !w.power && w.v === 4 && w.effect?.f1?.q === 3 && w.effect?.verbo === 'prendi');
  d.sotto = [machine.id]; s.tracks.terziario[8] = { res: 2 };
  const before = structuredClone(s.players[0]);
  at(s, d.sector);
  assert.equal(legalCommands(s).filter(c => c.sustainableRow !== undefined).length, 3);
  s = applyCommand(s, { type: 'activate', sector: d.sector, intensity: 1, sustainableRow: 1 });
  assert.equal(s.players[0].resources.Tessuti - before.resources.Tessuti, 3);
  assert.equal(s.players[0].coins - before.coins, 3);
  assert.equal(s.players[0].depts.terziario.tension, 2);
  assert.ok(!legalCommands(at(s, 'Servizi')).some(c => c.type === 'investWelfare' && c.role === 'terziario'));
});
test('reparto totalmente coperto: recupero possibile; nessun recupero senza welfare', () => {
  let s = setup(); const d = s.players[0].depts.terziario; d.tension = 6; d.prod = 24;
  at(s, d.sector);
  assert.throws(() => applyCommand(s, { type: 'activate', sector: d.sector, intensity: 1, sustainableRow: -1 }));
  d.sustainableWelfare = 1;
  s = applyCommand(s, { type: 'activate', sector: d.sector, intensity: 1, sustainableRow: -1 });
  assert.equal(s.players[0].depts.terziario.tension, 5);
  assert.equal(s.players[0].resources.Tessuti, 0);
});
test('repressione: costo crescente del giocatore, pagamento e nessuna trattativa gratuita', () => {
  let s = setup(); s.players[0].coins = 10;
  s.players[0].depts.terziario.tension = 4;
  at(s, 'Sindacato');
  assert.ok(!legalCommands(s).some(c => c.type === 'trattativa'));
  s = applyCommand(s, { type: 'repress', role: 'terziario' });
  assert.equal(s.players[0].coins, 8); assert.equal(s.players[0].depts.terziario.tension, 2);
  s.players[0].depts.secondario.tension = 3;
  assert.equal(repressionCost(s, s.players[0]), 3);
  s = applyCommand(at(s, 'Sindacato'), { type: 'repress', role: 'secondario' });
  assert.equal(s.players[0].coins, 5); assert.equal(s.players[0].depts.secondario.tension, 1);
  s.players[0].coins = 3;
  assert.ok(!legalCommands(at(s, 'Sindacato')).some(c => c.type === 'repress'));
});
test('assunzione scontata: sviluppo del valore stampato; nessuna mappa o capacità artificiale', () => {
  let s = setup(); const p = s.players[0], d = p.depts.terziario;
  assert.equal(workerCapacity(s, p, 'terziario'), Infinity);
  assert.equal(s.borsaFabbriche.enabled, false);
  d.prod = 1; p.coins = 10; p.struttura = ['hire-1_Tessile+Chimica'];
  const w = Object.values(WORKER_BY_ID).find(w => !w.power && w.sector === d.sector && w.v === 4);
  const bank = s.nodeBanks[d.sector][0]; s.banks[bank] = [w.id];
  s = applyCommand(at(s, d.sector), { type: 'hire', bank, cardId: w.id, role: 'terziario', side: 'sopra' });
  assert.equal(s.players[0].depts.terziario.prod, 5);
  assert.equal(s.players[0].coins, 7);
});
test('commesse: marchi subito, PV originali e nessuna rendita automatica successiva', () => {
  let s = setup(); const p = s.players[0];
  p.resources = { Tessuti: 30, Acciaio: 30, Coloranti: 30 };
  at(s, 'Borsa');
  const c = legalCommands(s).find(c => c.type === 'completeContract' && c.size === 'small'); assert.ok(c);
  const cash = p.coins;
  s = applyCommand(s, c);
  assert.equal(s.players[0].coins, cash + 2);
  assert.equal(s.players[0].coinsGainedBy.commessa, 2);
  assert.equal(s.players[0].contractsWon.length, 1);
  assert.equal(s.players[0].contractEngines.length, 0);
});
console.log(`${checks} controlli Welfare 1 / repressione superati.`);
