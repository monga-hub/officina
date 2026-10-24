// Diagnosi aggiuntiva sugli stessi stati della vecchia IA, senza ritoccare il candidato.
import fs from 'node:fs';import assert from 'node:assert/strict';
import {initGame,applyCommand} from '../src/game/engine.js';
import {chooseCommand} from '../src/game/ai.js';
const prefix='reports/ia-utilizzi-futuri-2026-10-16-d6';
const decode=t=>JSON.parse(t,(k,v)=>v?.$officinaNumber==='Infinity'?Infinity:v);
const encode=x=>JSON.stringify(x,(k,v)=>v===Infinity?{$officinaNumber:'Infinity'}:v);
const records=[];
for(const seed of [1907,36907,36908]){
  const r=decode(fs.readFileSync(`${prefix}-${seed}-c3-beam2-beam2.json`));initGame(r.config);
  for(const d of r.decisions){
    const snap=d.source==='natural'?r.baseline.snapshots.find(s=>s.ordinal===d.ordinal):d.snapshot;
    const choices=[];
    for(const mode of ['beam2','forecast2']){
      let s=structuredClone(snap.state);s.players.forEach(p=>p.aiContinuation=mode);const original=structuredClone(s),commands=[];
      while(!s.gameOver&&(s.current===snap.seat||s.pending)&&commands.length<100){const cmd=chooseCommand(s);commands.push(cmd);s=applyCommand(s,cmd);}
      assert.ok(commands.length<100);assert.deepEqual(original.players.map(p=>p.depts),snap.state.players.map(p=>p.depts));
      choices.push({mode,buys:commands.some(c=>c.type==='investWelfare'),commands});
    }
    const item={seed,ordinal:d.ordinal,source:d.source,turn:snap.turn,choices,oldContinuationDeltaPV:d.bought.pv-d.control.pv,oldContinuationDeltaMargin:d.bought.margin-d.control.margin};records.push(item);console.log(JSON.stringify(item));
  }
}
fs.writeFileSync(prefix+'-same-states.json',encode({note:'Diagnosi successiva: stessa posizione, cambia soltanto IA. Il delta finale è misurato con continuazioni della vecchia IA, non è una misura causale del risultato della nuova.',records}));
