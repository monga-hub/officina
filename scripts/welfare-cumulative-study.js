// node scripts/welfare-cumulative-study.js run PART PARTS; node scripts/welfare-cumulative-study.js report PARTS
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {runOneGame} from '../src/game/batchsim.js';
import {playerMetrics} from './welfare-use-analysis.js';

const source='reports/welfare-costi-2026-10-16-d6.json';
const prefix='reports/welfare-cumulabile-2026-10-16-d6';
const saved=JSON.parse(fs.readFileSync(source));
const baseline=saved.baseline;
assert.equal(baseline.length,24);
const hash=()=>Object.fromEntries(Object.keys(saved.fingerprint).map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(`src/game/${p}`)).digest('hex')]));
const fingerprint=hash();
for(const p of Object.keys(fingerprint).filter(p=>p!=='engine.js')) assert.equal(fingerprint[p],saved.fingerprint[p],`${p}: invariato rispetto allo studio precedente`);
const ordered=[...baseline].sort((a,b)=>(a.kind==='free')-(b.kind==='free')||a.players-b.players||a.seed-b.seed||String(a.policies).localeCompare(String(b.policies)));
const jobs=ordered.flatMap(old=>[3,4,5].map(cost=>({cost,old})));
const key=r=>`${r.config.rowEconomy.welfareCost}:${r.kind}:${r.seed}:${r.policies?.join('/')||''}`;
const jobKey=j=>`${j.cost}:${j.old.kind}:${j.old.seed}:${j.old.policies?.join('/')||''}`;
const sum=xs=>xs.reduce((a,b)=>a+b,0),mean=xs=>sum(xs)/xs.length;
const averages=ps=>Object.fromEntries(Object.keys(ps[0]).map(k=>[k,mean(ps.map(p=>p[k]))]));
const metrics=(r,seat)=>({...playerMetrics(r,seat),welfareHireSavings:sum(r.pressure.actions.filter(a=>a.seat===seat).map(a=>a.welfareSaved||0))});

