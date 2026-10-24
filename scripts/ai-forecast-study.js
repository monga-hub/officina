// run PART PARTS; branches PART PARTS; bench (senza altri processi); report
import fs from 'node:fs';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {initGame,applyCommand,legalCommands,scorePlayer} from '../src/game/engine.js';
import {chooseCommand,resetRolloutStats,rolloutStats} from '../src/game/ai.js';
import {newRowPressure,observeRowPressure,sampleRowPressureStart} from '../src/game/row-pressure.js';
const prefix='reports/ia-utilizzi-futuri-2026-10-16-d6';
const encode=v=>JSON.stringify(v,(k,x)=>x===Infinity?{$officinaNumber:'Infinity'}:x);
const decode=t=>JSON.parse(t,(k,x)=>x?.$officinaNumber==='Infinity'?Infinity:x);
const previous=decode(fs.readFileSync('reports/welfare-beneficio-futuro-2026-10-16-d6-1907-c3.json'));
const hash=()=>Object.fromEntries(['ai.js','engine.js','data.js','row-economy.js','row-pressure.js'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(`src/game/${p}`)).digest('hex')]));
const fingerprint=hash();for(const key of Object.keys(fingerprint).filter(k=>k!=='ai.js'))assert.equal(fingerprint[key],previous.fingerprint[key],'Regole identiche allo studio precedente');
const modes=['beam2','forecast2'],roles=['terziario','secondario','primario'];
const jobs=[];
for(const seed of [1907,36907,36908])for(const cost of [3,4,5])for(const mode of (seed+cost)%2?modes:[...modes].reverse())jobs.push({seed,cost,group:seed===1907?'known':'new',versions:[mode,mode]});
for(const seed of [36909,36910])for(const versions of [modes,[...modes].reverse()])jobs.push({seed,cost:3,group:'direct',versions});
const path=j=>`${prefix}-${j.seed}-c${j.cost}-${j.versions.join('-')}.json`;
const mean=xs=>xs.length?xs.reduce((a,b)=>a+b,0)/xs.length:0;
const sum=xs=>xs.reduce((a,b)=>a+b,0);
const same=(a,b)=>encode(a)===encode(b);
const read=j=>decode(fs.readFileSync(path(j)));
const write=(j,d)=>{assert.deepEqual(hash(),fingerprint);fs.writeFileSync(path(j),encode(d));};
function config(job){const c=structuredClone(previous.config);c.seed=job.seed;c.rowEconomy.welfareCost=job.cost;c.players.forEach((p,i)=>p.aiContinuation=job.versions[i]);return c;}
function run(initial,capture=false,forced=[]){
  resetRolloutStats();let s=initial,n=0;const pressure=newRowPressure(s),snapshots=[];const start=performance.now(),cpu=process.cpuUsage();
  const act=cmd=>{const before=s;s=applyCommand(s,cmd);observeRowPressure(pressure,before,cmd,s);};
  forced.forEach(act);
  while(!s.gameOver&&n++<20000){
    sampleRowPressureStart(pressure,s);const cmd=chooseCommand(s);assert.ok(cmd);
    const seat=s.current,count=s.players[seat].depts.terziario.sustainableWelfare;
    // Primo rifiuto per ordinale e tavolo fra turni 8–20, senza selezionare l'esito.
    if(capture&&!s.pending&&s.phase==='move'&&s.turn>=8&&s.turn<=20&&[1,2].includes(count)&&!snapshots.some(x=>x.ordinal===count+1)){
      const move=legalCommands(s).find(c=>c.type==='move'&&c.node==='Servizi');
      if(move){const moved=applyCommand(s,move),buy=legalCommands(moved).find(c=>c.type==='investWelfare');
        if(buy&&!(same(move,cmd)&&chooseCommand(moved).type==='investWelfare'))snapshots.push({ordinal:count+1,seat,turn:s.turn,state:structuredClone(s),move,buy,actionIndex:pressure.actions.length});
      }
    }
    act(cmd);
  }
  assert.ok(s.gameOver&&n<20000);assert.equal(s.turn,28);
  for(const p of s.players){assert.equal(p.coinsStart+p.coinsGained-sum(Object.values(p.coinsSpentBy)),p.coins);assert.ok(roles.every(r=>p.depts[r].sustainableWelfare===p.industrialStats.welfareBuys));}
  assert.ok(pressure.productions.filter(p=>p.sustainable).every(p=>p.actualRows===Math.min(p.before.welfare,p.before.available)&&p.after.tension===Math.max(0,p.before.tension-1)));
  assert.ok(pressure.actions.filter(a=>a.type==='hire').every(a=>a.hirePaid>=1));
  assert.ok(pressure.recoveries.filter(a=>a.type==='repression').every(a=>a.reduction===Math.min(2,a.before.tension)));
  const used=process.cpuUsage(cpu),{perDecisionLog,...counters}=rolloutStats;
  return {people:s.players.map(p=>({...scorePlayer(s,p),stats:p.industrialStats})),pressure,snapshots,elapsedMs:performance.now()-start,cpuMs:(used.user+used.system)/1000,counters};
}
function result(r,seat,ordinal,start=0){const p=r.people.find(p=>p.playerId===seat),op=r.people.find(p=>p.playerId!==seat);
  const prods=r.pressure.productions.filter(a=>a.seat===seat&&a.seq>=start),hires=r.pressure.actions.filter(a=>a.seat===seat&&a.seq>=start&&a.type==='hire');
  return {pv:p.total,margin:p.total-op.total,welfare:p.stats.welfareBuys,coins:p.coins,contracts:p.nContracts,
    rowUses:prods.filter(a=>a.sustainable&&a.actualRows>=ordinal).length,discountUses:hires.filter(a=>a.welfareSaved>=ordinal).length,
    sustainable:prods.filter(a=>a.sustainable).length,resources:sum(prods.map(a=>a.actualRows))};
}
const command=process.argv[2],part=Number(process.argv[3]),parts=Number(process.argv[4]);
if(command==='run'){
  for(const [i,job]of jobs.entries())if(i%parts===part){
    if(fs.existsSync(path(job))){assert.deepEqual(read(job).fingerprint,fingerprint);continue;}
    const cfg=config(job),baseline=run(initGame(cfg),job.cost===3&&job.group!=='direct');
    write(job,{...job,config:cfg,fingerprint,baseline,decisions:[]});
    console.log(`${job.seed} c${job.cost} ${job.versions.join('/')} PV ${baseline.people.map(p=>p.total)} W ${baseline.people.map(p=>p.stats.welfareBuys)} ${(baseline.elapsedMs/1000).toFixed(1)}s; diagnosi ${baseline.snapshots.map(s=>s.ordinal)}`);
  }
}else if(command==='branches'){
  const targets=jobs.filter(j=>j.cost===3&&j.group!=='direct');
  for(const [i,job]of targets.entries())if(i%parts===part){
    const data=read(job);assert.deepEqual(data.fingerprint,fingerprint);initGame(data.config);
    for(const snap of data.baseline.snapshots){
      if(data.decisions.some(d=>d.ordinal===snap.ordinal&&d.source==='natural'))continue;
      const forced=run(snap.state,snap.ordinal===2,[snap.move,snap.buy]);
      const control=result(data.baseline,snap.seat,snap.ordinal,snap.actionIndex),bought=result(forced,snap.seat,snap.ordinal);
      data.decisions.push({source:'natural',ordinal:snap.ordinal,seat:snap.seat,turn:snap.turn,control,bought,forced});write(job,data);
      console.log(`${job.seed} ${job.versions[0]} W${snap.ordinal} turno${snap.turn}: ΔPV ${bought.pv-control.pv}, Δmargine ${bought.margin-control.margin}`);
    }
    // Se manca un terzo acquisto osservabile, usa uno stato raggiunto legalmente nel ramo
    // con secondo welfare forzato. Separato dalle partite spontanee, mai risorse regalate.
    if(!data.baseline.snapshots.some(s=>s.ordinal===3)&&!data.decisions.some(d=>d.source==='induced')){
      const parent=data.decisions.find(d=>d.ordinal===2),snap=parent?.forced.snapshots.find(s=>s.ordinal===3&&s.seat===parent.seat);
      if(snap){const forced=run(snap.state,false,[snap.move,snap.buy]);const control=result(parent.forced,snap.seat,3,snap.actionIndex),bought=result(forced,snap.seat,3);
        data.decisions.push({source:'induced',ordinal:3,seat:snap.seat,turn:snap.turn,control,bought,forced,snapshot:snap});write(job,data);
        console.log(`${job.seed} ${job.versions[0]} W3 indotto turno${snap.turn}: ΔPV ${bought.pv-control.pv}, Δmargine ${bought.margin-control.margin}`);
      }
    }
    data.branchesComplete=true;write(job,data);
  }
}else if(command==='bench'){
  const records=[];initGame(previous.config);
  for(const snap of previous.baseline.snapshots){
    for(const mode of modes){const s=structuredClone(snap.state);s.players[snap.seat].aiContinuation=mode;chooseCommand(s);}
    for(let rep=0;rep<2;rep++)for(const mode of rep?[...modes].reverse():modes){
      const s=structuredClone(snap.state);s.players[snap.seat].aiContinuation=mode;const frozen=structuredClone(s);resetRolloutStats();const t=performance.now(),cpu=process.cpuUsage(),cmd=chooseCommand(s),used=process.cpuUsage(cpu);
      records.push({turn:s.turn,rep,mode,cmd,ms:performance.now()-t,cpuMs:(used.user+used.system)/1000,forecasts:rolloutStats.beamForecasts});assert.deepEqual(s,frozen);
    }
  }
  fs.writeFileSync(prefix+'-bench.json',encode({fingerprint,node:process.version,records}));console.log(records);
}else if(command==='report'){
  const records=jobs.map(read);records.forEach(r=>assert.deepEqual(r.fingerprint,fingerprint));
  const groups=[];
  for(const group of ['known','new'])for(const mode of modes){const rs=records.filter(r=>r.group===group&&r.versions[0]===mode),ps=rs.flatMap(r=>r.baseline.people);
    const uses=[];for(const r of rs)for(const seat of [0,1]){let ordinal=0;for(const a of r.baseline.pressure.actions.filter(a=>a.seat===seat&&a.type==='investWelfare')){ordinal++;if(ordinal<2)continue;const x=result(r.baseline,seat,ordinal,a.seq+1);uses.push({seed:r.seed,cost:r.cost,seat,ordinal,turn:a.turn,rowUses:x.rowUses,discountUses:x.discountUses});}}
    groups.push({group,mode,games:rs.length,meanPV:mean(ps.map(p=>p.total)),histogram:[0,1,2,3,4].map(n=>({count:n===4?'4+':n,players:ps.filter(p=>n===4?p.stats.welfareBuys>=4:p.stats.welfareBuys===n).length})),meanCPU:mean(rs.map(r=>r.baseline.cpuMs)),uses});
  }
  const pairs=[];for(const seed of [1907,36907,36908])for(const cost of [3,4,5]){
    const rs=records.filter(r=>r.seed===seed&&r.cost===cost),old=rs.find(r=>r.versions[0]==='beam2'),now=rs.find(r=>r.versions[0]==='forecast2');
    const strip=c=>({...c,players:c.players.map(({aiContinuation,...p})=>p)});assert.deepEqual(strip(old.config),strip(now.config));
    pairs.push({seed,cost,pvDelta:mean(now.baseline.people.map(p=>p.total))-mean(old.baseline.people.map(p=>p.total)),cpuRatio:now.baseline.cpuMs/old.baseline.cpuMs});
  }
  const direct=records.filter(r=>r.group==='direct').map(r=>({seed:r.seed,newSeat:r.versions.indexOf('forecast2'),margin:r.baseline.people.find(p=>r.versions[p.playerId]==='forecast2').total-r.baseline.people.find(p=>r.versions[p.playerId]==='beam2').total}));
  const targets=records.filter(r=>r.cost===3&&r.group!=='direct');targets.forEach(r=>assert.ok(r.branchesComplete));
  const decisions=targets.flatMap(r=>r.decisions.map(({forced,snapshot,...d})=>({...d,seed:r.seed,mode:r.versions[0],deltaPV:d.bought.pv-d.control.pv,deltaMargin:d.bought.margin-d.control.margin})));
  const bench=decode(fs.readFileSync(prefix+'-bench.json'));assert.deepEqual(bench.fingerprint,fingerprint);
  const ratio=sum(bench.records.filter(r=>r.mode==='forecast2').map(r=>r.ms))/sum(bench.records.filter(r=>r.mode==='beam2').map(r=>r.ms));
  const probes=decode(fs.readFileSync(prefix+'-same-states.json'));
  const third=['control','buy'].map(m=>decode(fs.readFileSync(`${prefix}-third-${m}.json`)));
  third.forEach(r=>assert.deepEqual(r.fingerprint,fingerprint));
  const thirdCheck={seed:third[0].seed,turn:third[0].turn,seat:third[0].seat,
    controlPV:third[0].people.find(p=>p.playerId===third[0].seat).total,buyPV:third[1].people.find(p=>p.playerId===third[1].seat).total,
    marginDelta:third[1].margin-third[0].margin};
  const summary={games:records.length,groups,pairs,direct,decisions,benchmark:{ratio,records:bench.records},sameStates:probes,thirdCheck};
  fs.writeFileSync(prefix+'-summary.json',JSON.stringify(summary,null,2));
  const lines=['OFFICINA 1907 — IA: UTILIZZI FUTURI PRIMA DELLA POTATURA',
    'Regole identiche: 4 righe, repressione −2, welfare cumulabile sulle righe e sconto, assunzioni minimo 1, recupero sostenibile −1. Prezzi 3/4/5 come nello studio precedente. Nessuna modifica ai pesi di valutazione.',
    'Vecchia beam2; nuova forecast2. Entrambe d6 r1, larghezza 2. Nuova: prima potatura dopo continuazione greedy fino a fine finestra; poi potature euristiche precedenti. Ogni azione iniziale e ogni alternativa della prima espansione riceve lo stesso trattamento. Percorso greedy conservato. Nessun bonus o percorso riservato al welfare.',
    '18 partite omogenee: seed 1907 noto e 36907/36908 nuovi × costi 3/4/5 × due IA. Quattro scontri diretti aggiuntivi su seed nuovi 36909/36910, costo 3, posti invertiti. Tutte eseguite da zero.',
    ...groups.map(g=>`${g.group} ${g.mode}: ${g.games} partite, PV medi ${g.meanPV.toFixed(2)}, welfare ${g.histogram.map(h=>h.count+':'+h.players).join(' ')}; usi acquisti successivi ${JSON.stringify(g.uses)}`),
    'CONFRONTI APPAIATI',...pairs.map(p=>`${p.seed} costo${p.cost}: ΔPV medio ${p.pvDelta.toFixed(2)}, CPU ×${p.cpuRatio.toFixed(2)}`),
    'SCONTRI DIRETTI',...direct.map(d=>`${d.seed} nuova posto${d.newSeat+1}: margine ${d.margin}`),
    'DIAGNOSI DEGLI ACQUISTI RIFIUTATI',
    'Solo costo 3, primo rifiuto per ordinale e tavolo tra turni 8–20. Si forza un acquisto pagandolo e si prosegue fino a fine partita con la stessa IA. Il controllo può acquistare in seguito. Induced: terzo acquisto in uno stato raggiunto legalmente dopo un secondo acquisto forzato, non frequenza spontanea.',
    ...decisions.map(d=>`${d.seed} ${d.mode} ${d.source} W${d.ordinal} turno${d.turn}: ΔPV ${d.deltaPV}, Δmargine ${d.deltaMargin}; usi riga ${d.control.rowUses}→${d.bought.rowUses}, sconto ${d.control.discountUses}→${d.bought.discountUses}`),
    'Attenzione: nel caso forecast2/36908/W3 il ramo acquisto guadagna 2 PV e 3 di margine, ma non usa mai né terza riga né terzo sconto. È un cambiamento di traiettoria, non evidenza di rendimento dei benefici del terzo welfare. Un miglior esito dopo un acquisto non basta ad attribuirlo ai suoi effetti.',
    'DIAGNOSI SUCCESSIVA SUGLI STESSI STATI',probes.note,...probes.records.map(r=>JSON.stringify(r)),
    `Terzo welfare nello stato del seed ${thirdCheck.seed}, turno ${thirdCheck.turn}: entrambi i rami proseguiti interamente dalla nuova IA. PV controllo ${thirdCheck.controlPV}, acquisto ${thirdCheck.buyPV}, Δmargine ${thirdCheck.marginDelta}. Caso scelto dopo aver osservato un beneficio con la vecchia continuazione: diagnosi mirata, non campione indipendente.`,
    'TEMPI',`Benchmark isolato su due identici stati di movimento (turni 3 e 15), due ripetizioni AB/BA dopo riscaldamento: ×${ratio.toFixed(2)}. ${JSON.stringify(bench.records)}`,
    'LIMITI','Campione esplorativo: due seed nuovi omogenei e due diretti, non prova di superiorità generale. PV medi omogenei non equivalgono a forza competitiva. La frequenza welfare non è criterio di successo. Le continuazioni restano approssimate: avversari greedy, finestra d6 e larghezza 2. Un ramo migliore identifica un errore in quella continuazione, non la strategia ottima. Stati indotti distinti da partite naturali. Nessun playtest umano.'
  ];fs.writeFileSync(prefix+'.txt',lines.join('\n'));console.log(lines.join('\n'));
}else throw Error('run/branches PART PARTS, bench oppure report');
