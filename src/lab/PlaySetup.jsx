import ResourceIcon from './ResourceIcon.jsx';
import React, { useState } from 'react';
import { Card, NumberField, SelectField } from './Editors.jsx';
import { playableConfig } from './config.js';
import latestPlaytest from './latest-playtest.json';

export default function PlaySetup({ c, set, onStart, invalid }) {
  const [humans, setHumans] = useState(1), [pace, setPace] = useState('rapid');
  return <>
    <Card title="Ultima versione testata · rondella gratuita">
      <p>3 giocatori · 28 turni · cinque righe. Primo ingresso libero dopo il turno 9; dopo il turno 18 resti o avanzi fino a tre passi, gratis. Nessuna carta premio.</p>
      <p>Continuità per ogni riga raggiunta e libera, macchinari bloccati senza righe libere, tensione ×3 e 10 marchi finali = 1 PV. I gettoni si comprano al Welfare.</p>
      <button className="lab-primary" onClick={()=>{const preset=structuredClone(latestPlaytest);set(preset);onStart(playableConfig(preset,Math.min(humans,3),pace));}}>Gioca l’ultima versione testata →</button>
      <p className="lab-muted">Usa il numero di giocatori umani e la velocità IA scelti qui sotto. Puoi poi modificare gli editor per una partita personalizzata.</p>
    </Card>
    <Card title="Prendi in mano la tua fabbrica" className="play-intro">
      <p>Assumi, produci e consegna commesse. Guarda lo sviluppo salire e la tensione coprire le righe: ogni scelta si vede subito sulla tua plancia.</p>
      <div className="lab-fields">
        <SelectField label="Giocatori al tavolo" value={c.players} onChange={v=>set({players:+v})} options={[2,3,4].map(value=>({value,label:String(value)}))}/>
        <SelectField label="Giocatori umani" value={Math.min(humans,c.players)} onChange={v=>setHumans(+v)} options={Array.from({length:c.players},(_,i)=>({value:i+1,label:i===0?'Solo io':`${i+1} · sullo stesso schermo`}))}/>
        <NumberField label="Turni per giocatore" value={c.turns} min={1} max={60} onChange={turns=>set({turns})}/>
      </div>
      {Math.min(humans,c.players)<c.players&&<SelectField label="Avversario IA" value={pace} onChange={setPace} options={[{value:'rapid',label:'Rapido · nuova IA d2 r1'},{value:'study',label:'Approfondito · nuova IA d6 r1, come nelle ultime prove'}]}/>}
      <p className="lab-muted">La modalità rapida riduce l’attesa, ma valuta meno in profondità. Cambia solo il tempo di riflessione dell’IA: le regole e le impostazioni delle simulazioni restano uguali.</p>
      <button className="lab-primary play-start" disabled={!!invalid} onClick={()=>onStart(playableConfig(c,Math.min(humans,c.players),pace))}>Inizia la partita →</button>
      <p className="lab-muted">Usa la configurazione mostrata qui sopra e negli editor. Ogni nuova partita usa un seme casuale, conservato nel salvataggio. La partita si salva automaticamente dopo ogni mossa in questo browser. Dopo una ricarica premi Riprendi partita. Si conservano anche le ultime 10 mosse annullabili.</p>
    </Card>
    <div className="lab-two">
      <Card title="Come giocare"><ol><li><b>Spostati</b> in un nodo diverso: vedi prima il costo e le carte disponibili.</li><li><b>Scegli un’azione</b>: assumi, installa un macchinario, produci oppure investi. Poi passa il turno.</li><li><b>Quando vai in Città</b>, puoi consegnare una sola commessa: incassi punti e marchi e il turno termina. Puoi anche scegliere l’incasso alternativo senza consegnare.</li></ol><p>{c.finalCoinPV?`Ai punti delle commesse si aggiunge 1 PV ogni ${c.finalCoinsPerPV||10} marchi finali, arrotondando per difetto.`:'I punti vittoria vengono solo dalle commesse.'} A parità di punti contano i marchi rimasti, poi il numero di commesse completate.</p></Card>
      <Card title="Cosa osservare"><p>Il verde indica le righe sviluppate. Le righe tratteggiate sono bloccate dalla tensione.</p><p>Produci tutte le righe accessibili e attivi i macchinari, poi la tensione sale di 1. Un gettone welfare impedisce questo aumento. Se non produci, puoi spendere più gettoni per curare il reparto in cui sei: −1 tensione per gettone, anche dopo un acquisto.</p><p>{c.roundRondel?.startingPolicy==='affinity'?'Tutti partono su Affinità: −1 marco fisso per assumere una nazionalità già presente nel reparto. Dopo i turni 9 e 18 devi avanzare: 1–3 passi gratis, poi 1 marco per passo aggiuntivo, fino a 6. Il bonus precedente viene sostituito. Al Welfare compri 1–3 gettoni a 1 marco ciascuno; i gettoni':c.roundRondel?.enabled?'La rondella si sceglie gratuitamente dopo i turni 9 e 18: primo ingresso libero, poi massimo 3 passi. Al Welfare compri 1–3 gettoni a 1 marco ciascuno; i gettoni':c.welfareRondel?'La rondella Welfare costa 1 marco per passo e dà un gettone per passo, da 1 a 3, più il bonus personale della destinazione. Tutti partono prima di Cooperazione: Formazione richiede almeno due visite. I gettoni':<>Il welfare costa {c.welfareCost} marchi per 3 gettoni:</>} si usano dal tuo turno successivo e solo nel reparto in cui ti trovi. {c.welfareBank?'La repressione è gratuita e ruba dalla banca Welfare 1 marco per livello eliminato, fino ai fondi disponibili. Ogni marco speso al Welfare alimenta la banca comune.':'La repressione costa sempre '+c.repressionBase+' marchi:'} azzera un reparto e aumenta di 1 gli altri due, fino al massimo del tracciato.</p><p className="lab-muted">Risorse: <ResourceIcon resource="Tessuti" decorative/> tessuti · <ResourceIcon resource="Acciaio" decorative/> acciaio · <ResourceIcon resource="Coloranti" decorative/> coloranti. M = marchi.</p></Card>
    </div>
  </>;
}
