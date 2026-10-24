import { applyCommand, currentPlayer } from '../game/engine.js';
import { rowTrackModel } from '../game/data.js';
import { rowPressureState } from '../game/row-pressure.js';

export function rowActionPreview(state, command) {
  const before=currentPlayer(state), next=applyCommand(state,command);
  const after=next.players.find(player=>player.id===before.id);
  const roles=command.type==='investWelfare'&&state.rowEconomy.welfareScope==='factory'?Object.keys(before.depts):[command.role];
  const snapshot=(game,dept)=>{
    const pressure=rowPressureState(game,dept);
    return {...pressure,sustainableLimit:Math.min(pressure.welfare,rowTrackModel(game.trackModel).rows),hireDiscount:game.rowEconomy.welfareHireDiscount?pressure.welfare:0};
  };
  return {cost:before.coins-after.coins,departments:roles.map(role=>({
    before:snapshot(state,before.depts[role]),after:snapshot(next,after.depts[role]),
  }))};
}
