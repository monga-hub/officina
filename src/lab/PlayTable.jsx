import WelfareRondel from '../components/WelfareRondel.jsx';
import { rondelEnabled, welfareMaxSteps, freeWelfareEntry } from '../game/welfare-rondel.js';
import React, { useEffect, useRef, useState } from 'react';
import { currentPlayer, legalCommands, WORKER_BY_ID, scorePlayer } from '../game/engine.js';
import { deciderId } from '../game/ai.js';
import { rowPressureState } from '../game/row-pressure.js';
import { rowNodeLabel, tokenWelfare } from '../game/row-economy.js';
import { RESOURCE_OF, NATIONS_NUOVO } from '../game/data.js';
import { ROLES } from './config.js';
import RowProductionTrack from '../components/RowProductionTrack.jsx';
import ActionPanel, { ProductionActions, RowEconomyActions } from '../components/ActionPanel.jsx';
import PendingModal from '../components/PendingModal.jsx';
import ContractsPanel from './ContractsTable.jsx';
import StarBoard, { CardPreview } from './StarBoard.jsx';
import WorkerCard, { HireCard, NationBadge } from './WorkerCard.jsx';

import ResourceIcon from './ResourceIcon.jsx';
import { Amount, SymbolKey } from './GameSymbols.jsx';
import TableViewport, { TableOverlay } from './TableViewport.jsx';
function Department({state,player,role,onCards}) {
  const d=player.depts[role], p=rowPressureState(state,d);
  const cellLabel=pos=>{
    const c=state.tracks[role][pos];
    if(!c)return '—';
    const production=[c.res&&`${c.res} ${RESOURCE_OF[d.sector]}`,c.coins&&`${c.coins} marchi`].filter(Boolean).join(' + ')||'—';
    const reward=c.milestoneReward;
    return production+(reward?` · premio una tantum: ${reward.res||0} ${RESOURCE_OF[d.sector]}, ${reward.coins||0} marchi`:'');
  };
  const renderCell=pos=>{
    const c=state.tracks[role][pos];
    if(!c||!(c.res||c.coins))return '—';
    return <>{c.res>0&&<><Amount kind={d.sector} value={c.res}/></>}{c.coins>0&&<>{c.res>0?' + ':''}<Amount kind="coin" value={c.coins}/></>}</>;
  };
  return <section className="play-department" aria-label={`Reparto ${d.sector}`}>
    <header><h3><ResourceIcon resource={d.sector} decorative/> {d.sector}</h3><span><b className="overview-available">{p.available}/{p.developed} righe · </b>Tensione <b>{d.tension}</b></span></header>
    <p className="play-row-count"><b>{p.available}/{p.developed}</b> righe utilizzabili{p.blocked>0&&<em> · {p.blocked} bloccate</em>}</p>
    <RowProductionTrack tensionDirection={state.rowEconomy.tensionDirection} unlock={state.rowEconomy.productionUnlock} thresholds={state.rowEconomy.productionUnlock==='cells'?null:state.rowEconomy.productionThresholds} milestones={state.tracks[role].flatMap((c,i)=>c?.milestoneReward?[i]:[])} model={state.trackModel} prod={d.prod} tension={d.tension} wholeRows renderCell={renderCell} renderReward={pos=>{const reward=state.tracks[role][pos]?.milestoneReward;return reward?<em className="track-milestone-reward">★ {reward.res>0&&<Amount kind={d.sector} value={reward.res}/>} {reward.coins>0&&<Amount kind="coin" value={reward.coins}/>}</em>:null;}} cellTitle={cellLabel}/>

    <button className="department-cards-button" onClick={()=>onCards(player.id,role)}>{d.sopra.length} operai · {d.sotto.length}/{state.slots[role].sotto} macchinari <span aria-hidden="true">↗</span></button>
  </section>;
}
export default function PlayTable({state,dispatch,undo,paused,setPaused,onClose,thinking,error,saved,saveError}) {
  const p=currentPlayer(state), decider=state.players[deciderId(state)];
  const infoRef=useRef(null),[info,setInfo]=useState(null);
  const actionsRef=useRef(null), [actionsOpen,setActionsOpen]=useState(false), [actionType,setActionType]=useState(null);
  const [view,setView]=useState(state.players.find(x=>!x.isAI)?.id??0), [inspected,setInspected]=useState(null);
  useEffect(()=>{if(!decider.isAI)setView(decider.id);},[decider.id]);
  useEffect(()=>{
    if(state.pending)setActionsOpen(false);
    else if(['borsa','roundRondel'].includes(state.phase)&&!p.isAI){setActionType(null);setActionsOpen(true);}
    else if(state.phase==='move')setActionsOpen(false);
  },[state.phase,state.current,state.pending]);
  useEffect(()=>{
    if(actionsOpen&&!actionsRef.current.open)actionsRef.current.showModal();
    else if(!actionsOpen&&actionsRef.current.open)actionsRef.current.close();
  },[actionsOpen]);
  useEffect(()=>{if(info&&!infoRef.current.open)infoRef.current.showModal();else if(!info&&infoRef.current?.open)infoRef.current.close();},[info]);
  const player=state.players[view], moves=!decider.isAI&&!state.pending?legalCommands(state).filter(c=>c.type==='move'):[];
  const tokens=tokenWelfare(state),welfare=tokens?(player.welfareTokens||0):(player.depts.terziario.sustainableWelfare||0);
  const welfareLabel=`${welfare} ${tokens?'gettoni welfare':'welfare'}`;
  const actionTitle=state.phase==='roundRondel'?'Scelta della politica':{activate:'Produzione',repress:'Repressione',investWelfare:'Welfare'}[actionType];
  const nodeCommands=!p.isAI&&!state.pending?legalCommands(state).filter(c=>c.type===actionType):[];
  const runNodeAction=cmd=>{setActionsOpen(false);dispatch(cmd);};
  return <TableViewport><div className="lab-shell play-table table-overview">
    <header className="play-header"><div><p className="lab-eyebrow">OFFICINA 1907 / AL TAVOLO</p><h1>Turno {state.turn}<small> / {state.roundLimit}</small></h1></div><div className="play-turn" role="status"><b>{p.name}{p.isAI?' · IA':''}</b><span>{thinking?'Sta valutando le alternative…':paused?'IA in pausa':state.pending?'Completa la scelta':state.phase==='roundRondel'?'Fine round · scegli la politica':state.phase==='move'?'Scegli dove andare':`Sei a ${rowNodeLabel(state,p.node)}`}</span></div><div className="lab-actions"><button onClick={undo} disabled={!undo}>↶ Annulla mossa</button><button onClick={()=>setPaused(!paused)}>{paused?'Riprendi IA':'Pausa IA'}</button><button onClick={onClose}>Torna al laboratorio</button></div></header>
    {error&&<p className="lab-error" role="alert">{error}</p>}{saveError&&<p className="lab-error" role="alert">{saveError}</p>}
    <nav className="play-jumps" aria-label="Comandi del tavolo"><button onClick={()=>{setActionType(null);setActionsOpen(true);}}>{state.phase==='roundRondel'?'Scegli la politica':'Azioni del nodo'}</button><button onClick={()=>setInfo({type:'log'})}>Registro</button><button onClick={()=>setInfo({type:'symbols'})}>Simboli</button><span className="game-save-state">{saved?'✓ Partita salvata':'Salvataggio non disponibile'}</span></nav>
    <main className="play-layout">
      <StarBoard state={state} dispatch={dispatch} onActions={()=>{setActionType(null);setActionsOpen(true);}} onNodeAction={type=>{setActionType(type);setActionsOpen(true);}}/>
      <section id="commesse" className="lab-card play-contracts play-contracts-side" aria-label="Commesse disponibili"><ContractsPanel state={state} player={player}/></section>
      <div id="fabbrica" className="play-factory-column">
        <div className="play-player-tabs" aria-label="Plance dei giocatori">{state.players.map(x=><button key={x.id} aria-pressed={view===x.id} onClick={()=>setView(x.id)}>{x.name}{x.isAI?' · IA':''} <small><Amount kind="pv" value={scorePlayer(state,x).total}/></small></button>)}</div>
        <section className="lab-card play-factory">
          <div className="play-factory-heading"><div><p className="lab-eyebrow">{player.isAI?'FABBRICA AVVERSARIA':'LA TUA FABBRICA'}</p><h2>{player.name}</h2></div><span>📍 {rowNodeLabel(state,player.node)}</span></div>
          <div className="play-wallet"><Amount kind="coin" value={player.coins}/>{Object.entries(player.resources).map(([r,n])=><Amount key={r} kind={r} value={n}/>)}<span title={welfareLabel} aria-label={welfareLabel}>🌿 <b>{welfare}</b>{tokens&&' gettoni'}</span></div>
          <div className="play-departments">{ROLES.map(role=><Department key={role} state={state} player={player} role={role} onInspect={setInspected} onCards={(playerId,role)=>setInfo({type:'cards',playerId,role})}/>)}</div>
          <WelfareRondel state={state} player={player}/>
          <div className="play-direction">{state.rowEconomy.welfareBank&&<p><b>Banca Welfare: {state.welfareBank||0} marchi</b> · fondi comuni saccheggiabili con la repressione.</p>}<p className="lab-muted">Commesse completate: {player.contractsWon.length} · Repressioni: {player.industrialStats.repressions}</p></div>
        </section>

      </div>
    </main>
    {info&&<TableOverlay><dialog ref={infoRef} className="table-action-dialog" aria-label={info.type==='log'?'Registro':info.type==='symbols'?'Simboli':'Operai e macchinari'} onCancel={()=>setInfo(null)} onClick={e=>{if(e.target===e.currentTarget)setInfo(null);}}>
      <button className="dialog-close" onClick={()=>setInfo(null)}>Torna al tavolo ×</button>
      {info.type==='symbols'?<SymbolKey open/>:info.type==='log'?<section className="play-events"><h2>Registro</h2><ol>{[...state.log].reverse().map((l,i)=><li key={i}><small>T{l.turn}</small> {l.text}</li>)}</ol></section>:<section><h2>{state.players[info.playerId].depts[info.role].sector} · operai e macchinari</h2>{['sopra','sotto'].map(side=><React.Fragment key={side}><h3>{side==='sopra'?'Operai':'Macchinari'}</h3><div className="installed-cards">{state.players[info.playerId].depts[info.role][side].map(id=><WorkerCard key={id} worker={WORKER_BY_ID[id]} side={side} onInspect={()=>{setInfo(null);setInspected(id);}}/>)}</div></React.Fragment>)}</section>}
    </dialog></TableOverlay>}
    <TableOverlay><dialog ref={actionsRef} className="table-action-dialog" aria-label={actionTitle||'Azioni del nodo'} onCancel={()=>setActionsOpen(false)} onClick={e=>{if(e.target===e.currentTarget)setActionsOpen(false);}}>
      <button className="dialog-close" onClick={()=>setActionsOpen(false)}>Torna al tabellone ×</button>
      {actionType?<section className="node-action-choices"><h2>{actionTitle}{actionType==='activate'?` · ${p.node}`:''}</h2>{actionType==='activate'?<ProductionActions state={state} p={p} activations={nodeCommands} dispatch={runNodeAction}/>:<RowEconomyActions state={state} p={p} legal={nodeCommands} dispatch={runNodeAction}/>}</section>:<aside id="azioni" className="play-action-column" aria-label="Le tue azioni">
        <section className="lab-card play-action-card">
          {moves.length>0?<><p className="lab-eyebrow">1 / POSIZIONAMENTO</p><h2>Scegli un nodo sulla stella</h2><p>Sposta il procuratore su uno dei nodi illuminati. Poi scegli l’azione o la carta da acquistare.</p><button className="star-return" onClick={()=>setActionsOpen(false)}>Torna alla stella</button><p className="lab-muted">Ogni nodo permette di acquistare una delle due carte adiacenti.</p></>:<ActionPanel state={state} dispatch={dispatch} renderHireCard={props=><HireCard {...props}/>}/>}
          {paused&&p.isAI&&<p className="lab-callout">Premi «Riprendi IA» per far giocare l’avversario.</p>}
        </section>
        <details className="play-help"><summary>Promemoria delle regole</summary><p>Spostati e svolgi un’azione nel nodo. Puoi acquistare una delle due carte adiacenti. In Città puoi consegnare una sola commessa: incassi punti e marchi e il turno termina automaticamente. {state.finalCoinPV?`Ai punti delle commesse si aggiunge 1 PV ogni ${state.rules.coinsPerPV} marchi finali, arrotondando per difetto.`:'I punti vittoria vengono solo dalle commesse.'} A parità di punti contano i marchi rimasti, poi il numero di commesse completate. Sopra: −1 marco per ogni operaio già presente della stessa nazionalità nello stesso reparto, minimo 1 marco. Il valore stampato sviluppa comunque il reparto. Sotto: il macchinario si attiva quando produci. Quelli con T nel simbolo dei marchi rendono i marchi indicati sulla carta per ogni livello di tensione prima della produzione; due sommano le rendite.</p>{tokens?<><p>{state.roundRondel?'La rondella si sceglie gratis dopo i turni 9 e 18: primo ingresso su qualsiasi politica, poi massimo 3 passi o permanenza. Al Welfare compri 1–3 gettoni a 1 marco ciascuno. I gettoni sono':rondelEnabled(state)?`La rondella costa 1 marco per passo e dà 1 gettone per passo, da 1 a ${welfareMaxSteps(state)}. ${freeWelfareEntry(state) ? "Primo ingresso libero." : "Partenza prima di Cooperazione, senza bonus: Formazione richiede almeno due visite."} Attiva la politica personale della destinazione. I gettoni sono`:<>Il welfare compra 3 gettoni per {state.rowEconomy.welfareCost} marchi,</>} utilizzabili dal turno successivo e solo nel reparto in cui sei. Produzione protetta: spendi 1 gettone, produci tutte le righe accessibili e attivi i macchinari senza aumentare la tensione. Se non produci, puoi spendere più gettoni per curare quel reparto: −1 tensione per gettone, fino a zero. Puoi curare dopo un acquisto oppure rinunciando all’azione. I gettoni non scontano le assunzioni; le politiche della rondella possono farlo.</p><p>{state.rowEconomy.welfareBank?'La repressione è gratuita e ruba dalla banca Welfare tanti marchi quanti livelli elimina, entro i fondi disponibili; ogni acquisto Welfare alimenta la banca comune.':'La repressione costa '+state.rowEconomy.repressionBase+' marchi:'} azzera un reparto e aumenta di 1 la tensione degli altri due, fino al limite del tracciato.</p></>:<><p>Ogni welfare sconta di 1 M gli operai (minimo 1 M) e permette una riga sostenibile in più nei tre reparti. La produzione sostenibile riduce sempre di 1 la tensione; comprare welfare non la riduce subito.</p><p>La repressione recupera 2 tensione, con un prezzo crescente. Entrambe le produzioni attivano i macchinari una volta.</p></>}</details>
      </aside>}
    </dialog></TableOverlay>
    {inspected&&<CardPreview worker={WORKER_BY_ID[inspected]} state={state} dispatch={dispatch} onClose={()=>setInspected(null)}/>}
    {state.pending&&!decider.isAI&&<TableOverlay><PendingModal state={state} dispatch={dispatch} renderResource={resource=><ResourceIcon resource={resource} decorative/>}/></TableOverlay>}
  </div></TableViewport>;
}
