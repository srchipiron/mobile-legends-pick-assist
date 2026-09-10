import { normName, lookup, tuNivel, priorDeMaestria, riesgoContrapick, esPickCiego, idRazon, CRUCE_DESTACABLE, PRECISION_DEDUCIDA, hayQueProtegerlo } from './score.js';
import { evaluarDraft, terminoHeroe, terminoCruce, ESCALA, PUNTOS_POR_LOGIT, valido, logit, CRUCE_POR_REGLA_MAXIMA } from './modelo.js';
import { DANGER_RULES } from './rules.js';

/**
 * Ordena el pool de tu línea para el draft que tienes delante: por la
 * probabilidad de ganar el draft que resulta con cada uno (modelo.js).
 *
 * No hay pesos ni reescala dentro del pool: la nota de cada héroe ES su
 * log-odds, así que dos puntos de winrate y dos puntos de cruce valen lo
 * mismo, y la distancia entre el nº1 y el nº2 es una distancia de
 * probabilidad, no de una escala inventada.
 *
 * @param pool  héroes de tu línea
 * @param ctx   { enemies, allies, bans, mastery, meta, lineas, lineasAbiertas,
 *                poolsPorLinea, candidatos, nivel, priorMaestria }
 * @returns [{ hero, p, logOdds, score, terminos, puntos, reasons, riesgo, dato }]
 */
export function rankRoamers(pool, ctx = {}) {
  const taken = new Set([...(ctx.enemies ?? []), ...(ctx.allies ?? []), ...(ctx.bans ?? [])].map((h) => normName(h.name)));
  // Tu nivel y tu prior, UNA vez por ranking (37 × 60 finales por toque).
  const nivel = ctx.nivel ?? tuNivel(ctx.mastery ?? {});
  const prior = ctx.priorMaestria ?? priorDeMaestria(ctx.mastery ?? {}, nivel);
  const base = {
    allies: ctx.allies ?? [], enemies: ctx.enemies ?? [], meta: ctx.meta ?? {}, mastery: ctx.mastery ?? null,
    nivel, prior, lineas: ctx.lineas ?? null, lineasAbiertas: ctx.lineasAbiertas ?? [], poolsPorLinea: ctx.poolsPorLinea ?? {},
    bans: ctx.bans ?? [],
  };

  const resultados = pool
    .filter((h) => !taken.has(normName(h.name)))
    .map((hero) => {
      const e = evaluarDraft({ ...base, yo: hero });
      return {
        hero,
        p: e.p,
        logOdds: e.logOdds,
        // `score` sigue existiendo por compatibilidad: es la probabilidad.
        score: e.p,
        terminos: e.terminos,
        puntos: e.puntos,
        dato: e.dato,
        reasons: ordenarMotivos(e.razones),
        riesgo: riesgoContrapick(hero, ctx.meta?.counters, ctx.candidatos ?? []),
        banned: false,
      };
    });
  if (!resultados.length) return resultados;

  // Un motivo que le sale a casi todo el pool no informa de nada («no hay
  // primera línea» es cierto para los 34 roamers a la vez). Se quitan ANTES
  // de cortar a tres.
  const frecuencia = new Map();
  for (const r of resultados) for (const razon of new Set(r.reasons.map(idRazon))) frecuencia.set(razon, (frecuencia.get(razon) ?? 0) + 1);
  const comunes = new Set([...frecuencia.entries()].filter(([, n]) => n > resultados.length * 0.6).map(([k]) => k));
  const vistos = ctx.enemies?.length ?? 0;
  for (const r of resultados) {
    r.reasons = r.reasons.filter((x) => !comunes.has(idRazon(x))).slice(0, 3);
    // Informativo, no puntúa: el orden de pick de Liquipedia no lleva señal
    // de contrapick, así que no hay castigo adversarial; sí se avisa de que
    // el héroe tiene cruces muy malos entre lo que aún puede salir.
    if (esPickCiego(r.riesgo, vistos)) r.reasons = [{ clave: 'regla.arriesgadoCiego', good: false, w: 1.5 }, ...r.reasons].slice(0, 3);
  }

  return resultados.sort((a, b) =>
    b.logOdds - a.logOdds
    || b.terminos.tu - a.terminos.tu
    || b.terminos.heroes - a.terminos.heroes
    || a.hero.name.localeCompare(b.hero.name));
}

/** Los motivos de un candidato, únicos y por relevancia, ANTES del filtro de comunes. */
export function motivosDe(hero, ctx = {}) {
  const e = evaluarDraft({ allies: ctx.allies ?? [], enemies: ctx.enemies ?? [], meta: ctx.meta ?? {}, mastery: ctx.mastery ?? null, lineas: ctx.lineas ?? null, yo: hero });
  return e ? ordenarMotivos(e.razones) : [];
}

function ordenarMotivos(razones) {
  return spread(dedupe(razones).sort((a, b) => (b.w ?? 0) - (a.w ?? 0)));
}

