// AI euristica per Officina 1907.
// chooseCommand(state) → il prossimo comando per il giocatore/decisore corrente.
import {
  SECTORS, RESOURCE_OF, NODES, NODE_BANKS, ROLE_SLOTS_SOPRA,
  TENSION_LIMIT, UNBLOCK_COST, DIREZIONE_MAX, activeTrackEnd,
} from './data.js';
import {
  legalCommands, applyCommand, currentPlayer, deptOfSector, bankMarket, tileForecast,
  WORKER_BY_ID, WELFARE_BY_ID, iconCount, welfareCount, totalResources, trackPV, milestoneCount, formulaOf,
  expectedDividend, workerCapacity, tensionLimit, scorePlayer, welfarePoints,
} from './engine.js';

import { activeWorkers, policiesOf, welfareEfficiency, wellbeing } from './industrial.js';
import { tokenWelfare } from './row-economy.js';

// profiler artigianale per il rollout: contatori + tempo per bucket, azzerati a mano con resetRolloutStats().
// Copre le chiamate applyCommand fatte da ai.js (playForward, bestActionAt, bestActionAtRollout) — non quelle
// altrove nel motore (UI, altri path) — sufficiente a capire dove va il tempo dentro un rollout.
export const rolloutStats = {
  decisionsGreedy: 0, decisionsRollout: 0,
  playForwardCalls: 0, stepsSimulated: 0,
  evaluateCalls: 0, msEvaluate: 0,
  msApplyCommand: 0,
  perDecisionLog: [], // {turn, node, nCandidates, ms} — una riga per ogni decisione rollout (bestActionAtRollout)
  beamCalls: 0, beamExpanded: 0, beamLayers: 0, beamForecasts: 0,
  tokenDeferredForecasts: 0, tokenRecoveryBranches: 0,
};
export function resetRolloutStats() {
  for (const k in rolloutStats) rolloutStats[k] = Array.isArray(rolloutStats[k]) ? [] : 0;
}
function timedApply(state, cmd) {
  const t0 = performance.now();
  const s = applyCommand(state, cmd);
  rolloutStats.msApplyCommand += performance.now() - t0;
  return s;
}

// commesse di questa taglia sbloccate per il giocatore? (gate milestone per taglia)
function sizeUnlocked(state, p, size) {
  return milestoneCount(state, p) >= (state.contractMilestoneReq?.[size] || 0);
}

const DEPT_ROLES = ['terziario', 'secondario', 'primario'];

// Rumore deterministico al posto di Math.random: stesso seed → stessa partita.
// Necessario per batch riproducibili e per i "seed appaiati" dell'A/B diff harness.
function noise(state, ...keys) {
  let h = (state.seed | 0) ^ Math.imul(state.turn | 0, 2654435761) ^ Math.imul(state.clock | 0, 1597334677);
  for (const k of keys) {
    const s = String(k);
    for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x5bd1e995);
  }
  h ^= h >>> 15; h = Math.imul(h, 0x2c1b3c6d); h ^= h >>> 12; h = Math.imul(h, 0x297a2d39); h ^= h >>> 15;
  return (h >>> 0) / 4294967296;
}

// Personalità AI: moltiplicatori sui 3 assi (via ai PV / aggressività sindacale / rischio-tempo).
// neutro = baseline invariata (tutti 1). Knob: wContract/wObjective/wTrack/wCoins/wRes pesano evaluate;
// aggro>0 => attacca la Tensione avversaria in Trattativa; moveCost = avversione al costo movimento;
// reserve = risorse tenute prima di vendere in Borsa; tensionAv = quanto teme la Tensione al limite.
export const PROFILES = {
  neutro:      { wContract: 1,   wObjective: 1,   wTrack: 1,   wCoins: 1,   wRes: 1,   aggro: 1, moveCost: 1,   reserve: 4, tensionAv: 1 },
  // Il Padrone: rush commesse, corre il Clock, attacca duro, spende senza paura.
  padrone:     { wContract: 1.5, wObjective: 0.85, wTrack: 0.85, wCoins: 0.9, wRes: 1,   aggro: 2, moveCost: 0.7, reserve: 3, tensionAv: 0.5 },
  // L'Ingegnere: motore tableau (tracciati/carte/obiettivi), pacifico, prudente.
  ingegnere:   { wContract: 0.95, wObjective: 1.4, wTrack: 1.5, wCoins: 0.9, wRes: 1.1, aggro: 0, moveCost: 1.05, reserve: 4, tensionAv: 1.2 },
  // Lo Speculatore: accumula marchi/risorse (firma economica marcata), tempo veloce.
  speculatore: { wContract: 0.9, wObjective: 0.9, wTrack: 0.85, wCoins: 1.3, wRes: 1.3, aggro: 1, moveCost: 0.8, reserve: 5, tensionAv: 1 },
};
function profileOf(p) { return PROFILES[p.personality] || PROFILES.neutro; }

// Chi deve decidere il pending corrente (può essere un avversario, es. sciopero da Trattativa)
export function deciderId(state) {
  if (state.pending) return state.pending.playerId;
  return state.current;
}

