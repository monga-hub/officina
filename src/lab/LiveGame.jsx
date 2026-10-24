import React, { useEffect, useState } from 'react';
import { applyCommand, scorePlayer } from '../game/engine.js';
import { deciderId } from '../game/ai.js';
import { gameSession, saveGame } from './saved-game.js';
import PlayTable from './PlayTable.jsx';
import Worker from './worker.js?worker&inline';
export default function LiveGame({config,resume,onSaved,onClose}) {
  const [session,setSession]=useState(()=>gameSession(config,resume));
  const [error,setError]=useState(''),[thinking,setThinking]=useState(false),[saveError,setSaveError]=useState(''),[saved,setSaved]=useState(false);
  const {state,history,paused}=session;
  const persist=next=>{
    try{const record=saveGame(config,next);setSaveError('');setSaved(true);onSaved(record);return true;}
    catch(e){setSaved(false);setSaveError('Salvataggio della partita non riuscito. Mantieni aperta questa scheda: le ultime mosse potrebbero non essere recuperabili.');return false;}
  };
  // Save immediately on each action; do not depend on an unload event or a delayed effect.
  const commit=next=>{persist(next);setSession(next);};
  const setPaused=value=>commit({...session,paused:value});
  const close=()=>{if(persist(session))onClose();};
  useEffect(()=>{window.scrollTo(0,0);persist(session);},[]);
  const dispatch=cmd=>{try{const next=applyCommand(state,cmd);commit({state:next,history:[...history.slice(-59),state],paused});setError('');}catch(e){setError(e.message);setPaused(true);}};
  useEffect(()=>{
    setThinking(false);
    if(state.gameOver||paused||!state.players[deciderId(state)].isAI)return;
    const worker=new Worker();let alive=true;
    const fail=message=>{if(alive){setError(message);setPaused(true);setThinking(false);}};
    worker.onerror=e=>fail(e.message||'Errore nel calcolo IA.');
    worker.onmessage=({data})=>{if(!alive)return;if(data.type==='error')fail(data.message);else if(data.type==='decision'){if(data.command)dispatch(data.command);else fail('L’IA non ha trovato una mossa.');}};
    const timer=setTimeout(()=>{setThinking(true);worker.postMessage({type:'decide',config,state});},300);
    return()=>{alive=false;clearTimeout(timer);worker.terminate();};
  },[state,paused]);
  if(state.gameOver)return <div className="lab-shell lab-standalone"><div className="lab-content"><h1>Partita conclusa</h1>{saveError&&<p className="lab-error" role="alert">{saveError}</p>}<div className="lab-card"><table><thead><tr><th>Giocatore</th><th>PV</th><th>Welfare</th><th>Repressioni</th></tr></thead><tbody>{state.players.map(p=><tr key={p.id}><td>{p.name}</td><td>{scorePlayer(state,p).total}</td><td>{p.industrialStats.welfareBuys}</td><td>{p.industrialStats.repressions}</td></tr>)}</tbody></table></div><button className="lab-primary" onClick={close}>Torna al laboratorio</button></div></div>;
  return <PlayTable state={state} dispatch={dispatch} undo={history.length?()=>{commit({state:history.at(-1),history:history.slice(0,-1),paused:true});setError('');}:null} paused={paused} setPaused={setPaused} onClose={close} thinking={thinking} error={error} saved={saved} saveError={saveError}/>;
}
