// Compare the optimized transition with the previous complete-copy behavior.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { defaults, gameConfig } from '../src/lab/config.js';
import { initGame, legalCommands, applyCommand } from '../src/game/engine.js';
import { chooseCommand } from '../src/game/ai.js';
const engineUrl=new URL('../src/game/engine.js',import.meta.url);
let source=fs.readFileSync(engineUrl,'utf8');
const start=source.indexOf('function cloneState(prev, cmd) {'),end=source.indexOf('\nfunction commandValueMatches',start);
assert.ok(start>0&&end>start);
source=source.slice(0,start)+`function cloneState(prev) {
  const copy = {};
  for (const key in prev) copy[key] = STATIC_KEYS.has(key) ? prev[key] : deepClone(prev[key]);
  return copy;
}
`+source.slice(end);
source=source.replace(/function commandValueMatches\(a, b\) \{[\s\S]*?\n\}/,`function commandValueMatches(a,b) { return JSON.stringify(a) === JSON.stringify(b); }`);
source=source.replace(/from '(\.\/[^']+)'/g,(_,path)=>`from '${new URL(path,engineUrl).href}'`);
const reference=await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
function freeze(value) {
  if(!value||typeof value!=='object'||Object.isFrozen(value))return;
  Object.freeze(value);for(const child of Object.values(value))freeze(child);
}
let transitions=0,alternatives=0;
for(const players of [2,3,4])for(const mode of ['current','visible','quarter','engines']) {
  const c=defaults();c.players=players;c.turns=28;c.simulation.ai='greedy';
  const config=gameConfig(c,{seed:91831+players});
  if(mode==='visible')config.headless=false;
  if(mode==='quarter')config.industrial={...config.industrial,welfareScoring:'quarter'};
  if(mode==='engines')config.contractEngine=true;
  let state=initGame(structuredClone(config)),old=reference.initGame(structuredClone(config));
  while(!state.gameOver) {
    assert.deepEqual(state,old);const legal=legalCommands(state);assert.deepEqual(legal,reference.legalCommands(old));
    freeze(state);
    if([1,4,8].includes(state.turn))for(const cmd of legal){
      assert.deepEqual(applyCommand(state,cmd),reference.applyCommand(old,cmd));alternatives++;
    }
    const command=chooseCommand(state);state=applyCommand(state,command);old=reference.applyCommand(old,command);transitions++;
  }
  assert.deepEqual(state,old);
}
const config=gameConfig(defaults()),state=initGame(config);freeze(state);
for(const command of [{type:'hire',cardId:'missing',role:'primario',side:'sopra'},{type:'move',node:'missing',cost:0}]){
  assert.throws(()=>applyCommand(state,command),/Azione non disponibile/);
  assert.throws(()=>reference.applyCommand(state,command),/Azione non disponibile/);
}
console.log(`OK: state-copy equivalence, immutable predecessors, legal alternatives and invalid commands; 2/3/4 players, current rules, quarterly payouts and contract engines (${transitions} transitions, ${alternatives} alternatives).`);
