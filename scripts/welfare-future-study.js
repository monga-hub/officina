// Eseguire per tutte le parti: run PART PARTS, poi verify PART PARTS; infine report.
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {initGame,applyCommand,legalCommands,scorePlayer} from '../src/game/engine.js';
import {chooseCommand,continuationValue,resetRolloutStats} from '../src/game/ai.js';
import {newRowPressure,observeRowPressure,sampleRowPressureStart} from '../src/game/row-pressure.js';

const prefix='reports/welfare-beneficio-futuro-2026-10-16-d6';
// JSON standard convertirebbe in null le milestone assenti (Infinity).
const stringify=value=>JSON.stringify(value,(_key,v)=>v===Infinity?{$officinaNumber:'Infinity'}:v);
const parse=text=>JSON.parse(text,(_key,v)=>v?.$officinaNumber==='Infinity'?Infinity:v);
const reference=JSON.parse(fs.readFileSync('reports/welfare-cumulabile-2026-10-16-d6.json'));
const template=reference.records.find(r=>r.kind==='free'&&r.players===2).config;
const hash=()=>Object.fromEntries(['engine.js','ai.js','row-pressure.js','row-economy.js','data.js'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(`src/game/${p}`)).digest('hex')]));
const fingerprint=hash();
assert.equal(fingerprint['ai.js'],reference.fingerprint['ai.js'],'Nessuna modifica a ricerca o pesi IA');
const jobs=[1907,26907,26908].flatMap(seed=>[3,4,5].map(cost=>({seed,cost})));
const roles=['terziario','secondario','primario'];
const sum=xs=>xs.reduce((a,b)=>a+b,0),mean=xs=>xs.length?sum(xs)/xs.length:null;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const countW=p=>p.depts.terziario.sustainableWelfare;
function finishTurn(state,seat) {
  let s=state,n=0;
  while(!s.gameOver&&(s.current===seat||s.pending)&&n++<1000) {
    const cmd=chooseCommand(s);assert.ok(cmd);s=applyCommand(s,cmd);
  }
  assert.ok(n<1000);return s;
}
function summary(s,pressure) {
  assert.ok(s.gameOver);assert.equal(s.turn,28);
  for(const p of s.players) {
    assert.equal(p.coinsStart+p.coinsGained-sum(Object.values(p.coinsSpentBy)),p.coins);
    assert.ok(roles.every(role=>p.depts[role].sustainableWelfare===p.industrialStats.welfareBuys));
    assert.equal(p.industrialStats.welfareSpent,p.industrialStats.welfareBuys*s.rowEconomy.welfareCost);
  }
  assert.ok(pressure.actions.filter(a=>a.type==='hire').every(a=>a.hirePaid>=1));
  assert.ok(pressure.productions.filter(p=>p.sustainable).every(p=>p.actualRows===Math.min(p.before.welfare,p.before.available)&&p.after.tension===Math.max(0,p.before.tension-1)));
  assert.ok(pressure.recoveries.filter(r=>r.type==='repression').every(r=>r.reduction===Math.min(2,r.before.tension)));
  return {people:s.players.map(p=>({...scorePlayer(s,p),stats:p.industrialStats,coinsGainedBy:p.coinsGainedBy,coinsSpentBy:p.coinsSpentBy})),pressure};
}
function complete(initial,capture=false,forced=[]) {
  resetRolloutStats();let s=initial,n=0;const pressure=newRowPressure(s),snapshots=[],opportunities=[];
  assert.ok(pressure.unitRows);
  for(const cmd of forced) {const before=s;s=applyCommand(s,cmd);observeRowPressure(pressure,before,cmd,s);}
  while(!s.gameOver&&n++<20000) {
    sampleRowPressureStart(pressure,s);
    const cmd=chooseCommand(s);assert.ok(cmd);
    const seat=s.current,p=s.players[seat];
    if(capture&&!s.pending&&s.phase==='move'&&countW(p)===1&&s.turn<=18) {
      const move=legalCommands(s).find(c=>c.type==='move'&&c.node==='Servizi');
      if(move) {
        const moved=applyCommand(s,move),buy=legalCommands(moved).find(c=>c.type==='investWelfare');
        if(buy) {
          const selected=same(cmd,move)&&chooseCommand(moved).type==='investWelfare';
          opportunities.push({seat,turn:s.turn,selected});
          if(!selected&&!snapshots.some(x=>x.seat===seat)) snapshots.push({seat,turn:s.turn,state:structuredClone(s),move,buy,chosenMove:cmd,actionIndex:pressure.actions.length});
        }
      }
    }
    const before=s;s=applyCommand(s,cmd);observeRowPressure(pressure,before,cmd,s);
  }
  assert.ok(n<20000);return {...summary(s,pressure),snapshots,opportunities};
}
function outcome(result,seat,start=0) {
  const p=result.people.find(p=>p.playerId===seat),opponent=result.people.find(p=>p.playerId!==seat);
  const prods=result.pressure.productions.filter(a=>a.seat===seat&&a.seq>=start);
  const hires=result.pressure.actions.filter(a=>a.seat===seat&&a.seq>=start&&a.type==='hire');
  return {pv:p.total,opponentPV:opponent.total,margin:p.total-opponent.total,welfare:p.stats.welfareBuys,
    resources:sum(prods.map(a=>a.actualRows)),sustainable:prods.filter(a=>a.sustainable).length,
    secondLineUses:prods.filter(a=>a.sustainable&&a.actualRows>=2).length,
    hireSavings:sum(hires.map(a=>a.welfareSaved||0)),secondDiscountUses:hires.filter(a=>a.welfareSaved>=2).length,
    contracts:p.nContracts,coins:p.coins};
}

