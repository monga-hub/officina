export const CALENDAR_BOUNDS = [7, 14, 21, 28];

export const CALENDAR_MISSIONS = [
  { id: 'workers', name: 'Organico completo', symbol: '♟', description: 'Almeno 2 operai Sopra in ciascuno dei tre reparti.', points: [4, 3, 2, 1], reached: p => Object.values(p.depts).every(d => d.sopra.length >= 2) },
  { id: 'machines', name: 'Polo specializzato', symbol: '⚙', description: 'Sviluppo 13 o più in almeno un reparto.', points: [5, 4, 3, 2], reached: p => Object.values(p.depts).some(d => d.prod >= 13) },
  { id: 'management', name: 'Riserva Welfare', symbol: '✚', description: 'Almeno 3 gettoni Welfare contemporaneamente in riserva.', points: [3, 2, 1, 1], reached: p => p.welfareTokens >= 3 },
];

export function recordCalendarMissions(state, player) {
  const previous = state.calendarMissions[player.id];
  const reached = CALENDAR_MISSIONS.filter(m => !previous[m.id] && m.reached(player));
  if (!reached.length) return;
  const round = CALENDAR_BOUNDS.findIndex(end => state.turn <= end);
  const markers = { ...previous };
  for (const mission of reached) markers[mission.id] = { turn: state.turn, points: mission.points[round] };
  state.calendarMissions = state.calendarMissions.slice();
  state.calendarMissions[player.id] = markers;
}

export function calendarPoints(state, playerId) {
  const markers = state.calendarMissions?.[playerId];
  return markers ? Object.values(markers).reduce((sum, marker) => sum + marker.points, 0) : 0;
}
