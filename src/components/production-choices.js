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
