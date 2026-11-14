import { nombreClave, buscar } from './nombres.js';

/**
 * Las matrices de la API, indexadas por clave en sus dos niveles: cruces
 * (counters) y parejas (synergies). Medido y no conviene volver a suponer:
 * - los cruces son antisimétricos (c[a][b] + c[b][a] = 1 en los 8.778 pares) y no
 *   llevan la fuerza de nadie (r = −0,003 con el winrate del rival);
 * - no son ruidosos (cuartil menos jugado 1,16× más disperso; muestreo puro daría
 *   2,65×), así que nada se encoge por muestra;
 * - las parejas son simétricas y su media no es 0,5: se centran en `mediaDeSinergia`.
 */

/** [D] Fuera de (0,02, 0,98) no es un winrate: es un dato roto. */
export const valido = (p) => typeof p === 'number' && p > 0.02 && p < 0.98;

/** [M] Desde qué cruce se dice «ganas» / «pierdes»: p90/p10 de los 17.556 cruces. */
export const CRUCE_DESTACABLE = 0.5154;
export const CRUCE_MALO = 0.4846;
/** [M] Desde qué cruce se dice sin el matiz «por poco»: p95/p05 (Gloria 20-9, Mítico 3-10). Decide QUÉ SE DICE, no la nota. */
export const CRUCE_FUERTE = 0.5208;
export const CRUCE_FUERTE_EN_CONTRA = 0.4792;
/** [M] Lo mismo para las parejas, con SU distribución: p90 de 8.778. */
export const PAREJA_DESTACABLE = 0.51;
/** [P] Fracción de pares en la que un motivo con dato debe caer (calibrado al 10 %); el diagnóstico avisa fuera. */
export const COLA_DEL_MOTIVO = [0.04, 0.20];

/** Winrate de A contra B, o 1 − el de B contra A (es el mismo dato). */
export function cruce(counters, a, b) {
  const ida = buscar(buscar(counters, a), b);
  if (ida != null) return ida;
  const vuelta = buscar(buscar(counters, b), a);
  return vuelta != null ? 1 - vuelta : undefined;
}

/** Sinergia de A con B en cualquiera de los dos sentidos, sin darle la vuelta. */
export function sinergia(synergies, a, b) {
  const ida = buscar(buscar(synergies, a), b);
  return ida != null ? ida : buscar(buscar(synergies, b), a);
}

const mediasDeSinergia = new WeakMap();

/**
 * El centro de las parejas: la media de las que pueden ir JUNTAS (sin compartir
 * línea), ponderada por pick(a)·pick(b) (sin cuota pesa 0). [M] Con la media global,
 * 1 contra 5 daba el 46 %. Sin `lineas`, media global. Caché por matriz.
 */
export function mediaDeSinergia(synergies, lineas = null, stats = null) {
  if (!synergies || typeof synergies !== 'object') return 0.5;
  const cache = mediasDeSinergia.get(synergies);
  if (cache && cache.lineas === lineas && cache.stats === stats) return cache.media;
  const lanesDe = (n) => lineas?.get?.(n)?.lanes ?? null;
  const pesoDe = (n) => (stats ? (stats[n]?.pickRate ?? 0) : 1);
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

/** Cuántos del pool tienen winrate y cuántos fila de cruces. */
export function cobertura(pool, stats, counters) {
  const faltan = stats ? pool.filter((h) => !buscar(stats, h.name)).map((h) => h.name) : pool.map((h) => h.name);
  const conCounters = counters ? pool.filter((h) => Object.keys(buscar(counters, h.name) ?? {}).length).length : 0;
  return { conDatos: pool.length - faltan.length, total: pool.length, faltan, conCounters };
}

/** Rivales por héroe del pool de media, y fracción de cruces posibles contra `candidatos` con dato (uno contra sí mismo no cuenta). */
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
