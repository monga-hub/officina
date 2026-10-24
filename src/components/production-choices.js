import { applyCommand, currentPlayer, deptOfSector, WORKER_BY_ID } from '../game/engine.js';

// Keep historical row commands valid; the player chooses a mode, not a row combination.
export function productionChoices(state, activations) {
  if(!state.rowEconomy?.enabled)return activations;
  const seen=new Set();
  return activations.filter(command=>{
    const mode=`${command.sector}:${command.sustainableRow===undefined?'intense':'sustainable'}`;
    if(seen.has(mode))return false;
    seen.add(mode);return true;
  });
}

export function productionPreview(state, command) {
  const before=currentPlayer(state);
  const next=applyCommand(state,command);
  const after=next.players.find(player=>player.id===before.id);
  // Optional conversions remain unresolved: the preview only promises immediate gains.
  return {
    resources:Object.fromEntries(Object.entries(before.resources).map(([resource,amount])=>[resource,after.resources[resource]-amount])),
    coins:after.coins-before.coins,
    tension:deptOfSector(after,command.sector).tension,
    conversions:[next.pending,...next.pendingQueue].filter(p=>p?.type==='effect'&&p.playerId===before.id).map(p=>p.card||WORKER_BY_ID[p.cardId]),
  };
}
