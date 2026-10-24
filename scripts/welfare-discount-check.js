import assert from 'node:assert/strict';
import { initGame, applyCommand, legalCommands, WORKER_BY_ID, hireCost } from '../src/game/engine.js';
import { normalizeRowEconomy } from '../src/game/row-economy.js';
import { newRowPressure, observeRowPressure } from '../src/game/row-pressure.js';
import { comparisonConfig } from './row-comparison-analysis.js';

const roles=['terziario','secondario','primario'];
const at=(s,node)=>{s.current=0;s.phase='action';s.pending=null;s.pendingQueue=[];s.sindacatoSession=null;s.players[0].node=node;return s;};
assert.equal(normalizeRowEconomy().welfareHireDiscount,false);
assert.equal(normalizeRowEconomy({welfareHireDiscount:'true'}).welfareHireDiscount,false);
const cfg=comparisonConfig(1907,2,4,6);
Object.assign(cfg.rowEconomy,{welfareScope:'factory',welfareHireDiscount:true});
let s=initGame(cfg);const pressure=newRowPressure(s);
const worker=role=>Object.values(WORKER_BY_ID).find(w=>!w.power&&w.sector===s.players[0].depts[role].sector&&w.v===4);
const first=worker(roles[0]);
assert.equal(hireCost(s,s.players[0],first,roles[0],'sopra'),4,'Nessuno sconto prima del welfare');
at(s,'Servizi');s=applyCommand(s,{type:'investWelfare',scope:'factory'});
for(const role of roles) {
  const p=s.players[0],d=p.depts[role],w=worker(role);
  at(s,d.sector);d.prod=1;p.coins=2;
  const bank=s.nodeBanks[d.sector][0];s.banks[bank]=[w.id];
  assert.ok(!legalCommands(s).some(c=>c.type==='hire'&&c.cardId===w.id));
  p.coins=3;
  assert.equal(hireCost(s,p,w,role,'sopra'),3);
  assert.equal(hireCost(s,p,w,role,'sotto'),4,'Macchinari a prezzo invariato');
  const command=legalCommands(s).find(c=>c.type==='hire'&&c.cardId===w.id&&c.role===role&&c.side==='sopra');
  assert.ok(command,'Lo sconto rende legale l’assunzione con tre marchi');
  assert.ok(!legalCommands(s).some(c=>c.type==='hire'&&c.cardId===w.id&&c.side==='sotto'));
  const before=s,spent=p.coinsSpentBy.lavoratori;
  s=applyCommand(s,command);observeRowPressure(pressure,before,command,s);
  assert.equal(s.players[0].coinsSpentBy.lavoratori-spent,3);
  assert.equal(s.players[0].depts[role].prod,5,'Avanzamento del valore stampato quattro');
  assert.equal(pressure.actions.at(-1).welfareSaved,1);
  assert.equal(pressure.actions.at(-1).hirePaid,3);
}
let p=s.players[0],w=worker(roles[0]);
p.struttura=['hire-1_Tessile+Chimica'];at(s,'Tessile');
assert.equal(hireCost(s,p,w,roles[0],'sopra'),2,'Si cumula allo sconto strutture esistente');
assert.equal(hireCost(s,p,{...w,v:1},roles[0],'sopra'),1,'Minimo uno anche con più sconti del valore');
const floorState=structuredClone(s),floorPlayer=floorState.players[0];
const cheap=Object.values(WORKER_BY_ID).find(c=>!c.power&&c.v===2&&c.sector===floorPlayer.depts[roles[0]].sector);
at(floorState,cheap.sector);floorPlayer.struttura=[`hire-1_${cheap.sector}`];floorPlayer.coins=0;floorPlayer.depts[roles[0]].prod=1;
const floorBank=floorState.nodeBanks[cheap.sector][0];floorState.banks[floorBank]=[cheap.id];
assert.equal(hireCost(floorState,floorPlayer,cheap,roles[0],'sopra'),1,'Due sconti su un operaio da due non lo rendono gratuito');
assert.ok(!legalCommands(floorState).some(c=>c.type==='hire'&&c.cardId===cheap.id),'Nessuna assunzione senza monete');
floorPlayer.coins=1;
const floorCommand=legalCommands(floorState).find(c=>c.type==='hire'&&c.cardId===cheap.id&&c.side==='sopra'&&c.role===roles[0]);
assert.ok(floorCommand);
const floorAfter=applyCommand(floorState,floorCommand),floorPressure=newRowPressure(floorState);
observeRowPressure(floorPressure,floorState,floorCommand,floorAfter);
assert.equal(floorAfter.players[0].coinsSpentBy.lavoratori-floorPlayer.coinsSpentBy.lavoratori,1);
assert.equal(floorAfter.players[0].depts[roles[0]].prod,3,'Pagare uno mantiene l’avanzamento stampato due');
assert.equal(floorPressure.actions.at(-1).hirePaid,1);
assert.equal(floorPressure.actions.at(-1).welfareSaved,0,'Nessun risparmio fittizio quando il prezzo è già al minimo');
p.struttura=[];
const manager=Object.values(WORKER_BY_ID).find(w=>w.power);
assert.equal(hireCost(s,p,manager,'direzione','sopra'),manager.v,'Impiegati invariati');
assert.equal(hireCost(s,s.players[1],w,roles[0],'sopra'),w.v,'Nessun beneficio all’avversario');
s.rowEconomy.welfareHireDiscount=false;
assert.equal(hireCost(s,p,w,roles[0],'sopra'),w.v,'Opzione disattivabile');
s.rowEconomy.welfareHireDiscount=true;p.depts[roles[0]].sustainableWelfare=0;
assert.equal(hireCost(s,p,w,roles[0],'sopra'),w.v,'Solo reparti coperti dal welfare');
console.log('✓ sconto dopo acquisto in tre reparti, accessibilità e pagamento coerenti, avanzamento stampato, esclusione Sotto/Direzione, cumulo e minimo uno, risparmio osservato');

