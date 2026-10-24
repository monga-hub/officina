import ResourceIcon from './ResourceIcon.jsx';
import React, { useState } from 'react';
import { Card, NumberField, SelectField } from './Editors.jsx';
import { playableConfig } from './config.js';

export default function PlaySetup({ c, set, onStart, invalid }) {
  const [humans, setHumans] = useState(1), [pace, setPace] = useState('rapid');
  return <>
    <Card title="Prendi in mano la tua fabbrica" className="play-intro">
      <p>Assumi, produci e consegna commesse. Guarda lo sviluppo scendere e la tensione salire: ogni scelta si vede subito sulla tua plancia.</p>
      <div className="lab-fields">
        <SelectField label="Giocatori al tavolo" value={c.players} onChange={v=>set({players:+v})} options={[2,3,4].map(value=>({value,label:String(value)}))}/>
        <SelectField label="Giocatori umani" value={Math.min(humans,c.players)} onChange={v=>setHumans(+v)} options={Array.from({length:c.players},(_,i)=>({value:i+1,label:i===0?'Solo io':`${i+1} · sullo stesso schermo`}))}/>
        <NumberField label="Turni per giocatore" value={c.turns} min={1} max={60} onChange={turns=>set({turns})}/>
      </div>
      {Math.min(humans,c.players)<c.players&&<SelectField label="Avversario IA" value={pace} onChange={setPace} options={[{value:'rapid',label:'Rapido · nuova IA d2 r1'},{value:'study',label:'Approfondito · nuova IA d6 r1, come nelle ultime prove'}]}/>}
      <p className="lab-muted">La modalità rapida riduce l’attesa, ma valuta meno in profondità. Cambia solo il tempo di riflessione dell’IA: le regole e le impostazioni delle simulazioni restano uguali.</p>
      <button className="lab-primary play-start" disabled={!!invalid} onClick={()=>onStart(playableConfig(c,Math.min(humans,c.players),pace))}>Inizia la partita →</button>
      <p className="lab-muted">Usa la configurazione mostrata qui sopra e negli editor. La partita si salva automaticamente dopo ogni mossa in questo browser. Dopo una ricarica premi Riprendi partita. Si conservano anche le ultime 10 mosse annullabili.</p>
    </Card>
    <div className="lab-two">
      <Card title="Come giocare"><ol><li><b>Spostati</b> in un nodo diverso: vedi prima il costo e le carte disponibili.</li><li><b>Scegli un’azione</b>: assumi, installa un macchinario, produci oppure investi. Poi passa il turno.</li><li><b>Quando vai in Città</b>, puoi consegnare una sola commessa: incassi il premio e il turno termina. Puoi rivendicare gli obiettivi prima della consegna oppure scegliere l’incasso alternativo senza consegnare.</li></ol></Card>
      <Card title="Cosa osservare"><p>Il verde indica le righe sviluppate. Le righe tratteggiate sono bloccate dalla tensione.</p><p>Produci tutte le righe accessibili e attivi i macchinari, poi la tensione sale di 1. Un gettone welfare impedisce questo aumento. Se non produci, puoi spendere più gettoni per curare il reparto in cui sei: −1 tensione per gettone, anche dopo un acquisto.</p><p>Il welfare costa {c.welfareCost} marchi per 3 gettoni: si usano dal tuo turno successivo e solo nel reparto in cui ti trovi. La repressione costa sempre {c.repressionBase} marchi: azzera un reparto e aumenta di 1 gli altri due, fino al massimo del tracciato.</p><p className="lab-muted">Risorse: <ResourceIcon resource="Tessuti" decorative/> tessuti · <ResourceIcon resource="Acciaio" decorative/> acciaio · <ResourceIcon resource="Coloranti" decorative/> coloranti. M = marchi.</p></Card>
    </div>
  </>;
}
