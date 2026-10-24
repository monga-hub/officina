import ResourceIcon from './ResourceIcon.jsx';
import React from 'react';
import { contractNeeds, missingResources } from './contract-needs.js';

const SIZES={small:'Piccola',medium:'Media',large:'Grande'};
function ContractCard({card,size,index,player,coins,next=false}) {
  if(!card)return <article className="order-card order-empty"><h4>{SIZES[size]} {index}</h4><p>Nessuna commessa rimasta.</p></article>;
  const rows=contractNeeds(card.reqs[0],player.resources), missing=missingResources(rows);
  return <article className={`order-card ${!next&&!missing?'order-ready':''}`} aria-label={`Commessa ${SIZES[size].toLowerCase()} ${index}`}>
    <header><h4>{SIZES[size]} {index}</h4><div className="order-prize" aria-label={`Premio: ${card.pv[0]} punti vittoria e ${coins} marchi`}><b>{card.pv[0]} <abbr title="Punti vittoria">PV</abbr></b><span>+{coins} marchi</span></div></header>
    <ul className="order-resources" aria-label="Risorse da consegnare">{rows.map(r=><li key={r.resource} title={!next?`Disponibili: ${r.owned}; richiesti: ${r.required}`:undefined}><ResourceIcon resource={r.resource} decorative/><strong>{r.required}</strong><span>{r.resource.toLowerCase()}</span></li>)}</ul>
    {!next&&<p className={`order-status ${missing?'':'order-status-ready'}`}>{missing?<>Mancano: <strong>{missing}</strong>.</>:<>✓ Hai tutte le risorse richieste.</>}</p>}
  </article>;
}
export default function ContractsTable({state,player}) {
  return <div className="orders-table">
    <h2>Commesse</h2><p className="orders-instructions">Una commessa per visita in <b>Città</b>. La consegna conclude il turno.</p>
    <div className="orders-inventory"><b>Magazzino · {player.name}</b><span>{Object.entries(player.resources).map(([r,n])=>`${n} ${r.toLowerCase()}`).join(' · ')}</span></div>
    <div className="orders-grid">{Object.keys(SIZES).flatMap(size=>state.contracts[size].active.map((slot,i)=><ContractCard key={`${size}-${i}`} card={slot?.card} size={size} index={i+1} player={player} coins={state.rowEconomy.contractCoins[size]}/>))}</div>
    <details className="orders-upcoming"><summary>Prossime commesse · non ancora disponibili</summary><p>La prossima carta di ogni taglia entra quando si libera un posto nel relativo mercato.</p><div className="orders-grid">{Object.keys(SIZES).map(size=><ContractCard key={size} card={state.contracts[size].deck[0]} size={size} index="" player={player} coins={state.rowEconomy.contractCoins[size]} next/>)}</div></details>
  </div>;
}
