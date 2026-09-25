#!/usr/bin/env node
/**
 * El mismo diagnóstico que enseña el botón, pero sin móvil y sin dedo.
 *
 * Corre contra lo que la app SIRVE DE VERDAD, no contra el repositorio: si un
 * despliegue publica datos degradados, el repo puede estar impecable y la app
 * mentir igual. Ya pasó dos veces en un solo día.
 *
 *   node scripts/diagnostico.mjs                 # contra lo publicado
 *   node scripts/diagnostico.mjs --local         # contra public/data
 *   node scripts/diagnostico.mjs --url https://…
 *   node scripts/diagnostico.mjs --historial historial/salud.jsonl
 *
 * Sale con código 1 si hay FALLOS. Los avisos no tumban nada: son avisos.
 *
 * Con `--historial` añade una línea con las cifras de esta corrida. Un
 * informe suelto dice si hoy está bien; cien informes dicen QUÉ SE ESTÁ
 * MOVIENDO: la cobertura que baja poco a poco, el ruido que sube, los datos
 * que envejecen porque la actualización lleva días fallando.
 *
 * Es el MISMO código que el botón del móvil (src/motor/diagnostico), sobre
 * los mismos datos preparados (src/motor/draft.js): no hay un segundo montaje
 * del contexto que pueda divergir del de la app.
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { appendFile, mkdir } from 'node:fs/promises';
import { diagnosticar, medirRuido, cifrasDe } from '../src/motor/diagnostico/index.js';
import { prepararDatos } from '../src/motor/draft.js';
import { LINEAS } from '../src/motor/catalogo.js';
import { densidadCounters } from '../src/motor/matrices.js';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const arg = (k, def) => {
  const i = process.argv.indexOf(k);
  return i > -1 ? process.argv[i + 1] : def;
};
// En GitHub Actions, GITHUB_REPOSITORY viene como "dueño/repo", que es justo
// lo que hace falta para armar la URL de Pages: el renombrado del
// repositorio no obliga a tocar este fichero. Sin GITHUB_REPOSITORY (Termux),
// el nombre del paquete: la URL escrita aquí daba 404 tras el renombrado.
const NOMBRE_PAQUETE = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).name;
const DEL_ENTORNO = process.env.GITHUB_REPOSITORY
  ? `https://${process.env.GITHUB_REPOSITORY.split('/')[0]}.github.io/${process.env.GITHUB_REPOSITORY.split('/')[1]}`
  : `https://srchipiron.github.io/${NOMBRE_PAQUETE}`;
const BASE = arg('--url', DEL_ENTORNO);
const LOCAL = process.argv.includes('--local');

async function traer(nombre) {
  if (LOCAL) return JSON.parse(readFileSync(resolve(ROOT, 'public/data', nombre), 'utf8'));
  const res = await fetch(`${BASE}/data/${nombre}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
  if (!res.ok) throw new Error(`${nombre}: HTTP ${res.status}`);
  return res.json();
}

const catalogo = await traer('heroes.json');
const meta = await traer('roam-meta.json');
// Las partidas profesionales son un extra: sin fichero, la sección lo dice.
const pro = await traer('pro.json').catch(() => null);

// Qué versión hay PUBLICADA de verdad (version.json, sin caché). Tras un
// despliegue, que no coincida es un FALLO; en las corridas programadas, un
// aviso (puede haber un despliegue en marcha).
const versionRepo = JSON.parse(readFileSync(resolve(ROOT, 'package.json'), 'utf8')).version;
let publicada = null;
if (!LOCAL) {
  try {
    const res = await fetch(`${BASE}/version.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(30000) });
    if (res.ok) publicada = await res.json();
  } catch { /* sin version.json: se dice abajo */ }
}

const datos = prepararDatos({ catalogo, meta, rango: meta.rank ?? 'glory' });

// Las corridas anteriores, para que el informe compare con su propio pasado
// igual que hace la app en el móvil.
let historialPrevio = null;
try {
  historialPrevio = readFileSync(resolve(ROOT, 'historial/salud.jsonl'), 'utf8')
    .split('\n').filter(Boolean).slice(-40).map((l) => JSON.parse(l));
} catch { /* sin historial: la sección lo dice */ }

