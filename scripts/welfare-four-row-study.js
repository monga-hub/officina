// Run: node scripts/welfare-four-row-study.js run [part=0] [parts=2]
// Report: node scripts/welfare-four-row-study.js report [parts=2]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { runOneGame } from '../src/game/batchsim.js';
import { investmentUses, pairedMetrics, fixedScheduleYield } from './welfare-use-analysis.js';

const source='reports/confronto-4-6-righe-2026-10-15-d6.json';
const baseline=JSON.parse(fs.readFileSync(source)).records.filter(r=>r.rows===4);
assert.equal(baseline.length,12);
for(const r of baseline) {
  assert.equal(r.config.trackModel,'righe4corte');
  assert.deepEqual(r.config.aiRollout,{depth:6,rollouts:1});
  assert.ok(r.config.players.every(p=>p.aiRecovery==='free'));
}
const trials=baseline.flatMap(r=>r.people.filter(p=>p.stats.welfareBuys>0).sort((a,b)=>a.playerId-b.playerId).map(p=>({seed:r.seed,seat:p.playerId})));
const prefix='reports/welfare-4-righe-2026-10-15-d6';
const mode=process.argv[2]||'run';
if(mode==='run') {
  const part=Number(process.argv[3]||0), parts=Number(process.argv[4]||2);
  assert.ok(Number.isInteger(parts)&&parts>0&&Number.isInteger(part)&&part>=0&&part<parts);
  const chosen=trials.filter((_,i)=>i%parts===part), records=[];
  for(const trial of chosen) {
    const original=baseline.find(r=>r.seed===trial.seed), cfg=structuredClone(original.config);
    cfg.players[trial.seat].aiRecovery='repression';
    const {players,...rules}=cfg, {players:oldPlayers,...oldRules}=original.config;
    assert.deepEqual(rules,oldRules,'Tutte le regole e l’IA d6 restano identiche');
    assert.ok(players.every((p,i)=>p.aiRecovery===(i===trial.seat?'repression':'free')));
    const start=Date.now(), game=runOneGame(cfg);
    assert.ok(!game.failed);assert.equal(game.turns,28);
    assert.equal(game.industrial.players[trial.seat].welfareBuys,0);
    assert.equal(game.industrial.players[trial.seat].sustainableProductions,0);
    assert.ok(game.rowPressure.recoveries.filter(a=>a.type==='repression').every(a=>a.reduction===Math.min(2,a.before.tension)));
    const record={...trial,rows:4,players:players.length,config:cfg,pressure:game.rowPressure,
      people:game.results.map(p=>({...p,stats:game.industrial.players[p.playerId],econ:game.econ[p.playerId],tracks:game.tracks[p.playerId]})),
      elapsedMs:Date.now()-start};
    record.pair=pairedMetrics(original,record,trial.seat);
    records.push(record);
    fs.writeFileSync(`${prefix}-part${part}.json`,JSON.stringify({source,part,parts,records}));
    console.log(`${records.length}/${chosen.length} · seed ${trial.seed}, giocatore ${trial.seat+1} · ${((Date.now()-start)/1000).toFixed(1)} s · PV welfare/libero ${record.pair.withWelfare.pv}, senza acquisto ${record.pair.withoutWelfare.pv}`);
  }
} else if(mode==='report') {
  const parts=Number(process.argv[3]||2);
  const records=Array.from({length:parts},(_,i)=>JSON.parse(fs.readFileSync(`${prefix}-part${i}.json`)).records).flat();
  assert.deepEqual(records.map(r=>`${r.seed}:${r.seat}`).sort(),trials.map(r=>`${r.seed}:${r.seat}`).sort());
  const investments=baseline.flatMap(investmentUses);
  const fixedSchedule=baseline.flatMap(fixedScheduleYield);
  const reuse=[{label:'0–2 produzioni successive',min:0,max:2},{label:'3+ produzioni successive',min:3,max:Infinity}].map(group=>{
    const selected=investments.filter(i=>i.productionsAfter>=group.min&&i.productionsAfter<=group.max);
    const effects=selected.map(i=>fixedSchedule.find(e=>e.seed===i.seed&&e.seat===i.seat&&e.role===i.role));
    return {label:group.label,n:selected.length,positive:effects.filter(e=>e.difference>0).length,netResources:effects.reduce((n,e)=>n+e.difference,0)};
  });
  const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
  const sum=(xs,k)=>xs.reduce((n,x)=>n+x[k],0);
  const keys=Object.keys(records[0].pair.withWelfare);
  const average=which=>Object.fromEntries(keys.map(k=>[k,mean(records.map(r=>r.pair[which][k]))]));
  const bySeed=baseline.map(b=>{
    const rs=records.filter(r=>r.seed===b.seed);
    return {seed:b.seed,n:rs.length,difference:Object.fromEntries(keys.map(k=>[k,mean(rs.map(r=>r.pair.difference[k]))]))};
  });
  const summary={source,baselineGames:baseline.length,counterfactualGames:records.length,reuse,
    fixedSchedule:{positive:fixedSchedule.filter(x=>x.difference>0).length,zero:fixedSchedule.filter(x=>x.difference===0).length,
      negative:fixedSchedule.filter(x=>x.difference<0).length,extraTrackResources:sum(fixedSchedule,'difference')},
    use:{investments:investments.length,unused:investments.filter(i=>i.uses===0).length,
      once:investments.filter(i=>i.uses===1).length,repeated:investments.filter(i=>i.uses>=2).length,
      cost:sum(investments,'cost'),uses:sum(investments,'uses'),tensionReduced:sum(investments,'tensionReduced'),
      preventiveAtZero:sum(investments,'preventiveAtZero'),tensionAdvantage:sum(investments,'tensionAdvantage'),
      reopened:sum(investments,'reopened'),foregoneResources:sum(investments,'foregoneResources'),
      trackResources:sum(investments,'trackResources'),
      purchaseTurn:mean(investments.map(i=>i.turn)),unusedEarly:investments.filter(i=>i.uses===0&&i.turn<=14).length},
    withWelfare:average('withWelfare'),withoutWelfare:average('withoutWelfare'),difference:average('difference'),
    betterWith:records.filter(r=>r.pair.difference.pv>0).length,
    tied:records.filter(r=>r.pair.difference.pv===0).length,
    worseWith:records.filter(r=>r.pair.difference.pv<0).length,
    seedWeightedDifference:Object.fromEntries(keys.map(k=>[k,mean(bySeed.map(s=>s.difference[k]))])),
    bySeed,
    byUse:[true,false].map(used=>{
      const rs=records.filter(r=>(r.pair.withWelfare.sustainable>0)===used);
      return {used,n:rs.length,pvDifference:mean(rs.map(r=>r.pair.difference.pv))};
    }),
  };
  assert.equal(summary.use.uses,baseline.flatMap(b=>b.people).reduce((n,p)=>n+p.stats.sustainableProductions,0));
  assert.equal(summary.use.cost,baseline.flatMap(b=>b.people).reduce((n,p)=>n+p.stats.welfareSpent,0));
  const f=x=>x.toFixed(2), u=summary.use;
  const lines=[
    'OFFICINA 1907 — WELFARE CON QUATTRO RIGHE, REPRESSIONE −2',
    `12 partite libere già eseguite a d6 r1; ${records.length} nuove ripetizioni, una per ogni giocatore che aveva acquistato welfare.`,
    'In ciascuna ripetizione solo quel giocatore rinuncia agli acquisti welfare. Gli avversari mantengono scelta libera. Stessi seed, posti, mazzi iniziali, prezzi e regole; le azioni successive e i mercati possono divergere.',
    'Quattro righe da quattro caselle, una risorsa per riga; 28 turni per giocatore. Welfare: 3 marchi e un’azione per reparto; produzione sostenibile su una riga, tensione −1. Repressione: −2, costo personale crescente 2/3/4… marchi.',
    '', 'USO DEGLI INVESTIMENTI NELLE PARTITE LIBERE',
    `${u.investments} acquisti, ${u.cost} marchi e ${u.investments} azioni di investimento. ${u.unused} acquisti mai utilizzati, ${u.once} usati una volta, ${u.repeated} almeno due volte.`,
    `${u.unusedEarly} acquisti mai usati erano stati fatti entro il turno 14.`,
    `${u.uses} produzioni sostenibili: ${u.tensionReduced} passi effettivamente recuperati; ${u.preventiveAtZero} usi a tensione zero evitano comunque l’aumento della produzione intensa.`,
    `${u.tensionAdvantage} passi di vantaggio cumulato locale rispetto a produzioni intense negli stessi stati (non sono recuperi risparmiati misurati in partita).`,
    `${u.reopened} righe già bloccate riaperte; ${u.foregoneResources} risorse accessibili non prodotte per la scelta sostenibile; ${u.trackResources} risorse incassate dal tracciato durante le produzioni sostenibili.`,
    'I macchinari si attivano in entrambe le modalità: i loro incassi non sono un bonus esclusivo del welfare.',
    '', 'EFFETTO SUL SOLO TRACCIATO, A CALENDARIO FISSO',
    `Sostituendo le produzioni sostenibili con intense e conservando sviluppo, tempi e repressioni osservati: ${summary.fixedSchedule.positive} investimenti migliorano la resa totale del reparto, ${summary.fixedSchedule.zero} la lasciano invariata, ${summary.fixedSchedule.negative} la riducono. Saldo: ${summary.fixedSchedule.extraTrackResources} risorse in più con welfare.`,
    'Questa ricostruzione isola la gestione della tensione e include la minore resa immediata sostenibile. Non è una partita alternativa economicamente validata: non cambia commesse, scambi, movimento, investimenti o recuperi. Il confronto completo segue sotto.',
    ...reuse.map(g=>`${g.label}: ${g.n} investimenti, ${g.positive} con maggiore resa netta del tracciato a calendario fisso. Fasce descrittive del campione, non soglie di convenienza garantite.`),
    '', 'CONFRONTO INDIVIDUALE — MEDIE DEI 31 ACQUIRENTI',
    'Voce | Welfare disponibile e acquistato | Stesso giocatore senza acquisto | Differenza a favore del welfare',
    ...keys.map(k=>`${k} | ${f(summary.withWelfare[k])} | ${f(summary.withoutWelfare[k])} | ${f(summary.difference[k])}`),
    `PV: welfare migliore in ${summary.betterWith} confronti, pari in ${summary.tied}, peggiore in ${summary.worseWith}. Queste non sono percentuali di vittoria al tavolo.`,
    `Media delle differenze PV dando ugual peso a ciascun seed: ${f(summary.seedWeightedDifference.pv)}.`,
    ...summary.byUse.map(g=>`${g.used?'Acquirenti che usano almeno una volta il welfare':'Acquirenti che non usano mai il welfare'}: ${g.n}; differenza media PV ${f(g.pvDifference)}.`),
    'Le differenze di punteggio anche fra chi non usa mai la capacità mostrano quanto pesino le sequenze alternative di decisioni. Il vantaggio medio complessivo non può essere attribuito interamente al recupero sostenibile.',
    '', 'DIFFERENZE MEDIE PV PER SEED (welfare meno senza acquisto)',
    ...bySeed.map(s=>`${s.seed}: ${f(s.difference.pv)} (${s.n} giocatori confrontati)`),
    '', 'LIMITI',
    'È un confronto della politica dell’IA con o senza accesso agli acquisti, non la prova del valore ottimale del welfare né del singolo acquisto. Nel ramo alternativo possono cambiare anche le decisioni e i risultati degli avversari.',
    'Il campione include tutti gli acquirenti delle dodici partite di riferimento. Non confronta persone diverse che spontaneamente scelgono strategie diverse. Le ripetizioni dello stesso seed e le produzioni della stessa partita non sono indipendenti.',
    'd6 usa continuazioni greedy e un valore euristico esplicito per il welfare. Se questo valore spinge ad acquisti non sfruttati, il risultato può denunciare un limite dell’IA oltre che del design. Nessuna euristica o regola è stata modificata.',
    'Gli acquisti mai usati non hanno erogato il beneficio produttivo previsto; non si assegna un valore certo in PV all’azione sacrificata. Le differenze complessive includono i costi monetari e le occasioni perse attraverso la partita completa.',
  ];
  fs.writeFileSync(prefix+'.json',JSON.stringify({source,baseline,investments,fixedSchedule,records,summary}));
  fs.writeFileSync(prefix+'-summary.json',JSON.stringify(summary,null,2));
  fs.writeFileSync(prefix+'.txt',lines.join('\n'));
  console.log(lines.join('\n'));
} else throw new Error('Modalità run o report');
