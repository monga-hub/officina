// node scripts/welfare-cost-study.js run PART PARTS; node scripts/welfare-cost-study.js report PARTS
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {runOneGame} from '../src/game/batchsim.js';
import {investmentUses,playerMetrics} from './welfare-use-analysis.js';

const minimumOne=process.env.WELFARE_MIN_ONE==='1';
const source='reports/welfare-sconto-2026-10-16-d6.json';
const prefix=minimumOne?'reports/welfare-costi-minimo1-2026-10-16-d6':'reports/welfare-costi-2026-10-16-d6';
const saved=JSON.parse(fs.readFileSync(source));
const baseline=[...saved.records.filter(r=>r.kind==='free'||r.kind==='direct'),...saved.freshRecords];
assert.equal(baseline.filter(r=>r.kind==='free').length,12);
assert.equal(baseline.filter(r=>r.kind!=='free').length,12);
const hash=()=>Object.fromEntries(Object.keys(saved.fingerprint).map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(`src/game/${p}`)).digest('hex')]));
const fingerprint=hash();
if(minimumOne) {
  const engine=fs.readFileSync('src/game/engine.js','utf8');
  const previous=engine.replace('Math.max(state.rowEconomy?.enabled ? 1 : 0, w.v - structHireDiscount(p, p.node) - welfareDiscount)', 'Math.max(0, w.v - structHireDiscount(p, p.node) - welfareDiscount)');
  assert.notEqual(previous,engine,'Il minimo uno deve essere attivo');
  assert.deepEqual({...fingerprint,'engine.js':crypto.createHash('sha256').update(previous).digest('hex')},saved.fingerprint,'Rispetto allo studio precedente cambia soltanto il minimo di assunzione');
} else assert.deepEqual(fingerprint,saved.fingerprint,'Motore e IA devono coincidere con il riferimento a costo 3');
// Direct games first, then distribute the larger tables across processes.
const ordered=[...baseline].sort((a,b)=>(a.kind==='free')-(b.kind==='free')||a.players-b.players||a.seed-b.seed||String(a.policies).localeCompare(String(b.policies)));
const jobs=minimumOne?ordered.flatMap(old=>[3,4,5].map(cost=>({cost,old}))):[4,5].flatMap(cost=>ordered.map(old=>({cost,old})));
const key=r=>`${r.config.rowEconomy.welfareCost}:${r.kind}:${r.seed}:${r.policies?.join('/')||''}`;
const jobKey=j=>`${j.cost}:${j.old.kind}:${j.old.seed}:${j.old.policies?.join('/')||''}`;
const sum=xs=>xs.reduce((a,b)=>a+b,0),mean=xs=>sum(xs)/xs.length;
const averages=ps=>Object.fromEntries(Object.keys(ps[0]).map(k=>[k,mean(ps.map(p=>p[k]))]));
const metrics=(r,seat)=>({...playerMetrics(r,seat),welfareHireSavings:sum(r.pressure.actions.filter(a=>a.seat===seat).map(a=>a.welfareSaved||0))});

