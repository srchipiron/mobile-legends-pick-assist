import {
  normName, lookup, matchup, sinergia, tuNivel, priorDeMaestria, PRECISION_DEDUCIDA,
  CRUCE_DESTACABLE, CRUCE_MALO, PAREJA_DESTACABLE, hayQueProtegerlo,
} from './score.js';
import { COUNTER_RULES } from './rules.js';

/**
 * EL modelo. Uno solo, para todo lo que decide la app.
 *
 * Desde 2.0 no hay «componentes» reescalados dentro del pool y sumados con
 * pesos escritos a mano (0.22 meta, 0.40 counter, 0.15 sinergia, 0.08
 * composición, 0.15 maestría: nunca se midieron contra un resultado). Hay
 * una probabilidad de ganar el draft que resulta, aditiva en log-odds, y
 * cada pick se ordena por ella. Lo que vale cada término lo dice
 * `scripts/ajustar-modelo.mjs` sobre las partidas profesionales con
 * resultado (Liquipedia, historial/pro-partidas.jsonl), con validación
 * cruzada para no ajustarse al ruido. Lo medido (902 partidas de los 120
 * días anteriores al 2026-09-10; 1.528 en 400 días dan lo mismo):
 *
 *  - Con los tres términos a coeficiente 1 (la estimación de 1.28 a 1.41)
 *    el modelo EXAGERA: Brier 0.2510, peor que una moneda. Una sola escala
 *    sobre H+C+S sale 0.44 ± 0.12 y deja el Brier en 0.2435 (AUC 0.56).
 *  - Un coeficiente libre por término (0.50 ± 0.16, 0.49 ± 0.29,
 *    0.11 ± 0.36) NO mejora la validación cruzada: los tres pesan lo mismo
 *    dentro del error, así que se dejan iguales y se escala el total.
 *  - El cruce de LÍNEA (rival a rival) no pesa más que los otros veinte
 *    (−0.56 ± 0.62 frente a 0.78 ± 0.32): el ×2 de 1.x no tenía respaldo y
 *    desaparece. La deducción del rival sigue para el análisis.
 *  - Los huecos de composición por etiqueta (TEAM_NEEDS) valen 0.00 ± 0.07
 *    por hueco: no predicen nada. Se siguen DICIENDO (composicion.js), no
 *    se puntúan. El hueco de daño no se puede medir: 0 de 902 equipos pro
 *    lo tienen.
 *  - El orden de pick de Liquipedia no lleva señal de contrapick (cruce
 *    medio del elegido después contra el elegido antes: 0.000), así que los
 *    enemigos que faltan se esperan por lo que se juega en su línea
 *    (pickrate), sin castigo adversarial inventado.
 *
 * Términos, todos en log-odds y todos centrados:
 *  - Héroes: logit(winrate público) − logit(media del rango), tuyos menos
 *    suyos. Sin encoger: el ruido entre corridas es 0,0003 (ver CLAUDE.md).
 *  - Cruces: logit(c[a][e]) por cada par tuyo×suyo. La matriz es
 *    antisimétrica alrededor de 0.5 y no lleva la fuerza de nadie.
 *  - Parejas: logit(s) − logit(centro) por cada par de un equipo, tuyas
 *    menos suyas, con el centro en las parejas de líneas distintas.
 *  - Tú: si es tu héroe y tienes maestría, tu winrate con él (encogido hacia
 *    lo que cabe esperar de ti) SUSTITUYE al winrate público.
 *  - Por ver: para cada línea enemiga aún abierta, el cruce ESPERADO de tu
 *    héroe contra lo que se juega ahí, ponderado por pickrate. Es lo único
 *    que hace distinto elegir pronto o tarde, y no es un castigo: es la
 *    esperanza del término de cruces sobre lo que falta.
 *
 * Con la escala medida, 0.1 log-odds del total son ≈2,5 puntos de
 * probabilidad alrededor del 50%.
 */

/** Pendiente medida (regresión logística de «ganó» sobre H+C+S, 10 pliegues). */
export const ESCALA = 0.44;
export const ESCALA_SE = 0.12;
/** Con qué se ajustó: para que el diagnóstico avise cuando el bot mida otra cosa. */
export const AJUSTE = { partidas: 902, desde: '2026-05-13', datosDe: '2026-09-08' };

export const logit = (p) => Math.log(p / (1 - p));
export const sigmoide = (x) => 1 / (1 + Math.exp(-x));
/** Fuera de (0.02, 0.98) no es un winrate: es un dato roto. */
export const valido = (p) => typeof p === 'number' && p > 0.02 && p < 0.98;
const clamp01 = (n) => Math.max(0, Math.min(1, n));

