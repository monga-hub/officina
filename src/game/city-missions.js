export const CITY_LOTS = [[2, 0], [3, 0], [3, 2], [4, 2]];
export const CITY_CATEGORIES = [
  { name: 'Produzione', symbol: '◆' },
  { name: 'Economia', symbol: '⚙' },
  { name: 'Personale', symbol: '♟' },
];
export const CITY_REQUIREMENTS = [
  ['2 risorse uguali a scelta', '2 macchinari installati, anche in reparti diversi', '2 operai nello stesso reparto'],
  ['3 risorse uguali a scelta', '3 macchinari in totale, di cui almeno 2 nello stesso reparto', '3 operai nello stesso reparto, di almeno 2 nazionalità'],
  ['3 risorse di un tipo e 2 di un altro, a scelta', 'Almeno 2 macchinari in ciascuno di 2 reparti', '2 reparti con almeno 2 nazionalità ciascuno'],
  ['4 risorse di un tipo e 2 di un altro, a scelta', 'Almeno 2 macchinari in ciascuno di 2 reparti, almeno 1 nel terzo e tutti e 3 i tipi presenti', 'Almeno 1 operaio in ogni reparto. In 2 reparti, almeno 3 operai di almeno 2 nazionalità'],
];
export const CITY_HANDS = [
  ['consegna1','primo-impianto','prima-squadra'],
  ['consegna2','officina-meccanizzata','squadra-mista'],
  ['consegna3','doppio-impianto','squadre-complementari'],
  ['consegna4','parco-completo','organico-completo'],
];
export const periodOf = turn => Math.floor((turn - 1) / 7);
// Saves created before the 5–2 scale keep their original awards.
export const CITY_SCORING = '5-2';
export const productionPoints = (turn, scoring) => cityPoints(turn, scoring) + (scoring === CITY_SCORING ? 3 : 7);

export function cityPoints(turn, scoring) {
  const day = (turn - 1) % 7 + 1;
  if (scoring === CITY_SCORING) return day <= 2 ? 3 : 2;
  return 5 + (day <= 2 ? 2 : day <= 5 ? 1 : 0);
}

export function cityCertificates(state, player, workers) {
  const period = periodOf(state.turn);
  const hand = state.calendarDeck[period];
  if (hand.length < 3) return [];
  const departments = Object.values(player.depts);
  const machines = departments.map(dept => dept.sotto.length);
  const allMachines = departments.flatMap(dept => dept.sotto);
  const doubles = machines.filter(count => count >= 2).length;
  let economy;
  switch (period) {
    case 0: economy = allMachines.length >= 2; break;
    case 1: economy = allMachines.length >= 3 && doubles >= 1; break;
    case 2: economy = doubles >= 2; break;
    case 3: {
      const types = new Set(allMachines.map(id => {
        const effect = workers[id].effect;
        return effect.continuity ? 'continuity' : effect.verbo === 'perOgni' ? 'tension' : 'fixed';
      }));
      economy = doubles >= 2 && machines.every(count => count >= 1) && types.size === 3;
      break;
    }
  }
  const diverse = departments.map(dept => new Set(dept.sopra.map(id => workers[id].nation)).size >= 2);
  const largeMixed = departments.filter((dept,index) => dept.sopra.length >= 3 && diverse[index]).length;
  const personnel = [
    departments.some(dept => dept.sopra.length >= 2), largeMixed >= 1,
    diverse.filter(Boolean).length >= 2, largeMixed >= 2 && departments.every(dept => dept.sopra.length >= 1),
  ][period];
  const claimed = state.calendarMissions[player.id];
  return hand.slice(1).filter((id,index) => !claimed[id] && (index === 0 ? economy : personnel));
}

export function certifyCity(state, player, ids) {
  const markers = { ...state.calendarMissions[player.id] };
  for (const id of ids) markers[id] = { turn: state.turn, points: cityPoints(state.turn, state.cityScoring) };
  state.calendarMissions = state.calendarMissions.slice();
  state.calendarMissions[player.id] = markers;
}
