import React from 'react';
import {Card,NumberField,Toggle} from './Editors.jsx';

export default function RoundsEditor({c,set}) {
  const bounds=c.roundRondel.bounds;
  const update=(turns,ends)=>set({turns,roundRondel:{...c.roundRondel,bounds:ends,firstSeats:ends.map((_,i)=>i%c.players)}});
  const toggle=turn=>update(c.turns,bounds.includes(turn)?bounds.filter(end=>end!==turn):[...bounds,turn].sort((a,b)=>a-b));
  const ends=[...bounds,c.turns];
  return <Card title="Durata e round">
    <NumberField label="Turni totali della partita" value={c.turns} min={1} max={60} onChange={turns=>update(turns,bounds.filter(end=>end<turns))}/>
    <p>Seleziona i turni alla cui fine scegliere la rondella. Premi di nuovo una scadenza per rimuoverla. Il turno finale conclude la partita.</p>
    <div className="rounds-calendar" role="group" aria-label="Scadenze della rondella">
      {Array.from({length:c.turns},(_,i)=>i+1).map(turn=><button key={turn} type="button" disabled={turn===c.turns} aria-pressed={bounds.includes(turn)} onClick={()=>toggle(turn)} aria-label={`Turno ${turn}${turn===c.turns?' · Fine partita':''}`}>{turn}<small>{turn===c.turns?'Fine':bounds.includes(turn)?'↻':''}</small></button>)}
    </div>
    <p><b>{ends.length} periodi</b> · {bounds.length} scelte della rondella per giocatore.</p>
    <ol className="rounds-summary">{ends.map((end,i)=><li key={end}>Turni {(ends[i-1]||0)+1}–{end}: {i===ends.length-1?'fine partita':`rondella · sceglie per primo il giocatore ${c.roundRondel.firstSeats[i]+1}`}</li>)}</ol>
    <h3>Cosa succede a fine round</h3>
    <Toggle label="Ricambio dei mazzi operai" value={c.roundRondel.refreshWorkers===true} onChange={refreshWorkers=>set({roundRondel:{...c.roundRondel,refreshWorkers}})}/>
    <p>Alle scadenze selezionate, prima della scelta della rondella, la prima carta di ogni mazzo operai va in fondo allo stesso mazzo. Il ricambio non si può più fare in Città e non avviene dopo la fine della partita.</p>
    <p className="lab-muted">Le impostazioni valgono per le nuove partite e le simulazioni. Le partite già salvate mantengono il proprio calendario. Accorciando la partita, le scadenze fuori calendario vengono rimosse.</p>
  </Card>;
}
