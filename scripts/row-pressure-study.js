// node scripts/row-pressure-study.js [seed=12] [profondità=2]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { studyConfig } from './row-economy-config.js';
import { runOneGame } from '../src/game/batchsim.js';
import { summarizeRowPressure, formatRowPressure } from '../src/game/row-pressure.js';

const n=Number(process.argv[2] || 12), depth=Number(process.argv[3] || 2);
assert.ok(Number.isInteger(n) && n>0 && Number.isInteger(depth) && depth>=0);
const prefix=`reports/cuscinetto-tensione-2026-10-15-d${depth}`;
const oldFile=`reports/welfare-repressione-2026-10-15-d${depth}.json`;
const old=fs.existsSync(oldFile)?JSON.parse(fs.readFileSync(oldFile)).records:[];
const modes=[['Scelta libera','free'],['Senza acquisto welfare','repression']];
const records=[]; let preserved=0;
for(let i=0;i<n;i++) for(const [label,policy] of modes) {
  const cfg=studyConfig(1907+i,2+i%3,policy,depth), g=runOneGame(cfg);
  assert.ok(!g.failed,`${label} seed ${cfg.seed}: partita incompleta`);
  assert.equal(g.turns,28);
  assert.ok(g.rowPressure.unitRows,'Le perdite di risorse richiedono una risorsa per riga');
  assert.equal(g.rowPressure.starts.length,28*cfg.players.length*3,'Fotografie: ogni giocatore/turno/reparto una volta');
  assert.equal(g.rowPressure.productions.length,g.activationLog.length);
  const previous=old.find(r=>r.seed===cfg.seed && r.nPlayers===cfg.players.length && r.scenario===label);
  if(previous) {
    assert.deepEqual(g.activationLog,previous.activations,'La telemetria non deve cambiare le decisioni');
    for(const result of g.results) {
      const p=previous.players.find(p=>p.playerId===result.playerId);
      // Il riferimento è JSON: serializzare anche qui normalizza -0 in 0.
      for(const k of Object.keys(result)) assert.deepEqual(JSON.parse(JSON.stringify(result[k])),p[k],`Risultato invariato ${k}`);
      assert.deepEqual(g.econ[result.playerId],p.econ,'Economia invariata');
    }
    preserved++;
  }
  const people=g.results.map(r=>{
    const id=r.playerId;
    const contacts=g.rowPressure.contacts.filter(c=>c.seat===id);
    const losses=g.rowPressure.productions.filter(a=>a.seat===id && a.modeLostRows>0);
    return { ...r, stats:g.industrial.players[id], tracks:g.tracks[id],
      firstContact:contacts.length?Math.min(...contacts.map(c=>c.turn)):null,
      firstLostProduction:losses.length?Math.min(...losses.map(c=>c.turn)):null,
    };
  });
  records.push({label,seed:cfg.seed,nPlayers:cfg.players.length,people,pressure:g.rowPressure});
  fs.writeFileSync(prefix+'.json',JSON.stringify({depth,preserved,config:studyConfig(1907,3,'free',depth),records}));
  const blocked=g.rowPressure.productions.filter(a=>a.before.blocked>0).length;
  console.log(`${records.length}/${n*modes.length} · ${label} · seed ${cfg.seed} · blocco prima di produrre ${blocked}/${g.activationLog.length}`);
}
const percent=(a,b)=>b?`${(100*a/b).toFixed(1)}%`:'n.d.';
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
const summaries=modes.map(([label])=>{
  const subset=records.filter(r=>r.label===label), people=subset.flatMap(r=>r.people);
  const summary=summarizeRowPressure(subset.map(r=>r.pressure));
  return {label,games:subset.length,players:people.length,...summary,
    everContact:people.filter(p=>p.firstContact!==null).length,
    everLost:people.filter(p=>p.firstLostProduction!==null).length,
    withoutRecovery:people.filter(p=>!p.stats.repressions && !p.stats.sustainableProductions).length,
    withoutRecoveryOrLoss:people.filter(p=>!p.stats.repressions && !p.stats.sustainableProductions && p.firstLostProduction===null).length,
    firstContacts:people.filter(p=>p.firstContact!==null).map(p=>p.firstContact),
    firstLosses:people.filter(p=>p.firstLostProduction!==null).map(p=>p.firstLostProduction),
    byTableSize:[2,3,4].map(size=>({size,...summarizeRowPressure(subset.filter(r=>r.nPlayers===size).map(r=>r.pressure))})),
    perPlayer:people.map(p=>({seat:p.playerId,firstContact:p.firstContact,firstLoss:p.firstLostProduction})),
    pv:mean(people.map(p=>p.total)),
  };
});
const lines=[
  'OFFICINA 1907 — QUANTO PESA IL CUSCINETTO DELLA TENSIONE',
  `${records.length} partite complete; ${n} seed appaiati per condizione; IA ${depth?`rollout d${depth}`:'greedy'}, 28 turni/giocatore, tavoli 2/3/4.`,
  'Regole, prezzi, carte e IA identici al confronto Welfare 1. Solo osservazione aggiunta al runner, esterna allo stato di gioco e ai rollout.',
  `${preserved} partite confrontate con i dati già salvati: identici eventi di produzione, punteggi e contabilità.`,
  'Scelta libera è il campione principale. Senza acquisto welfare è una politica dell’IA già usata nel confronto precedente: stesse regole, l’agente rinuncia a comprare welfare. Repressione resta disponibile.',
  'Una risorsa per riga nel template di prova. Macchinari, commesse, movimento e obiettivi restano attivi. Nessun obbligo di finire a tensione zero.', '',
];
for(const s of summaries) {
  const subset=records.filter(r=>r.label===s.label);
  lines.push(s.label.toUpperCase(),`${s.games} partite; ${s.players} giocatori-partita.`,
    ...formatRowPressure(subset.map(r=>r.pressure)),
    `Giocatori che incontrano almeno una riga bloccata: ${s.everContact}/${s.players}; con almeno una perdita effettiva in produzione: ${s.everLost}/${s.players}.`,
    `Giocatori senza repressione né produzione sostenibile: ${s.withoutRecovery}/${s.players}; fra questi, ${s.withoutRecoveryOrLoss} non perdono risorse per blocco delle righe nelle produzioni effettuate.`,
    `Primo incontro medio fra i soli interessati: turno ${s.firstContacts.length ? mean(s.firstContacts).toFixed(1) : 'n.d.'}; prima perdita produttiva media fra i soli interessati: turno ${s.firstLosses.length ? mean(s.firstLosses).toFixed(1) : 'n.d.'}.`,
    'Per sviluppo al momento della produzione:',
    ...s.byDevelopment.map(d=>`  ${d.rows} righe sviluppate: ${d.blockedBefore}/${d.n} produzioni con blocco (${percent(d.blockedBefore,d.n)}); perdita ${d.lost}/${d.potential}.`),
    'Per numero di giocatori:',
    ...s.byTableSize.map(x=>`  ${x.size} giocatori: ${x.all.blockedBefore}/${x.all.n} produzioni con blocco (${percent(x.all.blockedBefore,x.all.n)}); perdita ${x.all.lost}/${x.all.potential}.`),
    '',
  );
}
lines.push('LIMITI',
  'Le perdite sono locali: quante risorse del tracciato avrebbe reso la stessa modalità produttiva, allo stesso sviluppo, con tensione zero. Non vengono simulate scelte alternative né stimate commesse/PV persi.',
  'Il blocco strutturale conta tutte le righe sviluppate coperte; una produzione sostenibile può avere blocchi strutturali senza perdere la sua unica riga utilizzabile. La rinuncia volontaria alle altre righe accessibili è separata.',
  'Le fotografie a inizio turno comprendono solo reparti con almeno un operaio attivo nelle percentuali. I primi contatti rilevano anche righe bloccate dopo una produzione o un’assunzione.',
  'Ripetere una sequenza nota è un controllo di invariabilità, non un nuovo campione indipendente. I seed sono dodici per condizione; le singole produzioni della stessa partita non sono campioni indipendenti.',
  'Basso danno osservato non dimostra irrilevanza strategica: prevenzione, uso degli altri reparti e rinuncia a produrre possono evitarlo. Nessuna modifica delle regole effettuata.',
);
fs.writeFileSync(prefix+'.txt',lines.join('\n'));
fs.writeFileSync(prefix+'-summary.json',JSON.stringify(summaries,null,2));
console.log(lines.join('\n'));
