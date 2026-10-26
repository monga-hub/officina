import { WELFARE_POLICIES } from '../game/welfare-rondel.js';
import { bankMarket, hireCost, legalCommands, WORKER_BY_ID } from '../game/engine.js';
import { rowMachineCard } from '../game/row-economy.js';
import { rowPressureState } from '../game/row-pressure.js';
import { RESOURCE_OF, rowTrackModel } from '../game/data.js';
const roles=['terziario','secondario','primario'];
export const sum=(xs,f=x=>x)=>xs.reduce((n,x)=>n+f(x),0);
const total=o=>sum(Object.values(o));
export const mean=(xs,f=x=>x)=>xs.length?sum(xs,f)/xs.length:null;
export function distribution(xs) {
  if(!xs.length)return {n:0,mean:null,median:null,min:null,max:null};
  const a=[...xs].sort((a,b)=>a-b),m=Math.floor(a.length/2);
  return {n:a.length,mean:mean(a),median:a.length%2?a[m]:(a[m-1]+a[m])/2,min:a[0],max:a.at(-1)};
}
export function fingerprint(config) {
  const canonical=x=>Array.isArray(x)?x.map(canonical):x&&typeof x==='object'?Object.fromEntries(Object.keys(x).sort().map(k=>[k,canonical(x[k])])):x;
  let hash=2166136261;for(const ch of JSON.stringify(canonical(config))){hash^=ch.charCodeAt(0);hash=Math.imul(hash,16777619);}
  return (hash>>>0).toString(16).padStart(8,'0');
}
export function newStudy(state) {
  return {version:1,initial:state.players.map(p=>({coins:p.coins,resources:total(p.resources)})),cards:{},events:[],machines:[],productions:[],thresholds:state.players.flatMap(p=>roles.flatMap(role=>(state.rowEconomy.productionThresholds||[]).filter(n=>n<=p.depts[role].prod).map(threshold=>({seat:p.id,role,turn:0,threshold})))),offers:{},starts:[],seen:[]};
}
export function observeStudy(out,before,cmd,after) {
  const p=before.players[before.current],q=after.players[p.id],seq=out.events.length;
  const role=cmd.role||roles.find(r=>p.depts[r].sector===cmd.sector);
  const card=id=>out.cards[id]??=( {id,nation:WORKER_BY_ID[id].nation,sector:WORKER_BY_ID[id].sector,value:WORKER_BY_ID[id].v,appeared:0,sopra:0,sotto:0} );
  for(const bank of before.bankIds)for(const id of bankMarket(before,bank))if(!out.seen.includes(id)){out.seen.push(id);card(id).appeared++;}
  if(before.phase==='move'&&!before.pending)out.starts.push({turn:before.turn,seat:p.id,coins:p.coins,resources:total(p.resources)});
  if(before.phase==='action'&&!before.pending) {
    const hires=legalCommands(before).filter(c=>c.type==='hire');
    if(hires.length){const offer=out.offers[`${p.id}:${before.turn}`]??={seat:p.id,turn:before.turn,picked:false,alternatives:[]};if(cmd.type==='hire')offer.picked=true;else if(!offer.alternatives.includes(cmd.type))offer.alternatives.push(cmd.type);}
  }
  const event={seq,turn:before.turn,seat:p.id,type:cmd.type,role,side:cmd.side,cardId:cmd.cardId,
    coinsBefore:p.coins,coinsAfter:q.coins,income:q.coinsGained-p.coinsGained,spent:total(q.coinsSpentBy)-total(p.coinsSpentBy),
    resourcesGained:total(q.resGainedBy)-total(p.resGainedBy),resourcesSpent:total(q.resSpentByCat)-total(p.resSpentByCat),tokens:cmd.type==='spendWelfareToken'?(cmd.count||1):0};
  if(before.rowEconomy.welfareRondel) {
    event.policyBefore=p.welfarePosition; event.policyAfter=q.welfarePosition;
    if(cmd.type==='investWelfare'){event.steps=cmd.steps;event.tokensGained=q.welfareTokens-p.welfareTokens;}
    event.policyBenefits=Object.fromEntries(WELFARE_POLICIES.map(policy=>[policy.id,q.welfareRondelStats.benefits[policy.id]-p.welfareRondelStats.benefits[policy.id]]).filter(([,n])=>n));
  }
  if(cmd.type==='hire') {
    const w=WORKER_BY_ID[cmd.cardId];card(w.id)[cmd.side]++;
    event.paid=hireCost(before,p,w,role,cmd.side);event.discount=cmd.side==='sopra'?w.v-event.paid:0;
    if(cmd.side==='sotto') {
      const effect=rowMachineCard(w,before.rowEconomy).effect;
      out.machines.push({seat:p.id,role,cardId:w.id,nation:w.nation,cost:event.paid,turn:before.turn,seq,effect,
        kind:effect.verbo==='perOgni'?'tensione':effect.verbo==='scambia'?'conversione':'fisso',immediate:effect.verbo==='scambia'?null:0,recurring:effect.verbo==='scambia'?null:0,uses:0,firstUse:null,payback:null,optionalConversionsUsed:0});
    }
  }
  const machineIncome=(m,immediate)=>{
    const d=p.depts[m.role],e=m.effect;
    const income=e.verbo==='prendi'&&e.f1.tipo==='moneta'?e.f1.q:e.verbo==='perOgni'?e.f1.q*d.tension:0;
    if(m.kind!=='conversione'){if(immediate)m.immediate+=income;else m.recurring+=income;}
    if(!immediate){m.uses++;m.firstUse??=before.turn;}
    if(m.kind!=='conversione'&&m.immediate+m.recurring>=m.cost)m.payback??=before.turn;
    return income;
  };
  if(cmd.type==='hire'&&cmd.side==='sotto'&&before.sottoInstantEffect){const m=out.machines.at(-1);machineIncome(m,true);}
  if(cmd.type==='activate') {
    const machines=out.machines.filter(m=>m.seat===p.id&&m.role===role),targets=machines.filter(m=>m.kind==='tensione');
    const income=sum(machines,m=>machineIncome(m,false));
    out.productions.push({seq,seat:p.id,role,turn:before.turn,tension:p.depts[role].tension,targets:targets.length,targetIncome:sum(targets,m=>m.effect.f1.q*p.depts[role].tension),machineIncome:income,protected:cmd.welfareToken===true,...rowPressureState(before,p.depts[role])});
  }
  if(cmd.type==='resolveEffect'&&cmd.use&&before.pending?.cardId) {
    const m=out.machines.find(m=>m.seat===p.id&&m.cardId===before.pending.cardId);
    if(m){m.optionalConversionsUsed++;}
  }
  if(cmd.type==='borsaExit')event.cityIncome=event.income;
  if(cmd.type==='spendWelfareToken'||cmd.type==='repress')event.affected=roles.map(r=>({role:r,before:rowPressureState(before,p.depts[r]),after:rowPressureState(after,q.depts[r])}));
  const thresholds=before.rowEconomy.productionThresholds||Array.from({length:rowTrackModel(before.trackModel).rows},(_,i)=>i*rowTrackModel(before.trackModel).columns+1);
  for(const r of roles)for(const threshold of thresholds)if(p.depts[r].prod<threshold&&q.depts[r].prod>=threshold)out.thresholds.push({seat:p.id,role:r,turn:before.turn,threshold});
  out.events.push(event);
}
export function finishStudy(out,state) {
  if(!state.gameOver)throw new Error('La partita non è terminata.');
  for(const p of state.players) {
    if(p.coins!==out.initial[p.id].coins+p.coinsGained-total(p.coinsSpentBy))throw new Error(`Bilancio marchi non valido: giocatore ${p.id+1}.`);
    if(total(p.coinsGainedBy)!==p.coinsGained)throw new Error('Fonti dei marchi incoerenti.');
    const owned=out.machines.filter(m=>m.seat===p.id);
    for(const [kind,source]of [['fisso','lavFisso'],['tensione','lavTensione']])if(sum(owned.filter(m=>m.kind===kind),m=>m.immediate+m.recurring)!==p.coinsGainedBy[source])throw new Error(`Rendimenti macchinari incoerenti: ${kind}.`);
    if(total(p.resources)!==out.initial[p.id].resources+total(p.resGainedBy)-total(p.resSpentByCat)-p.resCapLost)throw new Error(`Bilancio risorse non valido: giocatore ${p.id+1}.`);
  }
  out.verified={completed:true,money:state.nPlayers,resources:state.nPlayers,machineIncome:state.nPlayers};
  delete out.seen;
  return out;
}
const f=n=>n==null?'—':n.toLocaleString('it-IT',{maximumFractionDigits:2});
const table=(head,rows)=>['| '+head.join(' | ')+' |','| '+head.map(()=>'---').join(' | ')+' |',...rows.map(row=>'| '+row.map(x=>typeof x==='number'?f(x):String(x??'—').replaceAll('|','/').replaceAll('\n',' ')).join(' | ')+' |')].join('\n');
export function detailedReport(config,games,status) {
  const people=games.flatMap(g=>g.people.map(p=>({...p,seed:g.seed,game:g,final:g.finalState?.players[p.playerId]}))),studies=games.map(g=>g.study).filter(Boolean);
  const events=studies.flatMap(s=>s.events),machines=studies.flatMap(s=>s.machines),prods=studies.flatMap(s=>s.productions),thresholds=studies.flatMap(s=>s.thresholds),offers=studies.flatMap(s=>Object.values(s.offers));
  const metric=key=>distribution(people.map(p=>key==='staff'||key==='machines'?sum(roles,r=>p.final?.depts[r][key==='staff'?'sopra':'sotto'].length||0):key==='firstContract'?p.final?.contractsWon[0]?.turn:p[key]).filter(n=>Number.isFinite(n)));
  const source=key=>people.reduce((all,p)=>{for(const [k,v]of Object.entries(p.final?.[key]||{}))all[k]=(all[k]||0)+v;return all;},{});
  const targets=machines.filter(m=>m.kind==='tensione'),pair=prods.filter(p=>p.targets>=2),cures=events.filter(e=>e.type==='spendWelfareToken'),repressions=events.filter(e=>e.type==='repress'),N=people.length;
  const moneySources=source('coinsGainedBy'),cityIncome=sum(events,e=>e.cityIncome||0);moneySources.scambio=(moneySources.scambio||0)-cityIncome;moneySources.citta=cityIncome;
  const cohort=ps=>[ps.length,mean(ps,p=>p.total),mean(ps,p=>p.nContracts),mean(ps,p=>p.stats.welfareBuys),mean(ps,p=>p.stats.repressions)];
  const L=[`# OFFICINA 1907 — ${config.name}`,`\n${status}: **${games.length}/${config.simulation.games} partite**, ${N} giocatori-partita. Generato: ${new Date().toISOString()}.`,
    `\n## Esperimento riproducibile\n\nImpronta configurazione: **${fingerprint(config)}**. IA ${config.simulation.ai}, d${config.simulation.depth}/r${config.simulation.rollouts}. ${config.players} giocatori, ${config.turns} turni. Versioni del motore: ${[...new Set(games.map(g=>g.release?.version||'sviluppo locale'))].join(', ')}.`,
    `Soglie permanenti: ${config.productionThresholds.join('/')}. Risorsa immediata alla soglia: ${config.milestoneResource?'sì':'no'}. Macchinari attivi all’installazione: ${config.machineImmediate?'sì':'no'}.`,
    `Semi completati: ${games.map(g=>g.seed).join(', ')}.`,
    `Tempo di calcolo cumulato: ${f(sum(games,g=>g.elapsedMs)/1000)} secondi (in parallelo differisce dal tempo trascorso).`,
    `\n## Controlli di accuratezza\n\nPartite terminate verificate: ${studies.filter(s=>s.verified?.completed).length}/${games.length}; bilanci marchi: ${sum(studies,s=>s.verified?.money||0)}/${N}; bilanci risorse: ${sum(studies,s=>s.verified?.resources||0)}/${N}; rendite macchinari: ${sum(studies,s=>s.verified?.machineIncome||0)}/${N}.`,
    'Le frequenze descrivono questa IA e questo campione. Confronti tra possessori e non possessori sono correlazioni; per attribuire un effetto alla regola occorre un confronto A/B sugli stessi semi.',
    '\n## Risultati generali\n',table(['Indicatore','N','Media','Mediana','Min','Max'],[['PV','total'],['Commesse','nContracts'],['Turno prima commessa','firstContract'],['Operai Sopra','staff'],['Macchinari Sotto','machines'],['Marchi finali','coins']].map(([label,key])=>{const d=metric(key);return [label,d.n,d.mean,d.median,d.min,d.max];})),
    `\n## Posizione di turno\n\n${table(['Posto','N','Vittorie equivalenti','PV medi'],Array.from({length:config.players},(_,seat)=>{const ps=people.filter(p=>p.playerId===seat);return [seat+1,ps.length,sum(ps,p=>{const best=[...p.game.people].sort((a,b)=>b.total-a.total||b.coins-a.coins||b.nContracts-a.nContracts)[0],ties=p.game.people.filter(q=>q.total===best.total&&q.coins===best.coins&&q.nContracts===best.nContracts);return ties.some(q=>q.playerId===seat)?1/ties.length:0;}),mean(ps,p=>p.total)];}))}`,
    '\n## Assunzioni e sviluppo\n',`Assunzioni Sopra: ${events.filter(e=>e.type==='hire'&&e.side==='sopra').length}; scontate: ${events.filter(e=>e.discount>0).length}; risparmio totale: ${f(sum(events,e=>e.discount||0))} marchi.`,
    `Turni con almeno un’assunzione legale: ${offers.length}; turni in cui viene scelta: ${offers.filter(o=>o.picked).length}. La disponibilità non dimostra che fosse la scelta migliore.`,
    'Il turno 0 indica una soglia già sbloccata nel setup: il premio immediato si paga solo attraversandola durante un avanzamento.',
    table(['Soglia','Reparti arrivati','Su reparti totali','Turno medio'],config.productionThresholds.map(t=>{const ts=thresholds.filter(x=>x.threshold===t);return [t,ts.length,N*3,mean(ts,x=>x.turn)];})),
    table(['Settore','Reparti','Operai medi','Macchinari medi','Sviluppo medio','Tensione finale media','Spazi macchinari pieni'],Object.values(RESOURCE_OF).map((_,i)=>{const ds=people.map(p=>p.final?.depts[roles[i]]).filter(Boolean);return [ds[0]?.sector||roles[i],ds.length,mean(ds,d=>d.sopra.length),mean(ds,d=>d.sotto.length),mean(ds,d=>d.prod),mean(ds,d=>d.tension),ds.filter(d=>d.sotto.length===config.machineSlots[i]).length];})),
    '\n## Macchinari: ritorno monetario e tempismo\n',
    'Ricavo lordo immediato e ricavo nelle produzioni sono separati. Pareggio monetario = incassi ≥ prezzo; non remunera l’azione o lo spazio. Le conversioni hanno valore anche in risorse: non sono confrontabili tramite il solo pareggio in marchi.',
    table(['Tipo / costo','Copie','Spesa','Incasso immediato','Incasso successivo','Mai prodotte','Pareggio monetario','Attesa prima produzione'],[...new Set(machines.map(m=>`${m.kind}/${m.cost}`))].sort().map(k=>{const ms=machines.filter(m=>`${m.kind}/${m.cost}`===k);return [k,ms.length,sum(ms,m=>m.cost),k.startsWith('conversione')?'—':sum(ms,m=>m.immediate),k.startsWith('conversione')?'—':sum(ms,m=>m.recurring),ms.filter(m=>!m.uses).length,k.startsWith('conversione')?'—':ms.filter(m=>m.payback!=null).length,mean(ms.filter(m=>m.firstUse!=null),m=>m.firstUse-m.turn)];})),
    `Macchinari da tensione: ${targets.length}; coppie o gruppi da ≥2 nella stessa produzione: ${pair.length} attivazioni; ${f(sum(pair,p=>p.targetIncome))} marchi. Produzioni con macchinari da tensione e zero righe accessibili: ${prods.filter(p=>p.targets>0&&p.available===0).length}.`,
    table(['Tensione prima della produzione','Un macchinario','Due o più'],Array.from({length:Math.max(...prods.map(p=>p.tension),4)+1},(_,t)=>[t,prods.filter(p=>p.tension===t&&p.targets===1).length,prods.filter(p=>p.tension===t&&p.targets>=2).length])),
    '\n## Welfare, repressione e tensione\n',
    `${config.welfareRondel?'Visite alla rondella Welfare':'Pacchetti welfare'}: ${sum(people,p=>p.stats.welfareBuys)}; produzioni protette: ${sum(people,p=>p.stats.protectedProductions||0)}; cure: ${cures.length}; gettoni finali: ${sum(people,p=>p.welfareTokens||0)}.`,
    `Cure insieme a un’assunzione nello stesso turno: ${cures.filter(c=>events.some(e=>e.type==='hire'&&e.seat===c.seat&&e.turn===c.turn&&studies.some(s=>s.events.includes(c)&&s.events.includes(e)))).length}.`,
    `Repressioni: ${repressions.length}; righe riaperte nel reparto azzerato: ${sum(repressions,e=>sum(e.affected.filter(a=>a.role===e.role),a=>a.after.available-a.before.available))}; righe coperte negli altri: ${sum(repressions,e=>sum(e.affected.filter(a=>a.role!==e.role),a=>Math.max(0,a.before.available-a.after.available)))}.`,
    `Produzioni: ${prods.length}; con righe sviluppate bloccate: ${prods.filter(p=>p.blocked>0).length}; righe bloccate totali: ${sum(prods,p=>p.blocked)} su ${sum(prods,p=>p.developed)} sviluppate.`,
    ...(config.welfareRondel ? [
      '\n## Rondella Welfare\n',
      'Un marco per passo e gettone, da 1 a 6. Primo ingresso libero; poi avanzamento in senso orario, spazi condivisi. Il bonus personale resta attivo fino allo spostamento. I valori dei benefici sono rendimenti effettivi, non una stima dei PV.',
      table(['Politica','Visite','Giocatori distinti per partita','Beneficio effettivo','Unità'],WELFARE_POLICIES.map((policy,i)=>{const visits=events.filter(e=>e.type==='investWelfare'&&e.policyAfter===i);return [policy.name,visits.length,people.filter(p=>p.final?.welfareRondelStats?.visits.some(v=>v.position===i)).length,sum(people,p=>p.final?.welfareRondelStats?.benefits[policy.id]||0),({formation:'passi extra',integration:'marchi risparmiati',innovation:'marchi risparmiati',cooperation:'marchi incassati',reliability:'marchi incassati',mutualAid:'conversioni eseguite'})[policy.id]];})),
      table(['Seme','Posto','Turno','Passi / costo / gettoni','Politica scelta'],games.flatMap(g=>(g.study?.events||[]).filter(e=>e.type==='investWelfare').map(e=>[g.seed,e.seat+1,e.turn,e.steps,WELFARE_POLICIES[e.policyAfter]?.name]))),
    ] : []),
    '\n## Commesse\n',table(['Taglia','Completate','PV','Turno medio'],['small','medium','large'].map(size=>{const cs=people.flatMap(p=>p.final?.contractsWon||[]).filter(c=>c.size===size);return [size,cs.length,sum(cs,c=>c.pv),mean(cs,c=>c.turn)];})),
    `Giocatori senza commesse: ${people.filter(p=>!p.nContracts).length}/${N}.`,
    '\n## Conversioni\n',table(['Tipo','Disponibili','Eseguite'],Object.keys(source('convAttempts')).map(key=>[key,source('convAttempts')[key],source('convCount')[key]||0])),
    '\n## Economia: totali verificati\n',table(['Fonte marchi','Totale'],Object.entries(moneySources)),table(['Spesa marchi','Totale'],Object.entries(source('coinsSpentBy'))),table(['Fonte risorse','Totale'],Object.entries(source('resGainedBy'))),table(['Uso risorse','Totale'],Object.entries(source('resSpentByCat'))),
    `Risorse finali: ${sum(people,p=>p.final?total(p.final.resources):0)}; perse per limite di scorta: ${sum(people,p=>p.final?.resCapLost||0)}. Le conversioni compaiono sia tra entrate sia tra uscite; non contare le risorse convertite come nuova produzione.`,
    '\n## Andamento nei quarti di partita\n',table(['Turni','Marchi a inizio turno','Produzioni','Righe accessibili medie','Rendite marchi (escluse conversioni)'],Array.from({length:4},(_,i)=>{const from=Math.floor(i*config.turns/4)+1,to=Math.floor((i+1)*config.turns/4),starts=studies.flatMap(s=>s.starts).filter(e=>e.turn>=from&&e.turn<=to),ps=prods.filter(e=>e.turn>=from&&e.turn<=to);return [`${from}–${to}`,mean(starts,e=>e.coins),ps.length,mean(ps,e=>e.available),sum(ps,e=>e.machineIncome)];})),
    '\n## Gruppi osservati: correlazioni, non effetti causali\n',table(['Gruppo','N','PV medi','Commesse','Welfare','Repressioni'],[['Senza macchinari da tensione',people.filter(p=>!p.game.study?.machines.some(m=>m.seat===p.playerId&&m.kind==='tensione'))],['Con coppia attivata',people.filter(p=>p.game.study?.productions.some(m=>m.seat===p.playerId&&m.targets>=2))],['Con welfare',people.filter(p=>p.stats.welfareBuys>0)],['Senza welfare',people.filter(p=>!p.stats.welfareBuys)],['Con repressione',people.filter(p=>p.stats.repressions>0)],['Senza repressione',people.filter(p=>!p.stats.repressions)]].map(([label,ps])=>[label,...cohort(ps)])),
    '\n## Singole carte: apparizioni e scelta\n',table(['Carta','Nazione','Settore','Apparsa','Sopra','Sotto'],Object.values(studies.reduce((all,s)=>{for(const c of Object.values(s.cards)){const a=all[c.id]??={...c,appeared:0,sopra:0,sotto:0};for(const k of ['appeared','sopra','sotto'])a[k]+=c[k];}return all;},{})).map(c=>[c.id,c.nation,c.sector,c.appeared,c.sopra,c.sotto])),
    '\n## Risultati per seme e giocatore\n',table(['Seme','Posto','PV','Commesse','Marchi','Operai','Macchinari','Welfare','Repressioni'],people.map(p=>[p.seed,p.playerId+1,p.total,p.nContracts,p.coins,p.final?sum(roles,r=>p.final.depts[r].sopra.length):null,p.final?sum(roles,r=>p.final.depts[r].sotto.length):null,p.stats.welfareBuys,p.stats.repressions])),
    '\n## Cronologia delle produzioni in coppia\n',table(['Seme','Posto','Turno','Reparto','Tensione','Righe','Macchinari da tensione','Marchi','Protetta'],games.flatMap(g=>(g.study?.productions||[]).filter(p=>p.targets>=2).map(p=>[g.seed,p.seat+1,p.turn,p.sector,p.tension,p.available,p.targets,p.targetIncome,p.protected?'sì':'no']))),
    '\n## Configurazione completa\n\n```json\n'+JSON.stringify(config,null,2)+'\n```',
    '\nI dati JSON includono semi, configurazione, mosse, stato finale e osservazioni per verifiche e analisi successive.'];
  return L.join('\n\n');
}
