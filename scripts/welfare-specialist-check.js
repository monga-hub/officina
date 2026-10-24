import fs from 'node:fs';import assert from 'node:assert/strict';import crypto from 'node:crypto';
import {initGame,applyCommand,scorePlayer} from '../src/game/engine.js';import {newRowPressure,observeRowPressure} from '../src/game/row-pressure.js';
const prefix='reports/welfare-specialisti-2026-10-16-d6',read=p=>JSON.parse(fs.readFileSync(p),(k,v)=>v?.$officinaNumber==='Infinity'?Infinity:v);
const summary=read(prefix+'-summary.json');for(const [p,h]of Object.entries(summary.fingerprint))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(`src/game/${p}`)).digest('hex'),h);
const paths=summary.records.flatMap(r=>['control','buy'].map(b=>`${prefix}-${r.id}-${b}.json`)).concat(['control','buy'].flatMap(b=>['intense','sustainable'].map(m=>`${prefix}-plan-${b}-${m}.json`)));
for(const path of paths){const r=read(path),d=read(`${prefix}-${r.id}-state.json`);initGame(d.config);let s=structuredClone(d.state);const pressure=newRowPressure(s);
 for(const cmd of r.commands){const before=s;s=applyCommand(s,cmd);observeRowPressure(pressure,before,cmd,s);}
 assert.ok(s.gameOver);assert.equal(s.turn,28);const people=s.players.map(p=>({...scorePlayer(s,p),stats:p.industrialStats}));
 assert.equal(JSON.stringify(people),JSON.stringify(r.people));assert.equal(JSON.stringify(pressure),JSON.stringify(r.pressure));
}
assert.equal(summary.cases,6);assert.equal(summary.duplicates.length,1);console.log(`✓ ${paths.length} continuazioni riprodotte comando per comando: punteggi, contabilità e produzioni identici; IA e regole congelate; duplicati esclusi`);