// ---------- Valutazione di stato ----------
export function evaluate(state, playerId, rolloutLeaf = false) {
  const __t0 = performance.now();
  rolloutStats.evaluateCalls++;
  const v = evaluateInner(state, playerId, rolloutLeaf);
  rolloutStats.msEvaluate += performance.now() - __t0;
  return v;
}
function evaluateInner(state, playerId, rolloutLeaf) {
  const p = state.players[playerId];
  const w = profileOf(p);
  const finiteFactory = state.contractsOnly && state.rowEconomy?.enabled && state.endMode === 'rounds';
  const order = state.snakeOrder
    ? (state.dir === -1 ? state.nPlayers - 1 - playerId : playerId)
    : (playerId - state.roundStart + state.nPlayers) % state.nPlayers;
  const turnsLeft = Math.max(0, state.roundLimit - state.turn + Number(order >= state.roundTurns));
  // Capacità e tensione valgono solo per gli utilizzi rimasti; chi ha finito usa già il punteggio finale.
  const futureEngine = finiteFactory ? Math.min(1, turnsLeft / 6) : 1;
  if ((state.contractsOnly || state.industrial?.enabled) && (state.gameOver || (finiteFactory && turnsLeft === 0))) {
    const score = scorePlayer(state, p);
    // Spareggi reali: marchi, poi commesse. Il bonus resta < 1, senza scavalcare un PV.
    const tie = score.coins + score.nContracts / (score.nContracts + 1);
    return score.total * 10 + (state.contractsOnly ? tie / (tie + 1) : 0);
  }
  let v = 0;
  v += p.contractsWon.reduce((a, c) => a + c.pv, 0) * 10 * w.wContract;
  if (!state.contractsOnly) v += p.tile.objectives.reduce((a, o, i) => a + (p.achieved[i] ? o.pv : 0), 0) * 9 * w.wObjective;
  // Obiettivi di gara già rivendicati: PV del posto sul podio. Greedy: dopo un 'completeRace' v sale → l'IA
  // rivendica quando è qualificata. Scala ×10 come le commesse (podio PV direttamente confrontabile).
  if (!state.contractsOnly && state.raceObjectives?.enabled) {
    v += state.raceObjectives.list.reduce((a, it) => { const pl = it.claims.indexOf(playerId); return a + (pl >= 0 ? (state.raceObjectives.podium[pl] ?? 0) : 0); }, 0) * 10 * w.wObjective;
    // Progresso VERSO una race (knob di sistema raceIncentive, default 0 = non insegue). Distinto dal PV del
    // claim sopra: questo lure l'IA ad avvicinarsi (costruire i Sopra giusti), il claim blocca i PV.
    if (state.raceIncentive) v += raceProgress(state, p) * state.raceIncentive * w.wObjective;
  }
  // Borsa a indici: un'azione in mano vale il dividendo che incasserebbe se il quadrimestre chiudesse ORA
  // (casella al rango attuale ÷ investitori attuali). Stessa scala PV delle commesse (×10).
  // Deliberatamente NON è una costante euristica: è la formula del gioco letta dallo stato — così qui non si
  // ripete il buco di `perUse`/`tileScore`, dove l'IA decideva su un numero che il regolamento non conosce.
  if (!state.contractsOnly && state.borsaIndici?.enabled) {
    for (const name of Object.keys(p.shares || {})) v += expectedDividend(state, name, true) * 10;
  }
  // peso di marchi/risorse scala con le conversioni finali configurate.
  // Base alzata (0.45→0.7, 1.1→1.5): marchi/risorse sono carburante (commesse/assunzioni/movimento),
  // il baseline li sottovalutava e sprecava valore economico → giocava sotto tono.
  v += p.coins * 0.7 * (3 / state.rules.coinsPerPV) * w.wCoins;
  // Risorse: valore PIENO fino al fabbisogno delle commesse raggiungibili, FRAZIONE oltre.
  // Un agente greedy 1-ply altrimenti produce +1.5/risorsa all'infinito (accumula 50 Tessile mentre la
  // commessa vuole Chimica) → il "giocatore morto". La saturazione non impone una strategia: recepisce che
  // la ricchezza non convertibile in punti vale meno (= criterio di vittoria del gioco). Gate: state.aiSaturate.
  if (state.aiSaturate) {
    const need = reachableNeedBySector(state, p);
    let resVal = 0;
    for (const s of SECTORS) {
      const have = p.resources[RESOURCE_OF[s]];
      const useful = Math.min(have, need[s]);
      resVal += useful * 1.5 + Math.max(0, have - useful) * 0.3; // surplus = solo valore terminale/vendita
    }
    v += resVal * (2 / state.rules.resPerPV) * w.wRes;
  } else {
    v += totalResources(p) * 1.5 * (2 / state.rules.resPerPV) * w.wRes;
  }
  // Tetto risorse (borsaFabbriche.resourceCap): penalizza ogni risorsa scartata perché sopra il tetto.
  // Inerte se il tetto è OFF (resCapLost resta 0). Nel greedy (evaluate(s2)-base) colpisce solo lo spreco
  // causato dalla mossa → l'IA non sovra-produce a vuoto, scarica prima; nel rollout l'intera linea, così
  // valuta anche le fabbriche per il tetto che alzano (meno spreco futuro). Scala come una risorsa persa.
  if (p.resCap?.aiValueWaste !== false) v -= (p.resCapLost || 0) * 1.5 * (2 / state.rules.resPerPV) * w.wRes;
  // Borsa a fabbriche: valore-proxy del flusso passivo futuro. Il greedy 1-ply vede solo la risorsa immediata
  // (già contata sopra), non lo stream — come per `perUse`/tile. Proxy: ogni fabbrica ≈ risorse residue attese,
  // stimate dai turni che restano (clock che sale = fine vicina), scontate. ponytail: è un proxy per far
  // costruire il greedy nelle regressioni; il valore vero emerge dal rollout (turni simulati), non da questa
  // formula — non tararla con uno sweep, misurerebbe la formula, non il gioco.
  if (state.borsaFabbriche?.enabled && state.borsaFabbriche.passiveIncome !== false && p.factories.length) {
    const remain = Math.max(1, state.clockThreshold - state.clock); // proxy turni residui
    v += p.factories.length * remain * 0.4 * (2 / state.rules.resPerPV) * w.wRes;
  }
  if (!state.contractsOnly) v += trackPV(state, p) * 9 * w.wTrack; // soglie PV del tracciato = PV di fine partita
  for (const role of DEPT_ROLES) {
    const d = p.depts[role];
    // prod/sopra/sotto = motore industriale del tableau → pesati come i tracciati
    v += (d.prod * 0.6 + (d.prod >= state.milestonePos[role] ? 2 : 0)) * w.wTrack * futureEngine;
    if (state.rowTrack) {
      const developed = activeTrackEnd(d.prod, 0, state.trackModel, state.rowEconomy?.enabled, state.rowEconomy?.productionThresholds);
      v -= (developed - activeTrackEnd(d.prod, d.tension, state.trackModel, state.rowEconomy?.enabled, state.rowEconomy?.productionThresholds)) * 0.6 * w.wTrack * futureEngine;
    }
    if (!state.rowEconomy?.enabled) v += d.sopra.length * 1.2 * w.wTrack;
    // carte Sotto: valore = qualità dell'effetto × attivazioni future attese
    for (const id of d.sotto) {
      if (!d.blocked.includes(id)) v += (state.industrial?.enabled && state.industrial.productionMode === 'compact' ? Math.min(1.5, sottoValue(WORKER_BY_ID[id])) : sottoValue(WORKER_BY_ID[id])) * 2.2 * w.wTrack * futureEngine;
    }
    v -= d.blocked.length * 2.2;
    // tensione = budget consumabile prima dello sciopero: penalità graduata (non solo al limite),
    // così ridurla vale sempre qualcosa (0.4/punto) e l'AI usa l'abbassa-tensione al Sindacato.
    // K basso: un'attivazione (che alza la tensione ma produce risorse ~1.5) resta comunque conveniente.
    if (d.sopra.length + d.sotto.length > 0) {
      v -= (d.tension * 0.4 + (d.tension >= tensionLimit(state) - 1 ? 1.0 : 0)) * w.tensionAv * futureEngine;
    }
  }
  if (state.industrial?.enabled) {
    const I = state.industrial;
    const remaining = Math.max(0, state.endMode === 'rounds' ? state.roundLimit - state.turn : 20 - state.turn);
    const future = Math.min(4, remaining / 5);
    if (!state.contractsOnly) {
      v += (p.pvWelfare || 0) * 10;
      if (I.welfareScoring === 'final') v += welfarePoints(state, p) * 10;
    }
    // Stime esplicite del motore futuro; stesso criterio per tutti, nessun bonus di vittoria per archetipo.
    for (const role of DEPT_ROLES) {
      const d = p.depts[role];
      if (!state.rowEconomy?.enabled) v += Math.min(activeWorkers(d), 5) * future * 1.2;
      // Varianti sperimentali, non predefinite: observed elimina il proxy ovunque;
      // rollout-return solo nel confronto finale, conservando la policy greedy.
      // Nessuna ha dimostrato un miglioramento nello studio del 15/10/2026.
      if (p.aiEvaluation !== 'observed' && !(p.aiEvaluation === 'rollout-return' && rolloutLeaf) && state.rowEconomy?.enabled && d.sustainableWelfare && activeWorkers(d)) v += future * 2.3;
      if (!state.rowEconomy?.enabled) v += Math.min(3, workerCapacity(state, p, role) - state.slots[role].sopra) * future * 0.6;
      v -= d.shutdown ? 5 + future * 3 : 0;
      if (!state.rowTrack && d.tension >= I.blockThreshold && !d.shutdown) v -= future * 0.4;
      for (const c of policiesOf(state, d)) {
        if (c.effect === 'efficiency') v += Math.min(activeWorkers(d), c.coverage) * c.amount * future * 1.5 * (I.welfareNeedsWellbeing && wellbeing(state, d) < c.wellbeing ? 0.25 : 1);
        if (c.effect === 'recovery') v += c.amount * future * 1.2;
        if (c.effect === 'flexibility') v += future * 1.2;
        if (!state.contractsOnly && I.welfareScoring === 'quarter') {
          const payments = Math.max(0, Math.floor(state.roundLimit / I.quarterLength) - Math.floor((state.turn - 1) / I.quarterLength));
          v += c.pv * payments * 5 * (wellbeing(state, d) >= c.wellbeing ? 1 : 0.4);
        }
      }
    }
    v += scorePlayer(state, p).pvFactoryMajority * 3;
  }
  v += welfareCount(p) * 2.5;
  // Macchinari (Direzione Sotto): OFF = stima piatta 1.0/uso (baseline, sottovaluta la produzione).
  // ON = flusso di produzione atteso (usi × risorse/uso × valore risorsa), come le risorse da tracciato.
  if (state.aiValueMachines) {
    v += p.direzione.sotto.reduce((a, m) => {
      const wf = state.welfareById[m.id];
      return a + (m.usesLeft || 0) * (wf?.perUse?.length || 0) * 1.5 * (2 / state.rules.resPerPV) * w.wRes;
    }, 0);
  } else {
    v += p.direzione.sotto.reduce((a, m) => a + (m.usesLeft || 0), 0) * 1.0;
  }
  // effetti passivi carte struttura (lato Sotto): evaluate non li modella, valore euristico piatto
  // così l'AI a volte sceglie il lato Sotto invece che sempre Sopra. ponytail: stima grezza, da affinare.
  v += (p.struttura?.length || 0) * 3.5;
  // tile tracciato installate (2.0): stima piatta come welfareCount, stesso ordine di grandezza
  // (produttore permanente per attivazione). ponytail: nessuno scoring per tipo di tile, da affinare.
  v += DEPT_ROLES.reduce((a, r) => a + Object.keys(p.depts[r].tileFills || {}).length, 0) * 2.5;
  // progresso verso obiettivi non ancora raggiunti
  if (!state.contractsOnly) v += objectiveProgress(state, p) * 2.0 * w.wObjective;
  return v;
}

