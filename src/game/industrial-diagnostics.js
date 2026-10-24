// Osservazione delle sole mosse realmente giocate: non interviene su regole o valutazione IA.
import { workerCapacity } from './engine.js';
import { activeWorkers, policiesOf } from './industrial.js';

const ROLES = ['terziario', 'secondario', 'primario'];
const sum = xs => xs.reduce((a, b) => a + b, 0);
const mean = xs => xs.length ? sum(xs) / xs.length : 0;
const fmt = n => n.toFixed(2);
const pct = (n, d) => d ? `${(100 * n / d).toFixed(1)}%` : '—';
export const newIndustrialDiagnostics = () => ({ version: 1, buys: [], productions: [], crises: [], visits: [], checkpoints: [] });

export function observeIndustrial(diag, before, cmd, after) {
  const seat = before.current, turn = before.turn;
  const p = before.players[seat], next = after.players[seat], I = before.industrial;
  if (cmd.type === 'buyPolicy') diag.buys.push({ seat, turn, role: cmd.role, policyId: cmd.policyId });
  if (cmd.type === 'activate') {
    const d = Object.values(p.depts).find(d => d.sector === cmd.sector);
    const log = after.activationLog.at(-1);
    const cards = policiesOf(before, d).filter(c => c.effect === 'efficiency');
    const covered = sum(cards.map(c => Math.min(cmd.intensity, c.coverage) * c.amount));
    diag.productions.push({ seat, turn, role: d.role, factories: p.factories.length,
      capacity: workerCapacity(before, p, d.role), baseCapacity: before.slots[d.role].sopra,
      workers: d.sopra.length, active: activeWorkers(d), intensity: cmd.intensity,
      efficiencyOwned: cards.length > 0, welfareBonus: log.welfareResources,
      welfareSuspended: covered > 0 && log.welfareResources === 0,
      resources: log.resources, tensionAfter: log.tensionAfter });
  }
  for (const e of after.strikeLog.slice(before.strikeLog.length)) {
    if (e.kind === 'shutdown') diag.crises.push({ seat: e.seat, role: e.role, turn: e.turn,
      cause: cmd.type, restartTurn: null });
  }
  if (cmd.type === 'restartDepartment') {
    const crisis = [...diag.crises].reverse().find(e => e.seat === seat && e.role === cmd.role && e.restartTurn === null);
    if (crisis) crisis.restartTurn = turn;
  }
  if (cmd.type === 'move' && cmd.node === 'Sindacato') {
    for (const role of ROLES) if (next.depts[role].shutdown) diag.visits.push({ seat, turn, role,
      coins: next.coins, affordable: next.coins >= I.restartCost });
  }
  const ended = after.gameOver || before.current !== after.current || before.turn !== after.turn;
  if (ended && (turn % I.quarterLength === 0 || after.gameOver)) {
    diag.checkpoints.push({ seat, turn, factories: next.factories.length,
      workers: sum(ROLES.map(r => next.depts[r].sopra.length)),
      capacity: sum(ROLES.map(r => workerCapacity(after, next, r))),
      active: sum(ROLES.map(r => activeWorkers(next.depts[r]))),
      policies: sum(ROLES.map(r => next.depts[r].welfare.length)),
      contracts: next.contractsWon.length, closed: ROLES.filter(r => next.depts[r].shutdown).length });
  }
}

export function industrialResourceBalance(games) {
  const sources = {}, sinks = {};
  let held = 0, terminal = 0, remainder = 0, discarded = 0;
  for (const g of games) {
    for (const x of g.resGainedBy) for (const [k, v] of Object.entries(x)) sources[k] = (sources[k] || 0) + v;
    for (const x of g.resSpentByCat) for (const [k, v] of Object.entries(x)) sinks[k] = (sinks[k] || 0) + v;
    for (const x of g.resFinalByType) for (const v of Object.values(x)) {
      held += v; remainder += v % g.resPerPV; terminal += v - v % g.resPerPV;
    }
    discarded += sum(g.resDiscarded || []);
  }
  const hasDiscards = games.every(g => Array.isArray(g.resDiscarded));
  return { sources, sinks, held, terminal, remainder, discarded: hasDiscards ? discarded : null,
    difference: hasDiscards ? sum(Object.values(sources)) - sum(Object.values(sinks)) - held - discarded : null };
}

