import {validFundThresholds} from '../game/welfare-funds.js';
import {validRoundSchedule} from '../game/round-rondel.js';
import reference from './reference.json' with { type: 'json' };
import latestPlaytest from './latest-playtest.json' with { type: 'json' };
import { TRACK_MODELS, SECTORS, NATIONS_NUOVO } from '../game/data.js';
import { WELFARE_POLICIES, validPolicyOrder } from '../game/welfare-rondel.js';
import { STAR_NODE_BANKS } from './markets.js';
import { tensionMachineCard } from '../game/row-economy.js';
export const ROLES = ['terziario', 'secondario', 'primario'];
export const SIZES = ['small', 'medium', 'large'];
export const SIZE_NAMES = { small: 'Piccole', medium: 'Medie', large: 'Grandi' };
export const MODELS = ['righe4corte', 'righe4', 'righe3', 'righe5x4'];
export const AI_NAMES = { forecast2: 'Nuova IA · valuta gli utilizzi futuri', beam2: 'IA precedente · confronto', greedy: 'Rapida · controllo tecnico' };
export const PREVIOUS_STORAGE_KEY = 'officina1907-laboratorio-v1';
export const STORAGE_KEY = 'officina1907-laboratorio-principale-v1';
export const RULES_REVISION = 4;
const PRESET_REVISION = 2;
export const mainDefaults=()=>structuredClone(latestPlaytest);
export function validateMainConfig(c){
  validate(c);
  check(c.roundRondel?.enabled&&c.roundRondel.startingPolicy==='affinity'&&c.roundRondel.fundThresholds,'Questa configurazione usa una versione precedente. Riparti dalla configurazione principale.');
  return c;
}
export function loadMainConfig(storage){
  const raw=storage.getItem(STORAGE_KEY);
  if(raw)return validateMainConfig(parseConfig(raw));
  const previous=storage.getItem(PREVIOUS_STORAGE_KEY);
  if(previous){const c=parseConfig(previous);if(c.roundRondel?.enabled&&c.roundRondel.startingPolicy==='affinity'&&c.roundRondel.fundThresholds)return validateMainConfig(c);}
  return mainDefaults();
}
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
    welfareCost: 4, welfareBank: false, welfareRondel: false, welfareFreeEntry: false, welfareMaxSteps: 3, welfarePoliciesEnabled: Object.fromEntries(WELFARE_POLICIES.map(p=>[p.id,true])), repressionBase: 2, repressionStep: 0,
    contractCoins: reference.rowEconomy.contractCoins,
    machineSlots: [2, 2, 2], productionThresholds: [1, 5, 9, 13], productionUnlock: 'rows', tensionDirection: 'opposed', milestoneResource: false, machineImmediate: false,
    workers: reference.workers.filter(w => !w.power && w.deck !== 'Impiegati').map(tensionMachineCard), contracts: { ...reference.contracts, large: reference.contracts.large.map(card => ({ ...card, pv: [13, card.pv[1]] })) },
    contractCount: Object.fromEntries([2,3,4].map(n=>[n,Object.fromEntries(SIZES.map(size=>[size,reference.contracts[size].length]))])), contractMarket: 2,
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
  if (c.machinesRequireOpenRow !== undefined) check(typeof c.machinesRequireOpenRow === 'boolean', 'Blocco macchinari non valido.');
  if (c.finalCoinsPerPV !== undefined) integer(c.finalCoinsPerPV, 1, 100, 'Marchi per PV finale');
  if(c.finalResourcePV!==undefined)check(typeof c.finalResourcePV==='boolean','PV finali delle risorse non validi.');
  if (c.finalCoinPV !== undefined) check(typeof c.finalCoinPV === 'boolean', 'Conversione finale marchi non valida.');
  check(c.contractsOnly === true, 'Nel Laboratorio si contano i PV delle commesse e gli eventuali PV dei marchi e delle risorse finali.');
  check(!c.roundAwards?.enabled, 'Le carte premio non fanno parte di questa versione.');
  if (c.conversionMachines !== undefined) check(typeof c.conversionMachines === 'boolean', 'Opzione conversioni non valida.');
  if (c.roundRondel?.enabled) {
    const r=c.roundRondel;
    if(r.policyOrder!==undefined)check(r.startingPolicy==='affinity'&&validPolicyOrder(r.policyOrder),'L’ordine della rondella deve contenere tutte le sette abilità una sola volta.');
    if(r.fundThresholds)check(c.welfareBank&&r.startingPolicy==='affinity'&&validFundThresholds(r.fundThresholds),'I fondi Welfare richiedono soglie Economia 3, Personale 4, Produzione 3.');
    if(r.startingPolicy!==undefined)check(r.startingPolicy==='affinity'&&r.extraStepCost===1&&r.mandatoryMove===true&&r.freeEntry===false,'Casella iniziale o movimento obbligatorio non validi.');
    check(c.players===3, 'La rondella di fine round richiede 3 giocatori.');
    check(validRoundSchedule(r,c.turns,c.players), 'Le scadenze dei round devono essere ordinate, diverse e precedenti alla fine della partita.');
    check(c.welfareRondel===true && r.maxSteps===3 && [0,1].includes(r.stepCost) && r.tokenCost===1 && r.tokenMax===3 && (r.freeEntry===undefined || typeof r.freeEntry==='boolean'), 'Impostazioni della rondella di fine round non valide.');
  }
  check(typeof c.name === 'string' && c.name.length <= 100, 'Nome della prova non valido.');
  integer(c.players, 2, 4, 'Giocatori'); integer(c.turns, 1, 60, 'Turni');
  check(Array.isArray(c.startingCoins) && c.startingCoins.length === 4, 'Servono i marchi iniziali dei quattro posti.');
  c.startingCoins.forEach(v => integer(v, 0, 100, 'Marchi iniziali'));
  check(MODELS.includes(c.trackModel), 'Modello del tracciato non supportato.');
  check(Array.isArray(c.track) && c.track.length === TRACK_MODELS[c.trackModel].max + 1 && c.track[0] === null, 'Lunghezza del tracciato non valida.');
  for (const cell of c.track) if (cell !== null) {
    check(typeof cell === 'object' && !Array.isArray(cell) && Object.keys(cell).length > 0 && Object.keys(cell).every(k => ['res', 'coins', 'milestoneReward'].includes(k)), 'Nel tracciato sono ammessi risorse, marchi e premi milestone.');
    for (const key of ['res','coins']) if (cell[key] !== undefined) integer(cell[key], 0, 20, 'Rendimento casella');
    if (cell.milestoneReward !== undefined) {
      const reward=cell.milestoneReward;
      check(reward && typeof reward==='object' && !Array.isArray(reward) && Object.keys(reward).length>0 && Object.keys(reward).every(k=>['res','coins'].includes(k)), 'Premio milestone non valido.');
      Object.values(reward).forEach(v=>integer(v,0,20,'Premio milestone'));
    }
  }
  check(c.tensionDirection === undefined || ['opposed','same'].includes(c.tensionDirection), 'Direzione tensione non valida.');
  check(c.productionUnlock === undefined || ['rows','cells'].includes(c.productionUnlock), 'Modalità di sblocco non valida.');
  const layout = TRACK_MODELS[c.trackModel];
  check(Array.isArray(c.productionThresholds) && c.productionThresholds.length === layout.rows, 'Serve una soglia per ogni riga.');
  c.productionThresholds.forEach((n, i) => integer(n, i * layout.columns + 1, (i + 1) * layout.columns, `Soglia riga ${i + 1}`));
  check(c.welfareFreeEntry === undefined || typeof c.welfareFreeEntry === 'boolean', 'Ingresso Welfare non valido.');
  check(c.welfareMaxSteps === undefined || c.welfareMaxSteps === 3, 'La rondella consente al massimo 3 passi.');
  if(c.welfarePoliciesEnabled!==undefined)check(c.welfarePoliciesEnabled&&typeof c.welfarePoliciesEnabled==='object'&&!Array.isArray(c.welfarePoliciesEnabled)&&Object.keys(c.welfarePoliciesEnabled).length===WELFARE_POLICIES.length&&WELFARE_POLICIES.every(p=>typeof c.welfarePoliciesEnabled[p.id]==='boolean'),'Caselle ON/OFF della rondella non valide.');
  check(c.welfareBank===undefined||typeof c.welfareBank==='boolean','Opzione banca Welfare non valida.');
  check(typeof c.welfareRondel === 'boolean', 'Opzione rondella Welfare non valida.');
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
    if(w.effect.tensionRewards !== undefined) {
      check(w.effect.verbo === 'perOgni' && w.effect.f2?.conta === 'tensione' && w.effect.f1?.tipo === 'moneta' && Array.isArray(w.effect.tensionRewards) && w.effect.tensionRewards.length === 5, 'Curva tensione: servono cinque premi, da tensione 0 a 4.');
      w.effect.tensionRewards.forEach(v=>integer(v,0,100,'Premio curva tensione'));
    }
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
    ...((c.finalCoinsPerPV||c.finalResourcePV)?{conversions:{...reference.conversions,...(c.finalCoinsPerPV?{coinsPerPV:c.finalCoinsPerPV}:{}),...(c.finalResourcePV?{resPerPV:3}:{})}}:{}),
    borsaFabbriche: {...structuredClone(reference.borsaFabbriche), resourceCap: {...reference.borsaFabbriche.resourceCap, enabled:false}},
    ...(c.roundAwards?.enabled ? {roundAwards:structuredClone(c.roundAwards)} : {}),
    ...(c.roundRondel?.enabled ? {roundRondel:structuredClone(c.roundRondel)} : {}),
    seed, headless: humans === 0, endMode: 'rounds', roundLimit: c.turns, singleContractVisit: true,
    startingCoins: [...c.startingCoins], trackModel: c.trackModel,
    tracks: Object.fromEntries(ROLES.map(r => [r, structuredClone(c.track)])),
    nodeBanks: structuredClone(STAR_NODE_BANKS),
    workers: structuredClone(c.workers), contracts: structuredClone(c.contracts), contractPV: undefined,
    contractCount: structuredClone(c.contractCount), contractMarket: c.contractMarket,
    rowEconomy: { ...reference.rowEconomy, ...(c.machinesRequireOpenRow ? { machinesRequireOpenRow: true } : {}), ...(c.conversionMachines === false ? { conversionMachines: false } : {}), welfareMode: 'tokens', welfareScope: 'factory', welfareHireDiscount: false, sameNationHireDiscount: c.roundRondel?.startingPolicy!=='affinity', tensionMachineCash: true, productionThresholds: [...c.productionThresholds], productionUnlock: c.productionUnlock || 'rows', tensionDirection: c.tensionDirection || 'opposed', milestoneResource: c.productionUnlock === 'cells' ? false : c.milestoneResource, machineImmediate: c.machineImmediate,
      welfareCost: c.welfareCost, welfareBank: c.welfareBank===true, welfareRondel: c.welfareRondel, welfareFreeEntry: c.welfareFreeEntry === true, welfareMaxSteps: c.welfareMaxSteps ?? 3, welfarePoliciesEnabled: {...(c.welfarePoliciesEnabled||defaults().welfarePoliciesEnabled)}, repressionBase: c.repressionBase, repressionStep: 0, contractCoins: { ...c.contractCoins } },
    slots: { ...Object.fromEntries(ROLES.map((r,i) => [r, { sopra: 3, sotto: c.machineSlots[i] }])), direzione: { sopra: 0, sotto: 0 } },
    borsaExit: { enabled: true, coins: c.cityIncome }, borsaRefresh: { enabled: c.cityRefresh },
    ...(c.finalCoinPV ? { finalCoinPV: true } : {}),
    ...(c.finalResourcePV ? { finalResourcePV: true } : {}),
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
    const migrateLargePV = c.presetRevision == null || c.presetRevision === 1;
    const migrateMachines = c.rulesRevision == null || [1, 2, 3].includes(c.rulesRevision);
    c.productionThresholds ??= Array.from({length: TRACK_MODELS[c.trackModel]?.rows || 4}, (_, i) => i * (TRACK_MODELS[c.trackModel]?.columns || 4) + 1);
    c.welfareRondel ??= false; c.welfareBank ??= false;
    c.welfareFreeEntry ??= false;
    c.welfareMaxSteps ??= 3;
    c.welfarePoliciesEnabled ??= Object.fromEntries(WELFARE_POLICIES.map(p=>[p.id,true]));
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
    if (migrateLargePV) {
      if (Array.isArray(c.contracts?.large)) c.contracts.large = c.contracts.large.map(card => card.pv?.[0] === 15 ? { ...card, pv: [13, card.pv[1]] } : card);
      c.presetRevision = PRESET_REVISION;
    }
  }
  validate(c);
  // Only the current schema is persisted; imported legacy knobs cannot alter rules.
  const optional=['roundRondel','conversionMachines','machinesRequireOpenRow','finalCoinPV','finalCoinsPerPV','finalResourcePV'];
  return Object.fromEntries([...Object.keys(defaults()),...optional.filter(k=>Object.hasOwn(c,k))].map(k => [k, structuredClone(c[k])]));
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
