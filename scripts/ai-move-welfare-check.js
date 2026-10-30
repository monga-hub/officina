import assert from 'node:assert/strict';
import fs from 'node:fs';
import {gameConfig} from '../src/lab/config.js';
import * as E from '../src/game/engine.js';
import * as A from '../src/game/ai.js';
const editor=JSON.parse(fs.readFileSync('src/lab/latest-playtest.json'));
editor.roundObjectives=false; // These fixtures isolate the pre-existing movement/Welfare horizon.
for(const players of [2,3,4])for(const lastSeat of [false,true]){
 const setup=structuredClone(editor);setup.players=players;
 if(players!==3)setup.roundRondel.enabled=false;
 const state=E.initGame(gameConfig(setup,{seed:1907}));state.turn=27;
 if(lastSeat){state.current=players-1;state.roundTurns=players-1;}
 state.players[state.current].node='Borsa';
 for(const key in state.banks)state.banks[key]=[];
 for(const p of state.players){p.coins=8;for(const d of Object.values(p.depts)){d.prod=9;d.tension=2;d.sopra=[Object.values(E.WORKER_BY_ID).find(w=>w.sector===d.sector).id];}}
 const copy=JSON.stringify(state),nodes=E.legalCommands(state).filter(c=>c.type==='move').map(c=>c.node);
 A.resetRolloutStats();const start=performance.now(),move=A.chooseTimedCommand(state,{budgetMs:3000}),decision={...A.lastDecision};
 assert.equal(JSON.stringify(state),copy);assert.ok(decision.completedDepth>=1);
 const logs=A.rolloutStats.perDecisionLog.filter(x=>x.turn===state.turn&&x.seat===state.current&&x.depth===decision.completedDepth);
 assert.deepEqual(logs.map(x=>x.node).sort(),nodes.sort(),'all destinations compared at the completed common horizon');
 assert.ok(logs.every(x=>x.horizonEnd===state.turn+decision.completedDepth+Number(state.roundTurns+1>=state.nPlayers)),'one absolute end turn even when a City action ends the current turn');
 assert.equal(A.rolloutStats.beamCalls,0,'a beam at other destinations must not cap the Welfare horizon');
 const welfare=logs.find(x=>x.node==='Servizi');assert.ok(welfare?.compared);
 const welfareState=E.applyCommand(state,E.legalCommands(state).find(c=>c.node==='Servizi'));
 assert.equal(welfare.compared.length,E.legalCommands(welfareState).length,'all Welfare allocations and hires remain candidates');
 const moved=E.applyCommand(state,move),action=A.chooseTimedCommand(moved,{budgetMs:3000});
 assert.ok(E.legalCommands(moved).some(c=>JSON.stringify(c)===JSON.stringify(action)));
 if(moved.phase==='action'&&!moved.pending)assert.equal(A.lastDecision.reusedPlan,true,'use completed plan, not a second three-second search');
 assert.ok(performance.now()-start<3000,'movement and reused action share one three-second wait');
}
console.log('OK: shared forecast for all nodes, all Welfare candidates, legal immutable movement/action plans, no second search, 2/3/4 players within three seconds.');
