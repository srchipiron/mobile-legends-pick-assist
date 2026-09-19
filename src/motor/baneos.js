import { nombreClave, buscar, idMotivo } from './nombres.js';
import { CRUCE_DESTACABLE, valido } from './matrices.js';
import { PRECISION_DEDUCIDA, hayQueProtegerlo } from './catalogo.js';
import { terminoHeroe, terminoCruce, ESCALA, PUNTOS_POR_LOGIT, logit, CRUCE_POR_REGLA_MAXIMA, disponibilidad } from './modelo.js';
import { DANGER_RULES } from './reglas.js';

/**
 * Baneos: a quién conviene banear por tu equipo, y cuál es el siguiente
 * baneo probable en tu rango.
 */

/**
 * A quién banear: el que más probabilidad de ganar te QUITA si sale, por
 * cuánto sale. Pérdida esperada = (pickrate cuando no está baneado) × (su
 * término de héroe + sus cruces contra tus aliados ya elegidos), en la
 * misma escala que el ranking. El pickrate se divide por (1 − banrate): la
 * tasa de picks ya lleva descontadas las partidas en que estaba baneado, y
 * eso hacía parecer poco jugado justo al más temido.
 *
 * Sin dato del cruce (héroe recién salido) entra la tabla de peligro por
 * etiquetas a la equivalencia de las reglas de counter (techo 1.5 = cruce
 * del 56%), descontada si las etiquetas están deducidas.
 *
 * @returns [{ heroe, stat, puntos, disponible, valor, motivos }] los cinco peores para ti
 */
export function sugerirBaneos(heroes, { aliados = [], enemigos = [], baneos = [], meta = {} } = {}) {
  const cogidos = new Set([...aliados, ...enemigos, ...baneos].map((h) => nombreClave(h.name)));
  const media = meta.mediaDelRango ?? 0.5;
  return heroes
    .filter((h) => !cogidos.has(nombreClave(h.name)) && buscar(meta.stats, h.name))
    .map((heroe) => {
      const stat = buscar(meta.stats, heroe.name);
      const disponible = disponibilidad(stat);
      let amenaza = terminoHeroe(heroe, meta.stats, media).valor;
      const motivos = [];
      for (const aliado of aliados) {
        const t = terminoCruce(heroe, aliado, meta.counters);
        if (t.dato) {
          amenaza += t.valor;
          if (t.cruce >= CRUCE_DESTACABLE) motivos.push({ clave: 'peligro.ganaCruce', params: { a: aliado.name, pct: Math.round(t.cruce * 100) }, bueno: false, peso: t.valor });
          continue;
        }
        const fiable = (heroe.inferred ? PRECISION_DEDUCIDA : 1) * (aliado.inferred ? PRECISION_DEDUCIDA : 1);
        const pesos = [];
        for (const r of DANGER_RULES) {
          if (!aliado.tags?.includes(r.allyTag) || !heroe.tags?.includes(r.enemyTag)) continue;
          if (r.soloSiFragil && !hayQueProtegerlo(aliado)) continue;
          pesos.push(r.weight);
          motivos.push({ clave: r.why, params: { a: aliado.name }, bueno: false, peso: r.weight * fiable });
        }
        pesos.sort((a, b) => b - a);
        const peligro = Math.min(1, ((pesos[0] ?? 0) + (pesos[1] ?? 0) * 0.5) / 1.5) * fiable;
        amenaza += logit(0.5 + CRUCE_POR_REGLA_MAXIMA * peligro);
      }
      if (!motivos.length && valido(stat.winRate) && amenaza > 0) {
        motivos.push({ clave: 'peligro.fuerte', params: { pct: (stat.winRate * 100).toFixed(1) }, bueno: false, peso: 0.5 });
      }
      // Único por identidad (clave + aliado), conservando el primero que
      // salió; después, el de más peso. Dos reglas de peligro comparten clave
      // (`peligro.anulaCuracion`) y el orden de las dos cosas cambia cuál queda.
      const vistos = new Set();
      const unicos = motivos.filter((m) => {
        const id = idMotivo(m);
        if (vistos.has(id)) return false;
        vistos.add(id);
        return true;
      }).sort((a, b) => b.peso - a.peso);
      return {
        heroe,
        stat,
        puntos: Math.round(ESCALA * amenaza * PUNTOS_POR_LOGIT),
        disponible,
        valor: disponible * ESCALA * Math.max(0, amenaza),
        motivos: unicos.slice(0, 1),
      };
    })
    .filter((b) => b.valor > 0)
    .sort((a, b) => b.valor - a.valor || b.puntos - a.puntos || a.heroe.name.localeCompare(b.heroe.name))
    .slice(0, 5);
}

