import { nombreClave } from './nombres.js';
import { LINEAS } from './catalogo.js';
import { ordenarPicks } from './ranking.js';
import { disponibilidad } from './modelo.js';

/**
 * ¿Aguanta este pick lo que falta por salir?
 *
 * Con el draft a medias se simulan finales plausibles (por las líneas
 * enemigas abiertas, ponderando cada una por pickrate) y se cuenta en qué
 * fracción tu nº1 sigue siéndolo. Medido (200 drafts por caso): en roam con
 * dos enemigos vistos, cuota ≥ 0.5 → aguanta el 71% del draft completo;
 * < 0.5 → 28%. Con 3: 62/26. Con 4: 71/31. Con uno visto casi nada es
 * robusto. NO se usa para ordenar (medido: no aporta con dos o tres vistos);
 * se enseña como información. Se cuenta por VOTOS de nº1, no por media.
 *
 * Cada final se puntúa COMPLETO (`lineasAbiertas: []`): el término «por
 * ver» del modelo contaría dos veces a los que acaba de sacar. Los
 * baneados no salen por ninguna línea ni son candidatos.
 */

/** Desde qué cuota el pick se llama «seguro». Es donde la medición separa. */
export const CUOTA_ROBUSTA = 0.5;

/** Finales simulados. Con 60 la cuota del líder se mueve ±6 puntos entre semillas. */
export const FINALES_POR_DEFECTO = 60;

/**
 * Generador determinista (mulberry32): mismas entradas, misma cuota. El
 * congruencial de antes tenía correlación serial (−0,011) y sesgaba lo que se
 * estimaba con él (+0,034 en un intercepto conocido).
 */
export function generador(semilla) {
  let a = (semilla >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function muestrear(pool, excluidos, pickRateDe, rnd) {
  const candidatos = pool.filter((h) => !excluidos.has(h.name));
  if (!candidatos.length) return null;
  const total = candidatos.reduce((acc, h) => acc + pickRateDe(h), 0);
  let x = rnd() * total;
  for (const h of candidatos) { x -= pickRateDe(h); if (x <= 0) return h; }
  return candidatos[candidatos.length - 1];
}

/**
 * @param {object} d
 * @param d.pool            héroes de TU línea (los candidatos)
 * @param d.enemigos        enemigos ya elegidos
 * @param d.aliados         aliados ya elegidos
 * @param d.lineasAbiertas  líneas enemigas por las que aún falta alguien
 * @param d.poolsPorLinea   { linea: [héroes] } de dónde salen los que faltan
 * @param d.ctx             lo mismo que recibe ordenarPicks (meta, maestria, baneos, lineas...)
 * @returns {{ cuota, lider, cuotaLider, n, lineasAbiertas, enemigos, aliados } | null}
 */
export function simularFinales({ pool, enemigos = [], aliados = [], lineasAbiertas = [], poolsPorLinea = {}, ctx = {}, n = FINALES_POR_DEFECTO, semilla = 7 }) {
  const abiertas = lineasAbiertas.filter((l) => LINEAS.includes(l) && poolsPorLinea[l]?.length);
  if (!pool?.length || !enemigos.length || !abiertas.length) return null;
  const rnd = generador(semilla);
  // Cuota de picks cuando NO está baneado: es lo que de verdad sale (medido
  // en drafts pro, ver `disponibilidad` en modelo.js).
  const pickRateDe = (h) => disponibilidad(ctx.meta?.stats?.[nombreClave(h.name)]) || 0.001;
  const fijos = new Set([...enemigos, ...aliados, ...(ctx.baneos ?? [])].map((h) => h.name));
  const votos = {};
  for (let k = 0; k < n; k++) {
    const excluidos = new Set(fijos);
    const completo = [...enemigos];
    for (const l of abiertas) {
      const h = muestrear(poolsPorLinea[l], excluidos, pickRateDe, rnd);
      if (!h) continue;
      excluidos.add(h.name);
      completo.push(h);
    }
    const top = ordenarPicks(pool, { ...ctx, enemigos: completo, aliados, lineasAbiertas: [] })[0];
    if (top) votos[top.heroe.name] = (votos[top.heroe.name] ?? 0) + 1;
  }
  const cuota = Object.fromEntries(Object.entries(votos).map(([k, v]) => [k, v / n]));
  const [lider, cuotaLider] = Object.entries(cuota).sort((a, b) => b[1] - a[1])[0] ?? [null, 0];
  // Para qué draft se simuló: en la app va diferida y el ranking no; sin la
  // marca, el análisis cruzaba la cuota del draft anterior con el nº1 nuevo.
  const claves = (hs) => hs.map((h) => nombreClave(h.name)).sort();
  return { cuota, lider, cuotaLider, n, lineasAbiertas: abiertas, enemigos: claves(enemigos), aliados: claves(aliados) };
}
