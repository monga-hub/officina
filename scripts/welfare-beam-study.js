// node scripts/welfare-beam-study.js run PART PARTS; node scripts/welfare-beam-study.js report PARTS
// Separate processes only: the engine owns a global worker-card lookup.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { runOneGame } from '../src/game/batchsim.js';
import { comparisonConfig } from './row-comparison-analysis.js';
import { investmentUses, pairedMetrics, playerMetrics, fixedScheduleYield } from './welfare-use-analysis.js';

const source='reports/ia-continuazioni-2026-10-16-d6.json';
const prefix='reports/welfare-nuova-ia-2026-10-16-d6';
const saved=JSON.parse(fs.readFileSync(source));
const fingerprint=()=>Object.fromEntries(Object.keys(saved.fingerprint).map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(`src/game/${p}`)).digest('hex')]));
assert.deepEqual(fingerprint(),saved.fingerprint,'Baseline riutilizzabile solo con identico motore e IA');
const baseline=saved.records.filter(r=>r.group!=='mixed'&&r.versions.every(v=>v==='beam2'));
assert.equal(baseline.length,12);
for(const b of baseline) {
  assert.equal(b.config.trackModel,'righe4corte');
  assert.deepEqual(b.config.aiRollout,{depth:6,rollouts:1});
  assert.ok(b.config.players.every(p=>p.aiRecovery==='free'&&p.aiContinuation==='beam2'&&p.aiEvaluation==='baseline'));
}
const jobs=baseline.flatMap(b=>b.people.filter(p=>p.stats.welfareBuys>0).sort((a,b)=>a.playerId-b.playerId)
  .map(p=>({kind:'ablation',seed:b.seed,seat:p.playerId,group:b.group})));
assert.equal(jobs.length,32);
// Fixed before observing results: three fresh seeds, both seat assignments.
for(let seed=9907;seed<=9909;seed++) for(const policies of [['welfare','repression'],['repression','welfare']]) jobs.push({kind:'direct',seed,policies});
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:null;
const median=xs=>{const a=[...xs].sort((a,b)=>a-b);return (a[Math.floor((a.length-1)/2)]+a[Math.floor(a.length/2)])/2;};
const sum=(xs,k)=>xs.reduce((s,x)=>s+x[k],0);
const averages=ps=>Object.fromEntries(Object.keys(ps[0]).map(k=>[k,mean(ps.map(p=>p[k]))]));
const financialMetrics=(record,seat)=>{
  const m=playerMetrics(record,seat),e=record.people.find(p=>p.playerId===seat).econ;
  return {...m,recoveryActions:m.welfareBuys+m.repressions,exchangeCoins:e.src.scambio,
    totalIncome:e.gained,totalSpent:Object.values(e.by).reduce((a,b)=>a+b,0)};
};

