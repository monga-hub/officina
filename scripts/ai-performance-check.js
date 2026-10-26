// Paired decisions: restore the former copier, preserving rules and the full search.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { defaults, gameConfig } from '../src/lab/config.js';
import * as engine from '../src/game/engine.js';
import * as ai from '../src/game/ai.js';
const engineUrl=new URL('../src/game/engine.js',import.meta.url),aiUrl=new URL('../src/game/ai.js',import.meta.url);
let source=fs.readFileSync(engineUrl,'utf8');
const start=source.indexOf('const STATIC_KEYS ='),stop=source.indexOf('\nfunction commandValueMatches',start);
assert.ok(start>0&&stop>start);
const localStart=source.indexOf('function localPlayerTransition(state) {',start),localStop=source.indexOf('// These records',localStart);
const localGuard=source.slice(localStart,localStop);
const oldCopy=`export function forkForSearch(state) { return state; }
const STATIC_KEYS = new Set(['industrial','tracks','milestonePos','marketUnlockPos','tileSlotPos','welfareById','trackTileById','rules','nations','nodeBanks','bankIds','borsaFabbriche','factoryMap','factoryHexById','factoryHexes','hexResource']);
function deepClone(o) {
 if(o===null||typeof o!=='object')return o;
 if(Array.isArray(o)){const a=new Array(o.length);for(let i=0;i<o.length;i++)a[i]=deepClone(o[i]);return a;}
 const r={};for(const k in o)r[k]=deepClone(o[k]);return r;
}
${localGuard}
const APPEND_ONLY_PLAYER_ARRAYS = new Set(['contractsWon','coinsHistory','resHistory','activationTurns','welfareLog']);
function cloneActingPlayer(player){const copy={};for(const key in player)copy[key]=key==='tile'?player[key]:APPEND_ONLY_PLAYER_ARRAYS.has(key)?player[key].slice():deepClone(player[key]);return copy;}
function cloneState(prev,cmd){const s={},local=localPlayerTransition(prev);for(const k in prev){
 if(STATIC_KEYS.has(k))s[k]=prev[k];
 else if(local&&k==='players')s[k]=prev.players.map((p,i)=>i===prev.current?cloneActingPlayer(p):p);
 else if(local&&k==='banks'&&cmd.type!=='hire'&&cmd.type!=='refreshMarket')s[k]=prev[k];
 else if(local&&k==='contracts'&&cmd.type!=='completeContract')s[k]=prev[k];
 else if(local&&k==='activationLog')s[k]=cmd.type==='activate'?prev[k].slice():prev[k];
 else s[k]=deepClone(prev[k]);}return s;}
`;
source=(source.slice(0,start)+oldCopy+source.slice(stop)).replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${new URL(p,engineUrl).href}'`);
const oldEngineUrl=`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`;
const oldEngine=await import(oldEngineUrl);
const oldAI=await import(`data:text/javascript;base64,${Buffer.from(fs.readFileSync(aiUrl,'utf8').replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${p==='./engine.js'?oldEngineUrl:new URL(p,aiUrl).href}'`)).toString('base64')}`);
function freeze(o){if(!o||typeof o!=='object'||Object.isFrozen(o))return;Object.freeze(o);Object.values(o).forEach(freeze);}
const cases=[];
for(const players of [2,3,4]){
 const c=defaults();c.players=players;c.welfareRondel=true;c.milestoneResource=true;c.machineImmediate=true;
 c.simulation={games:1,seed:251025801,ai:'forecast2',depth:players===3?3:2,rollouts:1};
 const config=gameConfig(c);oldEngine.initGame(config);let s=engine.initGame(config);
 s=engine.applyCommand(s,engine.legalCommands(s).find(c=>c.type==='move'&&c.node==='Servizi'));
 cases.push({label:`${players}p Welfare primo ingresso d${c.simulation.depth}`,config,state:s});
 for(const node of ['Sindacato','Tessile']){
  const late=structuredClone(s);late.turn=27;late.players[0].node=node;late.players[0].welfareTokens=3;late.aiRollout={depth:6,rollouts:1};
  const d=late.players[0].depts.terziario;d.prod=9;d.tension=3;
  d.sopra=[Object.values(engine.WORKER_BY_ID).find(w=>w.sector==='Tessile').id];
  cases.push({label:`${players}p ${node} fine partita d6`,config,state:late});
 }
}
const results=[];
for(const {label,config,state}of cases){
 engine.initGame(config);oldEngine.initGame(config);const snapshot=structuredClone(state);freeze(state);
 const runs={};
 for(const [name,impl]of [['before',oldAI],['after',ai]]){
  impl.resetRolloutStats();const t=performance.now(),command=impl.chooseCommand(state);
  runs[name]={ms:performance.now()-t,command,steps:impl.rolloutStats.stepsSimulated,expanded:impl.rolloutStats.beamExpanded,evaluations:impl.rolloutStats.evaluateCalls};
 }
 assert.deepEqual(runs.after.command,runs.before.command,label);
 for(const key of ['steps','expanded','evaluations'])assert.equal(runs.after[key],runs.before[key],label+' '+key);
 assert.deepEqual(state,snapshot);
 results.push({label,...runs});console.log(label,JSON.stringify(runs));
}
if(process.argv.includes('--save')){
 fs.mkdirSync('reports/ai-performance',{recursive:true});fs.writeFileSync('reports/ai-performance/paired-decisions.json',JSON.stringify({createdAt:new Date().toISOString(),results},null,2));
}
console.log('OK: identical decisions and search counts, immutable inputs, 2/3/4 players, first Welfare entry and d6 endgame. Timings are measurements, not a speed assertion.');
