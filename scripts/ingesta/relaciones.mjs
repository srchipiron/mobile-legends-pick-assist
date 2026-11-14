/**
 * Cruces y parejas: cómo se leen las respuestas (nombres o ids, deltas o
 * winrates absolutos) y cómo se piden las dos matrices héroe a héroe, con la
 * segunda pasada para los que fallan.
 */

import { callRoute, esFalloDePaso } from './descarga.mjs';
import { nombreClave } from '../../src/motor/nombres.js';

export const NAME_KEYS = ['name', 'hero_name', 'heroname', 'hero', 'heroName', 'target_name', 'opponent', 'enemy_name', 'against', 'title', 'label'];
/** Sin `id` a secas: `main_hero_channel.id` (2.678.829) no es un héroe [M]. */
export const ID_KEYS = ['heroid', 'hero_id', 'heroId', 'sub_heroid', 'main_heroid'];
export const MAX_HERO_ID = 400;
export const esIdDeHeroe = (v) => typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= MAX_HERO_ID;

/** Campos de VENTAJA sobre la media (un delta de +0,25 no es un 25 %) [M]. */
export const DELTA_KEYS = ['increase_win_rate', 'increase_winrate', 'win_rate_increase', 'winRateIncrease', 'delta', 'advantage', 'diff'];
export const ABS_KEYS = ['win_rate', 'hero_win_rate', 'winRate', 'winrate', 'wr', 'rate', 'value', 'score'];

/** La API mezcla 0,52 y 52 para lo mismo [M]. */
export const asRate = (n) => {
  if (n == null) return null;
  const x = Number(n);
  if (Number.isNaN(x)) return null;
  return Math.abs(x) > 1 ? x / 100 : x;
};

