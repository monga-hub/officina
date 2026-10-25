import { initGame, applyCommand, scorePlayer } from '../game/engine.js';
import { chooseCommand } from '../game/ai.js';
import { newRowPressure, observeRowPressure, sampleRowPressureStart } from '../game/row-pressure.js';
export async function runGame(config, progress = () => {}) {
  let s = initGame(config), count = 0, last = '';
  const pressure = newRowPressure(s), commands = [], started = performance.now();
  while (!s.gameOver) {
    if (++count > 20000) throw new Error('Limite di sicurezza: la partita non termina.');
    const stamp = `${s.turn}:${s.current}`;
    if (stamp !== last) { progress({ turn: s.turn, seat: s.current }); last = stamp; }
    sampleRowPressureStart(pressure, s);
    const cmd = chooseCommand(s);
    if (!cmd) throw new Error(`Nessuna mossa al turno ${s.turn}.`);
    const before = s; s = applyCommand(s, cmd);
    observeRowPressure(pressure, before, cmd, s); commands.push(cmd);
  }
  const people = s.players.map(p => ({ ...scorePlayer(s,p), stats: { ...p.industrialStats }, welfareTokens: p.welfareTokens || 0,
    spent: { ...p.coinsSpentBy }, income: p.coinsGained,
    departments: Object.entries(p.depts).filter(([r])=>r!=='direzione').map(([role,d])=>({role,sector:d.sector,prod:d.prod,tension:d.tension})),
  }));
  return { seed: config.seed, turns: s.turn, elapsedMs: performance.now()-started, people, pressure, commands };
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
export function textReport(config, games, status) {
  const s=summarize(games), f=n=>n.toLocaleString('it-IT',{maximumFractionDigits:2});
  const tokens=config.rulesRevision>=2;
  return [`OFFICINA 1907 — ${config.name}`,`Esito: ${status}. ${games.length}/${config.simulation.games} partite completate; ${s.players} giocatori-partita.`,
    ...(config.contractsOnly ? ['Punteggio: solo PV delle commesse; nessuna gara o bonus finale. Pareggi: marchi, poi numero di commesse.'] : []),
    ...(config.rulesRevision>=3 ? ['Assunzioni: −1 marco per ogni operaio già presente della stessa nazionalità nello stesso reparto, minimo 1. Sviluppo sul valore stampato; macchinari esclusi.'] : []),
    ...(config.rulesRevision>=4 ? ['Macchinari da tensione: ciascuno rende marchi pari alla tensione del reparto prima della produzione, anche a righe bloccate. Due macchinari sommano le rendite.'] : []),
    `IA ${config.simulation.ai} · d${config.simulation.depth} r${config.simulation.rollouts}; semi completati: ${games.map(g=>g.seed).join(', ')}.`,
    `Medie per giocatore: ${f(s.pv)} PV; ${f(s.welfare)} acquisti welfare; ${f(s.repression)} repressioni; ${f(tokens?s.protected:s.sustainable)} produzioni ${tokens?'protette':'sostenibili'}; ${f(s.contracts)} commesse.`,
    ...(tokens?[`Gettoni welfare: ${f(s.welfareRecoveries)} recuperi e ${f(s.tokensRemaining)} gettoni rimasti per giocatore. Repressione a costo fisso ${config.repressionBase}: azzera un reparto, +1 agli altri due (entro il massimo).`]:[]),
    `Produzioni con righe sviluppate bloccate: ${s.blocked}/${s.productions}. Righe perse nella modalità scelta: ${s.lostRows}/${s.potentialRows}.`,
    `Distribuzione welfare: ${s.welfareHistogram.map(x=>`${x.count}: ${x.players} giocatori`).join('; ')}.`,
    `Distribuzione repressioni: ${s.repressionHistogram.map(x=>`${x.count}: ${x.players} giocatori`).join('; ')}.`,
    ...(!tokens?s.ordinalUses.filter(x=>x.owners).map(x=>`Welfare n.${x.n}: ${x.owners} acquirenti; ${x.rows} produzioni usano almeno ${x.n} righe; ${x.hires} assunzioni risparmiano almeno ${x.n} marchi.`):[]),
    'Usi osservati, non prova di convenienza. Nessun acquisto imposto. Confrontare anche punteggi, costi e turni.',
    ...games.flatMap(g=>g.people.map(p=>`Seme ${g.seed}, ${p.name}: ${p.total} PV; W ${p.stats.welfareBuys}; repressioni ${p.stats.repressions}; ${tokens?`protette ${p.stats.protectedProductions||0}; recuperi welfare ${p.stats.welfareRecoveries||0}; gettoni rimasti ${p.welfareTokens||0}`:`sostenibili ${p.stats.sustainableProductions}`}; ${p.coins} marchi finali.`)),
    '\nCONFIGURAZIONE DEL LABORATORIO\n'+JSON.stringify(config,null,2)].join('\n');
}
