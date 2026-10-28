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
    <p>Politica attuale: <b>{WELFARE_POLICIES[player.welfarePosition]?.name||'nessuna'}</b>. Le caselle sono condivise.</p>
    <div className="round-rondel-options">{legal.map(command=>{
      const keep=command.type==='keepRoundRondel',policy=WELFARE_POLICIES[keep?player.welfarePosition:command.position];
      return <button key={keep?'keep':command.position} className="production-choice" onClick={()=>dispatch(command)}>
        <strong>{keep?(first?'Rinvia il primo ingresso':`Resta su ${WELFARE_POLICIES[player.welfarePosition].name}`):policy.name}</strong>
        <small className="round-policy-effect">{policy?.description||'Conserva la situazione attuale fino alla prossima scelta.'}</small>
        {!keep&&!first&&<small>{command.steps} {command.steps===1?'passo':'passi'} · {roundRondelCost(state.roundRondel,command.steps)===0?'gratis':`${roundRondelCost(state.roundRondel,command.steps)} ${roundRondelCost(state.roundRondel,command.steps)===1?'marco':'marchi'}`}</small>}
      </button>;
    })}</div>
    <p className="lab-muted">Al Welfare si acquistano separatamente i gettoni. Questa scelta non consuma un turno di gioco.</p>
  </section>;
}
