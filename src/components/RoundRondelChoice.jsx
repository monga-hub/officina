import {cardById,cardRequirement} from '../game/round-objectives.js';
import {policyDescription,policyFund,fundBalances} from '../game/welfare-funds.js';
import React from 'react';
import {roundRondelCost} from '../game/round-rondel.js';
import { welfarePolicies } from '../game/welfare-rondel.js';

export default function RoundRondelChoice({state,player,legal,dispatch}) {
  const WELFARE_POLICIES=welfarePolicies(state);
  const paid=state.roundRondel.extraStepCost===1;
  const first=player.welfarePosition==null;
  return <section className="round-rondel-choice" aria-label="Scelta della politica di fine round">
    <p className="lab-eyebrow">FINE ROUND · TURNO {state.roundRondel.active.endTurn}</p>
    <h2>{player.name}, scegli la tua politica</h2>
    <p>{paid?'Devi avanzare da 1 a 6 passi in senso orario: i primi 3 sono gratis, ogni passo aggiuntivo costa 1 marco. Nessun gettone.':<>{first?'Primo ingresso libero: scegli qualsiasi casella attiva.':'Puoi restare o avanzare in senso orario di uno, due o tre passi.'} Gratis, senza gettoni.</>}</p>
    {state.roundObjectives?.active.length>0&&<aside className="round-next-requests"><h3>Richieste del nuovo round</h3><ul>{state.roundObjectives.active.map(id=>{const c=cardById(id),r=state.roundObjectives.round;return <li key={id}><b>{c.name}</b> · {c.thresholds[r].map((n,i)=>`${2*(i+1)} PV ≥${n}`).join(' · ')}<small>{cardRequirement(c,r)}</small></li>;})}</ul><p>Premi appena incassati: {state.roundObjectives.log.at(-1)?.awards[player.id].pv||0} PV. Totale richieste acquisito: {state.roundObjectives.banked[player.id]} PV.</p></aside>}
    <p>Politica attuale: <b>{WELFARE_POLICIES[player.welfarePosition]?.name||'nessuna'}</b>. Le caselle sono condivise.</p>
    <div className="round-rondel-options">{legal.map(command=>{
      const keep=command.type==='keepRoundRondel',base=WELFARE_POLICIES[keep?player.welfarePosition:command.position],policy=base?policyDescription(state,base):null;
      return <button key={keep?'keep':command.position} data-welfare-fund={fundBalances(state)?policyFund(policy?.id)?.id:undefined} className="production-choice" onClick={()=>dispatch(command)}>
        <strong>{keep?(first?'Rinvia il primo ingresso':`Resta su ${WELFARE_POLICIES[player.welfarePosition].name}`):policy.name}</strong>
        {fundBalances(state)&&policyFund(policy?.id)&&<small>{policy.id==='affinity'?'Personale · sconto fisso, indipendente dal fondo':<>{policyFund(policy.id).name}: {fundBalances(state)[policyFund(policy.id).id]}/{policyFund(policy.id).threshold} · {policy.upgraded?'potenziata':'base'}</>}</small>}
        <small className="round-policy-effect">{policy?.description||'Conserva la situazione attuale fino alla prossima scelta.'}</small>
        {!keep&&!first&&<small>{command.steps} {command.steps===1?'passo':'passi'} · {roundRondelCost(state.roundRondel,command.steps)===0?'gratis':`${roundRondelCost(state.roundRondel,command.steps)} ${roundRondelCost(state.roundRondel,command.steps)===1?'marco':'marchi'}`}</small>}
      </button>;
    })}</div>
    <p className="lab-muted">Al Welfare si acquistano separatamente i gettoni. Questa scelta non consuma un turno di gioco.</p>
  </section>;
}
