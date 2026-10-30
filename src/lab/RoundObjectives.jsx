import React,{useRef,useEffect} from 'react';
import {CARDS,cardById,cardPoints,objectiveMetrics,cardRequirement as requirement,cardHelp} from '../game/round-objectives.js';
import {WORKER_BY_ID} from '../game/engine.js';
const tiers=(c,r)=>c.thresholds[r].map((n,i)=>`${2*(i+1)} PV: ≥${n}`).join(' · ');
function RequestButton({card,round,points,onInspect}) {
 const press=useRef(null),clear=()=>{clearTimeout(press.current);};
 useEffect(()=>clear,[]);
 return <button className="round-request" title={`${requirement(card,round)}. ${tiers(card,round)}. ${cardHelp(card,round)}`} onClick={onInspect} onPointerDown={()=>{clear();press.current=setTimeout(onInspect,500);}} onPointerUp={clear} onPointerLeave={clear} onPointerCancel={clear} onContextMenu={e=>{e.preventDefault();clear();onInspect();}}>
   <b>{card.name}</b><span className="round-request-metric">{requirement(card,round)}</span><span>{tiers(card,round)}</span><small>Ora {points.pv} PV potenziali · valore {points.value}</small>
 </button>;
}
export default function RoundObjectives({state,player,onInspect}) {
 const rr=state.roundObjectives;if(!rr)return null;
 const metrics=objectiveMetrics(state,player,WORKER_BY_ID);
 return <section className="round-requests" aria-label="Richieste del round">
  <div className="round-requests-heading"><b>Round {rr.round+1}</b><small>Scadenza T{rr.bounds[rr.round]}</small><button onClick={onInspect}>Incassati: {rr.banked[player.id]} PV ↗</button></div>
  {rr.active.map(id=>{const card=cardById(id);return <RequestButton key={id} card={card} round={rr.round} points={cardPoints(id,metrics,rr.round)} onInspect={onInspect}/>;})}
 </section>;
}
export function RoundObjectivesDetails({state,player}) {
 const rr=state.roundObjectives,r=Math.min(rr.round,rr.bounds.length-1),metrics=objectiveMetrics(state,player,WORKER_BY_ID);
 return <section><h2>Richieste del round · {player.name}</h2><p>Tre carte comuni. Si assegna solo il premio più alto: 0, 2, 4 o 6 PV per carta. I punti vengono incassati dopo l’ultimo turno di tutti e le eventuali cure, prima della rondella. Una volta acquisiti restano fissi.</p>
  {rr.active.map(id=>{const c=cardById(id),points=cardPoints(id,metrics,r);return <article className="lab-card" key={id}><h3>{c.name}</h3><p>{requirement(c,r)} · <b>{tiers(c,r)}</b></p><p>Ora: valore {points.value}, <b>{points.pv} PV potenziali</b>. Da confermare alla scadenza T{rr.bounds[r]}.</p><p>{cardHelp(c,r)}</p></article>;})}
  <h3>Premi acquisiti</h3>{!rr.log.length?<p>Nessuna scadenza ancora risolta.</p>:rr.log.map(row=><article key={row.round}><h4>Round {row.round} · turno {row.endTurn}</h4><table><thead><tr><th>Carta</th>{state.players.map(p=><th key={p.id}>{p.name}</th>)}</tr></thead><tbody>{row.active.map((id,i)=><tr key={id}><td>{cardById(id).name}</td>{row.awards.map(a=><td key={a.seat}>{a.cards[i].pv} PV</td>)}</tr>)}</tbody></table></article>)}
  <p>Totale acquisito: {state.players.map(p=>`${p.name}: ${rr.banked[p.id]} PV`).join(' · ')}.</p>
 </section>;
}
export function RequestDeck() {
 return <details><summary>Consulta le dodici carte e le soglie</summary><p>Le tre soglie danno 2 / 4 / 6 PV. Si controlla soltanto la riga del periodo in corso.</p>{CARDS.map(c=><article className="lab-card" key={c.id}><h3>{c.name}</h3><table><thead><tr><th>Round</th><th>Criterio</th><th>2 / 4 / 6 PV</th></tr></thead><tbody>{c.thresholds.map((t,r)=><tr key={r}><td>{r+1}</td><td>{requirement(c,r)}</td><td>{t.join(' / ')}</td></tr>)}</tbody></table><p>{cardHelp(c,0)}</p></article>)}</details>;
}
