export const WELFARE_POLICIES = [
  { id: 'formation', name: 'Formazione', description: 'Ogni operaio assunto Sopra sviluppa il suo reparto di 1 passo aggiuntivo.' },
  { id: 'cooperation', name: 'Cooperazione', description: 'Produci con almeno due nazionalità fra gli operai Sopra: +1 marco.' },
  { id: 'innovation', name: 'Innovazione', description: 'Installare un macchinario costa 1 marco in meno, minimo 1.' },
  { id: 'reliability', name: 'Affidabilità', description: 'Ogni commessa completata dà 2 marchi aggiuntivi.' },
  { id: 'integration', name: 'Integrazione', description: 'Assumere Sopra una nazionalità assente nel reparto costa 1 marco in meno, minimo 1.' },
  { id: 'mutualAid', name: 'Mutuo soccorso', description: 'A ogni produzione puoi convertire 1 risorsa appena prodotta dal reparto in un altro settore.' },
];
export const rondelEnabled = state => state.rowEconomy?.enabled === true && state.rowEconomy.welfareMode === 'tokens' && state.rowEconomy.welfareRondel === true;
export function welfarePolicy(state, player) {
  return rondelEnabled(state) && Number.isInteger(player.welfarePosition) ? WELFARE_POLICIES[player.welfarePosition] : null;
}
export function welfareRondelCommands(state, player) {
  if (!rondelEnabled(state)) return [];
  const commands = [];
  for (let steps = 1; steps <= Math.min(6, player.coins); steps++) {
    const positions = player.welfarePosition == null ? WELFARE_POLICIES.map((_, i) => i) : [(player.welfarePosition + steps) % 6];
    for (const position of positions) commands.push({ type: 'investWelfare', steps, position });
  }
  return commands;
}
export function recordWelfareBenefit(player, policy, amount) {
  if (amount > 0) player.welfareRondelStats.benefits[policy] += amount;
}
