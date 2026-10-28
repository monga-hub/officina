import React from 'react';
import { WELFARE_POLICIES } from '../game/welfare-rondel.js';

export default function RoundRondelChoice({state,player,legal,dispatch}) {
  const first=player.welfarePosition==null;
  return <section className="round-rondel-choice" aria-label="Scelta della politica di fine round">
    <p className="lab-eyebrow">FINE ROUND · TURNO {state.roundRondel.active.endTurn}</p>
    <h2>{player.name}, scegli la tua politica</h2>
    <p>{first?'Primo ingresso libero: scegli qualsiasi casella attiva.':'Puoi restare o avanzare in senso orario di uno, due o tre passi.'} Il movimento è gratuito e non dà gettoni. Il bonus vale dal turno successivo fino al prossimo cambio.</p>
    <p>Politica attuale: <b>{WELFARE_POLICIES[player.welfarePosition]?.name||'nessuna'}</b>. Le caselle sono condivise.</p>
    <div className="round-rondel-options">{legal.map(command=>{
      const keep=command.type==='keepRoundRondel',policy=WELFARE_POLICIES[command.position];
      return <button key={keep?'keep':command.position} className="production-choice" onClick={()=>dispatch(command)}>
        <strong>{keep?(first?'Rinvia il primo ingresso':`Resta su ${WELFARE_POLICIES[player.welfarePosition].name}`):policy.name}</strong>
        <span>{keep?'Conserva la situazione attuale.':policy.description}</span>
        {!keep&&!first&&<small>{command.steps} {command.steps===1?'passo':'passi'} · gratis</small>}
      </button>;
    })}</div>
    <p className="lab-muted">Al Welfare si acquistano separatamente i gettoni. Questa scelta non consuma un turno di gioco.</p>
  </section>;
}
