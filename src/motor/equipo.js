import { nombreClave } from './nombres.js';
import { LINEAS, poolDeLinea } from './catalogo.js';
import { ordenarPicks } from './ranking.js';
import { lineasOcupadas, detectarRivalDeLinea } from './lineas.js';

/**
 * Qué pueden coger tus compañeros, línea a línea: el MISMO motor sobre el pool de
 * cada línea que tu equipo aún no cubre, con tu héroe ya elegido y las mismas
 * líneas enemigas abiertas. Los aliados se reparten SIN tu línea ([M] entre las
 * cinco, un aliado flexible ocupaba la tuya: 132 de 400 drafts frente a 23).
 * Nunca aconseja tu línea ni a nadie cogido o baneado.
 * @returns {Array<{ linea, rival, sugerencias: Array<{ heroe, p, puntos, motivos }> }>}
 */
export function aconsejarEquipo({
  heroes = [], lineas, frecuencias = {}, miLinea = null, yo = null,
  enemigos = [], aliados = [], baneos = [], meta = {}, n = 3, lineasAbiertas = [], poolsPorLinea = {},
} = {}) {
  if (!heroes.length || !miLinea) return [];
  const otras = LINEAS.filter((l) => l !== miLinea);
  const ocupadas = new Set(lineasOcupadas(aliados, lineas, frecuencias, otras));
  const equipo = yo ? [...aliados.filter((h) => h.name !== yo.name), yo] : [...aliados];
  const cogidos = new Set([...enemigos, ...equipo, ...baneos].map((h) => nombreClave(h.name)));
  const candidatos = heroes.filter((h) => !cogidos.has(nombreClave(h.name)));
  return otras
    .filter((l) => !ocupadas.has(l))
    .map((linea) => {
      const pool = (poolsPorLinea[linea] ?? poolDeLinea(heroes, lineas, linea)).filter((h) => !cogidos.has(nombreClave(h.name)));
      const ranking = ordenarPicks(pool, { enemigos, aliados: equipo, baneos, meta, lineas, lineasAbiertas, poolsPorLinea, candidatos });
      return {
        linea,
        rival: detectarRivalDeLinea(enemigos, lineas, linea, frecuencias),
        sugerencias: ranking.slice(0, n).map((c) => ({ heroe: c.heroe, p: c.p, puntos: c.puntos, motivos: c.motivos })),
      };
    })
    .filter((c) => c.sugerencias.length);
}
