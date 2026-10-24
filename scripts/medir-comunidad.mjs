#!/usr/bin/env node
/**
 * ¿Ayuda la app? Con las partidas de TODOS los jugadores de la base de datos
 * (3.69.0). Lo mismo que el botón «Ver con las partidas de todos» de la app,
 * en Markdown, y con `--guardar` deja las filas en un fichero para medir el
 * modelo con ellas (no se commitean: son de otras personas).
 *
 *   node scripts/medir-comunidad.mjs [--guardar /tmp/comunidad.json]
 *
 * La dirección y la clave pública salen de public/comunidad.json. Solo lee:
 * llama a `partidas_comunidad`, que no lleva ni claves ni huellas.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { sanearConfig, bajarComunidad } from '../src/app/basedatos.js';
import { medirComunidad } from '../src/motor/comunidad.js';

const args = process.argv.slice(2);
const opcion = (nombre) => { const i = args.indexOf(nombre); return i >= 0 ? args[i + 1] : null; };
const pct = (x) => (x == null ? '—' : `${(x * 100).toFixed(1)}%`);
const pp = (c) => `${c.dif >= 0 ? '+' : ''}${(c.dif * 100).toFixed(1)} puntos ± ${(c.margen * 100).toFixed(1)}${c.seVe ? (c.dif > 0 ? ': ayuda' : ': en contra') : ': no se distingue del azar'}`;

const ruta = new URL('../public/comunidad.json', import.meta.url);
const config = existsSync(ruta) ? sanearConfig(JSON.parse(readFileSync(ruta, 'utf8'))) : null;
if (!config) { console.error('No hay public/comunidad.json válido: la base de datos no está configurada.'); process.exit(1); }

const r = await bajarComunidad(config);
if (r.error) { console.error(`La base de datos contestó: ${r.error}`); process.exit(1); }
if (opcion('--guardar')) writeFileSync(opcion('--guardar'), JSON.stringify(r));
const m = medirComunidad(r.filas, r.referencias);
const L = [`## La comunidad: ${m.jugadores} jugadores · ${m.partidas} partidas con la app${r.incompleto ? ' (hay más de las que se bajan)' : ''}`, ''];
L.push(`- Siguiendo la app: ${m.siguiendo.n} partidas, ${pct(m.siguiendo.winrate)} · por libre: ${m.libre.n}, ${pct(m.libre.winrate)} (mezcla jugadores).`);
L.push(m.entreRamas.jugadores ? `- Dentro de cada jugador (${m.entreRamas.jugadores}): ${pp(m.entreRamas)}.` : '- Dentro de cada jugador: nadie con 5 y 5 todavía.');
L.push(m.contraReferencia.n ? `- Contra el winrate de siempre de cada uno (${m.contraReferencia.jugadores}, ${m.contraReferencia.n} partidas): ${pct(m.contraReferencia.real)} frente a ${pct(m.contraReferencia.esperado)}, ${pp(m.contraReferencia)}.` : '- Contra el winrate de siempre: nadie con maestría todavía.');
L.push(m.soloLector.n ? `- Solo las del lector (${m.soloLector.n}): ${pp(m.soloLector)}.` : '- Solo las del lector: ninguna todavía.');
if (m.calibracion.n) L.push(`- Probabilidad (${m.calibracion.n}): prevista ${pct(m.calibracion.prevista)}, real ${pct(m.calibracion.real)}, Brier ${m.calibracion.brier.toFixed(3)} ± ${m.calibracion.brierSE.toFixed(3)}.`);
console.log(L.join('\n'));
