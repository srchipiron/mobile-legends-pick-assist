#!/usr/bin/env node
/**
 * ¿La corrida nueva resuelve MENOS que la guardada? La ingesta se degrada en
 * silencio y por diseño (cada endpoint que falla conserva lo anterior), así
 * que una corrida mala se parece a una buena en el diff [C]. Sale con 1 si la
 * nueva es peor y con 2 si no puede leer una de las dos; sin guardada, acepta.
 *
 *   node scripts/comparar-ingesta.mjs <nueva.json> <guardada.json>
 */

import { readFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RANGO_DE_RESPALDO } from '../src/motor/ventana.js';
import { HISTORIA_DIAS } from '../src/motor/tendencia.js';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Un margen para el ruido normal de la API: un héroe sin cruces un día no es una regresión [D]. */
export const MARGEN = 0.9;
/**
 * Recuentos de tamaño conocido: se comparan también con el MÁXIMO del
 * historial de salud (contra la anterior era un trinquete hacia abajo). Objetos
 * y builds no: varían por diseño [D].
 */
export const FIJAS = ['heroes', 'conLinea', 'conRol', 'conDano', 'conSpeciality', 'conHabilidades', 'cruces', 'sinergias', 'winrateLinea', 'curvaLinea'];

const celdas = (m) => Object.values(m ?? {}).reduce((n, fila) => n + Object.keys(fila ?? {}).length, 0);
const porLinea = (m, cuenta) => Object.values(m ?? {}).reduce((n, lineas) => n + Object.values(lineas ?? {}).reduce((k, l) => k + cuenta(l), 0), 0);
const noVacia = (v) => Array.isArray(v) && v.length > 0;

/** ¿Se descargaron casi todas las filas de cruces y de parejas? Un fichero sin la marca cuenta como fresco. */
function matrizFresca(r) {
  if (!r) return 1;
  const casi = (n) => r.pedidas && n / r.pedidas >= 0.9;
  return casi(r.relaciones) && casi(r.parejas ?? r.relaciones) ? 1 : 0;
}

/** Lo que la app necesita, contado (pares y filas, no héroes con algo). */
export function medir(datos) {
  const heroes = datos?.heroes ?? [];
  const rango = datos?.rank;
  const respaldo = RANGO_DE_RESPALDO[rango];
  const frescos = datos?.diagnostics?.frescos;
  const conRango = rango && datos?.statsByRank?.[rango] ? 1 : 0;
  const equipo = Object.values(datos?.equipment ?? {});
  return {
    heroes: heroes.length,
    conLinea: heroes.filter((h) => noVacia(h?.lanes)).length,
    conRol: heroes.filter((h) => h?.role).length,
    conDano: heroes.filter((h) => h?.damage).length,
    conSpeciality: heroes.filter((h) => noVacia(h?.speciality)).length,
    conHabilidades: heroes.filter((h) => noVacia(h?.habilidades)).length,
    stats: Object.keys(datos?.stats ?? {}).length,
    // Los RANGOS, y el pedido entre ellos: con el suyo caído se colaba otro bajo su etiqueta [C].
    rangos: Object.keys(datos?.statsByRank ?? {}).length,
    rangoPedido: conRango,
    // DESCARGADOS en esa corrida, el pedido y su respaldo; un fichero sin `frescos`, por lo que tenga [C].
    rangoFresco: frescos ? (frescos.includes(rango) && (!respaldo || frescos.includes(respaldo)) ? 1 : 0) : conRango,
    relacionesFrescas: matrizFresca(datos?.diagnostics?.frescosRecursos),
    counters: Object.keys(datos?.counters ?? {}).length,
    cruces: celdas(datos?.counters),
    sinergias: celdas(datos?.synergies),
    objetos: equipo.length,
    objetosConDefensa: equipo.filter((o) => o?.magica || o?.fisica).length,
    objetosConEfecto: equipo.filter((o) => noVacia(o?.efectos)).length,
    builds: porLinea(datos?.builds, (l) => l?.length ?? 0),
    talentos: Object.keys(datos?.talentos ?? {}).length,
    buildsConTalentos: porLinea(datos?.builds, (l) => (Array.isArray(l) ? l.filter((b) => b?.talentos?.length).length : 0)),
    winrateLinea: celdas(datos?.winrateLinea),
    curvaLinea: celdas(datos?.curvaLinea),
  };
}