// Per settore: quante risorse servono al massimo per completare UNA commessa raggiungibile (ceiling utile).
// Oltre questa soglia una risorsa è surplus (vendibile/terminale), non "carburante convertibile".
function reachableNeedBySector(state, p) {
  const need = Object.fromEntries(SECTORS.map(s => [s, 0]));
  for (const size of ['small', 'medium', 'large']) {
    if (!sizeUnlocked(state, p, size)) continue; // commesse bloccate dal gate: non giustificano scorte
    for (const slot of state.contracts[size].active) {
      if (!slot) continue;
      slot.card.reqs.forEach((reqArr, i) => {
        if (slot.doneReq[i]) return;
        const cnt = {};
        for (const s of reqArr) cnt[s] = (cnt[s] || 0) + 1;
        for (const s of SECTORS) need[s] = Math.max(need[s], cnt[s] || 0);
      });
    }
  }
  return need;
}

function objectiveProgress(state, p) {
  let prog = 0;
  p.tile.objectives.forEach((o, i) => {
    if (p.achieved[i]) return;
    const c = o.cond;
    const frac = (x, n) => Math.min(x / n, 1);
    if (c.type === 'milestones') {
      const sum = c.sectors.reduce((a, s) => {
        const sector = typeof s === 'string' ? s : s.sector;
        const level = typeof s === 'string' ? 1 : (s.milestone ?? 1);
        const d = deptOfSector(p, sector);
        const threshold = state.marketUnlockPos[d.role]?.[level] ?? 16;
        return a + d.prod / Math.min(threshold, 16);
      }, 0);
      prog += frac(sum, c.sectors.length);
    }
    else if (c.type === 'workers_nation') prog += frac(countNation(p, c.nation), c.n);
    else if (c.type === 'same_nation') prog += frac(Math.max(...state.nations.map(n => countNation(p, n))), c.n);
    else if (c.type === 'distinct_nations') prog += frac(new Set(allWorkers(p).map(w => w.nation)).size, c.n);
    else if (c.type === 'sotto_each') prog += frac(DEPT_ROLES.filter(r => p.depts[r].sotto.length >= c.n).length, 3);
    else if (c.type === 'sopra_each') prog += frac(DEPT_ROLES.filter(r => p.depts[r].sopra.length >= c.n).length, 3);
    else if (c.type === 'direzione') prog += frac(c.side === 'sopra' ? p.direzione.sopra.length : c.side === 'sotto' ? p.direzione.sotto.length : p.direzione.sopra.length + p.direzione.sotto.length, c.n);
  });
  return prog;
}

function allWorkers(p) {
  const out = [];
  for (const role of DEPT_ROLES) {
    const d = p.depts[role];
    for (const id of [...d.sopra, ...d.sotto]) out.push(WORKER_BY_ID[id]);
  }
  return out;
}
function countNation(p, nation) { return allWorkers(p).filter(w => w.nation === nation).length; }

