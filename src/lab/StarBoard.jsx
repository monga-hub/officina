import {WELFARE_FUNDS,fundBalances} from '../game/welfare-funds.js';
import React, { useEffect, useRef, useState } from 'react';
import { currentPlayer, legalCommands, bankMarket, WORKER_BY_ID, welfareRecoveryCommands } from '../game/engine.js';
import { rowNodeLabel } from '../game/row-economy.js';
import { SECTORS } from '../game/data.js';
import { STAR_MARKETS } from './markets.js';
import ResourceIcon from './ResourceIcon.jsx';
import { Amount } from './GameSymbols.jsx';
import { TableOverlay } from './TableViewport.jsx';
import WorkerCard, { HireChoices } from './WorkerCard.jsx';

// Orientamento della plancia fisica: metallurgia in alto, tessile a sinistra.
export const STAR_PLACES={
  Metallurgica:{x:50,y:12},
  Chimica:{x:90,y:44},
  Servizi:{x:71,y:86,icon:'🌿'},
  Sindacato:{x:29,y:86,icon:'✊'},
  Tessile:{x:10,y:44},
  Borsa:{x:50,y:49,icon:'🏙'},
};
function Meeple({player}) {return <svg viewBox="0 0 30 34" className="star-meeple" role="img" aria-label={player.name}><path d="M10 10 Q6 1 15 1 Q24 1 20 10 L29 17 25 23 20 20 23 33 15 33 15 26 14 33 6 33 9 20 4 23 1 17Z" fill={player.color} stroke="#fff" strokeWidth="1.5"/></svg>;}
export function CardPreview({worker,node,bank,state,dispatch,onClose}) {
  const ref=useRef(null), p=currentPlayer(state);
  useEffect(()=>{ref.current.showModal();},[]);
  const legal=!p.isAI&&!state.pending?legalCommands(state):[];
  const options=legal.filter(c=>c.type==='hire'&&c.cardId===worker.id);
  const nodes=bank?Object.keys(state.nodeBanks).filter(n=>state.nodeBanks[n].includes(bank)):node?[node]:[];
  const moves=legal.filter(c=>c.type==='move'&&nodes.includes(c.node));
  return <TableOverlay><dialog ref={ref} className="card-preview" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget)onClose();}} aria-label="Dettaglio carta">
    <button className="card-preview-close" autoFocus onClick={onClose} aria-label="Chiudi carta">×</button>
    <WorkerCard worker={worker}/>
    {options.length>0?<HireChoices worker={worker} options={options} state={state} player={p} dispatch={cmd=>{dispatch(cmd);onClose();}}/>:
      moves.length?<div className="card-install-options">{moves.map(move=><button key={move.node} className="lab-primary" onClick={()=>{dispatch(move);onClose();}}>Vai a {rowNodeLabel(state,move.node)} · <Amount kind="coin" value={move.cost}/></button>)}</div>:
      <p className="lab-muted">{state.phase==='borsa'?'In Città puoi consultare le carte, ma non acquistarle.':nodes.length?`Carta acquistabile da ${nodes.map(n=>rowNodeLabel(state,n)).join(' o ')}. Servono marchi sufficienti.`:'Carta già installata nella fabbrica.'}</p>}
  </dialog></TableOverlay>;
}
export default function StarBoard({state,dispatch,onActions,onNodeAction}) {
  const p=currentPlayer(state), [selected,setSelected]=useState(null);
  const canChoose=state.phase==='action'&&!p.isAI&&!state.pending;
  const canMove=state.phase==='move'&&!p.isAI&&!state.pending;
  const inCity=state.phase==='borsa'&&!p.isAI&&!state.pending;
  const commands=(canMove||canChoose||inCity)?legalCommands(state):[];
  const legal=commands.filter(c=>c.type==='move');
  const isDepartment=SECTORS.includes(p.node);
  const nodeAction=isDepartment?{type:'activate',label:'Produci',unavailable:'Produzione non disponibile: serve un operaio attivo nel reparto.'}:state.rowEconomy?.enabled&&p.node==='Sindacato'?{type:'repress',label:'Repressione',unavailable:'Serve tensione da ridurre e marchi sufficienti.'}:state.rowEconomy?.enabled&&p.node==='Servizi'?{type:'investWelfare',label:'Welfare',unavailable:'Marchi insufficienti per investire nel welfare.'}:null;
  const canAct=nodeAction&&commands.some(c=>c.type===nodeAction.type);
  const canRecover=canChoose&&welfareRecoveryCommands(state,p).length>0;
  const edges=[['Metallurgica','Servizi'],['Servizi','Tessile'],['Tessile','Chimica'],['Chimica','Sindacato'],['Sindacato','Metallurgica']];
  return <section id="stella" className="star-board" aria-label="Plancia a stella">
    <div className="star-caption"><div><p className="lab-eyebrow">LA CITTÀ INDUSTRIALE</p><h2>{canMove?'Scegli un nodo':canChoose?(isDepartment?(canRecover?'Assumi, produci o cura':'Assumi o produci'):'Scegli una delle due carte'):inCity?'Consegna in Città':'La plancia comune'}</h2></div><span>{canMove?'Tocca un nodo illuminato':canChoose?'Tocca una carta evidenziata':'Puoi sempre ingrandire le carte'}</span></div>

    <div className="star-viewport"><div className="star-stage">
      <svg className="star-drawing" viewBox="0 0 1000 800" preserveAspectRatio="none" aria-hidden="true">
        <defs><radialGradient id="star-brass"><stop stopColor="#efd8a6"/><stop offset="1" stopColor="#916c41"/></radialGradient></defs>
        <circle cx="500" cy="400" r="290" fill="none" stroke="#c5af84" strokeWidth="1" strokeDasharray="3 8"/>
        <path d="M500 96 710 688 100 352 900 352 290 688Z" fill="#b48d5915" stroke="#594f41" strokeWidth="16" strokeLinejoin="round"/>
        {edges.map(([a,b])=><line key={a} x1={STAR_PLACES[a].x*10} y1={STAR_PLACES[a].y*8} x2={STAR_PLACES[b].x*10} y2={STAR_PLACES[b].y*8} stroke="url(#star-brass)" strokeWidth="7" strokeDasharray="3 3"/>)}
        <circle cx="500" cy="392" r="65" fill="#d8bd87" stroke="#6a5842" strokeWidth="5"/>
        <text x="500" y="238" textAnchor="middle" fill="#7a6346" fontFamily="Georgia" fontSize="14" letterSpacing="4">OFFICINA 1907</text>
      </svg>
      {Object.entries(STAR_PLACES).map(([node,pos])=>{
        const command=legal.find(c=>c.node===node), here=state.players.filter(q=>q.node===node);
        const selected=node===p.node&&(canChoose||inCity);
        const action=selected?(inCity?'Commesse':nodeAction?.label||'Azioni'):null;
        const enabled=!!command||!!(selected&&(inCity||!nodeAction||canAct));
        return <button key={node} data-node={node} className={`star-destination ${command?'star-available':''} ${p.node===node?'star-current':''} ${action?'star-action-node':''}`} style={{left:`${pos.x}%`,top:`${pos.y}%`}} disabled={!enabled} onClick={()=>command?dispatch(command):inCity||!nodeAction?onActions():onNodeAction(nodeAction.type)} title={selected&&nodeAction&&!canAct?nodeAction.unavailable:undefined} aria-label={action?`${action} · ${rowNodeLabel(state,node)}`:`Vai a ${rowNodeLabel(state,node)}${command?` · ${command.cost?`${command.cost} M`:'gratis'}`:''}`}>
          <span className="star-node-name">{SECTORS.includes(node)?<ResourceIcon resource={node} decorative/>:<span>{pos.icon}</span>} {rowNodeLabel(state,node)}</span>
          <span className="star-seats">{action?<>{here.map(q=><Meeple key={q.id} player={q}/>)}<span className="star-node-action">{action}</span></>:Array.from({length:node==='Borsa'?Math.max(2,here.length):2},(_,i)=><span className="star-seat" key={i}>{here[i]?<Meeple player={here[i]}/>:<i>○</i>}</span>)}</span>
          <small className="node-entry">{p.node===node?<span role="img" aria-label="Sei qui" title="Sei qui">●</span>:command?<Amount kind="coin" value={command.cost} label={`Ingresso: ${command.cost} marchi`}/>:here.length>=2&&node!=='Borsa'?<span role="img" aria-label="Posti occupati" title="Posti occupati">×</span>:null}</small>
        </button>;
      })}
      {state.rowEconomy?.welfareBank&&<div className="star-welfare-bank" role="status" aria-live="polite" aria-label={`Banca Welfare: ${state.welfareBank||0} marchi`} title="Fondi comuni disponibili per il saccheggio con la repressione" style={{left:`${STAR_PLACES.Servizi.x}%`,top:'96%'}}>{fundBalances(state)?WELFARE_FUNDS.map(f=><span key={f.id} data-welfare-fund={f.id} className={fundBalances(state)[f.id]>=f.threshold?'fund-powered':''} title={`${f.name}: ${fundBalances(state)[f.id]} marchi, soglia ${f.threshold}. ${fundBalances(state)[f.id]>=f.threshold?'Abilità potenziate':'Abilità base'}`}><b>{f.name}</b> {fundBalances(state)[f.id]}/{f.threshold}</span>):<><span>Cassa</span><Amount kind="coin" value={state.welfareBank||0}/></>}</div>}
      {STAR_MARKETS.map(({bank,nodes,x,y})=><div key={bank} className={`star-market ${canChoose&&state.nodeBanks[p.node]?.includes(bank)?'star-market-active':''}`} style={{left:`${x}%`,top:`${y}%`}}>
        <div className="star-market-label" title={nodes.map(n=>rowNodeLabel(state,n)).join(' / ')}><span aria-label={`${state.banks[bank].length} carte nel mazzo`}>▤ {state.banks[bank].length}</span></div>
        {bankMarket(state,bank).map(id=><WorkerCard key={id} worker={WORKER_BY_ID[id]} onInspect={()=>setSelected({id,bank})}/>)}
        {!bankMarket(state,bank).length&&<span className="empty-card">Mazzo esaurito</span>}
      </div>)}
    </div></div>
    <div className="star-legend">{state.players.map(q=><span key={q.id}><Meeple player={q}/>{q.name}{q.id===p.id?' · di turno':''}</span>)}<small>Clicca una carta per leggerla e scegliere Sopra o Sotto. Il costo di ingresso è indicato sul nodo.</small></div>
    {selected&&<CardPreview worker={WORKER_BY_ID[selected.id]} bank={selected.bank} state={state} dispatch={dispatch} onClose={()=>setSelected(null)}/>}
  </section>;
}