export function formatIndustrialDiagnostics(games) {
  const gs = games.filter(g => !g.failed && g.industrial);
  if (!gs.length) return ['Nessuna partita del laboratorio disponibile.'];
  const people = gs.flatMap(g => g.results.map(r => ({ g, seat: r.playerId, pv: r.total, won: g.winner === r.playerId,
    factories: g.industrial.players[r.playerId].factories })));
  const L = ['', 'LETTURA DEL LABORATORIO — dati osservati, nessuna strategia assegnata',
    'I tracciati e le classificazioni della versione originale non entrano in questa diagnosi.',
    `Partite ${gs.length}; giocatori-partita ${people.length}. Le osservazioni dello stesso tavolo non sono indipendenti.`,
    `Seed: ${gs.map(g => g.seed ?? 'non registrato').join(', ')}.`,
    '', 'ECONOMIA — quantità separate, flussi misurati'];
  const b = industrialResourceBalance(gs);
  L.push(`Entrate risorse: ${Object.entries(b.sources).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(' · ')}.`);
  L.push(`Risorse spese: ${Object.entries(b.sinks).filter(([, n]) => n).map(([k, n]) => `${k} ${n}`).join(' · ') || 'nessuna'}.`);
  L.push(`In mano alla fine: ${b.held}; di queste ${b.terminal} convertite in PV e ${b.remainder} resti non convertibili. Scartate per tetto: ${b.discarded ?? 'non registrate'}.`);
  L.push(`Verifica entrate − spese − risorse finali − scarti = ${b.difference ?? 'non disponibile'}. La conversione finale non è vendita al mercato.`);
  L.push('Le carte Sotto sono registrate nel canale risorse “bonus”. Le entrate da conversioni sono incluse: una risorsa può attraversare più canali.');
  L.push(`Marchi finali medi ${fmt(mean(gs.flatMap(g => g.econ.map(e => e.final))))}; prima commessa al turno medio ${fmt(mean(gs.flatMap(g => g.firstContract.filter(t => t !== null))))}.`);
  const strikes = gs.flatMap(g => g.strikes || []);
  L.push(`Blocchi individuali ${strikes.filter(e => e.kind === 'worker').length}; fermate complete ${strikes.filter(e => e.kind === 'shutdown').length}. Sono eventi distinti.`);
  L.push('', 'ORDINE DI TURNO — correlazione, non compensazione consigliata');
  const P = Math.max(...gs.map(g => g.results.length));
  for (let seat = 0; seat < P; seat++) {
    const ps = people.filter(p => p.seat === seat);
    L.push(`Posto ${seat + 1}: N=${ps.length}; vittorie ${ps.filter(p => p.won).length}/${ps.length}; PV medi ${fmt(mean(ps.map(p => p.pv)))}.`);
  }
  L.push('Il posto comprende ordine e configurazione iniziale. Un confronto ruotato è necessario per separarli.');
  const measured = gs.filter(g => g.industrial.diagnostics?.version === 1);
  if (!measured.length) return [...L, '', 'Diagnostica temporale non disponibile: queste partite precedono la nuova raccolta. Non è ricostruibile dai soli totali.'];
  if (measured.length !== gs.length) L.push(`Diagnostica temporale disponibile soltanto per ${measured.length}/${gs.length} partite; sezioni seguenti limitate a queste.`);
  const ds = measured.map(g => g.industrial.diagnostics);
  const buys = ds.flatMap(d => d.buys), prods = ds.flatMap(d => d.productions);
  L.push('', 'WELFARE — acquisto, beneficio effettivo, sospensione');
  for (const card of gs[0].industrial.rules.welfareCards) {
    const bought = buys.filter(b => b.policyId === card.id);
    L.push(`${card.name}: ${bought.length} acquisti; turno medio ${bought.length ? fmt(mean(bought.map(b => b.turn))) : '—'}.`);
  }
  const owned = prods.filter(p => p.efficiencyOwned);
  L.push(`Produzioni con efficienza installata: ${owned.length}; con bonus: ${owned.filter(p => p.welfareBonus > 0).length}; bonus sospeso: ${owned.filter(p => p.welfareSuspended).length}. Denominatore: produzioni del reparto dopo l'acquisto, non tutte le produzioni.`);
  L.push(`Risorse aggiuntive Welfare effettive: ${sum(prods.map(p => p.welfareBonus))}. Acquistare Formazione o Accordo non equivale a usare Mensa.`);
  L.push('', 'CAPACITÀ — fabbriche presenti al momento della produzione');
  for (const [label, matches] of [['0–2 fabbriche', p => p.factories <= 2], ['3+ fabbriche', p => p.factories >= 3]]) {
    const ps = prods.filter(matches);
    L.push(`${label}: ${ps.length} produzioni; spinta media ${fmt(mean(ps.map(p => p.intensity)))}; risorse medie ${fmt(mean(ps.map(p => p.resources)))}; spinta oltre i posti iniziali ${ps.filter(p => p.intensity > p.baseCapacity).length}.`);
  }
  const expanded = prods.filter(p => p.capacity > p.baseCapacity);
  L.push(`Reparti con posti ampliati: ${expanded.length} produzioni; con operai installati oltre i posti iniziali ${expanded.filter(p => p.workers > p.baseCapacity).length}; con operai attivi oltre i posti iniziali ${expanded.filter(p => p.active > p.baseCapacity).length}.`);
  L.push('Le risorse per produzione sono immediate, prima di eventuali conversioni opzionali successive. Le fasce 0–2/3+ sono descrittive.');
  L.push('', 'INCROCIO — dimensione finale × uso reale del Welfare produttivo');
  const measuredPeople = people.filter(p => p.g.industrial.diagnostics?.version === 1);
  for (const expanded of [false, true]) for (const used of [false, true]) {
    const ps = measuredPeople.filter(p => (p.factories >= 3) === expanded &&
      p.g.industrial.diagnostics.productions.some(a => a.seat === p.seat && a.welfareBonus > 0) === used);
    const crises = sum(ps.map(p => p.g.industrial.players[p.seat].shutdowns));
    L.push(`${expanded ? '3+' : '0–2'} fabbriche, bonus Welfare ${used ? 'usato' : 'mai usato'}: N=${ps.length}; PV medi ${ps.length ? fmt(mean(ps.map(p => p.pv))) : '—'}; vittorie ${ps.length ? `${ps.filter(p => p.won).length}/${ps.length}` : '—'}; fermate ${crises}.`);
  }
  L.push('Categorie a posteriori: né archetipi certificati né prova che una scelta causi la vittoria.');
  L.push('', 'CRISI — quando si fermano e cosa succede dopo');
  const crises = measured.flatMap(g => g.industrial.diagnostics.crises.map(c => ({ ...c, g })));
  const q = measured[0].industrial.rules.quarterLength;
  const limit = Math.max(...measured.map(g => g.turns));
  for (let lo = 1; lo <= limit; lo += q) {
    const hi = Math.min(limit, lo + q - 1), cs = crises.filter(c => c.turn >= lo && c.turn <= hi);
    const reopened = cs.filter(c => c.restartTurn !== null);
    const resumed = reopened.filter(c => c.g.industrial.diagnostics.productions.some(a => a.seat === c.seat && a.role === c.role && a.turn > c.restartTurn));
    const visits = cs.map(c => c.g.industrial.diagnostics.visits.filter(v => v.seat === c.seat && v.role === c.role && v.turn > c.turn && (c.restartTurn === null || v.turn <= c.restartTurn)));
    L.push(`Fermate nate nei turni ${lo}–${hi}: ${cs.length}; riaperte ${reopened.length}; hanno poi prodotto ${resumed.length}; attesa riapertura ${reopened.length ? fmt(mean(reopened.map(c => c.restartTurn - c.turn))) : '—'} turni propri.`);
    L.push(`  Crisi con successiva visita al Sindacato ${visits.filter(v => v.length).length}; con cassa sufficiente in almeno un arrivo ${visits.filter(v => v.some(x => x.affordable)).length}; ancora aperte alla fine ${cs.length - reopened.length}.`);
  }
  L.push('Cassa rilevata dopo il costo di movimento; denaro sufficiente non implica che riaprire fosse la scelta migliore. Le crisi aperte a fine partita hanno tempo di osservazione incompleto.');
  L.push('', 'CALENDARIO — medie a fine turno personale');
  const points = ds.flatMap(d => d.checkpoints);
  for (const turn of [...new Set(points.map(p => p.turn))].sort((a, b) => a - b)) {
    const ps = points.filter(p => p.turn === turn);
    L.push(`Turno ${turn}: N=${ps.length}; fabbriche ${fmt(mean(ps.map(p => p.factories)))}; operai ${fmt(mean(ps.map(p => p.workers)))} / posti ${fmt(mean(ps.map(p => p.capacity)))}; non bloccati individualmente ${fmt(mean(ps.map(p => p.active)))}; Welfare ${fmt(mean(ps.map(p => p.policies)))}; commesse ${fmt(mean(ps.map(p => p.contracts)))}; filiere ferme ${fmt(mean(ps.map(p => p.closed)))}.`);
  }
  L.push('', `Copertura efficienza: ${pct(owned.length, prods.length)} delle produzioni. Le abilità Formazione e Accordo sono conteggiate come acquisti, non ancora come utilizzi.`,
    'Questa diagnostica non misura il divertimento né la qualità delle scelte finali: serve il confronto al tavolo.');
  return L;
}
