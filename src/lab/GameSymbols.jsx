import React from 'react';
import { Amount } from '../components/Amount.jsx';
import { machineText } from './cards.js';

export { Amount };
export function WorkerSymbol(){return <svg className="function-icon" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="4" fill="currentColor"/><path d="M5 23v-8a7 7 0 0 1 14 0v8h-5v-8h-4v8Z" fill="currentColor"/></svg>;}
export function Development({value}) {
  return <span className="symbol-effect" role="img" aria-label={`Sopra: operaio, sviluppo +${value}`} title={`Sopra: operaio, sviluppo +${value}`}><WorkerSymbol/><b>+{value}</b></span>;
}
function Factor({factor,worker}) {
  return <Amount kind={factor.tipo==='moneta'?'coin':factor.settore==='scelta'?'choice':factor.settore==='carta'?worker.sector:factor.settore} value={factor.q}/>;
}
export function MachineEffect({worker}) {
  const e=worker.effect;
  if(e.continuity)return <span className="symbol-effect" role="img" aria-label={`Sotto: macchinario, ${machineText(worker)}`} title={machineText(worker)}><span className="function-icon" aria-hidden="true">⚙</span><Amount kind="coin" value="R" label={machineText(worker)}/><small>righe libere</small></span>;
  if(e.verbo==='perOgni'&&e.f2?.conta==='tensione')return <span className="symbol-effect" role="img" aria-label={`Sotto: macchinario, ${machineText(worker)}`} title={`Sotto: macchinario, ${machineText(worker)}`}><span className="function-icon" aria-hidden="true">⚙</span><Amount kind="coin" value={e.tensionRewards?'C(T)':e.f1.q===1?'T':`${e.f1.q}T`} label={machineText(worker)}/></span>;
  return <span className="symbol-effect" role="img" aria-label={`Sotto: macchinario, ${machineText(worker)}`} title={`Sotto: macchinario, ${machineText(worker)}`}><span className="function-icon" aria-hidden="true">⚙</span>{e.verbo!=='scambia'&&<span aria-hidden="true">+</span>}<Factor factor={e.f1} worker={worker}/>{e.verbo==='scambia'&&<><span aria-hidden="true">→</span><Factor factor={e.f2} worker={worker}/></>}</span>;
}
export function SymbolKey(){return <details className="symbol-key"><summary>Simboli</summary><div><span><Amount kind="coin" value={3}/> 3 marchi</span><span><Amount kind="pv" value={5}/> 5 punti vittoria</span><span><Amount kind="Tessuti" value={2}/> 2 tessuti</span><span><Amount kind="Acciaio" value={2}/> 2 acciaio</span><span><Amount kind="Coloranti" value={2}/> 2 coloranti</span><span><Amount kind="choice" value={1}/> 1 risorsa a scelta</span><span><Development value={3}/> Operaio sopra: sviluppo +3</span><span>⚙ Macchinario sotto</span><span><Amount kind="coin" value="T" label="Marchi pari alla tensione prima della produzione"/> Tensione prima della produzione</span><span>→ Converti quanto precede in quanto segue</span></div></details>;}
