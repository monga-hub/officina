import {WELFARE_FUNDS,fundBalances,policyBoosted} from '../game/welfare-funds.js';
import { researchSummary } from './research.js';
import { welfarePolicies, welfareDisplayPolicies, welfareMaxSteps, freeWelfareEntry } from '../game/welfare-rondel.js';
import { bankMarket, hireCost, legalCommands, WORKER_BY_ID } from '../game/engine.js';
import { rowMachineCard, machinesOperational, continuityIncome, tensionMachineIncome } from '../game/row-economy.js';
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
  return {version:1,initial:state.players.map(p=>({coins:p.coins-p.coinsGained+total(p.coinsSpentBy),resources:total(p.resources)-total(p.resGainedBy)+total(p.resSpentByCat)+p.resCapLost})),cards:{},events:[],machines:[],productions:[],milestones:state.players.flatMap(p=>roles.flatMap(role=>state.tracks[role].flatMap((cell,pos)=>cell?.milestoneReward&&pos<=p.depts[role].prod?[{seat:p.id,role,turn:0,position:pos,...cell.milestoneReward}]:[]))),thresholds:state.players.flatMap(p=>roles.flatMap(role=>(state.rowEconomy.productionThresholds||[]).filter(n=>n<=p.depts[role].prod).map(threshold=>({seat:p.id,role,turn:0,threshold})))),offers:{},starts:[],seen:[]};
}
export function observeStudy(out,before,cmd,after) {
  const p=before.players[before.current],q=after.players[p.id],seq=out.events.length;
  const role=cmd.role||roles.find(r=>p.depts[r].sector===cmd.sector);
  const card=id=>out.cards[id]??=( {id,nation:WORKER_BY_ID[id].nation,sector:WORKER_BY_ID[id].sector,value:WORKER_BY_ID[id].v,appeared:0,sopra:0,sotto:0} );
  for(const bank of before.bankIds)for(const id of bankMarket(before,bank))if(!out.seen.includes(id)){out.seen.push(id);card(id).appeared++;}
  if(before.phase==='move'&&!before.pending)out.starts.push({turn:before.turn,seat:p.id,coins:p.coins,resources:total(p.resources),...(fundBalances(before)?{funds:{...fundBalances(before)}}:{})});
  if(before.phase==='action'&&!before.pending) {
    const hires=legalCommands(before).filter(c=>c.type==='hire');
    if(hires.length){const offer=out.offers[`${p.id}:${before.turn}`]??={seat:p.id,turn:before.turn,picked:false,alternatives:[]};if(cmd.type==='hire')offer.picked=true;else if(!offer.alternatives.includes(cmd.type))offer.alternatives.push(cmd.type);}
  }
  const event={seq,turn:before.turn,seat:p.id,type:cmd.type,node:p.node,protected:cmd.welfareToken===true,role,side:cmd.side,cardId:cmd.cardId,
    coinsBefore:p.coins,coinsAfter:q.coins,income:q.coinsGained-p.coinsGained,spent:total(q.coinsSpentBy)-total(p.coinsSpentBy),
    resourcesGained:total(q.resGainedBy)-total(p.resGainedBy),resourcesSpent:total(q.resSpentByCat)-total(p.resSpentByCat),tokens:cmd.type==='spendWelfareToken'?(cmd.count||1):0};
  if(!before.pending&&['action','borsa'].includes(before.phase)) {
    const legal=legalCommands(before);
    event.availableActions=[...new Set(legal.map(c=>c.type))];
    if(p.node==='Servizi'&&!before.roundRondel)event.availablePolicies=[...new Set(legal.filter(c=>c.type==='investWelfare').map(c=>c.position).filter(Number.isInteger))];
  }
  if(before.rowEconomy.welfareRondel) {
    event.policyBefore=p.welfarePosition; event.policyAfter=q.welfarePosition;
    if(cmd.type==='investWelfare'){event.steps=before.roundRondel?null:cmd.steps;event.tokensGained=q.welfareTokens-p.welfareTokens;}
    if(before.phase==='roundRondel'){event.roundRondel=after.roundRondel.log.at(-1);event.steps=event.roundRondel.steps;event.tokensGained=0;event.availablePolicies=[...new Set(legalCommands(before).filter(c=>c.type==='advanceRoundRondel').map(c=>c.position))];}
    event.policyBenefits=Object.fromEntries(welfarePolicies(before).map(policy=>[policy.id,q.welfareRondelStats.benefits[policy.id]-p.welfareRondelStats.benefits[policy.id]]).filter(([,n])=>n));
  }
  if(fundBalances(before)){
    event.fundsBefore={...fundBalances(before)};event.fundsAfter={...fundBalances(after)};
    if(cmd.funds)event.fundDeposits={...cmd.funds};if(cmd.fund)event.fundTarget=cmd.fund;
    const id=welfarePolicies(before)[p.welfarePosition]?.id;
    event.boostedPolicy=policyBoosted(before,id)?id:null;
    event.fundActivated=WELFARE_FUNDS.filter(f=>event.fundsBefore[f.id]<f.threshold&&event.fundsAfter[f.id]>=f.threshold).map(f=>f.id);
    event.fundDeactivated=WELFARE_FUNDS.filter(f=>event.fundsBefore[f.id]>=f.threshold&&event.fundsAfter[f.id]<f.threshold).map(f=>f.id);
  }
  if(cmd.type==='hire') {
    const w=WORKER_BY_ID[cmd.cardId];card(w.id)[cmd.side]++;
    event.paid=hireCost(before,p,w,role,cmd.side);event.discount=cmd.side==='sopra'?w.v-event.paid:0;
    if((q.roundAwardVoucherUses?.length||0)>(p.roundAwardVoucherUses?.length||0)){event.voucher=q.roundAwardVoucherUses.at(-1);event.voucherDiscount=event.voucher.saved;}
    if(before.roundAwards?.rewardMode==='vouchers')event.discountExceptVoucher=Math.max(0,event.discount-(cmd.side==='sopra'?(event.voucherDiscount||0):0));
    if(cmd.side==='sotto') {
      const effect=rowMachineCard(w,before.rowEconomy).effect;
      out.machines.push({seat:p.id,role,cardId:w.id,nation:w.nation,cost:event.paid,turn:before.turn,seq,effect,
        kind:effect.continuity?'continuita':effect.verbo==='perOgni'?'tensione':effect.verbo==='scambia'?'conversione':'fisso',immediate:effect.verbo==='scambia'?null:0,recurring:effect.verbo==='scambia'?null:0,uses:0,firstUse:null,payback:null,optionalConversionsUsed:0});
    }
  }
  const machineIncome=(m,immediate)=>{
    const d=p.depts[m.role],e=m.effect;
    const operational=machinesOperational(before,d);
    if(!operational){if(immediate)m.blockedImmediate=true;else m.blockedUses=(m.blockedUses||0)+1;}
    const income=!operational?0:e.continuity?continuityIncome(before,d,e.f1.q,e.continuityRowsPerCoin||1):e.verbo==='prendi'&&e.f1.tipo==='moneta'?e.f1.q:e.verbo==='perOgni'?tensionMachineIncome(e,d.tension):0;
    if(m.kind!=='conversione'){if(immediate)m.immediate+=income;else m.recurring+=income;}
    if(!immediate){m.uses++;m.firstUse??=before.turn;}
    if(m.kind!=='conversione'&&m.immediate+m.recurring>=m.cost)m.payback??=before.turn;
    return income;
  };
  if(cmd.type==='hire'&&cmd.side==='sotto'&&before.sottoInstantEffect){const m=out.machines.at(-1);machineIncome(m,true);}
  if(cmd.type==='activate') {
    const machines=out.machines.filter(m=>m.seat===p.id&&m.role===role),targets=machines.filter(m=>m.kind==='tensione');
    const income=sum(machines,m=>machineIncome(m,false));
    out.productions.push({seq,seat:p.id,role,turn:before.turn,tension:p.depts[role].tension,targets:targets.length,machinesOperational:machinesOperational(before,p.depts[role]),targetIncome:machinesOperational(before,p.depts[role])?sum(targets,m=>tensionMachineIncome(m.effect,p.depts[role].tension)):0,machineIncome:income,protected:cmd.welfareToken===true,...rowPressureState(before,p.depts[role])});
  }
  if(cmd.type==='resolveEffect'&&cmd.use&&before.pending?.cardId) {
    const m=out.machines.find(m=>m.seat===p.id&&m.cardId===before.pending.cardId);
    if(m){m.optionalConversionsUsed++;}
  }
  if(before.rowEconomy.welfareBank){event.bankBefore=before.welfareBank||0;event.bankAfter=after.welfareBank||0;if(cmd.type==='investWelfare')event.bankDeposit=event.spent;if(cmd.type==='repress'){event.bankLoot=event.income;event.tensionRemoved=p.depts[cmd.role].tension-q.depts[cmd.role].tension;}}
  if(cmd.type==='borsaExit')event.cityIncome=event.income;
  if(cmd.type==='spendWelfareToken'||cmd.type==='repress')event.affected=roles.map(r=>({role:r,before:rowPressureState(before,p.depts[r]),after:rowPressureState(after,q.depts[r])}));
  const thresholds=before.rowEconomy.productionThresholds||Array.from({length:rowTrackModel(before.trackModel).rows},(_,i)=>i*rowTrackModel(before.trackModel).columns+1);
  for(const r of roles)for(const threshold of thresholds)if(p.depts[r].prod<threshold&&q.depts[r].prod>=threshold)out.thresholds.push({seat:p.id,role:r,turn:before.turn,threshold});
  for(const r of roles)for(let pos=p.depts[r].prod+1;pos<=q.depts[r].prod;pos++) {
    const reward=before.tracks[r][pos]?.milestoneReward;
    if(reward)(out.milestones??=[]).push({seat:p.id,role:r,turn:before.turn,position:pos,...reward});
  }
  if(cmd.type==='claimRoundAward'||cmd.type==='skipRoundAward') event.roundAward=after.roundAwards.log.at(-1);
  out.events.push(event);
}
export function finishStudy(out,state) {
  if(!state.gameOver)throw new Error('La partita non è terminata.');
  for(const p of state.players) {
    if(p.coins!==out.initial[p.id].coins+p.coinsGained-total(p.coinsSpentBy))throw new Error(`Bilancio marchi non valido: giocatore ${p.id+1}.`);
    if(total(p.coinsGainedBy)!==p.coinsGained)throw new Error('Fonti dei marchi incoerenti.');
    const owned=out.machines.filter(m=>m.seat===p.id);
    for(const [kind,source]of [['fisso','lavFisso'],['tensione','lavTensione']])if(sum(owned.filter(m=>m.kind===kind||(kind==='fisso'&&m.kind==='continuita')),m=>m.immediate+m.recurring)!==p.coinsGainedBy[source])throw new Error(`Rendimenti macchinari incoerenti: ${kind}.`);
    if(total(p.resources)!==out.initial[p.id].resources+total(p.resGainedBy)-total(p.resSpentByCat)-p.resCapLost)throw new Error(`Bilancio risorse non valido: giocatore ${p.id+1}.`);
  }
  out.verified={completed:true,money:state.nPlayers,resources:state.nPlayers,machineIncome:state.nPlayers};
  if(state.rowEconomy.welfareBank){const deposits=sum(state.players,p=>p.coinsSpentBy.welfare),loot=sum(state.players,p=>p.coinsGainedBy.welfareLoot||0);if(state.welfareBank!==deposits-loot||state.welfareBank<0)throw new Error('Bilancio banca Welfare non valido.');out.bankVerified={deposits,loot,remaining:state.welfareBank};}
  if(fundBalances(state)){
    out.fundsVerified=Object.fromEntries(WELFARE_FUNDS.map(f=>{
      const deposits=sum(out.events,e=>e.fundDeposits?.[f.id]||0),loot=sum(out.events,e=>e.fundTarget===f.id?e.bankLoot||0:0),remaining=fundBalances(state)[f.id];
      if(remaining!==deposits-loot||remaining<0||out.events.some(e=>e.fundsAfter&&e.fundsAfter[f.id]<0))throw new Error('Bilancio fondo Welfare non valido: '+f.name);
      return [f.id,{deposits,loot,remaining}];
    }));
    if(total(fundBalances(state))!==state.welfareBank)throw new Error('Somma fondi diversa dalla banca.');
  }
  delete out.seen;
  return out;
}
const f=n=>n==null?'—':n.toLocaleString('it-IT',{maximumFractionDigits:2});
const table=(head,rows)=>['| '+head.join(' | ')+' |','| '+head.map(()=>'---').join(' | ')+' |',...rows.map(row=>'| '+row.map(x=>typeof x==='number'?f(x):String(x??'—').replaceAll('|','/').replaceAll('\n',' ')).join(' | ')+' |')].join('\n');
export function detailedReport(config,games,status) {
  const policyState={roundRondel:config.roundRondel},WELFARE_POLICIES=welfarePolicies(policyState),WELFARE_DISPLAY_POLICIES=welfareDisplayPolicies(policyState);
  const people=games.flatMap(g=>g.people.map(p=>({...p,seed:g.seed,game:g,final:g.finalState?.players[p.playerId]}))),studies=games.map(g=>g.study).filter(Boolean);
  const events=studies.flatMap(s=>s.events),machines=studies.flatMap(s=>s.machines),prods=studies.flatMap(s=>s.productions),thresholds=studies.flatMap(s=>s.thresholds),offers=studies.flatMap(s=>Object.values(s.offers));
  const metric=key=>distribution(people.map(p=>key==='staff'||key==='machines'?sum(roles,r=>p.final?.depts[r][key==='staff'?'sopra':'sotto'].length||0):key==='firstContract'?p.final?.contractsWon[0]?.turn:p[key]).filter(n=>Number.isFinite(n)));
  const source=key=>people.reduce((all,p)=>{for(const [k,v]of Object.entries(p.final?.[key]||{}))all[k]=(all[k]||0)+v;return all;},{});
  const targets=machines.filter(m=>m.kind==='tensione'),pair=prods.filter(p=>p.targets>=2),cures=events.filter(e=>e.type==='spendWelfareToken'),repressions=events.filter(e=>e.type==='repress'),N=people.length;
  const moneySources=source('coinsGainedBy'),cityIncome=sum(events,e=>e.cityIncome||0);moneySources.scambio=(moneySources.scambio||0)-cityIncome;moneySources.citta=cityIncome;
  const cohort=ps=>[ps.length,mean(ps,p=>p.total),mean(ps,p=>p.nContracts),mean(ps,p=>p.stats.welfareBuys),mean(ps,p=>p.stats.repressions)];
  const research=researchSummary(games);
  const L=[`# OFFICINA 1907 — ${config.name}`,`\n${status}: **${games.length}/${config.simulation.games} partite**, ${N} giocatori-partita. Generato: ${new Date().toISOString()}.`,
    `\n## Esperimento riproducibile\n\nImpronta configurazione: **${fingerprint(config)}**. IA ${config.simulation.ai}, d${config.simulation.depth}/r${config.simulation.rollouts}. ${config.players} giocatori, ${config.turns} turni. Versioni del motore: ${[...new Set(games.map(g=>g.release?.version||'sviluppo locale'))].join(', ')}.`,
    `Mazzetti commesse: ${['small','medium','large'].map(size=>`${size} ${config.contractCount[config.players][size]}/${config.contracts[size].length}`).join(' · ')}. Carte visibili per taglia: ${config.contractMarket}.`,
    `Tensione: ${config.tensionDirection==='same'?'stesso verso dello sviluppo, prima riga coperta per prima':'verso opposto, ultime righe coperte per prime'}. Sblocco produzione: ${config.productionUnlock==='cells'?'singola casella, arrivo o superamento':'intera riga'}. Soglie di riga ${config.productionUnlock==='cells'?'inattive':'permanenti'}: ${config.productionThresholds.join('/') }. Risorsa immediata alla soglia: ${config.productionUnlock!=='cells'&&config.milestoneResource?'sì':'no'}. Macchinari attivi all’installazione: ${config.machineImmediate?'sì':'no'}.`,
    ...(config.track.some(c=>c?.milestoneReward)?['\n### Milestone con premio una tantum\n',table(['Casella','Risorse del reparto','Marchi'],config.track.flatMap((c,i)=>c?.milestoneReward?[[i,c.milestoneReward.res||0,c.milestoneReward.coins||0]]:[])),table(['Seme','Posto','Reparto','Turno','Casella','Risorse ricevute','Marchi ricevuti'],games.flatMap(g=>(g.study?.milestones||[]).map(m=>[g.seed,m.seat+1,m.role,m.turn,m.position,m.res||0,m.coins||0]))),'I premi sono incassati una volta quando si raggiunge o supera la casella, anche con tensione alta. Turno 0 = premio della posizione iniziale, già conteggiato nel bilancio. Non si ripetono nelle produzioni.']:[]),
    `Semi completati: ${games.map(g=>g.seed).join(', ')}.`,
    `Tempo di calcolo cumulato: ${f(sum(games,g=>g.elapsedMs)/1000)} secondi (in parallelo differisce dal tempo trascorso).`,
    `\n## Controlli di accuratezza\n\nPartite terminate verificate: ${studies.filter(s=>s.verified?.completed).length}/${games.length}; bilanci marchi: ${sum(studies,s=>s.verified?.money||0)}/${N}; bilanci risorse: ${sum(studies,s=>s.verified?.resources||0)}/${N}; rendite macchinari: ${sum(studies,s=>s.verified?.machineIncome||0)}/${N}.`,
    'Le frequenze descrivono questa IA e questo campione. Confronti tra possessori e non possessori sono correlazioni; per attribuire un effetto alla regola occorre un confronto A/B sugli stessi semi.',
    '\n## Risultati generali\n',table(['Indicatore','N','Media','Mediana','Min','Max'],[['PV','total'],['Commesse','nContracts'],['Turno prima commessa','firstContract'],['Operai Sopra','staff'],['Macchinari Sotto','machines'],['Marchi finali','coins']].map(([label,key])=>{const d=metric(key);return [label,d.n,d.mean,d.median,d.min,d.max];})),
    `\n## Posizione di turno\n\n${table(['Posto','N','Vittorie equivalenti','PV medi'],Array.from({length:config.players},(_,seat)=>{const ps=people.filter(p=>p.playerId===seat);return [seat+1,ps.length,sum(ps,p=>{const best=[...p.game.people].sort((a,b)=>b.total-a.total||b.coins-a.coins||b.nContracts-a.nContracts)[0],ties=p.game.people.filter(q=>q.total===best.total&&q.coins===best.coins&&q.nContracts===best.nContracts);return ties.some(q=>q.playerId===seat)?1/ties.length:0;}),mean(ps,p=>p.total)];}))}`,
    '\n## Diffusione delle scelte\n',
    'Giocatori-partita: chi esegue la scelta almeno una volta. Quota turni: turni propri con quella scelta sul totale completato. Protezioni e cure possono accompagnare altre azioni: le percentuali si sovrappongono e non vanno sommate.',
    table(['Scelta','Giocatori','Totale','% giocatori','Eventi','% turni'],research.participation.map(r=>[r.label,r.players,r.totalPlayers,r.playerPercent,r.events,r.turnPercent])),
    table(['Nodo','Turni osservati','Azione del nodo accessibile','Scelta azione','Scelta carta','Né azione né carta acquistabile'],research.opportunities.map(r=>[r.node==='Servizi'?'Welfare':'Repressione',r.measuredTurns,r.actionAffordable,r.choseAction,r.choseCard,r.neitherAffordable])),
    'L’accessibilità viene misurata solo sul nodo effettivamente visitato, dopo il costo di movimento. Per risultati storici senza questa osservazione i conteggi non sono disponibili; uno zero con zero turni osservati non dimostra mancanza di opportunità.',
    '\n## Assunzioni e sviluppo\n',`Assunzioni Sopra: ${events.filter(e=>e.type==='hire'&&e.side==='sopra').length}; scontate: ${events.filter(e=>e.discount>0).length}; risparmio totale: ${f(sum(events,e=>e.discount||0))} marchi.`,
    `Turni con almeno un’assunzione legale: ${offers.length}; turni in cui viene scelta: ${offers.filter(o=>o.picked).length}. La disponibilità non dimostra che fosse la scelta migliore.`,
    config.productionUnlock==='cells'?'Le soglie di riga qui sotto sono solo riferimenti di sviluppo: ogni rendimento si sblocca alla propria casella.':'Il turno 0 indica una soglia già sbloccata nel setup: il premio immediato si paga solo attraversandola durante un avanzamento.',
    table(['Soglia','Reparti arrivati','Su reparti totali','Turno medio'],config.productionThresholds.map(t=>{const ts=thresholds.filter(x=>x.threshold===t);return [t,ts.length,N*3,mean(ts,x=>x.turn)];})),
    table(['Settore','Reparti','Operai medi','Macchinari medi','Sviluppo medio','Tensione finale media','Spazi macchinari pieni'],Object.values(RESOURCE_OF).map((_,i)=>{const ds=people.map(p=>p.final?.depts[roles[i]]).filter(Boolean);return [ds[0]?.sector||roles[i],ds.length,mean(ds,d=>d.sopra.length),mean(ds,d=>d.sotto.length),mean(ds,d=>d.prod),mean(ds,d=>d.tension),ds.filter(d=>d.sotto.length===config.machineSlots[i]).length];})),
    '\n## Macchinari: ritorno monetario e tempismo\n',
    'Ricavo lordo immediato e ricavo nelle produzioni sono separati. Pareggio monetario = incassi ≥ prezzo; non remunera l’azione o lo spazio. Le conversioni hanno valore anche in risorse: non sono confrontabili tramite il solo pareggio in marchi.',
    table(['Tipo / costo','Copie','Spesa','Incasso immediato','Incasso successivo','Mai prodotte','Pareggio monetario','Attesa prima produzione'],[...new Set(machines.map(m=>`${m.kind}/${m.cost}`))].sort().map(k=>{const ms=machines.filter(m=>`${m.kind}/${m.cost}`===k);return [k,ms.length,sum(ms,m=>m.cost),k.startsWith('conversione')?'—':sum(ms,m=>m.immediate),k.startsWith('conversione')?'—':sum(ms,m=>m.recurring),ms.filter(m=>!m.uses).length,k.startsWith('conversione')?'—':ms.filter(m=>m.payback!=null).length,mean(ms.filter(m=>m.firstUse!=null),m=>m.firstUse-m.turn)];})),
    `Macchinari da tensione: ${targets.length}; coppie o gruppi da ≥2 nella stessa produzione: ${pair.length} attivazioni; ${f(sum(pair,p=>p.targetIncome))} marchi. Produzioni con macchinari da tensione e zero righe accessibili: ${prods.filter(p=>p.targets>0&&p.available===0).length}.`,
    table(['Tensione prima della produzione','Un macchinario','Due o più'],Array.from({length:Math.max(...prods.map(p=>p.tension),4)+1},(_,t)=>[t,prods.filter(p=>p.tension===t&&p.targets===1).length,prods.filter(p=>p.tension===t&&p.targets>=2).length])),
    '\n## Welfare, repressione e tensione\n',
    `${config.roundRondel?.enabled?'Acquisti di gettoni al Welfare':config.welfareRondel?'Visite alla rondella Welfare':'Pacchetti welfare'}: ${sum(people,p=>p.stats.welfareBuys)}; produzioni protette: ${sum(people,p=>p.stats.protectedProductions||0)}; cure: ${cures.length}; gettoni finali: ${sum(people,p=>p.welfareTokens||0)}.`,
    `Cure insieme a un’assunzione nello stesso turno: ${cures.filter(c=>events.some(e=>e.type==='hire'&&e.seat===c.seat&&e.turn===c.turn&&studies.some(s=>s.events.includes(c)&&s.events.includes(e)))).length}.`,
    `Repressioni: ${repressions.length}; righe riaperte nel reparto azzerato: ${sum(repressions,e=>sum(e.affected.filter(a=>a.role===e.role),a=>a.after.available-a.before.available))}; righe coperte negli altri: ${sum(repressions,e=>sum(e.affected.filter(a=>a.role!==e.role),a=>Math.max(0,a.before.available-a.after.available)))}.`,
    `Produzioni: ${prods.length}; con righe sviluppate bloccate: ${prods.filter(p=>p.blocked>0).length}; righe bloccate totali: ${sum(prods,p=>p.blocked)} su ${sum(prods,p=>p.developed)} sviluppate.`,
    table(['Tensione prima della produzione','Produzioni','Con righe bloccate','% produzioni a questo livello','Giocatori con blocco','Righe bloccate sommate','Risorse escluse dal tracciato'],Array.from({length:rowTrackModel(config.trackModel).rows+1},(_,t)=>{const ps=prods.filter(p=>p.tension===t),blocked=ps.filter(p=>p.blocked>0);return [t,ps.length,blocked.length,ps.length?100*blocked.length/ps.length:0,new Set(games.flatMap((g,i)=>(g.study?.productions||[]).filter(p=>p.tension===t&&p.blocked>0).map(p=>`${i}:${p.seat}`))).size,sum(ps,p=>p.blocked),ps.every(p=>p.blockedResources!==undefined)?sum(ps,p=>p.blockedResources):'n.d.'];})),
    'Righe e risorse escluse sono osservazioni ripetute prima delle produzioni effettive. Risorse escluse = rendimento nominale già sbloccato coperto dalla tensione, prima del limite di scorta; non include premi immediati o macchinari. Non misura le produzioni cui il giocatore ha rinunciato.',

    ...(config.welfareBank?['\n## Banca Welfare e saccheggi\n',`Repressione gratuita. Versati ${sum(events,e=>e.bankDeposit||0)} marchi; rubati ${sum(events,e=>e.bankLoot||0)}; saldo finale complessivo ${sum(games,g=>g.finalState.welfareBank||0)}. Bilanci banca verificati: ${studies.filter(s=>s.bankVerified).length}/${studies.length}.`,table(['Seme','Posto','Turno','Azione','Banca prima','Versamento','Tensione eliminata','Bottino','Banca dopo'],games.flatMap(g=>(g.study?.events||[]).filter(e=>e.type==='investWelfare'||e.type==='repress').map(e=>[g.seed,e.seat+1,e.turn,e.type==='repress'?'Repressione':'Welfare',e.bankBefore,e.bankDeposit||0,e.tensionRemoved||0,e.bankLoot||0,e.bankAfter])))]:[]),
    ...(config.welfareRondel ? [
      config.roundRondel?.enabled?'\n## Rondella personale\n':'\n## Rondella Welfare\n',
      config.roundRondel?.startingPolicy==='affinity'?`Tutti partono su Affinità: sconto fisso di 1 marco su una nazionalità già presente nella tua fabbrica, solo finché si occupa la casella. Dopo i turni ${config.roundRondel.bounds.join(", ")} movimento obbligatorio di 1–6 passi: primi 3 gratis, poi 1 marco per passo extra; zero gettoni. Il bonus viene sostituito dalla destinazione.`:config.roundRondel?.enabled?`Movimento solo dopo i turni9/18: ${config.roundRondel.freeEntry?'primo ingresso libero su qualsiasi politica; poi ':''}massimo3passi a${config.roundRondel.stepCost}marchi per passo; nessun gettone. Al Welfare si acquistano1–3gettoni a1marco. Primo periodo senza politica, permanenza gratuita consentita.`:`Un marco per passo e gettone, da 1 a ${games[0]?.finalState ? welfareMaxSteps(games[0].finalState) : 3}. ${games[0]?.finalState && freeWelfareEntry(games[0].finalState) ? "Primo ingresso libero" : "Partenza prima di Cooperazione, senza bonus; primo ingresso con 1–3 passi, Formazione richiede almeno due visite"}; avanzamento in senso orario, spazi condivisi. Il bonus personale resta attivo fino allo spostamento. I valori dei benefici sono rendimenti effettivi, non una stima dei PV.`,
      table(['Politica','ON/OFF','Visite','Giocatori distinti per partita','Beneficio effettivo','Unità'],WELFARE_DISPLAY_POLICIES.map(policy=>{const i=WELFARE_POLICIES.indexOf(policy);const visits=events.filter(e=>(config.roundRondel?.enabled?e.type==='advanceRoundRondel':e.type==='investWelfare')&&e.policyAfter===i);return [policy.name,config.welfarePoliciesEnabled?.[policy.id]===false?'OFF':'ON',visits.length,people.filter(p=>p.final?.welfareRondelStats?.visits.some(v=>v.position===i)).length,sum(people,p=>p.final?.welfareRondelStats?.benefits[policy.id]||0),({formation:'passi extra',integration:'marchi risparmiati',affinity:'marchi risparmiati',innovation:'marchi risparmiati',cooperation:'marchi incassati',reliability:'marchi incassati',mutualAid:'conversioni eseguite'})[policy.id]];})),
      `Giocatori che hanno attivato almeno un bonus: ${research.policyUsers}/${research.players}. Gettoni acquistati: ${research.purchasedTokens}; giri completi conservando la politica: ${research.fullLaps}.`,
      table(['Politica','Offerta in turni visitati','Scelta % quando offerta','Turni propri fino a visita successiva/fine','Attesa primo beneficio','Visite senza beneficio'],research.policies.map(p=>[p.name,p.offeredTurns,p.chosenWhenOfferedPercent,p.averageFutureTurns,p.averageWait,p.unusedVisits])),
      config.roundRondel?.enabled?'Politiche offerte nei checkpoint di fine round, se raggiungibili e pagabili. Restare non apre un nuovo intervallo. I gettoni si acquistano solo al nodo Welfare. Gli intervalli misurano benefici effettivi fino al prossimo movimento o alla fine, non utilità causale.':'Una politica è offerta se esiste almeno una destinazione raggiungibile e pagabile durante quel turno al Welfare. Ogni politica conta una volta per turno anche con più quantità di passi. Una visita senza beneficio significa nessun effetto osservato prima della visita successiva o della fine; non equivale a valore strategico nullo.',
      table(['Passi scelti','Visite'],research.steps.map(s=>[s.steps,s.visits])),
      table(['Seme','Posto','Turno scelta','Politica','Costo',config.roundRondel?.enabled?'Passi (zero gettoni)':'Passi/gettoni','Turni successivi','Attivazioni bonus','Valore effettivo','Ritorno diretto in marchi','Assunzioni / macchinari / produzioni / commesse'],research.spells.map(s=>[s.seed,s.seat+1,s.turn,WELFARE_POLICIES[s.position].name,s.cost,s.steps,s.futureTurns,s.triggers,s.value,s.directCoinReturn,`${s.actions.staff} / ${s.actions.machines} / ${s.actions.productions} / ${s.actions.contracts}`])),
      'Ogni riga descrive l’intervallo fra due visite dello stesso giocatore; anche un giro completo apre un nuovo intervallo. Le unità di valore restano quelle della politica (passi, marchi, conversioni). Il ritorno diretto in marchi esclude gettoni, risorse e sviluppo: non è il valore totale dell’investimento né una conversione in PV. Le azioni associate alla politica sono una correlazione, non provano che la politica le abbia causate.',
      table(['Seme','Posto','Turno','Passi / costo / gettoni','Politica scelta'],games.flatMap(g=>(g.study?.events||[]).filter(e=>config.roundRondel?.enabled?e.type==='advanceRoundRondel':e.type==='investWelfare').map(e=>[g.seed,e.seat+1,e.turn,e.steps,WELFARE_POLICIES[e.policyAfter]?.name]))),
    ] : []),
    '\n## Seguito di welfare e repressione\n',
    table(['Seme','Posto','Turno','Intervento','Reparto','Costo','Gettoni','Righe subito riaperte','Produzioni successive nel reparto','Prima produzione successiva'],research.interventions.map(e=>[e.seed,e.seat+1,e.turn,e.type==='repress'?'Repressione':e.type==='spendWelfareToken'?'Cura':'Protezione',e.role,e.cost,e.tokens,e.reopened,e.followingProductions,e.firstFollowingTurn])),
    'Le produzioni successive sono osservate fino a fine partita, anche se intervengono altre cure. Indicano un seguito possibile, non il beneficio marginale attribuibile all’intervento. Per dimostrare uno spreco o una commessa resa possibile occorre un replay controfattuale.',
    '\n## Commesse\n',table(['Taglia','Completate','PV','Turno medio'],['small','medium','large'].map(size=>{const cs=people.flatMap(p=>p.final?.contractsWon||[]).filter(c=>c.size===size);return [size,cs.length,sum(cs,c=>c.pv),mean(cs,c=>c.turn)];})),
    `Giocatori senza commesse: ${people.filter(p=>!p.nContracts).length}/${N}.`,
    '\n## Conversioni\n',table(['Tipo','Disponibili','Eseguite'],Object.keys(source('convAttempts')).map(key=>[key,source('convAttempts')[key],source('convCount')[key]||0])),
    '\n## Economia: totali verificati\n',table(['Fonte marchi','Totale'],Object.entries(moneySources)),table(['Spesa marchi','Totale'],Object.entries(source('coinsSpentBy'))),table(['Fonte risorse','Totale'],Object.entries(source('resGainedBy'))),table(['Uso risorse','Totale'],Object.entries(source('resSpentByCat'))),
    `Risorse finali: ${sum(people,p=>p.final?total(p.final.resources):0)}; perse per limite di scorta: ${sum(people,p=>p.final?.resCapLost||0)}. Le conversioni compaiono sia tra entrate sia tra uscite; non contare le risorse convertite come nuova produzione.`,
    '\n## Andamento nei quarti di partita\n',table(['Turni','Marchi a inizio turno','Produzioni','Righe accessibili medie','Rendite marchi (escluse conversioni)'],Array.from({length:4},(_,i)=>{const from=Math.floor(i*config.turns/4)+1,to=Math.floor((i+1)*config.turns/4),starts=studies.flatMap(s=>s.starts).filter(e=>e.turn>=from&&e.turn<=to),ps=prods.filter(e=>e.turn>=from&&e.turn<=to);return [`${from}–${to}`,mean(starts,e=>e.coins),ps.length,mean(ps,e=>e.available),sum(ps,e=>e.machineIncome)];})),
    '\n## Gruppi osservati: correlazioni, non effetti causali\n',table(['Gruppo','N','PV medi','Commesse','Welfare','Repressioni'],[['Senza macchinari da tensione',people.filter(p=>!p.game.study?.machines.some(m=>m.seat===p.playerId&&m.kind==='tensione'))],['Con coppia attivata',people.filter(p=>p.game.study?.productions.some(m=>m.seat===p.playerId&&m.targets>=2))],['Con welfare',people.filter(p=>p.stats.welfareBuys>0)],['Senza welfare',people.filter(p=>!p.stats.welfareBuys)],['Con repressione',people.filter(p=>p.stats.repressions>0)],['Senza repressione',people.filter(p=>!p.stats.repressions)]].map(([label,ps])=>[label,...cohort(ps)])),
    '\n## Singole carte: apparizioni e scelta\n',table(['Carta','Nazione','Settore','Apparsa','Sopra','Sotto'],Object.values(studies.reduce((all,s)=>{for(const c of Object.values(s.cards)){const a=all[c.id]??={...c,appeared:0,sopra:0,sotto:0};for(const k of ['appeared','sopra','sotto'])a[k]+=c[k];}return all;},{})).map(c=>[c.id,c.nation,c.sector,c.appeared,c.sopra,c.sotto])),
    ...(config.roundRondel?.fundThresholds?['\n## Fondi Welfare\n',table(['Fondo','Soglia','Versamenti','Bottini','Saldo finale','Attivazioni','Disattivazioni'],WELFARE_FUNDS.map(f=>[f.name,f.threshold,sum(events,e=>e.fundDeposits?.[f.id]||0),sum(events,e=>e.fundTarget===f.id?e.bankLoot||0:0),sum(games,g=>fundBalances(g.finalState)?.[f.id]||0),events.filter(e=>e.fundActivated?.includes(f.id)).length,events.filter(e=>e.fundDeactivated?.includes(f.id)).length]))]:[]),
    ...(config.roundObjectives?['\n## Richieste incassate per round\n',table(['Seme','Round','Scadenza','Posto','Carta','PV'],games.flatMap(g=>(g.finalState.roundObjectives?.log||[]).flatMap(row=>row.awards.flatMap(a=>a.cards.map(c=>[g.seed,row.round,row.endTurn,a.seat+1,c.name,c.pv])))))]:[]),
    '\n## Risultati per seme e giocatore\n',table(['Seme','Posto','PV',...(config.finalResourcePV?['PV commesse','PV marchi','PV risorse']:[]),...(config.roundObjectives?['PV richieste']:[]),'Commesse','Marchi','Operai','Macchinari','Welfare','Repressioni'],people.map(p=>[p.seed,p.playerId+1,p.total,...(config.finalResourcePV?[p.pvContracts,p.pvCoins,p.pvResources]:[]),...(config.roundObjectives?[p.pvRoundCards||0]:[]),p.nContracts,p.coins,p.final?sum(roles,r=>p.final.depts[r].sopra.length):null,p.final?sum(roles,r=>p.final.depts[r].sotto.length):null,p.stats.welfareBuys,p.stats.repressions])),
    '\n## Cronologia delle produzioni in coppia\n',table(['Seme','Posto','Turno','Reparto','Tensione','Righe','Macchinari da tensione','Marchi','Protetta'],games.flatMap(g=>(g.study?.productions||[]).filter(p=>p.targets>=2).map(p=>[g.seed,p.seat+1,p.turn,p.sector,p.tension,p.available,p.targets,p.targetIncome,p.protected?'sì':'no']))),
    '\n## Configurazione completa\n\n```json\n'+JSON.stringify(config,null,2)+'\n```',
    '\nI dati JSON includono semi, configurazione, mosse, stato finale e osservazioni per verifiche e analisi successive.'];
  return L.join('\n\n');
}
