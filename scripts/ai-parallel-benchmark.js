// Same four complete d6 replays, first with three processes, then four.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

const directory=process.argv[2]||'reports/ai-performance/parallel-3-vs-4';
assert.ok(!fs.existsSync(directory),'Preserve earlier runs; choose a new output directory.');
fs.mkdirSync(directory,{recursive:true});
const baseline='reports/rondella-1-2026-10-26-3p-d6-0.json';
const fingerprint=()=>Object.fromEntries(['src/game/ai.js','src/game/engine.js'].map(p=>[p,crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex')]));
const experiment={started:Date.now(),gamesPerPhase:4,baseline,hardware:{logicalCpus:os.cpus().length,available:os.availableParallelism?.(),cpu:os.cpus()[0]?.model},fingerprint:fingerprint(),phases:[]};
const save=()=>fs.writeFileSync(path.join(directory,'progress.json'),JSON.stringify(experiment,null,2));
save();
try {
 for(const concurrency of [3,4]) {
  const phase={concurrency,started:Date.now(),jobs:[],maxActive:0};experiment.phases.push(phase);save();
  let next=0,completed=0,failed=false;const active=new Set();
  await new Promise((resolve,reject)=>{
   const fail=error=>{if(failed)return;failed=true;for(const child of active)child.kill('SIGTERM');reject(error);};
   const schedule=()=>{
    if(failed)return;
    while(active.size<concurrency&&next<experiment.gamesPerPhase) {
     const index=next++,prefix=path.join(directory,`${concurrency}p-${index}`);
     const job={index,prefix,started:Date.now(),status:'running'};phase.jobs.push(job);
     const fd=fs.openSync(prefix+'.log','wx');
     const child=spawn(process.execPath,['scripts/ai-full-replay-benchmark.js',baseline,prefix],{stdio:['ignore',fd,fd]});
     fs.closeSync(fd);active.add(child);job.pid=child.pid;phase.maxActive=Math.max(phase.maxActive,active.size);save();
     child.on('error',fail);
     child.on('exit',(code,signal)=>{
      active.delete(child);job.finished=Date.now();job.status=code===0?'complete':'failed';job.code=code;job.signal=signal;save();
      if(failed)return;
      if(code!==0)return fail(new Error(`Replay ${concurrency}p-${index}: exit ${code}, signal ${signal}; see ${prefix}.log`));
      try {
       const result=JSON.parse(fs.readFileSync(prefix+'-result.json'));
       assert.equal(result.commandsVerified,223);assert.equal(result.finalStateVerified,true);
       assert.deepEqual(result.balanceChecks,{completed:true,money:3,resources:3,machineIncome:3});
       assert.deepEqual(result.fingerprint,experiment.fingerprint);
       job.elapsedMs=result.elapsedMs;completed++;save();
       console.log(`${concurrency} processes: ${completed}/4 complete`);
       if(completed===experiment.gamesPerPhase)resolve();else schedule();
      }catch(error){fail(error);}
     });
    }
   };
   schedule();
  });
  phase.finished=Date.now();phase.elapsedMs=phase.finished-phase.started;
  assert.equal(phase.maxActive,concurrency);assert.deepEqual(fingerprint(),experiment.fingerprint);save();
 }
 experiment.finished=Date.now();
 const [three,four]=experiment.phases;
 experiment.savedMs=three.elapsedMs-four.elapsedMs;
 experiment.savedPercent=100*(1-four.elapsedMs/three.elapsedMs);
 save();fs.writeFileSync(path.join(directory,'result.json'),JSON.stringify(experiment,null,2));
 const duration=ms=>{const seconds=Math.round(Math.abs(ms)/1000);return `${ms<0?'-':''}${Math.floor(seconds/60)}m ${seconds%60}s`;};
 fs.writeFileSync(path.join(directory,'report.md'),[
  '# Tre contro quattro processi — Officina 1907','',
  'Quattro repliche complete della stessa partita per ciascuna fase: 3 giocatori, 28 turni, forecast2 d6/r1, seme 251025801. Prima tre processi, poi quattro; stessa configurazione e sorgenti. Il sistema operativo decide su quali core eseguire i processi.','',
  '| Processi concorrenti | Partite completate | Tempo del lotto |','|---|---:|---:|',
  `| 3 | 4 | ${duration(three.elapsedMs)} |`,`| 4 | 4 | ${duration(four.elapsedMs)} |`,'',
  `Risparmio osservato: ${duration(experiment.savedMs)} (${experiment.savedPercent.toFixed(2)}%). Tutte le otto repliche verificano le stesse 223 scelte, lo stesso stato finale completo e i bilanci di tutti e tre i giocatori.`,
  '',
  'Limiti: misura di processi Node sul Mac, non un benchmark del browser. Le quattro repliche hanno lo stesso seme: servono a misurare la velocità, non il bilanciamento. Quattro lavori con tre processi richiedono una seconda ondata: il vantaggio di questo lotto piccolo non è una stima affidabile per cento partite. Ordine delle prove, carico e temperatura del computer possono influenzare i tempi.','',
 ].join('\n'));
 console.log(JSON.stringify({threeMs:three.elapsedMs,fourMs:four.elapsedMs,savedPercent:experiment.savedPercent}));
}catch(error){experiment.failed=Date.now();experiment.error=error.message;save();throw error;}
