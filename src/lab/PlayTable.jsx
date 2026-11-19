import WelfareRondel from '../components/WelfareRondel.jsx';
import { rondelEnabled, welfareMaxSteps, freeWelfareEntry } from '../game/welfare-rondel.js';
import React, { useEffect, useRef, useState } from 'react';
import { currentPlayer, legalCommands, WORKER_BY_ID, scorePlayer, welfareRecoveryCommands } from '../game/engine.js';
import { deciderId } from '../game/ai.js';
import { rowNodeLabel, tokenWelfare } from '../game/row-economy.js';
import ActionPanel, { ProductionActions, RowEconomyActions } from '../components/ActionPanel.jsx';
import PendingModal from '../components/PendingModal.jsx';
import ContractsPanel from './ContractsTable.jsx';
import StarBoard, { CardPreview, WelfareBank } from './StarBoard.jsx';
import WorkerCard, { HireCard } from './WorkerCard.jsx';

import { Amount, SymbolKey } from './GameSymbols.jsx';
import TableViewport, { TableOverlay } from './TableViewport.jsx';
import TurnTrack from './TurnTrack.jsx';
import PlayerBoard from './PlayerBoard.jsx';
import {departmentArt} from './approved-art.js';
import {CITY_SCORING,CITY_CATEGORIES,CITY_REQUIREMENTS,periodOf,cityPoints,productionPoints} from '../game/city-missions.js';
import {CALENDAR_MISSIONS} from '../game/calendar-missions.js';
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
  const canRecover=actionType==='activate'&&state.phase==='action'&&!p.isAI&&welfareRecoveryCommands(state,p).length>0;
  const actionTitle=state.phase==='roundRondel'?'Scelta della politica':{activate:canRecover?'Produzione e cura':'Produzione',repress:'Repressione',investWelfare:'Welfare'}[actionType];
  const nodeCommands=!p.isAI&&!state.pending?legalCommands(state).filter(c=>c.type===actionType):[];
  const missionTurn=state.roundRondel?.active?.endTurn??state.turn;
  const period=periodOf(missionTurn);
  const runNodeAction=cmd=>{setActionsOpen(false);dispatch(cmd);};
  const contractsPanel=<section className="lab-card play-contracts play-contracts-side table-wide-panel" aria-label={state.cityMissions?'Rondella e missioni':'Rondella e commesse'}>
        <WelfareRondel state={state} player={player}/>
        {state.cityMissions?<section className="city-missions-panel" aria-labelledby="city-missions-title">
          <h2 id="city-missions-title">Missioni in Città</h2>
          <p>{period+1}° quadrimestre · Scadenza T{(period+1)*7}</p>
          <div className="city-mission-cards">
            {CITY_CATEGORIES.map(({name,symbol},i)=><article className="city-mission-card" key={name}>
              <header>
                <h3><span aria-hidden="true">{symbol}</span> {name}</h3>
                <strong>{i===0?productionPoints(missionTurn,state.cityScoring):cityPoints(missionTurn,state.cityScoring)} PV</strong>
              </header>
              <p>{CITY_REQUIREMENTS[period][i]}.</p>
              <small>{i===0?'Consegna ripetibile':'Una certificazione per giocatore'}</small>
            </article>)}
          </div>
          <button type="button" onClick={()=>setInfo({type:'missions'})}>{period+1<CITY_REQUIREMENTS.length?'Prossime missioni ↗':'Dettagli delle missioni ↗'}</button>
        </section>:<ContractsPanel state={state} player={player}/>}
      </section>;
  const factoryPanel=<div className="play-factory-column table-wide-panel">
        <div className="play-player-tabs" aria-label="Plance dei giocatori">{state.players.map(x=><button key={x.id} aria-pressed={view===x.id} onClick={()=>setView(x.id)}>{x.name}{x.isAI?' · IA':''} <small><Amount kind="pv" value={scorePlayer(state,x).total}/></small></button>)}</div>
        <section className="lab-card play-factory">
          <div className="play-factory-heading"><div><p className="lab-eyebrow">{player.isAI?'FABBRICA AVVERSARIA':'LA TUA FABBRICA'}</p><h2>{player.name}</h2></div><span>📍 {rowNodeLabel(state,player.node)}</span></div>
          <div className="play-wallet"><Amount kind="coin" value={player.coins}/>{Object.entries(player.resources).map(([r,n])=><Amount key={r} kind={r} value={n}/>)}<span title={welfareLabel} aria-label={welfareLabel}><img className="wallet-welfare-icon" src={departmentArt('Servizi')} alt=""/> <b>{welfare}</b>{tokens&&' gettoni'}</span></div>
          <PlayerBoard state={state} player={player} onCards={(playerId,role)=>setInfo({type:'cards',playerId,role})}/>
          <button type="button" className="player-board-enlarge" onClick={()=>setInfo({type:'board',playerId:player.id})}>Ingrandisci plancia ↗</button>
        </section>

      </div>;
  return <TableViewport><div className="lab-shell play-table physical-table">
    <header className="play-header"><div><p className="lab-eyebrow">OFFICINA 1907 / AL TAVOLO</p><h1>Turno {state.turn}<small> / {state.roundLimit}</small></h1></div><div className="play-turn" role="status"><b>{p.name}{p.isAI?' · IA':''}</b><span>{thinking?'Sta valutando le alternative…':paused?'IA in pausa':state.pending?'Completa la scelta':state.phase==='roundRondel'?'Fine round · scegli la politica':state.phase==='move'?'Scegli dove andare':`Sei a ${rowNodeLabel(state,p.node)}`}</span></div><div className="lab-actions"><button onClick={undo} disabled={!undo}>↶ Annulla mossa</button><button onClick={()=>setPaused(!paused)}>{paused?'Riprendi IA':'Pausa IA'}</button><button onClick={onClose}>Torna al laboratorio</button></div></header>
    {error&&<p className="lab-error" role="alert">{error}</p>}{saveError&&<p className="lab-error" role="alert">{saveError}</p>}
    <nav className="play-jumps" aria-label="Comandi del tavolo"><div className="play-jump-actions"><button onClick={()=>{setActionType(null);setActionsOpen(true);}}>{state.phase==='roundRondel'?'Scegli la politica':'Azioni del nodo'}</button><button onClick={()=>setInfo({type:'contracts'})}>{state.cityMissions?'Missioni':'Commesse'}</button><button onClick={()=>setInfo({type:'log'})}>Registro</button><button onClick={()=>setInfo({type:'symbols'})}>Simboli</button><button onClick={()=>setInfo({type:'table'})}>Tavolo</button></div>{state.calendarMissions&&!state.cityMissions&&<div className="calendar-mission-list" aria-label="Missioni comuni">{CALENDAR_MISSIONS.map(mission=><button type="button" key={mission.id} title={mission.description} onClick={()=>setInfo({type:'missions'})}>{mission.symbol} {mission.name}</button>)}</div>}<span className="game-save-state">{saved?'✓ Partita salvata':'Salvataggio non disponibile'}</span></nav>
    <main className="play-layout">
      <StarBoard state={state} dispatch={dispatch} onInfo={type=>setInfo({type})} onActions={()=>{setActionType(null);setActionsOpen(true);}} onNodeAction={type=>{setActionType(type);setActionsOpen(true);}}/>
      {factoryPanel}
    </main>
    {info&&<TableOverlay><dialog ref={infoRef} className="table-action-dialog" aria-label={info.type==='log'?'Registro':info.type==='symbols'?'Simboli':info.type==='requests'?'Richieste del round':info.type==='missions'?'Missioni sul calendario':['board','factory'].includes(info.type)?'Plancia giocatore':info.type==='contracts'?'Rondella e commesse':info.type==='calendar'?'Calendario':info.type==='welfare'?'Fondi Welfare':info.type==='rondel'?'Rondella':'Operai e macchinari'} onCancel={()=>setInfo(null)} onClick={e=>{if(e.target===e.currentTarget)setInfo(null);}}>
      <button className="dialog-close" onClick={()=>setInfo(null)}>Torna al tavolo ×</button>
      {info.type==='table'?<section><h2>Tavolo</h2><div className="lab-actions"><button onClick={undo} disabled={!undo}>↶ Annulla mossa</button><button onClick={()=>setPaused(!paused)}>{paused?'Riprendi IA':'Pausa IA'}</button><button onClick={onClose}>Torna al laboratorio</button></div></section>:info.type==='factory'?factoryPanel:info.type==='contracts'?contractsPanel:info.type==='calendar'?<section className="calendar-detail"><h2>Calendario · turno {state.turn}</h2><TurnTrack state={state}/></section>:info.type==='board'?<section className="player-board-detail"><h2>{state.players[info.playerId].name} · plancia giocatore</h2><PlayerBoard state={state} player={state.players[info.playerId]} onCards={(playerId,role)=>setInfo({type:'cards',playerId,role})}/></section>:info.type==='welfare'?<WelfareBank state={state}/>:info.type==='rondel'?<WelfareRondel state={state} player={player}/>:info.type==='missions'&&state.cityMissions?<section><h2>Missioni in Città</h2><p>{state.cityScoring===CITY_SCORING?'Giorni 1–2: +1 PV · giorni 3–7: PV base.':'Giorni 1–2: +2 PV · giorni 3–5: +1 PV · giorni 6–7: PV base.'}</p>{CITY_REQUIREMENTS.slice(period,period+2).map((requirements,offset)=><div key={period+offset}><h3>{period+offset+1}° quadrimestre · {offset?'Anteprima':'Attivo'}</h3><ul>{requirements.map((requirement,i)=><li key={requirement}><b>{CITY_CATEGORIES[i].name} · {i===0?productionPoints(7,state.cityScoring):cityPoints(7,state.cityScoring)} PV base</b><br/>{requirement}</li>)}</ul></div>)}</section>:info.type==='missions'?<section><h2>Missioni sul calendario</h2><p>Ogni missione vale una volta per giocatore. I PV si fissano quando viene piazzato il gettone.</p><ul>{CALENDAR_MISSIONS.map(mission=><li key={mission.id}><b>{mission.symbol} {mission.name}</b><br/>{mission.description} PV dal primo al quarto round: {mission.points.join(' / ')}.</li>)}</ul></section>:info.type==='symbols'?<SymbolKey open/>:info.type==='log'?<section className="play-events"><h2>Registro</h2><ol>{[...state.log].reverse().map((l,i)=><li key={i}><small>T{l.turn}</small> {l.text}</li>)}</ol></section>:<section><h2>{state.players[info.playerId].depts[info.role].sector} · operai e macchinari</h2>{['sopra','sotto'].map(side=><React.Fragment key={side}><h3>{side==='sopra'?'Operai':'Macchinari'}</h3><div className="installed-cards">{state.players[info.playerId].depts[info.role][side].map(id=><WorkerCard key={id} worker={WORKER_BY_ID[id]} side={side} onInspect={()=>{setInfo(null);setInspected(id);}}/>)}</div></React.Fragment>)}</section>}
    </dialog></TableOverlay>}
    <TableOverlay><dialog ref={actionsRef} className="table-action-dialog" aria-label={actionTitle||'Azioni del nodo'} onCancel={()=>setActionsOpen(false)} onClick={e=>{if(e.target===e.currentTarget)setActionsOpen(false);}}>
      <button className="dialog-close" onClick={()=>setActionsOpen(false)}>Torna al tabellone ×</button>
      {actionType?<section className="node-action-choices"><h2>{actionTitle}{actionType==='activate'?` · ${p.node}`:''}</h2>{actionType==='activate'?<>
        <ProductionActions state={state} p={p} activations={nodeCommands} dispatch={runNodeAction}/>
        {canRecover&&<button type="button" onClick={()=>runNodeAction({type:'pass'})}>Cura senza produrre</button>}
      </>:<RowEconomyActions state={state} p={p} legal={nodeCommands} dispatch={runNodeAction}/>}</section>:<aside id="azioni" className="play-action-column" aria-label="Le tue azioni">
        <section className="lab-card play-action-card">
          {moves.length>0?<><p className="lab-eyebrow">1 / POSIZIONAMENTO</p><h2>Scegli un nodo sulla stella</h2><p>Sposta il procuratore su uno dei nodi illuminati. Poi scegli l’azione o la carta da acquistare.</p><div className="play-moves">{moves.map(move=><button key={move.node} onClick={()=>runNodeAction(move)}>Vai a {rowNodeLabel(state,move.node)} · <Amount kind="coin" value={move.cost}/></button>)}</div><button className="star-return" onClick={()=>setActionsOpen(false)}>Torna alla stella</button><p className="lab-muted">Ogni nodo permette di acquistare una delle due carte adiacenti.</p></>:<ActionPanel state={state} dispatch={dispatch} renderHireCard={props=><HireCard {...props}/>}/>}
          {paused&&p.isAI&&<p className="lab-callout">Premi «Riprendi IA» per far giocare l’avversario.</p>}
        </section>
        <details className="play-help"><summary>Promemoria delle regole</summary>{state.roundRondel?.fundThresholds&&<p>Fondi comuni: Economia 3 (Innovazione −2, Affidabilità +4), Personale 4 (Integrazione −2, Formazione +2), Produzione 3 (Cooperazione +2, Mutuo fino a 2 scambi). Gli sconti rispettano il minimo di 1 marco. Distribuisci i marchi pagati al Welfare; la repressione saccheggia un solo fondo. Sotto soglia il bonus torna base; i benefici già ottenuti restano.</p>}<p>Spostati e svolgi un’azione nel nodo. Puoi acquistare una delle due carte adiacenti. {state.cityMissions?'In Città puoi consegnare un lotto o certificare Economia e Personale. I marchi rimasti decidono la parità di PV.':<>In Città puoi consegnare una sola commessa: incassi punti e marchi e il turno termina automaticamente. {state.finalCoinPV?`Ai punti delle commesse si aggiunge 1 PV ogni ${state.rules.coinsPerPV} marchi finali, arrotondando per difetto.`:'I punti vittoria vengono dalle commesse.'} {state.finalResourcePV&&'In più, 1 PV per ogni terna di risorse diverse rimaste a fine partita: 1 tessuto + 1 acciaio + 1 colorante.'} A parità di punti contano i marchi rimasti, poi il numero di commesse completate.</>} Sopra: {state.roundRondel?.startingPolicy==='affinity'?'solo su Affinità, −1 marco fisso se hai già almeno un operaio della stessa nazionalità in uno qualsiasi dei tuoi tre reparti, minimo 1 marco.':'−1 marco per ogni operaio già presente della stessa nazionalità nello stesso reparto, minimo 1 marco.'} Il valore stampato sviluppa comunque il reparto. {state.machineReserve?'Puoi installare quanti macchinari vuoi. Ogni nuovo macchinario rende subito se c’è almeno una riga raggiunta e libera. A ogni produzione si attivano automaticamente fino a due macchine, con la rendita più alta prima che salga la tensione.':'I macchinari installati si attivano quando produci.'}</p>{tokens?<><p>{state.roundRondel?.startingPolicy==='affinity'?`Tutti partono su Affinità. Dopo i turni ${state.roundRondel.bounds.join(', ')} devi avanzare: 1–3 passi gratis, poi 1 marco per passo aggiuntivo, fino a 6 passi. Il bonus della destinazione sostituisce il precedente. Al Welfare compri 1–3 gettoni a 1 marco ciascuno. I gettoni sono`:state.roundRondel?'La rondella si sceglie gratis dopo i turni 9 e 18: primo ingresso su qualsiasi politica, poi massimo 3 passi o permanenza. Al Welfare compri 1–3 gettoni a 1 marco ciascuno. I gettoni sono':rondelEnabled(state)?`La rondella costa 1 marco per passo e dà 1 gettone per passo, da 1 a ${welfareMaxSteps(state)}. ${freeWelfareEntry(state) ? "Primo ingresso libero." : "Partenza prima di Cooperazione, senza bonus: Formazione richiede almeno due visite."} Attiva la politica personale della destinazione. I gettoni sono`:<>Il welfare compra 3 gettoni per {state.rowEconomy.welfareCost} marchi,</>} utilizzabili dal turno successivo e solo nel reparto in cui sei. Produzione protetta: spendi 1 gettone, produci tutte le righe accessibili e attivi i macchinari senza aumentare la tensione. Se non produci, puoi spendere più gettoni per curare quel reparto: −1 tensione per gettone, fino a zero. Puoi curare dopo un acquisto oppure rinunciando all’azione. I gettoni non scontano le assunzioni; le politiche della rondella possono farlo.</p><p>{state.rowEconomy.welfareBank?'La repressione è gratuita e ruba dalla banca Welfare tanti marchi quanti livelli elimina, entro i fondi disponibili; ogni acquisto Welfare alimenta la banca comune.':'La repressione costa '+state.rowEconomy.repressionBase+' marchi:'} azzera un reparto e aumenta di 1 la tensione degli altri due, fino al limite del tracciato.</p></>:<><p>Ogni welfare sconta di 1 M gli operai (minimo 1 M) e permette una riga sostenibile in più nei tre reparti. La produzione sostenibile riduce sempre di 1 la tensione; comprare welfare non la riduce subito.</p><p>La repressione recupera 2 tensione, con un prezzo crescente. Entrambe le produzioni attivano i macchinari una volta.</p></>}</details>
      </aside>}
    </dialog></TableOverlay>
    {inspected&&<CardPreview worker={WORKER_BY_ID[inspected]} state={state} dispatch={dispatch} onClose={()=>setInspected(null)}/>}
    {state.pending&&!decider.isAI&&<TableOverlay><PendingModal state={state} dispatch={dispatch} renderResource={resource=><ResourceIcon resource={resource} decorative/>}/></TableOverlay>}
  </div></TableViewport>;
}
