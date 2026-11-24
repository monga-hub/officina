import {WELFARE_FUNDS,fundBalances} from '../game/welfare-funds.js';
import React, { useEffect, useRef, useState } from 'react';
import { currentPlayer, legalCommands, bankMarket, WORKER_BY_ID, welfareRecoveryCommands } from '../game/engine.js';
import { rowNodeLabel } from '../game/row-economy.js';
import { SECTORS, STAR_EDGES } from '../game/data.js';
import {approvedArt,approvedManifest} from './approved-art.js';
import { STAR_MARKETS } from './markets.js';
import {welfarePolicies,rondelEnabled,welfarePolicyEnabled} from '../game/welfare-rondel.js';
import {policyDescription} from '../game/welfare-funds.js';
import { Amount } from './GameSymbols.jsx';
import { TableOverlay } from './TableViewport.jsx';
import WorkerCard, { HireChoices } from './WorkerCard.jsx';

// Orientamento della plancia fisica: metallurgia in alto, tessile a sinistra.
const BOARD_WIDTH=6253,BOARD_HEIGHT=4321;
const physicalPoint=({x,y})=>({x:x*5053/BOARD_WIDTH,y:y*3721/BOARD_HEIGHT});
export const STAR_PLACES=Object.fromEntries(Object.entries(approvedManifest.boardPlaces).map(([id,p])=>[id,physicalPoint(p)]));
const at=({x,y})=>({left:`${x}%`,top:`${y}%`});
const cardSlots={A:{x:2890,y:690,angle:-36},B:{x:4900,y:690,angle:36},C:{x:5400,y:2390,angle:-72},D:{x:3770,y:3530,angle:0},E:{x:2380,y:2410,angle:72}};
function BoardCalendar({state,onInfo}) {
  const current=state.roundRondel?.active?.endTurn??state.turn,standard=state.roundLimit===28;
  return <div className="board-calendar" aria-label={`Calendario · turno ${current} di ${state.roundLimit}`}>
    {Array.from({length:28},(_,i)=>{
      const start=state.roundLimit<=28?i+1:Math.floor(i*state.roundLimit/28)+1;
      const end=state.roundLimit<=28?start:Math.floor((i+1)*state.roundLimit/28);
      const active=current>=start&&current<=end,valid=start<=state.roundLimit;
      const x=85+(220+(i%7)*190)*(1715/1553),y=125+(170+Math.floor(i/7)*228)*(1715/1553);
      return <button key={i} type="button" className={`board-day ${active?'board-day-current':''} ${!standard?'board-day-custom':''}`} aria-current={active?'step':undefined} aria-label={valid?`Turno ${start}${end>start?`–${end}`:''}${active?' · attuale':''}. Apri calendario`:'Apri calendario'} style={{left:`${x/BOARD_WIDTH*100}%`,top:`${y/BOARD_HEIGHT*100}%`,'--amber-art':`url(${approvedArt('amber.jpg')})`}} onClick={()=>onInfo('calendar')}>{!standard?(valid?start===end?start:`${start}–${end}`:'—'):null}</button>;
    })}
  </div>;
}
function BoardRondel({state,onInfo}) {
  return <div aria-label="Rondella sulla plancia">{Object.entries(approvedManifest.boardPolicies).map(([id,pos])=>{
    const policy=welfarePolicies(state).find(p=>p.id===id),enabled=policy&&rondelEnabled(state)&&welfarePolicyEnabled(state,policy);
    const occupants=state.players.filter(p=>welfarePolicies(state)[p.welfarePosition]?.id===id);
    const description=policy&&policyDescription(state,policy);
    return <button type="button" key={id} data-policy={id} className={`board-policy ${enabled?'':'board-policy-disabled'}`} style={at(physicalPoint(pos))} onClick={()=>onInfo('rondel')} aria-label={`${id==='mutualAid'?'Interscambio / Mutuo soccorso':policy?.name||'Affinità'}${enabled?'':' · non attiva'}${description?.upgraded?' · potenziata':''}. Apri rondella`}><span className="board-policy-pawns">{occupants.map(player=><Meeple key={player.id} player={player}/>)}</span></button>;
  })}</div>;
}
function BoardFunds({state,onInfo}) {
  const balances=fundBalances(state);
  if(!state.rowEconomy?.welfareBank)return null;
  return <div aria-label="Fondi Welfare sulla plancia">{['personnel','economy','production'].map((id,i)=>{
    const f=WELFARE_FUNDS.find(f=>f.id===id),value=balances?balances[id]:state.welfareBank||0;
    if(!balances&&i!==1)return null;
    return <button key={id} type="button" data-welfare-fund={id} className="board-fund" style={{left:`${(377+i*573)/BOARD_WIDTH*100}%`,top:`${2910/BOARD_HEIGHT*100}%`}} onClick={()=>onInfo('welfare')} aria-label={balances?`${f.name}: ${value} marchi, soglia ${f.threshold}. ${value>=f.threshold?'Potenziato':'Base'}`:`Cassa comune: ${value} marchi`}><strong>{value}</strong><span>{balances?<>{value>=f.threshold?'★':'○'}<small>{value} / {f.threshold}</small></>:'Cassa comune'}</span></button>;
  })}</div>;
}
export function WelfareBank({state}) {
  if(!state.rowEconomy?.welfareBank)return null;
  const balances=fundBalances(state);
  return <section className="approved-welfare-bank" aria-label={`Banca Welfare: ${state.welfareBank||0} marchi`}>
    <h3>Fondi Welfare</h3>
    <div role="status" aria-live="polite">{balances?['personnel','economy','production'].map(id=>{
      const f=WELFARE_FUNDS.find(f=>f.id===id),powered=balances[id]>=f.threshold;
      return <span key={id} data-welfare-fund={id} className={powered?'fund-powered':''} title={`${f.name}: ${balances[id]} marchi, soglia ${f.threshold}. ${powered?'Abilità potenziate':'Abilità base'}`}><b>{f.name}</b><strong>{balances[id]} / {f.threshold}</strong><small>{powered?'Potenziato':'Base'}</small></span>;
    }):<span><b>Cassa comune</b><Amount kind="coin" value={state.welfareBank||0}/></span>}</div>
  </section>;
}
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
export default function StarBoard({state,dispatch,onActions,onNodeAction,onInfo=()=>{}}) {
  const p=currentPlayer(state), [selected,setSelected]=useState(null);
  const canChoose=state.phase==='action'&&!p.isAI&&!state.pending;
  const canMove=state.phase==='move'&&!p.isAI&&!state.pending;
  const inCity=state.phase==='borsa'&&!p.isAI&&!state.pending;
  const commands=(canMove||canChoose||inCity)?legalCommands(state):[];
  const legal=commands.filter(c=>c.type==='move');
  const isDepartment=SECTORS.includes(p.node);
  const nodeAction=isDepartment?{type:'activate',label:'Produci',unavailable:'Produzione non disponibile: serve un operaio attivo nel reparto.'}:state.rowEconomy?.enabled&&p.node==='Sindacato'?state.mirrorProduction?{type:'activate',label:'Mirror · 1 marco',unavailable:'Servono 1 marco e un reparto con operai attivi.'}:{type:'repress',label:'Repressione',unavailable:'Serve tensione da ridurre e marchi sufficienti.'}:state.rowEconomy?.enabled&&p.node==='Servizi'?{type:'investWelfare',label:'Welfare',unavailable:'Marchi insufficienti per investire nel welfare.'}:null;
  const canAct=nodeAction&&commands.some(c=>c.type===nodeAction.type);
  const canRecover=canChoose&&welfareRecoveryCommands(state,p).length>0;
  return <section id="stella" className="star-board" aria-label="Plancia principale completa">
    <div className="star-viewport"><div className="star-stage">
      <img className="approved-main-board" src={approvedArt('main-board.jpg')} width={BOARD_WIDTH} height={BOARD_HEIGHT} alt="Plancia completa: calendario, rondella, Welfare e stella industriale con cinque spazi carte"/>
      <BoardCalendar state={state} onInfo={onInfo}/>
      <BoardRondel state={state} onInfo={onInfo}/>
      <BoardFunds state={state} onInfo={onInfo}/>
      <svg className="star-route-overlay" viewBox={`0 0 ${BOARD_WIDTH} ${BOARD_HEIGHT}`} aria-hidden="true">
        {STAR_EDGES.map(([a,b])=><line key={`${a}-${b}`} data-route={`${a}-${b}`} x1={STAR_PLACES[a].x*BOARD_WIDTH/100} y1={STAR_PLACES[a].y*BOARD_HEIGHT/100} x2={STAR_PLACES[b].x*BOARD_WIDTH/100} y2={STAR_PLACES[b].y*BOARD_HEIGHT/100} className={state.starMovement&&state.nPlayers===2&&canMove&&((p.node===a&&legal.some(c=>c.node===b))||(p.node===b&&legal.some(c=>c.node===a)))?'route-available':''}/>)}
      </svg>
      {Object.entries(approvedManifest.boardCoins).map(([node,pos])=>{
        const command=legal.find(c=>c.node===node);
        return <span key={node} className="star-live-cost" style={at(physicalPoint(pos))} aria-label={command?`${rowNodeLabel(state,node)}: ingresso ${command.cost} marchi`:`${rowNodeLabel(state,node)}: ingresso non disponibile`}>{command?command.cost:'–'}</span>;
      })}
      {Object.entries(STAR_PLACES).map(([node,pos])=>{
        const command=legal.find(c=>c.node===node), here=state.players.filter(q=>q.node===node);
        const selected=node===p.node&&(canChoose||inCity);
        const action=selected?(inCity?'Commesse':canRecover?(canAct?'Produci / Cura':'Cura'):nodeAction?.label||'Azioni'):null;
        const enabled=!!command||!!(selected&&(inCity||!nodeAction||canAct||canRecover));
        return <button key={node} data-node={node} className={`star-destination ${command?'star-available':''} ${p.node===node?'star-current':''} ${action?'star-action-node':''}`} style={at(pos)} disabled={!enabled} onClick={()=>command?dispatch(command):inCity||!nodeAction?onActions():onNodeAction(nodeAction.type)} title={selected&&nodeAction&&!enabled?nodeAction.unavailable:undefined} aria-label={action?`${action} · ${rowNodeLabel(state,node)}`:`Vai a ${rowNodeLabel(state,node)}${command?` · ${command.cost?`${command.cost} M`:'gratis'}`:''}`}>
          <span className="star-node-name">{rowNodeLabel(state,node)}</span>
          <span className="star-seats">{action?<>{here.map(q=><Meeple key={q.id} player={q}/>)}<span className="star-node-action">{action}</span></>:Array.from({length:node==='Borsa'?Math.max(2,here.length):2},(_,i)=><span className="star-seat" key={i}>{here[i]?<Meeple player={here[i]}/>:<i>○</i>}</span>)}</span>
          <small className="node-entry">{p.node===node?<span role="img" aria-label="Sei qui" title="Sei qui">●</span>:command?<Amount kind="coin" value={command.cost} label={`Ingresso: ${command.cost} marchi`}/>:here.length>=2&&node!=='Borsa'?<span role="img" aria-label="Posti occupati" title="Posti occupati">×</span>:null}</small>
        </button>;
      })}
      {STAR_MARKETS.map(({bank,nodes})=>{
        const slot=cardSlots[bank];
        return <div key={bank} data-bank={bank} className={`star-market ${canChoose&&state.nodeBanks[p.node]?.includes(bank)?'star-market-active':''}`} style={{left:`${slot.x/BOARD_WIDTH*100}%`,top:`${slot.y/BOARD_HEIGHT*100}%`,transform:`translate(-50%,-50%) rotate(${slot.angle}deg)`}}>
          {bankMarket(state,bank).map(id=><WorkerCard key={id} worker={WORKER_BY_ID[id]} onInspect={()=>setSelected({id,bank})}/>)}
          {!bankMarket(state,bank).length&&<span className="empty-card">Mazzo esaurito</span>}
          <span className="star-market-count" title={`${nodes.map(n=>rowNodeLabel(state,n)).join(' / ')} · ${state.banks[bank].length} carte`}>{bank} · {state.banks[bank].length}</span>
        </div>;
      })}
    </div></div>
    {selected&&<CardPreview worker={WORKER_BY_ID[selected.id]} bank={selected.bank} state={state} dispatch={dispatch} onClose={()=>setSelected(null)}/>}
  </section>;
}
