/**
 * Las relaciones entre heroes: como se leen las respuestas de counters y de
 * compatibilidad (nombres de campo, ids, deltas contra winrates absolutos) y
 * como se piden las dos matrices, heroe a heroe, para el rango pedido.
 */

import { DAYS, RANK, diagnostics, estado, sleep } from './contexto.mjs';
import { callRoute } from './descarga.mjs';
// La MISMA funcion que usa la app para normalizar los nombres.
import { nombreClave as normName } from '../../src/motor/nombres.js';

/**
 * Lectura de las respuestas de counters y compatibilidad.
 *
 * Vive aparte de la ingesta para poder probarlo con respuestas reales guardadas,
 * sin levantar servidores ni salir a internet. Toda la fragilidad de este
 * proyecto está aquí: la API envuelve los datos en varias capas y nombra los
 * campos de formas distintas según el endpoint.
 */

export const NAME_KEYS = [
  'name', 'hero_name', 'heroname', 'hero', 'heroName',
  'target_name', 'opponent', 'enemy_name', 'against', 'title', 'label',
];

/**
 * Claves que identifican a un héroe. NO se incluye `id` a secas: la respuesta
 * trae `main_hero_channel.id` con valores como 2678829, y la búsqueda recursiva
 * se quedaba con ese en vez del 93 del héroe. La API lo rechazaba con un 422
 * diciendo que el identificador debe ser <= 133.
 */
export const ID_KEYS = ['heroid', 'hero_id', 'heroId', 'sub_heroid', 'main_heroid'];

/** Hoy hay ~133 héroes. Un número muy por encima no es un héroe, es otra cosa. */
export const MAX_HERO_ID = 400;

export const esIdDeHeroe = (v) =>
  typeof v === 'number' && Number.isInteger(v) && v > 0 && v <= MAX_HERO_ID;

/**
 * Id del héroe PRINCIPAL de un registro.
 *
 * Mira solo el nivel superior y el `data` inmediato, y prueba `main_heroid`
 * antes que nada. Buscar en profundidad se metía dentro de `sub_hero` y volvía
 * con el id del primer rival en lugar del héroe del registro.
 */
export function idPrincipal(row) {
  const niveles = [row, row?.data, row?.data?.data].filter((n) => n && typeof n === 'object');
  const orden = ['main_heroid', 'hero_id', 'heroid', 'heroId'];

  for (const clave of orden) {
    for (const nivel of niveles) {
      if (esIdDeHeroe(nivel[clave])) return nivel[clave];
    }
  }
  return null;
}

/** Campos que expresan una VENTAJA sobre la media, no un winrate absoluto. */
export const DELTA_KEYS = [
  'increase_win_rate', 'increase_winrate', 'win_rate_increase',
  'winRateIncrease', 'delta', 'advantage', 'diff',
];

export const ABS_KEYS = [
  'win_rate', 'hero_win_rate', 'winRate', 'winrate', 'wr', 'rate', 'value', 'score',
];

/**
 * La API mezcla 0.52 y 52 para decir lo mismo. Con Math.abs, además, un delta
 * negativo (-2.5, o sea -2,5 puntos) se convierte bien.
 */
export const asRate = (n) => {
  if (n == null) return null;
  const x = Number(n);
  if (Number.isNaN(x)) return null;
  return Math.abs(x) > 1 ? x / 100 : x;
};

/** Busca un valor por varios nombres de campo, a cualquier profundidad. */
export function pick(obj, keys, depth = 0) {
  if (depth > 6 || obj == null || typeof obj !== 'object') return undefined;
  for (const k of keys) {
    if (obj[k] != null && typeof obj[k] !== 'object') return obj[k];
  }
  for (const v of Object.values(obj)) {
    const found = pick(v, keys, depth + 1);
    if (found !== undefined) return found;
  }
  return undefined;
}

/**
 * Recorre la respuesta entera y recoge los objetos que describen a un rival.
 *
 * Un rival puede venir identificado por nombre o SOLO por su id numérico: en
 * esta API, `sub_hero` trae `heroid` y la URL de su icono, sin ninguna cadena
 * con el nombre. Buscar solo nombres devolvía cero pares.
 */
export function recogerPares(node, out = [], depth = 0) {
  if (depth > 10 || node == null) return out;

  // Algunas respuestas guardan el contenido como texto JSON dentro de un campo.
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
  const tieneTasa = [...DELTA_KEYS, ...ABS_KEYS]
    .some((k) => node[k] != null && typeof node[k] !== 'object');

  if ((tieneNombre || tieneId) && tieneTasa) out.push(node);

  for (const v of Object.values(node)) recogerPares(v, out, depth + 1);
  return out;
}

/**
 * Convierte los objetos recogidos en un mapa { rival: winrate }.
 *
 * `idToName` resuelve los rivales que solo traen id. El winrate se saca del
 * delta si lo hay (más fiable, ya viene centrado en la media) y si no, del
 * valor absoluto. Se descarta lo que caiga fuera de 20%-80%, que sería un dato
 * mal leído y no un matchup.
 */
