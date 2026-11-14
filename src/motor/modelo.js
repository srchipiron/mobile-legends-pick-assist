import { nombreClave, buscar } from './nombres.js';
import { cruce, sinergia, mediaDeSinergia, valido, CRUCE_DESTACABLE, CRUCE_MALO, CRUCE_FUERTE, CRUCE_FUERTE_EN_CONTRA, PAREJA_DESTACABLE } from './matrices.js';
import { fiabilidad, hayQueProtegerlo, tipoDeDano } from './catalogo.js';
import { COUNTER_RULES } from './reglas.js';
import { logit, sigmoide, clamp01 } from './estadistica.js';

export { logit, sigmoide };

/**
 * EL modelo, uno solo para todo lo que decide la app y la tablet. La nota de un
 * pick ES la probabilidad de ganar el draft que resulta con él: aditiva en
 * log-odds, términos centrados sumados con coeficiente 1 (el equilibrio con 0,5)
 * y multiplicados por UNA escala medida (`scripts/ajustar-modelo.mjs`, partidas
 * pro con resultado y validación cruzada):
 * - heroes: logit(winrate) − logit(media del rango), tuyos − suyos;
 * - cruces: logit(c[a][e]) por cada par tuyo × suyo (ninguno pesa doble: el de
 *   línea, −0,56 ± 0,62 frente a 0,78 ± 0,32);
 * - parejas: logit(s) − logit(centro) por cada par de un equipo, tuyas − suyas;
 * - equilibrio: min(físicos, mágicos) tuyo − suyo, centrado por tamaño;
 * - porVer: el cruce esperado de tu héroe contra lo que aún sale por cada línea
 *   enemiga abierta (sin contrapick adversarial: 0,000 en 19.072 pares pro).
 * Tus resultados NO entran (3.93.0, Javi: «que no afecte en nada»).
 */

/**
 * [C] Versión de la ESTIMACIÓN guardada con cada partida, para no mezclar modelos
 * al calibrar. Súbela si cambia lo que da `evaluarDraft` para el mismo draft: la
 * huella de `modelo.test` falla hasta que se sube. 5 = desde 3.93.0.
 */
export const VERSION_MODELO = 5;
/** [C] Cuándo se publicó cada versión: reparte las partidas viejas sin `modelo` («deducida»). */
export const CAMBIOS_DE_MODELO = [
  { version: 2, desde: Date.parse('2026-09-19T21:19:15Z') },
  { version: 3, desde: Date.parse('2026-10-13T15:23:05Z') },
  { version: 4, desde: Date.parse('2026-10-24T23:00:00Z') },
];

/** [M] Pendiente de «ganó» sobre H+C+S (902 pro de 120 días, 10 pliegues): Brier 0,2435 frente a 0,2510 con 1. */
export const ESCALA = 0.44;
export const ESCALA_SE = 0.12;
export const AJUSTE = { partidas: 902, desde: '2026-05-13', datosDe: '2026-09-08' };
/** [P] Puntos de probabilidad por unidad de log-odds escalado, para el desglose (≈ cerca del 50 %). */
export const PUNTOS_POR_LOGIT = 25;
/**
 * [M] Peso del equilibrio de daño: el k óptimo en una escala común cae en 0,45–0,55
 * (120 y 400 días); +2 a +3,9 de logL por 1.000 fuera de muestra, AUC 0,574 → 0,591.
 */
export const PESO_EQUILIBRIO_DANO = 0.5;
/** [C] A cuánto cruce equivale la regla más fuerte SIN dato: 0,56 (la equivalencia de 1.x). Parejas, igual. */
export const CRUCE_POR_REGLA_MAXIMA = 0.06;
const PAREJA_POR_REGLA_MAXIMA = 0.06;
const SUB_MAX_PAREJA = 0.8;
/** Techo de las reglas contra un enemigo: la más fuerte + ½ de la segunda (derivado de COUNTER_RULES). */
export const SUB_MAX = (() => {
  const w = COUNTER_RULES.map((r) => r.weight).sort((a, b) => b - a);
  return (w[0] ?? 1) + (w[1] ?? 0) / 2;
})();

/**
 * [M] Lo que cabe esperar que salga de un héroe: su cuota de pick CUANDO NO ESTÁ
 * BANEADO (14.640 situaciones de draft pro: top-10 13,0 → 15,3 %, MRR 0,054 → 0,081).
 * La misma cantidad pondera «por ver», la simulación y los baneos.
 */
export const disponibilidad = (stat) => (stat?.pickRate ?? 0) / Math.max(0.05, 1 - (stat?.banRate ?? 0));

