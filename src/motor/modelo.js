import { nombreClave, buscar } from './nombres.js';
import { cruce, sinergia, mediaDeSinergia, valido, CRUCE_DESTACABLE, CRUCE_MALO, PAREJA_DESTACABLE } from './matrices.js';
import { PRECISION_DEDUCIDA, hayQueProtegerlo } from './catalogo.js';
import { tuNivel, priorDeMaestria } from './maestria.js';
import { COUNTER_RULES } from './reglas.js';

/**
 * EL modelo. Uno solo, para todo lo que decide la app.
 *
 * La nota de un pick ES la probabilidad de ganar el draft que resulta con él:
 * aditiva en log-odds, cinco términos centrados sumados con coeficiente 1 y
 * multiplicados por UNA escala medida. Lo que vale cada término lo dice
 * `scripts/medir/ajustar-modelo.mjs` sobre las partidas profesionales con
 * resultado (902 de 120 días; 1.528 de 400 dan lo mismo), con validación
 * cruzada:
 *
 *  - Con los tres términos a coeficiente 1 el modelo exageraba (Brier
 *    0.2510, peor que una moneda). Una escala sobre H+C+S: 0.44 ± 0.12,
 *    Brier 0.2435, AUC 0.56.
 *  - Un coeficiente libre por término (0.50 ± 0.16, 0.49 ± 0.29, 0.11 ±
 *    0.36) NO mejora la validación cruzada: iguales y una escala.
 *  - El cruce de LÍNEA no pesa más que los otros veinte (−0.56 ± 0.62 frente
 *    a 0.78 ± 0.32): ningún cruce pesa doble.
 *  - Los huecos de composición valen 0.00 ± 0.07 por hueco: se dicen, no
 *    puntúan. El hueco de daño no se puede medir (0 de 902 equipos pro).
 *  - El orden de pick de Liquipedia no lleva contrapick medible (0.000):
 *    lo que falta por salir entra como ESPERANZA del cruce contra lo que se
 *    juega en cada línea abierta, sin castigo adversarial.
 *
 * Términos, todos en log-odds:
 *  - heroes:  logit(winrate público) − logit(media del rango), tuyos − suyos.
 *  - cruces:  logit(c[a][e]) por cada par tuyo × suyo.
 *  - parejas: logit(s) − logit(centro) por cada par de un equipo, tuyas − suyas.
 *  - tu:      tu winrate con el héroe (encogido) SUSTITUYE al público.
 *  - porVer:  para cada línea enemiga abierta, el cruce esperado de tu héroe
 *             contra lo que se juega ahí, ponderado por pickrate.
 *
 * 0.1 log-odds del total son ≈2,5 puntos de probabilidad alrededor del 50%.
 */

/** Pendiente medida (regresión logística de «ganó» sobre H+C+S, 10 pliegues). */
export const ESCALA = 0.44;
export const ESCALA_SE = 0.12;
/** Con qué se ajustó, para que el diagnóstico avise cuando el bot mida otra cosa. */
export const AJUSTE = { partidas: 902, desde: '2026-05-13', datosDe: '2026-09-08' };

export const logit = (p) => Math.log(p / (1 - p));
export const sigmoide = (x) => 1 / (1 + Math.exp(-x));
const acotar01 = (n) => Math.max(0, Math.min(1, n));

/** Puntos de probabilidad por unidad de log-odds ya escalado, para el desglose. */
export const PUNTOS_POR_LOGIT = 25;

/** Techo de las reglas contra un enemigo: la más fuerte más media de la segunda, derivado de COUNTER_RULES. */
export const SUB_MAX = (() => {
  const w = COUNTER_RULES.map((r) => r.weight).sort((a, b) => b - a);
  return (w[0] ?? 1) + (w[1] ?? 0) / 2;
})();

/**
 * A cuánto cruce equivale la regla más fuerte cuando NO hay dato: 0.56, el
 * techo de la escala de counter de 1.x. Con la matriz al 100% solo entra
 * con un héroe recién salido. Las parejas por regla, igual.
 */
export const CRUCE_POR_REGLA_MAXIMA = 0.06;
const PAREJA_POR_REGLA_MAXIMA = 0.06;
const SUB_MAX_PAREJA = 0.8;

const fiabilidad = (a, b) => (a?.inferred ? PRECISION_DEDUCIDA : 1) * (b?.inferred ? PRECISION_DEDUCIDA : 1);

/** logit(winrate público) centrado en la media del rango. Sin dato, 0 y `dato: false`. */
export function terminoHeroe(heroe, stats, media = 0.5) {
  const w = buscar(stats, heroe?.name)?.winRate;
  if (!valido(w)) return { valor: 0, dato: false, winRate: null };
  return { valor: logit(w) - logit(valido(media) ? media : 0.5), dato: true, winRate: w };
}

