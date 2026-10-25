// Estimate worker workloads from completed games; queued games go to the next free worker.
export function runTiming(run, now) {
  const elapsed = Math.max(0, (run.ended ?? now) - run.started);
  if (run.ended != null) return { elapsed, remaining: null, finish: run.ended };
  const samples = run.games.map(g => g.elapsedMs).filter(ms => Number.isFinite(ms) && ms > 0);
  if (!samples.length) return { elapsed, remaining: null, finish: null };
  const average = samples.reduce((n, ms) => n + ms, 0) / samples.length;
  const active = Object.values(run.progress);
  const loads = active.map(p => {
    const fraction = Math.min(1, Math.max(0, ((p.turn - 1) * run.config.players + p.seat) / (run.config.turns * run.config.players)));
    const expected = average - Math.max(0, now - p.started);
    return Math.max(1000, expected > 0 ? expected : average * (1 - fraction));
  });
  while (loads.length < (run.workerCount || 1)) loads.push(0);
  const queued = Math.max(0, run.config.simulation.games - run.games.length - active.length);
  for (let i = 0; i < queued; i++) {
    const next = loads.indexOf(Math.min(...loads));
    loads[next] += average;
  }
  const remaining = Math.max(...loads);
  return { elapsed, remaining, finish: now + remaining };
}
export const duration = ms => {
  const seconds = Math.max(0, Math.ceil(ms / 1000));
  const hours = Math.floor(seconds / 3600), minutes = Math.floor(seconds / 60) % 60;
  return `${hours ? `${hours}h ` : ''}${minutes}m ${seconds % 60}s`;
};
export const clockTime = timestamp => new Date(timestamp).toLocaleString('it-IT', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', timeZone:'Europe/Rome' });
