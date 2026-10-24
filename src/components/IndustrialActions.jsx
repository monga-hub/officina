import React, { useState } from 'react';
import { WORKER_BY_ID } from '../game/engine.js';
import { wellbeing, welfareDescription, policiesOf } from '../game/industrial.js';

function PolicyBuy({ state, player, role, card, legal, dispatch }) {
  const [payment, setPayment] = useState('');
  const d = player.depts[role];
  const options = legal.filter(c => c.type === 'buyPolicy' && c.role === role && c.policyId === card.id);
  const choice = options.find(c => JSON.stringify(c.payment) === payment) || options[0];
  const owned = d.welfare.includes(card.id);
  return <div className="welfare-item">
    <b>{card.name} · {d.sector}</b> — {card.coins} marchi + {card.resources} risorse
    <p>{welfareDescription(card)}. {card.pv} PV ({({ none: 'nessun punto', purchase: 'all’acquisto', final: 'a fine partita', quarter: 'ogni quadrimestre' })[state.industrial.welfareScoring]}).</p>
    <small>Benessere {wellbeing(state, d)}; {state.industrial.welfareAccess === 'requirement' ? `richiesto ${card.wellbeing}` : state.industrial.welfareAccess === 'spend' ? `spendi ${card.spend}` : 'nessun requisito'}.</small>
    {card.effect === 'efficiency' && state.industrial.welfareNeedsWellbeing && <p>Bonus solo se la produzione termina con benessere almeno {card.wellbeing} (tensione al massimo {state.industrial.tensionLimit - card.wellbeing}).</p>}
    {options.length > 1 && <label> Risorse da pagare <select aria-label={`Pagamento ${card.name} ${d.sector}`} value={JSON.stringify(choice.payment)} onChange={e => setPayment(e.target.value)}>{options.map(c => <option key={JSON.stringify(c.payment)} value={JSON.stringify(c.payment)}>{Object.entries(c.payment).filter(([, n]) => n).map(([r, n]) => `${n} ${r}`).join(' + ')}</option>)}</select></label>}
    <button disabled={!choice} onClick={() => dispatch(choice)}>{owned ? 'Già installata' : choice ? 'Acquista Welfare' : 'Non disponibile: verifica benessere, risorse, posti o acquisto già usato'}</button>
  </div>;
}

export default function IndustrialActions({ state, player, legal, dispatch }) {
  if (player.node !== 'Sindacato' || state.rowEconomy?.enabled) return null;
  const I = state.industrial;
  return <div className="tratt">
    <h4>Sindacato · ogni sotto-azione una volta per visita</h4>
    <div className="btn-row col">{legal.filter(c => c.type === 'trattativa').map((c, i) => <button key={i} onClick={() => dispatch(c)}>
      {c.resetRole && (I.unionReduction ? `Riduci tensione di ${I.unionReduction + policiesOf(state, player.depts[c.resetRole]).filter(p => p.effect === 'recovery').reduce((n, p) => n + p.amount, 0)}` : 'Azzera tensione')} {c.resetRole ? `· ${player.depts[c.resetRole].sector}` : 'Pressione avversaria'}
      {c.targetPlayer != null && ` · +1 a ${state.players[c.targetPlayer].name}, ${state.players[c.targetPlayer].depts[c.targetRole].sector}`}
      {state.trattativa.resetOwn.cost > 0 && ` · ${state.trattativa.resetOwn.cost} marchi`}
    </button>)}</div>
    <div className="btn-row col">{legal.filter(c => ['unblockSciopero', 'restartDepartment'].includes(c.type)).map((c, i) => <button key={i} onClick={() => dispatch(c)}>
      {c.type === 'restartDepartment' ? `Riapri ${player.depts[c.role].sector} · ${I.restartCost} marchi (tensione al massimo ${I.restartTension}${I.restartClearsWorkers ? ', recupera tutti gli operai' : ''})` : `Libera operaio ${WORKER_BY_ID[c.cardId].nation} V${WORKER_BY_ID[c.cardId].v} · ${player.depts[c.role].sector} · ${state.trattativa.unblock.cost} marchi`}
    </button>)}</div>
    {I.welfareEnabled && <>
      <h4>Welfare · scegli il reparto</h4>
      {Object.keys(player.depts).map(role => <details key={role}><summary>{player.depts[role].sector} · benessere {wellbeing(state, player.depts[role])}</summary>
        {I.welfareCards.map(card => <PolicyBuy key={card.id} state={state} player={player} role={role} card={card} legal={legal} dispatch={dispatch} />)}
      </details>)}
    </>}
  </div>;
}
