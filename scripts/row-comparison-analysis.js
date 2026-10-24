import { studyConfig } from './row-economy-config.js';
import { TRACK_MODELS } from '../src/game/data.js';

export function comparisonConfig(seed, players, rows, depth = 6) {
  if (![4, 6].includes(rows)) throw new Error('Confronto fra 4 e 6 righe');
  const trackModel = rows === 4 ? 'righe4corte' : 'righe4';
  return { ...studyConfig(seed, players, 'free', depth), trackModel,
    tracks: Object.fromEntries(['terziario','secondario','primario'].map(r => [r, structuredClone(TRACK_MODELS[trackModel].track)])),
  };
}

// Una sola osservazione per giocatore/reparto: il primo blocco, anche dopo un'assunzione.
// Le scelte sono sequenze osservate, non attribuzioni causali delle intenzioni dell'IA.
export function responsesToBlocks(pressure, finalTurn = 28) {
  const seen = new Set();
  return pressure.contacts.filter(c => {
    const key = `${c.seat}:${c.role}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  }).map(c => {
    const future = pressure.actions.filter(a => a.seat === c.seat && a.seq > c.seq);
    const productions = pressure.productions.filter(a => a.seat === c.seat && a.seq > c.seq);
    const recovery = pressure.recoveries.filter(a => a.seat === c.seat && a.role === c.role && a.seq > c.seq && a.reduction > 0);
    const own = productions.filter(a => a.role === c.role);
    const other = productions.filter(a => a.role !== c.role);
    const first = future.find(a => ['activate','repress'].includes(a.type));
    let response = 'nessuna';
    if (first) {
      if (recovery.some(r => r.seq === first.seq)) response = 'recupera';
      else if (first.type === 'activate') response = first.role === c.role ? 'produce_stesso' : 'produce_altro';
      else response = 'recupera_altro';
    }
    const returnSeq = own[0]?.seq ?? Infinity;
    return { seat:c.seat, role:c.role, turn:c.turn, cause:c.cause,
      remaining:Math.max(0,finalTurn-c.turn), response,
      delay:first ? first.turn-c.turn : null,
      recovered:recovery.length>0, recoveredBeforeReturn:recovery.some(r=>r.seq<=returnSeq),
      returned:own.length>0, switched:other.length>0,
      otherBeforeReturn:other.filter(a=>a.seq<returnSeq).length,
      neverProducedAgain:own.length===0,
      neverProducedAgainButOther:own.length===0 && other.length>0,
    };
  });
}

export function responseSummary(episodes) {
  return { n:episodes.length,
    next:Object.fromEntries(['recupera','produce_stesso','produce_altro','recupera_altro','nessuna'].map(k=>[k,episodes.filter(e=>e.response===k).length])),
    recovered:episodes.filter(e=>e.recovered).length,
    returned:episodes.filter(e=>e.returned).length,
    returnedWithoutRecovery:episodes.filter(e=>e.returned&&!e.recovered).length,
    neverProducedAgain:episodes.filter(e=>e.neverProducedAgain).length,
    neverProducedAgainButOther:episodes.filter(e=>e.neverProducedAgainButOther).length,
    firstTurn:episodes.length?episodes.reduce((a,e)=>a+e.turn,0)/episodes.length:null,
  };
}
