import React from 'react';
import { INDUSTRIAL_DEFAULT, normalizeIndustrial, welfareDescription } from '../game/industrial.js';

export const INDUSTRIAL_KEY = 'officina1907-industrial-v1';
export function loadIndustrial() {
  try { return normalizeIndustrial(JSON.parse(localStorage.getItem(INDUSTRIAL_KEY)) || {}); }
  catch { return normalizeIndustrial(); }
}

export default function IndustrialEditor({ value, onChange, onPreset, roundLimit, endMode }) {
  const v = normalizeIndustrial(value);
  const set = (key, x) => onChange(normalizeIndustrial({ ...v, [key]: x }));
  const num = (key, label, min, max, note) => <label key={key} style={{ display: 'block', margin: '8px 0' }}>
    {label}: <input aria-label={label} type="number" min={min} max={max} value={v[key]} onChange={e => set(key, Number(e.target.value))} style={{ width: 64 }} /> {note && <small>{note}</small>}
  </label>;
  const select = (key, label, options) => <label style={{ display: 'block', margin: '8px 0' }}>{label}: <select aria-label={label} value={v[key]} onChange={e => set(key, e.target.value)}>{options.map(([id, text]) => <option key={id} value={id}>{text}</option>)}</select></label>;
  const toggle = (key, label) => <label style={{ display: 'block', margin: '8px 0' }}><input type="checkbox" checked={v[key]} onChange={e => set(key, e.target.checked)} /> {label}</label>;
  return <div className="track-editor" style={{ textAlign: 'left' }}>
    <h3>Laboratorio Archimede — scelte industriali</h3>
    <p>Varianti sperimentali: stessa libertà per tutti i giocatori, nessun potere assegnato a un archetipo. Costi e soglie sono ipotesi di partenza, non valori già bilanciati.</p>
    <button className="primary" onClick={() => onPreset(true)}>Carica proposta Archimede · 28 turni</button>
    <button className="ghost" onClick={() => onPreset(false)}>Carica prima ipotesi · confronto</button>
    <button className="ghost" onClick={() => onChange(normalizeIndustrial({ ...v, enabled: false }))}>Disattiva varianti</button>
    <p>Proposta rivista: l'efficienza Welfare richiede benessere anche dopo la produzione e non assegna PV. Riaprire una filiera costa 5 marchi, porta la tensione a 0 e recupera tutti i suoi operai. La trattativa ordinaria resta −1.</p>
    <p className="hint">La proposta imposta 2 posti Sopra e 1 Sotto per reparto, 12 commesse per taglia in 4 giocatori, 1 Welfare per reparto, niente risorse da fondazione o commesse-motore, niente rendite passive delle fabbriche, niente effetto immediato Sotto. Disattiva i punti reparto completo e i requisiti milestone delle commesse. Mantiene i punteggi delle commesse. Esporta prima la configurazione corrente se vuoi conservarla.</p>
    {toggle('enabled', 'Attiva le regole del laboratorio')}
    <fieldset disabled={!v.enabled}>
      <legend>Produzione e personale</legend>
      {toggle('push', 'Scegli la spinta: da 1 al numero di operai Sopra attivi')}
      {select('productionMode', 'Resa', [['compact', 'Contenuta: base + carte Sotto limitate'], ['legacy', 'Tracciato e carte originali (con spinta sulle risorse)']])}
      {select('development', 'Avanzamento del vecchio tracciato', [['off', 'Disattivato, niente milestone o Impiegati'], ['price', 'Valore del lavoratore'], ['workers', 'Un passo per operaio (Impiegati invariati)']])}
      {num('baseResources', 'Risorse base per unità di spinta', 0, 6)}
      {num('productionCoins', 'Marchi per attivazione contenuta', 0, 6, 'Una sola volta: mai moltiplicati dalla spinta.')}
      {num('sottoResourceCap', 'Massimo risorse per carta Sotto e unità di spinta', 0, 6)}
      <p className="hint">Resa contenuta: le carte Sotto mantengono il colore stampato; i loro effetti risorsa sono limitati dal tetto. Monete e conversioni si risolvono una volta. Le tessere del vecchio tracciato non producono durante l'attivazione contenuta. Una filiera senza operai attivi non produce.</p>
      {num('factorySlots', 'Posti Sopra aggiuntivi per fabbrica', 0, 6, 'Fabbrica neutra: +posti in ciascun settore adiacente, contato una sola volta per colore. Fabbrica di settore: solo quel settore.')}
      <p className="hint">Gli operai bloccati occupano ancora il posto. Il limite totale delle fabbriche e i costi restano nell'editor della mappa.</p>
    </fieldset>
    <fieldset disabled={!v.enabled}>
      <legend>Tensione, benessere e Sindacato</legend>
      {num('tensionLimit', 'Soglia finale della tensione', 3, 12, '7 significa valori da 0 a 7. Benessere = soglia − tensione.')}
      {toggle('progressive', 'Attiva i malus intermedi')}
      {num('hireThreshold', 'Soglia del sovrapprezzo assunzioni', 1, v.tensionLimit - 1)}
      {num('hireSurcharge', 'Sovrapprezzo nel reparto in tensione (marchi)', 0, 6)}
      {num('blockThreshold', 'Soglia che blocca il primo operaio Sopra attivo', 1, v.tensionLimit - 1)}
      {select('strikeMode', 'Alla soglia finale', [['department', 'Ferma tutta la filiera, tensione resta alta'], ['card', 'Blocca un altro operaio e azzera tensione']])}
      {num('unionReduction', 'Riduzione della tensione per trattativa', 0, v.tensionLimit, '0 = azzeramento storico; 1 = proposta discussa.')}
      {toggle('opponentPressure', 'Consenti pressione avversaria (usa anche il toggle dell’editor Trattativa)')}
      {num('restartCost', 'Riaprire la filiera: costo in marchi', 0, 20)}
      {num('restartTension', 'Tensione massima dopo la riapertura', 0, v.tensionLimit - 1)}
      {toggle('restartClearsWorkers', 'La riapertura recupera anche tutti gli operai bloccati del reparto')}
      <p className="hint">La produzione viene incassata prima dei blocchi. Ridurre tensione non libera operai né riapre la filiera. Al Sindacato puoi recuperare una carta oppure riaprire una filiera per visita. Il costo del recupero carta è nell'editor Trattativa. Una soglia intermedia scatta a ogni attraversamento verso l'alto.</p>
    </fieldset>
    <fieldset disabled={!v.enabled}>
      <legend>Welfare del reparto</legend>
      {toggle('welfareEnabled', 'Acquista Welfare al Sindacato')}
      {toggle('welfareNeedsWellbeing', 'Efficienza Welfare solo se il benessere resta sufficiente dopo la produzione')}
      {select('welfareAccess', 'Benessere per acquistare', [['requirement', 'Requisito (non si consuma)'], ['spend', 'Si spende: aumenta la tensione e può causare scioperi'], ['none', 'Nessun requisito']])}
      {select('welfareScoring', 'Punti Welfare', [['none', 'Nessun punto'], ['purchase', 'Una volta all’acquisto'], ['final', 'Fine partita, se rispetti il requisito'], ['quarter', 'Ogni quadrimestre, se rispetti il requisito']])}
      {num('quarterLength', 'Turni per giocatore in un quadrimestre', 1, 30)}
      {num('welfareSlots', 'Carte Welfare per reparto', 1, 3)}
      <p className="hint">Catalogo pubblico senza esaurimento; ogni carta può essere comprata una sola volta per reparto. Un acquisto per visita, combinabile con trattativa e recupero. Le risorse pagate sono scelte dal giocatore. Il requisito del bonus produttivo si verifica dopo aver aggiunto la tensione della spinta; le abilità di formazione e recupero restano disponibili. I punti periodici/finali richiedono almeno un operaio attivo, filiera operativa e benessere sufficiente.</p>
      {endMode !== 'rounds' && v.welfareScoring === 'quarter' && <p role="status">Il calendario non è fisso: il numero di pagamenti Welfare dipenderà dalla durata effettiva.</p>}
      <p>Calendario corrente: {endMode === 'rounds' ? `${roundLimit} turni, ${Math.floor(roundLimit / v.quarterLength)} quadrimestri completi` : 'fine a commesse/clock'}. Nessun pagamento per un periodo incompleto.</p>
      {v.welfareCards.map((c, index) => <div className="hire-block" key={c.id}>
        <b>{c.name}</b><p>{welfareDescription(c)}</p>
        {Object.entries({ coins: 'Costo marchi', resources: 'Costo risorse', wellbeing: 'Benessere richiesto / per punti', spend: 'Benessere speso (modalità spesa)', pv: 'PV per pagamento', ...(c.effect !== 'flexibility' ? { amount: 'Entità beneficio' } : {}), ...(c.effect === 'efficiency' ? { coverage: 'Massimo operai coperti' } : {}) }).map(([key, label]) => <label key={key} style={{ display: 'inline-block', margin: 6 }}>{label} <input aria-label={`${c.name}: ${label}`} type="number" min={key === 'coverage' ? 1 : 0} max={['wellbeing', 'spend'].includes(key) ? v.tensionLimit : key === 'coins' ? 20 : 6} value={c[key]} style={{ width: 50 }} onChange={e => set('welfareCards', v.welfareCards.map((card, i) => i === index ? { ...card, [key]: Number(e.target.value) } : card))} /></label>)}
      </div>)}
    </fieldset>
    <button className="ghost" onClick={() => onChange(normalizeIndustrial({ ...INDUSTRIAL_DEFAULT, enabled: v.enabled }))}>Ripristina solo i valori del laboratorio</button>
  </div>;
}