/** Días de la historia guardada que deberían seguir en la nueva (dentro de su ventana) y faltan. */
export function diasPerdidos(nueva, guardada) {
  const fechas = (d) => (Array.isArray(d?.historia) ? d.historia.map((e) => e?.fecha).filter(Boolean) : []);
  const nuevas = new Set(fechas(nueva));
  const ultima = [...nuevas, ...fechas(guardada)].sort().at(-1);
  if (!ultima) return [];
  const limite = new Date(Date.parse(`${ultima}T00:00:00Z`) - (HISTORIA_DIAS - 1) * 864e5).toISOString().slice(0, 10);
  return fechas(guardada).filter((f) => !nuevas.has(f) && f >= limite);
}

/** El máximo de cada recuento fijo en las filas de historial/salud.jsonl (las líneas rotas, fuera). */
export function maximosDelHistorial(texto) {
  const maximos = {};
  for (const linea of String(texto ?? '').split('\n')) {
    if (!linea.trim()) continue;
    let fila;
    try { fila = JSON.parse(linea); } catch { continue; }
    for (const clave of FIJAS) if (typeof fila?.[clave] === 'number' && fila[clave] > (maximos[clave] ?? 0)) maximos[clave] = fila[clave];
  }
  return maximos;
}

/**
 * `{ nueva, guardada, peores }`. Una matriz conservada NO tira la corrida
 * (lleva su fecha; perder cruces o parejas sí); unas estadísticas conservadas
 * con la matriz nueva entera, tampoco; sin NADA fresco, siempre [C].
 */
export function comparar(nueva, guardada, maximos = {}) {
  const a = medir(nueva);
  const b = medir(guardada);
  const peores = [];
  const perdidos = diasPerdidos(nueva, guardada);
  if (perdidos.length) peores.push({ clave: 'historia', antes: perdidos.join(', '), ahora: 'perdidos' });
  for (const clave of Object.keys(b)) {
    if (clave === 'relacionesFrescas' || (clave === 'rangoFresco' && a.relacionesFrescas)) continue;
    const referencia = FIJAS.includes(clave) ? Math.max(b[clave], maximos?.[clave] ?? 0) : b[clave];
    if (referencia > 0 && a[clave] < referencia * MARGEN) peores.push({ clave, antes: referencia, ahora: a[clave] });
  }
  if (!a.rangoFresco && !a.relacionesFrescas) peores.push({ clave: 'nadaFresco', antes: 'algo fresco', ahora: 'nada' });
  return { nueva: a, guardada: b, peores };
}

/** Solo «no existe» se acepta (primera corrida): una errata o un JSON roto apagaban el guardarraíl [C]. */
async function leer(ruta) {
  try {
    return JSON.parse(await readFile(ruta, 'utf8'));
  } catch (e) {
    if (e?.code === 'ENOENT') return null;
    console.error(`No se ha podido leer ${ruta}: ${e.message}`);
    process.exit(2);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const [rutaNueva, rutaGuardada] = process.argv.slice(2);
  if (!rutaNueva) {
    console.error('uso: node scripts/comparar-ingesta.mjs <nueva.json> [guardada.json]');
    process.exit(2);
  }
  const nueva = await leer(rutaNueva);
  if (!nueva) {
    console.error(`No se ha podido leer la corrida nueva: ${rutaNueva}`);
    process.exit(2);
  }
  const guardada = rutaGuardada ? await leer(rutaGuardada) : null;
  if (!guardada) {
    console.log('No hay corrida anterior con la que comparar: se acepta.');
    process.exit(0);
  }
  let maximos = {};
  try { maximos = maximosDelHistorial(await readFile(resolve(RAIZ, 'historial/salud.jsonl'), 'utf8')); } catch { /* sin historial */ }
  const { nueva: a, guardada: b, peores } = comparar(nueva, guardada, maximos);
  const linea = (m) => Object.entries(m).map(([k, v]) => `${k}=${v}`).join('  ');
  if (Object.keys(maximos).length) console.log(`máximos del historial: ${linea(maximos)}`);
  console.log(`guardada: ${linea(b)}`);
  console.log(`nueva:    ${linea(a)}`);
  if (peores.length) {
    console.error('\nLa corrida nueva resuelve MENOS que la guardada:');
    for (const p of peores) console.error(`  ${p.clave}: ${p.antes} → ${p.ahora}`);
    console.error('\nNo se commitea: los datos de antes son mejores.');
    process.exit(1);
  }
  if (a.relacionesFrescas < b.relacionesFrescas) console.log(`\nCruces y parejas conservados de la corrida anterior (descargados ${nueva?.relaciones?.descargada ?? '¿?'}): se acepta con las estadísticas nuevas.`);
  console.log('\nLa corrida nueva no empeora nada.');
}