// Progresso frazionario (0..1 per obiettivo) verso le race ancora rivendicabili — contano SOLO i Sopra,
// come raceCondMet nell'engine. Somma sugli obiettivi aperti. Marginale: evaluate confronta stati prima/dopo
// una mossa, quindi un Sopra che avvicina alza v. NON dà i PV (quelli arrivano col claim).
// carte Sopra che contano per le race: Lavoratori nei reparti + Impiegati in Direzione (impiegati compresi),
// ognuno con nazione + settori (Lavoratore 1, Impiegato entrambi i suoi power-settori). Allineato a raceSopraItems in engine.
function raceItems(p) {
  const items = [];
  for (const role of DEPT_ROLES) for (const id of p.depts[role].sopra) { const w = WORKER_BY_ID[id]; if (w) items.push({ nation: w.nation, sectors: [w.sector] }); }
  for (const id of p.direzione.sopra) { const imp = WORKER_BY_ID[id]; if (imp) items.push({ nation: imp.nation, sectors: imp.power ? Object.keys(imp.power).filter(s => imp.power[s] > 0) : [] }); }
  return items;
}
function raceProgress(state, p) {
  const ro = state.raceObjectives;
  if (!ro?.enabled) return 0;
  const items = raceItems(p);
  const frac = (x, n) => Math.min(x / n, 1);
  let prog = 0;
  for (const it of ro.list) {
    if (state.raceExclude === it.id) continue; // contrafattuale per-race: ignora questo obiettivo (misura #7 isolata)
    if (it.claims.includes(p.id) || it.claims.length >= ro.podium.length) continue; // già preso o podio pieno → non insegue
    if (it.type === 'sopra_same_nation') prog += frac(Math.max(0, ...state.nations.map(nat => items.filter(x => x.nation === nat).length)), it.n);
    else if (it.type === 'sopra_distinct_nations') prog += frac(new Set(items.map(x => x.nation)).size, it.n);
    else if (it.type === 'sopra_each_sector') prog += frac(SECTORS.reduce((a, s) => a + Math.min(items.filter(x => x.sectors.includes(s)).length, it.n), 0), it.n * SECTORS.length);
  }
  return prog;
}

// ---------- Scelta comando ----------
export function chooseCommand(state) {
  if (state.gameOver) return null;
  if (state.pending) return resolvePending(state);
  const p = currentPlayer(state);
  if (state.phase === 'move') return chooseMove(state, p).cmd;
  if (state.phase === 'action') return chooseAction(state, p);
  if (state.phase === 'borsa') return chooseBorsa(state, p);
  return null;
}

// Attivazioni che restano al reparto dopo lo sblocco del mercato tile: pesa le tile che riproducono
// (coins/res) contro quelle one-shot (pv). ponytail: stima grezza — ~13 attivazioni/partita su 3 reparti e
// milestone raggiunta a metà. Knob: se il batch mostra che le tile pv non vengono MAI scelte, è troppo alto.
const TILE_ACTIVATIONS_LEFT = 4;

// Quale tile conviene, in PV equivalenti — stessa conversione della fine partita, così tile di tipo diverso
// (marchi / risorse / PV) si confrontano sulla stessa scala invece di prendere la prima del catalogo.
function tileScore(state, owner, role, tile) {
  const f = tileForecast(state, owner, role, tile);
  const perActivation = f.coins / state.rules.coinsPerPV + f.res / state.rules.resPerPV;
  return f.pv + perActivation * TILE_ACTIVATIONS_LEFT;
}

function plansTokens(state, playerId) {
  return tokenWelfare(state) && state.players[playerId].aiContinuation === 'forecast2';
}
function defersToken(state, playerId) {
  return state.aiTokenPlan?.playerId === playerId && state.turn < state.aiTokenPlan.notBeforeTurn;
}

// ----- pending: sciopero, tile tracciato e effetti opzionali -----
function resolvePending(state) {
  if (state.pending.type === 'welfareToken') {
    const owner = state.pending.playerId, legal = legalCommands(state);
    let best = legal.find(c => c.type === 'skipWelfareToken');
    if (defersToken(state, owner)) return best;
    // Only real decisions start a search; speculative states always have aiRollout=null.
    const valueOf = s => state.aiRollout && plansTokens(state, owner)
      ? continuationValue(s, state.aiRollout.depth, owner) : evaluate(s, owner);
    let value = valueOf(timedApply(state, best));
    // Equal forecasts retain the most tokens; every legal recovery amount is evaluated.
    for (const command of legal.filter(c => c.type === 'spendWelfareToken').sort((a, b) => (a.count ?? 1) - (b.count ?? 1))) {
      const candidate = valueOf(timedApply(state, command));
      if (candidate > value) { best = command; value = candidate; }
    }
    return best;
  }
  const choice = resolvePendingHeuristic(state);
  if (!state.industrial?.enabled) return choice;
  const legal = legalCommands(state);
  // Le formule possono chiedere più di una risorsa: il surplus euristico da solo non basta.
  if (legal.some(c => Object.keys(c).every(k => JSON.stringify(c[k]) === JSON.stringify(choice[k])))) return choice;
  return legal.find(c => c.use === false) || legal[0];
}

function resolvePendingHeuristic(state) {
  const pend = state.pending;
  const owner = state.players[pend.playerId];
  if (pend.type === 'trackTile') {
    // la scelta è gratis (nessuna azione, nessuna visita): rinunciare non conviene mai se una tile è a portata
    const opts = legalCommands(state).filter(c => c.type === 'resolveTrackTile' && c.use);
    if (opts.length === 0) return { type: 'resolveTrackTile', use: false, reason: 'nessuna tile disponibile' };
    const best = opts.reduce((a, b) => (tileScore(state, owner, pend.role, state.trackTileById[b.tileId])
      > tileScore(state, owner, pend.role, state.trackTileById[a.tileId]) ? b : a));
    return best;
  }
  if (pend.type === 'sciopero') {
    // blocca preferibilmente una carta Sopra (nessuna produzione continua), poi la Sotto di minor valore
    const dept = owner.depts[pend.role];
    const sopra = pend.options.filter(id => dept.sopra.includes(id));
    if (sopra.length > 0) return { type: 'strikeBlock', cardId: sopra[0] };
    const sotto = [...pend.options].sort((a, b) => sottoValue(WORKER_BY_ID[a]) - sottoValue(WORKER_BY_ID[b]));
    return { type: 'strikeBlock', cardId: sotto[0] };
  }
  // effetti opzionali con scelta di settore — euristica per FORMA dello scambio, non per tipo
  const F = formulaOf(pend.card || WORKER_BY_ID[pend.cardId]);
  const needs = resourceNeeds(state, owner);
  const f1res = F.f1?.tipo === 'risorsa', f2res = F.f2?.tipo === 'risorsa';
  if (f1res && F.f2?.tipo === 'moneta') { // vendo risorsa → monete (es. swap_res_3m)
    const give = surplusResource(owner, needs);
    if (give) return { type: 'resolveEffect', use: true, give };
    return { type: 'resolveEffect', use: false, reason: 'nessun surplus da cedere' };
  }
  if (F.f1?.tipo === 'moneta' && f2res) { // compro risorsa con monete (es. buy_res_2m)
    if (owner.coins >= 5) {
      const take = neededResource(owner, needs) || SECTORS[0];
      return { type: 'resolveEffect', use: true, take };
    }
    return { type: 'resolveEffect', use: false, reason: 'marchi insufficienti' };
  }
  if (f1res && f2res) { // scambio risorsa → risorsa (es. swap_res_any)
    const give = surplusResource(owner, needs);
    const take = neededResource(owner, needs);
    if (give && take && give !== take) return { type: 'resolveEffect', use: true, give, take };
    if (!give) return { type: 'resolveEffect', use: false, reason: 'nessun surplus da cedere' };
    if (!take) return { type: 'resolveEffect', use: false, reason: 'nessuna commessa richiede altre risorse ora', give, nCandidates: activeContractCount(state, owner) };
    return { type: 'resolveEffect', use: false, reason: 'il surplus coincide col fabbisogno', give };
  }
  return { type: 'resolveEffect', use: false, reason: 'formula non riconosciuta' };
}

