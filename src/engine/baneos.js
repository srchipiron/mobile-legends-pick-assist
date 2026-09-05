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
 *    población a otra. Cuando haya baneos apuntados en las partidas de
 *    Javi, la co-ocurrencia se mide ahí (ver CLAUDE.md).
 *
 * @returns [{ hero, banRate }] de más a menos baneado, sin los cogidos.
 */
export function proximosBaneos(allHeroes, { bans = [], enemies = [], allies = [], meta = {}, n = 8 } = {}) {
  const cogidos = new Set([...bans, ...enemies, ...allies].map((h) => normName(h.name)));
  return allHeroes
    .filter((h) => !cogidos.has(normName(h.name)))
    .map((hero) => ({ hero, banRate: lookup(meta.stats, hero.name)?.banRate ?? null }))
    .filter((x) => typeof x.banRate === 'number')
    .sort((a, b) => b.banRate - a.banRate)
    .slice(0, n);
}