export function relationMap(rows, idToName = new Map()) {
  const map = {};

  for (const row of rows) {
    let name = NAME_KEYS.map((k) => row[k]).find((v) => typeof v === 'string');
    if (!name) {
      const id = ID_KEYS.map((k) => row[k]).find(esIdDeHeroe);
      name = idToName.get(Number(id));
    }
    if (!name) continue;

    const delta = asRate(DELTA_KEYS.map((k) => row[k]).find((v) => v != null));
    const abs = asRate(ABS_KEYS.map((k) => row[k]).find((v) => v != null));
    const valor = delta != null ? 0.5 + delta : abs;

    if (valor != null && valor > 0.2 && valor < 0.8) map[String(name).trim()] = valor;
  }

  return map;
}

/**
 * Nombre del héroe al que se refiere un registro de relaciones. Sirve para
 * comprobar que la respuesta corresponde al héroe que se pidió.
 */
export function heroeDelRegistro(data) {
  return pick(data?.data ?? data, ['name']) ?? null;
}

/**
 * Pares héroe→rival. Unos campos son winrate absoluto y otros un delta sobre la
 * media, y distinguirlos por su tamaño fallaba: un delta de +0.25 se tomaba por
 * un winrate del 25%. Ahora se mira QUÉ campo vino, que es lo que lo determina.
 */