/** Un valor por varios nombres de campo, a cualquier profundidad (≤ 6). */
export function pick(obj, keys, depth = 0) {
  if (depth > 6 || obj == null || typeof obj !== 'object') return undefined;
  for (const k of keys) if (obj[k] != null && typeof obj[k] !== 'object') return obj[k];
  for (const v of Object.values(obj)) {
    const found = pick(v, keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** El id del héroe PRINCIPAL: solo la fila, `data` y `data.data` (más hondo está el de un rival) [M]. */
export function idPrincipal(row) {
  const niveles = [row, row?.data, row?.data?.data].filter((n) => n && typeof n === 'object');
  for (const clave of ['main_heroid', 'hero_id', 'heroid', 'heroId']) {
    for (const nivel of niveles) if (esIdDeHeroe(nivel[clave])) return nivel[clave];
  }
  return null;
}

/** Los objetos que describen a un rival (por nombre O por id, con alguna tasa), también dentro de JSON en cadenas. */
export function recogerPares(node, out = [], depth = 0) {
  if (depth > 10 || node == null) return out;
  if (typeof node === 'string') {
    const t = node.trim();
    if ((t.startsWith('{') || t.startsWith('[')) && t.length < 200000) {
      try { return recogerPares(JSON.parse(t), out, depth + 1); } catch { /* no era JSON */ }
    }
    return out;
  }
  if (typeof node !== 'object') return out;
  if (Array.isArray(node)) {
    for (const v of node) recogerPares(v, out, depth + 1);
    return out;
  }
  const tieneNombre = NAME_KEYS.some((k) => typeof node[k] === 'string');
  const tieneId = ID_KEYS.some((k) => esIdDeHeroe(node[k]));
  const tieneTasa = [...DELTA_KEYS, ...ABS_KEYS].some((k) => node[k] != null && typeof node[k] !== 'object');
  if ((tieneNombre || tieneId) && tieneTasa) out.push(node);
  for (const v of Object.values(node)) recogerPares(v, out, depth + 1);
  return out;
}

/** `{ rival: winrate }`: del delta si lo hay (ya centrado), si no del absoluto; solo 0,2 < v < 0,8 [D]. */
export function relationMap(rows, idToName = new Map()) {
  const map = {};
  for (const row of rows) {
    let name = NAME_KEYS.map((k) => row[k]).find((v) => typeof v === 'string');
    if (!name) name = idToName.get(Number(ID_KEYS.map((k) => row[k]).find(esIdDeHeroe)));
    if (!name) continue;
    const delta = asRate(DELTA_KEYS.map((k) => row[k]).find((v) => v != null));
    const abs = asRate(ABS_KEYS.map((k) => row[k]).find((v) => v != null));
    const valor = delta != null ? 0.5 + delta : abs;
    if (valor != null && valor > 0.2 && valor < 0.8) map[String(name).trim()] = valor;
  }
  return map;
}

/** Por debajo, una fila es corta y se vuelve a medir la ruta (sana 132, la corta 10), ≤ 3 veces por ruta [M]. */
export const FILA_CORTA = 20;
export const REMEDIDAS_MAXIMAS = 3;
/** Pausa antes de la segunda pasada: los fallos vienen en rachas [D]. */
export const REINTENTO_RELACIONES_MS = 20000;
/** Con más de la mitad caída: los ratos de «Error 1101» duraban un minuto [M]. */
export const REINTENTO_CAIDA_MS = 60000;

const llena = (fila) => Object.keys(fila ?? {}).length > 0;

/**
 * Cruces y parejas de `nombres` en `rango`, en paralelo por héroe (por id si
 * se sabe, si no por nombre). Sin ruta en el esquema no se prueba a ciegas.
 * Una respuesta vacía no pisa una fila ya llegada. Devuelve `{ counters,
 * synergies, diag }`; no lanza.
 */
export async function pedirRelaciones(ctx, nombres, stats, heroList, rango, { remedir = null } = {}) {
  const counters = {};
  const synergies = {};
  const idPorNombre = new Map();
  const idToName = new Map();
  for (const [n, st] of Object.entries(stats)) if (st.heroId) { idPorNombre.set(nombreClave(n), st.heroId); idToName.set(Number(st.heroId), n); }
  for (const h of heroList ?? []) if (h.id) { idPorNombre.set(nombreClave(h.name), h.id); idToName.set(Number(h.id), h.name); }
  console.log(`  · ${idToName.size} héroes con id conocido`);
  if (!idToName.size) console.warn('  · SIN IDS: los counters se pedirán por nombre');

  const diag = {
    rutaCounter: ctx.rutas?.counter ? `${ctx.rutas.counter.method} ${ctx.rutas.counter.template}` : null,
    conId: 0, porNombre: 0, ok: 0, errores: [], ejemplos: [], rutaCambiada: [],
  };
  const valores = { days: ctx.op.dias, past_days: ctx.op.dias, rank: rango, rank_id: rango, lang: 'en', size: 200, index: 1 };
  const remedidas = {};
  let fallosDePaso = 0;
  const llamar = (clave, id) => (ctx.rutas?.[clave]
    ? callRoute(ctx.rutas[clave], { ...valores, hero_id: id, id }, id)
    : Promise.reject(new Error(`sin ruta de ${clave === 'counter' ? 'counter' : 'compatibilidad'} en el esquema`)));
  const leer = (r) => relationMap(recogerPares(r.data), idToName);

  const pedir = async (name) => {
    const id = idPorNombre.get(nombreClave(name)) ?? name;
    try {
      const [c, s] = await Promise.all([llamar('counter', id), llamar('compatibility', id)]);
      const yaTenia = llena(counters[name]);
      const filas = { counter: leer(c), compatibility: leer(s) };
      // Una fila corta: la ruta elegida puede ser la de 5+5; se vuelve a medir con este héroe [M].
      for (const clave of ['counter', 'compatibility']) {
        if (!remedir || Object.keys(filas[clave]).length >= FILA_CORTA || (remedidas[clave] ?? 0) >= REMEDIDAS_MAXIMAS) continue;
        remedidas[clave] = (remedidas[clave] ?? 0) + 1;
        const antes = ctx.rutas?.[clave];
        await remedir(clave, id);
        if (ctx.rutas?.[clave] === antes) continue;
        filas[clave] = leer(await llamar(clave, id));
        diag.rutaCambiada.push(`${clave}: ${ctx.rutas[clave].template}`);
      }
      if (llena(filas.counter) || !counters[name]) counters[name] = filas.counter;
      if (llena(filas.compatibility) || !synergies[name]) synergies[name] = filas.compatibility;
      if (llena(counters[name]) && !yaTenia) {
        diag.ok++;
        if (diag.ejemplos.length < 2) {
          diag.ejemplos.push(`${name} vs ${Object.entries(counters[name]).slice(0, 3).map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`).join(', ')}`);
        }
      } else if (!yaTenia && diag.errores.length < 2) {
        // Respondió y no se supo leer: un trozo TAL CUAL dice qué campos faltan [D].
        diag.errores.push(`${name}: respuesta sin pares legibles`);
        diag.muestra = JSON.stringify(c.data).slice(0, 900);
      }
    } catch (err) {
      if (esFalloDePaso(err)) fallosDePaso += 1;
      if (diag.errores.length < 4) diag.errores.push(`${name}: ${err.message}`);
    }
    await ctx.sleep(250);
  };

  for (const name of nombres) {
    if (idPorNombre.has(nombreClave(name))) diag.conId++;
    else diag.porNombre++;
    await pedir(name);
  }
  // Segunda pasada, UNA vez, a los que quedaron sin cruces o sin parejas. Con más de
  // la mitad caída, solo si la API contestó con un error suyo (sin red, esperar no arregla) [M].
  const falta = (n) => !llena(counters[n]) || !llena(synergies[n]);
  const fallidos = nombres.filter(falta);
  const casiTodos = fallidos.length > nombres.length / 2;
  if (fallidos.length && (!casiTodos || fallosDePaso > 0)) {
    const espera = casiTodos ? REINTENTO_CAIDA_MS : REINTENTO_RELACIONES_MS;
    console.log(`  · ${fallidos.length} sin cruces o sin parejas: se piden otra vez en ${espera / 1000} s`);
    await ctx.sleep(espera);
    for (const name of fallidos) await pedir(name);
    diag.reintentados = fallidos.length;
    diag.recuperados = fallidos.filter((n) => !falta(n)).length;
  }
  return { counters, synergies, diag };
}
