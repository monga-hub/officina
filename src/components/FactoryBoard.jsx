import { activeWorkers, wellbeing, policiesOf, welfareDescription } from '../game/industrial.js';
import React, { useState } from 'react';
import { RESOURCE_OF, SECTOR_COLORS, NATION_FLAGS, trackGridPos, activeTrackEnd } from '../game/data.js';
import RowProductionTrack from './RowProductionTrack.jsx';
import { WORKER_BY_ID, describeCond, workerCapacity, maxIntensity, tensionLimit, describeTileEffect } from '../game/engine.js';

const ROLE_LABEL = { terziario: 'Terziario', secondario: 'Secondario', primario: 'Primario' };
const RES_ICON = { Tessuti: '🧵', Acciaio: '⚒', Coloranti: '⚗' };

function WorkerChip({ id, blocked }) {
  const w = WORKER_BY_ID[id];
  return (
    <div className={`chip ${blocked ? 'blocked' : ''}`} style={{ borderColor: SECTOR_COLORS[w.sector] }} title={w.effectText || describeTileEffect(w)}>
      {NATION_FLAGS[w.nation]} V{w.v} {blocked && '🔒'}
    </div>
  );
}

function cellLabel(cell, sector) {
  if (!cell) return '·';
  if (cell.coins) return `${cell.coins}ⓜ`;
  if (cell.res) return RES_ICON[RESOURCE_OF[sector]];
  if (cell.coinsPerIcon) return 'ⓜ×🂠';
  if (cell.coinsPerTension) return 'ⓜ×✊';
  if (cell.resPerIcon) return `${RES_ICON[RESOURCE_OF[sector]]}×🂠`;
  if (cell.resPerTension) return `${RES_ICON[RESOURCE_OF[sector]]}×✊`;
  if (cell.coinsPerFactory) return 'ⓜ×🏭';
  if (cell.resPerFactory) return `${RES_ICON[RESOURCE_OF[sector]]}×🏭`;
  if (cell.pv) return `${cell.pv}PV`;
  if (cell.pvPerIcon) return 'PV×🂠';
  if (cell.pvPerTension) return 'PV×✊';
  if (cell.pvPerFactory) return 'PV×🏭';
  if (cell.milestone) return '🏛';
  if (cell.tileSlot) return '□';
  return '·';
}

// Griglia 4x4 come sulla plancia fisica (righe A in alto → D in basso, serpentina da D1)
function Track({ dept, track, trackTileById, model, rowTrack, wholeRows }) {
  if (rowTrack) return <RowProductionTrack wholeRows={wholeRows} model={model} prod={dept.prod} tension={dept.tension}
    renderCell={pos => dept.tileFills?.[pos] ? '◆' : cellLabel(track[pos], dept.sector)}
    cellTitle={pos => dept.tileFills?.[pos] ? trackTileById[dept.tileFills[pos]]?.name : cellLabel(track[pos], dept.sector)} />;
  const grid = [[], [], [], []]; // righe A..D
  const max = track.length - 1;
  for (let pos = 1; pos <= max; pos++) {
    const [row, col] = trackGridPos(pos, max);
    grid[row][col] = pos;
  }
  return (
    <div className="track-grid">
      {grid.map((rowPos, r) => (
        <div key={r} className="track-row">
          {rowPos.map((pos, c) => {
            const filledId = dept.tileFills?.[pos];
            const filledTile = filledId ? trackTileById[filledId] : null;
            const cell = filledTile ? { tileFilled: true } : track[pos];
            const title = filledTile
              ? `Posizione ${pos} — tile "${filledTile.name}"`
              : `Posizione ${pos}${cell?.milestone ? ' — Milestone' : cell?.pv ? ` — soglia ${cell.pv} PV a fine partita` : cell?.tileSlot ? ' — slot tile vuoto (compra al nodo Servizi)' : ''}`;
            return (
              <span key={c}
                className={`cell ${dept.prod === pos ? 'here' : ''} ${dept.prod >= pos ? 'passed' : ''}`}
                title={title}>
                {filledTile ? '◆' : cellLabel(cell, dept.sector)}
              </span>
            );
          })}
        </div>
      ))}
    </div>
  );
}

