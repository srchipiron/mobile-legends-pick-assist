#!/usr/bin/env node
/**
 * El diagnóstico del botón, sin móvil: el MISMO código (src/motor/diagnostico)
 * sobre los mismos datos preparados (`prepararDatos`), contra lo que la app
 * SIRVE DE VERDAD (dos veces el repositorio estaba impecable y lo publicado
 * roto) en las cinco líneas. Sale con 1 si hay FALLOS; los avisos no tumban.
 *
 *   node scripts/diagnostico.mjs                 # contra lo publicado
 *   node scripts/diagnostico.mjs --local         # contra public/data
 *   node scripts/diagnostico.mjs --url https://…
 *   node scripts/diagnostico.mjs --historial historial/salud.jsonl   # y añade la fila de salud
 */
import { readFileSync } from 'node:fs';
import { appendFile, mkdir } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { diagnosticar, medirRuido, cifrasDe } from '../src/motor/diagnostico/index.js';
import { prepararDatos } from '../src/motor/draft.js';
import { LINEAS } from '../src/motor/catalogo.js';
import { densidadCounters } from '../src/motor/matrices.js';
import { filasDeSalud } from './salud.mjs';
import { medir, FIJAS } from './comparar-ingesta.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, def) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : def; };
const paquete = JSON.parse(readFileSync(resolve(RAIZ, 'package.json'), 'utf8'));
const NOMBRE_PAQUETE = paquete.name;
// La URL de Pages sale de GITHUB_REPOSITORY o del nombre del paquete: escrita aquí, un renombrado daba 404 [C].
const [dueno, repo] = (process.env.GITHUB_REPOSITORY ?? '').split('/');
const BASE = arg('--url', repo ? `https://${dueno}.github.io/${repo}` : `https://srchipiron.github.io/${NOMBRE_PAQUETE}`);
const LOCAL = process.argv.includes('--local');
const TOPE_MS = 30000;

async function traer(nombre) {
  if (LOCAL) return JSON.parse(readFileSync(resolve(RAIZ, 'public/data', nombre), 'utf8'));
  const res = await fetch(`${BASE}/data/${nombre}`, { cache: 'no-store', signal: AbortSignal.timeout(TOPE_MS) });
  if (!res.ok) throw new Error(`${nombre}: HTTP ${res.status}`);
  return res.json();
}

