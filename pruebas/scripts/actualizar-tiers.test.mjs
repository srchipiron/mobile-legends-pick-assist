/**
 * `scripts/actualizar-tiers.mjs` (3.59.6): baja la tier list de mlbb.gg y
 * cambia SOLO `tiers` en roam-meta.json; si mlbb.gg falla (el 403 que da a
 * GitHub), no escribe nada y sale con 1. Contra un mlbb.gg simulado en local,
 * sobre una copia del fichero real.
 */
import { readFileSync, copyFileSync, mkdtempSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';

const REAL = join(RAIZ, 'public/data/roam-meta.json');
const meta = JSON.parse(readFileSync(REAL, 'utf8'));
const lista = meta.heroes.map((h, i) => ({ id: i + 1, name: h.name }));
let prohibido = false;
const servidor = createServer((req, res) => {
  if (prohibido) { res.writeHead(403).end('{}'); return; }
  const id = /\/heroes\/(\d+)$/.exec(req.url)?.[1];
  const cuerpo = id ? { tier: lista[id - 1]?.name === 'Rafaela' ? 'B' : 'S' } : lista;
  res.writeHead(200, { 'Content-Type': 'application/json' }).end(JSON.stringify(cuerpo));
});
await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
const base = `http://127.0.0.1:${servidor.address().port}/api/v1`;
const sinTiers = (m) => JSON.stringify({ ...m, tiers: null, diagnostics: { ...m.diagnostics, tiers: null } });

test('baja la tier list y cambia solo eso; con mlbb.gg cerrado no escribe nada', async () => {
  try {
  const dir = mkdtempSync(join(tmpdir(), 'tiers-'));
  const fichero = join(dir, 'roam-meta.json');
  copyFileSync(REAL, fichero);
  // Asíncrono de verdad (no spawnSync): el script pide al servidor de ESTE proceso.
  const lanzar = () => new Promise((r) => { const p = spawn(process.execPath, [join(RAIZ, 'scripts/actualizar-tiers.mjs'), '--fichero', fichero, '--tiers', base, '--pausa', '0'], { cwd: RAIZ }); let s = ''; p.stdout.on('data', (d) => { s += d; }); p.stderr.on('data', (d) => { s += d; }); p.on('close', (code) => r({ code, s })); });
  const r = await lanzar();
  eq(r.code, 0, `no acaba bien: ${r.s}`);
  const despues = JSON.parse(readFileSync(fichero, 'utf8'));
  eq(despues.tiers?.tiers?.Rafaela, 'B', 'no escribe la tier de Rafaela que da mlbb.gg');
  ok(Date.now() - Date.parse(despues.tiers.fecha) < 600000, 'la tier no sale con la fecha de hoy');
  eq(sinTiers(despues), sinTiers(meta), 'cambia algo más que la tier list');
  // Con mlbb.gg cerrado (el 403 que da a GitHub): sale con 1 y el fichero no cambia.
  copyFileSync(REAL, fichero);
  prohibido = true;
  const r2 = await lanzar();
  prohibido = false;
  eq(r2.code, 1, `con mlbb.gg cerrado no sale con 1: ${r2.s}`);
  eq(readFileSync(fichero, 'utf8'), readFileSync(REAL, 'utf8'), 'con mlbb.gg cerrado escribe el fichero');
  } finally {
    // Un servidor abierto en una prueba se cierra pase lo que pase.
    servidor.close();
  }
});
await terminar('scripts/actualizar-tiers');
