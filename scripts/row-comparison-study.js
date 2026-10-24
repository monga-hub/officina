// node scripts/row-comparison-study.js [numero seed=6] [offset=0] [depth=6]
// node scripts/row-comparison-study.js report [depth=6] [offset...]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { initGame } from '../src/game/engine.js';
import { runOneGame } from '../src/game/batchsim.js';
import { summarizeRowPressure, formatRowPressure } from '../src/game/row-pressure.js';
import { comparisonConfig, responsesToBlocks, responseSummary } from './row-comparison-analysis.js';

const reportOnly=process.argv[2]==='report';
const depth=Number(reportOnly ? process.argv[3]||6 : process.argv[4]||6);
const prefix=`reports/confronto-4-6-righe-2026-10-15-d${depth}`;
let records=[];
if (!reportOnly) {
  const n=Number(process.argv[2]||6), offset=Number(process.argv[3]||0);
  assert.ok(Number.isInteger(n)&&n>0&&Number.isInteger(offset)&&offset>=0&&Number.isInteger(depth)&&depth>=0);
  for(let i=offset;i<offset+n;i++) {
    const configs=[6,4].map(rows=>comparisonConfig(1907+i,2+i%3,rows,depth));
    const omitTracks=({tracks,trackModel,...rest})=>rest;
    assert.deepEqual(omitTracks(configs[0]),omitTracks(configs[1]),'Solo modello e lunghezza del tracciato cambiano');
    const starts=configs.map(initGame);
    assert.deepEqual(starts[0].banks,starts[1].banks,'Stesso ordine iniziale dei mazzi');
    for(let j=0;j<2;j++) {
      const cfg=configs[j], rows=j===0?6:4, start=Date.now(), g=runOneGame(cfg);
      assert.ok(!g.failed); assert.equal(g.turns,28); assert.ok(g.rowPressure.unitRows);
      assert.equal(g.rowPressure.starts.length,28*cfg.players.length*3);
      assert.equal(g.rowPressure.productions.length,g.activationLog.length);
      assert.ok(g.rowPressure.recoveries.filter(a=>a.type==='repression').every(a=>a.reduction===Math.min(2,a.before.tension)));
      const people=g.results.map(p=>({...p,stats:g.industrial.players[p.playerId],econ:g.econ[p.playerId],tracks:g.tracks[p.playerId]}));
      records.push({rows,seed:cfg.seed,players:cfg.players.length,config:cfg,people,pressure:g.rowPressure,
        responses:responsesToBlocks(g.rowPressure),elapsedMs:Date.now()-start});
      fs.writeFileSync(`${prefix}-part${offset}.json`,JSON.stringify({depth,records}));
      console.log(`${records.length}/${n*2} · ${rows} righe · seed ${cfg.seed} · ${((Date.now()-start)/1000).toFixed(1)} s · ${g.rowPressure.productions.filter(a=>a.before.blocked).length}/${g.activationLog.length} produzioni con blocco`);
    }
  }
} else {
  const offsets=process.argv.slice(4).map(Number);
  assert.ok(offsets.length>0,'Specificare gli offset dei file da aggregare');
  records=offsets.flatMap(o=>JSON.parse(fs.readFileSync(`${prefix}-part${o}.json`)).records);
  assert.equal(new Set(records.map(r=>`${r.seed}:${r.rows}`)).size,records.length,'Nessuna partita duplicata');
  for(const seed of new Set(records.map(r=>r.seed))) assert.equal(records.filter(r=>r.seed===seed).length,2,'Ogni seed appaiato');
  const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
  const summaries=[6,4].map(rows=>{
    const rs=records.filter(r=>r.rows===rows), ps=rs.flatMap(r=>r.people), eps=rs.flatMap(r=>r.responses);
    return {rows,games:rs.length,players:ps.length,pressure:summarizeRowPressure(rs.map(r=>r.pressure)),
      lastTurnContacts:eps.filter(e=>e.remaining===0).length,
      responses:responseSummary(eps.filter(e=>e.remaining>0)),
      earlyResponses:responseSummary(eps.filter(e=>e.remaining>=7)),
      totalRepressions:ps.reduce((n,p)=>n+p.stats.repressions,0),repressionUsers:ps.filter(p=>p.stats.repressions>0).length,
      maxRepressions:Math.max(...ps.map(p=>p.stats.repressions)),
      means:Object.fromEntries(['repressions','sustainableProductions','welfareBuys','welfareSpent','repressionSpent'].map(k=>[k,mean(ps.map(p=>p.stats[k]))])),
      meanPV:mean(ps.map(p=>p.total)),meanContracts:mean(ps.map(p=>p.nContracts)),
      meanProductions:rs.reduce((n,r)=>n+r.pressure.productions.length,0)/ps.length,
      cappedDepartments:ps.flatMap(p=>p.tracks.pos).filter(p=>p===rows*4).length,
      byTableSize:[2,3,4].map(n=>({players:n,...summarizeRowPressure(rs.filter(r=>r.players===n).map(r=>r.pressure))})),
    };
  });
  for(const s of summaries) {
    for(const r of [s.responses,s.earlyResponses]) {
      assert.equal(Object.values(r.next).reduce((a,b)=>a+b,0),r.n);
      assert.equal(r.returned+r.neverProducedAgain,r.n);
    }
    assert.equal(s.totalRepressions,s.pressure.recoveries.find(r=>r.type==='repression').n);
  }
  const lines=[
    'OFFICINA 1907 — CONFRONTO 4 E 6 RIGHE, REPRESSIONE −2',
    `${records.length} partite complete, ${records.length/2} seed appaiati, IA rollout d${depth} r1, 28 turni per giocatore; tavoli da 2, 3, 4 giocatori.`,
    'Scelta libera per tutte le IA. Stessi prezzi, carte, commesse, regole e funzione di valutazione; nessun obbligo di recuperare o di cambiare reparto.',
    'Entrambi i tracciati: 4 caselle per riga, una risorsa alla prima casella. 6 righe = 24 passi / tensione massima 6; 4 righe = 16 passi / tensione massima 4. Recupero repressione sempre −2, sostenibile sempre −1.',
    'Lo stesso seed conserva gli ordini iniziali dei mazzi; i mercati incontrati possono divergere in seguito alle scelte. Il taglio delle righe cambia anche capacità massima e soglia di copertura totale: non è un isolamento del solo margine iniziale.',
    '',
  ];
  for(const s of summaries) {
    lines.push(`${s.rows} RIGHE — ${s.games} partite, ${s.players} giocatori-partita`,
      ...formatRowPressure(records.filter(r=>r.rows===s.rows).map(r=>r.pressure)),
      `Repressioni: ${s.totalRepressions}, usate da ${s.repressionUsers}/${s.players} giocatori; media ${s.means.repressions.toFixed(2)} in 28 turni, massimo individuale ${s.maxRepressions}.`,
      `Reparti al tetto di sviluppo a fine partita: ${s.cappedDepartments}/${s.players*3}.`,
      `Medie per giocatore: produzioni ${s.meanProductions.toFixed(2)}, sostenibili ${s.means.sustainableProductions.toFixed(2)}, acquisti welfare ${s.means.welfareBuys.toFixed(2)}, spesa welfare ${s.means.welfareSpent.toFixed(2)}, spesa repressione ${s.means.repressionSpent.toFixed(2)}, commesse ${s.meanContracts.toFixed(2)}, PV ${s.meanPV.toFixed(2)}.`,
      `Primi blocchi nell’ultimo turno, esclusi dalle risposte: ${s.lastTurnContacts}.`);
    for(const [label,r] of [['Primo blocco entro il turno 27',s.responses],['Primo blocco entro il turno 21 (almeno 7 turni successivi)',s.earlyResponses]]) {
      lines.push(`${label}: ${r.n} reparti; turno medio ${r.firstTurn?.toFixed(1) ?? 'n.d.'}.`,
        `  Prima successiva scelta fra produzione e repressione: recupera quel reparto ${r.next.recupera}; produce in un altro ${r.next.produce_altro}; produce ancora nello stesso senza ridurne tensione ${r.next.produce_stesso}; reprime un altro ${r.next.recupera_altro}; nessuna successiva ${r.next.nessuna}.`,
        `  Entro fine partita (categorie sovrapponibili): recupera quel reparto ${r.recovered}; torna a produrvi ${r.returned}, di cui ${r.returnedWithoutRecovery} senza mai recuperarlo; non vi produce più ${r.neverProducedAgain}, di cui ${r.neverProducedAgainButOther} continuano a produrre altrove.`);
    }
    lines.push('');
  }
  lines.push('DEFINIZIONI E LIMITI',
    'Una osservazione per giocatore/reparto, al primo blocco di almeno una riga sviluppata. Il blocco può nascere dopo produzione o assunzione. Se nasce all’ultimo turno non c’è una normale occasione successiva di reagire.',
    'Recupera = repressione o produzione sostenibile che riduce effettivamente la tensione di quel reparto. La prima scelta osservata può essere preceduta da assunzioni, investimenti, commesse o altre azioni.',
    'Non vi produce più descrive un mancato ritorno produttivo, non prova un abbandono deliberato. Produrre altrove non prova che sia stato il blocco a causare lo spostamento (anche il movimento obbliga a cambiare nodo).',
    'Le risorse perse sono il confronto locale della modalità scelta con tensione zero; la rinuncia volontaria alla resa nella produzione sostenibile è separata. I PV sono descrittivi, non una misura della qualità del gioco.',
    'I seed appaiati sono le repliche; giocatori, reparti e produzioni nella stessa partita non sono osservazioni indipendenti. L’IA d6 usa continuazioni greedy e la stessa euristica in entrambe le varianti: non equivale a gioco ottimale né a playtest umano.');
  fs.writeFileSync(prefix+'.json',JSON.stringify({depth,records}));
  fs.writeFileSync(prefix+'-summary.json',JSON.stringify(summaries,null,2));
  fs.writeFileSync(prefix+'.txt',lines.join('\n'));
  console.log(lines.join('\n'));
}
