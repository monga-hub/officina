// node scripts/ai-continuations-study.js run 0 2 (e run 1 2 in un altro processo)
// node scripts/ai-continuations-study.js report 2
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { initGame, applyCommand } from '../src/game/engine.js';
import { runOneGame } from '../src/game/batchsim.js';
import { chooseCommand, resetRolloutStats, rolloutStats } from '../src/game/ai.js';
import { comparisonConfig } from './row-comparison-analysis.js';
import { playerMetrics, investmentUses } from './welfare-use-analysis.js';

const prefix='reports/ia-continuazioni-2026-10-16-d6';
const fingerprint=()=>Object.fromEntries(['ai.js','engine.js','data.js','row-economy.js','batchsim.js'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(`src/game/${p}`)).digest('hex')]));
const jobs=[];
for(const [group,base] of [['known',1907],['unseen',7907]]) for(let i=0;i<6;i++) {
  for(const version of i%2?['beam2','greedy']:['greedy','beam2']) jobs.push({group,seed:base+i,players:2+i%3,versions:Array(2+i%3).fill(version),pair:jobs.length>>1});
}
for(let i=0;i<3;i++) for(const versions of [['greedy','beam2'],['beam2','greedy']]) jobs.push({group:'mixed',seed:8907+i,players:2,versions,pair:12+i});
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
const median=xs=>{const ys=[...xs].sort((a,b)=>a-b),n=ys.length;return n?(ys[Math.floor((n-1)/2)]+ys[Math.floor(n/2)])/2:0;};