/** logit(winrate) centrado en la media del rango; sin dato, 0. */
export function terminoHeroe(heroe, stats, media = 0.5) {
  const w = buscar(stats, heroe?.name)?.winRate;
  if (!valido(w)) return { valor: 0, dato: false, winRate: null };
  return { valor: logit(w) - logit(valido(media) ? media : 0.5), dato: true, winRate: w };
}

/**
 * Ventaja por reglas contra un enemigo, 0..1: la más fuerte + ½ de la segunda +
 * las negativas (sumarlas todas premiaba al de más etiquetas), descontada si las
 * etiquetas de alguno están deducidas. Deja sus motivos en `motivos`.
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
  return { ventaja: clamp01(sub / SUB_MAX) * fiabilidad(heroe) * fiabilidad(enemigo), signo: Math.sign(sub) };
}

/**
 * Tu cruce contra UN enemigo. Con dato, el cruce; una regla se DICE solo si el dato
 * va en su sentido. Sin dato, la regla a la equivalencia de 1.x, antisimétrica
 * (lo que le da a él contra ti se resta: si no, ida y vuelta no suman 1).
 */
export function terminoCruce(heroe, enemigo, counters) {
  const porTag = [];
  const { ventaja, signo } = ventajaPorTags(heroe, enemigo, porTag);
  const c = cruce(counters, heroe.name, enemigo.name);
  if (!valido(c)) {
    const pseudo = (v, s) => 0.5 + CRUCE_POR_REGLA_MAXIMA * v * (s < 0 ? -1 : 1);
    const suya = ventajaPorTags(enemigo, heroe);
    return { valor: logit(pseudo(ventaja, signo)) - logit(pseudo(suya.ventaja, suya.signo)), dato: false, cruce: null, motivos: porTag };
  }
  const motivos = porTag.filter((m) => (m.bueno ? c >= 0.5 : c <= 0.5));
  if (c >= CRUCE_DESTACABLE) motivos.push({ clave: c >= CRUCE_FUERTE ? 'regla.ganaMatchup' : 'regla.ganaMatchupPoco', params: { e: enemigo.name }, bueno: true, peso: 1.2 });
  if (c <= CRUCE_MALO) motivos.push({ clave: c <= CRUCE_FUERTE_EN_CONTRA ? 'regla.pierdeMatchup' : 'regla.pierdeMatchupPoco', params: { e: enemigo.name }, bueno: false, peso: 1.3 });
  return { valor: logit(c), dato: true, cruce: c, motivos };
}

/** Tu pareja con UN aliado, centrada; sin dato, las reglas por etiqueta. */
export function terminoPareja(heroe, aliado, synergies, centro) {
  const s = sinergia(synergies, heroe.name, aliado.name);
  if (valido(s)) {
    const motivos = s >= PAREJA_DESTACABLE ? [{ clave: 'regla.combinaCon', params: { a: aliado.name }, bueno: true, peso: 0.7 }] : [];
    return { valor: logit(s) - logit(centro), dato: true, pareja: s, motivos };
  }
  const motivos = [];
  let sub = 0;
  const regla = (cumple, valor, clave) => { if (cumple) { sub += valor; motivos.push({ clave, params: { a: aliado.name }, bueno: true, peso: valor }); } };
  regla(hayQueProtegerlo(aliado) && aliado.tags?.includes('immobile') && heroe.tags?.includes('peel'), 0.8, 'regla.protege');
  regla(aliado.tags?.includes('dive') && heroe.tags?.includes('engage'), 0.6, 'regla.abrePelea');
  regla(aliado.tags?.includes('hypercarry') && heroe.tags?.includes('sustain'), 0.5, 'regla.mantieneVivo');
  const pseudo = centro + PAREJA_POR_REGLA_MAXIMA * clamp01(sub / SUB_MAX_PAREJA) * fiabilidad(heroe) * fiabilidad(aliado);
  return { valor: logit(pseudo) - logit(centro), dato: false, pareja: null, motivos };
}

/**
 * Lo que cabe esperar de tu cruce contra lo que falta por salir: por cada línea
 * enemiga abierta, la media de logit(c[tú][e]) de los que aún pueden salir por
 * ella, ponderada por `disponibilidad` (mínimo 0,001). Una línea sin peso no suma.
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
      const w = disponibilidad(buscar(stats, e.name)) || 0.001;
      suma += logit(c) * w; peso += w;
    }
    if (!peso) continue;
    detalle[l] = suma / peso;
    total += detalle[l];
  }
  return { valor: total, detalle };
}

/** min(físicos, mágicos) de un equipo; mixtos y sin dato no cuentan (así se midió). */
export function equilibrioDe(equipo = []) {
  let f = 0; let m = 0;
  for (const h of equipo) { const t = tipoDeDano(h); if (t === 'fisico') f++; else if (t === 'magico') m++; }
  return Math.min(f, m);
}

