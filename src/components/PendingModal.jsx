import React from 'react';
import { effectChoiceAmounts, effectChoiceLabel } from './effect-choice.js';
import { SECTORS, RESOURCE_OF, SECTOR_COLORS, NATION_FLAGS } from '../game/data.js';
import { legalCommands, WORKER_BY_ID, describeTileEffect } from '../game/engine.js';
import { rowActionPreview } from './row-action-preview.js';

export default function PendingModal({ state, dispatch, renderResource=()=>null }) {
  const pend = state.pending;
  const owner = state.players[pend.playerId];
  const legal = legalCommands(state);

  return (
    <div className="modal-back">
      <div className="modal" role="dialog" aria-modal="true" aria-label={pend.type==='welfareToken'?'Recupero welfare':'Scelta effetto'}>
        {pend.type === 'sciopero' ? (
          <>
            <h3>✊ SCIOPERO — {owner.name}</h3>
            <p>La Tensione in <b>{owner.depts[pend.role].sector}</b> ha raggiunto il limite: scegli una carta da bloccare (resta nello slot ma smette di produrre).</p>
            <div className="btn-row col">
              {legal.map((c, i) => {
                const w = WORKER_BY_ID[c.cardId];
                const side = owner.depts[pend.role].sopra.includes(c.cardId) ? 'Sopra' : 'Sotto';
                return (
                  <button key={i} onClick={() => dispatch(c)}>
                    {NATION_FLAGS[w.nation]} <span style={{ color: SECTOR_COLORS[w.sector] }}>{w.sector}</span> V{w.v} ({side}) — «{w.effectText}»
                  </button>
                );
              })}
            </div>
          </>
        ) : pend.type === 'welfareToken' ? (
          <WelfareTokenChoice state={state} owner={owner} legal={legal} dispatch={dispatch}/>
        ) : pend.type === 'trackTile' ? (
          <TrackTileChoice state={state} pend={pend} owner={owner} legal={legal} dispatch={dispatch} />
        ) : (
          <EffectChoice state={state} pend={pend} owner={owner} legal={legal} dispatch={dispatch} renderResource={renderResource} />
        )}
      </div>
    </div>
  );
}

function WelfareTokenChoice({state,owner,legal,dispatch}) {
  const choices=legal.filter(c=>c.type==='spendWelfareToken');
  return <>
    <h3>🌿 Recupero welfare</h3>
    {choices.length?<p>Hai <b>{owner.welfareTokens} gettoni</b>. Scegli quanti spenderne per curare il reparto in cui sei. Il recupero può seguire un acquisto o una rinuncia all’azione, mai una produzione.</p>:<p>In questo turno non puoi curare: devi trovarti nel reparto da recuperare e non aver prodotto. Conserva i gettoni per continuare.</p>}
    <div className="btn-row col">
      {choices.map(command=>{
        const {before,after}=rowActionPreview(state,command).departments[0];
        const count=command.count||1;
        return <button key={`${command.role}-${count}`} className="production-choice" onClick={()=>dispatch(command)}>
          <strong>{before.sector} · {count} {count===1?'gettone':'gettoni'}</strong>
          <span className="production-yield">Tensione <b>{before.tension} → {after.tension}</b></span>
          <small>Righe utilizzabili: <b>{before.available} → {after.available}</b></small>
        </button>;
      })}
      <button className="ghost" onClick={()=>dispatch({type:'skipWelfareToken'})}>Conserva i gettoni</button>
    </div>
  </>;
}

// Scelta della tile nel momento in cui si raggiunge la milestone che apre il mercato (non più alla Borsa).
const CELL_LABEL = {
  coins: n => `+${n} ⓜ a ogni attivazione`,
  coinsPerIcon: n => `+${n} ⓜ per icona del settore, a ogni attivazione`,
  coinsPerTension: n => `+${n} ⓜ per Tensione, a ogni attivazione`,
  res: n => `+${n} risorse a ogni attivazione`,
  resPerIcon: n => `+${n} risorsa per icona del settore, a ogni attivazione`,
  resPerTension: n => `+${n} risorsa per Tensione, a ogni attivazione`,
  coinsPerFactory: n => `+${n} ⓜ per fabbrica del settore, a ogni attivazione`,
  resPerFactory: n => `+${n} risorsa per fabbrica del settore, a ogni attivazione`,
  pv: n => `+${n} PV a fine partita`,
  pvPerIcon: n => `+${n} PV per icona del settore, a fine partita`,
  pvPerTension: n => `+${n} PV per Tensione, a fine partita`,
  pvPerFactory: n => `+${n} PV per fabbrica del settore, a fine partita`,
};
function TrackTileChoice({ state, pend, owner, legal, dispatch }) {
  const sector = owner.depts[pend.role].sector;
  const useOpts = legal.filter(c => c.use);
  return (
    <>
      <h3>🧩 Ricerca e Sviluppo — {owner.name}</h3>
      <p>
        <b>{sector}</b> ha raggiunto la milestone {pend.market}: scegli la tile da installare sulla casella{' '}
        <b>{pend.pos}</b> del tracciato. Produrrà a ogni attivazione del reparto.
      </p>
      <div className="btn-row col">
        {useOpts.map((c, i) => {
          const t = state.trackTileById[c.tileId];
          return (
            <button key={i} onClick={() => dispatch(c)}>
              <b>{t.name}</b> — {t.effect ? describeTileEffect(t) : (CELL_LABEL[t.cellType] || (n => `${t.cellType} ${n}`))(t.amount)}
              {t.cost > 0 && ` · costa ${t.cost} ${RESOURCE_OF[sector]}`}
            </button>
          );
        })}
      </div>
    </>
  );
}

function EffectChoice({ state, pend, owner, legal, dispatch, renderResource }) {
  const w = pend.card || WORKER_BY_ID[pend.cardId];
  const useOpts = legal.filter(c => c.use);
  return (
    <>
      <h3>{pend.welfareRondel?'Politica · Mutuo soccorso':'Effetto carta'} — {owner.name}</h3>
      <p>{effectChoiceLabel(w)} <small>(opzionale)</small></p>
      <div className="btn-row col">
        {useOpts.map((c, i) => (
          <button key={i} aria-label={effectChoiceLabel(w,c)} onClick={() => dispatch(c)}>
            {effectChoiceAmounts(w,c).map((amount,j)=><React.Fragment key={j}>{j>0?' → ':''}<b>{amount.quantity}</b> {amount.resource&&renderResource(amount.resource)} {amount.label}</React.Fragment>)}
          </button>
        ))}
        <button className="ghost" onClick={() => dispatch({ type: 'resolveEffect', use: false })}>Non usare</button>
      </div>
    </>
  );
}