const catalogo = await traer('heroes.json');
const meta = await traer('roam-meta.json');
// Las partidas profesionales son un extra: sin fichero, la sección lo dice.
const pro = await traer('pro.json').catch(() => null);
const versionRepo = paquete.version;
let publicada = null;
if (!LOCAL) {
  try {
    const res = await fetch(`${BASE}/version.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(TOPE_MS) });
    if (res.ok) publicada = await res.json();
  } catch { /* sin version.json: se dice abajo */ }
}

const datos = prepararDatos({ catalogo, meta, rango: meta.rank ?? 'glory' });
// Las corridas anteriores (40), línea a línea: una rota no vacía el historial [C].
let historial = null;
try {
  const leido = filasDeSalud(readFileSync(resolve(RAIZ, 'historial/salud.jsonl'), 'utf8'), { max: 40 });
  historial = leido.filas;
  if (leido.rotas) console.warn(`historial/salud.jsonl: ${leido.rotas} líneas rotas, descartadas`);
} catch { /* sin historial: la sección lo dice */ }

// Las cinco líneas. Lo personal (maestría, partidas) vive en el móvil: se apaga, no se convierte en avisos [D].
const entorno = { version: versionRepo, buildTime: null, rango: datos.rango, width: 412, height: 915, standalone: false, storage: true, sw: 'sin navegador', sinDatosPersonales: true };
const partes = LINEAS.map((linea) => diagnosticar({ datos, linea, historial, pro, partidas: [], entorno }));
let fallos = partes.reduce((n, p) => n + p.fallos, 0);

// El informe entero de la primera línea; de las demás, lo que cambia.
console.log(partes[0].texto);
partes.slice(1).forEach((p, i) => {
  console.log('');
  console.log(`--- LÍNEA ${LINEAS[i + 1].toUpperCase()} ---`);
  for (const l of p.texto.split('\n')) if (/^\[(FALLO|AVISO)\]/.test(l) || /pool|Winrates|Counters|propone|dashes|curación/.test(l)) console.log(l);
});
console.log('');
if (!LOCAL) {
  // Tras un despliegue, otra versión en Pages es un FALLO; en las programadas, un aviso (puede haber uno en marcha).
  if (!publicada?.version) console.log('[AVISO] No se ha podido leer version.json de lo publicado: no sé qué versión sirve Pages');
  else if (publicada.version === versionRepo) console.log(`[OK] Pages sirve la ${publicada.version}, la misma que el repositorio`);
  else if (process.env.GITHUB_EVENT_NAME === 'workflow_run') { console.log(`[FALLO] Pages sirve la ${publicada.version} y el repositorio va por la ${versionRepo}: el despliegue ha terminado y lo publicado no es lo subido`); fallos += 1; }
  else console.log(`[AVISO] Pages sirve la ${publicada.version} y el repositorio va por la ${versionRepo}: hay un despliegue pendiente o fallido`);
}
console.log(`Fuente: ${LOCAL ? 'public/data (local)' : BASE}`);

const rutaHistorial = arg('--historial', null);
if (rutaHistorial) {
  // Una serie enseña la pendiente que un umbral solo ve cuando ya es tarde [D].
  const ruido = medirRuido(datos);
  const cifras = cifrasDe(datos, 'roam');
  const a3 = (v) => (v != null ? Number(v.toFixed(3)) : null);
  const pares = (m) => Object.values(m ?? {}).reduce((n, porLinea) => n + Object.keys(porLinea ?? {}).length, 0);
  const fila = {
    fecha: new Date().toISOString(),
    fuente: LOCAL ? 'local' : BASE,
    version: publicada?.version ?? null,
    versionRepo,
    fallos,
    // Avisos DISTINTOS entre las cinco líneas (uno global salía cinco veces) [C].
    avisos: new Set(partes.flatMap((p) => p.texto.split('\n').filter((l) => l.startsWith('[AVISO]')))).size,
    datosDe: meta.generatedAt ?? null,
    edadHoras: meta.generatedAt ? Number(((Date.now() - new Date(meta.generatedAt)) / 3.6e6).toFixed(1)) : null,
    heroes: cifras.heroes,
    conLinea: (meta.heroes ?? []).filter((h) => h.lanes?.length).length,
    conDano: (meta.heroes ?? []).filter((h) => h.damage).length,
    cruces: cifras.cruces,
    sinergias: cifras.sinergias,
    cobertura: Number(densidadCounters(datos.poolsPorLinea.roam, datos.meta.counters, datos.heroes).cobertura.toFixed(4)),
    ruido: ruido ? a3(ruido.razon) : null,
    objetos: cifras.objetos,
    builds: cifras.builds,
    winrateLinea: pares(meta.winrateLinea),
    curvaLinea: pares(meta.curvaLinea),
    pools: Object.fromEntries(LINEAS.map((l) => [l, datos.poolsPorLinea[l].length])),
    fuerza: datos.meta.fuerza?.rango ?? null,
    coherenciaRango: a3(datos.meta.fuerza?.coherencia),
    relaciones: datos.meta.relaciones?.rango ?? null,
    coherenciaCruces: a3(datos.meta.relaciones?.coherencia?.counters),
    coherenciaParejas: a3(datos.meta.relaciones?.coherencia?.synergies),
  };
  // Todo recuento que el comparador mira contra el máximo del historial (FIJAS), contado como él [C].
  const medido = medir(meta);
  for (const k of FIJAS) if (!(k in fila)) fila[k] = medido[k];
  await mkdir(dirname(resolve(RAIZ, rutaHistorial)), { recursive: true });
  await appendFile(resolve(RAIZ, rutaHistorial), `${JSON.stringify(fila)}\n`);
  console.log(`Anotado en ${rutaHistorial}`);
}

// El resumen AL FINAL: la vigilancia sube los últimos 5.000 caracteres [C].
const unicas = (tipo) => [...new Set(partes.flatMap((p) => p.texto.split('\n').filter((l) => l.startsWith(`[${tipo}`))))];
console.log('\n=== RESUMEN ===');
for (const l of unicas('FALLO')) console.log(l);
for (const l of unicas('AVISO')) console.log(l);
if (!fallos && !unicas('AVISO').length) console.log('Todo bien.');
if (fallos) {
  console.error(`\n${fallos} FALLOS repartidos por las cinco líneas.`);
  process.exit(1);
}
