import { RESOURCE_OF } from '../game/data.js';
import { formulaOf } from '../game/engine.js';

export function effectAmount(card, factor, choice) {
  if(factor.tipo==='moneta')return {quantity:factor.q,label:factor.q===1?'marco':'marchi',resource:null};
  const sector=factor.settore==='carta'?card.sector:factor.settore==='scelta'?choice:factor.settore;
  const resource=RESOURCE_OF[sector];
  return {quantity:factor.q,label:resource?.toLowerCase()||(factor.q===1?'risorsa a scelta':'risorse a scelta'),resource};
}
export function effectChoiceAmounts(card, command={}) {
  const formula=formulaOf(card);
  return [effectAmount(card,formula.f1,command.give),effectAmount(card,formula.f2,command.take)];
}
export function effectChoiceLabel(card, command) {
  return effectChoiceAmounts(card,command).map(a=>`${a.quantity} ${a.label}`).join(' → ');
}
