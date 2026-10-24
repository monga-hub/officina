// node scripts/ai-welfare-study.js run <part=0> <parts=2>
// node scripts/ai-welfare-study.js report <parts=2>
// Seconda variante, fermata ai casi noti: AI_VARIANT=rollout-return STAGE=known ...
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { runOneGame } from '../src/game/batchsim.js';
import { comparisonConfig } from './row-comparison-analysis.js';
import { investmentUses, playerMetrics } from './welfare-use-analysis.js';

const candidate=process.env.AI_VARIANT||'observed', knownOnly=process.env.STAGE==='known';
assert.ok(['observed','rollout-return'].includes(candidate));
const prefix=`reports/ia-${candidate==='observed'?'neutrale':'rollout-return'}-2026-10-15-d6`;
const groups=knownOnly?['known']:['known','unseen','mixed'];
const unseenBase=candidate==='observed'?3907:5907, mixedBase=candidate==='observed'?4907:6907;
const oldRecords=JSON.parse(fs.readFileSync('reports/confronto-4-6-righe-2026-10-15-d6.json')).records.filter(r=>r.rows===4);
const hash=()=>Object.fromEntries(['src/game/ai.js','src/game/engine.js'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const jobs=[];
for(const r of oldRecords) jobs.push({group:'known',seed:r.seed,n:r.players,versions:Array(r.players).fill(candidate),config:r.config});
if(!knownOnly) {
  for(let i=0;i<12;i++) for(const version of ['baseline',candidate]) jobs.push({group:'unseen',seed:unseenBase+i,n:2+i%3,versions:Array(2+i%3).fill(version)});
  for(let i=0;i<6;i++) for(const versions of [['baseline',candidate],[candidate,'baseline']]) jobs.push({group:'mixed',seed:mixedBase+i,n:2,versions});
}
jobs.forEach((j,id)=>j.id=id);

if(process.argv[2]==='run') {
  const part=Number(process.argv[3]||0),parts=Number(process.argv[4]||2);
  assert.ok(Number.isInteger(part)&&part>=0&&part<parts);
  const records=[], fingerprint=hash(), selected=jobs.filter(j=>j.id%parts===part);
  for(const job of selected) {
    const base=job.config||comparisonConfig(job.seed,job.n,4,6);
    const cfg={...base,players:base.players.map((p,i)=>({...p,aiEvaluation:job.versions[i]}))};
    const strip=c=>({...c,players:c.players.map(({aiEvaluation,...p})=>p)});
    assert.deepEqual(strip(cfg),strip(base));
    assert.equal(cfg.trackModel,'righe4corte');
    assert.deepEqual(cfg.aiRollout,{depth:6,rollouts:1});
    const start=Date.now(),g=runOneGame(cfg);
    assert.ok(!g.failed);assert.equal(g.turns,28);
    assert.equal(g.rowPressure.starts.length,28*job.n*3);
    assert.ok(g.rowPressure.recoveries.filter(a=>a.type==='repression').every(a=>a.reduction===Math.min(2,a.before.tension)));
    records.push({id:job.id,group:job.group,rows:4,seed:job.seed,players:job.n,versions:job.versions,config:cfg,
      people:g.results.map(p=>({...p,stats:g.industrial.players[p.playerId],econ:g.econ[p.playerId],tracks:g.tracks[p.playerId]})),
      pressure:g.rowPressure,elapsedMs:Date.now()-start});
    assert.deepEqual(hash(),fingerprint,'Codice congelato durante la valutazione');
    fs.writeFileSync(`${prefix}-part${part}.json`,JSON.stringify({fingerprint,records}));
    console.log(`${records.length}/${selected.length} ${job.group} seed ${job.seed} ${job.versions.join('/')} ${(Date.now()-start)/1000}s · PV ${g.results.map(p=>`${p.playerId}:${p.total}`).join(' ')}`);
  }
} else if(process.argv[2]==='report') {
  const parts=Number(process.argv[3]||2);
  const files=Array.from({length:parts},(_,i)=>JSON.parse(fs.readFileSync(`${prefix}-part${i}.json`)));
  files.forEach(f=>assert.deepEqual(f.fingerprint,files[0].fingerprint));
  const records=[...oldRecords.map(r=>({...r,group:'known',versions:Array(r.players).fill('baseline'),cached:true})),...files.flatMap(f=>f.records)];
  assert.equal(files.flatMap(f=>f.records).length,jobs.length);
  assert.equal(new Set(files.flatMap(f=>f.records).map(r=>r.id)).size,jobs.length);
  const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
  const summary=[];
  for(const group of groups) for(const version of ['baseline',candidate]) {
    const rs=records.filter(r=>r.group===group&&r.versions.includes(version));
    const ps=rs.flatMap(r=>r.versions.flatMap((v,seat)=>v===version?[playerMetrics(r,seat)]:[]));
    const buys=rs.flatMap(r=>investmentUses(r).filter(b=>r.versions[b.seat]===version));
    const prods=rs.flatMap(r=>r.pressure.productions.filter(a=>r.versions[a.seat]===version));
    summary.push({group,version,games:rs.length,players:ps.length,
      means:Object.fromEntries(Object.keys(ps[0]).map(k=>[k,mean(ps.map(p=>p[k]))])),
      investments:buys.length,unused:buys.filter(b=>b.uses===0).length,uses:buys.reduce((n,b)=>n+b.uses,0),
      blockedProductions:prods.filter(a=>a.before.blocked>0).length,productions:prods.length});
  }
  const pairs=[];
  for(const group of ['known','unseen']) for(const seed of new Set(records.filter(r=>r.group===group).map(r=>r.seed))) {
    const rs=records.filter(r=>r.group===group&&r.seed===seed);
    assert.equal(rs.length,2);
    const old=rs.find(r=>r.versions[0]==='baseline'),now=rs.find(r=>r.versions[0]===candidate);
    pairs.push({group,seed,players:old.players,difference:mean(now.people.map(p=>p.total))-mean(old.people.map(p=>p.total))});
  }
  const mixed=records.filter(r=>r.group==='mixed').map(r=>{
    const pv=v=>r.people.find(p=>r.versions[p.playerId]===v).total;
    return {seed:r.seed,newSeat:r.versions.indexOf(candidate),difference:pv(candidate)-pv('baseline')};
  });
  const mixedPairs=[...new Set(mixed.map(r=>r.seed))].map(seed=>({seed,difference:mean(mixed.filter(r=>r.seed===seed).map(r=>r.difference))}));
  const pairedSummary=rows=>({n:rows.length,mean:mean(rows.map(r=>r.difference)),better:rows.filter(r=>r.difference>0).length,worse:rows.filter(r=>r.difference<0).length,tied:rows.filter(r=>r.difference===0).length});
  const result={summary,pairs,mixed,mixedPairs,paired:{known:pairedSummary(pairs.filter(r=>r.group==='known')),unseen:pairedSummary(pairs.filter(r=>r.group==='unseen')),mixed:pairedSummary(mixed),mixedSeeds:pairedSummary(mixedPairs)}};
  fs.writeFileSync(prefix+'.json',JSON.stringify({fingerprint:files[0].fingerprint,records}));
  fs.writeFileSync(prefix+'-summary.json',JSON.stringify(result,null,2));
  const labels={known:'SCENARI GIÀ STUDIATI (1907–1918)',unseen:`SCENARI NUOVI (${unseenBase}–${unseenBase+11})`,mixed:`CONFRONTI DIRETTI (${mixedBase}–${mixedBase+5}, posti invertiti)`};
  const lines=['OFFICINA 1907 — IA SENZA PREMIO AL POSSESSO DEL WELFARE',
    '4 righe × 4 caselle, repressione −2, welfare 3 marchi: nessuna modifica alle regole.',
    'Tutti gli agenti neutrali e liberi di scegliere. Rollout d6 r1, continuazioni greedy, 28 turni per giocatore.',
    `Unica modifica: rimosso ${candidate==='rollout-return'?'solo dal confronto finale dei rollout (policy greedy conservata) ':''}il bonus euristico future × 2,3 per possedere welfare in un reparto con operai. Rimangono la valutazione di risorse, marchi, tensione, sviluppo, macchinari e obiettivi e le conseguenze simulate delle azioni.`,
    'Nessun obiettivo di frequenza welfare. Ogni variante è rimasta congelata durante la propria prova. Versione baseline riprodotta su una partita d6 precedente, con punteggi e telemetria identici.',
    ...(candidate==='rollout-return'?['Questa seconda correzione è stata formulata dopo il risultato negativo della prima sui seed noti. I nuovi seed riservati 5907–5918 e 6907–6912 non sono stati eseguiti, perché la verifica iniziale ha già dato esito negativo.']:[]),
    `${records.length} partite confrontate: 12 baseline già salvate, ${jobs.length} nuove esecuzioni. Le repliche tecniche di controllo sono escluse dalle statistiche.`,
    knownOnly?'Solo i 12 seed noti, quattro tavoli da 2/3/4 giocatori per versione. Variante scartata a questo stadio; nessuna prova su nuovi seed e nessuno scontro diretto.':'12 seed noti e 12 nuovi, quattro tavoli da 2/3/4 giocatori per versione. Inoltre 6 seed distinti a due giocatori, ciascuno ripetuto invertendo le versioni nei due posti.',
    'La versione predefinita resta baseline: queste varianti non hanno dimostrato un miglioramento.',
    'Codice IA e motore congelati durante le esecuzioni; fingerprint SHA256 nel file JSON.', ''];
  for(const group of groups) {
    lines.push(labels[group]);
    for(const s of summary.filter(s=>s.group===group)) {
      const m=s.means;
      lines.push(`${s.version==='baseline'?'Vecchia':'Nuova'} IA — ${s.players} giocatori-partita`,
        `  PV medi ${m.pv.toFixed(2)}; PV commesse ${m.contractPV.toFixed(2)}; PV gare ${m.racePV.toFixed(2)}; commesse ${m.contracts.toFixed(2)}.`,
        `  Welfare: ${s.investments} acquisti, ${s.unused} mai usati (${s.investments?(100*s.unused/s.investments).toFixed(1):0}%), ${s.uses} attivazioni sostenibili.`,
        `  Medie: produzioni ${m.productions.toFixed(2)}, repressioni ${m.repressions.toFixed(2)}, spesa welfare ${m.welfareSpent.toFixed(2)}, spesa repressione ${m.repressionSpent.toFixed(2)}.`,
        `  Medie: risorse dal tracciato ${m.trackResources.toFixed(2)}, risorse perse per copertura ${m.lostResources.toFixed(2)}, marchi macchinari fissi ${m.machineryCoins.toFixed(2)}, marchi da commesse ${m.contractCoins.toFixed(2)}, marchi finali ${m.finalCoins.toFixed(2)}.`,
        `  Produzioni iniziate con righe sviluppate coperte: ${s.blockedProductions}/${s.productions}.`);
    }
    const p=result.paired[group];
    lines.push(`Differenza nuova−vecchia: ${p.mean.toFixed(2)} PV, su ${p.n} ${group==='mixed'?'partite dirette':'medie per seed'}; superiore ${p.better}, inferiore ${p.worse}, pari ${p.tied}.`,'');
  }
  lines.push(knownOnly?'Nessun confronto diretto eseguito.':`Confronti diretti aggregati per coppia di posti invertiti: ${result.paired.mixedSeeds.better} seed a favore della nuova, ${result.paired.mixedSeeds.worse} della vecchia, ${result.paired.mixedSeeds.tied} pari.`,
    '', 'RISULTATI APPAIATI PER SEED',
    ...pairs.map(p=>`${p.group} ${p.seed} (${p.players} giocatori): ${p.difference.toFixed(2)} PV medi nuova−vecchia`),
    ...mixedPairs.map(p=>`mixed ${p.seed} (due posti invertiti): ${p.difference.toFixed(2)} PV nuova−vecchia`),
    '', 'LIMITI',
    'Il punteggio medio di tavoli omogenei non dimostra da solo che una IA sia più forte: può cambiare la competizione per commesse e gare. I confronti diretti aggiungono una verifica distinta, con un campione piccolo.',
    'I seed/coppie sono le repliche; giocatori della stessa partita e due partite a posti invertiti non sono indipendenti. I mercati iniziali sono appaiati, quelli successivi divergono con le scelte.',
    'Welfare mai attivato indica un investimento senza uso della relativa abilità; almeno un uso non prova che il suo costo sia stato recuperato.',
    'La rimozione del premio di possesso non elimina tutte le euristiche. D6 con continuazioni greedy resta limitato: il rendimento che arriva oltre la finestra può essere sottostimato. Nessun risultato dimostra gioco ottimale, equilibrio definitivo del welfare o qualità di un playtest umano.');
  fs.writeFileSync(prefix+'.txt',lines.join('\n'));
  console.log(lines.join('\n'));
} else throw new Error('Usare run o report');
