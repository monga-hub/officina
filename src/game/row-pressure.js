import { activeTrackEnd, rowTrackModel } from './data.js';
import { hireCost, WORKER_BY_ID } from './engine.js';
import { tokenWelfare } from './row-economy.js';

const roles = ['terziario', 'secondario', 'primario'];
export function rowPressureState(state, d) {
  const layout = rowTrackModel(state.trackModel);
  const developed = activeTrackEnd(d.prod, 0, state.trackModel, true, state.rowEconomy?.productionThresholds) / layout.columns;
  const available = activeTrackEnd(d.prod, d.tension, state.trackModel, true, state.rowEconomy?.productionThresholds) / layout.columns;
  return { sector: d.sector, position: d.prod, tension: d.tension,
    staffed: d.sopra.some(id => !d.blocked.includes(id)), welfare: d.sustainableWelfare || 0,
    developed, available, blocked: developed - available,
    buffer: Math.max(0, layout.rows - developed - d.tension),
  };
}
export function newRowPressure(state) {
  const layout = rowTrackModel(state.trackModel);
  // Solo con questa distribuzione una riga persa equivale esattamente a una risorsa.
  const unitRows = roles.every(role => state.tracks[role].slice(1).every((cell, i) =>
    i % layout.columns === 0 ? cell?.res === 1 && Object.keys(cell).length === 1 : cell == null));
  return { unitRows, welfareMode: tokenWelfare(state) ? 'tokens' : 'permanent', starts: [], productions: [], recoveries: [], contacts: [], actions: [], lastStart: null };
}
export function sampleRowPressureStart(out, state) {
  if (state.phase !== 'move' || state.pending) return;
  const stamp = `${state.turn}:${state.current}`;
  if (out.lastStart === stamp) return;
  out.lastStart = stamp;
  for (const role of roles) out.starts.push({ turn: state.turn, seat: state.current, role,
    ...rowPressureState(state, state.players[state.current].depts[role]) });
}
// Osservazione nel runner, mai nello stato di gioco: i rollout non vedono questi dati.
export function observeRowPressure(out, before, cmd, after) {
  const seat = before.current, player = before.players[seat], next = after.players[seat];
  const seq = out.actions.length;
  const actionRole = cmd.role || roles.find(r => player.depts[r].sector === cmd.sector);
  const action = { seq, turn: before.turn, seat, type: cmd.type, role: actionRole,
    ...(cmd.type === 'investWelfare' && before.rowEconomy.welfareScope === 'factory' ? { roles: [...roles] } : {}) };
  if (cmd.type === 'hire' && before.rowEconomy?.enabled && before.rowEconomy.welfareHireDiscount) {
    const w = WORKER_BY_ID[cmd.cardId];
    const withoutDiscount = { ...before, rowEconomy: { ...before.rowEconomy, welfareHireDiscount: false } };
    action.hirePaid = hireCost(before, player, w, cmd.role, cmd.side);
    action.welfareSaved = hireCost(withoutDiscount, player, w, cmd.role, cmd.side) - action.hirePaid;
  }
  out.actions.push(action);
  for (const role of roles) {
    const b = rowPressureState(before, player.depts[role]), a = rowPressureState(after, next.depts[role]);
    if (a.staffed && a.blocked > 0 && (!b.staffed || b.blocked === 0))
      out.contacts.push({ seq, turn: before.turn, seat, role, cause: cmd.type, before: b, after: a });
  }
  if (cmd.type === 'activate') {
    const role = roles.find(r => player.depts[r].sector === cmd.sector);
    const b = rowPressureState(before, player.depts[role]), a = rowPressureState(after, next.depts[role]);
    const sustainable = cmd.sustainableRow !== undefined;
    const potential = sustainable ? Math.min(b.welfare, b.developed) : b.developed;
    const actual = sustainable ? Math.min(b.welfare, b.available) : b.available;
    out.productions.push({ seq, turn: before.turn, seat, role, sustainable, protected: cmd.welfareToken === true, before: b, after: a,
      modePotentialRows: potential, actualRows: actual, modeLostRows: potential - actual,
      voluntaryUnusedRows: sustainable ? Math.max(0, b.available - actual) : 0,
    });
  }
  if (cmd.type === 'repress' || cmd.type === 'spendWelfareToken' || (cmd.type === 'activate' && cmd.sustainableRow !== undefined)) {
    const role = cmd.role || roles.find(r => player.depts[r].sector === cmd.sector);
    const b = rowPressureState(before, player.depts[role]), a = rowPressureState(after, next.depts[role]);
    out.recoveries.push({ seq, turn: before.turn, seat, role, type: cmd.type === 'repress' ? 'repression' : cmd.type === 'spendWelfareToken' ? 'welfare' : 'sustainable',
      reduction: b.tension - a.tension, reopened: a.available - b.available, before: b, after: a });
  }
}

