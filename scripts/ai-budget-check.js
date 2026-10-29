import assert from 'node:assert/strict';
import fs from 'node:fs';
import { initGame, applyCommand, legalCommands } from '../src/game/engine.js';
import { chooseTimedCommand, chooseCommand, lastDecision } from '../src/game/ai.js';
const game = JSON.parse(fs.readFileSync(new URL('./fixtures/ai-welfare-games.json',import.meta.url))).funds4;
let state = initGame(game.config), round, welfare;
for (const command of game.commands) {
  if (!round && state.phase === 'roundRondel') round = structuredClone(state);
  if (!welfare && command.type === 'investWelfare') welfare = structuredClone(state);
  if (state.turn === 17 && state.current === 0 && state.phase === 'move' && !state.pending) break;
  state = applyCommand(state, command);
}
for (const s of [state, round, welfare]) {
  const before = JSON.stringify(s);
  for (const budgetMs of [0.01, 40, 300]) {
    const cmd = chooseTimedCommand(s, { budgetMs });
    assert.ok(legalCommands(s).some(c => JSON.stringify(c) === JSON.stringify(cmd)));
    assert.equal(JSON.stringify(s), before);
    assert.ok(lastDecision.ms < budgetMs + 150, JSON.stringify(lastDecision));
    assert.ok(lastDecision.completedDepth >= -1);
  }
}
// A timeout must restore all transient context; the exact legacy call remains unchanged.
const cheap = {...welfare, aiRollout:null};
const first = chooseCommand(cheap);
chooseTimedCommand(state, {budgetMs:0.01});
assert.deepEqual(chooseCommand(cheap), first);
// A completed movement plan belongs to the real state, not its shallower iteration depth.
const move = chooseTimedCommand({...state, aiRollout:{depth:1,rollouts:1}}, {budgetMs:3000});
const moved = applyCommand({...state, aiRollout:{depth:1,rollouts:1}},move);
if (moved.phase === 'action' && !moved.pending) {
  chooseTimedCommand(moved);
  assert.equal(lastDecision.reusedPlan, true);
}
console.log('OK: legal fallback, deadline, immutable inputs, context cleanup, movement-plan reuse.');
// Directly exercise a nested policy/Welfare forecast under the same outer horizon.
const aiUrl = new URL('../src/game/ai.js', import.meta.url);
const source = fs.readFileSync(aiUrl,'utf8').replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${new URL(p,aiUrl).href}'`) + `
export function checkBoundedForecast(state, end) {
  timedSearch = {deadline:performance.now()+5000};
  try {return withinForecast(end,()=>playForward(state,3));}
  finally {timedSearch=null;forecastEnd=Infinity;welfareProbe=false;}
}`;
const probe = await import('data:text/javascript;base64,'+Buffer.from(source).toString('base64'));
initGame(game.config);
const before = JSON.stringify(round);
const end = round.turn + 1;
const leaf = probe.checkBoundedForecast(round,end);
assert.ok(leaf.turn<=end,'nested forecasts escaped the enclosing horizon');
assert.equal(JSON.stringify(round),before);
assert.equal(leaf.pending?.type==='roundRondel',false);
console.log('OK: nested policy/Welfare forecasts respect the enclosing turn boundary.');
