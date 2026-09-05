import { rankRoamers, poolDeLinea, normName, LINEAS } from './score.js';
import { lineasOcupadas, detectarRivalDeLinea } from './rival-de-linea.js';

/**
 * Qué pueden coger tus compañeros, línea a línea, contra este equipo.
 *
 * La app decide TU pick. Esto responde a la pregunta de al lado: "¿y qué
 * deberían coger los demás?". Es el MISMO motor (`rankRoamers`) sobre el
 * pool de cada línea abierta de tu equipo, con tres diferencias:
 *
 *  - Tu nº1 cuenta como aliado ya elegido: las parejas y los huecos de la
 *    composición se miran contigo dentro, que es lo que va a pasar.
 *  - Sin maestría: no sabemos con qué es bueno cada compañero. El componente
 *    queda neutro para todos y la normalización lo deja plano.
 *  - El rival de cada línea es el que la deducción de líneas pone en ESA
 *    línea, no en la tuya: un consejo para el oro pesa doble el cruce contra
 *    el tirador enemigo, igual que tu pick pesa el tuyo.
 *
 * Solo las líneas que tu equipo aún no cubre (`lineasOcupadas` con tus
 * aliados, el mismo reparto que se usa con los enemigos) y nunca la tuya.
 *
 * @returns [{ linea, rival, sugerencias: [{ hero, score, reasons }] }]
 */
export function aconsejarEquipo({
  allHeroes = [], lineas, frecuencias = {}, miLinea = null, yo = null,
  enemies = [], allies = [], bans = [], meta = {}, n = 3,
} = {}) {
  if (!allHeroes.length || !miLinea) return [];
  const ocupadas = new Set(lineasOcupadas(allies, lineas, frecuencias));
  const abiertas = LINEAS.filter((l) => l !== miLinea && !ocupadas.has(l));
  const equipo = yo ? [...allies.filter((h) => h.name !== yo.name), yo] : [...allies];
  const cogidos = new Set([...enemies, ...equipo, ...bans].map((h) => normName(h.name)));
  const candidatos = allHeroes.filter((h) => !cogidos.has(normName(h.name)));

  return abiertas
    .map((linea) => {
      const pool = poolDeLinea(allHeroes, lineas, linea).filter((h) => !cogidos.has(normName(h.name)));
      const rival = detectarRivalDeLinea(enemies, lineas, linea, frecuencias);
      const ranked = rankRoamers(pool, { enemies, allies: equipo, bans, meta, enemyRoam: rival, candidatos });
      return {
        linea,
        rival,
        sugerencias: ranked.slice(0, n).map((r) => ({ hero: r.hero, score: r.score, reasons: r.reasons })),
      };
    })
    .filter((c) => c.sugerencias.length);
}
