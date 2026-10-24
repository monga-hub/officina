import { applyCommand, currentPlayer } from '../game/engine.js';
import { rowTrackModel } from '../game/data.js';
import { rowPressureState } from '../game/row-pressure.js';
import { tokenWelfare } from '../game/row-economy.js';

export function rowActionPreview(state, command) {
  const before=currentPlayer(state), next=applyCommand(state,command);
  const after=next.players.find(player=>player.id===before.id);
  const tokens=tokenWelfare(state);
  const roles=command.type==='investWelfare'&&(tokens||state.rowEconomy.welfareScope==='factory')?Object.keys(before.depts)
    :tokens&&command.type==='repress'?[command.role,...Object.keys(before.depts).filter(role=>role!==command.role)]:[command.role];
  const snapshot=(game,dept)=>{
    const pressure=rowPressureState(game,dept);
    return {...pressure,sustainableLimit:tokens?0:Math.min(pressure.welfare,rowTrackModel(game.trackModel).rows),hireDiscount:!tokens&&game.rowEconomy.welfareHireDiscount?pressure.welfare:0};
  };
  return {cost:before.coins-after.coins,...(tokens?{welfareTokens:{before:before.welfareTokens||0,after:after.welfareTokens||0}}:{}),departments:roles.map(role=>({
    before:snapshot(state,before.depts[role]),after:snapshot(next,after.depts[role]),
  }))};
}
