import { repressionCost, rowNodeLabel } from '../game/row-economy.js';
import IndustrialActions from './IndustrialActions.jsx';
import { productionChoices, productionPreview } from './production-choices.js';
import { Amount } from './Amount.jsx';
import { effectChoiceLabel } from './effect-choice.js';
import { policiesOf, welfareEfficiency } from '../game/industrial.js';
import { hireCost, deptOfSector, describeTileEffect } from '../game/engine.js';
import React, { useState } from 'react';
import { SECTORS, RESOURCE_OF, SECTOR_COLORS, NATION_FLAGS, NODE_BANKS, UNBLOCK_COST } from '../game/data.js';
import { currentPlayer, legalCommands, WORKER_BY_ID, rankedIndices, indexValue, cellNow, expectedDividend, describeRace } from '../game/engine.js';

import FactoryMap from './FactoryMap.jsx';

const ROLE_LABEL = { terziario: 'Terziario', secondario: 'Secondario', primario: 'Primario', direzione: 'Direzione' };

export default function ActionPanel({ state, dispatch, renderHireCard }) {
  const p = currentPlayer(state);
  if (p.isAI && !state.pending) {
    return <div className="actions"><h3>Azioni</h3><p className="hint">L'AI sta giocando…</p></div>;
  }
  if (state.pending) {
    return <div className="actions"><h3>Azioni</h3><p className="hint">Decisione in corso…</p></div>;
  }
  const legal = legalCommands(state);

  return (
    <div className="actions">
      <h3>Azioni — {p.name}</h3>
      {state.phase === 'move' && <p className="hint">Clicca un nodo della Città per spostare il Procuratore (slot 1 gratis, slot 2 = 1 marco; cambia nodo a ogni turno).</p>}
      {state.phase === 'move' && legal.some(c => c.type === 'produceFactory') && (
        <div style={{ margin: '6px 0' }}>
          <p className="hint" style={{ marginBottom: 4 }}>Produzione a scelta (gratis, 1/turno): una fabbrica produce…</p>
          {legal.filter(c => c.type === 'produceFactory').map(c => (
            <button key={c.sector} onClick={() => dispatch(c)} style={{ borderLeft: `4px solid ${SECTOR_COLORS[c.sector]}` }}>
              {RESOURCE_OF[c.sector]} ({c.sector})
            </button>
          ))}
        </div>
      )}
      {state.phase === 'action' && <NodeActions state={state} p={p} legal={legal} dispatch={dispatch} renderHireCard={renderHireCard} />}
      {state.phase === 'borsa' && <BorsaActions state={state} p={p} legal={legal} dispatch={dispatch} />}
    </div>
  );
}

