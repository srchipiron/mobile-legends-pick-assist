import { nombreClave } from './nombres.js';
import { LINEAS, poolDeLinea } from './catalogo.js';
import { ordenarPicks } from './ranking.js';
import { lineasOcupadas, detectarRivalDeLinea } from './lineas.js';

/**
 * Qué pueden coger tus compañeros, línea a línea, contra este equipo: el
 * MISMO motor sobre el pool de cada línea abierta de tu equipo, con tu nº1
 * como aliado ya elegido, sin maestría (no sabemos con qué es bueno cada
 * compañero) y con las mismas líneas enemigas abiertas. El rival de esa
 * línea se enseña junto al consejo; no pesa distinto. Nunca aconseja tu
 * línea ni a nadie cogido o baneado.
 *
 * Los aliados se reparten entre las líneas que NO son la tuya: repartirlos
 * entre las cinco ponía a un aliado flexible en tu línea y dejaba la suya
 * «abierta» (132 de 400 drafts jugando exp; así, 23).
 *
 * @returns [{ linea, rival, sugerencias: [{ heroe, p, puntos, motivos }] }]
 */
export function aconsejarEquipo({
  heroes = [], lineas, frecuencias = {}, miLinea = null, yo = null,
  enemigos = [], aliados = [], baneos = [], meta = {}, n = 3, lineasAbiertas = [], poolsPorLinea = {},
} = {}) {
  if (!heroes.length || !miLinea) return [];
  const otras = LINEAS.filter((l) => l !== miLinea);
  const ocupadas = new Set(lineasOcupadas(aliados, lineas, frecuencias, otras));
  const abiertas = otras.filter((l) => !ocupadas.has(l));
  const equipo = yo ? [...aliados.filter((h) => h.name !== yo.name), yo] : [...aliados];
  const cogidos = new Set([...enemigos, ...equipo, ...baneos].map((h) => nombreClave(h.name)));
  const candidatos = heroes.filter((h) => !cogidos.has(nombreClave(h.name)));
  return abiertas
    .map((linea) => {
      const pool = poolDeLinea(heroes, lineas, linea).filter((h) => !cogidos.has(nombreClave(h.name)));
      const rival = detectarRivalDeLinea(enemigos, lineas, linea, frecuencias);
      const ranking = ordenarPicks(pool, { enemigos, aliados: equipo, baneos, meta, lineas, lineasAbiertas, poolsPorLinea, candidatos });
      return { linea, rival, sugerencias: ranking.slice(0, n).map((c) => ({ heroe: c.heroe, p: c.p, puntos: c.puntos, motivos: c.motivos })) };
    })
    .filter((c) => c.sugerencias.length);
}
