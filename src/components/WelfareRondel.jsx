import PolicyHint from './PolicyHint.jsx';
import React, { useState } from 'react';
import { WELFARE_POLICIES, WELFARE_DISPLAY_POLICIES, welfareDisplayPolicies, welfarePolicies, welfareMaxSteps, freeWelfareEntry, rondelEnabled, welfarePolicy, welfarePolicyEnabled } from '../game/welfare-rondel.js';

export default function WelfareRondel({ state, player, legal = [], dispatch }) {
  const [selectedSteps, setSteps] = useState(1), [firstPosition, setFirstPosition] = useState(1);
  if (!rondelEnabled(state)) return null;
  const first = player.welfarePosition == null;
  const freeFirst = first && freeWelfareEntry(state);
  const commands = legal.filter(c => c.type === 'investWelfare');
  const steps = commands.some(c => c.steps === selectedSteps) ? selectedSteps : commands[0]?.steps ?? 1;
  const position = freeFirst ? (commands.some(c=>c.steps===steps&&c.position===firstPosition)?firstPosition:commands.find(c=>c.steps===steps)?.position??firstPosition) : ((player.welfarePosition ?? 0) + steps) % 6;
  const choice = commands.find(c => c.steps === steps && c.position === position);
  const active = welfarePolicy(state, player);
  return <section className="welfare-rondel" aria-label={`Rondella · ${player.name}`}>
    <header className="rondel-heading"><h3>Rondella</h3><span>Politica: <b>{active?.name||'nessuna'}</b></span></header>
    {dispatch && <>
      <p><b>1 marco = 1 passo = 1 gettone.</b> Da 1 a {welfareMaxSteps(state)} passi per visita. {freeFirst ? 'Al primo ingresso scegli liberamente la politica.' : first ? 'Parti prima di Cooperazione: 1 passo Cooperazione, 2 Innovazione, 3 Affidabilità. Formazione richiede almeno due visite.' : 'Avanza in senso orario fino alla destinazione evidenziata.'}</p>
      <div className="rondel-steps" role="group" aria-label="Passi della rondella">{Array.from({length:welfareMaxSteps(state)}, (_, i) => i + 1).map(n => <button key={n} aria-pressed={steps === n} disabled={!commands.some(c => c.steps === n)} onClick={() => setSteps(n)}>{n} {n === 1 ? 'passo' : 'passi'}</button>)}</div>
    </>}
    <ol className="rondel-policies">{welfareDisplayPolicies(state).map((policy, displayIndex) => {
      const i = welfarePolicies(state).indexOf(policy);
      const enabled = welfarePolicyEnabled(state,policy);
      const occupants = state.players.filter(p => p.welfarePosition === i);
      const selected = dispatch && position === i;
      return <li key={policy.id} className={`${selected&&enabled?'rondel-destination':''} ${enabled?'':'rondel-disabled'}`}>
        <PolicyHint policy={policy}>{dispatch && freeFirst ? <button disabled={!enabled} aria-pressed={selected&&enabled} onClick={() => setFirstPosition(i)}><b>{displayIndex + 1}. {policy.name}{!enabled&&' · OFF'}</b></button> : <strong>{displayIndex + 1}. {policy.name}{!enabled&&' · OFF'}</strong>}</PolicyHint>
        <div className="rondel-occupants">{occupants.map(p => <span key={p.id} title={p.name} aria-label={p.name} style={{ borderColor: p.color }}><i style={{ background: p.color }} aria-hidden="true"/></span>)}</div>
      </li>;
    })}</ol>
    {dispatch&&<small>Spazi attraversabili e condivisi. Le caselle OFF contano come passi ma non sono destinazioni disponibili. Ogni meeple conserva il proprio bonus fino al prossimo spostamento.</small>}
    {dispatch && <>
      <p>Gettoni: <b>{player.welfareTokens || 0} → {(player.welfareTokens || 0) + steps}</b>; i nuovi si usano dal turno successivo.</p>
      <button className="primary" disabled={!choice} onClick={() => dispatch(choice)}>{choice ? `Paga ${steps} ${steps === 1 ? 'marco' : 'marchi'} · ${WELFARE_POLICIES[position].name} · +${steps} ${steps === 1 ? 'gettone' : 'gettoni'}` : 'Nessuna destinazione raggiungibile e pagabile: controlla marchi e caselle ON'}</button>
    </>}
  </section>;
}