if(process.argv[2]==='run') {
  const part=Number(process.argv[3]),parts=Number(process.argv[4]);
  assert.ok(Number.isInteger(part)&&part>=0&&part<parts);
  const selected=jobs.filter((_,i)=>i%parts===part),file=`${prefix}-part${part}.json`;
  const checkpoint=fs.existsSync(file)?JSON.parse(fs.readFileSync(file)):null;
  if(checkpoint) assert.deepEqual(checkpoint.fingerprint,fingerprint);
  const records=checkpoint?.records||[];
  assert.ok(records.every(r=>selected.some(j=>jobKey(j)===key(r))));
  for(const {cost,old} of selected) {
    if(records.some(r=>key(r)===jobKey({cost,old}))) continue;
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
      assert.equal(p.stats.welfareBuys,r.pressure.actions.filter(a=>a.seat===p.playerId&&a.type==='investWelfare').length);assert.ok(p.stats.sustainableWelfare.every(n=>n===p.stats.welfareBuys));assert.equal(p.stats.welfareSpent,p.stats.welfareBuys*cost);
      const e=p.econ;assert.equal(e.start+e.gained-sum(Object.values(e.by)),e.final);
      const policy=cfg.players[p.playerId].aiRecovery;
      if(policy==='repression') assert.equal(p.stats.welfareBuys,0);
      if(policy==='welfare') assert.equal(p.stats.repressions,0);
      const hires=r.pressure.actions.filter(a=>a.seat===p.playerId&&a.welfareSaved>0);
      assert.ok(hires.every(a=>a.welfareSaved>=1&&a.welfareSaved<=p.stats.welfareBuys&&a.hirePaid>=1));
      if(!p.stats.welfareBuys) assert.equal(hires.length,0);
    }
    assert.ok(r.pressure.actions.filter(a=>a.type==='hire').every(a=>a.hirePaid>=1),'Tutte le assunzioni rispettano il minimo');
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
    const purchases=rs.flatMap(r=>r.people.flatMap(p=>{
      const buys=r.pressure.actions.filter(a=>a.seat===p.playerId&&a.type==='investWelfare');
      return buys.map((buy,i)=>({seed:r.seed,seat:p.playerId,ordinal:i+1,turn:buy.turn,
        savings:r.pressure.actions.filter(a=>a.seat===p.playerId&&a.type==='hire'&&a.seq>buy.seq&&a.welfareSaved>=i+1).length,
        sustainable:i===0?p.stats.sustainableProductions:0}));
    }));
    assert.equal(sum(purchases.map(b=>b.savings)),sum(ps.map(p=>p.welfareHireSavings)),'Risparmi attribuiti una sola volta ai welfare in ordine di acquisto');
    return {games:rs.length,players:ps.length,means:averages(ps),buyers:ps.filter(p=>p.welfareBuys>0).length,
      buys:purchases.length,unused:purchases.filter(b=>!b.savings&&!b.sustainable).length,
      paybackFromDiscount:ps.filter(p=>p.welfareBuys&&p.welfareHireSavings>=p.welfareSpent).length,
      uses:sum(ps.map(p=>p.sustainable)),histogram:[0,1,2,3,4].map(n=>({buys:n===4?'4+':n,players:ps.filter(p=>n===4?p.welfareBuys>=4:p.welfareBuys===n).length})),
      purchases,meanPurchaseTurn:mean(purchases.map(b=>b.turn)),
      extraBuys:purchases.filter(b=>b.ordinal>1).length,
      extraBuySavings:sum(purchases.filter(b=>b.ordinal>1).map(b=>b.savings)),
      extraBuysPayback:purchases.filter(b=>b.ordinal>1&&b.savings>=rs[0].config.rowEconomy.welfareCost).length};
  };
  const all=records;
  const summary=[3,4,5].map(cost=>{const rs=all.filter(r=>r.config.rowEconomy.welfareCost===cost);return {cost,
    free:free(rs.filter(r=>r.kind==='free')),direct:direct(rs.filter(r=>r.kind!=='free')),
    directOriginal:direct(rs.filter(r=>r.kind==='direct')),directAdditional:direct(rs.filter(r=>r.kind==='direct-fresh'))};});
  const f=x=>x.toFixed(2);
  const lines=['OFFICINA 1907 — WELFARE CUMULABILE, ASSUNZIONI MINIMO 1',
    '72 nuove partite: 12 tavoli liberi (quattro per 2/3/4 giocatori) e 12 scontri diretti (sei scenari, posti invertiti) per ciascuno dei prezzi 3, 4 e 5.',
    'Acquisti welfare aziendali senza limite, ciascuno costa il prezzo indicato e un turno. Ogni acquisto aggiunge −1 alle assunzioni Sopra nei tre reparti; costo minimo 1, avanzamento del valore stampato. Macchinari e impiegati esclusi dallo sconto.',
    'Il primo welfare abilita la produzione sostenibile: una riga, macchinari una volta, tensione −1 locale. Gli acquisti successivi non aumentano il recupero né danno punti. Nessun recupero immediato all’acquisto.',
    'Quattro righe, repressione −2 a costo progressivo, 28 turni, IA beam2 d6 r1. Nessun ritocco alla ricerca o ai pesi IA per favorire acquisti ripetuti. Il prezzo predefinito resta invariato.',
    '', 'SCONTRI DIRETTI',
    'Un giocatore può recuperare solo tramite welfare, l’altro solo tramite repressione; nessun acquisto obbligatorio. Politiche sperimentali, non nuove regole.',
    'Costo | Vittorie welfare /12 | Pareggi | PV welfare | PV repressione | Scarto welfare−repressione | Welfare comprati dal lato welfare (media)',
    ...summary.map(s=>`${s.cost} | ${s.direct.wins} | ${s.direct.ties} | ${f(s.direct.welfare.pv)} | ${f(s.direct.repression.pv)} | ${f(s.direct.difference)} | ${f(s.direct.welfare.welfareBuys)}`),
    '', 'TAVOLI LIBERI — 36 GIOCATORI-PARTITA PER PREZZO',
    'Costo | Acquirenti | Acquisti totali | Recuperano spesa totale con soli sconti | Sconti totali | Produzioni sostenibili | Repressioni',
    ...summary.map(s=>`${s.cost} | ${s.free.buyers} | ${s.free.buys} | ${s.free.paybackFromDiscount}/${s.free.buyers} | ${f(s.free.means.welfareHireSavings*36)} | ${s.free.uses} | ${f(s.free.means.repressions*36)}`),
    ...summary.map(s=>`Costo ${s.cost}, distribuzione acquisti: ${s.free.histogram.map(h=>`${h.buys} welfare: ${h.players} giocatori`).join('; ')}.`),
    ...summary.map(s=>`Costo ${s.cost}: ${s.free.extraBuys} acquisti successivi al primo; ${s.free.extraBuySavings} ducati di sconto attribuiti a questi acquisti, ${s.free.extraBuysPayback} recuperano il proprio prezzo. Acquisti senza beneficio osservato: ${s.free.unused}.`),
    '', 'MEDIE PER GIOCATORE NEI TAVOLI LIBERI',
    'Metrica | Costo 3 | Costo 4 | Costo 5',
    ...Object.keys(summary[0].free.means).map(k=>`${k} | ${summary.map(s=>f(s.free.means[k])).join(' | ')}`),
    '', 'SCONTRI PER SCENARIO',
    ...summary.flatMap(s=>[`Costo ${s.cost}: gruppo 9907–9909 ${s.directOriginal.wins}/6 vittorie, scarto ${f(s.directOriginal.difference)}; gruppo 16907–16909 ${s.directAdditional.wins}/6, scarto ${f(s.directAdditional.difference)}.`,
      ...s.direct.pairs.map(p=>`Seed ${p.seed}, welfare posto ${p.seat+1}: ${p.welfare.pv} contro ${p.repression.pv} PV; welfare comprati ${p.welfare.welfareBuys}, produzioni sostenibili ${p.welfare.sustainable}, risparmio assunzioni ${p.welfare.welfareHireSavings}.`)]),
    '', 'LIMITI E CONTROLLI',
    'Sei scenari diretti sono pochi per dichiarare bilanciamento; i posti invertiti non sono indipendenti. I risultati dipendono dalle capacità dell’IA. Nessun playtest umano.',
    'L’attribuzione degli sconti ai singoli acquisti segue l’ordine cronologico: il primo ducato risparmiato va al primo welfare, il secondo al secondo, ecc. È contabilità sul calendario effettivo, non una stima causale del valore di rimuovere una carta. La produzione sostenibile è attribuita solo al primo welfare, senza moltiplicare i benefici nei conteggi.',
    'Verificati bilancio, prezzo di ogni acquisto, assenza di limiti artificiali, minimo di ogni assunzione, sconti effettivi, copertura aziendale, recupero −2, politiche di recupero e congelamento di motore/IA. Controlli dedicati verificano cinque welfare e valori operai 2/3/4, con avanzamento stampato e recupero sostenibile sempre −1.',
    'I dati del precedente investimento unico restano in welfare-costi-2026-10-16-d6: non rappresentano questa regola cumulabile. La ripetizione con minimo uno e investimento unico è stata interrotta alla precisazione dell’utente.'
  ];
  fs.writeFileSync(prefix+'.json',JSON.stringify({source,fingerprint:hash(),records,summary}));
  fs.writeFileSync(prefix+'-summary.json',JSON.stringify(summary,null,2));
  fs.writeFileSync(prefix+'.txt',lines.join('\n'));console.log(lines.join('\n'));
} else throw new Error('Usare run PART PARTS oppure report PARTS');