// Se comprueban LAS CINCO líneas, no solo roam: que funcione en roam no dice
// nada de las otras cuatro. La maestría y las partidas viven en el móvil de
// Javi y no se pueden ver desde aquí: se apagan a propósito (si fueran
// avisos, todos los informes vendrían con avisos y dejaríamos de leerlos).
let fallosTotales = 0;
const partes = [];
for (const linea of LINEAS) {
  const r = diagnosticar({
    datos, linea, historial: historialPrevio, pro,
    maestria: {}, partidas: [],
    entorno: {
      version: versionRepo, buildTime: null, rango: datos.rango,
      width: 412, height: 915, standalone: false, storage: true,
      sw: 'sin navegador', sinDatosPersonales: true,
    },
  });
  fallosTotales += r.fallos;
  partes.push(r);
}

// El informe entero de la primera línea, y de las demás solo lo que cambia:
// pegar cinco informes casi idénticos en una incidencia no lo lee nadie.
console.log(partes[0].texto);
for (let i = 1; i < partes.length; i++) {
  console.log('');
  console.log(`--- LÍNEA ${LINEAS[i].toUpperCase()} ---`);
  for (const l of partes[i].texto.split('\n')) {
    if (/^\[(FALLO|AVISO)\]/.test(l) || /pool|Winrates|Counters|propone|dashes|curación/.test(l)) console.log(l);
  }
}
console.log('');
if (!LOCAL) {
  const trasDespliegue = process.env.GITHUB_EVENT_NAME === 'workflow_run';
  if (!publicada?.version) {
    console.log('[AVISO] No se ha podido leer version.json de lo publicado: no sé qué versión sirve Pages');
  } else if (publicada.version !== versionRepo) {
    const texto = `Pages sirve la ${publicada.version} y el repositorio va por la ${versionRepo}`;
    if (trasDespliegue) { console.log(`[FALLO] ${texto}: el despliegue ha terminado y lo publicado no es lo subido`); fallosTotales += 1; }
    else console.log(`[AVISO] ${texto}: hay un despliegue pendiente o fallido`);
  } else {
    console.log(`[OK] Pages sirve la ${publicada.version}, la misma que el repositorio`);
  }
}
console.log(`Fuente: ${LOCAL ? 'public/data (local)' : BASE}`);

// ---------- historial ----------
const rutaHistorial = arg('--historial', null);
if (rutaHistorial) {
  // Las mismas medidas que vigila el diagnóstico (medirRuido, cifrasDe),
  // guardadas para poder ver la tendencia: una subida lenta no la caza un
  // umbral, la caza una serie.
  const ruido = medirRuido(datos);
  const cifras = cifrasDe(datos, 'roam');
  const fila = {
    fecha: new Date().toISOString(),
    fuente: LOCAL ? 'local' : BASE,
    // La versión que SIRVE Pages, no la del repositorio: es lo que se vigila.
    version: publicada?.version ?? null,
    versionRepo,
    fallos: fallosTotales,
    // Avisos DISTINTOS entre las cinco líneas: un aviso global (la ventana de
    // 3 días, un slug de Liquipedia) salía cinco veces en la serie y la
    // columna decía 10 donde el informe del móvil decía 2.
    avisos: new Set(partes.flatMap((p) => p.texto.split('\n').filter((l) => l.startsWith('[AVISO]')))).size,
    datosDe: meta.generatedAt ?? null,
    edadHoras: meta.generatedAt ? Number(((Date.now() - new Date(meta.generatedAt)) / 3.6e6).toFixed(1)) : null,
    heroes: cifras.heroes,
    conLinea: (meta.heroes ?? []).filter((h) => h.lanes?.length).length,
    conDano: (meta.heroes ?? []).filter((h) => h.damage).length,
    cruces: cifras.cruces,
    sinergias: cifras.sinergias,
    cobertura: Number(densidadCounters(datos.poolsPorLinea.roam, datos.meta.counters, datos.heroes).cobertura.toFixed(4)),
    ruido: ruido ? Number(ruido.razon.toFixed(3)) : null,
    objetos: cifras.objetos,
    builds: cifras.builds,
    pools: Object.fromEntries(LINEAS.map((l) => [l, datos.poolsPorLinea[l].length])),
    // De qué rango sale la fuerza (3.11.0): Mítico mientras Gloria está vacía tras un reinicio.
    fuerza: datos.meta.fuerza?.rango ?? null,
    coherenciaRango: datos.meta.fuerza?.coherencia != null ? Number(datos.meta.fuerza.coherencia.toFixed(3)) : null,
  };
  await mkdir(dirname(resolve(ROOT, rutaHistorial)), { recursive: true });
  await appendFile(resolve(ROOT, rutaHistorial), `${JSON.stringify(fila)}\n`);
  console.log(`Anotado en ${rutaHistorial}`);
}

if (fallosTotales) {
  console.error(`\n${fallosTotales} FALLOS repartidos por las cinco líneas.`);
  process.exit(1);
}
