import React, { useState } from 'react';
import { TRACK_MODELS, SECTORS, NATIONS_NUOVO, activeTrackEnd } from '../game/data.js';
import { rowMachineCard } from '../game/row-economy.js';
import RowProductionTrack from '../components/RowProductionTrack.jsx';
import { MODELS, SIZES, SIZE_NAMES } from './config.js';
export function NumberField({ label, value, onChange, min=0, max=30 }) {
  return <label className="lab-field"><span>{label}</span><input type="number" min={min} max={max} step="1" value={value} onChange={e=>onChange(Math.max(min,Math.min(max,Math.round(Number(e.target.value)||0))))}/></label>;
}
export function SelectField({ label, value, onChange, options }) {
  return <label className="lab-field"><span>{label}</span><select value={value} onChange={e=>onChange(e.target.value)}>{options.map(o=><option key={typeof o==='string'?o:o.value} value={typeof o==='string'?o:o.value}>{typeof o==='string'?o:o.label}</option>)}</select></label>;
}
export function Toggle({label,value,onChange}) {return <label className="lab-toggle"><input type="checkbox" checked={value} onChange={e=>onChange(e.target.checked)}/>{label}</label>;}
export function Card({ title, children, className='' }) {return <section className={`lab-card ${className}`}><h2>{title}</h2>{children}</section>;}
const CELL_LABEL = c => !c ? '—' : [c.res&&`${c.res} ris.`,c.coins&&`${c.coins} M`,c.pv&&`${c.pv} PV`].filter(Boolean).join(' + ')||'—';
export function BoardEditor({c,set}) {
  const [selected,setSelected]=useState(1),[prod,setProd]=useState(9),[tension,setTension]=useState(1);
  const model=TRACK_MODELS[c.trackModel],pos=Math.min(selected,model.max),p=Math.min(prod,model.max),t=Math.min(tension,model.rows);
  const developed=activeTrackEnd(p,0,c.trackModel,true)/model.columns,available=activeTrackEnd(p,t,c.trackModel,true)/model.columns;
  const changeModel=value=>{if(value!==c.trackModel&&confirm('Cambiare formato ripristina i bonus a una risorsa per riga. Continuare?'))set({trackModel:value,track:structuredClone(TRACK_MODELS[value].track)});};
  const cell=c.track[pos];
  const editCell=(key,value)=>{const next={...(cell||{}),[key]:value};for(const k of Object.keys(next))if(!next[k])delete next[k];set({track:c.track.map((x,i)=>i===pos?(Object.keys(next).length?next:null):x)});};
  return <>
    <Card title="Lo sviluppo scende. La tensione sale."><p>Entrare in una riga ne attiva tutti i bonus. La tensione copre una riga dal basso per ogni punto, anche quando quella riga non è ancora sviluppata.</p>
      <SelectField label="Formato della plancia" value={c.trackModel} onChange={changeModel} options={MODELS.map(value=>({value,label:`${TRACK_MODELS[value].rows} righe × ${TRACK_MODELS[value].columns} caselle${value==='righe4corte'?' · ultime prove':''}`}))}/>
      <div className="lab-board-layout"><div><RowProductionTrack model={c.trackModel} prod={p} tension={t} wholeRows selected={pos} renderCell={i=>CELL_LABEL(c.track[i])} onCellClick={setSelected} onTensionChange={setTension}/></div>
      <div><h3>Anteprima interattiva</h3><p className="lab-muted">I segnalini qui sotto servono solo per provare il tracciato.</p>
        <label className="lab-field"><span>Sviluppo: {p}/{model.max}</span><input aria-label="Anteprima sviluppo" type="range" min="0" max={model.max} value={p} onChange={e=>setProd(+e.target.value)}/></label>
        <label className="lab-field"><span>Tensione: {t}/{model.rows}</span><input aria-label="Anteprima tensione" type="range" min="0" max={model.rows} value={t} onChange={e=>setTension(+e.target.value)}/></label>
        <div className="lab-callout" role="status"><strong>{available} {available===1?'riga utilizzabile':'righe utilizzabili'}</strong><br/>{developed} sviluppate · {developed-available} bloccate</div>
        <h3>Casella {pos}</h3><div className="lab-fields"><NumberField label="Risorse del reparto" value={cell?.res||0} onChange={v=>editCell('res',v)} max={20}/><NumberField label="Marchi" value={cell?.coins||0} onChange={v=>editCell('coins',v)} max={20}/><NumberField label="Soglia PV finali" value={cell?.pv||0} onChange={v=>editCell('pv',v)} max={20}/></div>
        <p className="lab-muted">Template condiviso dai tre reparti. Risorse e marchi sono rendimenti; i PV sono una soglia acquisita con lo sviluppo.</p>
      </div></div>
    </Card>
    <Card title="Spazio per gli investimenti"><div className="lab-fields">{SECTORS.map((s,i)=><NumberField key={s} label={`Macchinari · ${s}`} value={c.machineSlots[i]} max={10} onChange={v=>set({machineSlots:c.machineSlots.map((n,j)=>i===j?v:n)})}/>)}</div><p className="lab-muted">Assunzioni degli operai e acquisti welfare senza limite. Ogni operaio sviluppa il reparto del proprio valore stampato.</p></Card>
  </>;
}
export function EconomyEditor({c,set}) {
  return <><div className="lab-two">
    <Card title="Welfare"><NumberField label="Costo di 3 gettoni welfare" value={c.welfareCost} onChange={v=>set({welfareCost:v})}/><p>Ogni investimento dà <b>3 gettoni</b>, disponibili dal tuo turno successivo. Puoi spenderli solo nel reparto in cui ti trovi:</p><ul><li>Durante una produzione, spendi <b>1 gettone</b> per impedire l’aumento di tensione: produci tutte le righe accessibili e attivi i macchinari.</li><li>Se non produci, spendi <b>uno o più gettoni</b> per abbassare la tensione di uno per gettone, fino a zero. Puoi farlo dopo un acquisto oppure rinunciando all’azione.</li></ul><p>I gettoni non scontano le assunzioni e l’acquisto welfare non abbassa subito la tensione. Puoi comprare altri pacchetti senza limite.</p></Card>
    <Card title="Repressione"><NumberField label="Costo fisso di ogni intervento" value={c.repressionBase} onChange={v=>set({repressionBase:v})}/><p>Azzera la tensione di <b>un reparto</b> e aumenta di <b>1</b> la tensione di ciascuno degli altri due, fino al massimo del tracciato.</p><div className="lab-callout">Ogni intervento costa {c.repressionBase} marchi. Nessun rincaro.</div><p>L’acquisto welfare e la repressione consumano l’azione del turno. Spendere un gettone non richiede un’azione aggiuntiva.</p></Card>
    </div><Card title="Economia della partita"><div className="lab-fields"><NumberField label="Marchi all’uscita dalla Città" value={c.cityIncome} max={20} onChange={v=>set({cityIncome:v})}/><NumberField label="Marchi per 1 PV finale" value={c.conversions.coinsPerPV} min={1} max={100} onChange={v=>set({conversions:{...c.conversions,coinsPerPV:v}})}/><NumberField label="Risorse per 1 PV finale" value={c.conversions.resPerPV} min={1} max={100} onChange={v=>set({conversions:{...c.conversions,resPerPV:v}})}/></div><p>I macchinari danno rendite fisse in marchi o convertono risorse, una volta per attivazione. Non moltiplicano per gli operai e non sono coperti dalla tensione.</p></Card></>;
}
function Factor({label,f,set}) {return <div className="lab-factor"><NumberField label={`${label} · quantità`} value={f.q} max={20} onChange={q=>set({...f,q})}/><SelectField label={`${label} · tipo`} value={f.tipo==='moneta'?'moneta':f.settore||'scelta'} options={[{value:'moneta',label:'Marchi'},{value:'scelta',label:'Risorsa a scelta'},...SECTORS]} onChange={value=>set(value==='moneta'?{q:f.q,tipo:'moneta'}:{q:f.q,tipo:'risorsa',settore:value})}/></div>;}
export function CardsEditor({c,set}) {
  const [filter,setFilter]=useState('Tutti');
  const update=(i,patch)=>set({workers:c.workers.map((w,j)=>i===j?{...w,...patch}:w)});
  const rows=c.workers.map((w,i)=>({w,i})).filter(({w})=>filter==='Tutti'||w.deck===filter);
  const copy=w=>set({workers:[...c.workers,{...structuredClone(w),id:`lab-${Date.now()}-${Math.random().toString(36).slice(2,7)}`}]});
  return <Card title="Operai e macchinari">
    <p>Sopra: sviluppo pari al valore stampato. Sotto: rendita fissa o conversione, attivata insieme al reparto. Il costo della carta è lo stesso sui due lati.</p>
    <SelectField label="Filtra per mazzetto" value={filter} onChange={setFilter} options={['Tutti','A','B','C','D','E']}/>
    <p className="lab-muted">{rows.length} carte mostrate · {c.workers.length} nel mazzo. Modifiche salvate automaticamente.</p>
    <div className="lab-card-list">{rows.map(({w,i})=>{const effect=rowMachineCard(w,{machineCash:true}).effect;return <article className="lab-worker" key={w.id}>
      <div className="lab-worker-head"><strong>{w.nation} · {w.sector}</strong><span>{w.id}</span></div>
      <div className="lab-fields"><SelectField label="Nazionalità" value={w.nation} options={NATIONS_NUOVO} onChange={nation=>update(i,{nation})}/><NumberField label="Valore / prezzo" value={w.v} min={1} max={10} onChange={v=>update(i,{v})}/>
      <><SelectField label="Reparto" value={w.sector} options={SECTORS} onChange={sector=>update(i,{sector})}/><SelectField label="Mazzetto" value={w.deck} options={['A','B','C','D','E']} onChange={deck=>update(i,{deck})}/></>
      </div>
      <SelectField label="Effetto del macchinario" value={effect.verbo} options={[{value:'prendi',label:'Rendita fissa in marchi'},{value:'scambia',label:'Conversione'}]} onChange={verbo=>update(i,{effect:verbo==='prendi'?{verbo,f1:{q:1,tipo:'moneta'}}:{verbo,f1:{q:1,tipo:'risorsa',settore:'scelta'},f2:{q:1,tipo:'risorsa',settore:'scelta'}}})}/>
      {effect.verbo==='prendi'?<NumberField label="Marchi a ogni attivazione" value={effect.f1.q} max={20} onChange={q=>update(i,{effect:{verbo:'prendi',f1:{q,tipo:'moneta'}}})}/>:<div className="lab-fields"><Factor label="Cedi" f={effect.f1} set={f1=>update(i,{effect:{...effect,f1}})}/><Factor label="Ricevi" f={effect.f2} set={f2=>update(i,{effect:{...effect,f2}})}/></div>}
      <div className="lab-actions"><button onClick={()=>copy(w)} disabled={c.workers.length>=200}>Duplica carta</button><button onClick={()=>{if(confirm('Eliminare questa copia dal mazzo?'))set({workers:c.workers.filter((_,j)=>i!==j)});}} disabled={c.workers.length<=1}>Elimina copia</button></div>
    </article>})}</div>
  </Card>;
}
export function ContractsEditor({c,set}) {
  const [size,setSize]=useState('small');
  const update=(i,patch)=>set({contracts:{...c.contracts,[size]:c.contracts[size].map((x,j)=>i===j?{...x,...patch}:x)}});
  const raceSet=patch=>set({race:{...c.race,...patch}});
  return <><Card title="Commesse: risorse, punti e marchi"><div className="lab-fields"><SelectField label="Taglia" value={size} options={SIZES.map(value=>({value,label:SIZE_NAMES[value]}))} onChange={setSize}/><NumberField label="Marchi alla consegna" value={c.contractCoins[size]} onChange={v=>set({contractCoins:{...c.contractCoins,[size]:v}})}/><NumberField label="Carte visibili per taglia" value={c.contractMarket} min={1} max={3} onChange={v=>set({contractMarket:v})}/></div>
    <div className="lab-fields">{[2,3,4].map(n=><NumberField key={n} label={`Carte ${SIZE_NAMES[size].toLowerCase()} con ${n} giocatori`} value={c.contractCount[n][size]} min={c.contractMarket} max={c.contracts[size].length} onChange={v=>set({contractCount:{...c.contractCount,[n]:{...c.contractCount[n],[size]:v}}})}/>)}</div><Toggle label="Consenti ricambio delle commesse in Città" value={c.cityRefresh} onChange={v=>set({cityRefresh:v})}/>
    <p className="lab-muted">Una sola consegna per carta. I premi in marchi dipendono dalla taglia; i punti e le risorse richieste sono modificabili per ogni copia.</p>
    <div className="lab-card-list">{c.contracts[size].map((card,i)=><article className="lab-worker" key={card.id}><div className="lab-worker-head"><strong>{SIZE_NAMES[size]} · {i+1}</strong><span>{card.id}</span></div><NumberField label="Punti vittoria" value={card.pv[0]} max={100} onChange={v=>update(i,{pv:[v,card.pv[1]]})}/>{card.reqs.map((req,ri)=><div className="lab-fields" key={ri}>{SECTORS.map(s=><NumberField key={s} label={`${card.reqs.length>1?`Variante ${ri+1} · `:''}${s}`} value={req.filter(v=>v===s).length} max={12} onChange={v=>update(i,{reqs:card.reqs.map((r,j)=>j===ri?[...req.filter(v=>v!==s),...Array(v).fill(s)]:r)})}/>)}</div>)}</article>)}</div>
  </Card><Card title="Obiettivi di gara"><Toggle label="Obiettivi di gara attivi" value={c.race.enabled} onChange={enabled=>raceSet({enabled})}/><div className="lab-fields">{c.race.podium.map((v,i)=><NumberField key={i} label={`${i+1}° posto · PV`} value={v} onChange={v=>raceSet({podium:c.race.podium.map((n,j)=>i===j?v:n)})}/>)}</div>
    {c.race.list.map((r,i)=><div className="lab-race" key={r.id}><Toggle label={['Operai della stessa nazionalità','Nazionalità diverse fra gli operai','Operai in ciascuno dei tre reparti'][i]} value={r.enabled} onChange={enabled=>raceSet({list:c.race.list.map((x,j)=>i===j?{...x,enabled}:x)})}/><NumberField label="Quantità richiesta" value={r.n} min={1} max={12} onChange={n=>raceSet({list:c.race.list.map((x,j)=>i===j?{...x,n}:x)})}/></div>)}
  </Card></>;
}