/**
 * Ventaja por reglas contra un enemigo, 0..1, con sus motivos. Cuenta la más
 * fuerte y media la segunda: sumarlas todas premiaba al que más etiquetas
 * tiene. Descontada si las etiquetas de cualquiera están deducidas.
 */
export function ventajaPorTags(heroe, enemigo, motivos = null) {
  const positivas = [];
  let penalizacion = 0;
  for (const r of COUNTER_RULES) {
    if (!enemigo.tags?.includes(r.enemyTag) || !heroe.tags?.includes(r.roamTag)) continue;
    motivos?.push({ clave: r.why, params: { e: enemigo.name }, bueno: r.weight > 0, peso: Math.abs(r.weight), tipo: `${r.enemyTag}>${r.roamTag}` });
    if (r.weight > 0) positivas.push(r.weight); else penalizacion += r.weight;
  }
  positivas.sort((a, b) => b - a);
  const sub = (positivas[0] ?? 0) + (positivas[1] ?? 0) * 0.5 + penalizacion;
  return { ventaja: acotar01(sub / SUB_MAX) * fiabilidad(heroe, enemigo), signo: Math.sign(sub) };
}

/**
 * Tu cruce contra UN enemigo, en log-odds, con los motivos que se enseñan.
 * Con dato: el cruce real; una regla solo se dice si el dato va en el mismo
 * sentido (la regla explica el porqué; el dato dice si es verdad). Sin dato:
 * la regla, a la equivalencia de 1.x, y se dice tal cual.
 */
export function terminoCruce(heroe, enemigo, counters) {
  const motivos = [];
  const porTag = [];
  const { ventaja, signo } = ventajaPorTags(heroe, enemigo, porTag);
  const c = cruce(counters, heroe.name, enemigo.name);
  if (!valido(c)) {
    motivos.push(...porTag);
    const pseudo = 0.5 + CRUCE_POR_REGLA_MAXIMA * ventaja * (signo < 0 ? -1 : 1);
    return { valor: logit(pseudo), dato: false, cruce: null, motivos };
  }
  motivos.push(...porTag.filter((m) => (m.bueno ? c >= 0.5 : c <= 0.5)));
  if (c >= CRUCE_DESTACABLE) motivos.push({ clave: 'regla.ganaMatchup', params: { e: enemigo.name }, bueno: true, peso: 1.2 });
  if (c <= CRUCE_MALO) motivos.push({ clave: 'regla.pierdeMatchup', params: { e: enemigo.name }, bueno: false, peso: 1.3 });
  return { valor: logit(c), dato: true, cruce: c, motivos };
}

/** Tu pareja con UN aliado, en log-odds centrado. Sin dato, las reglas por etiqueta. */
export function terminoPareja(heroe, aliado, synergies, centro) {
  const motivos = [];
  const s = sinergia(synergies, heroe.name, aliado.name);
  if (valido(s)) {
    if (s >= PAREJA_DESTACABLE) motivos.push({ clave: 'regla.combinaCon', params: { a: aliado.name }, bueno: true, peso: 0.7 });
    return { valor: logit(s) - logit(centro), dato: true, pareja: s, motivos };
  }
  let sub = 0;
  if (hayQueProtegerlo(aliado) && aliado.tags?.includes('immobile') && heroe.tags?.includes('peel')) {
    sub += 0.8; motivos.push({ clave: 'regla.protege', params: { a: aliado.name }, bueno: true, peso: 0.8 });
  }
  if (aliado.tags?.includes('dive') && heroe.tags?.includes('engage')) {
    sub += 0.6; motivos.push({ clave: 'regla.abrePelea', params: { a: aliado.name }, bueno: true, peso: 0.6 });
  }
  if (aliado.tags?.includes('hypercarry') && heroe.tags?.includes('sustain')) {
    sub += 0.5; motivos.push({ clave: 'regla.mantieneVivo', params: { a: aliado.name }, bueno: true, peso: 0.5 });
  }
  const pseudo = centro + PAREJA_POR_REGLA_MAXIMA * acotar01(sub / SUB_MAX_PAREJA) * fiabilidad(heroe, aliado);
  return { valor: logit(pseudo) - logit(centro), dato: false, pareja: null, motivos };
}

/**
 * Tú con ese héroe: lo que se añade al término de héroe para que tu winrate
 * con él (encogido con el prior de la maestría hacia lo que cabe esperar de
 * ti: su winrate público más tu ventaja sobre el 50%) SUSTITUYA al público.
 * Sin winrate público (API caída, héroe nuevo) la referencia es el 50%. Sin
 * maestría, cero. Los motivos van contra lo esperado ± σ.
 */