/** Puntos de probabilidad por unidad de log-odds YA escalado, para enseñar el desglose. */
export const PUNTOS_POR_LOGIT = 25;

/**
 * Ventaja máxima por reglas contra un enemigo, derivada de COUNTER_RULES (la
 * más fuerte más media de la segunda). Solo entra sin dato del cruce.
 */
export const SUB_MAX = (() => {
  const w = COUNTER_RULES.map((r) => r.weight).sort((a, b) => b - a);
  return (w[0] ?? 1) + (w[1] ?? 0) / 2;
})();

/**
 * A cuánto cruce equivale la regla más fuerte cuando NO hay dato: 0.56, el
 * techo de la escala de counter de 1.x (una regla a tope valía lo mismo que
 * un cruce del 56%). Se conserva esa equivalencia; con la matriz al 100%
 * solo entra con un héroe recién salido.
 */
export const CRUCE_POR_REGLA_MAXIMA = 0.06;
const PAREJA_POR_REGLA_MAXIMA = 0.06;
const SUB_MAX_PAREJA = 0.8;

const mediasDeSinergia = new WeakMap();

/**
 * El centro de las parejas: la media de las que pueden ir JUNTAS en un
 * equipo (líneas distintas), ponderada por lo que se juegan. La media de
 * toda la matriz mezcla las parejas de la misma línea (las malas, 0,486)
 * con las reales (0,500), y centrar ahí favorecía al equipo con MÁS héroes
 * en pantalla en un draft a medias. Sin `lineas` se cae a la media global.
 */
export function mediaDeSinergia(synergies, lineas = null, stats = null) {
  if (!synergies || typeof synergies !== 'object') return 0.5;
  const cache = mediasDeSinergia.get(synergies);
  if (cache && cache.lineas === lineas && cache.stats === stats) return cache.media;
  const lanesDe = (n) => lineas?.get?.(n)?.lanes ?? null;
  const pesoDe = (n) => stats?.[n]?.pickRate ?? 1;
  let suma = 0;
  let n = 0;
  for (const [a, fila] of Object.entries(synergies)) {
    const la = lineas ? lanesDe(normName(a)) : null;
    for (const [b, v] of Object.entries(fila ?? {})) {
      if (!valido(v)) continue;
      if (lineas) {
        const lb = lanesDe(normName(b));
        if (la && lb && la.some((l) => lb.includes(l))) continue;
      }
      const w = stats ? pesoDe(normName(a)) * pesoDe(normName(b)) : 1;
      suma += v * w; n += w;
    }
  }
  const media = n ? suma / n : 0.5;
  mediasDeSinergia.set(synergies, { lineas, stats, media });
  return media;
}

/** logit(winrate público) centrado en la media del rango. Sin dato, 0 y `dato: false`. */
export function terminoHeroe(hero, stats, media = 0.5) {
  const w = lookup(stats, hero?.name)?.winRate;
  if (!valido(w)) return { valor: 0, dato: false, winRate: null };
  return { valor: logit(w) - logit(valido(media) ? media : 0.5), dato: true, winRate: w };
}

/**
 * Ventaja por reglas contra un enemigo, 0..1, con sus motivos. Cuenta la más
 * fuerte y media la segunda: sumarlas todas premiaba al que más etiquetas
 * tiene en el catálogo. Descontada por PRECISION_DEDUCIDA si los tags de
 * cualquiera de los dos están deducidos.
 */
export function ventajaPorTags(hero, enemy, razones = null) {
  const fiable = (hero.inferred ? PRECISION_DEDUCIDA : 1) * (enemy.inferred ? PRECISION_DEDUCIDA : 1);
  const positivas = [];
  let penalizacion = 0;
  for (const rule of COUNTER_RULES) {
    if (!enemy.tags?.includes(rule.enemyTag) || !hero.tags?.includes(rule.roamTag)) continue;
    razones?.push({ clave: rule.why, params: { e: enemy.name }, good: rule.weight > 0, w: Math.abs(rule.weight), kind: `${rule.enemyTag}>${rule.roamTag}` });
    if (rule.weight > 0) positivas.push(rule.weight);
    else penalizacion += rule.weight;
  }
  positivas.sort((a, b) => b - a);
  const sub = (positivas[0] ?? 0) + (positivas[1] ?? 0) * 0.5 + penalizacion;
  return { ventaja: clamp01(sub / SUB_MAX) * fiable, signo: Math.sign(sub) };
}

/**
 * Tu cruce contra UN enemigo, en log-odds, con los motivos que se enseñan.
 * Con dato: el cruce real; una regla por etiqueta solo se dice si el dato va
 * en el mismo sentido (la regla explica el porqué, el dato dice si es
 * verdad). Sin dato (héroe recién salido): la regla, a la equivalencia de
 * 1.x, y se dice tal cual.
 */
