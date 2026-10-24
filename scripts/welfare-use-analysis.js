import assert from 'node:assert/strict';

export function investmentUses(record) {
  assert.ok(record.pressure.unitRows,'Analisi della rinuncia produttiva: una risorsa per riga');
  return record.pressure.actions.filter(a=>a.type==='investWelfare').map(buy=>{
    const roles=buy.roles || [buy.role];
    const following=record.pressure.productions.filter(a=>a.seat===buy.seat&&roles.includes(a.role)&&a.seq>buy.seq);
    const uses=following.filter(a=>a.sustainable);
    const recovery=record.pressure.recoveries.filter(a=>a.seat===buy.seat&&roles.includes(a.role)&&a.seq>buy.seq&&a.type==='sustainable');
    assert.equal(uses.length,recovery.length);
    return {seed:record.seed,seat:buy.seat,role:buy.role,...(buy.roles?{roles}:{}),turn:buy.turn,
      cost:record.config.rowEconomy.welfareCost,uses:uses.length,productionsAfter:following.length,
      tensionReduced:recovery.reduce((n,a)=>n+a.reduction,0),
      preventiveAtZero:uses.filter(a=>a.before.tension===0).length,
      // Rispetto a produzione intensa nello STESSO stato, non recupero realmente risparmiato.
      tensionAdvantage:uses.reduce((n,a)=>n+Math.min(record.rows,a.before.tension+1)-a.after.tension,0),
      reopened:recovery.reduce((n,a)=>n+a.reopened,0),
      foregoneResources:uses.reduce((n,a)=>n+a.voluntaryUnusedRows,0),
      trackResources:uses.reduce((n,a)=>n+a.actualRows,0),
      firstUse:uses[0]?.turn??null,
    };
  });
}

export function playerMetrics(record, seat) {
  const p=record.people.find(p=>p.playerId===seat);
  assert.ok(p);
  const prods=record.pressure.productions.filter(a=>a.seat===seat);
  return {pv:p.total,contractPV:p.pvContracts,racePV:p.pvRace,contracts:p.nContracts,
    finalCoins:p.coins,welfareBuys:p.stats.welfareBuys,welfareSpent:p.stats.welfareSpent,
    repressions:p.stats.repressions,repressionSpent:p.stats.repressionSpent,
    managementSpent:p.stats.welfareSpent+p.stats.repressionSpent,
    productions:prods.length,sustainable:p.stats.sustainableProductions,
    trackResources:prods.reduce((n,a)=>n+a.actualRows,0),lostResources:prods.reduce((n,a)=>n+a.modeLostRows,0),
    machineryCoins:p.econ.src.lavFisso,contractCoins:p.econ.src.commessa,
  };
}

export function pairedMetrics(baseline, alternative, seat) {
  const withWelfare=playerMetrics(baseline,seat), withoutWelfare=playerMetrics(alternative,seat);
  return {withWelfare,withoutWelfare,
    difference:Object.fromEntries(Object.keys(withWelfare).map(k=>[k,withWelfare[k]-withoutWelfare[k]]))};
}

// Isola SOLO la resa del tracciato, a calendario e sviluppo fissi. Non ricostruisce
// una partita legale: scambi, commesse e scelte alternative richiedono il confronto completo.
export function fixedScheduleYield(record) {
  return record.pressure.actions.filter(a=>a.type==='investWelfare').map(buy=>{
    let actualResources=0, withoutResources=0;
    for(const role of buy.roles || [buy.role]) {
      let control=record.config.startTension[role], without=control;
      const events=[...record.pressure.productions.map(a=>({...a,kind:'production'})),
        ...record.pressure.recoveries.filter(a=>a.type==='repression').map(a=>({...a,kind:'repression'}))]
        .filter(a=>a.seat===buy.seat&&a.role===role).sort((a,b)=>a.seq-b.seq);
      for(const e of events) {
        assert.equal(control,e.before.tension,'Nessuna variazione di tensione omessa dal calendario');
        if(e.kind==='production') {
          actualResources+=e.actualRows;
          withoutResources+=Math.max(0,Math.min(e.before.developed,record.rows-without));
          without=Math.min(record.rows,without+1);
          control=e.sustainable?Math.max(0,control-1):Math.min(record.rows,control+1);
        } else {without=Math.max(0,without-2);control=Math.max(0,control-2);}
        assert.equal(control,e.after.tension);
      }
    }
    return {seed:record.seed,seat:buy.seat,role:buy.role,...(buy.roles?{roles:buy.roles}:{}),actualResources,withoutResources,difference:actualResources-withoutResources};
  });
}
