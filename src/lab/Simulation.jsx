import React, { useEffect, useRef, useState } from 'react';
import LabWorker from './worker.js?worker&inline';
import { AI_NAMES, gameConfig, download, validate } from './config.js';
import { summarize, textReport } from './run.js';
import { Card, NumberField, SelectField } from './Editors.jsx';
const fmt=n=>n.toLocaleString('it-IT',{maximumFractionDigits:2});
const duration=ms=>`${Math.floor(ms/60000)}m ${Math.floor(ms/1000)%60}s`;
function Distribution({title,rows}) {return <div><h3>{title}</h3><table><thead><tr><th>Numero</th><th>Giocatori-partita</th></tr></thead><tbody>{rows.map(r=><tr key={r.count}><td>{r.count}</td><td>{r.players}</td></tr>)}</tbody></table></div>;}
export default function Simulation({c,set,locked,setLocked,onPlay}) {
  const [run,setRun]=useState(null),[error,setError]=useState(''),[humans,setHumans]=useState(1),[now,setNow]=useState(Date.now());
  const active=useRef(null);
  useEffect(()=>()=>{active.current?.workers.forEach(w=>w.terminate());},[]);
  useEffect(()=>{if(!locked)return;const t=setInterval(()=>setNow(Date.now()),1000);return()=>clearInterval(t);},[locked]);
  const simSet=patch=>set({simulation:{...c.simulation,...patch}});
  const publish=a=>setRun({config:a.config,games:[...a.games].sort((x,y)=>x.seed-y.seed),progress:{...a.progress},started:a.started,ended:a.ended,status:a.status});
  const stop=(status='Interrotta')=>{const a=active.current;if(!a)return;a.workers.forEach(w=>w.terminate());a.status=status;a.ended=Date.now();a.progress={};publish(a);active.current=null;setLocked(false);};
  const start=()=>{
    try{validate(c);}catch(e){setError(e.message);return;}
    setError('');setLocked(true);setNow(Date.now());
    const a={config:structuredClone(c),games:[],progress:{},workers:[],next:0,started:Date.now(),status:'In corso'};active.current=a;publish(a);
    const fail=message=>{if(active.current!==a)return;setError(message);stop('Errore');};
    const schedule=w=>{
      if(active.current!==a)return;
      if(a.next>=a.config.simulation.games){
        w.terminate();if(a.games.length===a.config.simulation.games)stop('Completata');return;
      }
      const index=a.next++;a.progress[index]={turn:1,seat:0};publish(a);
      w.postMessage({type:'run',index,config:gameConfig(a.config,{seed:a.config.simulation.seed+index})});
    };
    try{
      // Each worker runs one game at a time: the engine's card registry is process-local.
      for(let i=0;i<Math.min(2,c.simulation.games,navigator.hardwareConcurrency||2);i++){
        const w=new LabWorker();a.workers.push(w);
        w.onerror=e=>fail(e.message||'Impossibile avviare il calcolo.');
        w.onmessage=({data})=>{
          if(active.current!==a)return;
          if(data.type==='error')return fail(data.message);
          if(data.type==='progress'){a.progress[data.index]={turn:data.turn,seat:data.seat};publish(a);}
          if(data.type==='game'){a.games.push(data.game);delete a.progress[data.index];publish(a);schedule(w);}
        };
        schedule(w);
      }
    }catch(e){fail(e.message);}
  };
  const summary=run?.games.length?summarize(run.games):null;
  const tokens=run?.config.rulesRevision===2;
  return <>
    <Card title="La prossima prova"><fieldset disabled={locked}><div className="lab-fields">
      <label className="lab-field"><span>Nome della prova</span><input value={c.name} maxLength={100} onChange={e=>set({name:e.target.value})}/></label>
      <NumberField label="Giocatori" min={2} max={4} value={c.players} onChange={v=>set({players:v})}/>
      <NumberField label="Turni per giocatore" min={1} max={60} value={c.turns} onChange={v=>set({turns:v})}/>
      <NumberField label="Partite da simulare" min={1} max={100} value={c.simulation.games} onChange={games=>simSet({games})}/>
    </div><div className="lab-fields">{c.startingCoins.slice(0,c.players).map((n,i)=><NumberField key={i} label={`Marchi iniziali · posto ${i+1}`} value={n} max={100} onChange={v=>set({startingCoins:c.startingCoins.map((x,j)=>i===j?v:x)})}/>)}</div>
    <div className="lab-fields"><SelectField label="Intelligenza artificiale" value={c.simulation.ai} options={Object.entries(AI_NAMES).map(([value,label])=>({value,label}))} onChange={ai=>simSet({ai})}/><NumberField label="Seme iniziale" value={c.simulation.seed} max={2147483547} onChange={seed=>simSet({seed})}/></div>
    <p className="lab-muted">Il seme identifica la distribuzione iniziale. Le partite successive usano semi consecutivi: stessi semi e stesse impostazioni rendono ripetibile il confronto.</p>
    {c.simulation.ai!=='greedy'&&<details><summary>Profondità di ricerca · d{c.simulation.depth} r{c.simulation.rollouts}</summary><div className="lab-fields"><NumberField label="Profondità (d)" value={c.simulation.depth} min={1} max={12} onChange={depth=>simSet({depth})}/><NumberField label="Rollout per scelta (r)" value={c.simulation.rollouts} min={1} max={5} onChange={rollouts=>simSet({rollouts})}/></div></details>}
    <p className="lab-muted">La nuova IA d6 richiede diversi minuti per partita. Nessun acquisto di welfare viene imposto e i pesi di valutazione restano quelli delle prove.</p>
    {c.rulesRevision===2&&<p className="lab-muted">La nuova IA confronta l’uso immediato dei gettoni con il rinvio ai turni successivi, senza bonus al welfare. La ricerca è limitata alla profondità scelta.</p>}
    </fieldset><div className="lab-actions"><button className="lab-primary" disabled={locked} onClick={start}>Avvia {c.simulation.games} {c.simulation.games===1?'partita':'partite'}</button>{locked&&<button onClick={()=>stop()}>Ferma e conserva le partite finite</button>}</div>
    {error&&<p className="lab-error" role="alert">{error}</p>}
    </Card>
    {run&&<Card title={`${run.status} · ${run.config.name}`}><div className="lab-run-head"><span><strong>{run.games.length}/{run.config.simulation.games}</strong> partite complete</span><span>{duration((run.ended||now)-run.started)}</span></div>
      <progress value={run.games.length} max={run.config.simulation.games}/><div aria-live="polite">{Object.entries(run.progress).map(([i,p])=><p key={i}>Partita {Number(i)+1} · seme {run.config.simulation.seed+Number(i)} · turno {p.turn}/{run.config.turns} · giocatore {p.seat+1}</p>)}</div>
      <p className="lab-muted">{run.config.players} giocatori · welfare {run.config.welfareCost} M · {AI_NAMES[run.config.simulation.ai]}{run.config.simulation.ai!=='greedy'?` · d${run.config.simulation.depth} r${run.config.simulation.rollouts}`:''}</p>
      {summary&&<><div className="lab-metrics">{[['PV medi',summary.pv],['Acquisti welfare / giocatore',summary.welfare],['Repressioni / giocatore',summary.repression],[tokens?'Produzioni protette / giocatore':'Produzioni sostenibili / giocatore',tokens?summary.protected:summary.sustainable]].map(([label,value])=><div key={label}><strong>{fmt(value)}</strong><span>{label}</span></div>)}</div>
      <p>Produzioni con righe sviluppate bloccate: <b>{summary.blocked}/{summary.productions}</b>. Righe perse nella modalità scelta: <b>{summary.lostRows}/{summary.potentialRows}</b>.</p>
      <p className="lab-muted">Medie su {summary.players} giocatori-partita completati. {tokens?'La produzione protetta usa tutte le righe accessibili e consuma un gettone.':'Le righe accessibili a cui si rinuncia scegliendo la produzione sostenibile non sono conteggiate come bloccate.'}</p>
      <div className="lab-two"><Distribution title="Welfare acquistati" rows={summary.welfareHistogram}/><Distribution title="Repressioni utilizzate" rows={summary.repressionHistogram}/></div>
      {tokens?<p>Recuperi con gettoni: <b>{fmt(summary.welfareRecoveries)}</b> per giocatore. Gettoni rimasti a fine partita: <b>{fmt(summary.tokensRemaining)}</b> per giocatore.</p>:<><h3>I benefici aggiuntivi vengono usati?</h3><div className="lab-table-scroll"><table><thead><tr><th>Welfare</th><th>Acquirenti</th><th>Produzioni che usano questa riga</th><th>Assunzioni che usano questo sconto</th></tr></thead><tbody>{summary.ordinalUses.filter(x=>x.n<=3||x.owners).map(x=><tr key={x.n}><td>{x.n}°</td><td>{x.owners}</td><td>{x.rows}</td><td>{x.hires}</td></tr>)}</tbody></table></div></>}
      <p className="lab-muted">Sono utilizzi osservati: non dimostrano da soli che l’investimento abbia ripagato costo e turno.</p>
      <details><summary>Risultati per partita e giocatore</summary><div className="lab-table-scroll"><table><thead><tr><th>Seme</th><th>Giocatore</th><th>PV</th><th>Welfare</th><th>Repressioni</th><th>Commesse</th><th>Marchi finali</th></tr></thead><tbody>{run.games.flatMap(g=>g.people.map(p=><tr key={`${g.seed}-${p.playerId}`}><td>{g.seed}</td><td>{p.name}</td><td>{p.total}</td><td>{p.stats.welfareBuys}</td><td>{p.stats.repressions}</td><td>{p.nContracts}</td><td>{p.coins}</td></tr>))}</tbody></table></div></details>
      <div className="lab-actions"><button onClick={()=>download('officina-risultati.txt',textReport(run.config,run.games,run.status),'text/plain')}>Scarica report leggibile</button><button onClick={()=>download('officina-dati-partite.json',JSON.stringify({schema:'officina-lab-results-1',...run},null,2))}>Scarica dati e mosse</button><button onClick={()=>download('officina-config-prova.json',JSON.stringify(run.config,null,2))}>Scarica configurazione della prova</button></div></>}
    </Card>}
    <Card title="Prova una partita al tavolo"><p>Gioca tu, oppure osserva le IA. Usa le stesse regole e la stessa IA selezionate sopra.</p><div className="lab-fields"><NumberField label="Giocatori umani (i primi posti)" value={Math.min(humans,c.players)} max={c.players} onChange={setHumans}/></div><button disabled={locked} onClick={()=>{try{validate(c);onPlay(Math.min(humans,c.players));setError('');}catch(e){setError(e.message);}}}>Apri il tavolo</button></Card>
  </>;
}