export default function FactoryBoard({ state, player, isCurrent }) {
  const [showTile, setShowTile] = useState(false);
  const roles = ['terziario', 'secondario', 'primario'];
  return (
    <div className={`factory ${isCurrent ? 'current' : ''}`} style={{ borderColor: player.color }}>
      <div className="factory-head">
        <b style={{ color: player.color }}>{player.name}</b>
        <span className="board-name">{player.boardName}{player.isAI ? ' · AI' : ''}</span>
        <span className="wealth">
          ⓜ {player.coins} &nbsp;
          {Object.entries(player.resources).map(([r, n]) => <span key={r}>{RES_ICON[r]} {n} </span>)}
        </span>
        <span className="pos">📍 {player.node}</span>
        <button className="tile-btn" onClick={() => setShowTile(!showTile)}>
          Piano Industriale {player.achieved.filter(Boolean).length}/3 {showTile ? '▾' : '▸'}
        </button>
      </div>
      {showTile && (
        <ul className="tile">
          {player.tile.objectives.map((o, i) => (
            <li key={i} className={player.achieved[i] ? 'done' : ''}>
              {player.achieved[i] ? '✔' : '○'} {describeCond(o.cond)} — <b>{o.pv} PV</b>
            </li>
          ))}
        </ul>
      )}
      <div className="depts">
        {roles.map(role => {
          const d = player.depts[role];
          return (
            <div key={role} className="dept" style={{ background: SECTOR_COLORS[d.sector] + '22', borderColor: SECTOR_COLORS[d.sector] }}>
              <div className="dept-head">
                <b style={{ color: SECTOR_COLORS[d.sector] }}>{d.sector}</b>
                <small> {ROLE_LABEL[role]}</small>
                <span className={`tension t${d.tension}`} title="Tensione">✊ {d.tension}/{tensionLimit(state)}</span>
              </div>
              {(!state.industrial?.enabled || state.industrial.development !== 'off') && <Track dept={d} track={state.tracks[role]} trackTileById={state.trackTileById} model={state.trackModel} rowTrack={state.rowTrack} wholeRows={state.rowEconomy?.enabled} />}
              {state.rowTrack && <p className="hint">{activeTrackEnd(d.prod, d.tension, state.trackModel, state.rowEconomy?.enabled)} caselle produttive utilizzabili · Intensa: tensione +1{state.rowEconomy?.enabled ? ` · Welfare ${d.sustainableWelfare || 0}${d.sustainableWelfare ? `: fino a ${d.sustainableWelfare} righe accessibili e tensione −1` : ""}` : ""}</p>}
              {state.industrial?.enabled && !state.rowTrack && <div>
                <p><b>{d.shutdown ? '⛔ FILIERA FERMA' : maxIntensity(state, d) ? `Spinta disponibile: 1–${maxIntensity(state, d)}` : 'Nessun operaio attivo'}</b> · Benessere {wellbeing(state, d)} · Operai attivi {activeWorkers(d)}</p>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 3 }} aria-label={`Tracciato tensione ${d.sector}`}>
                  {Array.from({ length: state.industrial.tensionLimit + 1 }, (_, i) => <span key={i} title={`Tensione ${i} · benessere ${state.industrial.tensionLimit - i}`} style={{ padding: 5, border: i === d.tension ? '2px solid white' : '1px solid #777', background: i === state.industrial.tensionLimit ? '#713333' : '#333' }}>{i}{i === state.industrial.tensionLimit ? ' ⛔' : state.industrial.progressive && i === state.industrial.blockThreshold ? ' 🔒' : state.industrial.progressive && i === state.industrial.hireThreshold ? ' ⓜ' : ''}</span>)}
                </div>
                <p className="hint">{state.industrial.productionMode === 'compact' ? `Base ${state.industrial.baseResources} risorsa × spinta; carte Sotto max ${state.industrial.sottoResourceCap} ciascuna × spinta; ${state.industrial.productionCoins} marchi una volta.` : 'Resa del tracciato e delle carte originali.'}</p>
                {policiesOf(state, d).map(c => <div className="chip welfare" key={c.id} title={welfareDescription(c)}>🛡 {c.name}</div>)}
              </div>}
              <div className="slots">
                <div className="slot-row">
                  <small>Sopra {d.sopra.length}/{state.rowEconomy?.enabled ? "∞" : workerCapacity(state, player, role)}</small>
                  {d.sopra.map(id => <WorkerChip key={id} id={id} blocked={d.blocked.includes(id)} />)}
                </div>
                <div className="slot-row">
                  <small>Sotto {d.sotto.length}/{state.slots[role].sotto}</small>
                  {d.sotto.map(id => <WorkerChip key={id} id={id} blocked={d.blocked.includes(id)} />)}
                </div>
              </div>
            </div>
          );
        })}
        <div className="dept direzione">
          <div className="dept-head"><b>{state.industrial?.enabled && state.industrial.development === 'off' ? 'Commesse completate' : 'Direzione'}</b></div>
          <div className="slots">
            {!(state.industrial?.enabled && state.industrial.development === 'off' && !state.welfareEnabled && state.servicesMode !== 'struttura') && <div className="slot-row">
              <small>{state.servicesMode === 'struttura' ? 'Struttura Sopra' : 'Impiegati'} {player.direzione.sopra.length}/{state.slots.direzione.sopra}</small>
              {player.direzione.sopra.map((it, i) => {
                if (it && it.struttura) return (
                  <div key={i} className="chip welfare" title={`Potenza T${state.strutturaCards[it.idx]?.power.Tessile || 0}/M${state.strutturaCards[it.idx]?.power.Metallurgica || 0}/C${state.strutturaCards[it.idx]?.power.Chimica || 0}`}>
                    🏗 Struttura #{it.idx + 1}
                  </div>
                );
                const imp = WORKER_BY_ID[it];
                if (imp?.power) return (
                  <div key={i} className="chip welfare" title={`Avanza ${Object.entries(imp.power).map(([s, n]) => `${s} +${n}`).join(', ')}`}>
                    👔 {imp.nation}
                  </div>
                );
                return (
                  <div key={i} className="chip welfare" title={`Avanza ${state.welfareById[it].s1} +${state.welfareById[it].t1}, ${state.welfareById[it].s2} +${state.welfareById[it].t2}`}>
                    🛡 {state.welfareById[it].name}
                  </div>
                );
              })}
            </div>}
            {(state.servicesMode === 'struttura' || state.welfareEnabled) && <div className="slot-row">
              <small>{state.servicesMode === 'struttura' ? 'Struttura Sotto' : 'Macchinari'} {player.direzione.sotto.length}/{state.slots.direzione.sotto}</small>
              {player.direzione.sotto.map((m, i) => m && m.struttura ? (
                <div key={i} className="chip welfare" title={m.effect}>
                  🏗 Struttura #{m.idx + 1}
                </div>
              ) : (
                <div key={i} className="chip welfare" title="Produce a inizio turno">
                  ⚙ {state.welfareById[m.id].name} ({m.usesLeft})
                </div>
              ))}
            </div>}
            {player.contractEngines?.length > 0 && (
              <div className="dept-row">
                <small>Commesse-motore {player.contractEngines.length}</small>
                {player.contractEngines.map((e, i) => (
                  <div key={i} className="chip welfare" style={{ borderLeft: `3px solid ${SECTOR_COLORS[e.sector]}`, opacity: e.usesLeft > 0 ? 1 : 0.4 }} title={`A inizio turno produce ${RESOURCE_OF[e.sector]} × fabbriche che toccano ${e.sector}. Usi residui: ${e.usesLeft ?? 0}`}>
                    🏭 {RESOURCE_OF[e.sector]} {e.usesLeft > 0 ? '·'.repeat(e.usesLeft) : '✓'}
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="won">
            {player.contractsWon.map((c, i) => (
              <span key={i} className="pv-chip" title={`Commessa ${c.size}`}>{c.pv} PV</span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
