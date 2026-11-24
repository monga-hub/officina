import assert from 'node:assert/strict';
import { mainDefaults, mirrorTrialConfig, gameConfig, parseConfig } from '../src/lab/config.js';
import { initGame, legalCommands, applyCommand, WORKER_BY_ID, forkForSearch } from '../src/game/engine.js';
import { productionPreview } from '../src/components/production-choices.js';
import { saveGame, loadGame } from '../src/lab/saved-game.js';

const editor=mirrorTrialConfig(mainDefaults());
assert.equal(editor.turns,20);
assert.equal(editor.cityMissions,false);
assert.deepEqual(editor.roundRondel.bounds,[5,10,15]);
assert.deepEqual(parseConfig(JSON.stringify(editor)),editor);
const cfg=gameConfig(editor,{humans:3});
const plain=x=>JSON.parse(JSON.stringify(x));
const sectors=['Tessile','Metallurgica','Chimica'];
let comparisons=0;
for(const sector of sectors)for(const position of [0,1,2,3,4,5,6])for(const tension of [0,1,4])for(const boosted of [false,true]){
  const s=initGame(cfg),p=s.players[0];
  s.phase='action';p.node='Sindacato';p.coins=10;p.welfareTokens=2;p.welfarePosition=position;
  s.roundRondel.funds=boosted?{economy:3,personnel:4,production:3}:{economy:0,personnel:0,production:0};
  s.welfareBank=Object.values(s.roundRondel.funds).reduce((a,b)=>a+b,0);
  const role=Object.keys(p.depts).find(r=>p.depts[r].sector===sector),d=p.depts[role];
  d.sopra=cfg.workers.filter(w=>w.sector===sector).slice(0,2).map(w=>w.id);
  d.sotto=cfg.workers.filter(w=>w.sector===sector&&w.effect.f1?.tipo==='moneta').slice(0,3).map(w=>w.id);
  d.prod=13;d.tension=tension;
  const regular=plain(s);regular.players[0].node=sector;
  const legal=legalCommands(s), mirrors=legal.filter(c=>c.type==='activate');
  assert.ok(mirrors.length);
  assert.ok(!legal.some(c=>c.type==='repress'));
  for(const command of mirrors.filter(c=>c.sector===sector)){
    const {mirror,...normal}=command;
    assert.equal(mirror,true);
    assert.ok(legalCommands(regular).some(c=>JSON.stringify(c)===JSON.stringify(normal)));
    const before=plain(s),a=applyCommand(s,command),b=applyCommand(regular,normal);
    assert.deepEqual(plain(s),before);
    assert.deepEqual(a.players[0].depts,b.players[0].depts);
    assert.deepEqual(a.players[0].resources,b.players[0].resources);
    assert.deepEqual(a.pending,b.pending);
    assert.deepEqual(a.pendingQueue,b.pendingQueue);
    assert.equal(a.players[0].coins,b.players[0].coins-1);
    assert.equal(a.players[0].coinsSpentBy.repressione,b.players[0].coinsSpentBy.repressione+1);
    assert.equal(a.players[0].welfareTokens,b.players[0].welfareTokens);
    assert.equal(a.players[0].node,'Sindacato');
    const search=applyCommand(forkForSearch(s),command);
    assert.deepEqual(search.players[0].resources,a.players[0].resources);
    assert.equal(productionPreview(s,command).coins,productionPreview(regular,normal).coins-1);
    assert.throws(()=>applyCommand(regular,{...normal,mirror:true}),/non disponibile/);
    comparisons++;
  }
  p.coins=0;
  assert.ok(!legalCommands(s).some(c=>c.type==='activate'));
}
let state=initGame(cfg),seen=[];
while(!state.gameOver){
  if(state.phase==='roundRondel'&&state.roundRondel.active.at===0)seen.push(state.roundRondel.active.endTurn);
  const legal=legalCommands(state);
  state=applyCommand(state,legal.find(c=>['pass','endTurn','skipWelfareToken'].includes(c.type))??legal[0]);
}
assert.deepEqual(seen,[5,10,15]);
assert.equal(state.turn,20);
assert.equal(state.roundRondel.log.length,9);
let raw;const storage={setItem:(k,v)=>{raw=v;},getItem:()=>raw};
saveGame(cfg,{state,history:[],paused:false},storage);
assert.equal(loadGame(storage).state.mirrorProduction,true);
const old=gameConfig({...editor,mirrorProduction:false});
const previous=initGame(old);previous.phase='action';previous.players[0].node='Sindacato';previous.players[0].depts.terziario.tension=2;
assert.ok(legalCommands(previous).some(c=>c.type==='repress'));
console.log('OK: '+comparisons+' mirrored productions preserve tension, policies, machines, tokens, pending effects and previews with exactly one marco paid; affordability, immutable search, legacy repression, 20 turns, round boundaries and save/load.');
