import assert from 'node:assert/strict';
import { initGame, legalCommands, applyCommand } from '../src/game/engine.js';
import { continuationValue, chooseCommand, evaluate, rolloutStats, resetRolloutStats } from '../src/game/ai.js';
import { comparisonConfig } from './row-comparison-analysis.js';
import { runBatch, formatReport } from '../src/game/batchsim.js';

const cfg=comparisonConfig(1907,2,4,6), state=initGame(cfg);
assert.ok(state.players.every(p=>p.aiContinuation==='greedy'));
let improved=0;
for(const move of legalCommands(state).filter(c=>c.type==='move').slice(0,3)) {
  const moved=applyCommand(state,move);
  for(const action of legalCommands(moved).slice(0,3)) {
    const s=applyCommand(moved,action), copy=structuredClone(s);
    const old=continuationValue(s,6,0);
    s.players[0].aiContinuation='beam2';
    assert.equal(evaluate(s,0),evaluate(copy,0),'Pesi degli investimenti invariati');
    resetRolloutStats();
    const value=continuationValue(s,6,0);
    assert.ok(value>=old,'La linea precedente rimane sempre disponibile');
    assert.ok(rolloutStats.beamExpanded>0,'Ricerca di azioni alternative effettivamente eseguita');
    assert.ok(rolloutStats.beamLayers<=6,'Ricerca limitata a d6');
    if(value>old+1e-9) improved++;
    s.players[0].aiContinuation='greedy';
    assert.deepEqual(s,copy,'La ricerca non modifica lo stato di partenza');
  }
}
assert.ok(improved>0,'Almeno una continuazione raggiunge un valore superiore al percorso greedy');
const s=initGame({...cfg,aiContinuation:'beam2'});
assert.equal(continuationValue(s,0,0),evaluate(s,0,true),'Profondità zero: nessuna azione futura');
const snapshot=structuredClone(s), cmd=chooseCommand(s);
assert.ok(legalCommands(s).some(c=>JSON.stringify(c)===JSON.stringify(cmd)));
assert.deepEqual(s,snapshot);
s.gameOver=true;
assert.equal(continuationValue(s,6,0),evaluate(s,0,true),'Nessuna mossa dopo fine partita');
console.log(`✓ valutazioni invariate, stato immutato, mosse legali, fine partita e orizzonte zero; ${improved} continuazioni migliorate nei casi controllati`);

const batchCfg={...comparisonConfig(1907,2,4,2),roundLimit:2,aiContinuation:'beam2',nPlayers:2,nGames:1,seedBase:1907};
resetRolloutStats();
const games=await runBatch(batchCfg,()=>{},()=>false);
assert.equal(games.length,1);assert.ok(!games[0].failed);assert.ok(rolloutStats.beamCalls>0);
assert.ok(formatReport(games,batchCfg).includes('alternative, larghezza 2'));
console.log('✓ opzione globale dal batch al motore e identificazione nel report');