export function terminoCruce(hero, enemy, counters) {
  const razones = [];
  const porTag = [];
  const { ventaja, signo } = ventajaPorTags(hero, enemy, porTag);
  const cruce = matchup(counters, hero.name, enemy.name);
  if (!valido(cruce)) {
    razones.push(...porTag);
    const pseudo = 0.5 + CRUCE_POR_REGLA_MAXIMA * ventaja * (signo < 0 ? -1 : 1);
    return { valor: logit(pseudo), dato: false, cruce: null, razones };
  }
  razones.push(...porTag.filter((r) => (r.good ? cruce >= 0.5 : cruce <= 0.5)));
  if (cruce >= CRUCE_DESTACABLE) razones.push({ clave: 'regla.ganaMatchup', params: { e: enemy.name }, good: true, w: 1.2 });
  if (cruce <= CRUCE_MALO) razones.push({ clave: 'regla.pierdeMatchup', params: { e: enemy.name }, good: false, w: 1.3 });
  return { valor: logit(cruce), dato: true, cruce, razones };
}

/** Tu pareja con UN aliado, en log-odds centrado. Sin dato, las reglas de 1.x. */
export function terminoPareja(hero, ally, synergies, centro) {
  const razones = [];
  const pareja = sinergia(synergies, hero.name, ally.name);
  if (valido(pareja)) {
    if (pareja >= PAREJA_DESTACABLE) razones.push({ clave: 'regla.combinaCon', params: { a: ally.name }, good: true, w: 0.7 });
    return { valor: logit(pareja) - logit(centro), dato: true, pareja, razones };
  }
  const fiable = (hero.inferred ? PRECISION_DEDUCIDA : 1) * (ally.inferred ? PRECISION_DEDUCIDA : 1);
  let sub = 0;
  if (hayQueProtegerlo(ally) && ally.tags?.includes('immobile') && hero.tags?.includes('peel')) {
    sub += 0.8; razones.push({ clave: 'regla.protege', params: { a: ally.name }, good: true, w: 0.8 });
  }
  if (ally.tags?.includes('dive') && hero.tags?.includes('engage')) {
    sub += 0.6; razones.push({ clave: 'regla.abrePelea', params: { a: ally.name }, good: true, w: 0.6 });
  }
  if (ally.tags?.includes('hypercarry') && hero.tags?.includes('sustain')) {
    sub += 0.5; razones.push({ clave: 'regla.mantieneVivo', params: { a: ally.name }, good: true, w: 0.5 });
  }
  const pseudo = centro + PAREJA_POR_REGLA_MAXIMA * clamp01(sub / SUB_MAX_PAREJA) * fiable;
  return { valor: logit(pseudo) - logit(centro), dato: false, pareja: null, razones };
}

/**
 * Tú con ese héroe: lo que se le añade al término de héroe para que tu
 * winrate con él (encogido con el mismo prior que la maestría, hacia lo que
 * cabe esperar de ti: su winrate público más tu ventaja sobre el 50%)
 * SUSTITUYA al público. Sin maestría, cero. Los motivos van contra TU
 * nivel, no contra un 55% fijo, y con el estimado encogido.
 */
export function terminoTu(hero, mastery, stats, nivel, prior) {
  const vacio = { valor: 0, dato: false, razones: [] };
  if (!mastery || !Object.keys(mastery).length) return vacio;
  // Sin winrate público (primer arranque con la API caída, o un héroe
  // recién salido) la referencia es el 50%: tu maestría sigue contando.
  const publico = lookup(stats, hero.name)?.winRate;
  const w = valido(publico) ? publico : 0.5;
  const m = lookup(mastery, hero.name) ?? mastery[hero.name];
  if (!m || !(m.games > 0) || m.winRate == null) return vacio;
  const base = nivel ?? tuNivel(mastery);
  const k = prior ?? priorDeMaestria(mastery, base);
  const esperado = Math.min(0.95, Math.max(0.05, w + (base - 0.5)));
  const propio = (m.winRate * m.games + esperado * k) / (m.games + k);
  const razones = [];
  const sigma = Math.sqrt(0.25 / k);
  // Contra tu nivel con ese héroe (lo esperado), con el encogido.
  if (propio >= esperado + sigma) razones.push({ clave: 'regla.maestriaBuena', params: { pct: Math.round(m.winRate * 100), n: m.games }, good: true, w: 1.4 });
  if (propio <= esperado - sigma) razones.push({ clave: 'regla.maestriaMala', params: { pct: Math.round(m.winRate * 100), n: m.games }, good: false, w: 1.4 });
  return { valor: logit(propio) - logit(w), dato: true, propio, razones };
}

