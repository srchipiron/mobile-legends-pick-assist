import { nombreClave, buscar, idMotivo } from './nombres.js';
import { cruce } from './matrices.js';
import { evaluarDraft, ESCALA, PUNTOS_POR_LOGIT } from './modelo.js';
import { clamp01 } from './estadistica.js';

/**
 * El ranking: el pool de tu línea ordenado por la probabilidad de ganar el draft
 * que resulta con cada candidato. Sin pesos ni reescala: la distancia nº1–nº2 es
 * de probabilidad.
 * @typedef {{ heroe, p, logOdds, terminos, puntos, dato, motivos, mejorPareja, riesgo }} Candidato
 */

/** [P] Riesgo de contrapick desde el que un pick es «castigable a ciegas». */
export const RIESGO_AVISO = 0.6;
/** [M] El décimo peor cruce del héroe más castigable, con la matriz entera (p10 por héroe 0,465–0,492). */
const PEOR_CRUCE_REAL = 0.035;
/** [P] Un motivo que sale a más de esta fracción del pool no informa. */
const MOTIVO_COMUN = 0.6;
const MOTIVOS_POR_TARJETA = 3;

/** Pick a ciegas: riesgo alto y más de dos enemigos por ver (un predicado para tarjeta y análisis). */
export function esPickCiego(riesgo, enemigosVistos) {
  return riesgo != null && riesgo > RIESGO_AVISO && Math.max(0, 5 - enemigosVistos) / 5 > 0.4;
}

/** 0..1: el p10 de sus cruces contra los que aún pueden salir (el mal día típico). Informativo. */
export function riesgoContrapick(heroe, counters, candidatos = []) {
  if (!buscar(counters, heroe.name)) return null;
  const valores = candidatos.map((h) => cruce(counters, heroe.name, h.name)).filter((v) => v != null).sort((a, b) => a - b);
  if (valores.length < 10) return null;
  return clamp01((0.5 - valores[Math.floor(valores.length * 0.1)]) / PEOR_CRUCE_REAL);
}

/**
 * El pool ordenado para este draft. `ctx`: `{enemigos, aliados, baneos, meta, lineas,
 * lineasAbiertas, poolsPorLinea, candidatos}`.
 * @returns {Candidato[]}
 */
export function ordenarPicks(pool, ctx = {}) {
  const cogidos = new Set([...(ctx.enemigos ?? []), ...(ctx.aliados ?? []), ...(ctx.baneos ?? [])].map((h) => nombreClave(h.name)));
  const base = {
    aliados: ctx.aliados ?? [], enemigos: ctx.enemigos ?? [], meta: ctx.meta ?? {}, lineas: ctx.lineas ?? null,
    lineasAbiertas: ctx.lineasAbiertas ?? [], poolsPorLinea: ctx.poolsPorLinea ?? {}, baneos: ctx.baneos ?? [],
  };
  const candidatos = pool.filter((h) => !cogidos.has(nombreClave(h.name))).map((heroe) => {
    const e = evaluarDraft({ ...base, yo: heroe });
    return {
      heroe, p: e.p, logOdds: e.logOdds, terminos: e.terminos, puntos: e.puntos, dato: e.dato,
      motivos: ordenarMotivos(e.motivos), mejorPareja: e.mejorPareja,
      riesgo: riesgoContrapick(heroe, ctx.meta?.counters, ctx.candidatos ?? []),
    };
  });
  if (!candidatos.length) return candidatos;

  // Los comunes se quitan ANTES de cortar a tres (si no, una tarjeta se queda sin su cuarto válido).
  const frecuencia = new Map();
  for (const c of candidatos) for (const id of new Set(c.motivos.map(idMotivo))) frecuencia.set(id, (frecuencia.get(id) ?? 0) + 1);
  const comunes = new Set([...frecuencia].filter(([, n]) => n > candidatos.length * MOTIVO_COMUN).map(([id]) => id));
  const vistos = ctx.enemigos?.length ?? 0;
  for (const c of candidatos) {
    c.motivos = c.motivos.filter((m) => !comunes.has(idMotivo(m))).slice(0, MOTIVOS_POR_TARJETA);
    if (esPickCiego(c.riesgo, vistos)) c.motivos = [{ clave: 'regla.arriesgadoCiego', bueno: false, peso: 1.5 }, ...c.motivos].slice(0, MOTIVOS_POR_TARJETA);
  }
  return candidatos.sort((a, b) => b.logOdds - a.logOdds || b.terminos.heroes - a.terminos.heroes || a.heroe.name.localeCompare(b.heroe.name));
}

/** Únicos por identidad y uno por tipo de regla, de más a menos peso. */
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

/** [M/P] Empate con el nº1: p25 de la distancia nº1–nº2 en 300 drafts (se dice en uno de cada cuatro). */
export const MARGEN_EMPATE = 0.004;

/** Los primeros dentro del margen de empate (hasta cuatro). */
export function empatados(ranking, margen = MARGEN_EMPATE) {
  if (!ranking.length) return [];
  return ranking.filter((c) => ranking[0].p - c.p <= margen).slice(0, 4);
}

/** [P] Lo que un candidato gana al nº1 en un término se dice desde medio punto (por debajo es redondeo). */
export const PUNTOS_A_FAVOR = 0.5;

/**
 * Por qué va detrás del nº1, término a término, en la escala del desglose. Entre
 * dos candidatos del mismo draft solo cambia tu héroe: cada diferencia es suya.
 */
export function porQueDetras(candidato, primero) {
  if (!candidato?.terminos || !primero?.terminos || candidato === primero) return null;
  const dif = (primero.p - candidato.p) * 100;
  if (primero.p - candidato.p < MARGEN_EMPATE) return { empate: true, dif };
  const partes = Object.keys(candidato.terminos).map((termino) => ({
    termino,
    puntos: ESCALA * ((primero.terminos[termino] ?? 0) - (candidato.terminos[termino] ?? 0)) * PUNTOS_POR_LOGIT,
  }));
  const contra = partes.filter((x) => x.puntos > 0).sort((a, b) => b.puntos - a.puntos);
  const favor = partes.filter((x) => x.puntos < 0).sort((a, b) => a.puntos - b.puntos);
  return {
    empate: false,
    dif,
    principal: contra[0] ?? null,
    aFavor: favor[0] && -favor[0].puntos >= PUNTOS_A_FAVOR ? { termino: favor[0].termino, puntos: -favor[0].puntos } : null,
  };
}
