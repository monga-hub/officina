import { rowTrackModel, inferTrackModel } from './data.js';

// Variante ottobre: valori sperimentali, separati dai salvataggi precedenti.
export const ROW_ECONOMY_DEFAULT = {
  enabled: false, welfareCost: 3, welfareScope: 'department', welfareHireDiscount: false, repressionBase: 2, repressionStep: 1,
  contractCoins: { small: 2, medium: 3, large: 4 }, machineCash: true,
};
export function normalizeRowEconomy(raw = {}) {
  const x = { ...ROW_ECONOMY_DEFAULT, ...(raw || {}) };
  x.enabled = x.enabled === true;
  x.machineCash = x.machineCash !== false;
  x.welfareScope = x.welfareScope === 'factory' ? 'factory' : 'department';
  x.welfareHireDiscount = x.welfareHireDiscount === true;
  for (const k of ['welfareCost', 'repressionBase', 'repressionStep'])
    x[k] = Number.isFinite(Number(x[k])) ? Math.max(0, Math.min(30, Math.round(Number(x[k])))) : ROW_ECONOMY_DEFAULT[k];
  x.contractCoins = Object.fromEntries(['small', 'medium', 'large'].map(k => {
    const v = raw?.contractCoins?.[k] ?? ROW_ECONOMY_DEFAULT.contractCoins[k];
    return [k, Number.isFinite(Number(v)) ? Math.max(0, Math.min(30, Math.round(Number(v)))) : 0];
  }));
  return x;
}
export const repressionCost = (state, p) => state.rowEconomy.repressionBase + state.rowEconomy.repressionStep * (p.repressions || 0);
export const rowNodeLabel = (state, node) => state.rowEconomy?.enabled
  ? ({ Servizi: 'Welfare', Sindacato: 'Repressione', Borsa: 'Città' }[node] || node)
  : ({ Servizi: 'Fabbriche', Borsa: 'Città' }[node] || node);

export function rowEconomyConfig(config) {
  const rowEconomy = normalizeRowEconomy(config.rowEconomy);
  if (!rowEconomy.enabled || !rowTrackModel(inferTrackModel(config))) return config;
  return { ...config, rowEconomy,
    borsaFabbriche: { ...config.borsaFabbriche, enabled: false },
    borsaIndici: { ...config.borsaIndici, enabled: false },
    welfareEnabled: false, servicesMode: 'welfare', contractEngine: false,
    sottoInstantEffect: false, deptCompletePV: 0,
  };
}

// Il mazzo originale resta intatto: la variante rende fisse le rendite e conserva gli scambi.
export function rowMachineCard(w, options) {
  if (w.power || !w.effect?.verbo) return w;
  const f = w.effect;
  if (!['prendi', 'perOgni'].includes(f.verbo)) return w;
  const f1 = { ...f.f1, ...(options.machineCash ? { tipo: 'moneta' } : {}) };
  return { ...w, effect: { verbo: 'prendi', f1 }, effectText: `Prendi ${f1.q} ${f1.tipo === 'moneta' ? 'marchi' : 'risorse'} (rendimento fisso)` };
}