// fabbisogno: risorse mancanti per la commessa attiva più conveniente
function resourceNeeds(state, p) {
  let best = null;
  for (const size of ['small', 'medium', 'large']) {
    if (!sizeUnlocked(state, p, size)) continue; // non stockpilare per commesse ancora bloccate
    for (const slot of state.contracts[size].active) {
      if (!slot) continue;
      slot.card.reqs.forEach((reqArr, i) => {
        if (slot.doneReq[i]) return;
        const need = {};
        for (const s of reqArr) need[s] = (need[s] || 0) + 1;
        let missing = 0;
        for (const [s, n] of Object.entries(need)) missing += Math.max(0, n - p.resources[RESOURCE_OF[s]]);
        const place = slot.places[0] === null ? 0 : 1;
        const score = slot.card.pv[place] / (1 + missing * 2);
        if (!best || score > best.score) best = { score, need, missing };
      });
    }
  }
  return best ? best.need : {};
}

// quante commesse attive (sbloccate per taglia) il giocatore aveva davanti quando ha rifiutato una conversione
function activeContractCount(state, p) {
  let n = 0;
  for (const size of ['small', 'medium', 'large']) {
    if (!sizeUnlocked(state, p, size)) continue;
    for (const slot of state.contracts[size].active) if (slot) n++;
  }
  return n;
}

function surplusResource(p, needs) {
  let best = null, bestExtra = 0;
  for (const s of SECTORS) {
    const have = p.resources[RESOURCE_OF[s]];
    const extra = have - (needs[s] || 0);
    if (extra > bestExtra) { bestExtra = extra; best = s; }
  }
  return best;
}
function neededResource(p, needs) {
  let best = null, bestGap = 0;
  for (const s of SECTORS) {
    const gap = (needs[s] || 0) - p.resources[RESOURCE_OF[s]];
    if (gap > bestGap) { bestGap = gap; best = s; }
  }
  return best;
}

// ----- fase movimento: lookahead nodo → miglior azione -----
function chooseMove(state, p) {
  // chooseProduction: produrre è gratis e non finisce il turno → fallo prima di muovere, scegliendo il colore utile.
  const prod = legalCommands(state).filter(c => c.type === 'produceFactory');
  if (prod.length) {
    const needs = resourceNeeds(state, p);
    const want = neededResource(p, needs); // colore col fabbisogno-commesse maggiore, o null
    let best = null;
    for (const c of prod) {
      const gap = (needs[c.sector] || 0) - p.resources[RESOURCE_OF[c.sector]];
      const score = (c.sector === want ? 100 : 0) + gap - (p.resources[RESOURCE_OF[c.sector]] || 0) * 0.1 + noise(state, p.id, 'prod-' + c.sector) * 0.3;
      if (!best || score > best.score) best = { cmd: c, score };
    }
    return { cmd: best.cmd };
  }
  const moves = legalCommands(state).filter(c => c.type === 'move');
  const moveCost = profileOf(p).moveCost;
  let best = null;
  for (const mv of moves) {
    const s2 = applyCommand(state, mv);
    let score, action;
    if (state.industrial?.enabled && state.aiRollout) {
      // Il lookahead deve scegliere anche il nodo: altrimenti non visita mai una produzione che il greedy scarta.
      const act = bestActionAtRollout(s2, state.aiRollout);
      action = act?.cmd;
      score = act ? act.score : -Infinity;
    } else if (mv.node === 'Borsa') {
      score = borsaEstimate(s2, s2.players[p.id]) - mv.cost * 0.45 * moveCost;
    } else {
      const act = bestActionAt(s2);
      action = act?.cmd;
      score = (act ? act.score : -5) - mv.cost * 0.45 * moveCost;
    }
    score += noise(state, p.id, mv.node) * 0.3; // rompe le simmetrie
    if (!best || score > best.score) best = { cmd: mv, score, action };
  }
  return best;
}

// ----- fase azione -----
function chooseAction(state, p) {
  if (state.aiRollout) { rolloutStats.decisionsRollout++; const act = bestActionAtRollout(state, state.aiRollout); return act ? act.cmd : { type: 'pass' }; }
  rolloutStats.decisionsGreedy++;
  const act = bestActionAt(state);
  return act ? act.cmd : { type: 'pass' };
}

// rollout: invece di valutare subito dopo 1 mossa, gioca `depth` turni in self-play greedy
// (chooseCommand su tutti i giocatori) e valuta lì — media su `rollouts` run. Costoso: vedi state.aiRollout.
function forwardStep(state) {
  const plan = !state.pending && state.phase === 'move' ? chooseMove(state, currentPlayer(state)) : null;
  const cmd = plan?.cmd ?? chooseCommand(state);
  if (!cmd) return state;
  let after = timedApply(state, cmd);
  rolloutStats.stepsSimulated++;
  // Movimento e azione consecutivi: stesso stato deterministico, nessuna cache fra partite.
  if (plan?.action && !after.pending && after.phase === 'action') {
    after = timedApply(after, plan.action);
    rolloutStats.stepsSimulated++;
  }
  return after;
}
function playForward(state, turns) {
  rolloutStats.playForwardCalls++;
  const startTurn = state.turn;
  // continuazione SEMPRE greedy: senza questo, chooseCommand vede ancora state.aiRollout e rilancia
  // bestActionAtRollout dentro la simulazione — rollout ricorsivo, esponenziale, mai inteso.
  let s = state.aiRollout ? { ...state, aiRollout: null } : state;
  let guard = 0;
  while (!s.gameOver && (s.turn - startTurn) < turns && guard++ < 4000) {
    const after = forwardStep(s);
    if (after === s) break;
    s = after;
    if (s.aiRollout) s = { ...s, aiRollout: null };
  }
  return s;
}

