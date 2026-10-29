// Compare the optimization against the same evaluator/search with all new reuse disabled.
import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as engine from '../src/game/engine.js';
import * as ai from '../src/game/ai.js';
import {gameConfig} from '../src/lab/config.js';
import {beginRoundRondel} from '../src/game/round-rondel.js';
const engineUrl=new URL('../src/game/engine.js',import.meta.url),aiUrl=new URL('../src/game/ai.js',import.meta.url);
const moduleUrl=(text,url,engineOverride)=>'data:text/javascript;base64,'+Buffer.from(text.replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${p==='./engine.js'&&engineOverride?engineOverride:new URL(p,url).href}'`)).toString('base64');
const referenceEngineUrl=moduleUrl(fs.readFileSync(engineUrl,'utf8').replace('if (!state[SEARCH_ONLY]) return legalCommandsInner(state);','if (true) return legalCommandsInner(state);').replace(",'advanceRoundRondel','keepRoundRondel'",''),engineUrl);
const referenceEngine=await import(referenceEngineUrl);
let referenceSource=fs.readFileSync(aiUrl,'utf8').replace('roundRondelPart(state.roundRondel)','decisionPart(state.roundRondel)').replace('contracts = decisionPart(state.contracts);','contracts = decisionCache.nextId++;').replace('if (!decisionCache || state.aiRollout) return chooseRoundRondelInner(state);','if (true) return chooseRoundRondelInner(state);');
const start=referenceSource.indexOf('    if (cmd.type === \'investWelfare\' && cmd.funds && state.contractsOnly && !previewWelfare) {');
const end=referenceSource.indexOf('\n    let s2;',start);
assert.ok(start>0&&end>start);referenceSource=referenceSource.slice(0,start)+referenceSource.slice(end);
const referenceAI=await import(moduleUrl(referenceSource,aiUrl,referenceEngineUrl));
const editor=JSON.parse(fs.readFileSync(new URL('../src/lab/latest-playtest.json',import.meta.url)));
const config=gameConfig(editor,{seed:1907});
function lateState(node,depth){
 let state=engine.initGame(config);state=engine.applyCommand(state,engine.legalCommands(state).find(c=>c.type==='move'&&c.node===node));
 state.turn=27;state.aiRollout={depth,rollouts:1};
 for(const p of state.players){p.coins=12;p.welfareTokens=2;for(const d of Object.values(p.depts)){d.prod=9;d.tension=2;}}
 return state;
}
const cases=[];
for(const node of ['Servizi','Sindacato','Tessile'])cases.push({label:node+' d6 finale',state:lateState(node,6)});
for(const amount of [2,3,4]){const state=lateState('Servizi',6);state.roundRondel.funds={economy:amount,personnel:amount,production:amount};state.welfareBank=amount*3;cases.push({label:'soglie '+amount,state});}
const checkpoint=lateState('Servizi',1);checkpoint.turn=19;beginRoundRondel(checkpoint,18);cases.push({label:'scelta rondella',state:checkpoint});
// Guard the greedy tie shortcut: a future evaluator that values allocation must remove it.
for (let position=0;position<7;position++) {
  const state=lateState('Servizi',6);state.players[state.current].welfarePosition=position;
  referenceEngine.initGame(config);const values=new Map();
  for (const command of referenceEngine.legalCommands(state).filter(c=>c.type==='investWelfare')) {
    const value=referenceAI.evaluate(referenceEngine.applyCommand(state,command),state.current);
    if (values.has(command.count)) assert.equal(value,values.get(command.count),'allocation is no longer a greedy tie');
    values.set(command.count,value);
  }
}
if(process.argv[2]&&process.argv[2]!=='--save'){
 const game=JSON.parse(fs.readFileSync(process.argv[2]));let state=engine.initGame(game.config);
 for(const cmd of game.commands){
  if(!state.pending&&state.phase==='move'&&state.current===0&&[17,19,27].includes(state.turn))cases.push({label:`reale ${game.seed} t${state.turn} d${state.turn===17?2:6}`,config:game.config,state:{...state,aiRollout:{depth:state.turn===17?2:6,rollouts:1}}});
  // Every recorded state must retain precisely the same legal moves, including cached search states.
  referenceEngine.initGame(game.config);
  const search=engine.forkForSearch(state),expected=referenceEngine.legalCommands(state);
  assert.deepEqual(engine.legalCommands(search),expected);
  if (state.phase==='roundRondel') for(const choice of expected) assert.deepEqual(engine.applyCommand(state,choice),referenceEngine.applyCommand(state,choice));
  engine.legalCommands(search).reverse().pop();assert.deepEqual(engine.legalCommands(search),expected);
  state=engine.applyCommand(state,cmd);
 }
 assert.deepEqual(JSON.parse(JSON.stringify(state)),game.finalState);
}
const results=[];
for(const test of cases){
 const cfg=test.config||config,state=test.state,snapshot=JSON.stringify(state),result={label:test.label};
 for(const [name,E,A]of [['before',referenceEngine,referenceAI],['after',engine,ai]]){
  E.initGame(cfg);A.resetRolloutStats();const t=performance.now(),command=A.chooseCommand(state);
  result[name]={ms:performance.now()-t,command,steps:A.rolloutStats.stepsSimulated,expanded:A.rolloutStats.beamExpanded,evaluations:A.rolloutStats.evaluateCalls,roundCacheHits:A.rolloutStats.roundCacheHits};assert.equal(JSON.stringify(state),snapshot,test.label+' mutated input');
 }
 assert.deepEqual(result.before.command,result.after.command,test.label);
 assert.equal(result.before.expanded,result.after.expanded,test.label+' changed main search breadth');
 results.push(result);console.log(JSON.stringify(result));
}
// Caching must not weaken the public transition validator or leak into another game/catalogue.
engine.initGame(config);const state=engine.forkForSearch(lateState('Servizi',6));engine.legalCommands(state);
assert.throws(()=>engine.applyCommand(state,{type:'investWelfare',count:1,funds:{economy:100,personnel:0,production:0}}),/Azione non disponibile/);
const first=engine.legalCommands(state);engine.initGame(config);assert.deepEqual(engine.legalCommands(state),first);
if(process.argv.includes('--save')){fs.mkdirSync('reports/ai-performance',{recursive:true});fs.writeFileSync('reports/ai-performance/welfare-funds-paired.json',JSON.stringify({createdAt:new Date().toISOString(),results},null,2));}
console.log('OK: same paired decisions, unmodified inputs, all recorded legal moves/final state, funds thresholds, d6 endgame, checkpoint, returned-list isolation and invalid-command rejection. Timings are measurements, not speed assertions.');
