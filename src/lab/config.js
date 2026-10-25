import reference from './reference.json' with { type: 'json' };
import { TRACK_MODELS, SECTORS, NATIONS_NUOVO } from '../game/data.js';
import { STAR_NODE_BANKS } from './markets.js';
import { tensionMachineCard } from '../game/row-economy.js';
export const ROLES = ['terziario', 'secondario', 'primario'];
export const SIZES = ['small', 'medium', 'large'];
export const SIZE_NAMES = { small: 'Piccole', medium: 'Medie', large: 'Grandi' };
export const MODELS = ['righe4corte', 'righe4', 'righe3'];
export const AI_NAMES = { forecast2: 'Nuova IA · valuta gli utilizzi futuri', beam2: 'IA precedente · confronto', greedy: 'Rapida · controllo tecnico' };
export const STORAGE_KEY = 'officina1907-laboratorio-v1';
export const RULES_REVISION = 4;
const PRESET_REVISION = 1;
export function withoutTrackPoints(track) {
  return track.map(cell => {
    if (!cell || !Object.hasOwn(cell, 'pv')) return cell;
    const { pv, ...bonus } = cell;
    return Object.keys(bonus).length ? bonus : null;
  });
}
export function defaults() {
  return structuredClone({ schema: 'officina-lab-1', rulesRevision: RULES_REVISION, presetRevision: PRESET_REVISION, contractsOnly: true, name: 'Prova di riferimento',
    players: 2, turns: 28, startingCoins: [15, 15, 15, 15],
    trackModel: 'righe4corte', track: withoutTrackPoints(reference.tracks.terziario),
    welfareCost: 4, repressionBase: 2, repressionStep: 0,
    contractCoins: reference.rowEconomy.contractCoins,
    machineSlots: [2, 2, 2], productionThresholds: [1, 5, 9, 13], milestoneResource: false, machineImmediate: false,
    workers: reference.workers.filter(w => !w.power && w.deck !== 'Impiegati').map(tensionMachineCard), contracts: reference.contracts,
    contractCount: reference.contractCount, contractMarket: 2,
    cityIncome: reference.borsaExit.coins, cityRefresh: true,
    simulation: { games: 3, seed: 1907, ai: 'forecast2', depth: 6, rollouts: 1 },
  });
}
const check = (ok, message) => { if (!ok) throw new Error(message); };
const integer = (v, lo, hi, name) => check(Number.isInteger(v) && v >= lo && v <= hi, `${name}: serve un intero fra ${lo} e ${hi}.`);
export function validate(c) {
  check(c && c.schema === 'officina-lab-1', 'Importa una configurazione del nuovo Laboratorio, non un report o una configurazione del vecchio simulatore.');
  check(c.rulesRevision === RULES_REVISION, 'Versione delle regole non supportata: riapri la configurazione dal Laboratorio aggiornato.');
  check(c.presetRevision === PRESET_REVISION, 'Versione delle impostazioni non supportata: riapri la configurazione dal Laboratorio aggiornato.');
  check(c.contractsOnly === true, 'Nel Laboratorio si contano solo i PV delle commesse.');
  check(typeof c.name === 'string' && c.name.length <= 100, 'Nome della prova non valido.');
  integer(c.players, 2, 4, 'Giocatori'); integer(c.turns, 1, 60, 'Turni');
  check(Array.isArray(c.startingCoins) && c.startingCoins.length === 4, 'Servono i marchi iniziali dei quattro posti.');
  c.startingCoins.forEach(v => integer(v, 0, 100, 'Marchi iniziali'));
  check(MODELS.includes(c.trackModel), 'Modello del tracciato non supportato.');
  check(Array.isArray(c.track) && c.track.length === TRACK_MODELS[c.trackModel].max + 1 && c.track[0] === null, 'Lunghezza del tracciato non valida.');
  for (const cell of c.track) if (cell !== null) {
    check(typeof cell === 'object' && !Array.isArray(cell) && Object.keys(cell).length > 0 && Object.keys(cell).every(k => ['res', 'coins'].includes(k)), 'Nel tracciato sono ammessi solo risorse e marchi.');
    Object.values(cell).forEach(v => integer(v, 0, 20, 'Bonus casella'));
  }
  const layout = TRACK_MODELS[c.trackModel];
  check(Array.isArray(c.productionThresholds) && c.productionThresholds.length === layout.rows, 'Serve una soglia per ogni riga.');
  c.productionThresholds.forEach((n, i) => integer(n, i * layout.columns + 1, (i + 1) * layout.columns, `Soglia riga ${i + 1}`));
  check(typeof c.milestoneResource === 'boolean' && typeof c.machineImmediate === 'boolean', 'Opzioni ricompense immediate non valide.');
  for (const key of ['welfareCost', 'repressionBase', 'repressionStep']) integer(c[key], 0, 30, key);
  check(c.repressionStep === 0, 'La repressione ha un costo fisso, senza rincari.');
  check(Array.isArray(c.machineSlots) && c.machineSlots.length === 3, 'Spazi macchinari non validi.');
  c.machineSlots.forEach(v => integer(v, 0, 10, 'Spazi macchinari'));
  integer(c.cityIncome, 0, 20, 'Marchi all’uscita dalla città'); check(typeof c.cityRefresh === 'boolean', 'Ricambio commesse non valido.');
  integer(c.contractMarket, 1, 3, 'Commesse visibili');
  const ids = new Set();
  check(Array.isArray(c.workers) && c.workers.length > 0 && c.workers.length <= 200, 'Mazzo lavoratori non valido.');
  for (const w of c.workers) {
    check(typeof w.id === 'string' && !ids.has(w.id), 'ID delle carte mancanti o duplicati.'); ids.add(w.id);
    check(NATIONS_NUOVO.includes(w.nation), 'Nazionalità non valida.'); integer(w.v, 1, 10, 'Valore carta');
    check(!w.power, 'Gli impiegati non fanno più parte del mazzo.');
    check(SECTORS.includes(w.sector) && ['A','B','C','D','E'].includes(w.deck), 'Reparto o mazzetto non valido.');
    check(['prendi', 'scambia', 'perOgni'].includes(w.effect?.verbo), 'Effetto macchinario non valido.');
    const factors = w.effect.verbo === 'scambia' ? [w.effect.f1, w.effect.f2] : [w.effect.f1];
    for (const f of factors) {
      check(f && ['risorsa', 'moneta'].includes(f.tipo), 'Risorsa dello scambio non valida.');
      integer(f.q, 0, 20, 'Quantità effetto');
      if (f.tipo === 'risorsa') check([...SECTORS, 'scelta'].includes(f.settore), 'Settore della risorsa non valido.');
    }
  }
  const contractIds = new Set();
  for (const size of SIZES) {
    integer(c.contractCoins?.[size], 0, 30, 'Premio commessa');
    check(Array.isArray(c.contracts?.[size]) && c.contracts[size].length > 0 && c.contracts[size].length <= 100, 'Mazzo commesse non valido.');
    for (const card of c.contracts[size]) {
      check(typeof card.id === 'string' && !contractIds.has(card.id), 'ID commessa duplicato.'); contractIds.add(card.id);
      check(card.size === size && Array.isArray(card.pv) && card.pv.length === 2, 'Formato commessa non valido.');
      card.pv.forEach(v => integer(v, 0, 100, 'PV commessa'));
      check(Array.isArray(card.reqs) && card.reqs.length > 0 && card.reqs.length <= 10 && card.reqs.every(r => Array.isArray(r) && r.length > 0 && r.length <= 50 && r.every(s => SECTORS.includes(s))), 'Requisiti commessa non validi.');
    }
    for (const n of [2, 3, 4]) integer(c.contractCount?.[n]?.[size], c.contractMarket, c.contracts[size].length, 'Commesse in partita');
  }
  check(c.simulation && Object.hasOwn(AI_NAMES, c.simulation.ai), 'Seleziona una IA supportata.');
  integer(c.simulation.games, 1, 100, 'Partite'); integer(c.simulation.seed, 0, 2147483547, 'Seme');
  integer(c.simulation.depth, 1, 12, 'Profondità IA'); integer(c.simulation.rollouts, 1, 5, 'Continuazioni casuali');
  return c;
}
export function gameConfig(c, { seed = c.simulation.seed, humans = 0 } = {}) {
  validate(c);
  return { ...structuredClone(reference),
    seed, headless: humans === 0, endMode: 'rounds', roundLimit: c.turns, singleContractVisit: true,
    startingCoins: [...c.startingCoins], trackModel: c.trackModel,
    tracks: Object.fromEntries(ROLES.map(r => [r, structuredClone(c.track)])),
    nodeBanks: structuredClone(STAR_NODE_BANKS),
    workers: structuredClone(c.workers), contracts: structuredClone(c.contracts), contractPV: undefined,
    contractCount: structuredClone(c.contractCount), contractMarket: c.contractMarket,
    rowEconomy: { ...reference.rowEconomy, welfareMode: 'tokens', welfareScope: 'factory', welfareHireDiscount: false, sameNationHireDiscount: true, tensionMachineCash: true, productionThresholds: [...c.productionThresholds], milestoneResource: c.milestoneResource, machineImmediate: c.machineImmediate,
      welfareCost: c.welfareCost, repressionBase: c.repressionBase, repressionStep: 0, contractCoins: { ...c.contractCoins } },
    slots: { ...Object.fromEntries(ROLES.map((r,i) => [r, { sopra: 3, sotto: c.machineSlots[i] }])), direzione: { sopra: 0, sotto: 0 } },
    borsaExit: { enabled: true, coins: c.cityIncome }, borsaRefresh: { enabled: c.cityRefresh },
    contractsOnly: true, pianoEnabled: false, raceObjectives: { enabled: false, list: [] }, raceIncentive: 0,
    aiRollout: c.simulation.ai === 'greedy' ? null : { depth: c.simulation.depth, rollouts: c.simulation.rollouts },
    aiContinuation: c.simulation.ai,
    players: Array.from({ length: c.players }, (_,i) => ({ name: i < humans ? `Giocatore ${i+1}` : `IA ${i+1}`, isAI: i >= humans, personality: 'neutro', aiRecovery: 'free', aiEvaluation: 'baseline', aiContinuation: c.simulation.ai })),
  };
}
export function parseConfig(raw) {
  const c = JSON.parse(raw);
  // Editor migrations preserve custom prices; current rules apply to all lab configurations.
  if (c?.schema === 'officina-lab-1') {
    const migrateMachines = c.rulesRevision == null || [1, 2, 3].includes(c.rulesRevision);
    c.productionThresholds ??= Array.from({length: TRACK_MODELS[c.trackModel]?.rows || 4}, (_, i) => i * (TRACK_MODELS[c.trackModel]?.columns || 4) + 1);
    c.milestoneResource ??= false; c.machineImmediate ??= false;
    c.contractsOnly = true;
    if (c.rulesRevision == null || c.rulesRevision === 1) {
      if (c.welfareCost === 3) c.welfareCost = 4;
      c.repressionStep = 0;
      c.rulesRevision = RULES_REVISION;
      c.presetRevision = PRESET_REVISION;
    }
    if (c.rulesRevision === 2 || c.rulesRevision === 3) c.rulesRevision = RULES_REVISION;
    // Update the former default once; later custom prices (including 9) survive reload.
    if (c.presetRevision == null) {
      if (c.welfareCost === 9) c.welfareCost = 4;
      c.presetRevision = PRESET_REVISION;
    }
    if (Array.isArray(c.workers)) c.workers = c.workers.filter(w => !w?.power && w?.deck !== 'Impiegati');
    if (migrateMachines && Array.isArray(c.workers)) c.workers = c.workers.map(tensionMachineCard);
    if (Array.isArray(c.track)) c.track = withoutTrackPoints(c.track);
  }
  validate(c);
  // Only the current schema is persisted; imported legacy knobs cannot alter rules.
  return Object.fromEntries(Object.keys(defaults()).map(k => [k, structuredClone(c[k])]));
}
export function playableConfig(c, humans = 1, pace = 'rapid') {
  integer(humans, 1, c.players, 'Giocatori umani');
  check(['rapid', 'study'].includes(pace), 'Modalità IA non valida.');
  return gameConfig({ ...c, simulation: { ...c.simulation, ai: 'forecast2', depth: pace === 'study' ? 6 : 2, rollouts: 1 } }, { humans });
}
export function newMatchConfig(config) {
  return { ...config, seed: Math.floor(Math.random() * 2 ** 31) };
}
export function download(name, text, type = 'application/json') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a'); a.href = url; a.download = name; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
