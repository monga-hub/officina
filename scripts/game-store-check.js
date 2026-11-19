import assert from 'node:assert/strict';
import {GameStore,localKey,FORMAT,GAME_ID} from '../src/game-app/store.js';
import {mainDefaults,gameConfig} from '../src/lab/config.js';
import {gameSession,GAME_SAVE_KEY} from '../src/lab/saved-game.js';
const config=gameConfig(mainDefaults(),{humans:3});
const session=()=>gameSession(config);
const clone=structuredClone;
const memory=()=>{const data=new Map();return {data,getItem:k=>data.get(k)||null,setItem:(k,v)=>data.set(k,v)};};
let serial=0;const id=()=>`test-${++serial}`;
async function settle(store){for(let i=0;i<6;i++){const pending=store.queue;await pending;await Promise.resolve();if(pending===store.queue)return;}throw Error('Queue did not settle');}
function sdk(){
  let user=null,listener=()=>{},version=0,gate=null,active=0,maxActive=0;
  const rows=new Map(),writes=[];
  return {rows,writes,get maxActive(){return maxActive;},get userId(){return user?.id;},
    setUser(id){user=id?{id,email:`${id}@test.invalid`}:null;listener(user);},
    defer(){let release;gate=new Promise(resolve=>{release=resolve;});return()=>{release();gate=null;};},
    user:async()=>user,onUserChange(fn){listener=fn;fn(user);return()=>{listener=()=>{}};},
    async loadVersioned(expected,game,slot){assert.equal(game,GAME_ID);assert.equal(slot,'active');if(user?.id!==expected)throw Error('Account changed');return clone(rows.get(expected)||null);},
    async saveVersioned(expected,game,data,base,slot){
      active++;maxActive=Math.max(maxActive,active);
      try{if(gate)await gate;if(user?.id!==expected)return {status:'account-changed'};
        assert.equal(game,GAME_ID);assert.equal(slot,'active');assert.equal(data.owner,expected);
        const remote=rows.get(expected);if((remote?.version||null)!==base)return {status:'conflict'};
        const row={data:clone(data),version:`v${++version}`};rows.set(expected,row);writes.push({owner:expected,record:clone(data)});return {status:'saved',version:row.version};
      }finally{active--;}
    },
  };
}
const storage=memory();storage.setItem(GAME_SAVE_KEY,'legacy simulator must remain untouched');
const cloud=sdk(),store=new GameStore({storage,connect:async()=>cloud,id});await store.start();await settle(store);
assert.equal(store.view.owner,null);
store.persist(config,session(),store.epoch,'guest-game');const guest=storage.getItem(localKey(null));
assert.equal(cloud.writes.length,0);assert.equal(storage.getItem(GAME_SAVE_KEY),'legacy simulator must remain untouched');
cloud.setUser('alice');await settle(store);assert.equal(store.view.record,null,'Guest is never imported into an account');
const aEpoch=store.epoch;
store.persist(config,session(),aEpoch,'alice-game');await settle(store);
assert.equal(cloud.rows.get('alice').data.owner,'alice');assert.equal(store.view.status,'saved');
const release=cloud.defer();
const next=session();next.state.players[0].coins=23;
store.persist(config,next,aEpoch,'alice-game');await Promise.resolve();
const last=clone(next);last.state.players[0].coins=27;
store.persist(config,last,aEpoch,'alice-game');release();await settle(store);
assert.equal(cloud.rows.get('alice').data.save.state.players[0].coins,27);
assert.equal(cloud.maxActive,1,'All writes are serial');
// A different device wrote first: CAS refuses the local update without losing it.
const other=clone(cloud.rows.get('alice'));other.data.writeId=id();other.data.save.state.turn=2;other.version='other-device';cloud.rows.set('alice',other);
store.persist(config,next,aEpoch,'alice-game');await settle(store);
assert.equal(store.view.status,'conflict');assert.equal(cloud.rows.get('alice').data.writeId,other.data.writeId);
const localBefore=storage.getItem(localKey('alice'));store.choose('cloud');
assert.equal(store.view.record.writeId,other.data.writeId);assert.equal(storage.getItem(`${localKey('alice')}.backup`),localBefore);
// An account switch while a write is suspended must never write Alice into Bob.
const releaseSwitch=cloud.defer();store.persist(config,next,aEpoch,'alice-game');await Promise.resolve();
cloud.setUser('bob');releaseSwitch();await settle(store);
assert.equal(store.view.owner,'bob');assert.equal(store.view.record,null);assert.equal(cloud.rows.has('bob'),false);
assert.throws(()=>store.persist(config,next,aEpoch,'alice-game'),/Account cambiato/);
store.persist(config,session(),store.epoch,'bob-game');await settle(store);assert.equal(cloud.rows.get('bob').data.owner,'bob');
cloud.setUser(null);await settle(store);assert.equal(storage.getItem(localKey(null)),guest);assert.equal(store.view.record.matchId,'guest-game');
cloud.setUser('alice');await settle(store);
assert.equal(store.view.status,'saved','The unsent Alice copy syncs only back to Alice');
assert.equal(cloud.rows.get('alice').data.save.state.players[0].coins,23);
const changed=clone(cloud.rows.get('alice'));changed.data.writeId=id();changed.version='third-device';cloud.rows.set('alice',changed);
store.persist(config,last,store.epoch,'alice-game');await settle(store);assert.equal(store.view.status,'conflict');
store.choose('local');await settle(store);assert.equal(store.view.status,'saved');assert.equal(cloud.rows.get('alice').data.save.state.players[0].coins,27);
assert.equal(storage.getItem(GAME_SAVE_KEY),'legacy simulator must remain untouched');
assert.ok(cloud.writes.every(w=>w.owner===w.record.owner));
// An older hub SDK must not silently fall back to its unrestricted upsert API.
let unsafe=0;const old={user:async()=>({id:'old',email:'old@test.invalid'}),onUserChange:()=>()=>{},save:async()=>{unsafe++;}};
const oldStore=new GameStore({storage:memory(),connect:async()=>old,id});await oldStore.start();await settle(oldStore);
oldStore.persist(config,session(),oldStore.epoch,'old-game');await settle(oldStore);
assert.equal(unsafe,0);assert.equal(oldStore.view.record.owner,'old');
// A failed cloud request keeps the exact local save. A failed local write sends nothing.
const offline=sdk();offline.setUser('offline');offline.saveVersioned=async()=>{throw Error('offline');};
const offlineStorage=memory(),off=new GameStore({storage:offlineStorage,connect:async()=>offline,id});await off.start();await settle(off);
off.persist(config,session(),off.epoch,'offline-game');await settle(off);assert.equal(off.view.status,'offline');assert.equal(JSON.parse(offlineStorage.getItem(localKey('offline'))).record.matchId,'offline-game');
const count=cloud.writes.length,raw=storage.getItem(localKey('alice')),setItem=storage.setItem;
storage.setItem=()=>{throw Error('quota');};assert.throws(()=>store.persist(config,session(),store.epoch,'new-game'),/quota/);await settle(store);assert.equal(cloud.writes.length,count);storage.setItem=setItem;assert.equal(storage.getItem(localKey('alice')),raw);
const corrupt=memory();corrupt.setItem(localKey(null),'{not json');const broken=new GameStore({storage:corrupt,connect:async()=>null,id});await broken.start();assert.equal(broken.view.status,'error');assert.equal(corrupt.getItem(localKey(null)),'{not json');
for(const s of [store,oldStore,off,broken])s.dispose();
console.log('OK: separate guest/account/legacy stores, valid envelopes, serial writes, optimistic conflicts, explicit choices/backups, account switches in flight, old SDK fallback, offline and quota preservation.');
