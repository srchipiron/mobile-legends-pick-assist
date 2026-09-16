import { nombreClave, buscar } from './nombres.js';

/**
 * Las matrices de la API: cruces (counters) y parejas (synergies), ya
 * indexadas por clave en sus dos niveles.
 *
 * Lo medido y que no conviene volver a suponer:
 *  - Los cruces son antisimétricos: c[a][b] + c[b][a] = 1.0000 en los 8.778
 *    pares. Leer el sentido contrario no es una estimación, es el mismo dato.
 *  - No llevan dentro la fuerza de nadie (r = −0,003 con el winrate del
 *    rival): son índices de cruce ya centrados.
 *  - No son ruidosos: el cuartil menos jugado dispersa 1,16× lo que el más
 *    jugado (muestreo puro daría 2,65×), y dos corridas separadas nueve
 *    minutos difieren 0,00003. Por eso nada se encoge por muestra.
 *  - Las parejas son simétricas (|s[a][b] − s[b][a]| = 0,0000) y su media no
 *    es 0,5 (0,4954): se centran en la media de las parejas de líneas
 *    distintas ponderada por pick (`mediaDeSinergia`).
 */

/** Fuera de (0.02, 0.98) no es un winrate: es un dato roto. */
export const valido = (p) => typeof p === 'number' && p > 0.02 && p < 0.98;

/**
 * Desde qué cruce merece decir «ganas» o «pierdes»: el p90/p10 de los
 * 17.556 cruces reales (0.5154 / 0.4846). Era 0.53, el percentil 99, y el
 * motivo con dato casi nunca salía. Es dónde está la cola, no una opinión.
 */
export const CRUCE_DESTACABLE = 0.5154;
export const CRUCE_MALO = 0.4846;

/** Lo mismo para las parejas, con SU distribución: p90 = 0.5100 (8.778 parejas). */
export const PAREJA_DESTACABLE = 0.51;

/** Winrate de A contra B, mirando también el sentido contrario (1 − c[b][a]). */
export function cruce(counters, a, b) {
  const ida = buscar(buscar(counters, a), b);
  if (ida != null) return ida;
  const vuelta = buscar(buscar(counters, b), a);
  return vuelta != null ? 1 - vuelta : undefined;
}

/** Sinergia de A con B, mirando los dos sentidos SIN darle la vuelta: es el mismo dato. */
export function sinergia(synergies, a, b) {
  const ida = buscar(buscar(synergies, a), b);
  if (ida != null) return ida;
  return buscar(buscar(synergies, b), a);
}

const mediasDeSinergia = new WeakMap();

/**
 * El centro de las parejas: la media de las que pueden ir JUNTAS (líneas
 * distintas), ponderada por lo que se juegan. La media de toda la matriz
 * mezcla las parejas de la misma línea (las malas, 0,486) con las reales
 * (0,500), y centrar ahí favorecía al equipo con más héroes en pantalla en
 * un draft a medias (1 contra 5: 46%; 5 contra 1: 53%). Sin `lineas` se cae
 * a la media global. Cacheada por matriz.
 */
export function mediaDeSinergia(synergies, lineas = null, stats = null) {
  if (!synergies || typeof synergies !== 'object') return 0.5;
  const cache = mediasDeSinergia.get(synergies);
  if (cache && cache.lineas === lineas && cache.stats === stats) return cache.media;
  const lanesDe = (n) => lineas?.get?.(n)?.lanes ?? null;
  const pesoDe = (n) => stats?.[n]?.pickRate ?? 1;
  let suma = 0; let n = 0;
  for (const [a, fila] of Object.entries(synergies)) {
    const la = lineas ? lanesDe(nombreClave(a)) : null;
    for (const [b, v] of Object.entries(fila ?? {})) {
      if (!valido(v)) continue;
      if (lineas) {
        const lb = lanesDe(nombreClave(b));
        if (la && lb && la.some((l) => lb.includes(l))) continue;
      }
      const w = stats ? pesoDe(nombreClave(a)) * pesoDe(nombreClave(b)) : 1;
      suma += v * w; n += w;
    }
  }
  const media = n ? suma / n : 0.5;
  mediasDeSinergia.set(synergies, { lineas, stats, media });
  return media;
}

/** Cuántos del pool tienen winrate y cuántos tienen fila de cruces. */
export function cobertura(pool, stats, counters) {
  const faltan = stats ? pool.filter((h) => !buscar(stats, h.name)).map((h) => h.name) : pool.map((h) => h.name);
  const conCounters = counters ? pool.filter((h) => Object.keys(buscar(counters, h.name) ?? {}).length).length : 0;
  return { conDatos: pool.length - faltan.length, total: pool.length, faltan, conCounters };
}

/**
 * Densidad de la matriz: rivales por héroe del pool de media, y qué fracción
 * de los cruces posibles contra `candidatos` tiene dato. Un héroe contra sí
 * mismo no cuenta: no es un cruce que falte.
 */
export function densidadCounters(pool, counters, candidatos = []) {
  if (!counters) return { media: 0, cobertura: 0 };
  const tam = pool.map((h) => Object.keys(buscar(counters, h.name) ?? {}).length);
  const media = tam.reduce((a, b) => a + b, 0) / (tam.length || 1);
  let conDato = 0; let total = 0;
  for (const h of pool) {
    for (const e of candidatos) {
      if (nombreClave(h.name) === nombreClave(e.name)) continue;
      total += 1;
      if (cruce(counters, h.name, e.name) != null) conDato += 1;
    }
  }
  return { media, cobertura: total ? conDato / total : 0 };
}
