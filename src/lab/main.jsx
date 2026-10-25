import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { TRACK_MODELS } from '../game/data.js';
import { defaults, parseConfig, gameConfig, newMatchConfig, validate, STORAGE_KEY, download } from './config.js';
import { BoardEditor, EconomyEditor, CardsEditor, ContractsEditor, Card } from './Editors.jsx';
import Simulation from './Simulation.jsx';
import LiveGame from './LiveGame.jsx';
import PlaySetup from './PlaySetup.jsx';
import { loadGame } from './saved-game.js';
import useVersionCheck, { RELEASE } from './useVersionCheck.js';
import '../styles.css';
import './styles.css';
const NAV=[['play','01','Gioca'],['sim','02','Simulazione'],['board','03','Plancia produttiva'],['economy','04','Welfare e denaro'],['cards','05','Carte'],['contracts','06','Commesse'],['files','07','Salva e apri']];
function load() {
  try{const raw=localStorage.getItem(STORAGE_KEY);return {config:raw?parseConfig(raw):defaults(),error:''};}
  catch(e){return {config:defaults(),error:`Impossibile recuperare il salvataggio: ${e.message}. Sono caricate le impostazioni di riferimento; il vecchio salvataggio non è stato sovrascritto.`};}
}
function loadMatch() {
  try{return {saved:loadGame(),error:''};}
  catch(e){return {saved:null,error:`Impossibile aprire la partita salvata: ${e.message} Il salvataggio è stato conservato.`};}
}
function App() {
  const [initial]=useState(load),[c,setC]=useState(initial.config),[tab,setTab]=useState('play'),[locked,setLocked]=useState(false),[storageError,setStorageError]=useState(initial.error),[message,setMessage]=useState(''),[live,setLive]=useState(null),[dirty,setDirty]=useState(false);
  const [initialMatch]=useState(loadMatch),[savedGame,setSavedGame]=useState(initialMatch.saved),[matchError,setMatchError]=useState(initialMatch.error),[pendingGame,setPendingGame]=useState(null);
  const startGame=config=>{
    const matchConfig=newMatchConfig(config);
    if(savedGame||matchError){setPendingGame(matchConfig);return;}
    setMatchError('');setLive({config:matchConfig,resume:null});
  };
  const resumeGame=()=>{
    try{const saved=loadGame();if(!saved)throw new Error('Nessuna partita salvata in questo browser.');setSavedGame(saved);setPendingGame(null);setMatchError('');setLive({config:saved.config,resume:saved});}
    catch(e){setMatchError(`Impossibile riprendere la partita: ${e.message} Il salvataggio è stato conservato.`);}
  };
  const set=patch=>{setC(prev=>({...prev,...patch}));setDirty(true);};
  let invalid='';try{validate(c);}catch(e){invalid=e.message;}
  useEffect(()=>{
    if(!dirty||invalid)return;
    try{localStorage.setItem(STORAGE_KEY,JSON.stringify(c));setStorageError('');}catch(e){setStorageError('Il browser non consente il salvataggio automatico. Scarica la configurazione per conservare le modifiche.');}
  },[c,dirty,invalid]);
  const version=useVersionCheck(!!live||locked||!!invalid||!!storageError);
  const importFile=async e=>{
    const file=e.target.files?.[0];e.target.value='';if(!file)return;
    try{if(file.size>1500000)throw new Error('File troppo grande: scegli una configurazione, non i dati di tutte le partite.');const next=parseConfig(await file.text());setC(next);setDirty(true);setMessage(`Configurazione «${next.name}» caricata.`);}catch(err){setMessage(err.message);}
  };
  const model=TRACK_MODELS[c.trackModel];
  if(!version.ready)return <div className="version-start" role="status">Controllo aggiornamenti…</div>;
  return <>
    <div className="lab-shell" hidden={!!live}>
      <aside className="lab-sidebar"><div className="lab-brand"><span className="lab-monogram">O/07</span><strong>OFFICINA <span>1907</span></strong><small>Laboratorio di sviluppo</small></div>
        <nav aria-label="Sezioni del laboratorio">{NAV.map(([id,n,label])=><button key={id} aria-current={tab===id?'page':undefined} onClick={()=>setTab(id)}><span>{n}</span>{label}</button>)}</nav>
        <div className="lab-sidebar-note"><b>Tre reparti. Scelte diverse.</b><p>Produzione, tensione e investimenti nella stessa fabbrica.</p><span>Regole di riferimento · ottobre 2026</span></div>
      </aside>
      <main className="lab-content"><header className="lab-top"><div><p className="lab-eyebrow">OFFICINA 1907 / LABORATORIO</p><h1>{NAV.find(x=>x[0]===tab)[2]}</h1></div><span className="lab-save-state">{locked?'Simulazione in corso':invalid?'Configurazione da completare':storageError?'Salvataggio non disponibile':'Salvataggio locale'}</span></header>
        <div className="version-status" role="status"><span>{RELEASE?`Versione ${new Date(RELEASE.builtAt).toLocaleString('it-IT')} · ${RELEASE.version.slice(0,8)}`:'Anteprima locale'} · {version.result.status==='current'?'aggiornata':version.result.status==='unavailable'?'controllo non disponibile: puoi continuare':version.result.status==='update'?'aggiornamento disponibile':'sviluppo'}</span><button onClick={version.check}>Controlla aggiornamenti</button>{version.result.status==='update'&&version.result.attempted&&<><span>Il browser ha riaperto la versione precedente.</span><button onClick={()=>window.location.replace(version.result.url)}>Riprova aggiornamento</button></>}</div>
        <div className="lab-strip"><span><b>{model.rows} × {model.columns}</b> tracciato</span><span><b>{c.turns}</b> turni</span><span><b>{c.welfareCost} M</b> per 3 gettoni welfare</span><span><b>{c.repressionBase} M</b> repressione · azzera 1 reparto, +1 agli altri</span><span><b>{c.players}</b> giocatori</span></div>
        {storageError&&<p className="lab-error" role="alert">{storageError}</p>}{invalid&&<p className="lab-error" role="alert">{invalid}</p>}
        {pendingGame&&<Card title="Sostituire la partita salvata?"><p>Iniziando una nuova partita sostituirai il salvataggio precedente.</p><div className="lab-actions"><button onClick={()=>setPendingGame(null)}>Annulla</button><button className="lab-primary" onClick={()=>{setLive({config:pendingGame,resume:null});setPendingGame(null);setMatchError('');}}>Inizia nuova partita</button></div></Card>}
        <div hidden={tab!=='sim'}><Simulation c={c} set={set} locked={locked} setLocked={setLocked} onPlay={humans=>startGame(gameConfig(c,{humans}))}/></div>
        {tab!=='sim'&&<fieldset disabled={locked} className="lab-editor-fieldset">
          {locked&&<p className="lab-callout">Le impostazioni restano ferme durante la prova. Puoi interromperla dalla sezione Simulazione.</p>}
          {tab==='play'&&<>{matchError&&<p className="lab-error" role="alert">{matchError}</p>}{savedGame&&<Card title={savedGame.state.gameOver?'Ultima partita conclusa':'Partita salvata'}><p>Turno {savedGame.state.turn} / {savedGame.state.roundLimit} · {savedGame.state.players[savedGame.state.current].name}{savedGame.state.pending?' · scelta da completare':''}</p><p className="lab-muted">Salvata il {new Date(savedGame.savedAt).toLocaleString('it-IT')}. Riprendi dal punto salvato: il punteggio ora conta solo le commesse.{savedGame.state.rowEconomy?.welfareMode==='tokens'&&<> Welfare: {savedGame.state.rowEconomy.welfareCost} marchi per 3 gettoni.</>}</p>{savedGame.state.rowEconomy?.welfareMode!=='tokens'&&<p className="lab-callout">Partita salvata con le regole precedenti. Per provare i gettoni welfare e la nuova repressione, inizia una nuova partita; riprendendo questa conservi quelle regole di produzione, welfare e repressione.</p>}<button className="lab-primary" onClick={resumeGame}>{savedGame.state.gameOver?'Rivedi risultato':'Riprendi partita'}</button></Card>}<PlaySetup c={c} set={set} invalid={invalid} onStart={startGame}/></>}
          {tab==='board'&&<BoardEditor c={c} set={set}/>}{tab==='economy'&&<EconomyEditor c={c} set={set}/>}{tab==='cards'&&<CardsEditor c={c} set={set}/>}{tab==='contracts'&&<ContractsEditor c={c} set={set}/>}
          {tab==='files'&&<><Card title="Porta con te la configurazione"><p>Il file contiene regole, carte, commesse e impostazioni dell’IA. Puoi archiviarlo e riaprirlo per ripetere la stessa prova.</p><div className="lab-actions"><button className="lab-primary" disabled={!!invalid} onClick={()=>download('officina-configurazione.json',JSON.stringify(c,null,2))}>Scarica configurazione</button><label className="lab-upload">Apri configurazione<input type="file" accept=".json,application/json" onChange={importFile}/></label></div>{message&&<p role="status">{message}</p>}<p className="lab-muted">Questa versione ha un salvataggio separato. Per conservare un report usa i pulsanti sotto i risultati della simulazione.</p></Card>
          <Card title="Riparti dalle impostazioni di prova"><p>4 righe × 4 caselle, una risorsa per riga, 28 turni, 2 giocatori, 15 marchi iniziali. Welfare: 4 marchi per 3 gettoni, spendibili solo nel reparto visitato; puoi curare con più gettoni se non produci. Repressione: costo fisso di 2 marchi, azzera un reparto e aggiunge 1 tensione agli altri due. Punti vittoria solo dalle commesse. Nuova IA d6 r1.</p><button onClick={()=>{if(confirm('Ripristinare tutti gli editor e le impostazioni di prova? Scarica prima la configurazione se vuoi conservarla.')){setC(defaults());setDirty(true);setMessage('Impostazioni di riferimento ripristinate.');}}}>Ripristina impostazioni di riferimento</button></Card></>}
        </fieldset>}
        <footer className="lab-footer">Officina 1907 · Strumento di prova. I risultati dell’IA descrivono le partite simulate, non certificano il bilanciamento.</footer>
      </main>
    </div>
    {live&&version.result.status==='update'&&<div className="version-notice" role="status">Nuova versione disponibile. Torna al laboratorio per aggiornarla dopo il salvataggio.</div>}
    {live&&<LiveGame config={live.config} resume={live.resume} onSaved={setSavedGame} onClose={()=>setLive(null)}/>}
  </>;
}
createRoot(document.getElementById('root')).render(<App/>);
