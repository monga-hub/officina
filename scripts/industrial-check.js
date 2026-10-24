// Invarianti delle varianti Archimede, senza UI né casualità nelle posizioni di prova.
// Esegui: node scripts/industrial-check.js
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initGame, legalCommands, applyCommand, WORKER_BY_ID, maxIntensity, workerCapacity, hireCost, scorePlayer } from '../src/game/engine.js';
import { industrialPreset, normalizeIndustrial, wellbeing, resourcePayments } from '../src/game/industrial.js';
import { runOneGame, formatIndustrialReport } from '../src/game/batchsim.js';
import { chooseCommand, resetRolloutStats, rolloutStats } from '../src/game/ai.js';

const baseline = JSON.parse(fs.readFileSync(new URL('../src/game/baseline-config.json', import.meta.url)));
const roles = ['terziario', 'secondario', 'primario'];
const players = [{ name: 'A', isAI: true }, { name: 'B', isAI: true }];
let checks = 0;
function check(name, fn) { fn(); checks++; console.log(`✓ ${name}`); }
function setup(overrides = {}, config = {}) {
  const cfg = industrialPreset({ ...baseline, players, seed: 1907, headless: true }, false);
  cfg.industrial = normalizeIndustrial({ ...cfg.industrial, ...overrides });
  return initGame({ ...cfg, ...config });
}
function workers(s, n = 2, role = 'terziario') {
  const d = s.players[0].depts[role];
  d.sopra = Object.values(WORKER_BY_ID).filter(w => !w.power && w.sector === d.sector).slice(0, n).map(w => w.id);
  assert.equal(d.sopra.length, n);
  return d;
}
function at(s, node) {
  s.current = 0; s.phase = 'action'; s.pending = null; s.players[0].node = node;
  s.sindacatoSession = node === 'Sindacato' ? {} : null;
  return s;
}
function act(s, intensity = 1) {
  at(s, s.players[0].depts.terziario.sector);
  return applyCommand(s, { type: 'activate', sector: s.players[0].node, intensity });
}
function buy(s, id = 'efficiency') {
  at(s, 'Sindacato');
  const cmd = legalCommands(s).find(c => c.type === 'buyPolicy' && c.role === 'terziario' && c.policyId === id);
  assert.ok(cmd, `Welfare ${id} acquistabile`);
  return applyCommand(s, cmd);
}

