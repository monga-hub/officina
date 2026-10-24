// node scripts/welfare-factory-study.js run PART PARTS; node scripts/welfare-factory-study.js report PARTS
// WELFARE_DISCOUNT=1 uses the saved factory-welfare games to test the hiring discount instead.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import { runOneGame } from '../src/game/batchsim.js';
import { investmentUses, playerMetrics } from './welfare-use-analysis.js';

const discountStudy=process.env.WELFARE_DISCOUNT==='1';
const source=discountStudy?'reports/welfare-tre-reparti-2026-10-16-d6.json':'reports/welfare-nuova-ia-2026-10-16-d6.json';
const prefix=discountStudy?'reports/welfare-sconto-2026-10-16-d6':'reports/welfare-tre-reparti-2026-10-16-d6';
const saved=JSON.parse(fs.readFileSync(source)),baseline=discountStudy?saved.records.filter(r=>r.kind==='free'):saved.baseline,direct=saved.records.filter(r=>r.kind==='direct');
const beforeLabel=discountStudy?'Welfare aziendale senza sconto':'Welfare per reparto';
const afterLabel=discountStudy?'Welfare aziendale con sconto':'Welfare aziendale';
assert.equal(baseline.length,12);assert.equal(direct.length,6);
const hash=()=>Object.fromEntries(['ai.js','engine.js','data.js','row-economy.js','batchsim.js','row-pressure.js'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(`src/game/${p}`)).digest('hex')]));
assert.equal(hash()['ai.js'],saved.fingerprint['ai.js'],'Nessun cambiamento alla valutazione o ricerca IA');
const standardJobs=[...baseline.filter(b=>[1907,1909].includes(b.seed)).map(b=>({kind:'regression',old:b})),
  ...baseline.map(b=>({kind:'free',old:b})),...direct.map(b=>({kind:'direct',old:b}))];
const freshJobs=[];
for(let seed=16907;seed<=16909;seed++) for(const policies of [['welfare','repression'],['repression','welfare']]) {
  const template=direct.find(r=>r.policies.join('/')===policies.join('/'));
  freshJobs.push({kind:'direct-fresh',old:{seed,policies,config:{...structuredClone(template.config),seed}}});
}
const fresh=process.argv[2]==='fresh';
if(fresh) assert.ok(discountStudy,'La verifica su nuovi scenari riguarda lo sconto welfare');
const jobs=fresh?freshJobs:standardJobs;
const key=j=>`${j.kind}:${j.old.seed}:${j.old.policies?.join('/')||''}`;
const mean=xs=>xs.reduce((s,x)=>s+x,0)/xs.length;
const averages=ps=>Object.fromEntries(Object.keys(ps[0]).map(k=>[k,mean(ps.map(p=>p[k]))]));
const metrics=(r,seat)=>{
  const m=playerMetrics(r,seat),hires=r.pressure.actions.filter(a=>a.seat===seat&&a.welfareSaved>0);
  return {...m,recoveryActions:m.welfareBuys+m.repressions,welfareHireSavings:hires.reduce((s,a)=>s+a.welfareSaved,0),discountedHires:hires.length};
};
const json=x=>JSON.parse(JSON.stringify(x));

