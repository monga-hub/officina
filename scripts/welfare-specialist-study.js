// prepare PART 6; run PART 6; report. Motore e IA congelati.
import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {initGame,applyCommand,legalCommands,scorePlayer} from '../src/game/engine.js';
import {chooseCommand,continuationValue} from '../src/game/ai.js';
import {newRowPressure,observeRowPressure,rowPressureState} from '../src/game/row-pressure.js';
const source='reports/ia-utilizzi-futuri-2026-10-16-d6',prefix='reports/welfare-specialisti-2026-10-16-d6';
const encode=v=>JSON.stringify(v,(k,x)=>x===Infinity?{$officinaNumber:'Infinity'}:x),decode=t=>JSON.parse(t,(k,x)=>x?.$officinaNumber==='Infinity'?Infinity:x);
const read=p=>decode(fs.readFileSync(p));
const origins=[
 {seed:1907,mode:'beam2',kind:'induced',targets:[{rows:3,from:8}]},
 {seed:1907,mode:'forecast2',kind:'induced',targets:[{rows:3,from:8},{rows:4,from:8},{rows:4,from:20}]},
 {seed:36907,mode:'beam2',kind:'induced',targets:[{rows:3,from:8}]},
 {seed:36908,mode:'beam2',kind:'induced',targets:[{rows:3,from:8}]},
 {seed:36908,mode:'forecast2',kind:'induced',targets:[{rows:3,from:8}]},
 {seed:36908,mode:'forecast2',kind:'natural',targets:[{rows:4,from:8}]},
 {seed:26907,mode:'beam2',kind:'induced',legacy:true,targets:[{rows:3,from:8},{rows:4,from:8}]},
];
const hash=()=>Object.fromEntries(['ai.js','engine.js','data.js','row-economy.js','row-pressure.js'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(`src/game/${p}`)).digest('hex')]));
const fingerprint=hash(),reference=read(source+'-1907-c3-forecast2-forecast2.json');assert.deepEqual(fingerprint,reference.fingerprint);
const roles=['terziario','secondario','primario'];
const key=(i,t)=>`${i}-r${t.rows}-from${t.from}`,stateFile=id=>`${prefix}-${id}-state.json`,resultFile=(id,branch)=>`${prefix}-${id}-${branch}.json`;
const duplicateOf=id=>id.endsWith('from20')&&fs.existsSync(stateFile(id.replace('from20','from8')))&&encode(read(stateFile(id)).state)===encode(read(stateFile(id.replace('from20','from8'))).state)?id.replace('from20','from8'):null;
const save=(p,v)=>{assert.deepEqual(hash(),fingerprint);fs.writeFileSync(p,encode(v));};
const sum=xs=>xs.reduce((s,n)=>s+n,0);
const jobs=origins.flatMap((o,i)=>o.targets.flatMap(t=>['control','buy'].map(branch=>({id:key(i,t),branch}))));
function finishTurn(state,seat){let s=state,n=0;while(!s.gameOver&&(s.current===seat||s.pending)&&n++<1000)s=applyCommand(s,chooseCommand(s));assert.ok(n<1000);return s;}
// Usato soltanto se l'IA compra spontaneamente: migliore alternativa non-welfare
// valutata a d6 con lo stesso motore, pending e continuazioni; nessun premio per tipo.
function alternative(state,seat){let best=null;
  for(const move of legalCommands(state).filter(c=>c.type==='move')){
    const moved=applyCommand(state,move);
    for(const action of legalCommands(moved).filter(c=>c.type!=='investWelfare')){
      let s=applyCommand(moved,action),guard=0;
      while(s.pending&&guard++<20)s=applyCommand(s,chooseCommand({...s,aiRollout:null}));
      assert.ok(!s.pending);const value=continuationValue(s,6,seat);
      if(!best||value>best.value)best={commands:[move,action],value};
    }
  }assert.ok(best);return best.commands;
}
const command=process.argv[2],part=Number(process.argv[3]),parts=Number(process.argv[4]);
if(command==='prepare'){
  for(const [i,o] of origins.entries())if(i%parts===part){
    const r=read(o.legacy?`reports/welfare-beneficio-futuro-2026-10-16-d6-${o.seed}-c3.json`:`${source}-${o.seed}-c3-${o.mode}-${o.mode}.json`);
    for(const k of Object.keys(fingerprint).filter(k=>!o.legacy||k!=='ai.js'))assert.equal(r.fingerprint[k],fingerprint[k]);initGame(r.config);
    const parent=o.legacy?r.decisions.find(d=>d.seat===0):r.decisions.find(d=>d.ordinal===2);
    const snap=o.legacy?r.baseline.snapshots.find(s=>s.seat===parent.seat):o.kind==='natural'?r.baseline.snapshots[0]:parent.forced.snapshots.find(s=>s.ordinal===3&&s.seat===parent.seat);
    assert.ok(snap);const seat=o.kind==='natural'?1:parent.seat;
    let s=structuredClone(snap.state),guard=0;if(o.legacy)s=applyCommand(applyCommand(s,snap.move),snap.buy);const found=new Set();
    while(!s.gameOver&&s.turn<=24&&found.size<o.targets.length&&guard++<10000){
      if(!s.pending&&s.phase==='move'&&s.current===seat&&s.players[seat].depts.terziario.sustainableWelfare===2){
        const depts=roles.map(role=>({role,...rowPressureState(s,s.players[seat].depts[role])})),max=Math.max(...depts.filter(d=>d.staffed).map(d=>d.developed));
        const move=legalCommands(s).find(c=>c.type==='move'&&c.node==='Servizi'),moved=move&&applyCommand(s,move),buy=moved&&legalCommands(moved).find(c=>c.type==='investWelfare');
        if(buy)for(const t of o.targets){const id=key(i,t);if(found.has(id)||max!==t.rows||s.turn<t.from)continue;
          const history=o.legacy?parent.counterfactual:o.kind==='natural'?r.baseline:parent.forced;
          for(const d of depts){const expected=history.pressure.starts.find(x=>x.turn===s.turn&&x.seat===seat&&x.role===d.role);assert.ok(expected);for(const k of ['position','tension','welfare','developed','available'])assert.equal(d[k],expected[k],'Prefisso riprodotto come nel report originale');}
          const state=structuredClone(s);state.players.forEach(p=>p.aiContinuation='forecast2');assert.deepEqual(decode(encode(state)),state);
          const data={id,origin:o,seat,turn:s.turn,depts,config:r.config,state,move,buy,fingerprint};save(stateFile(id),data);found.add(id);
          console.log(`${id}: ${o.kind}, turno${s.turn}, posto${seat+1}, sviluppate ${depts.map(d=>d.developed)}, accessibili ${depts.map(d=>d.available)}, monete ${s.players[seat].coins}`);
        }
      }
      if(found.size===o.targets.length)break;
      s=applyCommand(s,chooseCommand(s));
    }
    assert.ok(guard<10000);save(`${prefix}-origin${i}.json`,{origin:o,found:[...found],missing:o.targets.map(t=>key(i,t)).filter(k=>!found.has(k)),fingerprint});
  }
}else if(command==='run'){
  for(const [i,j]of jobs.entries())if(i%parts===part){
    if(!fs.existsSync(stateFile(j.id))){console.log(`Assente ${j.id}`);continue;}
    if(duplicateOf(j.id)){console.log(`Duplicato ${j.id}: ${duplicateOf(j.id)}`);continue;}
    if(fs.existsSync(resultFile(j.id,j.branch))){assert.deepEqual(read(resultFile(j.id,j.branch)).fingerprint,fingerprint);continue;}
    const data=read(stateFile(j.id));assert.deepEqual(data.fingerprint,fingerprint);initGame(data.config);
    let s=structuredClone(data.state);const frozen=structuredClone(s),pressure=newRowPressure(s),commands=[];const t=performance.now();
    const act=cmd=>{const before=s;s=applyCommand(s,cmd);commands.push(cmd);observeRowPressure(pressure,before,cmd,s);};
    const normal=finishTurn(s,data.seat),choosesThird=normal.players[data.seat].depts.terziario.sustainableWelfare===3;
    let initial;
    if(j.branch==='buy')initial=[data.move,data.buy];
    else if(choosesThird)initial=alternative(s,data.seat);
    else initial=[];
    initial.forEach(act);let guard=0;
    while(!s.gameOver&&guard++<10000)act(chooseCommand(s));assert.ok(s.gameOver);assert.equal(s.turn,28);assert.deepEqual(data.state,frozen);
    for(const p of s.players)assert.equal(p.coinsStart+p.coinsGained-sum(Object.values(p.coinsSpentBy)),p.coins);
    assert.ok(pressure.actions.filter(a=>a.type==='hire').every(a=>a.hirePaid>=1));
    assert.ok(pressure.productions.filter(a=>a.sustainable).every(a=>a.actualRows===Math.min(a.before.welfare,a.before.available)&&a.after.tension===Math.max(0,a.before.tension-1)));
    const people=s.players.map(p=>({...scorePlayer(s,p),stats:p.industrialStats})),own=people[data.seat],opp=people[1-data.seat];
    const prods=pressure.productions.filter(p=>p.seat===data.seat),hires=pressure.actions.filter(a=>a.seat===data.seat&&a.type==='hire');
    const rowUses=prods.filter(p=>p.sustainable&&p.actualRows>=3),discountUses=hires.filter(a=>a.welfareSaved>=3);
    const out={id:j.id,branch:j.branch,choosesThird,initial,turn:data.turn,seat:data.seat,origin:data.origin,depts:data.depts,fingerprint,people,pressure,commands,elapsedMs:performance.now()-t,
      metrics:{pv:own.total,margin:own.total-opp.total,coins:own.coins,contracts:own.nContracts,welfare:own.stats.welfareBuys,rowUses:rowUses.length,discountUses:discountUses.length,
        rowUseTurns:rowUses.map(p=>p.turn),resources:sum(prods.map(p=>p.actualRows)),intense:prods.filter(p=>!p.sustainable).length,sustainable:prods.filter(p=>p.sustainable).length,
        byRole:roles.map(role=>({role,productions:prods.filter(p=>p.role===role).length,thirdUses:rowUses.filter(p=>p.role===role).length}))}};
    save(resultFile(j.id,j.branch),out);console.log(`${j.id} ${j.branch}: sceglieW3 ${choosesThird}, PV${own.total}, margine${out.metrics.margin}, usi riga${rowUses.length} sconto${discountUses.length}`);
  }
}else if(command==='report'){
  const inventory=origins.map((o,i)=>read(`${prefix}-origin${i}.json`)),allIds=inventory.flatMap(o=>o.found),duplicates=allIds.filter(duplicateOf).map(id=>({id,sameAs:duplicateOf(id)})),ids=allIds.filter(id=>!duplicateOf(id)),records=[];
  for(const id of ids){const state=read(stateFile(id)),control=read(resultFile(id,'control')),buy=read(resultFile(id,'buy'));assert.deepEqual(control.fingerprint,fingerprint);assert.deepEqual(buy.fingerprint,fingerprint);assert.equal(control.choosesThird,buy.choosesThird);
    records.push({id,origin:state.origin,turn:state.turn,seat:state.seat,coins:state.state.players[state.seat].coins,depts:state.depts,choosesThird:control.choosesThird,control:control.metrics,buy:buy.metrics,deltaPV:buy.metrics.pv-control.metrics.pv,deltaMargin:buy.metrics.margin-control.metrics.margin});
  }
  const plans=['control','buy'].flatMap(branch=>['intense','sustainable'].map(style=>read(`${prefix}-plan-${branch}-${style}.json`)));
  plans.forEach(p=>{assert.deepEqual(p.fingerprint,fingerprint);assert.equal(p.forcedProductions,3);});
  const cashStart=read(stateFile('1-r3-from8')),cashRun=read(resultFile('1-r3-from8','control')),cashTimeline=[];initGame(cashStart.config);let cashState=cashStart.state;
  for(const cmd of cashRun.commands){
    if(!cashState.pending&&cashState.phase==='move'&&cashState.current===cashStart.seat&&cashState.turn<=22){const p=cashState.players[cashStart.seat],move=legalCommands(cashState).find(c=>c.type==='move'&&c.node==='Servizi');cashTimeline.push({turn:cashState.turn,node:p.node,coins:p.coins,moveCost:move?.cost??null,canBuy:!!move&&legalCommands(applyCommand(cashState,move)).some(c=>c.type==='investWelfare')});}
    cashState=applyCommand(cashState,cmd);
  }
  save(prefix+'-cash-timeline.json',cashTimeline);
  const summary={fingerprint,cases:records.length,inventory,duplicates,records,plans:plans.map(({pressure,commands,people,...p})=>p)};save(prefix+'-summary.json',summary);
  const lines=['OFFICINA 1907 — TERZO WELFARE E REPARTI SVILUPPATI',
    'Regole e IA identiche allo studio precedente (impronte SHA-256 verificate): forecast2 d6 r1 in entrambi i rami, quattro righe, welfare cumulabile costo 3, repressione −2, recupero sostenibile −1, assunzioni minimo 1. Nessun ritocco ai pesi o al motore.',
    'Campione condizionale da stati salvati, selezione prima di vedere gli esiti. Esattamente due welfare, reparto con massimo tre o quattro righe sviluppate, movimento e terzo acquisto legalmente pagabili, entro turno 24. Primo stato ammissibile per origine/sviluppo; per il reparto a quattro righe del seed1907 anche primo stato dal turno20. Si registrano accessibilità, denaro e turni residui.',
    'Origini: quattro seed (1907,26907,36907,36908), prefissi di partite della vecchia o nuova IA. Il quarto seed è stato aggiunto dopo la verifica della disponibilità di stati sviluppati, prima di simularne gli esiti. Induced significa che il secondo welfare era stato imposto in una precedente diagnosi, pagandolo regolarmente. Natural proviene dalla partita libera. Nessun operaio, risorsa, sviluppo o denaro aggiunto agli stati. Dalla posizione campionata entrambi i giocatori usano la stessa nuova IA.',
    'Due rami fino a fine partita: acquisto ora (movimento, prezzo e turno pagati) contro scelta normale dell’IA. Se la scelta normale compra, si confronta invece la migliore prima azione diversa dall’acquisto valutata dalla stessa continuazione d6, senza rumore di spareggio. Non viene vietato il welfare nei turni successivi.',
    ...records.map(r=>`${r.id} ${r.origin.kind} seed${r.origin.seed} prefisso${r.origin.mode}, turno${r.turn}, monete${r.coins}, righe ${r.depts.map(d=>d.developed)} accessibili ${r.depts.map(d=>d.available)}: IA compra=${r.choosesThird}; controllo ${r.control.pv}PV, acquisto ${r.buy.pv}PV; ΔPV ${r.deltaPV}, Δmargine ${r.deltaMargin}; terza riga ${r.control.rowUses}→${r.buy.rowUses} (turni acquisto ${r.buy.rowUseTurns}), terzo sconto ${r.control.discountUses}→${r.buy.discountUses}; welfare finali ${r.control.welfare}→${r.buy.welfare}.`),
    'Casi mancanti: '+inventory.flatMap(o=>o.missing).join(', '),
    'Posizioni identiche contate una sola volta: '+JSON.stringify(duplicates),
    'PIANI DI PRODUZIONE SIMMETRICI — CASO 6-r4-from8, TURNO 18',
    'Diagnosi aggiuntiva dopo il confronto libero: primi tre ritorni legalmente possibili nel reparto a quattro righe, tutti in produzione intensa oppure tutti sostenibili. Stessi due piani per chi compra e chi non compra; nel resto della partita entrambi i giocatori mantengono l’IA forecast2 d6. Si pagano movimento, prezzo e turno dell’acquisto. I piani orientano la produzione del reparto, non aggiungono premi al welfare; non sono comportamento spontaneo dell’IA, né ricerca esaustiva dei piani possibili.',
    ...plans.map(p=>`${p.branch} ${p.style}: ${p.metrics.pv} PV, margine ${p.metrics.margin}, terza riga ${p.metrics.rowUses}, terzo sconto ${p.metrics.discountUses}, risorse dal tracciato ${p.metrics.resources}, produzioni del reparto ${p.metrics.targetProductions}.`),
    'Interpretazione del piano sostenibile: 3 welfare danno 37 PV contro 41 con 2 welfare, ma il margine passa da −20 a −15 perché cambia anche il risultato avversario. È un segnale competitivo circoscritto, non una dimostrazione di maggior rendimento personale o di superiorità generale; entrambi i rami perdono.',
    'CONFRONTO LOCALE DELLA PRODUZIONE',
    'Quattro righe sviluppate, tensione iniziale 0, una risorsa per riga, nessun recupero intermedio esterno: con 2 welfare, intensa 4 (tensione1) + sostenibile 2 (tensione0) = 6 risorse; con 3 welfare, intensa 4 + sostenibile 3 = 7 risorse e stessa tensione finale. Il vantaggio in questo ciclo è una risorsa ogni due attivazioni, senza moltiplicare gli effetti dei macchinari. È un confronto aritmetico locale, non un’altra partita simulata.',
    'Lo sconto marginale del terzo welfare riguarda i lavoratori da 4: quelli da 2 e da 3 costano già 1 con due welfare. Sviluppare prima il reparto può quindi ridurre gli utilizzi futuri di questo sconto. Nella traiettoria 1907/forecast2 il reparto arriva a quattro righe al turno14, ma da turno14 a turno21 il giocatore ha soltanto 0–2 monete; il terzo acquisto torna legalmente pagabile al turno22. Dettagli in welfare-specialisti-2026-10-16-d6-cash-timeline.json.',
    'LIMITI','Stati dello stesso seed e della stessa traiettoria sono correlati; il campione non misura frequenze di gioco o percentuali generali di convenienza. In una partita libera il secondo welfare arriva tardi: i casi anticipati derivano dai rami diagnostici. Le scelte successive e la risposta avversaria possono divergere. Un esito positivo senza utilizzo del terzo beneficio non è prova del suo rendimento. Un utilizzo accompagnato da miglioramento è evidenza di una possibilità concreta, non una prova di ottimalità. Un esito negativo non esclude piani che questa IA non esplora. Nessun playtest umano.'
  ];fs.writeFileSync(prefix+'.txt',lines.join('\n'));console.log(lines.join('\n'));
}else throw Error('prepare/run PART 6 oppure report');