if(process.argv[2]==='run') {
  const part=Number(process.argv[3]),parts=Number(process.argv[4]);
  assert.ok(Number.isInteger(part)&&part>=0&&part<parts);
  for(const [index,job] of jobs.entries()) {
    if(index%parts!==part) continue;
    const cfg=structuredClone(template);cfg.seed=job.seed;cfg.rowEconomy.welfareCost=job.cost;
    assert.deepEqual(cfg.aiRollout,{depth:6,rollouts:1});assert.equal(cfg.trackModel,'righe4corte');
    assert.ok(cfg.players.every(p=>p.aiRecovery==='free'&&p.aiContinuation==='beam2'&&p.aiEvaluation==='baseline'));
    const file=`${prefix}-${job.seed}-c${job.cost}.json`,initial=initGame(cfg);
    let data=fs.existsSync(file)?parse(fs.readFileSync(file)):null;
    if(data) {assert.deepEqual(data.fingerprint,fingerprint);assert.deepEqual(data.config,cfg);}
    const save=()=>{assert.deepEqual(hash(),fingerprint);fs.writeFileSync(file,stringify(data));};
    if(!data) {
      const started=performance.now(),baseline=complete(initial,true);
      data={...job,config:cfg,fingerprint,baseline,decisions:[],baselineMs:performance.now()-started,complete:false};save();
      console.log(`${job.seed} costo ${job.cost}: partita libera conclusa, welfare ${baseline.people.map(p=>p.stats.welfareBuys)}, ${baseline.snapshots.length} rinunce da verificare`);
    }
    for(const snap of data.baseline.snapshots) {
      if(data.decisions.some(d=>d.seat===snap.seat)) continue;
      const frozen=structuredClone(snap.state),started=performance.now();
      const bought=applyCommand(applyCommand(snap.state,snap.move),snap.buy);
      const alternative=finishTurn(snap.state,snap.seat);
      assert.equal(bought.turn,alternative.turn);assert.equal(bought.current,alternative.current);
      const lookahead=[6,10].map(depth=>({depth,buy:continuationValue(bought,depth,snap.seat),alternative:continuationValue(alternative,depth,snap.seat)}));
      const counterfactual=complete(snap.state,false,[snap.move,snap.buy]);
      const control=outcome(data.baseline,snap.seat,snap.actionIndex),forced=outcome(counterfactual,snap.seat);
      assert.deepEqual(snap.state,frozen);
      data.decisions.push({seat:snap.seat,turn:snap.turn,chosenMove:snap.chosenMove,coinsBefore:snap.state.players[snap.seat].coins,
        development:roles.map(role=>snap.state.players[snap.seat].depts[role].prod),lookahead,control,forced,
        pvDifference:forced.pv-control.pv,marginDifference:forced.margin-control.margin,counterfactual,elapsedMs:performance.now()-started});save();
      console.log(`${job.seed} costo ${job.cost}, posto ${snap.seat+1} turno ${snap.turn}: comprare ora ΔPV ${forced.pv-control.pv}, Δmargine ${forced.margin-control.margin}, d6 ${lookahead[0].buy-lookahead[0].alternative}, d10 ${lookahead[1].buy-lookahead[1].alternative}`);
    }
    data.complete=true;save();
  }
} else if(process.argv[2]==='verify') {
  const part=Number(process.argv[3]),parts=Number(process.argv[4]);
  for(const [index,job] of jobs.entries()) {
    if(index%parts!==part) continue;
    const file=`${prefix}-${job.seed}-c${job.cost}.json`,data=parse(fs.readFileSync(file));
    assert.ok(data.complete);assert.deepEqual(data.fingerprint,fingerprint);initGame(data.config);
    if(data.replayVerified) continue;
    for(const snap of data.baseline.snapshots) {
      const control=complete(snap.state),decision=data.decisions.find(d=>d.seat===snap.seat);
      assert.ok(same(control.people,data.baseline.people),'Controllo ripreso identico alla partita originale');
      for(const field of ['actions','productions','recoveries']) {
        const expected=data.baseline.pressure[field].filter(a=>a.seq>=snap.actionIndex).map(a=>({...a,seq:a.seq-snap.actionIndex}));
        assert.ok(same(control.pressure[field],expected),`Controllo: ${field} identiche`);
      }
      const bought=complete(snap.state,false,[snap.move,snap.buy]);
      assert.ok(same(bought,decision.counterfactual),'Intervento riprodotto dopo salvataggio/rilettura');
      console.log(`Verificato ${job.seed} costo ${job.cost} posto ${snap.seat+1}: controllo e intervento identici dopo rilettura`);
    }
    assert.deepEqual(hash(),fingerprint);data.replayVerified=true;fs.writeFileSync(file,stringify(data));
  }
} else if(process.argv[2]==='report') {
  const records=jobs.map(j=>parse(fs.readFileSync(`${prefix}-${j.seed}-c${j.cost}.json`)));
  records.forEach(r=>{assert.ok(r.complete&&r.replayVerified);assert.deepEqual(r.fingerprint,fingerprint);});
  const decisions=records.flatMap(r=>r.decisions.map(d=>({...d,seed:r.seed,cost:r.cost})));
  const totals=ds=>({n:ds.length,ownPVBetter:ds.filter(d=>d.pvDifference>0).length,ownPVEqual:ds.filter(d=>d.pvDifference===0).length,
    marginBetter:ds.filter(d=>d.marginDifference>0).length,marginEqual:ds.filter(d=>d.marginDifference===0).length,
    meanPV:mean(ds.map(d=>d.pvDifference)),meanMargin:mean(ds.map(d=>d.marginDifference)),
    longerFavorsBuy:ds.filter(d=>d.lookahead[0].buy<=d.lookahead[0].alternative&&d.lookahead[1].buy>d.lookahead[1].alternative).length,
    longReversalConfirmed:ds.filter(d=>d.lookahead[0].buy<=d.lookahead[0].alternative&&d.lookahead[1].buy>d.lookahead[1].alternative&&d.marginDifference>0).length});
  const natural=[3,4,5].map(cost=>{const rs=records.filter(r=>r.cost===cost),people=rs.flatMap(r=>r.baseline.people);
    return {cost,games:rs.length,players:people.length,histogram:[0,1,2,3,4].map(n=>({buys:n===4?'4+':n,n:people.filter(p=>n===4?p.stats.welfareBuys>=4:p.stats.welfareBuys===n).length})),
      purchases:sum(people.map(p=>p.stats.welfareBuys)),meanPV:mean(people.map(p=>p.total)),counterfactual:totals(decisions.filter(d=>d.cost===cost))};});
  const result={games:records.length,branches:decisions.length,natural,overall:totals(decisions)};
  const f=x=>x===null?'n/d':x.toFixed(2);
  const lines=['OFFICINA 1907 — SECONDO WELFARE: PRODUZIONE E BENEFICIO FUTURO',
    'Regola corretta: N welfare permettono N righe sostenibili accessibili e sconto N sulle assunzioni Sopra; prezzo minimo 1. Righello produzione/tensione invariato, recupero sostenibile −1, macchinari una volta, nessun PV welfare. Quattro righe, repressione −2, 28 turni.',
    'IA baseline beam2 d6 r1 invariata: stesso file ai.js del confronto precedente. Nessuna quota, premio aggiuntivo o modifica ai pesi per welfare.',
    `${records.length} partite libere a due giocatori: seed 1907 (noto), 26907 e 26908 (nuovi), ciascuno a costo 3/4/5. Tutti possono usare welfare e repressione.`,
    `${decisions.length} continuazioni fino a fine partita: prima opportunità legale rifiutata da ciascun giocatore, con esattamente un welfare e non oltre il turno 18. Criterio fissato prima dei risultati; nessuna selezione in base al successo finale.`,
    'Intervento: si paga il movimento a Welfare e si compra il secondo, spendendo denaro e turno. Poi entrambi i giocatori continuano con la stessa IA d6 fino alla fine. Controllo: prosecuzione effettiva della partita libera dallo stesso identico stato. Nessun divieto di comprare welfare in seguito, da nessuno dei due rami.',
    'D6/d10: valutazione delle due continuazioni dopo aver completato il turno corrente, con stesso algoritmo e pesi. D10 si applica simmetricamente a entrambe le alternative e non viene usato per scegliere mosse nelle partite. Questo confronto allineato non ricostruisce tutti i punteggi intermedi della scelta originale di movimento.',
    '', 'ACQUISTI SPONTANEI',
    ...natural.map(r=>`Costo ${r.cost}, ${r.players} giocatori-partita: ${r.histogram.map(h=>`${h.buys} welfare: ${h.n}`).join('; ')}; PV medi ${f(r.meanPV)}.`),
    '', 'COMPRARE IL SECONDO ORA CONTRO LA SCELTA EFFETTIVA',
    ...[...natural.map(n=>({cost:n.cost,...n.counterfactual})),{cost:'Tutti',...result.overall}].map(r=>`Costo ${r.cost}: ${r.n} stati; PV migliori ${r.ownPVBetter}, pari ${r.ownPVEqual}; margine migliore ${r.marginBetter}, pari ${r.marginEqual}; ΔPV medio ${f(r.meanPV)}, Δmargine medio ${f(r.meanMargin)}. D10 ribalta d6 a favore dell’acquisto in ${r.longerFavorsBuy} casi, confermati da margine finale migliore in ${r.longReversalConfirmed}.`),
    ...decisions.map(d=>`Seed ${d.seed}, costo ${d.cost}, posto ${d.seat+1}, turno ${d.turn}: ΔPV ${d.pvDifference}, Δmargine ${d.marginDifference}; welfare finali ${d.control.welfare} → ${d.forced.welfare}; usi seconda riga ${d.control.secondLineUses} → ${d.forced.secondLineUses}; usi secondo sconto ${d.control.secondDiscountUses} → ${d.forced.secondDiscountUses}; preferenza acquisto d6 ${f(d.lookahead[0].buy-d.lookahead[0].alternative)}, d10 ${f(d.lookahead[1].buy-d.lookahead[1].alternative)}.`),
    '', 'RIPRODUCIBILITÀ',
    'Tutti gli snapshot sono stati salvati e riletti conservando anche le milestone assenti (Infinity). Per ciascuno sono stati rieseguiti sia controllo sia intervento: punteggi e contabilità identici; controllo con identica sequenza di azioni/produzioni/recuperi e intervento con telemetria identica. I replay di verifica non sono nuovi scenari indipendenti.',
    '', 'LIMITI',
    'La prova misura comprare ora rispetto a rimandare o fare altro, non possedere welfare contro non possederlo mai. Anche il controllo può comprare il secondo in seguito. Margine = PV propri meno PV dell’avversario; entrambi i giocatori adattano le loro mosse.',
    'I due rami condividono lo stato e il mazzo iniziale, ma le azioni possono cambiare mercato e ordine degli eventi. Le osservazioni dello stesso seed/partita non sono indipendenti. Un esito migliore segnala un’occasione mancata in quella continuazione, non dimostra una strategia globalmente ottima.',
    'Tre scenari a due giocatori sono un campione diagnostico piccolo. D10 conserva la larghezza due e le euristiche preesistenti: non è ricerca esaustiva e non isola perfettamente orizzonte, potatura e valutazione. Nessun playtest umano.',
    'I precedenti report welfare-cumulabile misuravano erroneamente una sola riga sostenibile anche con più welfare e non sono evidenza valida per questa regola.'
  ];
  fs.writeFileSync(prefix+'-summary.json',JSON.stringify(result,null,2));
  fs.writeFileSync(prefix+'.json',stringify({fingerprint,records,result}));
  fs.writeFileSync(prefix+'.txt',lines.join('\n'));console.log(lines.join('\n'));
} else throw new Error('Usare run PART PARTS, verify PART PARTS oppure report');