if(process.argv[2]==='run') {
  const part=Number(process.argv[3]||0),parts=Number(process.argv[4]||2);
  assert.ok(Number.isInteger(part)&&part>=0&&part<parts);
  const records=[],hash=fingerprint(),selected=jobs.filter(j=>j.pair%parts===part);
  for(const job of selected) {
    const cfg=comparisonConfig(job.seed,job.players,4,6);
    cfg.players=cfg.players.map((p,i)=>({...p,aiEvaluation:'baseline',aiContinuation:job.versions[i]}));
    resetRolloutStats();const start=performance.now(),cpu=process.cpuUsage(),g=runOneGame(cfg);
    const elapsedMs=performance.now()-start,cpuUsed=process.cpuUsage(cpu);
    assert.ok(!g.failed);assert.equal(g.turns,28);assert.ok(g.rowPressure.unitRows);
    assert.equal(g.rowPressure.starts.length,28*job.players*3);
    assert.ok(g.rowPressure.recoveries.filter(a=>a.type==='repression').every(a=>a.reduction===Math.min(2,a.before.tension)));
    assert.deepEqual(fingerprint(),hash,'Ricerca e regole congelate');
    const {perDecisionLog,...counters}=rolloutStats;
    records.push({...job,rows:4,config:cfg,elapsedMs,cpuMs:(cpuUsed.user+cpuUsed.system)/1000,counters,
      people:g.results.map(p=>({...p,stats:g.industrial.players[p.playerId],econ:g.econ[p.playerId],tracks:g.tracks[p.playerId]})),pressure:g.rowPressure});
    fs.writeFileSync(`${prefix}-part${part}.json`,JSON.stringify({fingerprint:hash,records}));
    console.log(`${records.length}/${selected.length} ${job.group} ${job.seed} ${job.versions.join('/')} ${(elapsedMs/1000).toFixed(1)}s PV ${g.results.map(p=>`${p.playerId}:${p.total}`).join(' ')}`);
  }
} else if(process.argv[2]==='bench') {
  // Eseguire senza altri batch: stessi stati, ordine AB/BA e due ripetizioni dopo riscaldamento.
  const records=[],hash=fingerprint();
  for(let i=0;i<3;i++) {
    const cfg=comparisonConfig(1907+i,2+i,4,6);let s=initGame(cfg),guard=0;
    while(!s.gameOver&&guard++<10000) {
      if(!s.pending&&s.current===0&&s.phase==='move'&&[1,10,20,26].includes(s.turn)) {
        const original=structuredClone(s);
        for(const warm of ['greedy','beam2']) {const copy=structuredClone(s);copy.players[0].aiContinuation=warm;chooseCommand(copy);}
        for(let rep=0;rep<2;rep++) for(const version of rep?['beam2','greedy']:['greedy','beam2']) {
          const copy=structuredClone(s);copy.players[0].aiContinuation=version;resetRolloutStats();
          const start=performance.now(),cpu=process.cpuUsage(),cmd=chooseCommand(copy),elapsedMs=performance.now()-start,cpuUsed=process.cpuUsage(cpu);
          records.push({seed:cfg.seed,players:cfg.players.length,turn:s.turn,rep,version,cmd,elapsedMs,cpuMs:(cpuUsed.user+cpuUsed.system)/1000,steps:rolloutStats.stepsSimulated,expanded:rolloutStats.beamExpanded,evaluations:rolloutStats.evaluateCalls});
        }
        for(const version of ['greedy','beam2']) {
          const pair=records.filter(r=>r.seed===cfg.seed&&r.turn===s.turn&&r.version===version);
          assert.deepEqual(pair[0].cmd,pair[1].cmd,'Stessa decisione nelle due ripetizioni temporizzate');
        }
        assert.deepEqual(s,original);console.log(`bench ${cfg.players.length} giocatori turno ${s.turn}`);
      }
      s=applyCommand(s,chooseCommand(s));
    }
    assert.ok(s.gameOver);assert.deepEqual(fingerprint(),hash);
    fs.writeFileSync(prefix+'-bench.json',JSON.stringify({fingerprint:hash,environment:{node:process.version,platform:process.platform,arch:process.arch},records}));
  }
} else if(process.argv[2]==='report') {
  const parts=Number(process.argv[3]||2),files=Array.from({length:parts},(_,i)=>JSON.parse(fs.readFileSync(`${prefix}-part${i}.json`)));
  files.forEach(f=>assert.deepEqual(f.fingerprint,files[0].fingerprint));
  const records=files.flatMap(f=>f.records);assert.equal(records.length,jobs.length);
  assert.equal(new Set(records.map(r=>`${r.group}:${r.seed}:${r.versions.join('/')}`)).size,jobs.length);
  const summary=[];
  for(const group of ['known','unseen','mixed']) for(const version of ['greedy','beam2']) {
    const rs=records.filter(r=>r.group===group&&r.versions.includes(version));
    const ps=rs.flatMap(r=>r.versions.flatMap((v,i)=>v===version?[playerMetrics(r,i)]:[]));
    const buys=rs.flatMap(r=>investmentUses(r).filter(b=>r.versions[b.seat]===version));
    summary.push({group,version,games:rs.length,players:ps.length,means:Object.fromEntries(Object.keys(ps[0]).map(k=>[k,mean(ps.map(p=>p[k]))])),buys:buys.length,unused:buys.filter(b=>!b.uses).length,uses:buys.reduce((s,b)=>s+b.uses,0),wallMs:mean(rs.map(r=>r.elapsedMs)),cpuMs:mean(rs.map(r=>r.cpuMs))});
  }
  const pairs=[];
  for(const group of ['known','unseen']) for(const seed of new Set(records.filter(r=>r.group===group).map(r=>r.seed))) {
    const rs=records.filter(r=>r.group===group&&r.seed===seed),old=rs.find(r=>r.versions[0]==='greedy'),now=rs.find(r=>r.versions[0]==='beam2');assert.equal(rs.length,2);
    const strip=c=>({...c,players:c.players.map(({aiContinuation,...p})=>p)});assert.deepEqual(strip(old.config),strip(now.config));
    pairs.push({group,seed,players:old.players,pvDifference:mean(now.people.map(p=>p.total))-mean(old.people.map(p=>p.total)),wallRatio:now.elapsedMs/old.elapsedMs,cpuRatio:now.cpuMs/old.cpuMs});
  }
  const mixed=records.filter(r=>r.group==='mixed').map(r=>({seed:r.seed,newSeat:r.versions.indexOf('beam2'),difference:r.people.find(p=>r.versions[p.playerId]==='beam2').total-r.people.find(p=>r.versions[p.playerId]==='greedy').total}));
  const bench=JSON.parse(fs.readFileSync(prefix+'-bench.json'));assert.deepEqual(bench.fingerprint,files[0].fingerprint);assert.equal(bench.records.length,48);
  const timings=[...new Set(bench.records.map(r=>`${r.seed}:${r.turn}`))].map(key=>{
    const rs=bench.records.filter(r=>`${r.seed}:${r.turn}`===key),old=rs.filter(r=>r.version==='greedy'),now=rs.filter(r=>r.version==='beam2');
    return {key,players:rs[0].players,turn:rs[0].turn,oldMs:mean(old.map(r=>r.elapsedMs)),newMs:mean(now.map(r=>r.elapsedMs)),ratio:mean(now.map(r=>r.elapsedMs))/mean(old.map(r=>r.elapsedMs)),cpuRatio:mean(now.map(r=>r.cpuMs))/mean(old.map(r=>r.cpuMs))};
  });
  const result={summary,pairs,mixed,timings,medianDecisionRatio:median(timings.map(t=>t.ratio)),aggregateDecisionRatio:timings.reduce((s,t)=>s+t.newMs,0)/timings.reduce((s,t)=>s+t.oldMs,0),medianGameRatio:median(pairs.map(t=>t.wallRatio))};
  fs.writeFileSync(prefix+'.json',JSON.stringify({fingerprint:files[0].fingerprint,records}));fs.writeFileSync(prefix+'-summary.json',JSON.stringify(result,null,2));
  const labels={known:'SEED NOTI 1907–1912',unseen:'SEED NUOVI 7907–7912',mixed:'SCONTRI DIRETTI 8907–8909, POSTI INVERTITI'};
  const lines=['OFFICINA 1907 — CONTINUAZIONI ALTERNATIVE A D6 — 16 OTTOBRE 2026',
    '30 partite complete, tutte eseguite nuovamente: 6 scenari noti × 2 versioni, 6 scenari nuovi × 2 versioni, 3 scenari diretti × 2 assegnazioni ai posti.',
    'Nei confronti omogenei ogni gruppo ha due scenari da 2, due da 3 e due da 4 giocatori. Scontri diretti a 2 giocatori.',
    'Regole ferme: 4 righe × 4 caselle, repressione −2, welfare 3 marchi, 28 turni; stessi mazzi, monete iniziali, commesse e profili neutrali. Recupero libero, senza quote welfare.',
    'Entrambe le IA usano d6 r1 e la valutazione baseline. Nessun peso degli investimenti è cambiato: è conservata anche la precedente stima del possesso del welfare. Questo esperimento isola la ricerca, non elimina le euristiche preesistenti.',
    'Nuova ricerca: per ogni azione iniziale, esplora tutte le mosse e prime azioni legali nei successivi turni propri; conserva le due linee con valutazione migliore dopo il proprio turno, poi simula le risposte avversarie greedy. Pending e resto delle visite in città sono greedy. Il percorso interamente greedy resta sempre candidato.',
    'Larghezza 2 fissata prima dei confronti, nessun percorso riservato a un tipo di investimento, nessuna modifica durante le partite. Le linee potate possono contenere piani migliori: non è ricerca esaustiva.',
    'Partite in due processi concorrenti; ordine vecchia/nuova alternato fra seed. Per isolare il costo della ricerca: benchmark successivo in un solo processo, senza questi batch, su 12 identici stati di movimento (2/3/4 giocatori; turni 1/10/20/26), due misurazioni AB/BA per versione dopo riscaldamento.', ''];
  for(const group of ['known','unseen','mixed']) {
    lines.push(labels[group]);
    for(const s of summary.filter(s=>s.group===group)) {
      const m=s.means;
      lines.push(`${s.version==='greedy'?'Precedente':'Alternative'} — ${s.players} giocatori-partita: PV ${m.pv.toFixed(2)}, PV commesse ${m.contractPV.toFixed(2)}, PV gare ${m.racePV.toFixed(2)}, commesse ${m.contracts.toFixed(2)}.`,
        `  Welfare: ${s.buys} acquisti, ${s.unused} mai utilizzati, ${s.uses} produzioni sostenibili.`,
        `  Medie: produzioni ${m.productions.toFixed(2)}, risorse dal tracciato ${m.trackResources.toFixed(2)}, risorse perse per copertura ${m.lostResources.toFixed(2)}, repressioni ${m.repressions.toFixed(2)}.`,
        `  Medie: spesa welfare ${m.welfareSpent.toFixed(2)}, spesa repressione ${m.repressionSpent.toFixed(2)}, marchi macchinari ${m.machineryCoins.toFixed(2)}, marchi commesse ${m.contractCoins.toFixed(2)}, marchi finali ${m.finalCoins.toFixed(2)}.`);
    }
    if(group!=='mixed') {
      const ps=pairs.filter(p=>p.group===group);
      lines.push(`Medie per seed nuova−precedente: ${mean(ps.map(p=>p.pvDifference)).toFixed(2)} PV; nuova superiore in ${ps.filter(p=>p.pvDifference>0).length}/${ps.length}, inferiore in ${ps.filter(p=>p.pvDifference<0).length}, pari in ${ps.filter(p=>p.pvDifference===0).length}.`);
    } else lines.push(`PV nello scontro diretto: nuova superiore ${mixed.filter(p=>p.difference>0).length}, precedente superiore ${mixed.filter(p=>p.difference<0).length}, pari ${mixed.filter(p=>p.difference===0).length}; scarto medio nuova−precedente ${mean(mixed.map(p=>p.difference)).toFixed(2)}.`);
    lines.push('');
  }
  lines.push('TEMPI',`Ambiente benchmark: Node ${bench.environment.node}, ${bench.environment.platform} ${bench.environment.arch}.`, `Rapporto mediano delle partite appaiate: ×${result.medianGameRatio.toFixed(2)}. Le partite possono avere sequenze differenti.`,
    `Stesse decisioni: rapporto aggregato ×${result.aggregateDecisionRatio.toFixed(2)}; mediana dei 12 rapporti ×${result.medianDecisionRatio.toFixed(2)}.`,
    `Rapporto CPU mediano sulle stesse decisioni: ×${median(timings.map(t=>t.cpuRatio)).toFixed(2)}.`);
  for(const n of [2,3,4]) {
    const rs=records.filter(r=>r.group!=='mixed'&&r.players===n),old=rs.filter(r=>r.versions[0]==='greedy'),now=rs.filter(r=>r.versions[0]==='beam2');
    lines.push(`${n} giocatori, secondi medi per partita: precedente ${(mean(old.map(r=>r.elapsedMs))/1000).toFixed(2)}, nuova ${(mean(now.map(r=>r.elapsedMs))/1000).toFixed(2)}.`);
  }
  for(const t of timings) lines.push(`Decisione ${t.key}, ${t.players} giocatori: precedente ${t.oldMs.toFixed(1)} ms, nuova ${t.newMs.toFixed(1)} ms, ×${t.ratio.toFixed(2)}.`);
  lines.push('','CONFRONTI PER SEED',...pairs.map(p=>`${p.group} ${p.seed}: ${p.pvDifference.toFixed(2)} PV medi nuova−precedente; tempo ×${p.wallRatio.toFixed(2)}; CPU ×${p.cpuRatio.toFixed(2)}.`),
    ...mixed.map(p=>`diretto ${p.seed}, nuova al posto ${p.newSeat+1}: ${p.difference} PV nuova−precedente.`),'','LIMITI',
    'Sei seed nuovi e tre coppie dirette sono un campione esplorativo. I giocatori dello stesso tavolo e le due assegnazioni dello stesso seed non sono repliche indipendenti.',
    'Più punti nei tavoli omogenei non dimostrano da soli maggiore forza: può cambiare la competizione per gare e commesse. Gli scontri diretti sono separati per questo motivo.',
    'Un acquisto welfare utilizzato non dimostra che il suo costo sia stato recuperato. I conteggi descrivono le scelte: non sono obiettivi della ricerca.',
    'Il benchmark copre decisioni di movimento; non tutti gli stati o dispositivi. I tempi dipendono dalla macchina e dal carico. La ricerca non è ottimale: risposte avversarie greedy, sole due linee e valori euristici invariati.');
  fs.writeFileSync(prefix+'.txt',lines.join('\n'));console.log(lines.join('\n'));
} else throw new Error('Usare run, bench o report');