export function terminoTu(heroe, maestria, stats, nivel, prior) {
  const vacio = { valor: 0, dato: false, motivos: [] };
  if (!maestria || !Object.keys(maestria).length) return vacio;
  const publico = buscar(stats, heroe.name)?.winRate;
  const w = valido(publico) ? publico : 0.5;
  const m = buscar(maestria, heroe.name);
  if (!m || !(m.games > 0) || m.winRate == null) return vacio;
  const base = nivel ?? tuNivel(maestria);
  const k = prior ?? priorDeMaestria(maestria, base);
  const esperado = Math.min(0.95, Math.max(0.05, w + (base - 0.5)));
  const propio = (m.winRate * m.games + esperado * k) / (m.games + k);
  const sigma = Math.sqrt(0.25 / k);
  const motivos = [];
  const params = { pct: Math.round(m.winRate * 100), n: m.games };
  if (propio >= esperado + sigma) motivos.push({ clave: 'regla.maestriaBuena', params, bueno: true, peso: 1.4 });
  if (propio <= esperado - sigma) motivos.push({ clave: 'regla.maestriaMala', params, bueno: false, peso: 1.4 });
  return { valor: logit(propio) - logit(w), dato: true, propio, motivos };
}

/**
 * Lo que cabe esperar de tu cruce contra lo que aún falta por salir: para
 * cada línea enemiga abierta, la media de logit(c[tú][e]) sobre los héroes
 * de esa línea que aún pueden salir, ponderada por su pickrate.
 */
export function esperanzaCruces(heroe, { lineasAbiertas = [], poolsPorLinea = {}, stats, counters, excluidos = new Set() } = {}) {
  let total = 0;
  const detalle = {};
  for (const l of lineasAbiertas) {
    const pool = poolsPorLinea[l];
    if (!pool?.length) continue;
    let suma = 0; let peso = 0;
    for (const e of pool) {
      const ne = nombreClave(e.name);
      if (ne === nombreClave(heroe.name) || excluidos.has(ne)) continue;
      const c = cruce(counters, heroe.name, e.name);
      if (!valido(c)) continue;
      const w = buscar(stats, e.name)?.pickRate ?? 0.001;
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
 * @param {object} d
 * @param d.aliados        tus compañeros ya elegidos (sin ti)
 * @param d.yo             tu héroe (el candidato), o null
 * @param d.enemigos       los suyos
 * @param d.meta           { stats, counters, synergies, mediaDelRango } ya indexados
 * @param d.maestria       tu maestría (solo pesa sobre `yo`)
 * @param d.lineas         índice de líneas: centra las parejas en las que pueden ir juntas
 * @param d.lineasAbiertas líneas enemigas por las que aún falta alguien
 * @param d.poolsPorLinea  { linea: [héroes] } de dónde salen los que faltan
 * @param d.baneos         baneados: no pueden salir por una línea abierta
 * @returns {{ p, logOdds, terminos, puntos, motivos, vistos, completo, dato } | null}
 */
export function evaluarDraft({
  aliados = [], yo = null, enemigos = [], meta = {}, maestria = null, nivel, prior, lineas = null,
  lineasAbiertas = [], poolsPorLinea = {}, baneos = [],
} = {}) {
  const mios = yo ? [yo, ...aliados.filter((h) => nombreClave(h.name) !== nombreClave(yo.name))] : [...aliados];
  if (!mios.length && !enemigos.length) return null;
  const stats = meta.stats ?? {};
  const media = meta.mediaDelRango ?? 0.5;
  const motivos = [];

  let heroes = 0; let conDato = 0;
  for (const h of mios) { const t = terminoHeroe(h, stats, media); heroes += t.valor; if (t.dato) conDato += 1; }
  for (const h of enemigos) { const t = terminoHeroe(h, stats, media); heroes -= t.valor; if (t.dato) conDato += 1; }

  let tu = 0;
  if (yo) { const t = terminoTu(yo, maestria, stats, nivel, prior); tu = t.valor; motivos.push(...t.motivos); }

  let cruces = 0;
  for (const a of mios) {
    for (const e of enemigos) {
      const t = terminoCruce(a, e, meta.counters);
      cruces += t.valor;
      if (yo && a === mios[0]) motivos.push(...t.motivos);
    }
  }

  const centro = mediaDeSinergia(meta.synergies, lineas, meta.stats ?? null);
  let parejas = 0;
  for (let i = 0; i < mios.length; i++) {
    for (let j = i + 1; j < mios.length; j++) {
      const t = terminoPareja(mios[i], mios[j], meta.synergies, centro);
      parejas += t.valor;
      if (yo && i === 0) motivos.push(...t.motivos);
    }
  }
  for (let i = 0; i < enemigos.length; i++) {
    for (let j = i + 1; j < enemigos.length; j++) parejas -= terminoPareja(enemigos[i], enemigos[j], meta.synergies, centro).valor;
  }

  let porVer = 0;
  if (yo && lineasAbiertas.length) {
    const excluidos = new Set([...mios, ...enemigos, ...baneos].map((h) => nombreClave(h.name)));
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
    motivos,
    vistos: mios.length + enemigos.length,
    completo: mios.length === 5 && enemigos.length === 5,
    dato: conDato,
  };
}
