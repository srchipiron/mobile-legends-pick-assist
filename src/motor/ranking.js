import { nombreClave, buscar, idMotivo } from './nombres.js';
import { cruce } from './matrices.js';
import { tuNivel, priorDeMaestria } from './maestria.js';
import { evaluarDraft } from './modelo.js';

/**
 * El ranking: el pool de tu línea ordenado por la probabilidad de ganar el
 * draft que resulta con cada candidato (modelo.js). No hay pesos ni reescala
 * dentro del pool: la nota ES el log-odds, así que dos puntos de winrate y
 * dos de cruce valen lo mismo y la distancia nº1–nº2 es de probabilidad.
 */

/**
 * @typedef {object} Candidato
 * @property {object} heroe
 * @property {number} p          probabilidad de ganar el draft con él
 * @property {number} logOdds
 * @property {object} terminos   { heroes, cruces, parejas, tu, porVer } en log-odds
 * @property {object} puntos     lo mismo en puntos de probabilidad, redondeado
 * @property {Array}  motivos    hasta tres, únicos, sin los comunes al pool
 * @property {number|null} riesgo  riesgo de contrapick 0..1 (solo informativo)
 * @property {number} dato       cuántos héroes del draft tienen winrate
 */

/** Riesgo de contrapick a partir del cual un pick es «castigable a ciegas». */
export const RIESGO_AVISO = 0.6;

/** ¿Es un pick a ciegas? Riesgo alto Y más de dos enemigos por ver. Un solo predicado para tarjeta y análisis. */
export function esPickCiego(riesgo, enemigosVistos) {
  const ceguera = Math.max(0, 5 - enemigosVistos) / 5;
  return riesgo != null && riesgo > RIESGO_AVISO && ceguera > 0.4;
}

/**
 * Lo lejos del empate que llega el décimo peor cruce del héroe MÁS
 * castigable, con la matriz completa (p10 por héroe de 0.465 a 0.492). Era
 * 0.08, calibrado sobre los cinco cruces más extremos que daba la ruta corta,
 * y con la matriz entera nadie pasaba de 0.43: el aviso no salía nunca.
 */
const PEOR_CRUCE_REAL = 0.035;

/**
 * Riesgo de contrapick 0..1: percentil 10 de sus cruces contra los
 * candidatos que aún pueden salir (el mal día típico, no el mínimo). Solo
 * informativo desde 2.0: el orden de pick no lleva contrapick medible.
 */
export function riesgoContrapick(heroe, counters, candidatos = []) {
  if (!buscar(counters, heroe.name)) return null;
  const valores = candidatos.map((h) => cruce(counters, heroe.name, h.name)).filter((v) => v != null).sort((a, b) => a - b);
  if (valores.length < 10) return null;
  const p10 = valores[Math.floor(valores.length * 0.1)];
  return Math.max(0, Math.min(1, (0.5 - p10) / PEOR_CRUCE_REAL));
}

/**
 * Ordena el pool para el draft que tienes delante.
 *
 * @param {object[]} pool  héroes de tu línea
 * @param {object} ctx     { enemigos, aliados, baneos, maestria, meta, lineas,
 *                           lineasAbiertas, poolsPorLinea, candidatos, nivel, prior }
 * @returns {Candidato[]}
 */
