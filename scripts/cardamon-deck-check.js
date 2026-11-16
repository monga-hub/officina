import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mainDefaults, mainWorkerDeck, playableConfig } from '../src/lab/config.js';
import { initGame, WORKER_BY_ID } from '../src/game/engine.js';
import { cardArtKey } from '../src/lab/cards.js';

const workers = mainWorkerDeck();
assert.equal(workers.length, 75);
assert.equal(new Set(workers.map(c => c.id)).size, 75);
assert.equal(workers.filter(c => c.nation === 'Spagnoli').length, 15);
assert.equal(workers.filter(c => c.nation === 'Greci').length, 0);
assert.deepEqual(mainDefaults().workers, workers);
// Freeze the pre-replacement IDs, order, values and complete effects, excluding nationality.
assert.equal(createHash('sha256').update(JSON.stringify(workers.map(({ nation, ...rest }) => rest))).digest('hex'),
  '60d3ce6d13c3cb0aa188df57638ab96e0908adacbdf01c494ec878fdfbc8430e');
initGame(playableConfig(mainDefaults()));
for (const card of workers.filter(c => c.nation === 'Spagnoli')) {
  assert.equal(WORKER_BY_ID[card.id].nation, 'Spagnoli');
  assert.match(cardArtKey(card), /^SP_[TMC]$/);
}

const run = input => JSON.parse(execFileSync(process.execPath,
  [new URL('./cardamon-deck.js', import.meta.url).pathname, ...(input ? ['-'] : [])],
  { input: input && JSON.stringify(input), encoding: 'utf8' }));
const plan = run();
const spanish = plan.cards.filter(c => c.badge === 'naz_spagna.png');
assert.equal(spanish.length, 15);
assert.deepEqual([...new Set(spanish.map(c => c.portrait))].sort(), ['SP_C.jpg', 'SP_M.jpg', 'SP_T.jpg']);
assert.ok(spanish.every(c => c.band === 'fascia-spagna.png'));
const document = { width: 63.5, height: 88.9, layouts: [{ id: 'default' }, { id: 'per-unita' }], cardsAllIds: [], cardsById: {}, fields: {} };
for (const card of plan.cards) {
  document.cardsAllIds.push(card.id);
  document.cardsById[card.id] = { id: card.id, count: 1, ...(card.unit ? { layoutId: 'per-unita' } : {}) };
  const fields = document.fields[card.id] = {};
  for (const [id, name] of Object.entries({ illustrazione: card.portrait, fascia: card.band, nazionalita: card.badge, reparto: card.sector, 'rendita-moneta': 'marchi_fondo.png', ...(card.unit ? { 'rendita-unita': card.unit } : {}) })) {
    fields[id] = { id, type: 'image', name, imageWidth: 640, imageHeight: 640, zoom: 0.03, cx: 0, cy: 0 };
  }
  for (const id of ['valore', 'rendita-valore', ...(card.unit ? ['rendita-per'] : [])]) fields[id] = { id, type: 'text', value: '', fontSize: 10 };
}
const first = run({ document, revision: 1 });
assert.equal(first.changed, true);
const second = run({ document: first.document, revision: 2 });
assert.equal(second.changed, false);
assert.deepEqual(second.added, []);
assert.deepEqual(second.removed, []);
assert.equal(second.fingerprint, first.fingerprint);
console.log('OK: 75 stable cards/mechanics, 15 Spanish defaults and engine cards, Spanish artwork, idempotent Cardamon update.');
