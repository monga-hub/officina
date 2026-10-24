import { initGame } from '../game/engine.js';

export const GAME_SAVE_KEY='officina1907-partita-v1';
export const SAVED_UNDO_LIMIT=10;
const ROLES=['terziario','secondario','primario'];
function validState(state,config) {
  return state&&Array.isArray(state.players)&&state.players.length===config.players.length
    &&state.nPlayers===state.players.length&&Number.isInteger(state.current)&&state.current>=0&&state.current<state.players.length
    &&Number.isInteger(state.turn)&&state.turn>0&&['move','action','borsa','resolving','done'].includes(state.phase)
    &&state.banks&&state.tracks&&state.contracts&&Array.isArray(state.log)&&Array.isArray(state.pendingQueue)
    &&state.players.every(p=>p.resources&&p.depts&&ROLES.every(role=>Array.isArray(p.depts[role]?.sopra)&&Array.isArray(p.depts[role]?.sotto)))
    &&(!state.pending||(Number.isInteger(state.pending.playerId)&&state.players[state.pending.playerId]));
}
export function validateGameSave(save) {
  if(save?.version!==1)throw new Error('Versione del salvataggio non supportata.');
  if(!Array.isArray(save.config?.players)||save.config.players.length<2||save.config.players.length>4||!Array.isArray(save.config.workers)
    ||!validState(save.state,save.config)||!Array.isArray(save.history)||!save.history.every(state=>validState(state,save.config))
    ||typeof save.paused!=='boolean'||!Number.isFinite(Date.parse(save.savedAt)))throw new Error('Il salvataggio della partita non è leggibile.');
  return save;
}
export function loadGame(storage=localStorage) {
  const raw=storage.getItem(GAME_SAVE_KEY);
  return raw?validateGameSave(JSON.parse(raw)):null;
}
export function saveGame(config,session,storage=localStorage) {
  const save=validateGameSave({version:1,savedAt:new Date().toISOString(),config,state:session.state,history:session.history.slice(-SAVED_UNDO_LIMIT),paused:session.paused});
  // A single atomic write keeps the previous save intact if storage is full or unavailable.
  storage.setItem(GAME_SAVE_KEY,JSON.stringify(save));
  return save;
}
export function gameSession(config,resume) {
  if(resume)validateGameSave(resume);
  // Rebuild card registries from the saved rules, then use the saved decks and state unchanged.
  const initial=initGame({...config,headless:false});
  return resume?{state:resume.state,history:resume.history,paused:resume.paused}:{state:initial,history:[],paused:false};
}
