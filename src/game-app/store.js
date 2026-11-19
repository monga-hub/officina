import { saveGame, validateGameSave } from '../lab/saved-game.js';

export const GAME_ID='officina-1907';
export const FORMAT='officina-1907-game-v1';
export const localKey=owner=>`mongames.officina-1907.${owner||'guest'}.active.v1`;
const errorText=e=>e?.message||String(e);
export function validateRecord(record,owner) {
  if(record?.format!==FORMAT||record.owner!==owner||typeof record.matchId!=='string'||!record.matchId||typeof record.writeId!=='string'||!record.writeId)throw Error('Salvataggio Officina non valido per questo account.');
  validateGameSave(record.save);
  return record;
}
export async function connectHub() {
  const url='/hub/saves.js';
  let timer;
  try {return await Promise.race([import(/* @vite-ignore */ url),new Promise(resolve=>{timer=setTimeout(()=>resolve(null),8000);})]);}
  catch {return null;}
  finally {clearTimeout(timer);}
}

// One active game per account, with an entirely separate guest slot. The hub's
// versioned API checks the expected account and uses updated_at as an atomic CAS.
export class GameStore {
  constructor({storage=localStorage,connect=connectHub,id=()=>crypto.randomUUID()}={}) {
    this.storage=storage;this.connect=connect;this.id=id;
    this.client=null;this.epoch=0;this.listeners=new Set();this.queue=Promise.resolve();
    this.view={owner:undefined,email:'',record:null,conflict:null,status:'loading',message:'Controllo account…',epoch:0};
  }
  subscribe(listener){this.listeners.add(listener);return()=>this.listeners.delete(listener);}
  emit(patch){this.view={...this.view,...patch};for(const listener of this.listeners)listener(this.view);}
  async start(){
    const client=await this.connect();if(this.disposed)return;
    this.client=client;
    if(!client){this.changeUser(null);return;}
    let event=false;
    this.unsubscribe=client.onUserChange(user=>{event=true;this.changeUser(user);});
    try {const user=await client.user();if(!event&&!this.disposed)this.changeUser(user);}
    catch(e){if(!event&&!this.disposed){this.changeUser(null);this.emit({message:'Account non disponibile. Prosegui come ospite.'});}}
  }
  dispose(){this.disposed=true;this.epoch++;this.unsubscribe?.();this.listeners.clear();}
  supported(){return typeof this.client?.loadVersioned==='function'&&typeof this.client?.saveVersioned==='function';}
  current(epoch){return !this.disposed&&epoch===this.epoch;}
  changeUser(user){
    if(this.disposed)return;
    const owner=user?.id||null;if(owner===this.view.owner)return;
    this.epoch++;
    this.local=null;
    let message='';
    try {
      const raw=this.storage.getItem(localKey(owner));
      if(raw){const local=JSON.parse(raw);validateRecord(local.record,owner);if(local.base!==null&&typeof local.base!=='string')throw Error('Versione cloud non valida.');this.local=local;}
    } catch(e){message=`Copia locale non leggibile: ${errorText(e)}`;}
    this.emit({owner,email:user?.email||'',record:this.local?.record||null,conflict:null,epoch:this.epoch,status:message?'error':owner?'loading':'local',message:message||(!owner?'Salvataggio su questo dispositivo.':'Controllo salvataggio cloud…')});
    if(message)return;
    if(owner)this.refresh();
  }
  enqueue(work){const job=this.queue.then(work);this.queue=job.catch(()=>{});return job;}
  keep(local,{backup=false}={}) {
    const key=localKey(this.view.owner);
    if(backup){const old=this.storage.getItem(key);if(old)this.storage.setItem(`${key}.backup`,old);}
    this.storage.setItem(key,JSON.stringify(local));
    this.local=local;this.emit({record:local.record});
  }
  fail(e,epoch){if(this.current(epoch))this.emit({status:'offline',message:`Copia locale conservata. Cloud non riuscito: ${errorText(e)}`});}
  async readRemote(owner){
    let timer,row;
    try{row=await Promise.race([this.client.loadVersioned(owner,GAME_ID,'active'),new Promise((_,reject)=>{timer=setTimeout(()=>reject(Error('Connessione non disponibile.')),8000);})]);}
    finally{clearTimeout(timer);}
    if(row){validateRecord(row.data,owner);if(typeof row.version!=='string')throw Error('Versione cloud mancante.');}
    return row;
  }
  conflict(remote){this.emit({status:'conflict',conflict:{remote},message:'La partita locale e quella cloud sono diverse. Scegli quale riprendere.'});}
  refresh(){
    const epoch=this.epoch,owner=this.view.owner;
    if(!owner)return Promise.resolve();
    if(!this.supported()){this.emit({status:'local',message:'Cloud non disponibile con questa versione di Mongames. Copia locale attiva.'});return Promise.resolve();}
    this.emit({status:'loading',message:'Controllo salvataggio cloud…'});
    return this.enqueue(async()=>{
      if(!this.current(epoch))return;
      try {
        const remote=await this.readRemote(owner);if(!this.current(epoch))return;
        const version=remote?.version||null;
        if(!this.local){
          if(remote)this.keep({record:remote.data,base:version});
          this.emit({status:'saved',conflict:null,message:'Account sincronizzato.'});return;
        }
        if(remote?.data.writeId===this.local.record.writeId){this.keep({...this.local,base:version});this.emit({status:'saved',conflict:null,message:'Salvato nel tuo account.'});return;}
        if(this.local.base!==version){this.conflict(remote);return;}
        await this.upload(epoch);
      } catch(e){this.fail(e,epoch);}
    });
  }
  async upload(epoch){
    while(this.current(epoch)&&this.local&&!this.view.conflict){
      const {record,base}=this.local,owner=this.view.owner;
      if(!owner||!this.supported())return;
      this.emit({status:'saving',message:'Salvataggio nel tuo account…'});
      const result=await this.client.saveVersioned(owner,GAME_ID,record,base,'active');
      if(!this.current(epoch))return;
      if(result.status==='conflict'){const remote=await this.readRemote(owner);if(this.current(epoch))this.conflict(remote);return;}
      if(result.status!=='saved'||typeof result.version!=='string')throw Error('Account cambiato o sessione non disponibile.');
      const done=this.local.record.writeId===record.writeId;
      this.keep({...this.local,base:result.version});
      if(done){this.emit({status:'saved',message:'Salvato nel tuo account.'});return;}
    }
  }
  schedule(){
    const epoch=this.epoch;
    if(!this.view.owner||!this.supported()||this.view.conflict)return;
    // Coalesce moves while keeping every local write immediate. No overlapping requests.
    if(this.scheduled===epoch)return;
    this.scheduled=epoch;
    this.enqueue(async()=>{if(this.scheduled===epoch)this.scheduled=null;if(!this.current(epoch))return;try{await this.upload(epoch);}catch(e){this.fail(e,epoch);}});
  }
  persist(config,session,epoch,matchId){
    if(!this.current(epoch)||this.view.owner===undefined)throw Error('Account cambiato: torna alla schermata iniziale.');
    if(this.view.conflict)throw Error('Risolvi prima il conflitto fra copie.');
    if(this.view.status==='error')throw Error(this.view.message);
    let save;
    saveGame(config,session,{setItem(_key,raw){save=JSON.parse(raw);}});
    const record={format:FORMAT,owner:this.view.owner,matchId,writeId:this.id(),save};
    this.keep({record,base:this.local?.base||null},{backup:!!this.local&&this.local.record.matchId!==matchId});
    this.emit({status:'local',message:this.view.owner&&!this.supported()?'Copia locale attiva. Il cloud richiede l’aggiornamento di Mongames.':'Salvato su questo dispositivo.'});this.schedule();
    return save;
  }
  choose(which){
    const conflict=this.view.conflict;if(!conflict)return;
    const remote=conflict.remote;
    try {
      if(which==='cloud'){
        if(!remote)throw Error('Non esiste una partita cloud da riprendere.');
        this.keep({record:remote.data,base:remote.version},{backup:true});
        this.emit({conflict:null,status:'saved',message:'Ripresa la copia cloud. La precedente copia locale resta conservata.'});
      } else if(which==='local'&&this.local){
        this.keep({...this.local,base:remote?.version||null});
        this.emit({conflict:null,status:'local',message:'Conservo questa copia locale.'});this.schedule();
      }
    }catch(e){this.emit({status:'error',message:errorText(e)});}
  }
}
