import { Amount } from './GameSymbols.jsx';
import React, {useEffect,useRef,useState} from 'react';
import {TableOverlay} from './TableViewport.jsx';
import { contractNeeds, missingResources } from './contract-needs.js';

const SIZES={small:'Piccola',medium:'Media',large:'Grande'};
function ContractCard({card,size,index,player,coins,next=false}) {
  if(!card)return <article className="order-card order-empty"><h4>{SIZES[size]} {index}</h4><p>Nessuna commessa rimasta.</p></article>;
  const rows=contractNeeds(card.reqs[0],player.resources), missing=missingResources(rows);
  return <article className={`order-card ${!next&&!missing?'order-ready':''}`} aria-label={`Commessa ${SIZES[size].toLowerCase()} ${index}`}>
    <header><h4>{SIZES[size]} {index}</h4><div className="order-prize" aria-label={`Premio: ${card.pv[0]} punti vittoria e ${coins} marchi`}><Amount kind="pv" value={card.pv[0]}/><Amount kind="coin" value={coins}/></div></header>
    <ul className="order-resources" aria-label="Risorse da consegnare">{rows.map(r=><li key={r.resource} title={!next?`Disponibili: ${r.owned}; richiesti: ${r.required}`:undefined}><Amount kind={r.resource} value={r.required}/></li>)}</ul>
    {!next&&<p className={`order-status ${missing?'symbol-sr-only':'order-status-ready'}`}>{missing?<>Mancano: <strong>{missing}</strong>.</>:<span role="img" aria-label="Hai tutte le risorse richieste" title="Hai tutte le risorse richieste">✓</span>}</p>}
  </article>;
}
export default function ContractsTable({state,player}) {
  const [upcoming,setUpcoming]=useState(false),dialog=useRef(null);
  useEffect(()=>{if(upcoming)dialog.current.showModal();},[upcoming]);
  return <div className="orders-table">
    <h2 title="Una commessa per visita in Città. La consegna conclude il turno.">Commesse</h2>
    <div className="orders-inventory"><b>Magazzino · {player.name}</b><span>{Object.entries(player.resources).map(([r,n])=>`${n} ${r.toLowerCase()}`).join(' · ')}</span></div>
    <div className="orders-grid">{Object.keys(SIZES).flatMap(size=>state.contracts[size].active.map((slot,i)=><ContractCard key={`${size}-${i}`} card={slot?.card} size={size} index={i+1} player={player} coins={state.rowEconomy.contractCoins[size]}/>))}</div>
    <button className="orders-upcoming-button" onClick={()=>setUpcoming(true)}>Prossime commesse ↗</button>
    {upcoming&&<TableOverlay><dialog ref={dialog} className="table-action-dialog" aria-label="Prossime commesse" onCancel={()=>setUpcoming(false)} onClick={e=>{if(e.target===e.currentTarget)setUpcoming(false);}}><button className="dialog-close" onClick={()=>setUpcoming(false)}>Torna al tavolo ×</button><h2>Prossime commesse</h2><p>Non ancora disponibili: entrano quando si libera un posto della stessa taglia.</p><div className="orders-grid">{Object.keys(SIZES).map(size=><ContractCard key={size} card={state.contracts[size].deck[0]} size={size} index="" player={player} coins={state.rowEconomy.contractCoins[size]} next/>)}</div></dialog></TableOverlay>}

  </div>;
}
