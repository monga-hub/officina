import { rowTrackModel } from './data.js';

// Varianti di sviluppo Archimede. Nessuna regola cambia finché enabled è false.
export const INDUSTRIAL_DEFAULT = {
  enabled: false, push: true, productionMode: 'compact', development: 'off',
  baseResources: 1, productionCoins: 2, sottoResourceCap: 1,
  tensionLimit: 7, progressive: true, hireThreshold: 3, hireSurcharge: 1,
  blockThreshold: 5, strikeMode: 'department', unionReduction: 1,
  opponentPressure: false, restartCost: 5, restartTension: 3,
  factorySlots: 1, welfareEnabled: true, welfareAccess: 'requirement',
  welfareScoring: 'quarter', quarterLength: 7, welfareSlots: 1,
  welfareNeedsWellbeing: false, restartClearsWorkers: false,
  welfareCards: [
    { id: 'efficiency', name: 'Mensa e sicurezza', coins: 3, resources: 2, wellbeing: 4, spend: 2, pv: 1, effect: 'efficiency', amount: 1, coverage: 2 },
    { id: 'flexibility', name: 'Formazione professionale', coins: 2, resources: 1, wellbeing: 3, spend: 1, pv: 1, effect: 'flexibility', amount: 1, coverage: 2 },
    { id: 'recovery', name: 'Accordo di fabbrica', coins: 3, resources: 1, wellbeing: 4, spend: 2, pv: 1, effect: 'recovery', amount: 1, coverage: 2 },
  ],
};

const integer = (v, fallback, lo, hi) => Number.isFinite(Number(v)) ? Math.min(hi, Math.max(lo, Math.round(Number(v)))) : fallback;
export function normalizeIndustrial(input = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) input = {};
  const x = { ...INDUSTRIAL_DEFAULT, ...input };
  for (const k of ['enabled', 'push', 'progressive', 'opponentPressure', 'welfareEnabled', 'welfareNeedsWellbeing', 'restartClearsWorkers']) x[k] = x[k] === true;
  const enums = { productionMode: ['compact', 'legacy'], development: ['off', 'price', 'workers'], strikeMode: ['department', 'card'], welfareAccess: ['requirement', 'spend', 'none'], welfareScoring: ['none', 'purchase', 'final', 'quarter'] };
  for (const [k, values] of Object.entries(enums)) if (!values.includes(x[k])) x[k] = INDUSTRIAL_DEFAULT[k];
  for (const k of ['baseResources', 'productionCoins', 'sottoResourceCap', 'hireSurcharge', 'restartCost', 'factorySlots']) x[k] = integer(x[k], INDUSTRIAL_DEFAULT[k], 0, k === 'restartCost' ? 20 : 6);
  x.tensionLimit = integer(x.tensionLimit, 7, 3, 12);
  x.hireThreshold = integer(x.hireThreshold, 3, 1, x.tensionLimit - 1);
  x.blockThreshold = integer(x.blockThreshold, 5, 1, x.tensionLimit - 1);
  x.restartTension = integer(x.restartTension, 3, 0, x.tensionLimit - 1);
  x.unionReduction = integer(x.unionReduction, 1, 0, x.tensionLimit);
  x.quarterLength = integer(x.quarterLength, 7, 1, 30);
  x.welfareSlots = integer(x.welfareSlots, 2, 1, 3);
  x.welfareCards = INDUSTRIAL_DEFAULT.welfareCards.map(base => {
    const raw = Array.isArray(input.welfareCards) ? input.welfareCards.find(c => c?.id === base.id) : null;
    const c = { ...base, ...raw, id: base.id, effect: base.effect };
    c.name = typeof c.name === 'string' ? c.name.slice(0, 80) : base.name;
    for (const k of ['coins', 'resources', 'wellbeing', 'spend', 'pv', 'amount', 'coverage']) {
      const hi = ['wellbeing', 'spend'].includes(k) ? x.tensionLimit : k === 'coins' ? 20 : 6;
      c[k] = integer(c[k], base[k], k === 'coverage' ? 1 : 0, hi);
    }
    return c;
  });
  return x;
}

// Il modello a righe sostituisce spinta e scioperi del laboratorio, senza riscriverne i salvataggi.
export function industrialForTrack(input, model) {
  const previous = normalizeIndustrial(input);
  const layout = rowTrackModel(model);
  return !layout ? previous : normalizeIndustrial({ ...previous,
    enabled: true, push: false, productionMode: 'legacy', development: 'price',
    tensionLimit: layout.rows, progressive: false, unionReduction: 1, opponentPressure: false,
    welfareEnabled: false, welfareScoring: 'none', factorySlots: previous.enabled ? previous.factorySlots : 0,
  });
}

export function industrialPreset(config, revised = true) {
  return {
    ...config, industrial: normalizeIndustrial({ enabled: true, ...(revised ? { welfareNeedsWellbeing: true, welfareScoring: 'none', restartClearsWorkers: true, restartTension: 0 } : {}) }), endMode: 'rounds', roundLimit: 28,
    slots: { ...config.slots, ...Object.fromEntries(['terziario', 'secondario', 'primario'].map(r => [r, { sopra: 2, sotto: 1 }])) },
    startTension: { terziario: 0, secondario: 0, primario: 0 },
    borsaFabbriche: { ...config.borsaFabbriche, enabled: true, neutralFactory: true, passiveIncome: false, foundingResource: false, chooseProduction: false, factoryActivates: false, milestoneGate: false, cardGate: false, allDeptGate: false },
    sottoInstantEffect: false, contractEngine: false, deptCompletePV: 0,
    contractMilestoneReq: { small: 0, medium: 0, large: 0 },
    contractCount: { ...config.contractCount, 4: { small: 12, medium: 12, large: 12 } },
    trattativa: { resetOwn: { enabled: true, cost: 0 }, attackOther: { enabled: false, cost: 0 }, unblock: { enabled: true, cost: 3 } },
  };
}

export const activeWorkers = d => d.sopra.filter(id => !d.blocked.includes(id)).length;
export const wellbeing = (state, d) => Math.max(0, state.industrial.tensionLimit - d.tension);
export const policiesOf = (state, d) => (d.welfare || []).map(id => state.industrial.welfareCards.find(c => c.id === id)).filter(Boolean);
// La produzione legge la tensione già aumentata: sforare il benessere sospende il bonus di quella produzione.
export const welfareEfficiency = (state, d, intensity) => policiesOf(state, d).filter(c => c.effect === 'efficiency' && (!state.industrial.welfareNeedsWellbeing || wellbeing(state, d) >= c.wellbeing)).reduce((n, c) => n + Math.min(intensity, c.coverage) * c.amount, 0);
export function welfareDescription(c) {
  if (c.effect === 'efficiency') return `+${c.amount} risorsa del reparto per ciascuno dei primi ${c.coverage} operai impiegati`;
  if (c.effect === 'flexibility') return 'Puoi installare Sopra in questo reparto anche operai di altri settori';
  return `Trattativa: riduci di altri ${c.amount} passi la tensione di questo reparto`;
}

// Tutte le combinazioni di pagamento: nessun colore consumato automaticamente al posto del giocatore.
export function resourcePayments(have, amount) {
  const out = [];
  for (let a = 0; a <= Math.min(amount, have.Tessuti); a++) {
    for (let b = 0; b <= Math.min(amount - a, have.Acciaio); b++) {
      const c = amount - a - b;
      if (c <= have.Coloranti) out.push({ Tessuti: a, Acciaio: b, Coloranti: c });
    }
  }
  return out;
}
