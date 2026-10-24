import React from 'react';
import { rowTrackModel, trackGridPos, activeTrackEnd } from '../game/data.js';

export default function RowProductionTrack({ model, prod, tension, renderCell, cellTitle, onCellClick, onTensionChange, selected, wholeRows = false }) {
  const layout = rowTrackModel(model);
  const grid = Array.from({ length: layout.rows }, () => []);
  for (let pos = 1; pos <= layout.max; pos++) {
    const [row, col] = trackGridPos(pos, layout.max, model);
    grid[row][col] = pos;
  }
  const end = activeTrackEnd(prod, tension, model, wholeRows);
  const developed = activeTrackEnd(prod, 0, model, wholeRows);
  const level = n => {
    const label = `Tensione ${n}: ${n} righe escluse`;
    const props = { className: `row-tension-step ${tension === n ? 'current' : ''} ${n > 0 && tension >= n ? 'covered' : ''}`, title: label, 'aria-label': label };
    return onTensionChange
      ? <button type="button" {...props} aria-pressed={tension === n} onClick={() => onTensionChange(n)}>{tension === n ? '✊ ' : ''}{n}</button>
      : <span {...props}>{tension === n ? '✊ ' : ''}{n}</span>;
  };
  return <div className="opposed-track" style={{ '--track-columns': layout.columns }}>
    <div className="opposed-track-head"><span>Tensione ↑</span><span>Sviluppo ↓ · serpentina</span></div>
    {grid.map((positions, row) => <div key={row} className={`opposed-track-row ${tension >= layout.rows - row ? 'excluded-row' : ''}`}>
      {level(layout.rows - row)}
      <div className="opposed-track-cells">
        {positions.map(pos => {
          const status = pos <= developed ? (pos <= end ? 'utilizzabile' : 'sviluppata, esclusa dalla tensione') : 'non ancora sviluppata';
          const props = {
            className: `opposed-cell ${pos <= developed ? 'developed' : ''} ${pos <= developed && pos > end ? 'blocked-production' : ''} ${pos === prod ? 'production-marker' : ''} ${selected === pos ? 'selected-cell' : ''}`,
            title: `Casella ${pos} · ${status}${cellTitle ? ' · ' + cellTitle(pos) : ''}`,
          };
          const content = <><small>{pos} {row % 2 === 0 ? '→' : '←'}</small><span>{renderCell(pos)}</span>{pos === prod && <b className="production-pin" aria-label="Segnalino produzione">P</b>}</>;
          return onCellClick
            ? <button key={pos} type="button" {...props} aria-label={props.title} aria-pressed={selected === pos} onClick={() => onCellClick(pos)}>{content}</button>
            : <span key={pos} {...props}>{content}</span>;
        })}
      </div>
    </div>)}
    <div className="opposed-track-foot">{level(0)}<span>0 = nessuna riga esclusa</span></div>
  </div>;
}
