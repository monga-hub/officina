import { WELFARE_POLICIES } from './welfare-rondel.js';
import { rowTrackModel, inferTrackModel, activeTrackRange } from './data.js';

// Variante ottobre: valori sperimentali, separati dai salvataggi precedenti.
export const ROW_ECONOMY_DEFAULT = {
  enabled: false, welfareBank: false, welfareMode: 'permanent', welfareCost: 3, welfareScope: 'department', welfareHireDiscount: false, sameNationHireDiscount: false, repressionBase: 2, repressionStep: 1,
  contractCoins: { small: 2, medium: 3, large: 4 }, machineCash: true, tensionMachineCash: false, productionThresholds: null, productionUnlock: 'rows', tensionDirection: 'opposed', milestoneResource: false, machineImmediate: false, welfareRondel: false,
};
export function normalizeRowEconomy(raw = {}) {
  const x = { ...ROW_ECONOMY_DEFAULT, ...(raw || {}) };
  x.productionUnlock = x.productionUnlock === 'cells' ? 'cells' : 'rows';
  x.tensionDirection = x.tensionDirection === 'same' ? 'same' : 'opposed';
  x.enabled = x.enabled === true;
  x.machineCash = x.machineCash !== false;
  x.welfareMode = x.welfareMode === 'tokens' ? 'tokens' : 'permanent';
  x.welfareBank = x.welfareBank === true && x.welfareMode === 'tokens';
  x.welfareScope = x.welfareScope === 'factory' ? 'factory' : 'department';
  x.welfareHireDiscount = x.welfareMode !== 'tokens' && x.welfareHireDiscount === true;
  x.sameNationHireDiscount = x.sameNationHireDiscount === true;
  x.tensionMachineCash = x.tensionMachineCash === true;
  x.milestoneResource = x.milestoneResource === true;
  x.machineImmediate = x.machineImmediate === true;
  x.welfarePoliciesEnabled = Object.fromEntries(WELFARE_POLICIES.map(p => [p.id, x.welfarePoliciesEnabled?.[p.id] !== false]));
  x.welfareFreeEntry = raw?.welfareFreeEntry !== false;
  x.welfareMaxSteps = raw?.welfareMaxSteps === 3 ? 3 : 6;
  x.welfareRondel = x.welfareRondel === true && x.welfareMode === 'tokens';
  x.productionThresholds = Array.isArray(x.productionThresholds) ? [...x.productionThresholds] : null;
  for (const k of ['welfareCost', 'repressionBase', 'repressionStep'])
    x[k] = Number.isFinite(Number(x[k])) ? Math.max(0, Math.min(30, Math.round(Number(x[k])))) : ROW_ECONOMY_DEFAULT[k];
  x.contractCoins = Object.fromEntries(['small', 'medium', 'large'].map(k => {
    const v = raw?.contractCoins?.[k] ?? ROW_ECONOMY_DEFAULT.contractCoins[k];
    return [k, Number.isFinite(Number(v)) ? Math.max(0, Math.min(30, Math.round(Number(v)))) : 0];
  }));
  return x;
}
export const tokenWelfare = state => state.rowEconomy?.enabled === true && state.rowEconomy.welfareMode === 'tokens';
export function availableWelfareTokens(state, p) {
  if (!tokenWelfare(state)) return 0;
  const flags = state.players[state.current]?.id === p.id ? state.turnFlags : null;
  if (flags?.welfareTokenUsed) return 0;
  return Math.max(0, (p.welfareTokens || 0) - (flags?.welfareTokensPurchased || 0));
}
export const repressionCost = (state, p) => state.rowEconomy.welfareBank ? 0 : state.rowEconomy.repressionBase + (tokenWelfare(state) ? 0 : state.rowEconomy.repressionStep * (p.repressions || 0));
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
    sottoInstantEffect: rowEconomy.machineImmediate, deptCompletePV: 0,
  };
}

// Il mazzo storico resta intatto; solo il Laboratorio conserva la nuova rendita da tensione.
export function rowMachineCard(w, options) {
  if (w.power || !w.effect?.verbo) return w;
  const f = w.effect;
  if (f.continuity) return w;
  if (options.tensionMachineCash && f.verbo === 'perOgni' && f.f2?.conta === 'tensione' && f.f1?.tipo === 'moneta') return w;
  if (!['prendi', 'perOgni'].includes(f.verbo)) return w;
  const f1 = { ...f.f1, ...(options.machineCash ? { tipo: 'moneta' } : {}) };
  return { ...w, effect: { verbo: 'prendi', f1 }, effectText: `Prendi ${f1.q} ${f1.tipo === 'moneta' ? 'marchi' : 'risorse'} (rendimento fisso)` };
}

export function tensionMachineCard(w) {
  if (w.power) return w;
  const current = rowMachineCard(w, { machineCash: true });
  if (![3, 4].includes(w.v) || current.effect?.verbo !== 'prendi' || current.effect.f1?.tipo !== 'moneta' || current.effect.f1.q !== 1) return w;
  return { ...w, effect: { verbo: 'perOgni', f1: { q: 1, tipo: 'moneta' }, f2: { conta: 'tensione' } },
    effectText: 'Incassa marchi pari alla tensione del reparto prima della produzione.' };
}

// Curve values are complete rewards, rather than a per-level multiplier.
export function tensionMachineIncome(effect, tension) {
  const curve = effect.tensionRewards;
  return Array.isArray(curve) && curve.length
    ? curve[Math.min(Math.max(0, tension), curve.length - 1)]
    : effect.f1.q * tension;
}

// Experimental Continuity: count entered physical rows still accessible before tension rises.
export function continuityIncome(state, dept, amount = 1, rowsPerCoin = 1) {
  const options = state.rowEconomy, layout = rowTrackModel(state.trackModel);
  const range = activeTrackRange(dept.prod, dept.tension, state.trackModel, true, options.productionThresholds, options.productionUnlock, options.tensionDirection);
  const freeRows = range.available ? Math.ceil(range.end / layout.columns) - Math.floor((range.start - 1) / layout.columns) : 0;
  return amount * Math.floor(freeRows / rowsPerCoin);
}

// Machines need an entered, uncovered physical row; a resource on that row is not required.
export function machinesOperational(state, dept) {
  return !state.rowEconomy?.machinesRequireOpenRow || continuityIncome(state, dept, 1, 1) > 0;
}
