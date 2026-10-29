// Frozen, resumable-by-inspection study. Never relaunches a failed game automatically.
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {pathToFileURL} from 'node:url';
const plain=x=>JSON.parse(JSON.stringify(x));
const read=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const atomic=(p,x)=>{fs.writeFileSync(p+'.tmp',JSON.stringify(x));fs.renameSync(p+'.tmp',p);};
const hash=p=>crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
async function modules(root){return {...await import(pathToFileURL(root+'/src/lab/config.js')),...await import(pathToFileURL(root+'/src/lab/run.js')),...await import(pathToFileURL(root+'/src/game/engine.js')),...await import(pathToFileURL(root+'/src/game/ai.js'))};}
async function prepare(){
 const prefix=path.resolve('reports/config-importata-50-2026-10-29-3p-28t-d6'),runtime=prefix+'-runtime';
 assert.ok(!fs.existsSync(prefix+'-manifest.json'),'Study already prepared; do not replace or relaunch.');
 assert.ok(!fs.existsSync(runtime),'Runtime already exists; inspect before proceeding.');
 fs.mkdirSync(runtime,{recursive:true});const files=[];
 function copyDir(dir){for(const entry of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())copyDir(p);else if(/\.(js|json)$/.test(p)){fs.mkdirSync(path.dirname(path.join(runtime,p)),{recursive:true});fs.copyFileSync(p,path.join(runtime,p));files.push(p);}}}
 copyDir('src/game');
 for(const f of ['config.js','run.js','study.js','research.js','markets.js','reference.json','latest-playtest.json']){const p='src/lab/'+f;fs.mkdirSync(path.dirname(path.join(runtime,p)),{recursive:true});fs.copyFileSync(p,path.join(runtime,p));files.push(p);}
 // Frozen runner instrumentation records actual decisions without changing game rules or the AI.
 const runFile=runtime+'/src/lab/run.js';let run=fs.readFileSync(runFile,'utf8');
 run=run.replace('import { chooseTimedCommand }','import { chooseTimedCommand, lastDecision }');
 run=run.replace("  const study = newStudy(s);","  const study = newStudy(s), decisionTimes = [];");
 run=run.replace('    const cmd = chooseTimedCommand(s);',`    const measuredStart = performance.now();
    const cmd = chooseTimedCommand(s);
    decisionTimes.push({index:count-1,turn:s.turn,seat:s.current,phase:s.phase,node:s.players[s.current].node,pending:s.pending?.type||null,commandType:cmd?.type,...lastDecision,wallMs:performance.now()-measuredStart});
    progress({turn:s.turn,seat:s.current,decisions:count,lastDecision:decisionTimes.at(-1)});`);
 run=run.replace('gameOver', 'gameOver');
 run=run.replace('elapsedMs: performance.now()-started, people','elapsedMs: performance.now()-started, decisionTimes, people');
 assert.ok(run.includes('decisionTimes, people'));fs.writeFileSync(runFile,run);
 fs.copyFileSync(import.meta.filename,runtime+'/runner.js');
 const importedPath='/Users/daniele/Downloads/officina-configurazione (3).json';
 const imported=read(importedPath),defaults=read('src/lab/latest-playtest.json');
 assert.deepEqual(defaults,imported);
 const editor=plain(imported);editor.simulation.games=50;
 const m=await modules(runtime);m.validateMainConfig(editor);
 assert.deepEqual(plain(m.parseConfig(JSON.stringify(editor))),editor);
 for(let index=0;index<50;index++){
   const cfg=m.gameConfig(editor,{seed:1907+index});
   assert.equal(cfg.roundLimit,28);assert.equal(cfg.players.length,3);
   const expected=plain(m.gameConfig(imported,{seed:1907+index}));
   assert.deepEqual(plain(cfg),expected,'Only simulation.games changes; actual game rules must match the import');
   const initial=m.initGame(cfg);assert.equal(initial.trackModel,'righe5x4');assert.deepEqual(initial.roundRondel.bounds,[7,14,21]);
 }
 const oldProof=[];
 const jobs=Array.from({length:50},(_,index)=>({group:'funds',index,seed:1907+index,prefix}));
 const manifest={schema:'officina-imported-config-study-1',createdAt:new Date().toISOString(),runtime,prefix,groups:[{id:'funds',prefix,editor}],jobs,workers:4,decisionBudgetMs:3000,welfareDecisionBudgetMs:15000,returnReserveMs:20,commit:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(),sources:Object.fromEntries(files.map(p=>[p,hash(runtime+'/'+p)])),currentSources:Object.fromEntries(files.map(p=>[p,hash(p)])),instrumentedSources:['src/lab/run.js'],aiSHA256:hash(runtime+'/src/game/ai.js'),importedPath,importedSHA256:hash(importedPath),defaultSHA256:hash('src/lab/latest-playtest.json'),configIdenticalTo:importedPath,oldReplays:oldProof,comparison:'50 new games; seeds 1907–1956; imported configuration and current AI frozen; historical comparisons are descriptive unless rule and AI equivalence is proved; timed search and machine load can affect decisions',noAutomaticRetries:true};
 assert.equal(manifest.aiSHA256,hash('src/game/ai.js'));assert.equal(manifest.importedSHA256,manifest.defaultSHA256);
 atomic(prefix+'-manifest.json',manifest);atomic(prefix+'-config.json',editor);
 atomic(prefix+'-verification.json',{configIdentical:true,oldReplays:oldProof,aiSHA256:manifest.aiSHA256,sourceHashes:manifest.sources});
 console.log(JSON.stringify({manifest:prefix+'-manifest.json',runtime,jobs:50,seeds:jobs.map(j=>j.seed),budgetMs:{ordinary:3000,welfare:15000},oldReplayCommands:oldProof.reduce((n,x)=>n+x.commands,0)}));
}
async function report(manifest){
 const m=read(manifest),api=await modules(m.runtime);
 for(const group of m.groups){const games=m.jobs.filter(j=>j.group===group.id).flatMap(j=>fs.existsSync(j.prefix+'-'+j.index+'.json')?[read(j.prefix+'-'+j.index+'.json')]:[]);const status=games.length===m.jobs.filter(j=>j.group===group.id).length?'Completata':'Parziale';fs.writeFileSync(group.prefix+'-report.md',api.textReport(group.editor,games,status));atomic(group.prefix+'-results.json',{schema:'officina-lab-results-1',config:group.editor,status,games});}
}
async function job(manifest,jobIndex){
 const m=read(manifest),j=m.jobs[jobIndex],g=m.groups.find(g=>g.id===j.group),out=j.prefix+'-'+j.index+'.json';assert.ok(!fs.existsSync(out),'Result already exists: refusing to rerun.');
 const a=await modules(m.runtime),cfg=a.gameConfig(g.editor,{seed:j.seed});a.resetRolloutStats();const start=Date.now();
 console.log('START',j.group,j.index,j.seed,new Date(start).toISOString());
 const game=await a.runGame(cfg,p=>atomic(j.prefix+'-'+j.index+'.progress.json',{...j,...p,started:start,updated:Date.now()}));
 game.searchStats=plain(a.rolloutStats);atomic(out+'.raw',game);
 let replay=a.initGame(cfg);for(const cmd of game.commands){assert.ok(a.legalCommands(replay).some(c=>JSON.stringify(c)===JSON.stringify(cmd)));replay=a.applyCommand(replay,cmd);}
 assert.ok(replay.gameOver);assert.equal(replay.nPlayers,3);assert.equal(replay.turn,28);assert.deepEqual(plain(replay),plain(game.finalState));assert.equal(game.study.verified.money,3);assert.equal(game.study.verified.resources,3);assert.equal(game.study.verified.machineIncome,3);assert.ok(game.study.bankVerified);
 assert.equal(game.study.bankVerified.deposits-game.study.bankVerified.loot,replay.welfareBank);assert.ok(game.study.events.every(e=>e.bankBefore>=0&&e.bankAfter>=0));
 if(j.group==='funds'){assert.ok(game.study.fundsVerified);for(const f of ['economy','personnel','production'])assert.equal(game.study.fundsVerified[f].deposits-game.study.fundsVerified[f].loot,replay.roundRondel.funds[f]);}
 for(const p of replay.players){const score=a.scorePlayer(replay,p);assert.equal(score.total,score.pvContracts+score.pvCoins+score.pvResources);assert.equal(score.pvCoins,Math.floor(p.coins/10));assert.equal(score.pvResources,Math.min(p.resources.Tessuti,p.resources.Acciaio,p.resources.Coloranti));assert.equal(p.convCount.risorsaRisorsa,p.welfareRondelStats.benefits.mutualAid);assert.equal(p.convCount.marchiRisorsa,0);assert.equal(p.convCount.risorsaMarchi,0);}
 assert.ok(game.study.productions.every(p=>p.machinesOperational||p.machineIncome===0&&p.targetIncome===0));assert.ok(game.study.machines.every(m=>!m.blockedImmediate||m.immediate===0));assert.equal(game.study.machines.filter(x=>x.kind==='conversione').length,0);
 assert.equal(replay.trackModel,'righe5x4');assert.equal(replay.industrial.tensionLimit,5);assert.ok(game.decisionTimes.length===game.commands.length);
 assert.equal(replay.roundRondel.log.length,9);assert.deepEqual(replay.roundRondel.completed,[0,1,2]);assert.ok(replay.roundRondel.log.every(x=>x.steps>=1&&x.steps<=6&&x.cost===Math.max(0,x.steps-3)&&x.tokensGained===0));
 atomic(out,{...game,index:j.index,group:j.group,config:cfg,verification:{legalReplay:true,finalState:true,funds:j.group==='funds'?true:null},completedAt:new Date().toISOString()});fs.unlinkSync(out+'.raw');console.log('COMPLETE',j.group,j.index,Math.round(game.elapsedMs/1000),game.people.map(p=>p.total));
}
async function batch(manifest){
 const m=read(manifest);fs.closeSync(fs.openSync(m.prefix+'-started.lock','wx'));const started=Date.now();let next=0,failed=false;
 atomic(m.prefix+'-batch-status.json',{status:'running',started,jobs:m.jobs.length});
 await Promise.all(Array.from({length:m.workers},async()=>{while(next<m.jobs.length&&!failed){const i=next++,j=m.jobs[i],fd=fs.openSync(j.prefix+'-'+j.index+'.log','a');const child=spawn(process.execPath,[m.runtime+'/runner.js','--job',manifest,String(i)],{stdio:['ignore',fd,fd]});fs.closeSync(fd);console.log('LAUNCHED',j.group,j.index,child.pid,new Date().toISOString());const code=await new Promise((resolve,reject)=>{child.once('exit',resolve);child.once('error',reject);});if(code!==0){failed=true;console.error('FAILED',j,code);}else{console.log('FINISHED',j.group,j.index);}}}));
 atomic(m.prefix+'-batch-status.json',{status:failed?'failed':'complete',started,finished:Date.now(),jobs:m.jobs.length});await report(manifest);assert.ok(!failed,'Preserve files and logs; do not relaunch automatically.');console.log('ALL COMPLETE',new Date().toISOString());
}
const [mode,arg,idx]=process.argv.slice(2);
if(mode==='--prepare')await prepare(arg==='--control');else if(mode==='--batch')await batch(path.resolve(arg));else if(mode==='--job')await job(path.resolve(arg),Number(idx));else if(mode==='--report')await report(path.resolve(arg));else throw new Error('Use --prepare [--control], --batch MANIFEST, --job MANIFEST INDEX, --report MANIFEST');
