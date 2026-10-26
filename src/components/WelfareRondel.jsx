import React, { useState } from 'react';
import { WELFARE_POLICIES, rondelEnabled, welfarePolicy } from '../game/welfare-rondel.js';

export default function WelfareRondel({ state, player, legal = [], dispatch }) {
  const [selectedSteps, setSteps] = useState(1), [firstPosition, setFirstPosition] = useState(0);
  if (!rondelEnabled(state)) return null;
  const first = player.welfarePosition == null;
  const commands = legal.filter(c => c.type === 'investWelfare');
  const steps = commands.some(c => c.steps === selectedSteps) ? selectedSteps : commands[0]?.steps ?? 1;
  const position = first ? firstPosition : (player.welfarePosition + steps) % 6;
  const choice = commands.find(c => c.steps === steps && c.position === position);
  const active = welfarePolicy(state, player);
  return <section className="welfare-rondel" aria-label={`Rondella Welfare · ${player.name}`}>
    <h3>Rondella Welfare · {player.name}</h3>
    <p>{active ? <>Politica attiva: <b>{active.name}</b>. {active.description}</> : 'Nessuna politica attiva: scegli al primo ingresso nel Welfare.'}</p>
    {dispatch && <>
      <p><b>1 marco = 1 passo = 1 gettone.</b> Da 1 a 6 passi; 6 fanno un giro completo. {first ? 'Al primo ingresso scegli liberamente la politica.' : 'Avanza in senso orario fino alla destinazione evidenziata.'}</p>
      <div className="rondel-steps" role="group" aria-label="Passi della rondella">{[1,2,3,4,5,6].map(n => <button key={n} aria-pressed={steps === n} disabled={!commands.some(c => c.steps === n)} onClick={() => setSteps(n)}>{n} {n === 1 ? 'passo' : 'passi'}</button>)}</div>
    </>}
    <ol className="rondel-policies">{WELFARE_POLICIES.map((policy, i) => {
      const occupants = state.players.filter(p => p.welfarePosition === i);
      const selected = dispatch && position === i;
      return <li key={policy.id} className={selected ? 'rondel-destination' : ''}>
        {dispatch && first ? <button aria-pressed={selected} onClick={() => setFirstPosition(i)}><b>{i + 1}. {policy.name}</b> →</button> : <strong>{i + 1}. {policy.name} →</strong>}
        <p>{policy.description}</p>
        <div className="rondel-occupants">{occupants.map(p => <span key={p.id} style={{ borderColor: p.color }}><i style={{ background: p.color }} aria-hidden="true"/> {p.name}</span>)}</div>
      </li>;
    })}</ol>
    <small>Spazi attraversabili e condivisi. Ogni meeple conserva il proprio bonus fino al prossimo spostamento.</small>
    {dispatch && <>
      <p>Gettoni: <b>{player.welfareTokens || 0} → {(player.welfareTokens || 0) + steps}</b>; i nuovi si usano dal turno successivo.</p>
      <button className="primary" disabled={!choice} onClick={() => dispatch(choice)}>{choice ? `Paga ${steps} ${steps === 1 ? 'marco' : 'marchi'} · ${WELFARE_POLICIES[position].name} · +${steps} ${steps === 1 ? 'gettone' : 'gettoni'}` : 'Serve almeno 1 marco per l’azione Welfare'}</button>
    </>}
  </section>;
}