export async function fetchRelations(roamNames, stats, heroList, rango = RANK, { remedir = null } = {}) {
  const counters = {};
  const synergies = {};

  // El id puede venir en las estadísticas o en la lista de héroes. Si no está en
  // ninguna, la API acepta también el nombre como identificador, así que se usa
  // eso antes que rendirse: antes bastaba con que faltara el id para que TODOS
  // los counters se quedaran vacíos sin decir nada.
  // La MISMA normalización que el motor (ya se importa): había dos copias
  // distintas en este fichero, sin NFD ni «&→and».
  const norm = normName;
  const idPorNombre = new Map();
  const idToName = new Map();
  for (const [n, st] of Object.entries(stats)) {
    if (st.heroId) { idPorNombre.set(norm(n), st.heroId); idToName.set(Number(st.heroId), n); }
  }
  for (const h of heroList ?? []) {
    if (h.id) { idPorNombre.set(norm(h.name), h.id); idToName.set(Number(h.id), h.name); }
  }
  console.log(`  · ${idToName.size} héroes con id conocido`);
  if (!idToName.size) {
    console.warn('  · SIN IDS: los counters se pedirán por nombre');
  }

  diagnostics.relations = {
    rutaCounter: estado.ROUTES?.counter ? `${estado.ROUTES.counter.method} ${estado.ROUTES.counter.template}` : null,
    // 'ejemplos' tiene que estar aqui: mas abajo se lee su .length, y sin
    // inicializar reventaba con un TypeError por cada roamer al que SI le
    // llegaban los counters. Los datos se salvaban (se asignan antes), pero el
    // diagnostico se llenaba de cuatro errores falsos y, con el tope de 4
    // alcanzado, tapaba los errores de verdad.
    conId: 0, porNombre: 0, ok: 0, errores: [], ejemplos: [], rutaCambiada: [],
  };

  const remedidas = {};
  // Los fallos en que la API CONTESTÓ con un error suyo (5xx, 429): los de un rato malo (3.87.5).
  let fallosDePaso = 0;
  const pedir = async (name) => {
    const id = idPorNombre.get(norm(name)) ?? name;
    try {
      // size grande: por defecto la API pagina de 20 en 20 y se perdian cruces.
      const values = { days: DAYS, past_days: DAYS, rank: rango, rank_id: rango, lang: 'en', size: 200, index: 1 };
      const [c, s] = await Promise.all([
        // Sin ruta en el esquema no se prueba a ciegas: acababa llamando a
        // dominios muertos y llenando el diagnóstico de errores de Vercel que
        // no decían nada del problema real.
        estado.ROUTES?.counter
          ? callRoute(estado.ROUTES.counter, { ...values, hero_id: id, id }, id)
          : Promise.reject(new Error('sin ruta de counter en el esquema')),
        estado.ROUTES?.compatibility
          ? callRoute(estado.ROUTES.compatibility, { ...values, hero_id: id, id }, id)
          : Promise.reject(new Error('sin ruta de compatibilidad en el esquema')),
      ]);
      // En la segunda pasada una respuesta vacía no borra lo que ya llegó.
      const yaTenia = Object.keys(counters[name] ?? {}).length > 0;
      let nc = relationMap(recogerPares(c.data), idToName);
      let ns = relationMap(recogerPares(s.data), idToName);
      // Una fila corta (3.60.2): la ruta elegida puede ser la que da 5+5
      // (la medida se hizo con la API fallando). Se vuelve a medir con este
      // héroe y, si otra ruta trae más, se cambia para el resto de la corrida.
      for (const [clave, fila] of [['counter', nc], ['compatibility', ns]]) {
        if (!remedir || Object.keys(fila).length >= FILA_CORTA || (remedidas[clave] ?? 0) >= REMEDIDAS_MAXIMAS) continue;
        remedidas[clave] = (remedidas[clave] ?? 0) + 1;
        const antes = estado.ROUTES?.[clave];
        await remedir(clave, id);
        if (estado.ROUTES?.[clave] === antes) continue;
        const otra = await callRoute(estado.ROUTES[clave], { ...values, hero_id: id, id }, id);
        const nueva = relationMap(recogerPares(otra.data), idToName);
        if (clave === 'counter') nc = nueva; else ns = nueva;
        diagnostics.relations.rutaCambiada.push(`${clave}: ${estado.ROUTES[clave].template}`);
      }
      if (Object.keys(nc).length || !counters[name]) counters[name] = nc;
      if (Object.keys(ns).length || !synergies[name]) synergies[name] = ns;
      if (Object.keys(counters[name]).length && !yaTenia) {
        diagnostics.relations.ok++;
        if (diagnostics.relations.ejemplos.length < 2) {
          const pares = Object.entries(counters[name]).slice(0, 3)
            .map(([k, v]) => `${k} ${(v * 100).toFixed(1)}%`).join(', ');
          diagnostics.relations.ejemplos.push(`${name} vs ${pares}`);
        }
      } else if (!yaTenia && diagnostics.relations.errores.length < 2) {
        // Respondió pero no supimos leerlo. Guardamos un trozo de la respuesta
        // TAL CUAL: los nombres de campo son lo único que falta por saber, y
        // adivinarlos de uno en uno cuesta un despliegue por intento.
        diagnostics.relations.errores.push(`${name}: respuesta sin pares legibles`);
        diagnostics.relations.muestra = JSON.stringify(c.data).slice(0, 900);
      }
    } catch (err) {
      if (err?.status >= 500 || err?.status === 429) fallosDePaso += 1;
      if (diagnostics.relations.errores.length < 4) {
        diagnostics.relations.errores.push(`${name}: ${err.message}`);
      }
    }
    await sleep(250); // cortesía con una API gratuita
  };
  for (const name of roamNames) {
    if (idPorNombre.has(norm(name))) diagnostics.relations.conId++;
    else diagnostics.relations.porNombre++;
    await pedir(name);
  }
  // Una segunda pasada con los que fallaron (3.57.5). Con la API a medias
  // (500 «Worker threw exception», 503 «exceeded resource limits», 403 de
  // Cloudflare) el 14 de octubre de 2026 el bot bajó 106 de 133: por debajo
  // del 90% de `anotarFrescura`, el comparador tiró la corrida entera con
  // las estadísticas, los talentos y las builds frescos. Los fallos eran
  // pasajeros. Hasta 3.87.5 solo con la mitad o menos caída («con la API
  // caída del todo reintentarlo todo doblaría el tiempo»): el 29 de octubre
  // de 2026 la ruta de cruces lo tiró TODO en ratos de un minuto (11:30,
  // 15:49, 16:32) y respondía antes y después, y una pasada que falla tarda
  // 40 s (0,3 s por héroe), no lo que una buena. Con más de la mitad caída
  // se espera más (`REINTENTO_CAIDA_MS`), una vez.
  const falta = (n) => !Object.keys(counters[n] ?? {}).length || !Object.keys(synergies[n] ?? {}).length;
  const fallidos = roamNames.filter(falta);
  const casiTodos = fallidos.length > roamNames.length / 2;
  // Sin red, sin ruta o con un 4xx, esperar no arregla nada: la segunda pasada con casi todo caído solo si la API contestó.
  if (fallidos.length && (!casiTodos || fallosDePaso > 0)) {
    console.log(`  · ${fallidos.length} sin cruces o sin parejas: se piden otra vez en ${(casiTodos ? REINTENTO_CAIDA_MS : REINTENTO_RELACIONES_MS) / 1000} s`);
    await sleep(casiTodos ? REINTENTO_CAIDA_MS : REINTENTO_RELACIONES_MS);
    for (const name of fallidos) await pedir(name);
    diagnostics.relations.reintentados = fallidos.length;
    diagnostics.relations.recuperados = fallidos.filter((n) => !falta(n)).length;
  }
  return { counters, synergies };
}

/**
 * Por debajo de tantos pares una fila es «corta» y se vuelve a medir la ruta
 * (3.60.2), como mucho `REMEDIDAS_MAXIMAS` veces por ruta y corrida. Una fila
 * sana trae 132; la ruta del esquema, 10. Decisión de producto, lejos de los dos.
 */
export const FILA_CORTA = 20, REMEDIDAS_MAXIMAS = 3;

/** Pausa antes de la segunda pasada: los fallos de la API vienen en rachas. Decisión de producto. */
export const REINTENTO_RELACIONES_MS = 20000;
/** Pausa antes de la segunda pasada con más de la mitad caída (3.87.5): los ratos de «Error 1101» del 29 de octubre de 2026 duraban un minuto. Decisión de producto. */
export const REINTENTO_CAIDA_MS = 60000;
