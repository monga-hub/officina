// Piani simmetrici di tre produzioni nel reparto sviluppato; non modifica l'IA.
import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {initGame,applyCommand,legalCommands,scorePlayer} from '../src/game/engine.js';import {chooseCommand} from '../src/game/ai.js';
import {newRowPressure,observeRowPressure} from '../src/game/row-pressure.js';
const prefix='reports/welfare-specialisti-2026-10-16-d6',id='6-r4-from8',branch=process.argv[2],style=process.argv[3];
assert.ok(['control','buy'].includes(branch)&&['intense','sustainable'].includes(style));
const decode=t=>JSON.parse(t,(k,v)=>v?.$officinaNumber==='Infinity'?Infinity:v);
const data=decode(fs.readFileSync(`${prefix}-${id}-state.json`));
for(const [p,h]of Object.entries(data.fingerprint))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(`src/game/${p}`)).digest('hex'),h);
initGame(data.config);let s=structuredClone(data.state);const seat=data.seat,dept=data.depts.find(d=>d.developed===4&&d.staffed);assert.ok(dept);
const pressure=newRowPressure(s),commands=[];assert.ok(pressure.unitRows);let forcedProductions=0;const t=performance.now();
const act=cmd=>{const before=s;s=applyCommand(s,cmd);observeRowPressure(pressure,before,cmd,s);commands.push(cmd);};
if(branch==='buy'){act(data.move);act(data.buy);}else{
 const existing=JSON.parse(fs.readFileSync(`${prefix}-${id}-control.json`));existing.initial.forEach(act);
 let guard=0;while(!s.gameOver&&(s.current===seat||s.pending)&&guard++<1000)act(chooseCommand(s));assert.ok(guard<1000);
}
let guard=0;
while(!s.gameOver&&guard++<10000){
 if(!s.pending&&s.current===seat&&s.phase==='move'&&forcedProductions<3){
  const move=legalCommands(s).find(c=>c.type==='move'&&c.node===dept.sector);
  if(move){const moved=applyCommand(s,move),production=legalCommands(moved).find(c=>c.type==='activate'&&c.sector===dept.sector&&((c.sustainableRow!==undefined)===(style==='sustainable')));
   if(production){act(move);act(production);forcedProductions++;continue;}
  }
 }
 act(chooseCommand(s));
}
assert.ok(s.gameOver&&guard<10000);assert.equal(s.turn,28);assert.equal(forcedProductions,3);
const people=s.players.map(p=>({...scorePlayer(s,p),stats:p.industrialStats})),p=people[seat],opp=people[1-seat],prods=pressure.productions.filter(p=>p.seat===seat),hires=pressure.actions.filter(a=>a.type==='hire'&&a.seat===seat);
assert.ok(hires.every(a=>a.hirePaid>=1));assert.ok(prods.filter(p=>p.sustainable).every(p=>p.actualRows===Math.min(p.before.welfare,p.before.available)));
const result={id,branch,style,fingerprint:data.fingerprint,target:dept.role,turn:data.turn,seat,forcedProductions,people,pressure,commands,elapsedMs:performance.now()-t,
 metrics:{pv:p.total,margin:p.total-opp.total,coins:p.coins,contracts:p.nContracts,welfare:p.stats.welfareBuys,rowUses:prods.filter(p=>p.sustainable&&p.actualRows>=3).length,discountUses:hires.filter(a=>a.welfareSaved>=3).length,
 resources:prods.reduce((s,p)=>s+p.actualRows,0),targetProductions:prods.filter(p=>p.role===dept.role).length}};
fs.writeFileSync(`${prefix}-plan-${branch}-${style}.json`,JSON.stringify(result));console.log({branch,style,...result.metrics});