// shortcut: avversari, effetti e resto della visita in città restano greedy;
// ampliare questi rami solo se il confronto mostra errori dovuti a tali risposte.
function advanceToOwnMove(state, playerId, endTurn) {
  let s = state, guard = 0;
  while (!s.gameOver && s.turn < endTurn && guard++ < 4000) {
    if (!s.pending && s.current === playerId && s.phase === 'move') return s;
    const after = forwardStep(s);
    if (after === s) return s;
    s = after;
  }
  return s;
}

function finishOwnTurn(state, playerId, endTurn) {
  let s = state, guard = 0;
  while (!s.gameOver && s.turn < endTurn && (s.current === playerId || s.pending) && guard++ < 4000) {
    const after = forwardStep(s);
    if (after === s) break;
    s = after;
  }
  return s;
}

// Keep end-of-action recovery choices open until their future uses have been compared.
function pendingOutcomes(state, playerId, branchTokens) {
  let s = { ...state, aiRollout: null }, guard = 0;
  while (s.pending && guard++ < 20) {
    if (branchTokens && s.pending.type === 'welfareToken' && s.pending.playerId === playerId) {
      const commands = legalCommands(s).sort((a, b) => Number(b.type === 'skipWelfareToken') - Number(a.type === 'skipWelfareToken') || (a.count ?? 1) - (b.count ?? 1));
      rolloutStats.tokenRecoveryBranches += commands.length;
      return commands.map(command => timedApply(s, command));
    }
    s = timedApply(s, chooseCommandForPending(s));
  }
  return [s];
}
function deferredTokenValue(state, depth, playerId, fallback) {
  if (state.gameOver || !plansTokens(state, playerId) || !state.players[playerId].welfareTokens) return fallback;
  let best = fallback;
  // shortcut: vary the first spending turn, then continue greedily; replan on every real decision.
  // The final schedule holds all tokens through the window. No token value is added to evaluate().
  for (let delay = 1; delay <= depth; delay++) {
    const planned = { ...state, aiTokenPlan: { playerId, notBeforeTurn: state.turn + delay } };
    best = Math.max(best, evaluate(playForward(planned, depth), playerId, true));
    rolloutStats.tokenDeferredForecasts++;
  }
  return best;
}

function tokenFutureValue(state, depth, playerId) {
  return deferredTokenValue(state, depth, playerId, evaluate(playForward(state, depth), playerId, true));
}
function pendingOutcomeForRollout(state, depth, playerId) {
  const outcomes = pendingOutcomes(state, playerId, plansTokens(state, playerId));
  if (outcomes.length === 1) return outcomes[0];
  // shortcut: predict recovery with future paths here; the real pending decision rechecks ordinary alternatives.
  let best = outcomes[0], value = tokenFutureValue(best, depth, playerId);
  for (const outcome of outcomes.slice(1)) {
    const candidate = tokenFutureValue(outcome, depth, playerId);
    if (candidate > value) { best = outcome; value = candidate; }
  }
  return best;
}

// Stesso orizzonte e stessa valutazione del rollout precedente, senza quote per tipo di azione.
export function continuationValue(state, depth, playerId) {
  const fallback = tokenFutureValue(state, depth, playerId);
  const mode = state.players[playerId].aiContinuation;
  if (!state.rowEconomy?.enabled || !['beam2', 'forecast2'].includes(mode)) return fallback;
  rolloutStats.beamCalls++;
  const endTurn = state.turn + depth;
  let beam = [advanceToOwnMove({ ...state, aiRollout: null }, playerId, endTurn)];
  let best = fallback;
  for (let layer = 0; layer < depth && beam.length; layer++) {
    const next = [];
    for (const s of beam) {
      if (s.gameOver || s.turn >= endTurn) {
        best = Math.max(best, evaluate(s, playerId, true));
        continue;
      }
      for (const move of legalCommands(s).filter(c => c.type === 'move')) {
        const moved = timedApply(s, move);
        for (const action of actionCandidates(moved, moved.players[playerId])) {
          const after = finishOwnTurn(timedApply(moved, action), playerId, endTurn);
          rolloutStats.beamExpanded++;
          // Prima potatura: confronta tutte le alternative a fine finestra, così
          // una spesa può mostrare i suoi utilizzi. Ripetuto a ogni decisione reale.
          // shortcut: i livelli successivi restano euristici per limitare il costo.
          let leaf = after;
          const forecast = mode === 'forecast2' && layer === 0;
          if (forecast && !after.gameOver && after.turn < endTurn) {
            leaf = playForward(after, endTurn - after.turn);
            rolloutStats.beamForecasts++;
          }
          const value = evaluate(leaf, playerId, true);
          if (forecast) best = Math.max(best, value);
          if (after.gameOver || after.turn >= endTurn) best = Math.max(best, value);
          else next.push({ state: after, value });
        }
      }
    }
    next.sort((a, b) => b.value - a.value);
    beam = [];
    // Le risposte degli avversari si calcolano solo per le due linee conservate.
    for (const x of next.slice(0, 2)) {
      const after = advanceToOwnMove(x.state, playerId, endTurn);
      if (after.gameOver || after.turn >= endTurn) best = Math.max(best, evaluate(after, playerId, true));
      else beam.push(after);
    }
    rolloutStats.beamLayers++;
  }
  return best;
}

function bestActionAtRollout(state, { depth, rollouts }) {
  const __t0 = performance.now();
  const p = currentPlayer(state);
  const candidates = actionCandidates(state, p);
  if (candidates.length === 1 && !state.industrial?.enabled) {
    rolloutStats.perDecisionLog.push({ turn: state.turn, node: p.node, nCandidates: 1, ms: performance.now() - __t0 });
    return { cmd: candidates[0], score: 0 }; // nulla da confrontare: salta il rollout
  }
  let best = null;
  for (const cmd of candidates) {
    let s2;
    try { s2 = timedApply(state, cmd); } catch { continue; }
    const outcome = pendingOutcomeForRollout(s2, depth, p.id);
    let total = 0;
    for (let r = 0; r < rollouts; r++) total += continuationValue(outcome, depth, p.id);
    const score = total / rollouts;
    if (!best || score > best.score) best = { cmd, score };
  }
  rolloutStats.perDecisionLog.push({ turn: state.turn, node: p.node, nCandidates: candidates.length, ms: performance.now() - __t0 });
  return best;
}

