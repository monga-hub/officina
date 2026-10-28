import React from 'react';
import { rowTrackModel, trackGridPos, activeTrackEnd, activeTrackRange } from '../game/data.js';

export default function RowProductionTrack({ model, prod, tension, renderCell, renderReward, milestones = [], cellTitle, onCellClick, onTensionChange, selected, wholeRows = false, thresholds = null, unlock = 'rows', tensionDirection = 'opposed' }) {
  const layout = rowTrackModel(model);
  const grid = Array.from({ length: layout.rows }, () => []);
  for (let pos = 1; pos <= layout.max; pos++) {
    const [row, col] = trackGridPos(pos, layout.max, model);
    grid[row][col] = pos;
  }
  const {start,end} = activeTrackRange(prod, tension, model, wholeRows, thresholds, unlock, tensionDirection);
  const developed = activeTrackEnd(prod, 0, model, wholeRows, thresholds, unlock);
  const level = n => {
    const label = `Tensione ${n}: ${n} righe escluse`;
    const props = { className: `row-tension-step ${tension === n ? 'current' : ''} ${n > 0 && tension >= n ? 'covered' : ''}`, title: label, 'aria-label': label };
    return onTensionChange
      ? <button type="button" {...props} aria-pressed={tension === n} onClick={() => onTensionChange(n)}>{tension === n ? '✊ ' : ''}{n}</button>
      : <span {...props}>{tension === n ? '✊ ' : ''}{n}</span>;
  };
  return <div className="opposed-track" style={{ '--track-columns': layout.columns }}>
    <div className="opposed-track-head"><span>Tensione {tensionDirection==='same'?'↑':'↓'}</span><span>Sviluppo ↑ · serpentina</span></div>
    {tensionDirection!=='same'&&<div className="opposed-track-foot">{level(0)}<span>0 = nessuna riga esclusa</span></div>}
    {grid.map((positions,row)=>({positions,row})).reverse().map(({positions,row}) => <div key={row} className={`opposed-track-row ${(tensionDirection==='same'?row<tension:tension >= layout.rows - row) ? 'excluded-row' : ''}`}>
      {level(tensionDirection==='same'?row+1:layout.rows-row)}
      <div className="opposed-track-cells">
        {positions.map(pos => {
          const status = pos <= developed ? (pos >= start && pos <= end ? 'utilizzabile' : 'sviluppata, esclusa dalla tensione') : 'non ancora sviluppata';
          const props = {
            className: `opposed-cell ${pos <= developed ? 'developed' : ''} ${pos <= developed && (pos < start || pos > end) ? 'blocked-production' : ''} ${pos === prod ? 'production-marker' : ''} ${milestones.includes(pos) ? 'milestone-cell' : ''} ${selected === pos || thresholds?.includes(pos) ? 'selected-cell' : ''}`,
            title: `Casella ${pos}${thresholds?.includes(pos)?' · soglia di sblocco':''}${milestones.includes(pos)?` · premio milestone ${pos<=prod?'raggiunto':'da raggiungere'}`:''} · ${status}${cellTitle ? ' · ' + cellTitle(pos) : ''}`,
          };
          const content = <><small>{thresholds?.includes(pos)?'◆ ':''}{pos} {row % 2 === 0 ? '→' : '←'}</small><span>{renderCell(pos)}</span>{renderReward?.(pos)}{pos === prod && <b className="production-pin" aria-label="Segnalino produzione">P</b>}</>;
          return onCellClick
            ? <button key={pos} type="button" {...props} aria-label={props.title} aria-pressed={selected === pos} onClick={() => onCellClick(pos)}>{content}</button>
            : <span key={pos} {...props}>{content}</span>;
        })}
      </div>
    </div>)}
    {tensionDirection==='same'&&<div className="opposed-track-foot">{level(0)}<span>0 = nessuna riga esclusa</span></div>}
  </div>;
}
