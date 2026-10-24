import React from 'react';
import { normalizeRowEconomy } from '../game/row-economy.js';

export default function RowEconomyEditor({ value, onChange }) {
  const v = normalizeRowEconomy(value);
  const number = (label, key) => <label key={key} style={{ display: 'block', margin: 8 }}>{label} <input type="number" min="0" max="30" value={v[key]} onChange={e => onChange({ ...v, [key]: Number(e.target.value) })} /></label>;
  return <div className="track-editor">
    <h3>Welfare 1 e repressione — prova ottobre</h3>
    <label><input type="checkbox" checked={v.enabled} onChange={e => onChange({ ...v, enabled: e.target.checked })} /> Attiva la variante sul tracciato a righe</label>
    <p>Entrare in una riga ne sblocca tutti i bonus produttivi. Assumere avanza del valore stampato; nessun limite agli operai Sopra. La tensione copre le righe dal basso.</p>
    <p>Welfare sostituisce Fabbriche. Ogni welfare permette di produrre una riga accessibile: due welfare fino a due righe, tre fino a tre. Dopo la produzione sostenibile la tensione del reparto scende di 1. Produzione intensa: tutte le righe accessibili, poi +1 tensione. I macchinari si attivano una volta in entrambi i casi.</p>
    <p>Repressione sostituisce Sindacato: −2 tensione in un reparto, con prezzo crescente per ogni intervento del giocatore. Ogni investimento o intervento conclude il turno. La Città mantiene commesse e scambi.</p>
    <label>Copertura del welfare <select value={v.welfareScope} onChange={e => onChange({ ...v, welfareScope: e.target.value })}><option value="department">Un reparto per investimento</option><option value="factory">Tutti e tre i reparti con un investimento</option></select></label>
    <p>{v.welfareScope === 'factory' ? 'Acquisti senza limite: ogni welfare copre anche i reparti ancora senza operai. Non riduce subito la tensione: il recupero avviene quando produci in modo sostenibile nel singolo reparto.' : 'Ogni reparto richiede il proprio investimento.'}</p>
    {number(v.welfareScope === 'factory' ? 'Costo welfare per tutta la fabbrica' : 'Costo welfare per reparto', 'welfareCost')}
    <p><label><input type="checkbox" checked={v.welfareHireDiscount} onChange={e => onChange({ ...v, welfareHireDiscount: e.target.checked })} /> Welfare: −1 marchio sulle assunzioni degli operai Sopra nei reparti coperti</label></p>
    {v.welfareHireDiscount && <p>Ogni welfare aziendale aggiunge −1 alle assunzioni: due welfare danno −2, tre danno −3, con costo minimo 1. La produzione sostenibile recupera sempre soltanto 1 tensione. Il tracciato avanza del valore stampato. Macchinari Sotto e impiegati in Direzione mantengono il loro prezzo.</p>}
    {number('Costo prima repressione', 'repressionBase')}
    {number('Rincaro per intervento', 'repressionStep')}
    <p>Marchi aggiuntivi alla consegna delle commesse:</p>
    {Object.entries({ small: 'Piccole', medium: 'Medie', large: 'Grandi' }).map(([key, label]) => <label key={key} style={{ margin: 8 }}>{label} <input type="number" min="0" max="30" value={v.contractCoins[key]} onChange={e => onChange({ ...v, contractCoins: { ...v.contractCoins, [key]: Number(e.target.value) } })} /></label>)}
    <p><label><input type="checkbox" checked={v.machineCash} onChange={e => onChange({ ...v, machineCash: e.target.checked })} /> Rendite dirette dei macchinari in marchi; scambi invariati</label></p>
    <p className="hint">I rendimenti «per ogni» diventano fissi nella variante. Mappa delle fabbriche, rendite automatiche delle commesse, bonus immediati Sotto e premio reparto completo sono sospesi. Prezzi sperimentali: nessun cambiamento ai dati salvati delle carte.</p>
  </div>;
}