export function summarizeRowPressure(samples) {
  const starts = samples.flatMap(s => s.starts).filter(s => s.staffed);
  const productions = samples.flatMap(s => s.productions);
  const recoveries = samples.flatMap(s => s.recoveries);
  const sum = (xs, fn) => xs.reduce((n,x) => n + fn(x), 0);
  const summarize = xs => ({ n: xs.length, blockedBefore: xs.filter(x=>x.before.blocked>0).length,
    blockedAfter: xs.filter(x=>x.after.blocked>0).length,
    positiveTensionWithoutBlock: xs.filter(x=>x.before.tension>0 && !x.before.blocked).length,
    developedRows: sum(xs,x=>x.before.developed), blockedRows: sum(xs,x=>x.before.blocked),
    potential: sum(xs,x=>x.modePotentialRows), lost: sum(xs,x=>x.modeLostRows),
    voluntaryUnused: sum(xs,x=>x.voluntaryUnusedRows),
  });
  const summary = { unitRows: samples.every(s=>s.unitRows), all: summarize(productions),
    intense: summarize(productions.filter(x=>!x.sustainable)), sustainable: summarize(productions.filter(x=>x.sustainable)),
    starts: { n: starts.length, blocked: starts.filter(x=>x.blocked>0).length },
    phases: [1,8,15,22].map(from=>({ from, to:from+6, ...summarize(productions.filter(x=>x.turn>=from && x.turn<=from+6)) })),
    byDevelopment: [1,2,3,4,5,6].map(rows=>({ rows, ...summarize(productions.filter(x=>x.before.developed===rows)) })),
    recoveries: ['sustainable','repression', ...(samples.some(s=>s.welfareMode==='tokens')?['welfare']:[])].map(type=>{
      const xs=recoveries.filter(x=>x.type===type);
      return { type, n:xs.length, effective:xs.filter(x=>x.reduction>0).length,
        beforeAnyBlock:xs.filter(x=>x.reduction>0 && x.before.blocked===0).length,
        reopened:sum(xs,x=>x.reopened) };
    }),
  };
  return summary;
}
export function formatRowPressure(samples) {
  const s = summarizeRowPressure(samples), a = s.all;
  const rate = (x,n) => n ? `${(100*x/n).toFixed(1)}%` : 'n.d.';
  return [
    'TENSIONE E RIGHE SVILUPPATE — osservazione, regole invariate',
    `Produzioni con righe sviluppate bloccate PRIMA dell’incasso: ${a.blockedBefore}/${a.n} (${rate(a.blockedBefore,a.n)}). DOPO: ${a.blockedAfter}/${a.n}.`,
    `Produzioni con tensione positiva ma nessuna riga sviluppata bloccata: ${a.positiveTensionWithoutBlock}/${a.n}.`,
    `Righe bloccate / sviluppate nelle produzioni: ${a.blockedRows}/${a.developedRows} (${rate(a.blockedRows,a.developedRows)}).`,
    `Perdita diretta nella modalità scelta: ${a.lost}/${a.potential} righe (${rate(a.lost,a.potential)})${s.unitRows ? ', ciascuna pari a una risorsa in questo template' : '; risorse non stimate per questo template'}.`,
    `Righe accessibili non utilizzate scegliendo sostenibile: ${a.voluntaryUnused}; sono una rinuncia volontaria, non righe bloccate.`,
    `Righe bloccate a inizio turno nei reparti con operai: ${s.starts.blocked}/${s.starts.n} osservazioni (${rate(s.starts.blocked,s.starts.n)}).`,
    ...s.phases.map(p=>`Turni ${p.from}–${p.to}: ${p.blockedBefore}/${p.n} produzioni con blocco; perdita diretta ${p.lost}/${p.potential}.`),
    ...s.recoveries.map(r=>`${r.type === 'sustainable' ? 'Sostenibile' : r.type === 'welfare' ? 'Gettone welfare' : 'Repressione'}: ${r.n} usi; ${r.effective} riducono tensione; ${r.beforeAnyBlock} di questi avvengono senza righe ancora bloccate; ${r.reopened} righe riaperte.`),
    'Confronto locale a parità di sviluppo e modalità scelta, non partita controfattuale senza tensione. Basso danno osservato può riflettere prevenzione o rinuncia a produrre.',
  ];
}
