// Partite complete, stessi seed e posti; i vincoli sono sull'agente, non sulle regole.
// node scripts/row-economy-study.js [seed=12] [profondità=2] [prefisso-report]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { studyConfig } from './row-economy-config.js';
import { runOneGame } from '../src/game/batchsim.js';

const n = Math.max(1, Number(process.argv[2]) || 12), depth = Number(process.argv[3]) || 0;
const prefix = process.argv[4] || `reports/welfare-repressione-2026-10-15-d${depth}`;
const scenarios = [
  { label: 'Scelta libera', policy: 'free' },
  { label: 'Senza acquisto welfare', policy: 'repression' },
  { label: 'Senza repressione', policy: 'welfare' },
];
const records = [], started = Date.now();
const sum = xs => xs.reduce((a,b) => a+b,0);
const avg = xs => xs.length ? sum(xs)/xs.length : 0;
for (let i=0; i<n; i++) for (const scenario of scenarios) {
  const cfg = studyConfig(1907+i, 2+i%3, scenario.policy, depth);
  const g = runOneGame(cfg);
  assert.ok(!g.failed, `Partita incompleta: ${scenario.label}, ${cfg.seed}`);
  assert.equal(g.turns, 28);
  for (const e of g.econ) assert.equal(e.start+e.gained-sum(Object.values(e.by)), e.final, 'contabilità marchi');
  const players = g.results.map(r => {
    const id=r.playerId, p=g.industrial.players[id], acts=g.activationLog.filter(a=>a.seat===id), econ=g.econ[id];
    return { ...r, ...p, econ, tracks:g.tracks[id], resources:sum(Object.values(g.resGen[id])),
      activations:g.activations[id], peaks:acts.length ? Math.max(...acts.map(a=>a.tensionAfter)) : 0,
      blockedProductions:acts.filter(a=>a.tensionBefore===6).length,
      nodeVisits:g.nodeVisits[id], contracts:g.contracts[id],
    };
  });
  records.push({ scenario:scenario.label, seed:cfg.seed, nPlayers:cfg.players.length, players, activations:g.activationLog });
  fs.writeFileSync(prefix+'.json', JSON.stringify({ depth, config:studyConfig(1907,3,'free',depth), scenarios, records },null,2));
  console.log(`${records.length}/${n*scenarios.length}: ${scenario.label}, seed ${cfg.seed}, PV ${players.map(p=>p.total).join('/')}, commesse ${sum(players.map(p=>p.nContracts))}, welfare ${sum(players.map(p=>p.welfareBuys))}, repressioni ${sum(players.map(p=>p.repressions))}`);
}
const summary = scenarios.map(sc => {
  const games=records.filter(r=>r.scenario===sc.label), people=games.flatMap(g=>g.players);
  return { scenario:sc.label, games:games.length, players:people.length,
    pv:avg(people.map(p=>p.total)), pvContracts:avg(people.map(p=>p.pvContracts)), pvRace:avg(people.map(p=>p.pvRace)), contracts:avg(people.map(p=>p.nContracts)),
    resources:avg(people.map(p=>p.resources)), cash:avg(people.map(p=>p.coins)),
    welfare:avg(people.map(p=>p.welfareBuys)), repression:avg(people.map(p=>p.repressions)),
    sustainable:avg(people.map(p=>p.sustainableProductions)), activations:avg(people.map(p=>p.activations)),
    welfareSpent:avg(people.map(p=>p.welfareSpent)), repressionSpent:avg(people.map(p=>p.repressionSpent)),
    contractCash:avg(people.map(p=>p.econ.src.commessa)),
    machineCash:avg(people.map(p=>sum(Object.entries(p.econ.src).filter(([k])=>k.startsWith('lav')).map(([,v])=>v)))),
    noWelfare:people.filter(p=>!p.welfareBuys).length, noRepression:people.filter(p=>!p.repressions).length,
    tensionAtLeast4:people.filter(p=>p.peaks>=4).length,
    developedRows:avg(people.flatMap(p=>p.tracks.pos.map(pos=>Math.ceil(pos/4)))),
  };
});
const lines = [
  '# Welfare 1 e repressione — simulatore Officina 1907', '',
  `${records.length} partite complete, 28 turni per giocatore, ${n} seed appaiati per condizione, tavoli 2/3/4. IA ${depth ? `rollout d${depth}, una continuazione deterministica` : 'greedy'}.`,
  'Tutti gli agenti neutri. Confronto tra tavoli con diverse possibilità dell’IA, non scontro fra archetipi né stima di probabilità di vittoria. I vincoli impediscono una scelta, non obbligano a comprare o reprimere.', '',
  'Parametri: sei righe di quattro celle, una risorsa alla prima cella di ogni riga; riga intera sbloccata all’ingresso; sviluppo del valore stampato. Welfare 1 = 3 marchi e un turno, produzione di una riga accessibile con −1 tensione. Repressione = −2, prezzo 2 + numero di precedenti interventi del giocatore. Commesse +2/3/4 marchi. Macchinari: rendite fisse in marchi, scambi conservati; una attivazione anche in sostenibile. Nessun limite Sopra; Sotto conserva gli slot configurati. Città, movimento, mercati, commesse e obiettivi di gara del simulatore restano attivi. Mappa fabbriche, rendite automatiche delle commesse e premio reparto completo sospesi.', '',
  '| Condizione | PV | Commesse | Risorse prodotte | Marchi finali | Welfare acquistati | Repressioni | Produzioni sostenibili |',
  '|---|---:|---:|---:|---:|---:|---:|---:|',
  ...summary.map(s=>`| ${s.scenario} | ${[s.pv,s.contracts,s.resources,s.cash,s.welfare,s.repression,s.sustainable].map(v=>v.toFixed(2)).join(' | ')} |`), '',
  'Valori medi per giocatore. Nessun recupero obbligatorio a fine partita. Cassa controllata a ogni azione dal motore; bilancio finale verificato.', '',
  '## Diagnostica', ...summary.map(s=>`- ${s.scenario}: ${s.tensionAtLeast4}/${s.players} giocatori arrivano a tensione ≥4; ${s.noRepression}/${s.players} non reprimono; ${s.noWelfare}/${s.players} non acquistano welfare. Righe sviluppate medie per reparto: ${s.developedRows.toFixed(2)}. PV commesse ${s.pvContracts.toFixed(2)}, PV obiettivi di gara ${s.pvRace.toFixed(2)}. Marchi macchinari ${s.machineCash.toFixed(2)}, commesse ${s.contractCash.toFixed(2)}, spesa welfare ${s.welfareSpent.toFixed(2)}, repressione ${s.repressionSpent.toFixed(2)}.`), '',
  'L’IA usa una stima del valore futuro degli investimenti; questi risultati descrivono il suo comportamento. Nessuna conclusione di bilanciamento se una delle meccaniche non è usata abbastanza. Le scelte su carte, prezzi e premi sono parametri sperimentali.',
];
fs.writeFileSync(prefix+'.md', lines.join('\n'));
fs.writeFileSync(prefix+'-summary.json', JSON.stringify(summary,null,2));
fs.writeFileSync(prefix+'-config.json', JSON.stringify(studyConfig(1907,3,'free',depth),null,2));
console.log(JSON.stringify(summary,null,2));
console.log(`Secondi: ${((Date.now()-started)/1000).toFixed(1)}; report ${prefix}.md`);