/** Un motivo por tipo de razón: repetir «bloquea los dashes de X» tres veces no informa. */
function spread(reasons) {
  const mentioned = new Set();
  const out = [];
  for (const r of reasons) {
    const key = r.kind ?? idRazon(r);
    if (mentioned.has(key)) continue;
    mentioned.add(key);
    out.push(r);
  }
  return out;
}

function dedupe(reasons) {
  const seen = new Set();
  return reasons.filter((r) => {
    const id = idRazon(r);
    if (seen.has(id)) return false;
    seen.add(id);
    return true;
  });
}

/**
 * Margen de empate entre el nº1 y los siguientes, en probabilidad. Es una
 * decisión de cuántas veces decir «está reñido», no una calibración: 0.004
 * (cuatro décimas de punto) es el p25 de la distancia nº1–nº2 medida en 300
 * drafts de roam con el modelo de 2.0 (p50 0,9 puntos, p85 1,9), o sea que
 * se dice en uno de cada cuatro drafts, como el 0.015 de 1.x sobre su
 * escala (21%). Y dice algo verdadero: medio punto de probabilidad no
 * separa a nadie.
 */
export const MARGEN_EMPATE = 0.004;

/** Agrupa los primeros puestos que están dentro del margen de ruido. */
export function empatados(ranked, margen = MARGEN_EMPATE) {
  if (!ranked.length) return [];
  return ranked.filter((r) => ranked[0].p - r.p <= margen).slice(0, 4);
}

/**
 * A quién banear: el que más probabilidad de ganar te QUITA si sale, contando
 * cuánto sale. Pérdida esperada = (pickrate cuando no está baneado) ×
 * (su fuerza general + sus cruces contra tus aliados ya elegidos), todo en
 * la misma escala que el ranking. Antes era power·0.40 + banrate·0.35 +
 * peligro·0.25, tres pesos a mano sobre tres escalas distintas.
 *
 * El pickrate se divide por (1 − banrate): la tasa de picks de la API ya
 * lleva descontadas las partidas en que estaba baneado, y eso hacía parecer
 * poco jugado justo al más temido.
 */
export function suggestBans(allHeroes, ctx = {}) {
  const { allies = [], enemies = [], bans = [], meta = {} } = ctx;
  const taken = new Set([...allies, ...enemies, ...bans].map((h) => normName(h.name)));
  const media = meta.patchAvgWinRate ?? 0.5;
  return allHeroes
    .filter((h) => !taken.has(normName(h.name)) && lookup(meta.stats, h.name))
    .map((hero) => {
      const stat = lookup(meta.stats, hero.name);
      const disponible = (stat.pickRate ?? 0) / Math.max(0.05, 1 - (stat.banRate ?? 0));
      let amenaza = terminoHeroe(hero, meta.stats, media).valor;
      const reasons = [];
      for (const ally of allies) {
        const t = terminoCruce(hero, ally, meta.counters);
        if (t.dato) {
          amenaza += t.valor;
          if (t.cruce >= CRUCE_DESTACABLE) reasons.push({ clave: 'peligro.ganaCruce', params: { a: ally.name, pct: Math.round(t.cruce * 100) }, good: false, w: t.valor });
          continue;
        }
        // Sin dato del cruce (héroe recién salido): la tabla de peligro por
        // etiquetas, a la misma equivalencia que las reglas de counter (la
        // más fuerte más media de la segunda, techo 1.5 = cruce del 56%),
        // descontada si las etiquetas están deducidas.
        const fiable = (hero.inferred ? PRECISION_DEDUCIDA : 1) * (ally.inferred ? PRECISION_DEDUCIDA : 1);
        const pesos = [];
        for (const rule of DANGER_RULES) {
          if (!ally.tags?.includes(rule.allyTag) || !hero.tags?.includes(rule.enemyTag)) continue;
          if (rule.soloSiFragil && !hayQueProtegerlo(ally)) continue;
          pesos.push(rule.weight);
          reasons.push({ clave: rule.why, params: { a: ally.name }, good: false, w: rule.weight * fiable });
        }
        pesos.sort((a, b) => b - a);
        const peligro = Math.min(1, ((pesos[0] ?? 0) + (pesos[1] ?? 0) * 0.5) / 1.5) * fiable;
        amenaza += logit(0.5 + CRUCE_POR_REGLA_MAXIMA * peligro);
      }
      if (!reasons.length && valido(stat.winRate) && amenaza > 0) {
        reasons.push({ clave: 'peligro.fuerte', params: { pct: (stat.winRate * 100).toFixed(1) }, good: false, w: 0.5 });
      }
      return {
        hero,
        stat,
        // Puntos de probabilidad que te quita si sale, y cuánto sale.
        puntos: Math.round(ESCALA * amenaza * PUNTOS_POR_LOGIT),
        disponible,
        score: disponible * ESCALA * Math.max(0, amenaza),
        reasons: dedupe(reasons).sort((a, b) => b.w - a.w).slice(0, 1),
      };
    })
    .filter((b) => b.score > 0)
    .sort((a, b) => b.score - a.score || b.puntos - a.puntos || a.hero.name.localeCompare(b.hero.name))
    .slice(0, 5);
}
