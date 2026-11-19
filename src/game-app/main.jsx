import React,{useEffect,useState} from 'react';
import {createRoot} from 'react-dom/client';
import {mainDefaults,gameConfig,newMatchConfig} from '../lab/config.js';
import {gameSession} from '../lab/saved-game.js';
import LiveGame from '../lab/LiveGame.jsx';
import useVersionCheck,{RELEASE} from '../lab/useVersionCheck.js';
import {approvedArt} from '../lab/approved-art.js';
import {GameStore} from './store.js';
import '../styles.css';
import '../lab/styles.css';
import '../lab/physical-table.css';
import './style.css';

function App(){
  const [store]=useState(()=>new GameStore());
  const [view,setView]=useState(store.view),[live,setLive]=useState(null),[humans,setHumans]=useState(1),[replace,setReplace]=useState(false),[error,setError]=useState('');
  const version=useVersionCheck(!!live);
  useEffect(()=>{
    const stop=store.subscribe(next=>{setView(next);setLive(current=>current&&(current.epoch!==next.epoch||next.conflict)?null:current);});store.start();
    const online=()=>store.refresh();window.addEventListener('online',online);
    return()=>{stop();store.dispose();window.removeEventListener('online',online);};
  },[store]);
  const currentLive=live&&live.epoch===view.epoch&&!view.conflict?live:null;
  const open=record=>{setError('');setReplace(false);setLive({config:record.save.config,resume:record.save,epoch:view.epoch,matchId:record.matchId});};
  const start=()=>{
    if(view.record&&!replace){setReplace(true);return;}
    try{
      const config=newMatchConfig(gameConfig(mainDefaults(),{humans}));
      const matchId=store.id();store.persist(config,gameSession(config),view.epoch,matchId);open(store.view.record);
    }catch(e){setError(e.message);}
  };
  if(!version.ready)return <main className="game-home" role="status">Controllo aggiornamenti…</main>;
  if(currentLive)return <LiveGame key={`${currentLive.epoch}:${currentLive.matchId}`} {...currentLive}
    onPersist={(config,session)=>store.persist(config,session,currentLive.epoch,currentLive.matchId)}
    onSaved={()=>{}} onClose={()=>setLive(null)} closeLabel="Menu partita" saveNotice={view.message}/>;
  const busy=view.owner===undefined||view.status==='loading';
  return <main className={`game-home${replace||view.conflict?' game-home-compact':''}`}>
    <section className="game-welcome">
      <a className="game-back" href="/">← Mongames</a>
      <p className="game-kicker">OFFICINA 1907</p>
      <h1>La tua fabbrica.<br/>Le tue scelte.</h1>
      <p className="game-intro">Tre reparti, una città e una rondella di possibilità. Sviluppa la produzione e prenditi cura di chi lavora.</p>
      <div className="game-account"><strong>{view.owner?view.email:'Ospite'}</strong>
        <p role="status">{view.message}</p>
        {!view.owner&&view.owner!==undefined&&<a href="/accedi.html?next=%2Fofficina%2Fgioco%2F">Accedi con Mongames</a>}
        {view.owner&&<button onClick={()=>store.refresh()} disabled={busy}>Riprova sincronizzazione</button>}
      </div>
      {view.conflict?<section className="game-conflict" aria-labelledby="conflict-title">
        <h2 id="conflict-title">Quale partita vuoi riprendere?</h2>
        <p>Le due copie restano separate finché scegli. Riprendendo quella cloud conserviamo una copia locale di riserva.</p>
        <button onClick={()=>store.choose('local')}>Usa la copia locale · turno {view.record?.save.state.turn}</button>
        {view.conflict.remote&&<button onClick={()=>store.choose('cloud')}>Usa la copia cloud · turno {view.conflict.remote.data.save.state.turn}</button>}
      </section>:<div className="game-start-controls">
        {view.record&&<button className="game-primary" disabled={busy} onClick={()=>open(view.record)}>{view.record.save.state.gameOver?'Rivedi risultato':'Riprendi partita'} · turno {view.record.save.state.turn}</button>}
        <label>Giocatori sullo stesso schermo<select value={humans} onChange={e=>setHumans(Number(e.target.value))}>
          <option value={1}>Solo io · due avversari IA</option><option value={2}>Due persone · un avversario IA</option><option value={3}>Tre persone</option>
        </select></label>
        {replace&&<p role="alert">La nuova partita sostituirà quella attiva in questo account o dispositivo. Ne conserveremo una copia locale di riserva.</p>}
        <button className={view.record?'':'game-primary'} disabled={busy||view.status==='error'} onClick={start}>{replace?'Conferma nuova partita':'Nuova partita'}</button>
        {replace&&<button onClick={()=>setReplace(false)}>Annulla</button>}
      </div>}
      {error&&<p role="alert" className="game-error">{error}</p>}
      <small className="game-release">{RELEASE?`Versione ${RELEASE.version.slice(0,8)}`:'Anteprima'} · {view.owner?'Una partita attiva nel tuo account.':'La partita ospite resta su questo dispositivo.'}</small>
    </section>
    <div className="game-cover" aria-hidden="true"><img src={approvedArt('main-board.jpg')} alt="" width="6253" height="4321"/></div>
  </main>;
}
createRoot(document.getElementById('root')).render(<App/>);
