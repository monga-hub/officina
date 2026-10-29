import {WELFARE_FUNDS,fundBalances} from '../game/welfare-funds.js';
import { initGame, scorePlayer } from '../game/engine.js';
import { withoutTrackPoints } from './config.js';
import { welfarePolicies, rondelEnabled, validPolicyOrder } from '../game/welfare-rondel.js';
import { tensionMachineCard } from '../game/row-economy.js';

export const GAME_SAVE_KEY='officina1907-partita-v1';
export const SAVED_UNDO_LIMIT=10;
const ROLES=['terziario','secondario','primario'];
function validState(state,config) {
  return state&&Array.isArray(state.players)&&state.players.length===config.players.length
    &&state.nPlayers===state.players.length&&Number.isInteger(state.current)&&state.current>=0&&state.current<state.players.length
    &&Number.isInteger(state.turn)&&state.turn>0&&['move','action','borsa','resolving','roundRondel','done'].includes(state.phase)
    &&(state.phase!=='roundRondel'||(state.roundRondel?.active&&Array.isArray(state.roundRondel.log)&&Array.isArray(state.roundRondel.completed)&&state.roundRondel.active.order[state.roundRondel.active.at]===state.current))
    &&(!state.roundRondel?.fundThresholds||(fundBalances(state)&&Object.keys(fundBalances(state)).length===3&&WELFARE_FUNDS.every(f=>Number.isInteger(fundBalances(state)[f.id])&&fundBalances(state)[f.id]>=0)&&Object.values(fundBalances(state)).reduce((a,b)=>a+b,0)===state.welfareBank))
    &&(state.roundRondel?.policyOrder===undefined||validPolicyOrder(state.roundRondel.policyOrder))
    &&state.banks&&state.tracks&&state.contracts&&Array.isArray(state.log)&&Array.isArray(state.pendingQueue)
    &&state.players.every(p=>p.resources&&p.depts&&ROLES.every(role=>Array.isArray(p.depts[role]?.sopra)&&Array.isArray(p.depts[role]?.sotto)))
    &&(!rondelEnabled(state)||state.players.every(p=>(p.welfarePosition===null||(Number.isInteger(p.welfarePosition)&&p.welfarePosition>=0&&p.welfarePosition<welfarePolicies(state).length))
      &&Array.isArray(p.welfareRondelStats?.visits)&&welfarePolicies(state).every(policy=>Number.isFinite(p.welfareRondelStats.benefits?.[policy.id])&&p.welfareRondelStats.benefits[policy.id]>=0)))
    &&(!state.pending||(Number.isInteger(state.pending.playerId)&&state.players[state.pending.playerId]));
}
export function validateGameSave(save) {
  if(save?.version!==1)throw new Error('Versione del salvataggio non supportata.');
  if(save.config?.roundRondel?.policyOrder!==undefined&&!validPolicyOrder(save.config.roundRondel.policyOrder))throw new Error('Ordine della rondella salvata non valido.');
  if(!Array.isArray(save.config?.players)||save.config.players.length<2||save.config.players.length>4||!Array.isArray(save.config.workers)
    ||!validState(save.state,save.config)||!Array.isArray(save.history)||!save.history.every(state=>validState(state,save.config))
    ||typeof save.paused!=='boolean'||!Number.isFinite(Date.parse(save.savedAt)))throw new Error('Il salvataggio della partita non è leggibile.');
  return save;
}
function contractsOnlySave(save) {
  if ([save.config, save.state, ...save.history].every(rules => rules.contractsOnly && !rules.borsaFabbriche?.resourceCap?.enabled && !rules.players?.some(p=>p.resCap?.enabled) && rules.rowEconomy?.sameNationHireDiscount === (rules.roundRondel?.startingPolicy!=='affinity') && rules.rowEconomy?.tensionMachineCash === true)) return save;
  const next = structuredClone(save), states = [next.state, ...next.history];
  if (!next.config.rowEconomy?.tensionMachineCash) next.config.workers = next.config.workers.map(tensionMachineCard);
  for (const rules of [next.config, ...states]) {
    if(rules.borsaFabbriche?.resourceCap)rules.borsaFabbriche.resourceCap.enabled=false;
    for(const player of rules.players||[])if(player.resCap)player.resCap.enabled=false;
    rules.rowEconomy = { ...rules.rowEconomy, sameNationHireDiscount: rules.roundRondel?.startingPolicy!=='affinity', tensionMachineCash: true };
    rules.contractsOnly = true;
    rules.pianoEnabled = false;
    rules.raceObjectives = { enabled: false, list: [] };
    rules.raceIncentive = 0;
    if (rules.tracks) for (const role of Object.keys(rules.tracks)) rules.tracks[role] = withoutTrackPoints(rules.tracks[role]);
  }
  for (const state of states) {
    state.racesThisVisit = 0;
    if (state.gameOver) {
      state.results = state.players.map(p => scorePlayer(state, p))
        .sort((a, b) => b.total - a.total || b.coins - a.coins || b.nContracts - a.nContracts);
      const ending = state.log.findLast(entry => entry.text.startsWith('FINE PARTITA.'));
      if (ending) ending.text = `FINE PARTITA. Vince ${state.results[0].name} con ${state.results[0].total} PV.`;
    }
  }
  return next;
}
export function loadGame(storage=localStorage) {
  const raw=storage.getItem(GAME_SAVE_KEY);
  return raw?contractsOnlySave(validateGameSave(JSON.parse(raw))):null;
}
export function saveGame(config,session,storage=localStorage) {
  const save=contractsOnlySave(validateGameSave({version:1,savedAt:new Date().toISOString(),config,state:session.state,history:session.history.slice(-SAVED_UNDO_LIMIT),paused:session.paused}));
  // A single atomic write keeps the previous save intact if storage is full or unavailable.
  storage.setItem(GAME_SAVE_KEY,JSON.stringify(save));
  return save;
}
export function gameSession(config,resume) {
  if(resume)resume=contractsOnlySave(validateGameSave(resume));
  // Preserve the match and its prices while applying current scoring and hiring rules.
  const initial=initGame({...(resume?.config || config),headless:false});
  return resume?{state:resume.state,history:resume.history,paused:resume.paused}:{state:initial,history:[],paused:false};
}
