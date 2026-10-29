import assert from 'node:assert/strict';
import fs from 'node:fs';
import {defaults, gameConfig, ROLES} from '../src/lab/config.js';
import {initGame, applyCommand, legalCommands, WORKER_BY_ID} from '../src/game/engine.js';

const url = new URL('../src/game/ai.js', import.meta.url);
const source = fs.readFileSync(url, 'utf8');
const start = source.indexOf('function deferredTokenValue('), stop = source.indexOf('\nfunction tokenFutureValue(', start);
assert.ok(start > 0 && stop > start);
const original = `function deferredTokenValue(state, depth, playerId, fallback) {
  if (state.gameOver || !plansTokens(state, playerId) || !state.players[playerId].welfareTokens) return fallback;
  let best = fallback;
  for (let delay = 1; delay <= depth; delay++) {
    const planned = { ...state, aiTokenPlan: { playerId, notBeforeTurn: state.turn + delay } };
    best = Math.max(best, capture(playForward(planned, depth), playerId, true));
    rolloutStats.tokenDeferredForecasts++;
  }
  return best;
}
`;
const capture = `
export const leaves = [];
function capture(s, owner, final) {
 const value = evaluate(s, owner, final);
 leaves.push(JSON.parse(JSON.stringify({...s, value,
   players:s.players.map(p=>Object.fromEntries(Object.entries(p).filter(([k])=>!GREEDY_METRICS.has(k))))})));
 return value;
}
export {deferredTokenValue};`;
async function load(text) {
 text = text.replace(/from '(\.\/[^']+)'/g, (_, p) => `from '${new URL(p, url).href}'`);
 return import(`data:text/javascript;base64,${Buffer.from(text + capture).toString('base64')}`);
}
const currentSource = source.replace('const value = evaluate(leaf, playerId, true);', 'const value = capture(leaf, playerId, true);');
const referenceSource = source.slice(0, start) + original + source.slice(stop);
const current = await load(currentSource);
const reference = await load(referenceSource);
function freeze(o) {if (!o || typeof o !== 'object' || Object.isFrozen(o)) return; Object.freeze(o); Object.values(o).forEach(freeze);}
let cases = 0, savedSteps = 0;
for (const players of [2,3,4]) for (const rondel of [false,true]) for (const historical of [false,true]) for (const order of ['normal','rotated','snake']) {
 const c = defaults(); c.players = players; c.welfareRondel = rondel; c.simulation.ai = 'forecast2';
 const base = initGame(gameConfig(c)); base.turn = 23;
 const owner = order === 'normal' ? 0 : players - 1;
 base.current = owner; base.roundStart = owner;
 if (order === 'snake') {base.snakeOrder = true; base.dir = -1;}
 if (historical) base.industrial.welfareScoring = 'quarter';
 for (const p of base.players) {
  p.coins = 8; p.welfareTokens = 3;
  for (const role of ROLES) {
   const d = p.depts[role]; d.prod = 9; d.tension = 3;
   d.sopra = [Object.values(WORKER_BY_ID).find(w => w.sector === d.sector && !w.power).id];
  }
 }
 for (const phase of ['move','action','pending']) for (const depth of [0,1,3,6]) {
  let s = structuredClone(base); s.players[owner].node = 'Tessile'; s.phase = phase === 'move' ? 'move' : 'action';
  if (phase === 'pending') s = applyCommand(s, legalCommands(s).find(c => c.type === 'pass' || c.type === 'endTurn'));
  const snapshot = structuredClone(s); freeze(s);
  current.resetRolloutStats(); reference.resetRolloutStats(); current.leaves.length = reference.leaves.length = 0;
  assert.equal(current.deferredTokenValue(s, depth, owner, -Infinity), reference.deferredTokenValue(s, depth, owner, -Infinity));
  assert.deepEqual(current.leaves, reference.leaves, `${players}p ${order} rondel=${rondel} historical=${historical} ${phase} d${depth}: every schedule's terminal state`);
  assert.deepEqual(s, snapshot);
  assert.equal(current.rolloutStats.tokenDeferredForecasts, reference.rolloutStats.tokenDeferredForecasts);
  assert.ok(current.rolloutStats.stepsSimulated <= reference.rolloutStats.stepsSimulated);
  savedSteps += reference.rolloutStats.stepsSimulated - current.rolloutStats.stepsSimulated;
  cases++;
 }
}
assert.ok(savedSteps > 0);
// Preserve termination and the existing 4000-step budget, including a stalled forecast.
for (const step of ['return state;', 'rolloutStats.stepsSimulated++; return {...state, guardCount:(state.guardCount||0)+1};']) {
 async function withStep(text) {
  const a = text.indexOf('function forwardStep('), b = text.indexOf('\nfunction playForward(', a);
  assert.ok(a > 0 && b > a);
  return load(text.slice(0,a) + `function forwardStep(state) {${step}}\n` + text.slice(b));
 }
 const fast = await withStep(currentSource), old = await withStep(referenceSource);
 const c = defaults(); c.simulation.ai = 'forecast2';
 const s = initGame(gameConfig(c)); s.players[0].welfareTokens = 3; freeze(s);
 assert.equal(fast.deferredTokenValue(s,6,0,-Infinity), old.deferredTokenValue(s,6,0,-Infinity));
 assert.deepEqual(fast.leaves,old.leaves);
 for (const noForecast of [{...s, gameOver:true}, {...s, players:s.players.map(p=>({...p,welfareTokens:0}))}]) {
  fast.leaves.length = old.leaves.length = 0;
  assert.equal(fast.deferredTokenValue(noForecast,6,0,123),123);
  assert.equal(old.deferredTokenValue(noForecast,6,0,123),123);
  assert.equal(fast.leaves.length,0);
 }
}
console.log(`OK: ${cases} prefix comparisons, every delay's gameplay state/value identical, immutable inputs, 2/3/4 players, rotated/snake order, rondel on/off, shared payouts, move/action/pending and depths 0/1/3/6; ${savedSteps} repeated commands avoided.`);