// ----- decision log: confronta greedy vs rollout sullo STESSO stato/candidati — "come ragiona" l'IA
// in quel punto, non solo il risultato finale. Strumento permanente di debug (vedi scripts/decisionlog.js).
function labelCmd(cmd) {
  if (cmd.type === 'hire') return `Assumi ${cmd.cardId}`;
  if (cmd.type === 'activate') return `Produci ${cmd.sector}${cmd.welfareToken ? ' · protetta' : ` ×${cmd.intensity ?? 1}`}`;
  if (cmd.type === 'spendWelfareToken') return `${cmd.count ?? 1} gettoni welfare (${cmd.role})`;
  if (cmd.type === 'buyPolicy') return `Welfare ${cmd.policyId} (${cmd.role})`;
  if (cmd.type === 'restartDepartment') return `Riapri ${cmd.role}`;
  if (cmd.type === 'buyWelfare') return (cmd.side === 'sotto' ? 'Macchinario ' : 'Welfare ') + cmd.cardId;
  if (cmd.type === 'buyStruttura') return `Struttura (${cmd.side}) ${cmd.idx}`;
  if (cmd.type === 'trattativa') return 'Trattativa';
  if (cmd.type === 'unblockSciopero') return `Elimina sciopero (${cmd.role})`;
  if (cmd.type === 'pass') return 'Pass';
  return cmd.type;
}
export function logDecision(state, rolloutOpts = { depth: 4, rollouts: 1 }, topN = 6) {
  if (state.phase !== 'action') return null;
  const p = currentPlayer(state);
  const base = evaluate(state, p.id);
  const candidates = actionCandidates(state, p);
  const greedy = [], rollout = [];
  for (const cmd of candidates) {
    let s2;
    try { s2 = applyCommand(state, cmd); } catch { continue; }
    const greedyOutcome = pendingOutcomes(s2, p.id, false)[0];
    greedy.push({ label: labelCmd(cmd), score: evaluate(greedyOutcome, p.id) - base });
    const outcome = pendingOutcomeForRollout(s2, rolloutOpts.depth, p.id);
    let total = 0;
    for (let r = 0; r < rolloutOpts.rollouts; r++) total += continuationValue(outcome, rolloutOpts.depth, p.id);
    rollout.push({ label: labelCmd(cmd), score: total / rolloutOpts.rollouts });
  }
  greedy.sort((a, b) => b.score - a.score);
  rollout.sort((a, b) => b.score - a.score);
  let text = `Turno ${state.turn} — giocatore ${p.id} (${p.personality}, nodo ${p.node})\n`;
  text += `Greedy (delta 1-mossa):\n`;
  greedy.slice(0, topN).forEach((r, i) => { text += `  ${i + 1}) ${r.label.padEnd(24)} ${r.score >= 0 ? '+' : ''}${r.score.toFixed(2)}\n`; });
  text += `Rollout depth=${rolloutOpts.depth} rollouts=${rolloutOpts.rollouts} (valore assoluto a fine finestra):\n`;
  rollout.slice(0, topN).forEach((r, i) => { text += `  ${i + 1}) ${r.label.padEnd(24)} ${r.score.toFixed(2)}\n`; });
  return { turn: state.turn, playerId: p.id, greedy, rollout, text };
}

function bestActionAt(state) {
  const p = currentPlayer(state);
  const candidates = actionCandidates(state, p);
  if (candidates.length === 1) return { cmd: candidates[0], score: 0 }; // nulla da confrontare: salta apply+evaluate
  const base = evaluate(state, p.id);
  let best = null;
  for (const cmd of candidates) {
    let s2;
    try { s2 = timedApply(state, cmd); } catch { continue; }
    // risolvi greedy i pending per valutare lo stato finale
    let guard = 0;
    while (s2.pending && guard++ < 20) {
      const dec = chooseCommandForPending({ ...s2, aiRollout: null });
      s2 = timedApply(s2, dec);
    }
    const score = evaluate(s2, p.id) - base;
    if (!best || score > best.score) best = { cmd, score };
  }
  return best;
}

function chooseCommandForPending(state) {
  return resolvePending(state);
}

function actionCandidates(state, p) {
  const node = p.node;
  const out = [];
  const legal = legalCommands(state).filter(c => {
    if (c.welfareToken && defersToken(state, p.id)) return false;
    // A tensione massima la protezione consuma un gettone senza cambiare la produzione.
    if (c.welfareToken && tokenWelfare(state) && deptOfSector(p, c.sector).tension >= tensionLimit(state)) return false;
    if (!state.rowEconomy?.enabled) return true;
    // Vincoli sperimentali dell'agente, non regole: il tavolo libero resta il riferimento.
    if (p.aiRecovery === 'repression' && c.type === 'investWelfare') return false;
    if (p.aiRecovery === 'welfare' && c.type === 'repress') return false;
    return true;
  });
  if (state.industrial?.enabled) return legal;
  for (const c of legal) {
    if (c.type === 'hire' || c.type === 'activate' || c.type === 'buyWelfare' || c.type === 'buyStruttura' || c.type === 'buyShare' || c.type === 'buildFactory') out.push(c);
  }
  if (node === 'Sindacato') {
    const ss = state.sindacatoSession;
    if (!ss?.trattativa) out.push(...trattativaCandidates(state, p));
    if (!ss?.unblock) out.push(...unblockCandidates(state, p));
  }
  if (out.length === 0) out.push({ type: 'pass' });
  return out;
}

// Elimina uno Sciopero (azione a sé, combinabile col resto al Sindacato): la prima carta bloccata
// trovata, se il giocatore può permettersela — non serve valutarne altre, l'effetto è identico.
function unblockCandidates(state, p) {
  const T = state.trattativa;
  if (!T.unblock.enabled || p.coins < T.unblock.cost) return [];
  for (const role of DEPT_ROLES) {
    if (p.depts[role].blocked.length > 0) return [{ type: 'unblockSciopero', role, cardId: p.depts[role].blocked[0] }];
  }
  return [];
}

// costruisce poche Trattative sensate invece di enumerare tutto
function trattativaCandidates(state, p) {
  const aggro = profileOf(p).aggro;
  const myRoles = [...DEPT_ROLES].sort((a, b) => p.depts[b].tension - p.depts[a].tension);
  const resetRole = myRoles[0];
  // bersaglio: reparto avversario non vuoto con tensione più alta (spinge verso sciopero).
  // Personalità pacifica (aggro 0): non attacca → targetPlayer null (l'engine salta l'attacco).
  let target = null;
  if (aggro > 0) {
    for (const opp of state.players) {
      if (opp.id === p.id) continue;
      for (const role of DEPT_ROLES) {
        const d = opp.depts[role];
        const cards = d.sopra.length + d.sotto.length;
        if (cards === 0) continue;
        // aggro alza il peso della tensione → più propensione a bersagli vicini allo sciopero
        const val = d.tension * 2 * aggro + cards * 0.3 + noise(state, p.id, opp.id, role) * 0.25;
        if (!target || val > target.val) target = { val, playerId: opp.id, role };
      }
    }
    if (!target) {
      const opps = state.players.filter(q => q.id !== p.id);
      const opp = opps[Math.floor(noise(state, p.id, 'targetFallback') * opps.length)];
      target = { playerId: opp.id, role: 'primario' };
    }
  }
  return [{ type: 'trattativa', resetRole, targetPlayer: target ? target.playerId : null, targetRole: target ? target.role : null }];
}