if(process.argv[2]==='run') {
  const part=Number(process.argv[3]||0),parts=Number(process.argv[4]||4);
  assert.ok(Number.isInteger(parts)&&parts>0&&Number.isInteger(part)&&part>=0&&part<parts);
  const selected=jobs.filter((_,i)=>i%parts===part),records=[];
  for(const job of selected) {
    const original=baseline.find(b=>b.seed===job.seed);
    const cfg=job.kind==='ablation'?structuredClone(original.config):comparisonConfig(job.seed,2,4,6);
    cfg.players=cfg.players.map((p,i)=>({...p,aiEvaluation:'baseline',aiContinuation:'beam2',
      aiRecovery:job.kind==='ablation'?(i===job.seat?'repression':'free'):job.policies[i]}));
    if(original) {
      const strip=c=>({...c,players:c.players.map(({aiRecovery,...p})=>p)});
      assert.deepEqual(strip(cfg),strip(original.config));
    }
    const start=performance.now(),g=runOneGame(cfg),elapsedMs=performance.now()-start;
    assert.ok(!g.failed);assert.equal(g.turns,28);assert.ok(g.rowPressure.unitRows);
    assert.equal(g.rowPressure.starts.length,28*cfg.players.length*3);
    assert.ok(g.rowPressure.recoveries.filter(a=>a.type==='repression').every(a=>a.reduction===Math.min(2,a.before.tension)));
    cfg.players.forEach((p,i)=>{
      if(p.aiRecovery==='repression') {assert.equal(g.industrial.players[i].welfareBuys,0);assert.equal(g.industrial.players[i].sustainableProductions,0);}
      if(p.aiRecovery==='welfare') assert.equal(g.industrial.players[i].repressions,0);
      const e=g.econ[i];assert.equal(e.start+e.gained-Object.values(e.by).reduce((a,b)=>a+b,0),e.final);
    });
    assert.deepEqual(fingerprint(),saved.fingerprint);
    const record={...job,rows:4,players:cfg.players.length,config:cfg,elapsedMs,
      people:g.results.map(p=>({...p,stats:g.industrial.players[p.playerId],econ:g.econ[p.playerId],tracks:g.tracks[p.playerId]})),pressure:g.rowPressure};
    if(original) record.pair=pairedMetrics(original,record,job.seat);
    records.push(record);
    fs.writeFileSync(`${prefix}-part${part}.json`,JSON.stringify({source,fingerprint:saved.fingerprint,part,parts,records}));
    console.log(`${records.length}/${selected.length} ${job.kind} ${job.seed} ${job.seat??job.policies.join('/')} ${(elapsedMs/1000).toFixed(1)}s ${record.pair?`PV libero/senza W ${record.pair.withWelfare.pv}/${record.pair.withoutWelfare.pv}`:`PV ${g.results.map(p=>`${p.playerId}:${p.total}`).join(' ')}`}`);
  }
} else if(process.argv[2]==='report') {
  const parts=Number(process.argv[3]||4),files=Array.from({length:parts},(_,i)=>JSON.parse(fs.readFileSync(`${prefix}-part${i}.json`)));
  files.forEach(f=>assert.deepEqual(f.fingerprint,saved.fingerprint));
  const records=files.flatMap(f=>f.records),key=r=>`${r.kind}:${r.seed}:${r.seat??r.policies.join('/')}`;
  assert.deepEqual(records.map(key).sort(),jobs.map(key).sort());
  const ablations=records.filter(r=>r.kind==='ablation'),direct=records.filter(r=>r.kind==='direct');
  for(const r of ablations) {
    const b=baseline.find(b=>b.seed===r.seed),withWelfare=financialMetrics(b,r.seat),withoutWelfare=financialMetrics(r,r.seat);
    r.pair={withWelfare,withoutWelfare,difference:Object.fromEntries(Object.keys(withWelfare).map(k=>[k,withWelfare[k]-withoutWelfare[k]]))};
  }
  const onlyRules=({seed,players,...rules})=>rules;
  direct.forEach(r=>assert.deepEqual(onlyRules(r.config),onlyRules(baseline[0].config)));
  const investments=baseline.flatMap(investmentUses),fixed=baseline.flatMap(fixedScheduleYield);
  const bySeed=baseline.map(b=>({seed:b.seed,players:b.players,group:b.group,
    difference:averages(ablations.filter(r=>r.seed===b.seed).map(r=>r.pair.difference))}));
  const grouped=rs=>({n:rs.length,withWelfare:averages(rs.map(r=>r.pair.withWelfare)),withoutWelfare:averages(rs.map(r=>r.pair.withoutWelfare)),
    difference:averages(rs.map(r=>r.pair.difference)),medianPVDifference:median(rs.map(r=>r.pair.difference.pv)),
    better:rs.filter(r=>r.pair.difference.pv>0).length,tied:rs.filter(r=>r.pair.difference.pv===0).length,worse:rs.filter(r=>r.pair.difference.pv<0).length});
  const directPairs=direct.map(r=>{
    const welfare=financialMetrics(r,r.policies.indexOf('welfare')),repression=financialMetrics(r,r.policies.indexOf('repression'));
    return {seed:r.seed,welfareSeat:r.policies.indexOf('welfare'),welfare,repression,difference:welfare.pv-repression.pv};
  });
  const summary={baselineGames:baseline.length,newGames:records.length,ablation:grouped(ablations),bySeed,
    seedWeightedDifference:averages(bySeed.map(s=>s.difference)),
    byGroup:['known','unseen'].map(group=>({group,...grouped(ablations.filter(r=>r.group===group))})),
    byUse:[true,false].map(used=>({used,...grouped(ablations.filter(r=>(r.pair.withWelfare.sustainable>0)===used))})),
    use:{investments:investments.length,unused:investments.filter(i=>!i.uses).length,once:investments.filter(i=>i.uses===1).length,
      repeated:investments.filter(i=>i.uses>=2).length,cost:sum(investments,'cost'),uses:sum(investments,'uses'),
      tensionReduced:sum(investments,'tensionReduced'),preventiveAtZero:sum(investments,'preventiveAtZero'),reopened:sum(investments,'reopened'),
      foregoneResources:sum(investments,'foregoneResources'),trackResources:sum(investments,'trackResources')},
    fixedSchedule:{positive:fixed.filter(x=>x.difference>0).length,zero:fixed.filter(x=>x.difference===0).length,negative:fixed.filter(x=>x.difference<0).length,extraResources:sum(fixed,'difference')},
    reuse:[{min:0,max:2},{min:3,max:Infinity}].map(group=>{
      const selected=investments.filter(i=>i.productionsAfter>=group.min&&i.productionsAfter<=group.max);
      const effects=selected.map(i=>fixed.find(f=>f.seed===i.seed&&f.seat===i.seat&&f.role===i.role));
      return {label:group.min?'3+ produzioni successive':'0–2 produzioni successive',n:selected.length,positive:effects.filter(e=>e.difference>0).length,extraResources:sum(effects,'difference')};
    }),
    direct:{pairs:directPairs,welfare:averages(directPairs.map(p=>p.welfare)),repression:averages(directPairs.map(p=>p.repression)),
      welfareWins:directPairs.filter(p=>p.difference>0).length,repressionWins:directPairs.filter(p=>p.difference<0).length,ties:directPairs.filter(p=>p.difference===0).length,
      difference:mean(directPairs.map(p=>p.difference))}};
  assert.equal(summary.use.uses,baseline.flatMap(b=>b.people).reduce((n,p)=>n+p.stats.sustainableProductions,0));
  assert.equal(summary.use.cost,baseline.flatMap(b=>b.people).reduce((n,p)=>n+p.stats.welfareSpent,0));
  const f=x=>x.toFixed(2),a=summary.ablation,u=summary.use,d=summary.direct;
  const lines=['OFFICINA 1907 — WELFARE E REPRESSIONE CON LA NUOVA IA D6 — 16 OTTOBRE 2026',
    'Regole e IA congelate: quattro righe da quattro caselle, repressione −2, d6 r1, continuazioni beam2, valutazione baseline. Nessuna modifica di prezzi, rendite, commesse o pesi euristici.',
    'Welfare: 3 marchi e un’azione per reparto, abilita produzione sostenibile su una riga e recupero −1. Repressione: un’azione e costo personale crescente 2/3/4… per recuperare −2. Entrambe le produzioni attivano i macchinari.',
    '12 partite libere già salvate con questa stessa IA, 36 giocatori-partita; verificate le impronte SHA256 del motore e della ricerca. 38 nuove partite: 32 ripetizioni individuali e 6 scontri diretti.',
    '', 'LETTURA DEI RISULTATI',
    `Con questa IA e questa configurazione, il welfare riduce la pressione della tensione ma non mostra un vantaggio medio nel risultato: ${f(a.difference.pv)} PV nel confronto individuale e ${d.welfareWins} vittorie su ${directPairs.length} negli scontri esclusivi.`,
    `Il giocatore con accesso al welfare produce ${f(a.difference.productions)} volte in più, ma raccoglie quasi le stesse risorse dal tracciato (${f(a.withWelfare.trackResources)} contro ${f(a.withoutWelfare.trackResources)}), spendendo ${f(a.difference.managementSpent)} marchi e ${f(a.difference.recoveryActions)} azioni aggiuntive tra investimenti e repressione.`,
    `Lo scarto nei punti comprende ${f(a.difference.contractPV)} PV dalle commesse e ${f(a.difference.racePV)} PV dalle gare. È coerente con un problema di efficienza complessiva, ma la simulazione non attribuisce causalmente questi scarti al singolo acquisto.`,
    'Il beneficio produttivo diventa visibile soprattutto con riuso del reparto. Restano casi favorevoli al welfare; i risultati non giustificano considerarlo sempre inutile o modificare l’IA per aumentarne artificialmente gli acquisti.',
    '', 'CONFRONTO INDIVIDUALE',
    'Inclusi tutti i 32 acquirenti delle partite libere. In ogni ripetizione soltanto quel giocatore non può acquistare welfare; gli avversari mantengono scelta libera. La partita originale permette anche repressione: non rappresenta una strategia welfare pura.',
    'Stesso seed, posto e configurazione. Le azioni successive, i mercati e gli avversari possono divergere. I costi e le occasioni perse entrano nel risultato della partita completa.',
    'Voce | Libero con welfare acquistato | Stesso giocatore senza welfare | Differenza',
    ...Object.keys(a.withWelfare).map(k=>`${k} | ${f(a.withWelfare[k])} | ${f(a.withoutWelfare[k])} | ${f(a.difference[k])}`),
    'machineryCoins indica le rendite fisse dei macchinari; exchangeCoins raccoglie separatamente gli incassi da scambi, incluse eventuali conversioni delle carte. totalIncome/totalSpent comprendono tutte le entrate/spese effettive. recoveryActions conta investimenti welfare e repressioni, non le produzioni sostenibili.',
    `PV migliori con welfare in ${a.better} confronti, peggiori in ${a.worse}, pari in ${a.tied}. Non sono vittorie al tavolo. Media dando ugual peso a ogni seed: ${f(summary.seedWeightedDifference.pv)} PV.`,
    `Differenza mediana individuale: ${f(a.medianPVDifference)} PV. La media include tutti i casi, anche quelli estremi.`,
    ...summary.byGroup.map(g=>`${g.group==='known'?'Scenari 1907–1912':'Scenari 7907–7912'}: ${g.n} confronti; differenza ${f(g.difference.pv)} PV.`),
    ...summary.byUse.map(g=>`${g.used?'Acquirenti con almeno un uso sostenibile':'Acquirenti senza usi sostenibili'}: ${g.n}; differenza ${f(g.difference.pv)} PV.`),
    '', 'USO E RESA DEL WELFARE NELLE PARTITE LIBERE',
    `${u.investments} investimenti: ${u.cost} marchi e ${u.investments} azioni. ${u.unused} mai usati, ${u.once} usati una volta, ${u.repeated} più volte; ${u.uses} produzioni sostenibili.`,
    `${u.tensionReduced} passi di tensione recuperati; ${u.preventiveAtZero} usi a tensione zero; ${u.reopened} righe bloccate riaperte. ${u.foregoneResources} risorse accessibili sacrificate nella produzione sostenibile; ${u.trackResources} risorse incassate in quella modalità.`,
    `A calendario e sviluppo fissi: ${summary.fixedSchedule.positive} investimenti migliorano la resa totale del tracciato, ${summary.fixedSchedule.zero} invariati, ${summary.fixedSchedule.negative} peggiori; saldo ${summary.fixedSchedule.extraResources} risorse.`,
    'Questo calcolo include la rinuncia immediata della produzione sostenibile, ma non è una partita alternativa legalmente ed economicamente ricostruita: conserva anche le repressioni e non ricalcola commesse, acquisti o spostamenti.',
    ...summary.reuse.map(g=>`${g.label}: ${g.n} investimenti, ${g.positive} con resa netta positiva; saldo ${g.extraResources} risorse. Sono fasce descrittive, non soglie universali di convenienza.`),
    '', 'SCONTRI DIRETTI SU SCENARI NUOVI',
    'Tre seed 9907–9909, due giocatori, posti invertiti. Entrambi beam2 d6: uno non può reprimere, l’altro non può acquistare welfare. Nessuno è obbligato ad acquistare o recuperare; sono vincoli sperimentali alle scelte, non regole proposte per il gioco.',
    `Vittorie welfare ${d.welfareWins}, repressione ${d.repressionWins}, pareggi ${d.ties}. Scarto medio welfare−repressione: ${f(d.difference)} PV.`,
    'Voce | Solo welfare come recupero | Solo repressione come recupero',
    ...Object.keys(d.welfare).map(k=>`${k} | ${f(d.welfare[k])} | ${f(d.repression[k])}`),
    ...directPairs.map(p=>`Seed ${p.seed}, welfare al posto ${p.welfareSeat+1}: ${p.welfare.pv} contro ${p.repression.pv} PV.`),
    '', 'CONFRONTI INDIVIDUALI PER SEED',...bySeed.map(s=>`${s.seed} (${s.players} giocatori): ${f(s.difference.pv)} PV medi libero−senza welfare.`),
    '', 'LIMITI',
    'Gli acquirenti dello stesso tavolo e i posti invertiti dello stesso seed non sono repliche indipendenti. Gli scontri diretti contano solo tre scenari: non stimano con precisione le probabilità di vittoria.',
    'La rimozione dell’opzione welfare confronta politiche complete; non misura il valore causale di ciascun acquisto. Anche un acquisto mai usato può accompagnarsi a punteggi diversi per le sequenze di decisioni successive.',
    'La nuova ricerca mantiene due continuazioni proprie e risposte avversarie greedy. Restano le euristiche baseline, compresa la stima preesistente del possesso del welfare. Non è gioco ottimale; nessun peso è stato ritoccato per questo esperimento.',
    'I macchinari producono anche senza welfare: i loro incassi sono contabilizzati in entrambe le alternative, non attribuiti interamente all’investimento. Il costo opportunità delle azioni è riflesso nelle partite, non trasformato in un valore fisso di PV.',
  ];
  fs.writeFileSync(prefix+'.json',JSON.stringify({source,fingerprint:saved.fingerprint,baseline,records,investments,fixedSchedule:fixed,summary}));
  fs.writeFileSync(prefix+'-summary.json',JSON.stringify(summary,null,2));
  fs.writeFileSync(prefix+'.txt',lines.join('\n'));
  console.log(lines.join('\n'));
} else throw new Error('Usare run o report');
