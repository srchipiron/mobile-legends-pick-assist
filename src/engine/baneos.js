import { normName, lookup } from './score.js';

/**
 * El siguiente baneo probable: lo que más se banea en tu rango, quitando lo
 * ya marcado. Sirve para tocar en vez de escribir mientras los diez baneos
 * caen en medio minuto.
 *
 * Es la tasa de ban de la API, sin más, y está MEDIDO por qué no hay más:
 *
 *  - `banRate` es por partida (los 133 suman 8,85 con diez baneos por
 *    partida), así que ordenar por ella es ordenar por la probabilidad de
 *    que ese héroe caiga baneado. Los ocho primeros pasan del 50%.
 *  - La co-ocurrencia entre baneos SÍ añade algo en las partidas
 *    profesionales (527 con los diez baneos): dados cinco, acertar los otros
 *    cinco con los diez candidatos mejores sube del 57% al 62% en la misma
 *    época (del 42% al 58% mezclando épocas, que es sobre todo deriva del
 *    meta). Pero los profesionales banean OTRA COSA: el top 10 de tasa de
 *    ban en Gloria cubre solo el 26,5% de sus baneos. Aplicar la
 *    co-ocurrencia pro a un draft de Gloria sería llevar la medida de una
 *    población a otra.
 *  - Desde 1.36.0 cada partida apuntada guarda sus baneos, y la
 *    co-ocurrencia se mide en TU historial (`coocurrenciaDeBaneos`): dados
 *    los baneos ya marcados, sube lo que en tus partidas ha caído junto a
 *    ellos. Sin historial el factor es 1 y queda la tasa de ban.
 *
 * @returns [{ hero, banRate, factor }] de más a menos probable, sin los cogidos.
 */
/**
 * Cuántas partidas le cuesta a un par de baneos mover la lista. Es el
 * pseudo-recuento del suavizado: P(x|g) = (n_xg + K·p_x) / (n_g + K), así
 * que con K=2 un par visto UNA vez ya empuja, pero poco, y sin historial
 * (N=0) el factor es 1 y manda la tasa de ban a secas. Sin escalón: no hay
 * un número de partidas a partir del cual «se activa».
 *
 * Justificado experimentalmente (corpus pro, 289 partidas de la misma época,
 * historial simulado de M partidas y predicción sobre el resto, acierto del
 * top 10 sobre los cinco baneos que faltan dados cinco): K=2 gana en todos
 * los tamaños de historial (M=20: 56,9% → 58,7%; M=100: 56,8% → 62,2%;
 * M=200: 53,9% → 58,0%); K=5 queda cerca y K≥10 va perdiendo lo ganado.
 */
export const K_COOCURRENCIA = 2;

/**
 * Cuenta de baneos y de pares de baneos en las partidas apuntadas, por
 * nombre normalizado. `N` es cuántas partidas llevaban baneos.
 */
export function coocurrenciaDeBaneos(partidas = []) {
  const n = {};
  const par = {};
  let N = 0;
  for (const p of partidas ?? []) {
    const bans = [...new Set((Array.isArray(p?.bans) ? p.bans : []).filter((b) => typeof b === 'string').map(normName))];
    if (!bans.length) continue;
    N += 1;
    for (const a of bans) {
      n[a] = (n[a] ?? 0) + 1;
      for (const b of bans) if (a < b) par[`${a}|${b}`] = (par[`${a}|${b}`] ?? 0) + 1;
    }
  }
  return { N, n, par };
}

/**
 * Factor por el que tu historial mueve a un candidato, dados los baneos ya
 * marcados: media geométrica de P(x|g)/P(x) sobre los g marcados. 1 sin
 * historial o sin baneos marcados.
 */
function factorDeHistorial(candidato, marcados, historial) {
  if (!historial?.N || !marcados.length) return 1;
  const { N, n, par } = historial;
  // Marginal con medio recuento: un héroe nunca visto no divide por cero.
  const px = ((n[candidato] ?? 0) + 0.5) / (N + 1);
  let suma = 0;
  for (const g of marcados) {
    const clave = candidato < g ? `${candidato}|${g}` : `${g}|${candidato}`;
    const pxg = ((par[clave] ?? 0) + K_COOCURRENCIA * px) / ((n[g] ?? 0) + K_COOCURRENCIA);
    suma += Math.log(pxg / px);
  }
  return Math.exp(suma / marcados.length);
}

export function proximosBaneos(allHeroes, { bans = [], enemies = [], allies = [], meta = {}, historial = null, n = 8 } = {}) {
  const cogidos = new Set([...bans, ...enemies, ...allies].map((h) => normName(h.name)));
  const marcados = bans.map((h) => normName(h.name));
  return allHeroes
    .filter((h) => !cogidos.has(normName(h.name)))
    .map((hero) => ({ hero, banRate: lookup(meta.stats, hero.name)?.banRate ?? null }))
    .filter((x) => typeof x.banRate === 'number')
    .map((x) => ({ ...x, factor: factorDeHistorial(normName(x.hero.name), marcados, historial) }))
    .sort((a, b) => b.banRate * b.factor - a.banRate * a.factor)
    .slice(0, n);
}
