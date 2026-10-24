// node scripts/industrial-diagnose.js config.json output-prefix [nGames] [seedBase]
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { runBatch, formatReport } from '../src/game/batchsim.js';
import { industrialResourceBalance } from '../src/game/industrial-diagnostics.js';
const [input, output, n, seed] = process.argv.slice(2);
assert.ok(input && output, 'Indicare configurazione JSON e prefisso dei risultati');
const cfg = JSON.parse(fs.readFileSync(input));
if (n) cfg.nGames = Number(n);
if (seed) cfg.seedBase = Number(seed);
assert.ok(cfg.industrial?.enabled && Number.isInteger(cfg.nGames) && cfg.nGames > 0);
assert.ok(Number.isInteger(cfg.seedBase), 'Seed esplicito per rendere il test riproducibile');
const games = await runBatch(cfg, done => console.log(`Completate ${done}/${cfg.nGames}`), () => false);
assert.ok(games.every(g => !g.failed));
for (const g of games) assert.equal(industrialResourceBalance([g]).difference, 0, `Bilancio seed ${g.seed}`);
fs.writeFileSync(`${output}.json`, JSON.stringify({ config: cfg, games }));
fs.writeFileSync(`${output}.txt`, formatReport(games, cfg));
console.log(`Risultati: ${output}.txt`);
