import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { isDeepStrictEqual } from 'node:util';
import { initGame, WORKER_BY_ID } from '../src/game/engine.js';
import { cardArtKey } from '../src/lab/cards.js';
import { mainDefaults, playableConfig } from '../src/lab/config.js';

const nations = {
  Italiani: ['italia', 'naz_italia.png'],
  Francesi: ['francia', 'naz_francia.png'],
  Polacchi: ['polonia', 'naz_polonia.png'],
  Tedeschi: ['germania', 'naz_germania.png'],
  Greci: ['grecia', 'naz_greca.png'],
  Spagnoli: ['spagna', 'naz_spagna.png'],
};
const sectors = {
  Tessile: 'reparto_tessile.png',
  Metallurgica: 'reparto_metallurgia.png',
  Chimica: 'reparto_chimica.png',
};

function activeCards() {
  // Il motore converte in marchi le rendite storiche in risorse durante initGame.
  const config = playableConfig(mainDefaults());
  initGame(config);
  return config.workers.map(({ id }) => {
    const card = WORKER_BY_ID[id];
    const effect = card.effect;
    const quantity = effect.f1?.q;
    assert(effect.f1?.tipo === 'moneta' && Number.isInteger(quantity) && quantity > 0, `Rendita non supportata: ${id}`);
    const [nation, badge] = nations[card.nation] ?? [];
    const sector = sectors[card.sector];
    const portrait = cardArtKey(card);
    assert(nation && sector && portrait, `Illustrazione non definita: ${id}`);
    let unit = null;
    if (effect.continuity) {
      assert(quantity === 1 && (effect.continuityRowsPerCoin ?? 1) === 1, `Rendita per riga non supportata: ${id}`);
      unit = 'riga-libera-pilota.png';
    } else if (effect.verbo === 'perOgni') {
      assert(effect.f2?.conta === 'tensione' && !effect.tensionRewards, `Rendita per tensione non supportata: ${id}`);
      unit = 'sciopero.png';
    } else {
      assert.equal(effect.verbo, 'prendi', `Rendita fissa non supportata: ${id}`);
    }
    return {
      id,
      value: card.v,
      quantity,
      unit,
      portrait: `${portrait}.jpg`,
      band: `fascia-${nation}.png`,
      badge,
      sector,
    };
  });
}

function rulesText(cards) {
  const fixed = new Set();
  const tension = new Set();
  let rows = false;
  for (const card of cards) {
    switch (card.unit) {
      case null: fixed.add(card.quantity); break;
      case 'sciopero.png': tension.add(card.quantity); break;
      case 'riga-libera-pilota.png': rows = true; break;
    }
  }
  const money = n => `${n} ${n === 1 ? 'marco' : 'marchi'}`;
  return [
    ...[...fixed].sort((a, b) => a - b).map(n => `Ottieni ${money(n)}.`),
    ...(rows ? ['1 marco per riga sbloccata e operativa'] : []),
    ...[...tension].sort((a, b) => a - b).map(n => `Ottieni ${money(n)} per ogni livello di tensione del reparto.`),
  ].map(line => `- ${line}`).join('\n');
}

function planUpdate(document, cards, rules) {
  const { layouts, cardsAllIds, cardsById, fields } = document;
  assert.equal(document.width, 63.5);
  assert.equal(document.height, 88.9);
  assert(Array.isArray(cardsAllIds) && cardsById && fields, 'Documento Card-a-mon non valido');
  assert.deepEqual(layouts.map(layout => layout.id).sort(), ['default', 'per-unita']);

  const defaults = new Map();
  const images = new Map();
  for (const id of cardsAllIds) {
    const layout = cardsById[id].layoutId ?? 'default';
    if (!defaults.has(layout)) defaults.set(layout, fields[id]);
    for (const field of Object.values(fields[id])) {
      if (field.type === 'image') images.set(`${field.id}:${field.name}`, field);
    }
  }

  const next = {
    ...document,
    cardsAllIds: cards.map(card => card.id),
    cardsById: {},
    fields: {},
    game: { ...document.game, rules },
  };
  for (const card of cards) {
    const previous = cardsById[card.id];
    const layout = card.unit ? 'per-unita' : 'default';
    const sameLayout = previous && (previous.layoutId ?? 'default') === layout;
    const template = defaults.get(layout);
    assert(template, `Il progetto non contiene un esempio per il layout ${layout}`);
    const current = fields[card.id];
    const nextFields = {};
    for (const [fieldId, fallback] of Object.entries(template)) {
      const keepGeometry = sameLayout || !fieldId.startsWith('rendita-');
      const existing = keepGeometry ? current?.[fieldId] : undefined;
      nextFields[fieldId] = { ...(existing ?? fallback) };
    }
    // Si sostituisce anche il ritaglio calcolato per la nuova immagine.
    for (const [fieldId, name] of Object.entries({
      illustrazione: card.portrait, fascia: card.band, nazionalita: card.badge, reparto: card.sector,
      'rendita-moneta': 'marchi_fondo.png', ...(card.unit ? { 'rendita-unita': card.unit } : {}),
    })) {
      const field = nextFields[fieldId];
      assert(field?.type === 'image', `Manca il campo immagine ${fieldId}`);
      if (field.name === name) continue;
      const image = images.get(`${fieldId}:${name}`);
      assert(image, `Manca l'immagine ${name} per ${fieldId}`);
      for (const key of ['name', 'imageWidth', 'imageHeight', 'zoom', 'cx', 'cy']) field[key] = image[key];
    }
    nextFields.valore.value = String(card.value);
    nextFields['rendita-valore'].value = String(card.quantity);
    if (card.unit) nextFields['rendita-per'].value = '×';

    const entry = { ...previous, id: card.id, count: 1 };
    if (layout === 'default') delete entry.layoutId;
    else entry.layoutId = layout;
    next.cardsById[card.id] = entry;
    next.fields[card.id] = nextFields;
  }
  return next;
}

const [input, ...extra] = process.argv.slice(2);
assert.equal(extra.length, 0, 'Uso: node scripts/cardamon-deck.js [documento.json|-]');
const cards = activeCards();
assert.equal(new Set(cards.map(card => card.id)).size, cards.length, 'ID delle carte duplicati');
const rules = rulesText(cards);
const fingerprint = createHash('sha256').update(JSON.stringify({ cards, rules })).digest('hex');
const result = { count: cards.length, fingerprint, cards, rules };
if (input) {
  const source = JSON.parse(readFileSync(input === '-' ? 0 : input, 'utf8'));
  const current = source.document ?? source.cardSet ?? source;
  const document = planUpdate(current, cards, rules);
  Object.assign(result, {
    revision: source.revision ?? null,
    changed: !isDeepStrictEqual(current, document),
    added: document.cardsAllIds.filter(id => !Object.hasOwn(current.cardsById, id)),
    removed: current.cardsAllIds.filter(id => !Object.hasOwn(document.cardsById, id)),
    document,
  });
}
process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
