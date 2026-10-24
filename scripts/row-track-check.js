import assert from 'node:assert/strict';
import fs from 'node:fs';
import { TRACK_MODELS, trackGridPos, activeTrackEnd, inferTrackModel, RESOURCE_OF } from '../src/game/data.js';
import { initGame, applyCommand, legalCommands, WORKER_BY_ID, tensionLimit, trackPV } from '../src/game/engine.js';
import { runOneGame, formatReport } from '../src/game/batchsim.js';

const baseline = JSON.parse(fs.readFileSync(new URL('../src/game/baseline-config.json', import.meta.url)));
const roles = ['terziario', 'secondario', 'primario'];
const players = [{ name: 'A', isAI: true }, { name: 'B', isAI: true }];
let checks = 0;
const check = (name, fn) => { fn(); checks++; console.log('✓ ' + name); };
function config(model) {
  return { ...baseline, trackModel: model, tracks: Object.fromEntries(roles.map(r => [r, TRACK_MODELS[model].track])),
    seed: 1907, players, headless: true, aiRollout: null, endMode: 'rounds', roundLimit: 14,
    startTension: { terziario: 0, secondario: 0, primario: 0 },
    industrial: { enabled: true, push: true, development: 'off', productionMode: 'compact' },
    sottoInstantEffect: false, contractEngine: false,
    borsaFabbriche: { ...baseline.borsaFabbriche, setupPlacement: false, passiveIncome: false, foundingResource: false },
  };
}
function setup(model = 'righe4') {
  const s = initGame(config(model));
  const d = s.players[0].depts.terziario;
  d.sopra = Object.values(WORKER_BY_ID).filter(w => !w.power && w.sector === d.sector).slice(0, 2).map(w => w.id);
  return s;
}
function at(s, node) {
  s.current = 0; s.phase = 'action'; s.pending = null; s.pendingQueue = []; s.players[0].node = node;
  s.sindacatoSession = node === 'Sindacato' ? {} : null;
  return s;
}
function act(s) {
  at(s, s.players[0].depts.terziario.sector);
  return applyCommand(s, { type: 'activate', sector: s.players[0].node, intensity: 1 });
}
for (const model of ['righe3', 'righe4']) {
  const { columns: cols, max } = TRACK_MODELS[model];
  check(`${model}: serpentina dall’alto e corrispondenza esatta tensione/righe`, () => {
    assert.deepEqual(trackGridPos(1, max), [0, 0]);
    assert.deepEqual(trackGridPos(cols + 1, max), [1, cols - 1]);
    assert.deepEqual(trackGridPos(max, max), [5, 0]);
    for (let t = 0; t <= 6; t++) assert.equal(activeTrackEnd(max, t, model), (6 - t) * cols);
    assert.equal(activeTrackEnd(2, 3, model), 2, 'cuscinetto non sviluppato');
    assert.equal(inferTrackModel({ tracks: { terziario: TRACK_MODELS[model].track } }), model);
  });
  check(`${model}: bonus prima del +1, nessuna moltiplicazione per operai`, () => {
    const s = setup(model), p = s.players[0], d = p.depts.terziario;
    d.prod = max; d.tension = 3;
    const legal = legalCommands(at(s, d.sector)).filter(c => c.type === 'activate');
    assert.equal(legal.length, 1); assert.equal(legal[0].intensity, 1);
    const out = act(s), after = out.players[0];
    assert.equal(after.resources[RESOURCE_OF[d.sector]] - p.resources[RESOURCE_OF[d.sector]], 3);
    assert.equal(after.depts.terziario.tension, 4);
    assert.equal(after.depts.terziario.prod, max);
    assert.equal(s.players[0].depts.terziario.tension, 3, 'stato originale immutato');
  });
  check(`${model}: ultima riga, copertura completa, recupero senza perdere sviluppo`, () => {
    let s = setup(model), d = s.players[0].depts.terziario;
    d.prod = max; d.tension = 5;
    s = act(s); d = s.players[0].depts.terziario;
    assert.equal(d.tension, 6); assert.equal(d.shutdown, false); assert.equal(d.blocked.length, 0);
    const resources = s.players[0].resources[RESOURCE_OF[d.sector]];
    s = act(s);
    assert.equal(s.players[0].resources[RESOURCE_OF[d.sector]], resources);
    assert.equal(s.players[0].depts.terziario.tension, 6);
    assert.equal(s.strikeLog.length, 0);
    at(s, 'Sindacato');
    assert.ok(legalCommands(s).filter(c => c.type === 'trattativa').every(c => c.targetPlayer == null));
    s = applyCommand(s, { type: 'trattativa', resetRole: 'terziario' });
    assert.equal(s.players[0].depts.terziario.tension, 5);
    assert.equal(s.players[0].depts.terziario.prod, max);
    s = act(s);
    assert.equal(s.players[0].resources[RESOURCE_OF[d.sector]], resources + 1);
  });
}
check('assumere sviluppa in base al prezzo pagato senza incassare bonus immediati', () => {
  for (const value of [2, 3, 4]) {
    const s = setup(), p = s.players[0], d = p.depts.terziario;
    d.sopra = []; d.prod = 1; d.tension = 6; p.coins = 20;
    const w = Object.values(WORKER_BY_ID).find(w => !w.power && w.sector === d.sector && w.v === value);
    assert.ok(w);
    const bank = s.nodeBanks[d.sector].find(b => b !== 'Impiegati');
    s.banks[bank] = [w.id];
    at(s, d.sector);
    const cmd = legalCommands(s).find(c => c.type === 'hire' && c.cardId === w.id && c.side === 'sopra');
    assert.ok(cmd);
    const out = applyCommand(s, cmd).players[0];
    assert.equal(out.coins, 20 - value);
    assert.equal(out.depts.terziario.prod, 1 + value);
    assert.equal(out.resources[RESOURCE_OF[d.sector]], 0);
  }
});
check('la copertura esclude anche le tile produttive, ma conserva soglie PV e milestone', () => {
  const s = setup(), p = s.players[0], d = p.depts.terziario;
  d.prod = 24; d.tension = 5;
  s.tracks.terziario[5] = { tileSlot: 1 };
  s.tracks.terziario[6] = { pv: 3 };
  d.tileFills[5] = 'testCoin';
  s.trackTileById.testCoin = { id: 'testCoin', effect: { verbo: 'prendi', f1: { q: 3, tipo: 'moneta' } } };
  assert.equal(trackPV(s, p), 3);
  const out = act(s).players[0];
  assert.equal(out.coins, p.coins);
  assert.equal(out.resources[RESOURCE_OF[d.sector]], 1);
  assert.equal(out.depts.terziario.tileFills[5], 'testCoin');
});
check('le carte Sotto restano attive quando il tracciato è coperto', () => {
  const s = setup(), p = s.players[0], d = p.depts.terziario;
  d.prod = 24; d.tension = 6;
  const card = Object.values(WORKER_BY_ID).find(w => !w.power && !d.sopra.includes(w.id));
  WORKER_BY_ID[card.id] = { ...card, effect: { verbo: 'prendi', f1: { q: 2, tipo: 'moneta' } } };
  d.sotto = [card.id];
  assert.equal(act(s).players[0].coins - p.coins, 2);
});
check('vecchi modelli conservano orientamento e regole', () => {
  assert.deepEqual(trackGridPos(1, 16), [3, 0]);
  assert.deepEqual(trackGridPos(1, 12), [3, 0]);
  const s = initGame({ ...baseline, players, industrial: { enabled: false } });
  assert.equal(s.rowTrack, false); assert.equal(tensionLimit(s), 3);
  assert.equal(activeTrackEnd(10, 3, 'classico'), 10);
});
check('partita breve per ciascun formato e report con regole effettive', () => {
  for (const model of ['righe3', 'righe4']) {
    const cfg = config(model);
    const game = runOneGame(cfg);
    assert.ok(!game.failed, JSON.stringify(game.error));
    const report = formatReport([game], cfg);
    assert.ok(report.includes('Tracciato a righe: 6 ×'));
  }
});
console.log(`\n${checks} controlli tensione a righe superati.`);
