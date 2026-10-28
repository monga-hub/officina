import assert from 'node:assert/strict';
import {defaults,gameConfig,parseConfig} from '../src/lab/config.js';
import {initGame,applyCommand,legalCommands,WORKER_BY_ID,forkForSearch} from '../src/game/engine.js';
import {chooseCommand} from '../src/game/ai.js';
import {productionPreview} from '../src/components/production-choices.js';
import {runGame,textReport} from '../src/lab/run.js';
import {saveGame,loadGame,gameSession} from '../src/lab/saved-game.js';

const c=defaults();c.simulation.ai='greedy';
c.track[1]={res:1,milestoneReward:{res:1,coins:2}};
c.track[2]={res:3,coins:2,milestoneReward:{res:2,coins:3}};
c.track[3]={milestoneReward:{res:1,coins:2}};
c.track[5]={res:1,milestoneReward:{res:4,coins:1}};
assert.deepEqual(parseConfig(JSON.stringify(c)),c);
for(const bad of [null,[],{}, {pv:3},{res:-1},{coins:1.5},{coins:21}]) {
 const invalid=structuredClone(c);invalid.track[2].milestoneReward=bad;
 assert.throws(()=>gameConfig(invalid),/milestone/);
}
const config=gameConfig(c),s=initGame(config),p=s.players[0];
assert.equal(p.coins,c.startingCoins[0]+6);
assert.deepEqual(p.resources,{Tessuti:1,Acciaio:1,Coloranti:1});
assert.equal(p.coinsGainedBy.tracciati,6);
s.phase='action';p.node='Tessile';p.coins=50;p.depts.terziario.tension=4;p.resCap={...p.resCap,enabled:false};
const worker=Object.values(WORKER_BY_ID).find(w=>w.sector==='Tessile'&&w.v===4);
const bank=s.nodeBanks.Tessile[0];s.banks[bank]=[worker.id];
const hire=legalCommands(s).find(cmd=>cmd.type==='hire'&&cmd.side==='sopra');assert.ok(hire);
const snapshot=structuredClone(s),next=applyCommand(s,hire),q=next.players[0];
assert.equal(q.depts.terziario.prod,5);
assert.equal(q.resources.Tessuti-p.resources.Tessuti,7,'Every crossed reward pays, including two in the same row');
assert.equal(q.coins-p.coins,6-worker.v);
assert.deepEqual(s,snapshot);
const predicted=applyCommand(forkForSearch(s),hire);
assert.equal(predicted.players[0].coins,q.coins);assert.deepEqual(predicted.players[0].resources,q.resources);
// Production repeats only ordinary yields, never the milestone prizes.
next.current=0;next.phase='action';q.node='Tessile';q.depts.terziario.tension=0;
const produce={type:'activate',sector:'Tessile',intensity:1};
const preview=productionPreview(next,produce);assert.equal(preview.resources.Tessuti,5);assert.equal(preview.coins,2);
const produced=applyCommand(next,produce);
assert.equal(produced.players[0].resources.Tessuti-q.resources.Tessuti,5);
assert.equal(produced.players[0].coins-q.coins,2);
// Previously reached cells do not pay again on the next hire.
const later=structuredClone(next);later.current=0;later.phase='action';later.banks[bank]=[worker.id];
const hireAgain=legalCommands(later).find(cmd=>cmd.type==='hire'&&cmd.side==='sopra');assert.ok(hireAgain);
const advanced=applyCommand(later,hireAgain);
assert.equal(advanced.players[0].coinsGained-later.players[0].coinsGained,0);
assert.deepEqual(advanced.players[0].resources,later.players[0].resources);
// The optional threshold prize adds to the custom cell prize, once each.
const stacked=structuredClone(s);stacked.rowEconomy.milestoneResource=true;
assert.equal(applyCommand(stacked,hire).players[0].resources.Tessuti-p.resources.Tessuti,8);
let stored;saveGame(config,{state:next,history:[s],paused:true},{setItem:(k,v)=>stored=v});
const restored=gameSession(config,loadGame({getItem:()=>stored}));
assert.deepEqual(restored.state.tracks,config.tracks);assert.deepEqual(restored.history[0].tracks,config.tracks);
const aiState=structuredClone(s);aiState.aiRollout={depth:2,rollouts:1};const beforeAI=structuredClone(aiState);
assert.ok(chooseCommand(aiState));assert.deepEqual(aiState,beforeAI);
// Per-cell unlock: reaching or crossing unlocks that yield, never later cells in the row.
const cellsConfig=structuredClone(c);cellsConfig.productionUnlock='cells';
cellsConfig.track[4]={res:7,coins:4};cellsConfig.track[6]={res:9};
const cellsState=initGame(gameConfig(cellsConfig)),cp=cellsState.players[0];
cellsState.phase='action';cp.node='Tessile';cp.coins=50;cp.resCap={...cp.resCap,enabled:false};
cp.depts.terziario.sopra=[worker.id];
assert.equal(productionPreview(cellsState,produce).resources.Tessuti,1,'Future cells in the first row stay locked');
cellsState.banks[bank]=[worker.id];
const cellHire=legalCommands(cellsState).find(cmd=>cmd.type==='hire'&&cmd.side==='sopra');
const crossed=applyCommand(cellsState,cellHire);crossed.current=0;crossed.phase='action';crossed.players[0].node='Tessile';
const cd=crossed.players[0].depts.terziario;
assert.equal(cd.prod,5);
assert.equal(productionPreview(crossed,produce).resources.Tessuti,12,'Jump across cell 4 unlocks it, cell 6 stays locked');
assert.equal(productionPreview(crossed,produce).coins,6);
cd.prod=4;assert.equal(productionPreview(crossed,produce).resources.Tessuti,11,'Exact arrival unlocks the cell');
cd.prod=5;cd.tension=3;
assert.equal(productionPreview(crossed,produce).resources.Tessuti,11,'Tension covers the physical second row');
cd.tension=4;assert.equal(productionPreview(crossed,produce).resources.Tessuti,0);
cd.tension=0;assert.equal(productionPreview(crossed,produce).resources.Tessuti,12,'Recovery restores previously unlocked cells');
const legacy=structuredClone(cellsState);legacy.rowEconomy.productionUnlock='rows';
assert.equal(productionPreview(legacy,produce).resources.Tessuti,11,'Legacy whole-row unlock remains available');
const oldConfig=structuredClone(c);delete oldConfig.productionUnlock;
assert.equal(gameConfig(parseConfig(JSON.stringify(oldConfig))).rowEconomy.productionUnlock,'rows');
assert.equal(gameConfig({...cellsConfig,milestoneResource:true}).rowEconomy.milestoneResource,false);
assert.throws(()=>gameConfig({...cellsConfig,productionUnlock:'exact'}),/sblocco/);
assert.deepEqual(applyCommand(forkForSearch(cellsState),cellHire).players[0].resources,crossed.players[0].resources);

// Full games retain accurate finances, reports and legal replay for every supported player count.
for(const players of [2,3,4]) {
 const editor={...c,productionUnlock:players===3?'cells':'rows',players,turns:6},cfg=gameConfig(editor),game=await runGame(cfg);
 assert.deepEqual(game.study.verified,{completed:true,money:players,resources:players,machineIncome:players});
 assert.equal(game.study.milestones.filter(m=>m.turn===0).length,players*3);
 let replay=initGame(cfg);for(const command of game.commands)replay=applyCommand(replay,command);
 assert.deepEqual(replay,game.finalState);
 const report=textReport(editor,[game],'Completata');assert.ok(report.includes('Milestone con premio una tantum'));assert.ok(!report.includes('NaN'));
}
console.log('OK: arbitrary reward cells, multiple milestones per row, initial prizes, jumps/high tension, once-only rewards vs recurring yields, additive threshold prizes, AI isolation, config/save/undo, 2/3/4-player replay and verified finances/reports.');
