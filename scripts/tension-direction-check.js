import assert from 'node:assert/strict';
import { defaults, gameConfig, parseConfig } from '../src/lab/config.js';
import { activeTrackRange } from '../src/game/data.js';
import { initGame, legalCommands, applyCommand, forkForSearch, WORKER_BY_ID } from '../src/game/engine.js';
import { productionPreview } from '../src/components/production-choices.js';
import { rowPressureState } from '../src/game/row-pressure.js';
import { runGame, textReport } from '../src/lab/run.js';
const c=defaults();c.tensionDirection='same';c.productionUnlock='cells';c.simulation.ai='greedy';c.turns=6;
c.track=Array(17).fill(null);c.track[2]={res:1};c.track[6]={res:2};c.track[8]={res:3};c.track[14]={res:4};
assert.deepEqual(parseConfig(JSON.stringify(c)),c);
assert.throws(()=>gameConfig({...c,tensionDirection:'wrong'}),/tensione/);
const old={...c};delete old.tensionDirection;assert.equal(gameConfig(old).rowEconomy.tensionDirection,'opposed');
for(const prod of [1,3,6,8,11,16])for(let tension=0;tension<=4;tension++) {
 const same=activeTrackRange(prod,tension,c.trackModel,true,c.productionThresholds,'cells','same');
 assert.equal(same.available,Math.max(0,prod-tension*4));
 const legacy=activeTrackRange(prod,tension,c.trackModel,true,c.productionThresholds,'cells');
 assert.equal(legacy.available,Math.min(prod,(4-tension)*4));
}
const rowRange=activeTrackRange(5,1,c.trackModel,true,[1,5,9,13],'rows','same');
assert.deepEqual(rowRange,{start:5,end:8,developed:8,available:4},'Whole-row rules unlock the full second row and tension covers the first');
const s=initGame(gameConfig(c)),p=s.players[0],d=p.depts.terziario;
s.phase='action';p.node='Tessile';p.resCap={...p.resCap,enabled:false};d.prod=8;d.tension=1;
d.sopra=[Object.values(WORKER_BY_ID).find(w=>w.sector==='Tessile').id];
const cmd={type:'activate',sector:'Tessile',intensity:1};
assert.equal(productionPreview(s,cmd).resources.Tessuti,5,'First row blocked; both rewards in second row produce');
assert.deepEqual([rowPressureState(s,d).developed,rowPressureState(s,d).available,rowPressureState(s,d).blockedResources],[2,1,1]);
const rowState=structuredClone(s);rowState.rowEconomy.productionUnlock='rows';rowState.players[0].depts.terziario.prod=5;
assert.equal(productionPreview(rowState,cmd).resources.Tessuti,5,'Same-direction option works independently with whole-row unlock');
d.tension=2;assert.equal(productionPreview(s,cmd).resources.Tessuti,0,'Both developed rows blocked');
const machine=Object.values(WORKER_BY_ID).find(w=>w.effect?.f2?.conta==='tensione');assert.ok(machine);d.sotto=[machine.id];
assert.equal(productionPreview(s,cmd).coins,2,'Tension machines still pay with all resource rows blocked');
assert.deepEqual(applyCommand(forkForSearch(s),cmd).players[0].resources,applyCommand(s,cmd).players[0].resources);
d.sotto=[];d.tension=1;s.rowEconomy.welfareMode='permanent';d.sustainableWelfare=1;
const sustainable=legalCommands(s).filter(c=>c.type==='activate'&&c.sustainableRow!==undefined);
assert.equal(sustainable.length,1);assert.equal(sustainable[0].sustainableRow,1,'Select physical second row, not covered first row');
assert.equal(productionPreview(s,sustainable[0]).resources.Tessuti,5);
for(const players of [2,3,4]) {
 const editor={...c,players},cfg=gameConfig(editor),game=await runGame(cfg);
 assert.deepEqual(game.study.verified,{completed:true,money:players,resources:players,machineIncome:players});
 let replay=initGame(cfg);for(const command of game.commands)replay=applyCommand(replay,command);
 assert.deepEqual(replay,game.finalState);
 const report=textReport(editor,[game],'Completata');assert.ok(report.includes('prima riga coperta per prima'));assert.ok(report.includes('Risorse escluse dal tracciato'));
}
console.log('OK: same-direction tension blocks first physical rows, partial development, independent machines, sustainable physical row selection, backward compatibility, 2/3/4-player replay, finances and pressure reports.');