/** El equilibrio de daño centrado por tamaño de equipo; motivo cuando TU pick mete la mezcla que faltaba. */
export function terminoEquilibrio(mios, enemigos, yo = null, esperado = null) {
  const centro = (n) => esperado?.[n] ?? 0;
  const mio = equilibrioDe(mios) - centro(mios.length);
  const suyo = equilibrioDe(enemigos) - centro(enemigos.length);
  const motivos = [];
  if (yo && mios.length > 1 && equilibrioDe(mios) > equilibrioDe(mios.filter((h) => h !== yo))) {
    motivos.push({ clave: 'regla.equilibraDano', params: { tipo: [`comp.${tipoDeDano(yo)}`] }, bueno: true, peso: 1.0 });
  }
  return { valor: PESO_EQUILIBRIO_DANO * (mio - suyo), mio, suyo, motivos };
}

/**
 * La probabilidad de ganar el draft con estos (tú incluido si `yo`).
 * `meta`: `{stats, counters, synergies, mediaDelRango, equilibrioEsperado}` ya indexados;
 * `lineas` centra las parejas; `lineasAbiertas` + `poolsPorLinea` + `baneos` dan «por ver».
 * @returns {{ p, logOdds, terminos, puntos, motivos, mejorPareja, vistos, completo, dato } | null}
 */
export function evaluarDraft({ aliados = [], yo = null, enemigos = [], meta = {}, lineas = null, lineasAbiertas = [], poolsPorLinea = {}, baneos = [] } = {}) {
  const mios = yo ? [yo, ...aliados.filter((h) => nombreClave(h.name) !== nombreClave(yo.name))] : [...aliados];
  if (!mios.length && !enemigos.length) return null;
  const stats = meta.stats ?? {};
  const media = meta.mediaDelRango ?? 0.5;
  const motivos = [];

  let heroes = 0; let conDato = 0;
  for (const h of mios) { const t = terminoHeroe(h, stats, media); heroes += t.valor; if (t.dato) conDato += 1; }
  for (const h of enemigos) { const t = terminoHeroe(h, stats, media); heroes -= t.valor; if (t.dato) conDato += 1; }

  let cruces = 0;
  for (const a of mios) {
    for (const e of enemigos) {
      const t = terminoCruce(a, e, meta.counters);
      cruces += t.valor;
      if (yo && a === mios[0]) motivos.push(...t.motivos);
    }
  }

  // `mejorPareja`: con quién de tu equipo combina mejor TU pick, en puntos de
  // winrate sobre la pareja media. Se ENSEÑA: [M] dar más peso a las parejas
  // predice peor (2.770 pro, ×2: −1,0 de logL por 1.000).
  const centro = mediaDeSinergia(meta.synergies, lineas, meta.stats ?? null);
  let parejas = 0;
  let mejorPareja = null;
  for (let i = 0; i < mios.length; i++) {
    for (let j = i + 1; j < mios.length; j++) {
      const t = terminoPareja(mios[i], mios[j], meta.synergies, centro);
      parejas += t.valor;
      if (yo && i === 0) {
        motivos.push(...t.motivos);
        if (t.dato && (!mejorPareja || t.pareja > mejorPareja.pareja)) mejorPareja = { con: mios[j].name, pareja: t.pareja, puntos: Math.round((t.pareja - centro) * 1000) / 10 };
      }
    }
  }
  for (let i = 0; i < enemigos.length; i++) {
    for (let j = i + 1; j < enemigos.length; j++) parejas -= terminoPareja(enemigos[i], enemigos[j], meta.synergies, centro).valor;
  }

  const eq = terminoEquilibrio(mios, enemigos, yo, meta.equilibrioEsperado ?? null);
  if (yo) motivos.push(...eq.motivos);

  let porVer = 0;
  if (yo && lineasAbiertas.length) {
    const excluidos = new Set([...mios, ...enemigos, ...baneos].map((h) => nombreClave(h.name)));
    porVer = esperanzaCruces(yo, { lineasAbiertas, poolsPorLinea, stats, counters: meta.counters, excluidos }).valor;
  }

  const terminos = { heroes, cruces, parejas, equilibrio: eq.valor, porVer };
  const logOdds = ESCALA * (heroes + cruces + parejas + eq.valor + porVer);
  const puntos = Object.fromEntries(Object.entries(terminos).map(([k, v]) => [k, Math.round(ESCALA * v * PUNTOS_POR_LOGIT)]));
  return {
    p: sigmoide(logOdds),
    logOdds,
    terminos,
    puntos,
    motivos,
    mejorPareja,
    vistos: mios.length + enemigos.length,
    completo: mios.length === 5 && enemigos.length === 5,
    dato: conDato,
  };
}
