#!/usr/bin/env node
/**
 * Baja la tier list de mlbb.gg y la escribe en roam-meta.json SIN tocar nada
 * más. mlbb.gg contesta 403 a los runners de GitHub (y 200 a cualquier otro
 * sitio) [M], así que esto lo corre una tarea programada fuera de GitHub.
 *
 *   node scripts/actualizar-tiers.mjs [--fichero public/data/roam-meta.json] [--tiers <base>] [--pausa N]
 *
 * Sale con 1 sin escribir si no la ha podido bajar, o si el serializador no
 * reescribe el fichero tal cual (cambiaría más que la tier).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { leerOpciones, parseArgs } from './ingesta/contexto.mjs';
import { pedirTiers } from './ingesta/tiers.mjs';
import { serializar } from './ingesta/salida.mjs';

const argv = process.argv.slice(2);
const fichero = resolve(typeof parseArgs(argv).fichero === 'string' ? parseArgs(argv).fichero : 'public/data/roam-meta.json');
const op = leerOpciones(argv);

const antes = readFileSync(fichero, 'utf8');
const meta = JSON.parse(antes);
const fin = antes.endsWith('\n') ? '\n' : '';
if (serializar(meta) + fin !== antes) {
  console.error('El serializador no reescribe el fichero igual: no se toca.');
  process.exit(1);
}
const anterior = meta.tiers ?? null;
// Con la anterior: los héroes que no lleguen hoy conservan la suya; si falla entera, no se escribe.
const { tiers: nueva, diag } = await pedirTiers(op.tiers, meta.heroes ?? [], { tiers: anterior }, { sleep: (ms) => new Promise((r) => setTimeout(r, op.pausa ?? ms)) });
if (!nueva?.tiers || nueva === anterior || /^fallo|apagada/.test(diag)) {
  console.error(`No se ha podido bajar la tier list: ${diag}`);
  process.exit(1);
}
const cambios = Object.keys(nueva.tiers).filter((n) => anterior?.tiers?.[n] !== nueva.tiers[n]);
meta.tiers = nueva;
meta.diagnostics = { ...(meta.diagnostics ?? {}), tiers: `${diag} (bajada fuera del bot: mlbb.gg contesta 403 a GitHub)` };
writeFileSync(fichero, serializar(meta) + fin);
console.log(`Tier list de mlbb.gg: ${Object.keys(nueva.tiers).length} héroes, ${cambios.length} cambios desde ${anterior?.fecha ?? 'nunca'}${cambios.length ? `: ${cambios.slice(0, 20).map((n) => `${n} ${anterior?.tiers?.[n] ?? '-'}→${nueva.tiers[n]}`).join(', ')}` : ''}.`);