// Acquisti aziendali cumulabili: il minimo opera su ogni valore stampato, in tutti i reparti.
let multi=initGame(cfg);multi.players[0].coins=50;
const multiPressure=newRowPressure(multi);
for(let count=1;count<=5;count++) {
  at(multi,'Servizi');const before=multi,cmd={type:'investWelfare',scope:'factory'};
  multi=applyCommand(multi,cmd);observeRowPressure(multiPressure,before,cmd,multi);
  assert.equal(multi.players[0].industrialStats.welfareBuys,count);
  assert.equal(multi.players[0].industrialStats.welfareSpent,count*cfg.rowEconomy.welfareCost);
  for(const role of roles) for(const value of [2,3,4]) {
    const card=Object.values(WORKER_BY_ID).find(c=>!c.power&&c.v===value&&c.sector===multi.players[0].depts[role].sector);
    assert.equal(hireCost(multi,multi.players[0],card,role,'sopra'),Math.max(1,value-count));
    assert.equal(hireCost(multi,multi.players[0],card,role,'sotto'),value);
  }
}
const multiRole=roles[0],multiDept=multi.players[0].depts[multiRole];
const expensive=Object.values(WORKER_BY_ID).find(c=>!c.power&&c.v===4&&c.sector===multiDept.sector);
at(multi,multiDept.sector);multi.players[0].coins=1;multiDept.prod=1;
const multiBank=multi.nodeBanks[multiDept.sector][0];multi.banks[multiBank]=[expensive.id];
const hire=legalCommands(multi).find(c=>c.type==='hire'&&c.cardId===expensive.id&&c.side==='sopra'&&c.role===multiRole);
assert.ok(hire);const beforeMultiHire=multi;multi=applyCommand(multi,hire);observeRowPressure(multiPressure,beforeMultiHire,hire,multi);
assert.equal(multi.players[0].depts[multiRole].prod,5);
assert.equal(multiPressure.actions.at(-1).hirePaid,1);
assert.equal(multiPressure.actions.at(-1).welfareSaved,3,'Cinque welfare risparmiano al massimo tre su una carta da quattro');
at(multi,multiDept.sector);multi.players[0].depts[multiRole].tension=2;
const sustainable=legalCommands(multi).find(c=>c.sustainableRow!==undefined);
assert.ok(sustainable);multi=applyCommand(multi,sustainable);
assert.equal(multi.players[0].depts[multiRole].tension,1,'Più welfare non moltiplicano il recupero sostenibile');
console.log('✓ cinque acquisti consecutivi, cumulo sui valori 2/3/4 nei tre reparti, minimo 1, risparmio reale, avanzamento stampato e recupero invariato');