/**
 * Cuántas partidas le cuesta a un par de baneos mover la lista del
 * siguiente baneo probable: P(x|g) = (n_xg + K·p_x) / (n_g + K). Sin
 * historial el factor es 1 y sin escalón. Justificado en el corpus pro
 * (historial simulado de M partidas): K=2 gana con M=20, 100 y 200; K≥10
 * va perdiendo lo ganado.
 */
export const K_COOCURRENCIA = 2;

/** Cuenta de baneos y de pares de baneos en las partidas apuntadas, por clave. */
export function coocurrenciaDeBaneos(partidas = []) {
  const n = {}; const par = {}; let N = 0;
  for (const p of partidas ?? []) {
    const bans = [...new Set((Array.isArray(p?.bans) ? p.bans : []).filter((b) => typeof b === 'string').map(nombreClave))];
    if (!bans.length) continue;
    N += 1;
    for (const a of bans) {
      n[a] = (n[a] ?? 0) + 1;
      for (const b of bans) if (a < b) par[`${a}|${b}`] = (par[`${a}|${b}`] ?? 0) + 1;
    }
  }
  return { N, n, par };
}

function factorDeHistorial(candidato, marcados, historial) {
  if (!historial?.N || !marcados.length) return 1;
  const { N, n, par } = historial;
  const px = ((n[candidato] ?? 0) + 0.5) / (N + 1);
  let suma = 0;
  for (const g of marcados) {
    const k = candidato < g ? `${candidato}|${g}` : `${g}|${candidato}`;
    const pxg = ((par[k] ?? 0) + K_COOCURRENCIA * px) / ((n[g] ?? 0) + K_COOCURRENCIA);
    suma += Math.log(pxg / px);
  }
  return Math.exp(suma / marcados.length);
}

/**
 * El siguiente baneo probable: lo más baneado en tu rango sin lo ya
 * marcado, multiplicado por lo que en TU historial cayó junto a los
 * marcados. Es la `banRate` de la API (por partida: ordenar por ella es
 * ordenar por la probabilidad de caer baneado); la co-ocurrencia de las
 * partidas pro no vale, porque los profesionales banean otra cosa.
 *
 * @returns [{ heroe, banRate, factor }] de más a menos probable
 */
export function proximosBaneos(heroes, { baneos = [], enemigos = [], aliados = [], meta = {}, historial = null, n = 8 } = {}) {
  const cogidos = new Set([...baneos, ...enemigos, ...aliados].map((h) => nombreClave(h.name)));
  const marcados = baneos.map((h) => nombreClave(h.name));
  return heroes
    .filter((h) => !cogidos.has(nombreClave(h.name)))
    .map((heroe) => ({ heroe, banRate: buscar(meta.stats, heroe.name)?.banRate ?? null }))
    .filter((x) => typeof x.banRate === 'number')
    .map((x) => ({ ...x, factor: factorDeHistorial(nombreClave(x.heroe.name), marcados, historial) }))
    .sort((a, b) => b.banRate * b.factor - a.banRate * a.factor)
    .slice(0, n);
}
