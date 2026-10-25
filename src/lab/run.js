import { newStudy, observeStudy, finishStudy, detailedReport } from './study.js';
import { initGame, applyCommand, scorePlayer } from '../game/engine.js';
import { chooseCommand } from '../game/ai.js';
import { newRowPressure, observeRowPressure, sampleRowPressureStart } from '../game/row-pressure.js';
export async function runGame(config, progress = () => {}) {
  let s = initGame(config), count = 0, last = '';
  const study = newStudy(s);
  const pressure = newRowPressure(s), commands = [], started = performance.now();
  while (!s.gameOver) {
    if (++count > 20000) throw new Error('Limite di sicurezza: la partita non termina.');
    const stamp = `${s.turn}:${s.current}`;
    if (stamp !== last) { progress({ turn: s.turn, seat: s.current }); last = stamp; }
    sampleRowPressureStart(pressure, s);
    const cmd = chooseCommand(s);
    if (!cmd) throw new Error(`Nessuna mossa al turno ${s.turn}.`);
    const before = s; s = applyCommand(s, cmd);
    observeStudy(study, before, cmd, s);
    observeRowPressure(pressure, before, cmd, s); commands.push(cmd);
  }
  const people = s.players.map(p => ({ ...scorePlayer(s,p), stats: { ...p.industrialStats }, welfareTokens: p.welfareTokens || 0,
    spent: { ...p.coinsSpentBy }, income: p.coinsGained,
    departments: Object.entries(p.depts).filter(([r])=>r!=='direzione').map(([role,d])=>({role,sector:d.sector,prod:d.prod,tension:d.tension})),
  }));
  return { release: typeof __APP_RELEASE__==='undefined'?null:__APP_RELEASE__, seed: config.seed, turns: s.turn, elapsedMs: performance.now()-started, people, pressure, commands, finalState: s, study: finishStudy(study,s) };
}
const sum = (xs, f) => xs.reduce((n,x)=>n+f(x),0);
export function summarize(games) {
  const people = games.flatMap(g=>g.people), prods = games.flatMap(g=>g.pressure.productions);
  const avg = f => people.length ? sum(people,f)/people.length : 0;
  const histogram = key => Object.entries(people.reduce((a,p)=>{const n=p.stats[key];a[n]=(a[n]||0)+1;return a;},{})).map(([count,players])=>({count:Number(count),players}));
  return { players: people.length, pv: avg(p=>p.total), welfare: avg(p=>p.stats.welfareBuys), repression: avg(p=>p.stats.repressions),
    sustainable: avg(p=>p.stats.sustainableProductions), contracts: avg(p=>p.nContracts),
    protected: avg(p=>p.stats.protectedProductions||0), welfareRecoveries: avg(p=>p.stats.welfareRecoveries||0), tokensRemaining: avg(p=>p.welfareTokens||0),
    welfareHistogram: histogram('welfareBuys'), repressionHistogram: histogram('repressions'),
    productions: prods.length, blocked: prods.filter(p=>p.before.blocked>0).length,
    lostRows: sum(prods,p=>p.modeLostRows), potentialRows: sum(prods,p=>p.modePotentialRows),
    ordinalUses: Array.from({length:Math.max(3,...people.map(p=>p.stats.welfareBuys))},(_,i)=>i+1).map(n=>({n, owners:people.filter(p=>p.stats.welfareBuys>=n).length,
      rows:prods.filter(p=>p.sustainable&&p.actualRows>=n).length,
      hires:games.reduce((nGames,g)=>nGames+g.pressure.actions.filter(a=>a.type==='hire'&&a.welfareSaved>=n).length,0)})),
  };
}
export const textReport = detailedReport;