check('configurazione valida, indipendente e riproducibile', () => {
  assert.equal(normalizeIndustrial(null).enabled, false);
  assert.equal(normalizeIndustrial({ tensionLimit: 999 }).tensionLimit, 12);
  const before = JSON.stringify(baseline);
  const cfg = industrialPreset(baseline);
  cfg.industrial.welfareCards[0].pv = 6;
  assert.equal(JSON.stringify(baseline), before);
  assert.equal(industrialPreset(baseline).industrial.welfareCards[0].pv, 1);
  const s = setup();
  assert.ok(Object.values(s.banks).flat().every(id => !WORKER_BY_ID[id].power), 'Impiegati esclusi quando il tracciato è spento');
});
check('spinta limitata agli operai attivi; risorse moltiplicate, marchi una volta', () => {
  const s = setup(); const d = workers(s); const p = s.players[0];
  const initial = p.coins;
  const out = act(s, 2);
  assert.equal(out.players[0].resources.Tessuti, 2);
  assert.equal(out.players[0].coins - initial, 2);
  assert.equal(out.players[0].depts.terziario.tension, 2);
  assert.equal(s.players[0].resources.Tessuti, 0, 'comando immutabile');
  d.blocked.push(d.sopra[0]);
  assert.equal(maxIntensity(s, d), 1);
  assert.throws(() => act(s, 2), /non disponibile/);
  d.blocked.push(d.sopra[1]);
  assert.equal(maxIntensity(s, d), 0);
  assert.throws(() => act(s), /non disponibile/);
});
check('le risorse Sotto rispettano il tetto anche con moltiplicatori grandi', () => {
  const s = setup(); const d = workers(s);
  const card = Object.values(WORKER_BY_ID).find(w => !w.power && !d.sopra.includes(w.id));
  WORKER_BY_ID[card.id] = { ...card, sector: 'Tessile', effect: { verbo: 'prendi', f1: { q: 12, tipo: 'risorsa', settore: 'Tessile' } } };
  d.sotto = [card.id];
  assert.equal(act(s, 2).players[0].resources.Tessuti, 4, '2 base + 2 Sotto, non 26');
});
check('soglie progressive: sovrapprezzo, blocco singolo, resa prima della fermata', () => {
  let s = setup(); let d = workers(s); d.tension = 4;
  const w = WORKER_BY_ID[d.sopra[0]];
  assert.equal(hireCost(s, s.players[0], w, 'terziario'), w.v + 1);
  s = act(s); d = s.players[0].depts.terziario;
  assert.equal(d.blocked.length, 1); assert.equal(d.tension, 5); assert.equal(d.shutdown, false);
  assert.equal(maxIntensity(s, d), 1);
  s = act(s); assert.equal(s.players[0].depts.terziario.blocked.length, 1, 'non ripete il blocco restando sopra soglia');
  s = act(s); d = s.players[0].depts.terziario;
  assert.equal(s.players[0].resources.Tessuti, 3); assert.equal(d.tension, 7); assert.equal(d.shutdown, true);
  assert.equal(maxIntensity(s, d), 0); assert.equal(s.players[0].industrialStats.shutdowns, 1);
  at(s, 'Sindacato'); const coins = s.players[0].coins;
  s = applyCommand(s, { type: 'trattativa', resetRole: 'terziario' });
  assert.equal(s.players[0].depts.terziario.tension, 6);
  assert.equal(s.players[0].depts.terziario.shutdown, true, 'abbassare tensione non riapre');
  assert.ok(!legalCommands(s).some(c => c.type === 'trattativa'), 'una trattativa per visita');
  s = applyCommand(s, { type: 'restartDepartment', role: 'terziario' });
  assert.equal(s.players[0].coins, coins - 5);
  assert.equal(s.players[0].depts.terziario.tension, 3);
  assert.equal(s.players[0].depts.terziario.shutdown, false);
  assert.equal(s.players[0].depts.terziario.blocked.length, 1);
  assert.ok(!legalCommands(s).some(c => c.type === 'unblockSciopero'), 'recupero e riapertura condividono uso');
  assert.equal(s.strikeLog.find(e => e.kind === 'shutdown').resolved, true);
});
check('fabbriche: posti aggiunti nei settori adiacenti, anche dopo reparto pieno', () => {
  let s = setup(); workers(s); s.players[0].coins = 100; at(s, 'Servizi');
  assert.equal(workerCapacity(s, s.players[0], 'terziario'), 2);
  const cmd = legalCommands(s).find(c => c.type === 'buildFactory'); assert.ok(cmd);
  s = applyCommand(s, cmd);
  assert.ok(roles.some(r => workerCapacity(s, s.players[0], r) === 3));
  assert.ok(roles.every(r => workerCapacity(s, s.players[0], r) <= 3), 'un colore non viene contato due volte');
});
check('Welfare richiede benessere e pagamento esatto, con libertà di colore', () => {
  let s = setup(); const d = workers(s); s.players[0].resources = { Tessuti: 2, Acciaio: 2, Coloranti: 1 };
  s.players[0].coins = 10; at(s, 'Sindacato');
  assert.equal(resourcePayments(s.players[0].resources, 2).length, 5);
  const cmd = legalCommands(s).find(c => c.type === 'buyPolicy' && c.role === 'terziario' && c.policyId === 'efficiency');
  assert.throws(() => applyCommand(s, { ...cmd, payment: { Tessuti: 0, Acciaio: 0, Coloranti: 0 } }), /non disponibile/);
  d.tension = 4; assert.equal(wellbeing(s, d), 3);
  assert.ok(!legalCommands(s).some(c => c.type === 'buyPolicy' && c.role === 'terziario' && c.policyId === 'efficiency'));
  d.tension = 3; s = buy(s);
  assert.equal(s.players[0].coins, 7);
  assert.equal(Object.values(s.players[0].resources).reduce((a, b) => a + b), 3);
  assert.equal(s.players[0].resSpentByCat.welfare, 2);
  assert.equal(s.players[0].depts.terziario.tension, 3, 'requisito non consumato');
  assert.ok(!legalCommands(s).some(c => c.type === 'buyPolicy'), 'un solo acquisto per visita');
});
check('Welfare efficiente: beneficio per operaio coperto, nessun bonus illimitato', () => {
  const s = setup(); const d = workers(s, 3); d.welfare = ['efficiency'];
  assert.equal(act(s, 3).players[0].resources.Tessuti, 5, '3 base + 2 coperti');
});
check('Welfare condizionato: spingere oltre il benessere sospende il bonus subito', () => {
  const s = setup({ welfareNeedsWellbeing: true }); const d = workers(s); d.welfare = ['efficiency']; d.tension = 2;
  const calm = act(s, 1), push = act(s, 2);
  assert.equal(calm.players[0].resources.Tessuti, 2, 'T3: 1 base + 1 Welfare');
  assert.equal(push.players[0].resources.Tessuti, 2, 'T4: 2 base, nessun Welfare');
  assert.deepEqual(push.players[0].depts.terziario.welfare, ['efficiency'], 'la carta non viene persa');
});
check('ripartenza completa: una visita pagata recupera filiera e operai; nessun recupero gratuito', () => {
  let s = setup({ restartClearsWorkers: true, restartTension: 0 }); const d = workers(s); d.tension = 4;
  s = act(s, 2); s = act(s, 1);
  assert.equal(s.players[0].depts.terziario.shutdown, true);
  at(s, 'Sindacato'); const money = s.players[0].coins;
  s = applyCommand(s, { type: 'restartDepartment', role: 'terziario' });
  assert.equal(s.players[0].coins, money - 5);
  assert.equal(s.players[0].depts.terziario.tension, 0);
  assert.equal(maxIntensity(s, s.players[0].depts.terziario), 2);
  assert.ok(s.strikeLog.every(e => e.resolved));
  assert.ok(!legalCommands(s).some(c => c.type === 'restartDepartment'));
});
check('Welfare spendibile e punti acquisto; spendere benessere può bloccare un operaio', () => {
  let s = setup({ welfareAccess: 'spend', welfareScoring: 'purchase' });
  const d = workers(s); d.tension = 3;
  s.players[0].resources.Tessuti = 2; s.players[0].coins = 10;
  s = buy(s);
  assert.equal(s.players[0].depts.terziario.tension, 5);
  assert.equal(s.players[0].depts.terziario.blocked.length, 1);
  assert.equal(scorePlayer(s, s.players[0]).pvWelfare, 1);
});
check('punti Welfare finali e periodici condizionati; nessun doppio pagamento al turno 28', () => {
  let s = setup({ welfareScoring: 'final' }); let d = workers(s); d.welfare = ['efficiency'];
  assert.equal(scorePlayer(s, s.players[0]).pvWelfare, 1);
  d.tension = 4; assert.equal(scorePlayer(s, s.players[0]).pvWelfare, 0);
  for (const endMode of ['rounds', 'contracts']) {
    s = setup({}, { endMode }); d = workers(s); d.welfare = ['efficiency'];
    s.turn = 28; s.roundTurns = 1; at(s, 'Sindacato');
    if (endMode === 'contracts') for (const entry of Object.values(s.contracts)) entry.deck = [];
    s = applyCommand(s, { type: 'pass' });
    assert.equal(s.gameOver, true);
    assert.equal(s.players[0].pvWelfare, 1);
    assert.equal(s.results.find(r => r.playerId === 0).pvWelfare, 1);
    assert.equal(s.players[0].welfareLog.length, 1);
  }
  s = setup(); d = workers(s); d.welfare = ['efficiency']; d.shutdown = true;
  s.turn = 7; s.roundTurns = 1; at(s, 'Sindacato'); s = applyCommand(s, { type: 'pass' });
  assert.equal(s.players[0].pvWelfare, 0, 'nessun premio per filiera ferma');
});
check('formazione permette assunzioni fuori settore; recupero migliora la trattativa', () => {
  let s = setup(); const d = workers(s, 1); d.welfare = ['flexibility', 'recovery'];
  s.players[0].coins = 100; d.tension = 4; at(s, 'Sindacato');
  const foreign = Object.values(WORKER_BY_ID).find(w => !w.power && w.sector !== d.sector);
  const bank = s.nodeBanks.Sindacato.find(b => !Object.values(s.banks[b]).some(id => WORKER_BY_ID[id].power));
  s.banks[bank].unshift(foreign.id);
  assert.ok(legalCommands(s).some(c => c.type === 'hire' && c.cardId === foreign.id && c.role === 'terziario' && c.side === 'sopra'));
  s = applyCommand(s, { type: 'trattativa', resetRole: 'terziario' });
  assert.equal(s.players[0].depts.terziario.tension, 2);
  assert.ok(roles.every(r => s.players[1].depts[r].tension === 0));
});
check('varianti alternative: nessuna spinta, malus spenti, blocco carta, pressione esplicita', () => {
  let s = setup({ push: false, progressive: false }); let d = workers(s); d.tension = 4;
  assert.equal(maxIntensity(s, d), 1);
  s = act(s); assert.equal(s.players[0].depts.terziario.blocked.length, 0);
  s = setup({ strikeMode: 'card' }); d = workers(s); d.tension = 6;
  s = act(s); d = s.players[0].depts.terziario;
  assert.equal(d.shutdown, false); assert.equal(d.tension, 0); assert.equal(d.blocked.length, 1);
  s = setup({ opponentPressure: true }); d = workers(s); d.tension = 2;
  s.players[1].depts.terziario.sopra = [d.sopra[0]];
  s.trattativa.attackOther = { enabled: true, cost: 2 }; at(s, 'Sindacato');
  const cmd = legalCommands(s).find(c => c.type === 'trattativa' && c.targetPlayer === 1);
  assert.ok(cmd); s = applyCommand(s, cmd);
  assert.equal(s.players[0].depts.terziario.tension, 1);
  assert.equal(s.players[1].depts.terziario.tension, 1);
  assert.equal(s.players[1].industrialStats.tensionExternal, 1);
});
check('sviluppo per operaio o per prezzo; produzione originale moltiplica solo le risorse', () => {
  for (const mode of ['workers', 'price']) {
    let s = setup({ development: mode }); s.players[0].coins = 100; at(s, 'Sindacato');
    const c = legalCommands(s).find(c => c.type === 'hire' && c.side === 'sopra' && c.role !== 'direzione');
    const from = s.players[0].depts[c.role].prod;
    const delta = mode === 'workers' ? 1 : WORKER_BY_ID[c.cardId].v;
    s = applyCommand(s, c); assert.equal(s.players[0].depts[c.role].prod, from + delta);
  }
  const s = setup({ productionMode: 'legacy' }); const d = workers(s); d.prod = 2;
  s.tracks = { ...s.tracks, terziario: [null, { res: 2 }, { coins: 3 }] };
  const money = s.players[0].coins; const out = act(s, 2);
  assert.equal(out.players[0].resources.Tessuti, 4);
  assert.equal(out.players[0].coins - money, 3);
});
check('IA: uno scambio opzionale non può spendere più risorse di quelle possedute', () => {
  const s = setup();
  s.players[0].resources.Tessuti = 1;
  for (const entry of Object.values(s.contracts)) entry.active = [];
  s.pending = { type: 'effect', playerId: 0, card: { effect: { verbo: 'scambia', f1: { q: 3, tipo: 'risorsa', settore: 'scelta' }, f2: { q: 2, tipo: 'moneta' } } } };
  const command = chooseCommand(s);
  assert.equal(command.use, false);
  assert.doesNotThrow(() => applyCommand(s, command));
});
check('IA con previsione: considera il futuro anche scegliendo dove muovere', () => {
  const s = setup({}, { aiRollout: { depth: 1, rollouts: 1 } });
  resetRolloutStats();
  const command = chooseCommand(s);
  assert.equal(command.type, 'move');
  assert.ok(rolloutStats.playForwardCalls > 0, 'la scelta del nodo deve simulare le conseguenze');
  assert.doesNotThrow(() => applyCommand(s, command));
});
check('partite complete 2, 3, 4 giocatori; contabilità e report senza NaN', () => {
  for (const n of [2, 3, 4]) {
    const cfg = industrialPreset({ ...baseline, seed: 1907, headless: true, players: Array.from({ length: n }, (_, i) => ({ name: `AI ${i}`, isAI: true })) });
    const g = runOneGame(cfg);
    assert.ok(!g.failed); assert.equal(g.turns, 28); assert.equal(g.results.length, n);
    assert.ok(g.results.every(r => Number.isFinite(r.total)));
    assert.ok(g.industrial.players.every(p => p.tensionExternal === 0 && p.payments.length === 0 && p.welfarePV === 0));
    assert.ok(!formatIndustrialReport([g]).join('\n').includes('NaN'));
  }
});
console.log(`\n${checks} verifiche Archimede superate.`);
