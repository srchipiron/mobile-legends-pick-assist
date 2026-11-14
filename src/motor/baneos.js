import { nombreClave, buscar, idMotivo } from './nombres.js';
import { CRUCE_DESTACABLE, valido } from './matrices.js';
import { fiabilidad, hayQueProtegerlo } from './catalogo.js';
import { terminoHeroe, terminoCruce, ESCALA, PUNTOS_POR_LOGIT, CRUCE_POR_REGLA_MAXIMA, disponibilidad } from './modelo.js';
import { logit } from './estadistica.js';
import { DANGER_RULES } from './reglas.js';

/** Baneos: a quién conviene banear por tu equipo, y el siguiente baneo probable en tu rango. */

/** [C] Techo de la tabla de peligro: la más fuerte + ½ de la segunda (= cruce del 56 % a tope). */
const TECHO_DE_PELIGRO = 1.5;
const SUGERIDOS = 5;

/**
 * A quién banear: pérdida esperada = `disponibilidad` × (su término de héroe + sus
 * cruces contra tus aliados), en la escala del ranking. Sin dato del cruce entra la
 * tabla de peligro por etiquetas (`soloSiFragil`: saltarle encima a un tanque es lo
 * que el tanque quiere), descontada si las etiquetas están deducidas.
 * @returns {Array<{ heroe, stat, puntos, disponible, valor, motivos }>} los cinco peores para ti
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
        const fiable = fiabilidad(heroe) * fiabilidad(aliado);
        const pesos = [];
        for (const r of DANGER_RULES) {
          if (!aliado.tags?.includes(r.allyTag) || !heroe.tags?.includes(r.enemyTag)) continue;
          if (r.soloSiFragil && !hayQueProtegerlo(aliado)) continue;
          pesos.push(r.weight);
          motivos.push({ clave: r.why, params: { a: aliado.name }, bueno: false, peso: r.weight * fiable });
        }
        pesos.sort((a, b) => b - a);
        const peligro = Math.min(1, ((pesos[0] ?? 0) + (pesos[1] ?? 0) * 0.5) / TECHO_DE_PELIGRO) * fiable;
        amenaza += logit(0.5 + CRUCE_POR_REGLA_MAXIMA * peligro);
      }
      if (!motivos.length && valido(stat.winRate) && amenaza > 0) {
        motivos.push({ clave: 'peligro.fuerte', params: { pct: (stat.winRate * 100).toFixed(1) }, bueno: false, peso: 0.5 });
      }
      // Único por identidad (el primero que salió) y después el de más peso.
      const vistos = new Set();
      const unicos = motivos.filter((m) => !vistos.has(idMotivo(m)) && vistos.add(idMotivo(m))).sort((a, b) => b.peso - a.peso);
      return {
        heroe, stat, disponible,
        puntos: Math.round(ESCALA * amenaza * PUNTOS_POR_LOGIT),
        valor: disponible * ESCALA * Math.max(0, amenaza),
        motivos: unicos.slice(0, 1),
      };
    })
    .filter((b) => b.valor > 0)
    .sort((a, b) => b.valor - a.valor || b.puntos - a.puntos || a.heroe.name.localeCompare(b.heroe.name))
    .slice(0, SUGERIDOS);
}

/**
 * [M] P(x|g) = (n_xg + K·p_x)/(n_g + K) en TU historial. K=2 gana en el corpus pro
 * con historiales simulados de 20, 100 y 200 partidas; K≥10 pierde lo ganado.
 */
export const K_COOCURRENCIA = 2;

/** Baneos y pares de baneos de tus partidas, por clave (sin repetir dentro de una partida). */
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

/** exp(media de log(P(x|g)/P(x))) sobre los marcados; 1 sin historial o sin marcados. */
function factorDeHistorial(candidato, marcados, historial) {
  if (!historial?.N || !marcados.length) return 1;
  const { N, n, par } = historial;
  const px = ((n[candidato] ?? 0) + 0.5) / (N + 1);
  let suma = 0;
  for (const g of marcados) {
    const k = candidato < g ? `${candidato}|${g}` : `${g}|${candidato}`;
    suma += Math.log((((par[k] ?? 0) + K_COOCURRENCIA * px) / ((n[g] ?? 0) + K_COOCURRENCIA)) / px);
  }
  return Math.exp(suma / marcados.length);
}

/**
 * El siguiente baneo probable: la `banRate` del rango (por partida: es la
 * probabilidad de caer baneado) × lo que en TU historial cayó junto a los marcados.
 * Las co-ocurrencias pro no valen: los profesionales banean otra cosa.
 * @returns {Array<{ heroe, banRate, factor }>}
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
