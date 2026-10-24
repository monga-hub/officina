// Controllo mirato successivo: terzo welfare positivo con la vecchia continuazione.
import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {initGame,applyCommand,scorePlayer} from '../src/game/engine.js';import {chooseCommand} from '../src/game/ai.js';
import {newRowPressure,observeRowPressure} from '../src/game/row-pressure.js';
const prefix='reports/ia-utilizzi-futuri-2026-10-16-d6',mode=process.argv[2];assert.ok(['control','buy'].includes(mode));
const decode=t=>JSON.parse(t,(k,v)=>v?.$officinaNumber==='Infinity'?Infinity:v);
const data=decode(fs.readFileSync(prefix+'-36908-c3-beam2-beam2.json'));
for(const [p,h]of Object.entries(data.fingerprint))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(`src/game/${p}`)).digest('hex'),h);
initGame(data.config);const decision=data.decisions.find(d=>d.ordinal===3),snap=decision.snapshot;assert.ok(snap);
let s=structuredClone(snap.state);s.players.forEach(p=>p.aiContinuation='forecast2');const frozen=structuredClone(s),pressure=newRowPressure(s),commands=[];
const act=cmd=>{commands.push(cmd);const before=s;s=applyCommand(s,cmd);observeRowPressure(pressure,before,cmd,s);};
if(mode==='buy'){act(snap.move);act(snap.buy);}let guard=0;const t=performance.now();
while(!s.gameOver&&guard++<10000)act(chooseCommand(s));assert.ok(s.gameOver);assert.equal(s.turn,28);
const people=s.players.map(p=>({...scorePlayer(s,p),stats:p.industrialStats})),own=people.find(p=>p.playerId===snap.seat),other=people.find(p=>p.playerId!==snap.seat);
assert.deepEqual(frozen.players.map(p=>p.depts),snap.state.players.map(p=>p.depts));
const result={mode,seed:36908,turn:snap.turn,seat:snap.seat,fingerprint:data.fingerprint,people,margin:own.total-other.total,pressure,commands,elapsedMs:performance.now()-t};
fs.writeFileSync(`${prefix}-third-${mode}.json`,JSON.stringify(result));console.log({mode,pv:own.total,margin:result.margin,welfare:own.stats.welfareBuys});
