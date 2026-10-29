export const WELFARE_POLICIES = [
  { id: 'formation', name: 'Formazione', description: 'Ogni operaio assunto Sopra sviluppa il suo reparto di 1 passo aggiuntivo.' },
  { id: 'cooperation', name: 'Cooperazione', description: 'Produci con almeno due nazionalità fra gli operai Sopra: +1 marco.' },
  { id: 'innovation', name: 'Innovazione', description: 'Installare un macchinario costa 1 marco in meno, minimo 1.' },
  { id: 'reliability', name: 'Affidabilità', description: 'Ogni commessa completata dà 2 marchi aggiuntivi.' },
  { id: 'integration', name: 'Integrazione', description: 'Assumere Sopra una nazionalità assente nel reparto costa 1 marco in meno, minimo 1.' },
  { id: 'mutualAid', name: 'Mutuo soccorso', description: 'A ogni produzione puoi convertire 1 risorsa appena prodotta dal reparto in un altro settore.' },
];
export const AFFINITY_POLICY={id:'affinity',name:'Affinità',description:'Assumere Sopra un operaio della stessa nazionalità di almeno un operaio già presente in uno qualsiasi dei tre reparti della tua fabbrica costa 1 marco in meno, minimo 1. Lo sconto è fisso, non cresce con gli operai.'};
export const ALL_WELFARE_POLICIES=[...WELFARE_POLICIES,AFFINITY_POLICY];
export const welfarePolicies=state=>state.roundRondel?.startingPolicy==='affinity'?ALL_WELFARE_POLICIES:WELFARE_POLICIES;
export const welfareDisplayPolicies=state=>state.roundRondel?.startingPolicy==='affinity'
  ? (state.roundRondel.policyOrder||DEFAULT_ROUND_POLICY_ORDER).map(id=>ALL_WELFARE_POLICIES.find(p=>p.id===id))
  : WELFARE_DISPLAY_POLICIES;
// Stable indices keep saved positions and historical reports attached to the same policy.
export const WELFARE_DISPLAY_POLICIES = [...WELFARE_POLICIES.slice(1), WELFARE_POLICIES[0]];
export const DEFAULT_ROUND_POLICY_ORDER=[AFFINITY_POLICY.id,...WELFARE_DISPLAY_POLICIES.map(p=>p.id)];
export const validPolicyOrder=order=>Array.isArray(order)&&order.length===ALL_WELFARE_POLICIES.length&&new Set(order).size===order.length&&order.every(id=>ALL_WELFARE_POLICIES.some(p=>p.id===id));
export function movePolicy(order,source,target){
  const next=[...order],from=next.indexOf(source),to=next.indexOf(target);
  if(from<0||to<0)return next;
  next.splice(to,0,next.splice(from,1)[0]);return next;
}
// Existing saved games retain their original six-step rules.
export const welfareMaxSteps = state => state.rowEconomy?.welfareMaxSteps ?? 6;
export const freeWelfareEntry = state => state.rowEconomy?.welfareFreeEntry !== false;
export const rondelEnabled = state => state.rowEconomy?.enabled === true && state.rowEconomy.welfareMode === 'tokens' && state.rowEconomy.welfareRondel === true;
export const welfarePolicyEnabled = (state, policy) => state.rowEconomy?.welfarePoliciesEnabled?.[policy.id] !== false;
export function welfarePolicy(state, player) {
  const policy = rondelEnabled(state) && Number.isInteger(player.welfarePosition) ? welfarePolicies(state)[player.welfarePosition] : null;
  return policy && welfarePolicyEnabled(state, policy) ? policy : null;
}
export function welfareRondelCommands(state, player) {
  if (!rondelEnabled(state)) return [];
  const commands = [];
  for (let steps = 1; steps <= Math.min(welfareMaxSteps(state), player.coins); steps++) {
    const positions = player.welfarePosition == null && freeWelfareEntry(state) ? WELFARE_POLICIES.map((_, i) => i) : [((player.welfarePosition ?? 0) + steps) % 6];
    for (const position of positions) if (welfarePolicyEnabled(state, WELFARE_POLICIES[position])) commands.push({ type: 'investWelfare', steps, position });
  }
  return commands;
}
export function recordWelfareBenefit(player, policy, amount) {
  if (amount > 0) player.welfareRondelStats.benefits[policy] += amount;
}
