// Performance proof on a completed study: every AI choice and the complete final state must match.
import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import * as liveEngine from '../src/game/engine.js';
import {newStudy,observeStudy,finishStudy} from '../src/lab/study.js';
const baselinePath=process.argv[2]||'reports/rondella-1-2026-10-26-3p-d6-0.json';
const prefix=process.argv[3]||'reports/ai-performance/full-replay';
const aiSource=process.argv[4]||'src/game/ai.js';
const engineSource=process.argv[5]||'src/game/engine.js';
const aiUrl=new URL('../src/game/ai.js',import.meta.url);
const engineUrl=new URL('../src/game/engine.js',import.meta.url);
const engineText=fs.readFileSync(engineSource,'utf8');
const moduleUrl=(text,url)=>`data:text/javascript;base64,${Buffer.from(text.replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${new URL(p,url).href}'`)).toString('base64')}`;
const selectedEngineUrl=engineSource==='src/game/engine.js'?engineUrl.href:moduleUrl(engineText,engineUrl);
const engine=engineSource==='src/game/engine.js'?liveEngine:await import(selectedEngineUrl);
const {initGame,applyCommand,scorePlayer}=engine;
const aiText=fs.readFileSync(aiSource,'utf8');
const aiModule=aiSource==='src/game/ai.js'&&engine===liveEngine?await import(aiUrl.href):await import(`data:text/javascript;base64,${Buffer.from(aiText.replace(/from '(\.\/[^']+)'/g,(_,p)=>`from '${p==='./engine.js'?selectedEngineUrl:new URL(p,aiUrl).href}'`)).toString('base64')}`);
const {chooseCommand,resetRolloutStats,rolloutStats}=aiModule;
assert.ok(!fs.existsSync(prefix+'-result.json'),'Benchmark already completed; preserve its measurements.');
const baseline=JSON.parse(fs.readFileSync(baselinePath)),started=Date.now(),t0=performance.now();
const fingerprint=Object.fromEntries(['src/game/ai.js','src/game/engine.js'].map(p=>[p,crypto.createHash('sha256').update(p==='src/game/ai.js'?aiText:engineText).digest('hex')]));
if(engine!==liveEngine)liveEngine.initGame(baseline.config); // Il report usa lo stesso catalogo del motore selezionato.
let state=initGame(baseline.config),seq=0,last='',study=newStudy(state);resetRolloutStats();
try{
 while(!state.gameOver){
  const stamp=`${state.turn}:${state.current}`;
  if(stamp!==last){fs.writeFileSync(prefix+'-progress.json',JSON.stringify({started,updated:Date.now(),turn:state.turn,seat:state.current,seq,compared:baseline.commands.length}));last=stamp;}
  const command=chooseCommand(state);
  assert.deepEqual(command,baseline.commands[seq],`Different AI choice at command ${seq}, turn ${state.turn}, player ${state.current+1}`);
  const before=state;state=applyCommand(state,command);observeStudy(study,before,command,state);seq++;
 }
 assert.equal(seq,baseline.commands.length);
 assert.deepEqual(JSON.parse(JSON.stringify(state)),baseline.finalState,'Complete final state and statistics must match');
 finishStudy(study,state);
 const elapsedMs=performance.now()-t0,result={baseline:baselinePath,aiSource,engineSource,started,finished:Date.now(),elapsedMs,baselineElapsedMs:baseline.elapsedMs,
  savedPercent:100*(1-elapsedMs/baseline.elapsedMs),fingerprint,commandsVerified:seq,finalStateVerified:true,balanceChecks:study.verified,
  people:state.players.map(p=>scorePlayer(state,p)),stats:rolloutStats};
 fs.writeFileSync(prefix+'-result.json',JSON.stringify(result,null,2));
 console.log(JSON.stringify({...result,stats:undefined}));
}catch(error){fs.writeFileSync(prefix+'-error.json',JSON.stringify({started,failed:Date.now(),seq,turn:state.turn,seat:state.current,error:error.message,state},null,2));throw error;}