/**
 * Lo que cabe esperar de tu cruce contra lo que aún falta por salir: para
 * cada línea enemiga abierta, la media de logit(c[tú][e]) sobre los héroes
 * de esa línea que aún pueden salir, ponderada por su pickrate. Sin líneas
 * abiertas (o sin pools), cero.
 */
export function esperanzaCruces(hero, { lineasAbiertas = [], poolsPorLinea = {}, stats, counters, excluidos = new Set() } = {}) {
  let total = 0;
  const detalle = {};
  for (const l of lineasAbiertas) {
    const pool = poolsPorLinea[l];
    if (!pool?.length) continue;
    let suma = 0; let peso = 0;
    for (const e of pool) {
      const ne = normName(e.name);
      if (ne === normName(hero.name) || excluidos.has(ne)) continue;
      const c = matchup(counters, hero.name, e.name);
      if (!valido(c)) continue;
      const w = lookup(stats, e.name)?.pickRate ?? 0.001;
      suma += logit(c) * w; peso += w;
    }
    if (!peso) continue;
    detalle[l] = suma / peso;
    total += detalle[l];
  }
  return { valor: total, detalle };
}

/**
 * Cuánto hay de ganar el draft con estos, tú incluido si `yo`.
 *
 * @param allies         tus compañeros ya elegidos (sin ti)
 * @param yo             tu héroe (el candidato), o null
 * @param enemies        los suyos
 * @param meta           { stats, counters, synergies, patchAvgWinRate } ya indexados
 * @param mastery        tu maestría (solo pesa sobre `yo`)
 * @param lineas         índice de líneas: centra las parejas en las que pueden ir juntas
 * @param lineasAbiertas líneas enemigas por las que aún falta alguien (término «por ver»)
 * @param poolsPorLinea  { linea: [héroes] } de dónde salen los que faltan
 * @param bans           baneados: no pueden salir por una línea abierta
 * @returns { p, logOdds, terminos, puntos, razones, vistos, completo, dato } o null sin nadie
 */
export function evaluarDraft({
  allies = [], yo = null, enemies = [], meta = {}, mastery = null, nivel, prior, lineas = null,
  lineasAbiertas = [], poolsPorLinea = {}, bans = [],
} = {}) {
  const mios = yo ? [yo, ...allies.filter((h) => normName(h.name) !== normName(yo.name))] : [...allies];
  if (!mios.length && !enemies.length) return null;
  const stats = meta.stats ?? {};
  const media = meta.patchAvgWinRate ?? 0.5;
  const razones = [];

  let heroes = 0;
  let conDato = 0;
  for (const h of mios) { const t = terminoHeroe(h, stats, media); heroes += t.valor; if (t.dato) conDato += 1; }
  for (const h of enemies) { const t = terminoHeroe(h, stats, media); heroes -= t.valor; if (t.dato) conDato += 1; }

  let tu = 0;
  if (yo) { const t = terminoTu(yo, mastery, stats, nivel, prior); tu = t.valor; razones.push(...t.razones); }

  let cruces = 0;
  for (const a of mios) {
    for (const e of enemies) {
      const t = terminoCruce(a, e, meta.counters);
      cruces += t.valor;
      if (yo && a === mios[0]) razones.push(...t.razones);
    }
  }

  const centro = mediaDeSinergia(meta.synergies, lineas, meta.stats ?? null);
  let parejas = 0;
  for (let i = 0; i < mios.length; i++) {
    for (let j = i + 1; j < mios.length; j++) {
      const t = terminoPareja(mios[i], mios[j], meta.synergies, centro);
      parejas += t.valor;
      if (yo && i === 0) razones.push(...t.razones);
    }
  }
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) parejas -= terminoPareja(enemies[i], enemies[j], meta.synergies, centro).valor;
  }

  let porVer = 0;
  if (yo && lineasAbiertas.length) {
    const excluidos = new Set([...mios, ...enemies, ...bans].map((h) => normName(h.name)));
    porVer = esperanzaCruces(yo, { lineasAbiertas, poolsPorLinea, stats, counters: meta.counters, excluidos }).valor;
  }

  const terminos = { heroes, cruces, parejas, tu, porVer };
  const logOdds = ESCALA * (heroes + cruces + parejas + tu + porVer);
  const puntos = Object.fromEntries(Object.entries(terminos).map(([k, v]) => [k, Math.round(ESCALA * v * PUNTOS_POR_LOGIT)]));
  return {
    p: sigmoide(logOdds),
    logOdds,
    terminos,
    puntos,
    razones,
    vistos: mios.length + enemies.length,
    completo: mios.length === 5 && enemies.length === 5,
    dato: conDato,
  };
}