export function ordenarPicks(pool, ctx = {}) {
  const cogidos = new Set([...(ctx.enemigos ?? []), ...(ctx.aliados ?? []), ...(ctx.baneos ?? [])].map((h) => nombreClave(h.name)));
  // Tu nivel y tu prior UNA vez por ranking (37 × 60 finales por toque).
  const nivel = ctx.nivel ?? tuNivel(ctx.maestria ?? {});
  const prior = ctx.prior ?? priorDeMaestria(ctx.maestria ?? {}, nivel);
  const base = {
    aliados: ctx.aliados ?? [], enemigos: ctx.enemigos ?? [], meta: ctx.meta ?? {}, maestria: ctx.maestria ?? null,
    nivel, prior, lineas: ctx.lineas ?? null, lineasAbiertas: ctx.lineasAbiertas ?? [], poolsPorLinea: ctx.poolsPorLinea ?? {},
    baneos: ctx.baneos ?? [],
  };

  const candidatos = pool.filter((h) => !cogidos.has(nombreClave(h.name))).map((heroe) => {
    const e = evaluarDraft({ ...base, yo: heroe });
    return {
      heroe, p: e.p, logOdds: e.logOdds, terminos: e.terminos, puntos: e.puntos, dato: e.dato,
      motivos: ordenarMotivos(e.motivos),
      riesgo: riesgoContrapick(heroe, ctx.meta?.counters, ctx.candidatos ?? []),
    };
  });
  if (!candidatos.length) return candidatos;

  // Un motivo que le sale a casi todo el pool no informa («no hay primera
  // línea» es cierto para los 34 roamers a la vez). Fuera ANTES de cortar a
  // tres: cortando antes, el 12% de las tarjetas se quedaba sin un cuarto válido.
  const frecuencia = new Map();
  for (const c of candidatos) for (const id of new Set(c.motivos.map(idMotivo))) frecuencia.set(id, (frecuencia.get(id) ?? 0) + 1);
  const comunes = new Set([...frecuencia].filter(([, n]) => n > candidatos.length * 0.6).map(([id]) => id));
  const vistos = ctx.enemigos?.length ?? 0;
  for (const c of candidatos) {
    c.motivos = c.motivos.filter((m) => !comunes.has(idMotivo(m))).slice(0, 3);
    if (esPickCiego(c.riesgo, vistos)) c.motivos = [{ clave: 'regla.arriesgadoCiego', bueno: false, peso: 1.5 }, ...c.motivos].slice(0, 3);
  }

  // Empate exacto: primero lo que mejor lleves, luego el winrate, luego el nombre.
  return candidatos.sort((a, b) =>
    b.logOdds - a.logOdds
    || b.terminos.tu - a.terminos.tu
    || b.terminos.heroes - a.terminos.heroes
    || a.heroe.name.localeCompare(b.heroe.name));
}

/** Los motivos de un candidato, únicos y por relevancia, ANTES del filtro de comunes. */
export function motivosDe(heroe, ctx = {}) {
  const e = evaluarDraft({ aliados: ctx.aliados ?? [], enemigos: ctx.enemigos ?? [], meta: ctx.meta ?? {}, maestria: ctx.maestria ?? null, lineas: ctx.lineas ?? null, yo: heroe });
  return e ? ordenarMotivos(e.motivos) : [];
}

/** Únicos por identidad, uno por tipo de regla, de más a menos peso. */
export function ordenarMotivos(motivos) {
  const vistos = new Set();
  const tipos = new Set();
  const salida = [];
  for (const m of [...motivos].sort((a, b) => (b.peso ?? 0) - (a.peso ?? 0))) {
    const id = idMotivo(m);
    if (vistos.has(id)) continue;
    vistos.add(id);
    const tipo = m.tipo ?? id;
    if (tipos.has(tipo)) continue;
    tipos.add(tipo);
    salida.push(m);
  }
  return salida;
}

/**
 * Margen de empate entre el nº1 y los siguientes, en probabilidad: decisión
 * de cuántas veces decir «está reñido», no una calibración. 0.004 es el p25
 * de la distancia nº1–nº2 en 300 drafts de roam (p50 0,9 puntos, p85 1,9):
 * se dice en uno de cada cuatro, como el 0.015 de 1.x sobre su escala.
 */
export const MARGEN_EMPATE = 0.004;

/** Los primeros puestos dentro del margen de ruido (hasta cuatro). */
export function empatados(ranking, margen = MARGEN_EMPATE) {
  if (!ranking.length) return [];
  return ranking.filter((c) => ranking[0].p - c.p <= margen).slice(0, 4);
}
