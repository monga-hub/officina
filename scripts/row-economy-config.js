import fs from 'node:fs';
import { TRACK_MODELS } from '../src/game/data.js';
import { normalizeRowEconomy } from '../src/game/row-economy.js';

const base = JSON.parse(fs.readFileSync(new URL('../src/game/baseline-config.json', import.meta.url)));
export function studyConfig(seed = 1907, n = 3, policy = 'free', depth = 0, overrides = {}) {
  return { ...base, trackModel: 'righe4',
    tracks: Object.fromEntries(['terziario', 'secondario', 'primario'].map(r => [r, structuredClone(TRACK_MODELS.righe4.track)])),
    rowEconomy: normalizeRowEconomy({ enabled: true, ...overrides }),
    industrial: { enabled: true },
    startTension: { terziario: 0, secondario: 0, primario: 0 },
    endMode: 'rounds', roundLimit: 28, aiSaturate: true,
    seed, headless: true, aiRollout: depth ? { depth, rollouts: 1 } : null,
    players: Array.from({ length: n }, (_, i) => ({ name: `AI ${i + 1}`, isAI: true, personality: 'neutro', aiRecovery: policy })),
  };
}
