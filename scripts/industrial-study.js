// Confronto esplorativo a seed appaiati: descrive l'IA, non certifica il bilanciamento.
// node scripts/industrial-study.js [partite, default 3] [profondità, default 0] [percorso JSON opzionale]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { runOneGame, formatIndustrialReport } from '../src/game/batchsim.js';
import { industrialPreset } from '../src/game/industrial.js';

const base = JSON.parse(fs.readFileSync(new URL('../src/game/baseline-config.json', import.meta.url)));
const nGames = Math.max(3, Math.min(1000, Number(process.argv[2]) || 3));
const depth = Math.max(0, Math.min(8, Number(process.argv[3]) || 0));
const output = process.argv[4];
const records = [];
const variants = [
  ['Prima ipotesi', false],
  ['Proposta rivista', true],
];
console.log(`CONFRONTO ARCHIMEDE — ${nGames} partite per configurazione, stessi seed dal 1907, tavoli 2/3/4 alternati, IA ${depth ? `rollout d${depth}, 1 replica` : 'greedy'}, tutti neutri.\nIl confronto riguarda due pacchetti: non isola l'effetto delle singole modifiche. Nessun archetipo assegnato.\n`);
for (const [name, revised] of variants) {
  const games = [];
  for (let i = 0; i < nGames; i++) {
    const n = 2 + i % 3;
    const cfg = industrialPreset({ ...base, seed: 1907 + i, headless: true,
      aiRollout: depth ? { depth, rollouts: 1 } : null,
      players: Array.from({ length: n }, (_, seat) => ({ name: `AI ${seat + 1}`, isAI: true, personality: 'neutro' })),
    }, revised);
    const game = runOneGame(cfg);
    assert.ok(!game.failed, `${name}, seed ${cfg.seed}: partita incompleta`);
    assert.equal(game.turns, 28);
    assert.ok(game.results.every(r => Number.isFinite(r.total)));
    games.push(game);
    records.push({ name, config: cfg, game });
    if (output) fs.writeFileSync(output, JSON.stringify(records));
    console.log(`${name}: completata partita ${i + 1}/${nGames}, ${n} giocatori, seed ${cfg.seed}.`);
  }
  const sum = xs => xs.reduce((a, b) => a + b, 0);
  const people = sum(games.map(g => g.results.length));
  console.log(`\n${name}\n${formatIndustrialReport(games).join('\n')}`);
  console.log(`Per giocatore: risorse generate ${(sum(games.flatMap(g => g.resGen).map(r => sum(Object.values(r)))) / people).toFixed(2)}; risorse residue ${(sum(games.flatMap(g => g.resFinal)) / people).toFixed(2)}; commesse ${(sum(games.flatMap(g => g.results).map(r => r.nContracts)) / people).toFixed(2)}; PV ${(sum(games.flatMap(g => g.results).map(r => r.total)) / people).toFixed(2)}.`);
}
