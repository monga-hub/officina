import { WELFARE_POLICIES } from '../game/welfare-rondel.js';
const sum = (xs, f) => xs.reduce((n, x) => n + f(x), 0);
const mean = (xs, f) => xs.length ? sum(xs, f) / xs.length : null;
const categories = [
  ['production','Producono',e=>e.type==='activate'],
  ['staff','Assumono operai Sopra',e=>e.type==='hire'&&e.side==='sopra'],
  ['machines','Installano macchinari',e=>e.type==='hire'&&e.side==='sotto'],
  ['welfare','Scelgono l’azione Welfare',e=>e.type==='investWelfare'],
  ['tokens','Spendono gettoni welfare',e=>e.type==='spendWelfareToken'||e.protected===true],
  ['protection','Proteggono produzioni',e=>e.protected===true],
  ['recovery','Curano con gettoni',e=>e.type==='spendWelfareToken'],
  ['repression','Usano repressione',e=>e.type==='repress'],
  ['contracts','Consegnano commesse',e=>e.type==='completeContract'],
];
export function researchSummary(games) {
  const players = games.flatMap((game, index) => game.finalState?.players.map(p => ({ game, index, player:p, events:(game.study?.events||[]).filter(e=>e.seat===p.id).map(e=>({...e,protected:e.protected??game.commands?.[e.seq]?.welfareToken??false})) })) || []);
  const totalTurns = sum(players,p=>p.player.coinsHistory?.length??p.game.turns);
  const participation = categories.map(([id,label,test]) => {
    const count=players.filter(p=>p.events.some(test)).length;
    const turns=sum(players,p=>new Set(p.events.filter(test).map(e=>e.turn)).size);
    return {id,label,players:count,totalPlayers:players.length,playerPercent:players.length?100*count/players.length:null,
      events:sum(players,p=>p.events.filter(test).length),turns,totalTurns,turnPercent:totalTurns?100*turns/totalTurns:null};
  });
  const opportunities = ['Servizi','Sindacato'].map(node => {
    const decisions=players.flatMap(p=>p.events.filter(e=>e.node===node&&e.availableActions).map(e=>({e,key:`${p.index}:${p.player.id}:${e.turn}`})));
    const unique=test=>new Set(decisions.filter(({e})=>test(e)).map(d=>d.key)).size;
    const action=node==='Servizi'?'investWelfare':'repress';
    return {node,measuredTurns:unique(()=>true),actionAffordable:unique(e=>e.availableActions.includes(action)),
      choseAction:unique(e=>e.type===action),choseCard:unique(e=>e.type==='hire'),neitherAffordable:unique(e=>!e.availableActions.includes(action)&&!e.availableActions.includes('hire'))};
  });
  const spells=[];
  for(const p of players){
    const roundMode=!!p.game.finalState?.roundRondel;
    const visits=p.events.filter(e=>(roundMode?e.type==='advanceRoundRondel':e.type==='investWelfare')&&Number.isInteger(e.policyAfter));
    visits.forEach((visit,i)=>{
      const next=visits[i+1],after=p.events.filter(e=>e.seq>visit.seq&&(!next||e.seq<next.seq));
      const policy=WELFARE_POLICIES[visit.policyAfter];
      const triggers=after.filter(e=>(e.policyBenefits?.[policy.id]||0)>0);
      const value=sum(triggers,e=>e.policyBenefits[policy.id]);
      const hired=after.filter(e=>e.type==='hire');
      spells.push({game:p.index,seed:p.game.seed,seat:p.player.id,turn:visit.turn,seq:visit.seq,position:visit.policyAfter,policy:policy.id,
        previous:visit.policyBefore,firstEntry:visit.policyBefore==null,fullLap:visit.steps===6&&visit.policyBefore===visit.policyAfter,
        steps:visit.steps,cost:visit.spent,tokens:visit.tokensGained,
        futureTurns:Math.max(0,(next?.turn??p.game.turns)-visit.turn+(roundMode&&!next?1:0)),firstBenefitTurn:triggers[0]?.turn??null,
        triggers:triggers.length,value,unused:triggers.length===0,
        directCoinReturn:['cooperation','innovation','integration','reliability'].includes(policy.id)?value:null,
        actions:{staff:hired.filter(e=>e.side==='sopra').length,machines:hired.filter(e=>e.side==='sotto').length,
          productions:after.filter(e=>e.type==='activate').length,contracts:after.filter(e=>e.type==='completeContract').length,repressions:after.filter(e=>e.type==='repress').length}});
    });
  }
  const policies=WELFARE_POLICIES.map((policy,position)=>{
    const own=spells.filter(s=>s.position===position);
    const offered=new Set(players.flatMap(p=>p.events.filter(e=>e.availablePolicies?.includes(position)).map(e=>`${p.index}:${p.player.id}:${e.turn}`))).size;
    return {...policy,visits:own.length,players:new Set(own.map(s=>`${s.game}:${s.seat}`)).size,
      offeredTurns:offered,chosenWhenOfferedPercent:offered?100*own.length/offered:null,
      averageFutureTurns:mean(own,s=>s.futureTurns),averageWait:mean(own.filter(s=>s.firstBenefitTurn!==null),s=>s.firstBenefitTurn-s.turn),
      triggers:sum(own,s=>s.triggers),value:sum(own,s=>s.value),unusedVisits:own.filter(s=>s.unused).length};
  });
  const steps=Array.from({length:6},(_,i)=>({steps:i+1,visits:spells.filter(s=>s.steps===i+1).length}));
  const interventions=players.flatMap(p=>p.events.filter(e=>['repress','spendWelfareToken'].includes(e.type)||e.protected).map(e=>{
    const role=e.role,following=p.game.study.productions.filter(x=>x.seat===p.player.id&&x.role===role&&x.seq>e.seq);
    const affected=e.affected?.find(a=>a.role===role);
    return {game:p.index,seed:p.game.seed,seat:p.player.id,turn:e.turn,type:e.type,role,cost:e.spent,tokens:e.tokens||Number(e.protected),
      reopened:affected?affected.after.available-affected.before.available:0,
      followingProductions:following.length,firstFollowingTurn:following[0]?.turn??null};
  }));
  return {players:players.length,totalTurns,participation,opportunities,spells,policies,steps,interventions,
    fullLaps:spells.filter(s=>s.fullLap).length,firstEntries:spells.filter(s=>s.firstEntry).length,
    purchasedTokens:sum(players,p=>p.game.finalState?.roundRondel?sum(p.events.filter(e=>e.type==='investWelfare'),e=>e.tokensGained||0):sum(spells.filter(s=>s.game===p.index&&s.seat===p.player.id),s=>s.tokens||0)),policyCoinReturn:sum(spells,s=>s.directCoinReturn||0),
    tokensRemaining:sum(players,p=>p.player.welfareTokens||0),
    policyUsers:players.filter(p=>p.events.some(e=>Object.values(e.policyBenefits||{}).some(n=>n>0))).length};
}