function NodeActions({ state, p, legal, dispatch, renderHireCard }) {
  const hires = legal.filter(c => c.type === 'hire');
  const activations = legal.filter(c => c.type === 'activate');
  const welfare = legal.filter(c => c.type === 'buyWelfare');
  const strutture = legal.filter(c => c.type === 'buyStruttura');
  const EFFECT_LABEL = { 'hire-1_Tessile+Chimica': '−1 ⓜ assunzioni a Tessile e Chimica', 'hire-1_Tessile+Metallurgica': '−1 ⓜ assunzioni a Tessile e Metallurgica', 'hire-1_Chimica+Metallurgica': '−1 ⓜ assunzioni a Chimica e Metallurgica', 'freeSecond_Tessile+Chimica': '2° posto gratis a Tessile e Chimica', 'freeSecond_Tessile+Metallurgica': '2° posto gratis a Tessile e Metallurgica', 'freeSecond_Chimica+Metallurgica': '2° posto gratis a Chimica e Metallurgica' };
  // una carta per blocco (non un banco): il mercato Impiegati a Servizi ne scopre 3 sullo stesso banco.
  const hireCards = [...new Set(hires.map(c => c.cardId))];

  return (
    <div>
      <p className="hint">Sei a <b>{rowNodeLabel(state, p.node)}</b>. Scegli una delle azioni del nodo:</p>

      <RowEconomyActions state={state} p={p} legal={legal} dispatch={dispatch}/>
      {hireCards.length > 0 && <h4>Assumi un operaio</h4>}
      {hireCards.map(cardId => {
        const w = WORKER_BY_ID[cardId];
        const opts = hires.filter(c => c.cardId === cardId);
        if(renderHireCard)return <React.Fragment key={cardId}>{renderHireCard({worker:w,options:opts,state,player:p,dispatch})}</React.Fragment>;
        const powerText = w.power && Object.entries(w.power).map(([s, n]) => `${s} +${n}`).join(', ');
        return (
          <div key={cardId} className="hire-block">
            <div className="hire-card" style={{ borderColor: SECTOR_COLORS[w.sector] }}>
              {NATION_FLAGS[w.nation]} <b>{w.nation}</b> · <span style={{ color: SECTOR_COLORS[w.sector] }}>{w.sector || 'Impiegato'}</span> · valore stampato <b>{w.v}</b>
              <div className="eff">{powerText ? `avanza ${powerText}` : `«${w.effectText || describeTileEffect(w)}»`}</div>
            </div>
            <div className="hire-opts">
              {opts.filter(o => o.side === 'sopra').map((o, i) => (
                <button key={'so' + i} onClick={() => dispatch(o)}>Sopra ({ROLE_LABEL[o.role]} — {state.industrial?.enabled ? `${hireCost(state, p, w, o.role, o.side)} marchi · ${state.industrial.development === 'off' ? '+1 operaio attivo' : 'sviluppa il reparto'}` : `avanza ${powerText || `${w.sector} di ${w.v}`}`})</button>
              ))}
              {opts.filter(o => o.side === 'sotto').map((o, i) => (
                <button key={'st' + i} onClick={() => dispatch(o)}>Sotto in {p.depts[o.role].sector} ({ROLE_LABEL[o.role]}{state.industrial?.enabled ? ` · ${hireCost(state, p, w, o.role, o.side)} marchi` : ''})</button>
              ))}
              {opts.length === 0 && <small>non installabile / marchi insufficienti</small>}
            </div>
          </div>
        );
      })}

      <ProductionActions state={state} p={p} activations={activations} dispatch={dispatch}/>

      {state.industrial?.enabled && SECTORS.includes(p.node) && !activations.length && <p role="status">{deptOfSector(p, p.node).shutdown ? 'Filiera ferma: riaprila al Sindacato.' : 'Per produrre serve almeno un operaio Sopra attivo.'}</p>}
      {p.node === 'Servizi' && state.servicesMode === 'struttura' && (
        <>
          <h4>Acquista carta Struttura</h4>
          {strutture.length === 0 && <small>Nessun acquisto possibile (marchi insufficienti o mercato esaurito).</small>}
          <div className="welfare-list">
            {[...new Set(strutture.map(c => c.idx))].map(idx => {
              const card = state.strutturaCards[idx];
              const sides = strutture.filter(c => c.idx === idx);
              return (
                <div key={idx} className="welfare-item">
                  <b>Struttura #{idx + 1}</b> — {card.cost} ⓜ · Sopra: potenza T{card.power.Tessile || 0}/M{card.power.Metallurgica || 0}/C{card.power.Chimica || 0} · Sotto: {EFFECT_LABEL[card.effect] || card.effect}
                  <div>
                    {sides.map((c, i) => <button key={i} onClick={() => dispatch(c)}>{c.side === 'sopra' ? 'Sopra (tracciati)' : 'Sotto (effetto)'}</button>)}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {p.node === 'Servizi' && state.borsaFabbriche?.enabled && (
        <>
          <h4>Borsa — fabbriche {legal.some(c => c.type === 'buildFactory') ? `(costo ${state.borsaFabbriche.costCurve[Math.min(p.factories.length, state.borsaFabbriche.costCurve.length - 1)]} ⓜ)` : ''}</h4>
          {!legal.some(c => c.type === 'buildFactory') && <small>Nessuna fondazione possibile ora (serve una milestone di reparto, un posto adiacente a una risorsa dello stesso colore, e i marchi).</small>}
          <FactoryMap state={state} legal={legal} dispatch={dispatch} />
        </>
      )}

      {p.node === 'Servizi' && state.borsaIndici?.enabled && !state.borsaFabbriche?.enabled && (
        <>
          <h4>Borsa — azioni Q{state.quad + 1} ({state.borsaIndici.prices[state.quad] ?? '—'} ⓜ l'una)</h4>
          {(() => {
            const buys = legal.filter(c => c.type === 'buyShare');
            const ranked = rankedIndices(state);
            return (
              <>
                <table className="mini">
                  <thead><tr><th>Indice</th><th>valore</th><th>rango</th><th>casella</th><th>investitori</th><th>se entri</th><th /></tr></thead>
                  <tbody>
                    {ranked.map(name => {
                      const mine = !!p.shares[name];
                      const investors = state.players.filter(q => q.shares[name]).length;
                      const cmd = buys.find(c => c.index === name);
                      return (
                        <tr key={name} style={{ opacity: mine ? 0.55 : 1 }}>
                          <td><b>{name}</b></td>
                          <td>{indexValue(state, name)}</td>
                          <td>{ranked.indexOf(name) + 1}°</td>
                          <td>{cellNow(state, name)} PV</td>
                          <td>{investors}</td>
                          <td>{expectedDividend(state, name, mine)} PV</td>
                          <td>{mine ? <small>già investito</small> : cmd ? <button onClick={() => dispatch(cmd)}>Compra</button> : <small>—</small>}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
                <small>
                  Il dividendo è la casella ÷ i giocatori che ci sono dentro: entrare dove c'è già qualcuno lo dimezza per
                  entrambi. Paga alla chiusura di Q{state.quad + 1} (Clock {state.borsaIndici.quadBounds[state.quad]}), poi l'azione scade.
                </small>
              </>
            );
          })()}
        </>
      )}

      {p.node === 'Servizi' && state.servicesMode !== 'struttura' && state.welfareEnabled && (
        <>
          <h4>Acquista Welfare / Macchinario</h4>
          {welfare.length === 0 && <small>Nessun acquisto possibile (marchi o slot Direzione).</small>}
          <div className="welfare-list">
            {[...new Set(welfare.map(c => c.cardId))].map(id => {
              const wf = state.welfareById[id];
              const sides = welfare.filter(c => c.cardId === id);
              return (
                <div key={id} className="welfare-item">
                  <b>{wf.name}</b> — {wf.v} ⓜ · avanza {wf.s1} +{wf.t1} / {wf.s2} +{wf.t2} · macchinario: {wf.perUse.map(s => RESOURCE_OF[s]).join('+')} ×{wf.usesMax}
                  <div>
                    {sides.map((c, i) => (
                      <button key={i} onClick={() => dispatch(c)}>{c.side === 'sopra' ? 'Welfare (Sopra)' : 'Macchinario (Sotto)'}</button>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {p.node === 'Sindacato' && (state.industrial?.enabled ? <IndustrialActions state={state} player={p} legal={legal} dispatch={dispatch} /> : <TrattativaBuilder state={state} p={p} dispatch={dispatch} />)}

      <div className="pass-row">
        <button className="ghost" onClick={() => dispatch({ type: 'pass' })}>Rinuncia all'azione</button>
      </div>
    </div>
  );
}

// Al Sindacato le sotto-azioni sono combinabili nella stessa visita (sindacatoSession): Trattativa,
// Elimina sciopero e Assumi (sopra, resa dal pannello Assunzione generico) sono bottoni indipendenti,
// ciascuno usabile una volta; il giocatore si ferma quando vuole con "Rinuncia all'azione".
function TrattativaBuilder({ state, p, dispatch }) {
  const roles = ['terziario', 'secondario', 'primario'];
  const opponents = state.players.filter(q => q.id !== p.id);
  const [resetRole, setResetRole] = useState('primario');
  const [targetPlayer, setTargetPlayer] = useState(opponents[0].id);
  const [targetRole, setTargetRole] = useState('primario');
  const ss = state.sindacatoSession;
  const blockedCards = roles.flatMap(r => p.depts[r].blocked.map(id => ({ role: r, id })));
  const canUnblock = state.trattativa.unblock.enabled && !ss?.unblock && blockedCards.length > 0 && p.coins >= UNBLOCK_COST;

  return (
    <div className="tratt">
      {!ss?.trattativa && (
        <>
          <h4>Trattativa sindacale (gratuita)</h4>
          <div className="tratt-row">
            <label>Azzera Tensione del tuo reparto:{' '}
              <select value={resetRole} onChange={e => setResetRole(e.target.value)}>
                {roles.map(r => <option key={r} value={r}>{p.depts[r].sector} (Tens. {p.depts[r].tension})</option>)}
              </select>
            </label>
            <label>+1 Tensione a:{' '}
              <select value={targetPlayer} onChange={e => setTargetPlayer(e.target.value)}>
                {opponents.map(o => <option key={o.id} value={o.id}>{o.name}</option>)}
              </select>
              <select value={targetRole} onChange={e => setTargetRole(e.target.value)}>
                {roles.map(r => {
                  const d = state.players[Number(targetPlayer)].depts[r];
                  return <option key={r} value={r}>{d.sector} (Tens. {d.tension}{d.sopra.length + d.sotto.length === 0 ? ', vuoto' : ''})</option>;
                })}
              </select>
            </label>
          </div>
          <button className="primary" onClick={() => dispatch({ type: 'trattativa', resetRole, targetPlayer: Number(targetPlayer), targetRole })}>
            Esegui Trattativa
          </button>
        </>
      )}
      {canUnblock && (
        <div className="tratt-row">
          <button onClick={() => { const b = blockedCards[0]; dispatch({ type: 'unblockSciopero', role: b.role, cardId: b.id }); }}>
            Elimina uno Sciopero — {WORKER_BY_ID[blockedCards[0].id].effectText} ({p.depts[blockedCards[0].role].sector}, {UNBLOCK_COST} ⓜ)
          </button>
        </div>
      )}
    </div>
  );
}

function BorsaActions({ state, p, legal, dispatch }) {
  const sells = legal.filter(c => c.type === 'exchange' && c.kind === 'sell');
  const converts = legal.filter(c => c.type === 'exchange' && c.kind === 'convert');
  const completes = legal.filter(c => c.type === 'completeContract');
  const races = legal.filter(c => c.type === 'completeRace');
  const exitCmd = legal.find(c => c.type === 'borsaExit');
  const refreshes = legal.filter(c => c.type === 'refreshMarket');
  const exitPathUsed = state.borsaExitUsed || state.borsaRefreshUsed;
  const SIZE_LABEL = { small: 'piccola', medium: 'media', large: 'grande' };
  const REFRESH_LABEL = { welfare: 'Rinfresca mercato Welfare', workers: 'Rinfresca banchi operai' };

  return (
    <div>
      <p className="hint">
        Sei alla <b>Città</b>: {state.rowEconomy?.enabled ? '' : `Vendi ${state.sellUsedThisVisit}/1 · Scambia ${state.convertUsedThisVisit}/1 usati questa visita, `}{state.singleContractVisit?'Una sola commessa: la consegna termina automaticamente il turno.':`max 2 Commesse per visita (${state.contractsThisVisit}/2 completate).`}
      </p>
      <div className="city-turn-controls">
        <button className="primary" onClick={() => dispatch({ type: 'endTurn' })}>Termina turno</button>
        <p role="status">{completes.length?(state.singleContractVisit?'Consegna una commessa per concludere il turno, oppure termina senza consegnare.':'Puoi consegnare una commessa oppure terminare il turno.'):'Nessuna commessa consegnabile: premi Termina turno per proseguire.'}</p>
      </div>
      {(sells.length>0||converts.length>0)&&<h4>Cambio risorse</h4>}
      <div className="btn-row">
        {sells.map((c, i) => <button key={i} onClick={() => dispatch(c)}>{c.giveQty} {RESOURCE_OF[c.give]} → {c.getQty} ⓜ</button>)}
      </div>
      <div className="btn-row">
        {converts.map((c, i) => <button key={i} onClick={() => dispatch(c)}>{c.giveQty} {RESOURCE_OF[c.give]} → {c.getQty} {RESOURCE_OF[c.take]}</button>)}
      </div>
      <h4>Completa Commesse</h4>
      {state.contractsThisVisit === 0 && exitPathUsed && <small>Non completabili: hai già scelto di uscire con bonus/refresh in questa visita.</small>}
      {state.contractsThisVisit < (state.singleContractVisit?1:2) && !exitPathUsed && completes.length === 0 && <small>Nessuna commessa completabile con le risorse attuali.</small>}
      <div className="btn-row col">
        {completes.map((c, i) => {
          const slot = state.contracts[c.size].active[c.slotIndex ?? 0];
          const place = state.singlePlace ? 0 : (slot.places[0] === null ? 0 : 1);
          return (
            <button key={i} className="primary" onClick={() => dispatch(c)}>
              Commessa {SIZE_LABEL[c.size]} — {slot.card.reqs[c.reqIndex].map(s => RESOURCE_OF[s]).join(', ')} → {slot.card.pv[place]} PV{state.rowEconomy?.enabled && ` + ${state.rowEconomy.contractCoins[c.size]} marchi`}{state.singlePlace ? '' : ` (${place + 1}°)`}
            </button>
          );
        })}
      </div>
      {state.raceObjectives?.enabled && (
        <>
          <h4>Obiettivi di gara</h4>
          {races.length === 0 && <small>Nessun obiettivo di gara rivendicabile ora (non qualificato, già preso, o podio pieno).</small>}
          <div className="btn-row col">
            {races.map((c, i) => {
              const it = state.raceObjectives.list.find(r => r.id === c.raceId);
              const place = it.claims.length; // posto che prenderesti ora
              const pv = state.raceObjectives.podium[place] ?? 0;
              return (
                <button key={i} className="primary" onClick={() => dispatch(c)}>
                  {describeRace(it)} → {place + 1}° arrivato, {pv} PV
                </button>
              );
            })}
          </div>
        </>
      )}
      {(exitCmd || refreshes.length > 0) && (
        <>
          <h4>Esci senza Commesse</h4>
          <p className="hint">Alternativa alle Commesse in questa visita: una volta scelta, non potrai più completarne.</p>
          <div className="btn-row">
            {exitCmd && <button onClick={() => dispatch(exitCmd)}>Esci con {exitCmd.coins} ⓜ</button>}
            {refreshes.map((c, i) => <button key={i} onClick={() => dispatch(c)}>{REFRESH_LABEL[c.target]}</button>)}
          </div>
        </>
      )}

    </div>
  );
}

export function ProductionActions({state,p,activations,dispatch}) {
  return activations.length > 0 && (
        <>
          <h4>Attiva un reparto</h4>
          {productionChoices(state,activations).map(c => {
            const d = deptOfSector(p, c.sector);
            const I = state.industrial;
            if(state.rowEconomy?.enabled&&state.rowTrack){
              const sustainable=c.sustainableRow!==undefined;
              const preview=productionPreview(state,c);
              const resources=Object.entries(preview.resources).filter(([resource,amount])=>amount!==0||resource===RESOURCE_OF[c.sector]);
              return <button key={`${c.sector}-${sustainable?'sustainable':'intense'}`} className="primary production-choice" onClick={()=>dispatch(c)}>
                <strong>{sustainable?'Sostenibile':'Intensa'}</strong>
                <span className="production-yield">
                  {resources.map(([resource,amount])=><Amount key={resource} kind={resource} value={amount}/>)}
                  <Amount kind="coin" value={preview.coins}/>
                  <span>Tensione <b>{d.tension} → {preview.tension}</b></span>
                </span>
                <small>Macchinari inclusi</small>
                {preview.conversions.map((card,i)=><small key={i}>Conversione facoltativa dopo: {effectChoiceLabel(card)}</small>)}
              </button>;
            }
            const bonus = I?.enabled ? welfareEfficiency(state, { ...d, tension: Math.min(I.tensionLimit, d.tension + c.intensity) }, c.intensity) : 0;
            const welfare = I?.enabled && policiesOf(state, d).some(card => card.effect === 'efficiency')
              ? bonus > 0 ? ` · Welfare +${bonus}` : ' · nessun bonus Welfare' : '';
            return <button key={`${c.intensity ?? 1}-${c.sustainableRow ?? "intensa"}`} className="primary" onClick={() => dispatch(c)}>
              {c.sustainableRow !== undefined ? `Sostenibile ${c.sector} · ${c.sustainableRow < 0 ? "nessuna riga accessibile" : `righe ${[].concat(c.sustainableRow).map(row => row + 1).join(", ")}`} · tensione −1 · macchinari attivi` : state.rowTrack ? `Produci ${c.sector} · bonus disponibili, poi tensione +1${d.tension === I.tensionLimit ? ' · tracciato interamente escluso' : ''}` : I?.enabled ? `Produci ${c.sector} ×${c.intensity} · tensione +${c.intensity}${welfare}${d.tension + c.intensity >= I.tensionLimit ? ' · SCIOPERO dopo la produzione' : ''}` : `Attiva ${c.sector} (Tensione +1, tracciato + carte Sotto)`}
            </button>;
          })}
        </>
      );
}

export function RowEconomyActions({state,p,legal,dispatch}) {
  return (state.rowEconomy?.enabled && <div>
        {legal.filter(c => c.type === 'investWelfare').map(c => <button key={c.role || c.scope} onClick={() => dispatch(c)}>Welfare — {c.scope === 'factory' ? 'tutti e tre i reparti' : p.depts[c.role].sector} · {state.rowEconomy.welfareCost} marchi{state.rowEconomy.welfareHireDiscount ? " · ulteriore −1 sulle assunzioni Sopra" : ""}</button>)}
        {legal.filter(c => c.type === 'repress').map(c => <button key={c.role} onClick={() => dispatch(c)}>Repressione — {p.depts[c.role].sector} · −2 tensione · {repressionCost(state, p)} marchi</button>)}
      </div>);
}