if(process.argv[2]==='run') {
  const part=Number(process.argv[3]),parts=Number(process.argv[4]);
  assert.ok(Number.isInteger(part)&&part>=0&&part<parts);
  const selected=jobs.filter((_,i)=>i%parts===part),records=[];
  for(const {cost,old} of selected) {
    const cfg=structuredClone(old.config);cfg.rowEconomy.welfareCost=cost;
    const restored=structuredClone(cfg);restored.rowEconomy.welfareCost=3;assert.deepEqual(restored,old.config);
    assert.equal(cfg.trackModel,'righe4corte');assert.deepEqual(cfg.aiRollout,{depth:6,rollouts:1});
    assert.ok(cfg.players.every(p=>p.aiContinuation==='beam2'&&p.aiEvaluation==='baseline'));
    assert.equal(cfg.rowEconomy.welfareScope,'factory');assert.equal(cfg.rowEconomy.welfareHireDiscount,true);
    const start=performance.now(),g=runOneGame(cfg),elapsedMs=performance.now()-start;
    assert.ok(!g.failed);assert.equal(g.turns,28);assert.ok(g.rowPressure.unitRows);
    assert.equal(g.rowPressure.starts.length,28*cfg.players.length*3);
    assert.ok(g.rowPressure.recoveries.filter(x=>x.type==='repression').every(x=>x.reduction===Math.min(2,x.before.tension)));
    const r={kind:old.kind,seed:old.seed,policies:old.policies,rows:4,players:cfg.players.length,config:cfg,elapsedMs,
      people:g.results.map(p=>({...p,stats:g.industrial.players[p.playerId],econ:g.econ[p.playerId],tracks:g.tracks[p.playerId]})),pressure:g.rowPressure};
    for(const p of r.people) {
      assert.ok(p.stats.welfareBuys<=1);assert.equal(p.stats.welfareSpent,p.stats.welfareBuys*cost);
      const e=p.econ;assert.equal(e.start+e.gained-sum(Object.values(e.by)),e.final);
      const policy=cfg.players[p.playerId].aiRecovery;
      if(policy==='repression') assert.equal(p.stats.welfareBuys,0);
      if(policy==='welfare') assert.equal(p.stats.repressions,0);
      const hires=r.pressure.actions.filter(a=>a.seat===p.playerId&&a.welfareSaved>0);
      assert.ok(hires.every(a=>a.welfareSaved===1&&a.hirePaid>=1));
      if(!p.stats.welfareBuys) assert.equal(hires.length,0);
    }
    if(minimumOne) assert.ok(r.pressure.actions.filter(a=>a.type==='hire').every(a=>a.hirePaid>=1),'Tutte le assunzioni rispettano il minimo');
    assert.equal(sum(investmentUses(r).map(b=>b.uses)),sum(r.people.map(p=>p.stats.sustainableProductions)));
    assert.ok(r.pressure.actions.filter(a=>a.type==='investWelfare').every(a=>a.roles?.length===3));
    assert.deepEqual(hash(),fingerprint);
    records.push(r);fs.writeFileSync(`${prefix}-part${part}.json`,JSON.stringify({source,fingerprint:hash(),part,parts,records}));
    console.log(`${records.length}/${selected.length} ${key(r)} ${(elapsedMs/1000).toFixed(1)}s PV ${r.people.map(p=>`${p.playerId}:${p.total}`).join(' ')}`);
  }
} else if(process.argv[2]==='report') {
  const parts=Number(process.argv[3]),files=Array.from({length:parts},(_,i)=>JSON.parse(fs.readFileSync(`${prefix}-part${i}.json`)));
  files.forEach(f=>assert.deepEqual(f.fingerprint,hash()));
  const records=files.flatMap(f=>f.records);
  assert.deepEqual(records.map(key).sort(),jobs.map(jobKey).sort());
  const direct=rs=>{
    const pairs=rs.map(r=>{const seat=r.policies.indexOf('welfare');return {seed:r.seed,seat,welfare:metrics(r,seat),repression:metrics(r,1-seat)};});
    return {games:rs.length,wins:pairs.filter(p=>p.welfare.pv>p.repression.pv).length,ties:pairs.filter(p=>p.welfare.pv===p.repression.pv).length,
      difference:mean(pairs.map(p=>p.welfare.pv-p.repression.pv)),welfare:averages(pairs.map(p=>p.welfare)),repression:averages(pairs.map(p=>p.repression)),pairs};
  };
  const free=rs=>{
    const ps=rs.flatMap(r=>r.people.map(p=>metrics(r,p.playerId)));
    const buys=rs.flatMap(r=>investmentUses(r).map(b=>({...b,savings:metrics(r,b.seat).welfareHireSavings})));
    const prods=rs.flatMap(r=>r.pressure.productions);
    return {games:rs.length,players:ps.length,means:averages(ps),buys:buys.length,
      unused:buys.filter(b=>!b.uses&&!b.savings).length,paybackFromDiscount:buys.filter(b=>b.savings>=b.cost).length,
      meanPurchaseTurn:mean(buys.map(b=>b.turn)),meanSustainablePerBuyer:mean(buys.map(b=>b.uses)),
      uses:sum(buys.map(b=>b.uses)),blocked:prods.filter(p=>p.before.blocked>0).length,productions:prods.length,buysDetail:buys,
      byPlayers:[2,3,4].map(n=>({players:n,means:averages(rs.filter(r=>r.players===n).flatMap(r=>r.people.map(p=>metrics(r,p.playerId))))}))};
  };
  const all=minimumOne?records:[...baseline,...records];
  let previousComparison=null;
  if(minimumOne) {
    const old=JSON.parse(fs.readFileSync('reports/welfare-costi-2026-10-16-d6.json'));
    const previous=[...old.baseline,...old.records];
    assert.deepEqual(previous.map(key).sort(),records.map(key).sort());
    previousComparison=records.map(r=>{
      const before=previous.find(b=>key(b)===key(r));
      assert.deepEqual(r.config,before.config);
      return {key:key(r),samePeople:JSON.stringify(r.people)===JSON.stringify(before.people),samePressure:JSON.stringify(r.pressure)===JSON.stringify(before.pressure),
        pvChanges:r.people.map(p=>({seat:p.playerId,difference:p.total-before.people.find(b=>b.playerId===p.playerId).total}))};
    });
  }
  const summary=[3,4,5].map(cost=>{const rs=all.filter(r=>r.config.rowEconomy.welfareCost===cost);return {cost,
    free:free(rs.filter(r=>r.kind==='free')),direct:direct(rs.filter(r=>r.kind!=='free')),
    directOriginal:direct(rs.filter(r=>r.kind==='direct')),directAdditional:direct(rs.filter(r=>r.kind==='direct-fresh'))};});
  const f=x=>x.toFixed(2);
  const lines=['OFFICINA 1907 — COSTO DEL WELFARE — 16 OTTOBRE 2026',
    'Unica variabile: acquisto welfare a 3, 4 o 5 marchi. Benefici identici: copertura dei tre reparti, sconto di 1 sulle assunzioni Sopra, produzione sostenibile su una riga con recupero −1 locale. Nessun recupero immediato all’acquisto.',
    'Quattro righe, repressione −2 a prezzo progressivo, 28 turni, IA beam2 d6 r1 con gli stessi pesi. Il prezzo predefinito del simulatore resta invariato.',
    minimumOne?'72 nuove partite con minimo di assunzione 1: 12 tavoli liberi e 12 scontri diretti per ciascuno dei prezzi 3, 4 e 5. Nessuna partita riutilizzata nel nuovo campione; confronto appaiato con tutte le 72 partite precedenti.':
    '48 nuove partite: per ciascuno dei prezzi 4 e 5, 12 tavoli liberi (quattro per 2/3/4 giocatori) e 12 scontri diretti (sei scenari, posti invertiti). Riferimento: 24 partite salvate al prezzo 3. Hash di motore e IA identici; configurazioni differiscono soltanto nel prezzo.',
    ...(previousComparison?[`Rispetto al minimo zero: ${previousComparison.filter(r=>r.samePeople&&r.samePressure).length}/72 partite con risultati, contabilità e intera sequenza di azioni/tensione identici.`, 'Il confronto con il vecchio motore verifica che l’unica modifica sia il minimo di assunzione; IA e altre regole sono identiche.', 'In questi scenari il valore stampato minimo è 2 e il welfare applica un solo sconto di 1. Le carte struttura con ulteriori sconti non sono acquistabili nella variante: il minimo uno non cambia i prezzi raggiungibili. Il cumulo al limite è verificato separatamente da welfare-discount-check.js.']:[]),
    '', 'SCONTRI DIRETTI',
    'Un giocatore può usare solo welfare e l’altro solo repressione; nessun acquisto è obbligatorio. Questa restrizione è sperimentale, non una regola del gioco.',
    'Costo | Vittorie welfare /12 | Pareggi | PV welfare | PV repressione | Scarto welfare−repressione',
    ...summary.map(s=>`${s.cost} | ${s.direct.wins} | ${s.direct.ties} | ${f(s.direct.welfare.pv)} | ${f(s.direct.repression.pv)} | ${f(s.direct.difference)}`),
    '', 'TAVOLI LIBERI — 36 GIOCATORI-PARTITA PER PREZZO',
    'Costo | Acquirenti | Recuperano prezzo con soli sconti | Risparmi assunzioni totali | Produzioni sostenibili | Repressioni totali | Turno medio acquisto',
    ...summary.map(s=>`${s.cost} | ${s.free.buys} | ${s.free.paybackFromDiscount}/${s.free.buys} | ${sum(s.free.buysDetail.map(b=>b.savings))} | ${s.free.uses} | ${s.free.means.repressions*36} | ${f(s.free.meanPurchaseTurn)}`),
    '', 'MEDIE PER GIOCATORE NEI TAVOLI LIBERI',
    'Metrica | Costo 3 | Costo 4 | Costo 5',
    ...Object.keys(summary[0].free.means).map(k=>`${k} | ${summary.map(s=>f(s.free.means[k])).join(' | ')}`),
    '', 'RISULTATI DIRETTI PER SCENARIO E POSTO',
    ...summary.flatMap(s=>[`Costo ${s.cost}: primo gruppo ${s.directOriginal.wins}/6 vittorie, scarto ${f(s.directOriginal.difference)}; secondo gruppo ${s.directAdditional.wins}/6, scarto ${f(s.directAdditional.difference)}.`,
      ...s.direct.pairs.map(p=>`Seed ${p.seed}, welfare al posto ${p.seat+1}: ${p.welfare.pv} contro ${p.repression.pv} PV; acquisti ${p.welfare.welfareBuys}, produzioni sostenibili ${p.welfare.sustainable}, risparmio assunzioni ${p.welfare.welfareHireSavings}.`)]),
    '', 'CONTROLLI E LIMITI',
    'Verificati prezzo pagato, bilancio monetario, 28 turni, recupero −2, sconti effettivi, unicità dell’investimento aziendale, copertura dei tre reparti e rispetto delle politiche sperimentali. Nessuna modifica a regole o IA fra le prove.',
    'Sei scenari diretti restano un campione piccolo; i posti invertiti non sono osservazioni indipendenti. I prezzi cambiano l’intera sequenza di decisioni: gli scarti non sono il valore causale del singolo acquisto. Un andamento non monotono dei risultati è possibile con questa IA e questo campione.',
    'Il recupero del prezzo tramite sconti confronta soltanto denaro: non include il costo opportunità dell’azione di acquisto. Le produzioni sostenibili sono un beneficio ulteriore. machineryCoins misura rendite fisse, mentre le conversioni sono registrate separatamente nella contabilità completa.',
    'Nessun playtest umano. Questa prova confronta prezzi con una IA euristica; non dimostra equilibrio generale né optimalità delle strategie.'
  ];
  fs.writeFileSync(prefix+'.json',JSON.stringify({source,fingerprint:hash(),baseline:minimumOne?[]:baseline,records,summary,previousComparison}));
  fs.writeFileSync(prefix+'-summary.json',JSON.stringify(summary,null,2));
  fs.writeFileSync(prefix+'.txt',lines.join('\n'));console.log(lines.join('\n'));
} else throw new Error('Usare run PART PARTS oppure report PARTS');
