import { nombreClave } from './nombres.js';
import { LINEAS } from './catalogo.js';
import { ordenarPicks } from './ranking.js';
import { disponibilidad } from './modelo.js';

/**
 * ¿Aguanta este pick lo que falta por salir? Con el draft a medias se simulan
 * finales plausibles (por las líneas enemigas abiertas, cada una muestreada por
 * `disponibilidad`) y se cuenta en qué fracción tu nº1 sigue siéndolo, por VOTOS.
 * Se ENSEÑA: no ordena ([M] ordenar por ella no aporta con dos o tres vistos).
 * Cada final se puntúa COMPLETO (`lineasAbiertas: []`, o «por ver» contaría dos
 * veces) y los baneados no salen ni votan.
 */

/** [M] Desde qué cuota el pick es «seguro»: con 2 vistos, ≥0,5 aguanta el 71 %; <0,5, el 28 %. */
export const CUOTA_ROBUSTA = 0.5;
/** [M] Finales simulados: con 60 la cuota del líder se mueve ±6 puntos entre semillas (si hace falta más, sube esto, no cambies el generador). */
export const FINALES_POR_DEFECTO = 60;

/** [C] mulberry32: mismas entradas, misma cuota (el congruencial de antes tenía correlación serial). */
export function generador(semilla) {
  let a = (semilla >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Uno del pool por su peso; sin candidatos no gasta azar. */
function muestrear(pool, excluidos, pesoDe, rnd) {
  const candidatos = pool.filter((h) => !excluidos.has(h.name));
  if (!candidatos.length) return null;
  let x = rnd() * candidatos.reduce((acc, h) => acc + pesoDe(h), 0);
  for (const h of candidatos) { x -= pesoDe(h); if (x <= 0) return h; }
  return candidatos[candidatos.length - 1];
}

/**
 * `ctx` es lo que recibe `ordenarPicks` (meta, baneos, lineas…).
 * @returns {{ cuota, lider, cuotaLider, n, lineasAbiertas, enemigos, aliados, baneos } | null}
 *   (las tres últimas, claves ordenadas: la MARCA del draft para el que se simuló,
 *   porque en la app va diferida y el ranking no)
 */
export function simularFinales({ pool, enemigos = [], aliados = [], lineasAbiertas = [], poolsPorLinea = {}, ctx = {}, n = FINALES_POR_DEFECTO, semilla = 7 }) {
  const abiertas = lineasAbiertas.filter((l) => LINEAS.includes(l) && poolsPorLinea[l]?.length);
  if (!pool?.length || !enemigos.length || !abiertas.length) return null;
  const rnd = generador(semilla);
  const pesoDe = (h) => disponibilidad(ctx.meta?.stats?.[nombreClave(h.name)]) || 0.001;
  const fijos = new Set([...enemigos, ...aliados, ...(ctx.baneos ?? [])].map((h) => h.name));
  const votos = {};
  for (let k = 0; k < n; k++) {
    const excluidos = new Set(fijos);
    const completo = [...enemigos];
    for (const l of abiertas) {
      const h = muestrear(poolsPorLinea[l], excluidos, pesoDe, rnd);
      if (!h) continue;
      excluidos.add(h.name);
      completo.push(h);
    }
    const top = ordenarPicks(pool, { ...ctx, enemigos: completo, aliados, lineasAbiertas: [] })[0];
    if (top) votos[top.heroe.name] = (votos[top.heroe.name] ?? 0) + 1;
  }
  const cuota = Object.fromEntries(Object.entries(votos).map(([k, v]) => [k, v / n]));
  const [lider, cuotaLider] = Object.entries(cuota).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  const claves = (hs) => hs.map((h) => nombreClave(h.name)).sort();
  return { cuota, lider, cuotaLider, n, lineasAbiertas: abiertas, enemigos: claves(enemigos), aliados: claves(aliados), baneos: claves(ctx.baneos ?? []) };
}