if(process.argv[2]==='run'||fresh) {
  const part=Number(process.argv[3]||0),parts=Number(process.argv[4]||4);
  assert.ok(Number.isInteger(part)&&part>=0&&part<parts);
  const selected=jobs.filter((_,i)=>i%parts===part),records=[],fingerprint=hash();
  for(const job of selected) {
    const old=job.old,cfg=structuredClone(old.config);
    if(job.kind!=='regression') {
      cfg.rowEconomy.welfareScope='factory';
      if(discountStudy) cfg.rowEconomy.welfareHireDiscount=true;
    }
    const withoutScope=c=>{const out=structuredClone(c);delete out.rowEconomy[discountStudy?'welfareHireDiscount':'welfareScope'];return out;};
    assert.deepEqual(withoutScope(cfg),withoutScope(old.config));
    assert.equal(cfg.trackModel,'righe4corte');assert.deepEqual(cfg.aiRollout,{depth:6,rollouts:1});
    assert.ok(cfg.players.every(p=>p.aiContinuation==='beam2'&&p.aiEvaluation==='baseline'));
    const start=performance.now(),g=runOneGame(cfg),elapsedMs=performance.now()-start;
    assert.ok(!g.failed);assert.equal(g.turns,28);assert.ok(g.rowPressure.unitRows);
    assert.equal(g.rowPressure.starts.length,28*cfg.players.length*3);
    assert.ok(g.rowPressure.recoveries.filter(x=>x.type==='repression').every(x=>x.reduction===Math.min(2,x.before.tension)));
    const record={kind:job.kind,seed:old.seed,policies:old.policies,rows:4,players:cfg.players.length,config:cfg,elapsedMs,
      people:g.results.map(p=>({...p,stats:g.industrial.players[p.playerId],econ:g.econ[p.playerId],tracks:g.tracks[p.playerId]})),pressure:g.rowPressure};
    if(job.kind==='regression') {
      assert.deepEqual(json(record.people),old.people,'Partita precedente identica: risultati, economia, investimenti e sviluppo');
      assert.deepEqual(json(record.pressure),old.pressure,'Identica sequenza di azioni e tensione con modalità per reparto');
    } else {
      record.people.forEach(p=>{
        assert.ok(p.stats.welfareBuys<=1);assert.equal(p.stats.welfareSpent,p.stats.welfareBuys*3);
        const e=p.econ;assert.equal(e.start+e.gained-Object.values(e.by).reduce((a,b)=>a+b,0),e.final);
        const policy=cfg.players[p.playerId].aiRecovery;
        if(policy==='repression') assert.equal(p.stats.welfareBuys,0);
        if(policy==='welfare') assert.equal(p.stats.repressions,0);
        if(discountStudy) {
          const discounted=record.pressure.actions.filter(a=>a.seat===p.playerId&&a.welfareSaved>0);
          assert.ok(discounted.every(a=>a.welfareSaved===1&&a.hirePaid>=1));
          if(!p.stats.welfareBuys) assert.equal(discounted.length,0);
        }
      });
      const uses=investmentUses(record);
      assert.equal(uses.reduce((s,x)=>s+x.uses,0),record.people.reduce((s,p)=>s+p.stats.sustainableProductions,0));
      assert.ok(record.pressure.actions.filter(a=>a.type==='investWelfare').every(a=>a.roles?.length===3));
    }
    assert.deepEqual(hash(),fingerprint);
    records.push(record);fs.writeFileSync(`${prefix}${fresh?'-fresh':''}-part${part}.json`,JSON.stringify({source,fingerprint,part,parts,records}));
    console.log(`${records.length}/${selected.length} ${key(job)} ${(elapsedMs/1000).toFixed(1)}s PV ${record.people.map(p=>`${p.playerId}:${p.total}`).join(' ')}`);
  }
} else if(process.argv[2]==='report') {
  const parts=Number(process.argv[3]||4),files=Array.from({length:parts},(_,i)=>JSON.parse(fs.readFileSync(`${prefix}-part${i}.json`)));
  files.forEach(f=>assert.deepEqual(f.fingerprint,hash()));
  const records=files.flatMap(f=>f.records);
  assert.deepEqual(records.map(r=>key({kind:r.kind,old:r})).sort(),jobs.map(key).sort());
  const freshFiles=process.argv[4]==='fresh'?Array.from({length:parts},(_,i)=>JSON.parse(fs.readFileSync(`${prefix}-fresh-part${i}.json`))):[];
  freshFiles.forEach(f=>assert.deepEqual(f.fingerprint,hash()));
  const freshRecords=freshFiles.flatMap(f=>f.records);
  if(freshFiles.length) assert.deepEqual(freshRecords.map(r=>key({kind:r.kind,old:r})).sort(),freshJobs.map(key).sort());
  const free=records.filter(r=>r.kind==='free'),heads=records.filter(r=>r.kind==='direct');
  const summarize=rs=>{
    const ps=rs.flatMap(r=>r.people.map(p=>metrics(r,p.playerId))),buys=rs.flatMap(investmentUses),prods=rs.flatMap(r=>r.pressure.productions);
    const savings=b=>metrics(rs.find(r=>r.seed===b.seed),b.seat).welfareHireSavings;
    return {games:rs.length,players:ps.length,means:averages(ps),buys:buys.length,
      unused:buys.filter(b=>!b.uses&&!savings(b)).length,sustainableUnused:buys.filter(b=>!b.uses).length,
      discountOnly:buys.filter(b=>!b.uses&&savings(b)>0).length,
      buyersSavingAtLeastCost:buys.filter(b=>savings(b)>=b.cost).length,
      uses:buys.reduce((s,b)=>s+b.uses,0),blocked:prods.filter(p=>p.before.blocked>0).length,productions:prods.length,
      blockedRate:prods.filter(p=>p.before.blocked>0).length/prods.length,
      departmentsUsed:rs.flatMap(r=>r.people.filter(p=>p.stats.welfareBuys>0).map(p=>({seed:r.seed,seat:p.playerId,
        n:new Set(r.pressure.productions.filter(a=>a.seat===p.playerId&&a.sustainable).map(a=>a.role)).size}))) };
  };
  const compare=rs=>{
    const pairs=rs.map(r=>{const seat=r.policies.indexOf('welfare');return {seed:r.seed,seat,welfare:metrics(r,seat),repression:metrics(r,1-seat)};});
    return {welfare:averages(pairs.map(p=>p.welfare)),repression:averages(pairs.map(p=>p.repression)),
      wins:pairs.filter(p=>p.welfare.pv>p.repression.pv).length,ties:pairs.filter(p=>p.welfare.pv===p.repression.pv).length,
      difference:mean(pairs.map(p=>p.welfare.pv-p.repression.pv)),pairs};
  };
  const bySeed=free.map(r=>{const b=baseline.find(b=>b.seed===r.seed);return {seed:r.seed,players:r.players,
    oldPV:mean(b.people.map(p=>p.total)),newPV:mean(r.people.map(p=>p.total)),
    difference:mean(r.people.map(p=>p.total))-mean(b.people.map(p=>p.total))};});
  const summary={previous:summarize(baseline),factory:summarize(free),bySeed,previousDirect:compare(direct),factoryDirect:compare(heads)};
  if(freshRecords.length) summary.freshDirect=compare(freshRecords);
  const f=x=>x.toFixed(2),a=summary.previous,b=summary.factory,d=summary.factoryDirect;
  const lines=[discountStudy?'OFFICINA 1907 — WELFARE AZIENDALE E SCONTO ASSUNZIONI — 16 OTTOBRE 2026':'OFFICINA 1907 — WELFARE SU TRE REPARTI — 16 OTTOBRE 2026',
    discountStudy?'Unica modifica: dopo l’acquisto del welfare aziendale, ogni operaio assunto Sopra nei tre reparti costa un marchio in meno. Avanzamento del valore stampato, cumulabile agli sconti preesistenti, prezzo minimo 1. Macchinari Sotto e impiegati in Direzione invariati. Welfare sempre 3 marchi e un’azione una sola volta, produzione sostenibile su una riga e recupero −1 locale; repressione −2.':'Unica modifica: un acquisto welfare da 3 marchi e un’azione abilita tutti e tre i reparti, anche quelli ancora vuoti. Nessun recupero immediato: ogni produzione sostenibile usa una riga e riduce di 1 soltanto la tensione del reparto attivato. Macchinari una volta, repressione −2 invariata.',
    'IA beam2 d6 r1, stessi pesi baseline; quattro righe da quattro caselle, 28 turni. Valori stampati, commesse, gare e altre regole invariati. Nessuna correzione durante i test.',
    `${20+freshRecords.length} nuove partite: 2 verifiche della modalità precedente (2 e 4 giocatori), 12 tavoli liberi con welfare aziendale, 6 scontri diretti appaiati${freshRecords.length?', più 6 scontri su tre scenari nuovi':''}. Riferimento: 12 tavoli liberi e 6 scontri precedentemente salvati. Le due verifiche riproducono esattamente risultati, economia e sequenza di azioni/tensione.`,
    '', 'LETTURA DEL CAMPIONE',
    `Acquisti senza alcun beneficio osservato: ${b.unused} su ${b.buys}, contro ${a.unused} su ${a.buys}; ${b.departmentsUsed.filter(p=>p.n>=2).length} acquirenti usano la produzione sostenibile in più reparti.`,
    `Nei tavoli liberi la spesa media per welfare e repressione passa da ${f(a.means.managementSpent)} a ${f(b.means.managementSpent)} marchi, mentre le risorse dal tracciato passano da ${f(a.means.trackResources)} a ${f(b.means.trackResources)}.`,
    `Negli scontri diretti il welfare passa da ${summary.previousDirect.wins} a ${d.wins} vittorie su sei; lo scarto medio rispetto alla repressione passa da ${f(summary.previousDirect.difference)} a ${f(d.difference)} PV. Questo non dimostra ancora parità fra strategie.`,
    ...(summary.freshDirect?[`Sui tre scenari nuovi: ${summary.freshDirect.wins}/6 vittorie welfare e scarto medio ${f(summary.freshDirect.difference)} PV. Il vantaggio resta osservabile, ma la repressione può vincere; il campione non dimostra una probabilità di vittoria generale.`]:[]),
    discountStudy?`Risparmio totale sulle assunzioni: ${f(b.means.welfareHireSavings*b.players)} marchi. ${b.buyersSavingAtLeastCost} acquirenti recuperano almeno i 3 marchi di investimento attraverso i soli sconti; l’azione di acquisto ha comunque un costo opportunità. ${b.discountOnly} acquirenti sfruttano solo lo sconto e non producono mai in modo sostenibile.`:'La copertura aziendale elimina la necessità di scegliere e pagare separatamente i reparti da proteggere. Restano le scelte su quando investire e quando produrre in modo intenso o sostenibile. La frequenza di acquisto è un comportamento osservato dell’IA, non una prova che l’acquisto sia obbligatorio.',
    '', 'TAVOLI LIBERI — 36 GIOCATORI-PARTITA PER VERSIONE',
    'Stessi 12 seed 1907–1912 e 7907–7912, quattro tavoli per ciascun numero di giocatori (2/3/4). Tutti possono usare sia welfare sia repressione. Più punti in questi tavoli non dimostrano maggiore forza contro un avversario: cambiano anche le interazioni.',
    `Voce | ${beforeLabel} | ${afterLabel}`,
    ...Object.keys(a.means).map(k=>`${k} | ${f(a.means[k])} | ${f(b.means[k])}`),
    `Acquisti: ${a.buys} → ${b.buys}; mai usati: ${a.unused} → ${b.unused}; produzioni sostenibili: ${a.uses} → ${b.uses}.`,
    `Produzioni con righe sviluppate bloccate prima dell’incasso: ${a.blocked}/${a.productions} (${f(a.blockedRate*100)}%) → ${b.blocked}/${b.productions} (${f(b.blockedRate*100)}%). La prevenzione può ridurre i blocchi osservati: non equivale a eliminare la tensione come incentivo.`,
    ...[0,1,2,3].map(n=>`Acquirenti aziendali che usano il beneficio in ${n} reparti: ${b.departmentsUsed.filter(p=>p.n===n).length}.`),
    '', 'SCONTRI DIRETTI — SEI PARTITE SU TRE SEED, POSTI INVERTITI',
    'Uno può recuperare solo tramite welfare, l’altro solo tramite repressione. Nessun acquisto o recupero obbligatorio. Stessi seed 9907–9909 e posti del precedente confronto; il confronto è appaiato, non un nuovo campione indipendente.',
    `${beforeLabel}: ${summary.previousDirect.wins}/6 vittorie, scarto medio ${f(summary.previousDirect.difference)} PV. ${afterLabel}: ${d.wins}/6 vittorie, ${d.ties} pareggi, scarto medio ${f(d.difference)} PV.`,
    `Voce | Solo ${afterLabel.toLowerCase()} | Solo repressione`,
    ...Object.keys(d.welfare).map(k=>`${k} | ${f(d.welfare[k])} | ${f(d.repression[k])}`),
    ...d.pairs.map(p=>`Seed ${p.seed}, welfare al posto ${p.seat+1}: ${p.welfare.pv} contro ${p.repression.pv} PV.`),
    '', 'TAVOLI LIBERI PER SEED',...bySeed.map(s=>`${s.seed}, ${s.players} giocatori: ${f(s.oldPV)} → ${f(s.newPV)} PV medi (${f(s.difference)}).`),
    ...(summary.freshDirect?['','VERIFICA SUCCESSIVA SU SCENARI NUOVI',
      'Dopo le sei vittorie sui seed appaiati, aggiunte sei partite sui seed 16907–16909, due posti per scenario. Nessuna modifica a regole o IA. Sono prove aggiuntive della sola variante con sconto, non un confronto appaiato con la variante senza sconto. Totale di questo studio: 26 nuove partite.',
      `Vittorie welfare ${summary.freshDirect.wins}/6, pareggi ${summary.freshDirect.ties}; scarto medio welfare−repressione ${f(summary.freshDirect.difference)} PV.`,
      `PV medi: welfare ${f(summary.freshDirect.welfare.pv)}, repressione ${f(summary.freshDirect.repression.pv)}.`,
      ...summary.freshDirect.pairs.map(p=>`Seed ${p.seed}, welfare al posto ${p.seat+1}: ${p.welfare.pv} contro ${p.repression.pv} PV.`)]:[]),
    '', 'LIMITI',
    'Il numero di scenari diretti resta piccolo per dichiarare bilanciamento o dominanza. I posti invertiti e i giocatori dello stesso tavolo non sono osservazioni indipendenti. Le partite cambiano mercato e sequenza di decisioni: nessuno scarto è il valore causale esatto del singolo acquisto.',
    'IA euristica a profondità sei, due continuazioni proprie e avversari greedy. La valutazione preesistente del welfare per reparto attivo resta identica. Nessun nuovo premio euristico per le assunzioni future: lo sconto entra nei costi reali delle azioni simulate. Nessun peso è stato aumentato per incentivare gli acquisti.',
    'machineryCoins indica rendite fisse; gli incassi da conversioni restano nella contabilità completa salvata. recoveryActions somma investimenti e repressioni; non conta come azione separata il recupero durante la produzione sostenibile.',
  ];
  fs.writeFileSync(prefix+'.json',JSON.stringify({source,fingerprint:hash(),baseline,direct,records,freshRecords,summary}));
  fs.writeFileSync(prefix+'-summary.json',JSON.stringify(summary,null,2));
  fs.writeFileSync(prefix+'.txt',lines.join('\n'));console.log(lines.join('\n'));
} else throw new Error('Usare run o report');