// Avanzamento che un Impiegato produce davvero adesso: somma dei 2 reparti di `power`, ciascuno capped
// dal fondo del tracciato (un +3 su un reparto già a 16 non vale niente).
function powerGain(p, w, trackMax) {
  return Object.entries(w.power).reduce((s, [sector, amt]) => s + Math.min(amt, trackMax - deptOfSector(p, sector).prod), 0);
}

// Mirror lato-IA di placements() nel motore: un Impiegato (w.power, nessun w.sector) va SOLO in Direzione
// Sopra e non ha lato Sotto. Senza questo ramo, deptOfSector(p, undefined) → undefined → crash.
function bestPlacement(state, p, w) {
  const opts = [];
  if (w.power) {
    if (p.direzione.sopra.length < state.slots.direzione.sopra) opts.push({ side: 'sopra', role: 'direzione', val: powerGain(p, w, state.trackMax) });
  } else {
    const dSopra = deptOfSector(p, w.sector);
    if (dSopra.sopra.length < state.slots[dSopra.role].sopra) opts.push({ side: 'sopra', role: dSopra.role, val: Math.min(w.v, state.trackMax - dSopra.prod) });
    for (const role of DEPT_ROLES) {
      if (p.depts[role].sotto.length < state.slots[role].sotto) opts.push({ side: 'sotto', role, val: sottoValue(w) });
    }
  }
  if (opts.length === 0) return null;
  opts.sort((a, b) => b.val - a.val);
  return opts[0];
}

// valore euristico di una carta Sotto per l'AI — derivato dalla FORMULA (riproduce gli 8 valori legacy)
function sottoValue(w) {
  const F = formulaOf(w);
  if (F.verbo === 'prendi') return F.f1.tipo === 'moneta' ? 2.2 : 2.5;
  if (F.verbo === 'perOgni') return F.f2.conta === 'icona' ? 3.0 : F.f2.conta === 'tensione' ? 2.6 : 2.0;
  if (F.verbo === 'scambia') return F.f2.tipo === 'moneta' ? 2.0 : F.f1.tipo === 'moneta' ? 1.5 : 1.6;
  return 1;
}

function hireValue(state, p, w, place) {
  if (place.side === 'sopra') {
    // Impiegato: avanza i 2 reparti di `power`, non uno solo del proprio V (che per lui è solo il costo)
    const gain = w.power ? powerGain(p, w, state.trackMax) : Math.min(w.v, state.trackMax - deptOfSector(p, w.sector).prod);
    return gain * 1.3 - w.v * 0.4;
  }
  return sottoValue(w) - w.v * 0.4;
}

// ----- Borsa: stima per il lookahead del movimento -----
function borsaEstimate(state, p) {
  // pv delle commesse completabili subito (con conversioni greedy) + valore vendite surplus
  let est = 0;
  const res = { ...p.resources };
  let done = 0;
  for (const size of ['large', 'medium', 'small']) {
    if (!sizeUnlocked(state, p, size)) continue; // commesse bloccate dal gate milestone: non stimarle
    for (const slot of state.contracts[size].active) {
      if (!slot) continue;
      slot.card.reqs.forEach((reqArr, i) => {
        if (done >= 2 || slot.doneReq[i]) return;
        const need = {};
        for (const s of reqArr) need[s] = (need[s] || 0) + 1;
        if (Object.entries(need).every(([s, n]) => res[RESOURCE_OF[s]] >= n)) {
          for (const [s, n] of Object.entries(need)) res[RESOURCE_OF[s]] -= n;
          const place = slot.places[0] === null ? 0 : 1;
          est += slot.card.pv[place] * 8;
          done += 1;
        }
      });
    }
  }
  const leftover = Object.values(res).reduce((a, b) => a + b, 0);
  if (done === 0) est += Math.max(0, leftover - 6) * 1.5; // vendere l'eccesso ha comunque valore
  return est;
}

// tra le tariffe Borsa disponibili (base + tier Macchinario sbloccati) sceglie quella col miglior get/give
function bestExchange(legal, kind, give, take) {
  const opts = legal.filter(c => c.type === 'exchange' && c.kind === kind && c.give === give && (take === undefined || c.take === take));
  if (!opts.length) return null;
  return opts.reduce((best, c) => (c.getQty / c.giveQty > best.getQty / best.giveQty ? c : best));
}

// ----- Borsa: comandi effettivi -----
function chooseBorsa(state, p) {
  const legal = legalCommands(state);
  // 0. obiettivi di gara: PV gratis (non costano risorse), rivendica sempre il più remunerativo prima.
  // Chiude la via "esci con bonus", come le commesse — ma vale molto più di 2 marchi, quindi ha la precedenza.
  const races = legal.filter(c => c.type === 'completeRace');
  if (races.length > 0) {
    const racePV = c => { const it = state.raceObjectives.list.find(r => r.id === c.raceId); return state.raceObjectives.podium[it.claims.length] ?? 0; };
    races.sort((a, b) => racePV(b) - racePV(a));
    return races[0];
  }
  // 1. completa la commessa più remunerativa
  const completes = legal.filter(c => c.type === 'completeContract');
  if (completes.length > 0) {
    completes.sort((a, b) => contractPV(state, b) - contractPV(state, a));
    return completes[0];
  }
  // 2. conversione mirata: se manca 1 risorsa per una commessa e ho surplus di un'altra
  const needs = resourceNeeds(state, p);
  const missing = neededResource(p, needs);
  if (missing && state.contractsThisVisit < (state.singleContractVisit ? 1 : 2)) {
    for (const give of SECTORS) {
      if (give === missing) continue;
      const extra = p.resources[RESOURCE_OF[give]] - (needs[give] || 0);
      const best = bestExchange(legal, 'convert', give, missing);
      if (best && extra >= best.giveQty) return best;
    }
  }
  // 3. vendi il surplus abbondante (tieni una riserva = profilo, default 4 risorse)
  if (totalResources(p) > profileOf(p).reserve) {
    const give = surplusResource(p, needs);
    if (give) {
      const extra = p.resources[RESOURCE_OF[give]] - (needs[give] || 0);
      const best = bestExchange(legal, 'sell', give);
      if (best && extra >= best.giveQty) return best;
    }
  }
  // 4. niente commessa completabile né conversione utile questo giro: bonus fisso gratis prima di uscire.
  // Non sceglie mai refreshMarket (richiede un giudizio su "il mercato è abbastanza brutto da rinfrescare?"
  // che il greedy 1-ply non sa fare — lasciato ai giocatori umani per ora).
  const exitCmd = legal.find(c => c.type === 'borsaExit');
  if (exitCmd) return exitCmd;
  return { type: 'endTurn' };
}

function contractPV(state, cmd) {
  const slot = state.contracts[cmd.size].active[cmd.slotIndex ?? 0];
  const place = slot.places[0] === null ? 0 : 1;
  return slot.card.pv[place];
}
