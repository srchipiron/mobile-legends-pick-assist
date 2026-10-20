/**
 * Baja la tier list de mlbb.gg y la escribe en roam-meta.json SIN tocar nada
 * más (3.59.6).
 *
 * Por qué existe: desde el 4 de octubre de 2026 `back.mlbb.gg` contesta 403 a
 * los servidores de GitHub (el bot de `update-data.yml`), y desde cualquier
 * otro sitio contesta 200. La ingesta conserva la anterior y, pasadas dos
 * semanas, la app deja de enseñarla (`tiersVigentes`). Este script lo corre
 * una tarea programada en la nube (fuera de GitHub) y sube el cambio.
 *
 *   node scripts/actualizar-tiers.mjs [--fichero public/data/roam-meta.json] [--tiers <base>]
 *
 * Sale con 1 si no ha podido bajarla (y entonces no escribe nada). Solo
 * habla con mlbb.gg (`--tiers` cambia la base para las pruebas).
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fetchTiers } from './ingesta/tiers.mjs';
import { diagnostics } from './ingesta/contexto.mjs';
import { serializar } from './ingesta/salida.mjs';

const args = process.argv.slice(2);
const opcion = (nombre, porDefecto) => { const i = args.indexOf(`--${nombre}`); return i >= 0 ? args[i + 1] : porDefecto; };
const fichero = resolve(opcion('fichero', 'public/data/roam-meta.json'));

const antes = readFileSync(fichero, 'utf8');
const meta = JSON.parse(antes);
const fin = antes.endsWith('\n') ? '\n' : '';
// Si el serializador no reescribe el fichero tal cual, cambiar la tier
// tocaría más cosas que la tier: mejor no escribir.
if (serializar(meta) + fin !== antes) {
  console.error('El serializador no reescribe el fichero igual: no se toca.');
  process.exit(1);
}
const anterior = meta.tiers ?? null;
// Con la anterior: si falla no la devuelve como nueva (sale con 1 por el
// `fallo` del diagnóstico), y los héroes que no lleguen hoy conservan la suya.
const nueva = await fetchTiers(meta.heroes ?? [], { tiers: anterior });
if (!nueva?.tiers || nueva === anterior || /^fallo|apagada/.test(diagnostics.tiers ?? '')) {
  console.error(`No se ha podido bajar la tier list: ${diagnostics.tiers ?? 'sin respuesta'}`);
  process.exit(1);
}
const cambios = Object.keys(nueva.tiers).filter((n) => anterior?.tiers?.[n] !== nueva.tiers[n]);
meta.tiers = nueva;
meta.diagnostics = { ...(meta.diagnostics ?? {}), tiers: `${diagnostics.tiers} (bajada fuera del bot: mlbb.gg contesta 403 a GitHub)` };
writeFileSync(fichero, serializar(meta) + fin);
console.log(`Tier list de mlbb.gg: ${Object.keys(nueva.tiers).length} héroes, ${cambios.length} cambios desde ${anterior?.fecha ?? 'nunca'}${cambios.length ? `: ${cambios.slice(0, 20).map((n) => `${n} ${anterior?.tiers?.[n] ?? '-'}→${nueva.tiers[n]}`).join(', ')}` : ''}.`);
