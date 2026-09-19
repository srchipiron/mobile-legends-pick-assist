import { indexarPorNombre } from './nombres.js';
import { fundirCatalogo, LINEAS, poolDeLinea, equilibrioEsperado } from './catalogo.js';
import { indiceDeLineas, frecuenciaDeRoles, lineasOcupadas, detectarRivalDeLinea } from './lineas.js';
import { cobertura } from './matrices.js';
import { ordenarPicks, empatados } from './ranking.js';
import { evaluarDraft } from './modelo.js';
import { sugerirBaneos, proximosBaneos, coocurrenciaDeBaneos } from './baneos.js';
import { simularFinales } from './robustez.js';
import { aconsejarEquipo } from './equipo.js';
import { analizarComposicion } from './composicion.js';
import { analizarDraft } from './analisis.js';
import { elegirVentana, mediaDeWinrate } from './ventana.js';

/**
 * El cerebro: de los ficheros de datos y el draft a todo lo que la app
 * enseña. Puro: sin React, sin almacenamiento, sin red. Lo usan la app
 * (useRecomendacion), el diagnóstico del móvil, el del bot y el arnés de
 * paridad, así que solo hay UN sitio donde se decide cómo se indexa el meta,
 * qué rango manda, cómo se resuelven los nombres o qué líneas están abiertas.
 *
 * Las funciones son pequeñas y separadas a propósito: la app memoriza cada
 * pieza por su cuenta (el ranking va con cada toque; la simulación, diferida)
 * y `recomendar` las junta para quien no tiene render que cuidar.
 */

/**
 * @typedef {object} Datos
 * @property {object[]} heroes        catálogo fundido con la API (tags, role, id, lanes)
 * @property {Map} lineas             clave → { role, lanes }
 * @property {object} frecuencias     { linea: { rol: 0..1 } }
 * @property {string|null} rango      el rango cuyas estadísticas se usan
 * @property {object} meta            { stats, counters, synergies, mediaDelRango } indexados por clave
 * @property {object} poolsPorLinea   { linea: héroes que se juegan ahí }
 * @property {Map} porNombre          nombre → héroe
 * @property {object|null} catalogo   heroes.json tal cual
 * @property {object|null} crudo      roam-meta.json tal cual (fechas, builds, objetos, diagnósticos)
 */

/**
 * El rango cuyas estadísticas se usan: el elegido si está descargado, si no
 * el de la ingesta, si no el primero que haya. Antes la app se quedaba sin
 * estadísticas teniéndolas de otro rango.
 */
export function rangoActivo(meta, rango = null) {
  const disponibles = meta?.statsByRank ?? {};
  if (rango && disponibles[rango]) return rango;
  if (meta?.rank && disponibles[meta.rank]) return meta.rank;
  return Object.keys(disponibles)[0] ?? meta?.rank ?? rango ?? null;
}

/** @returns {Datos} */
export function prepararDatos({ catalogo = null, meta = null, rango = null } = {}) {
  const heroes = catalogo ? fundirCatalogo(catalogo.heroes, meta?.heroes) : [];
  const lineas = indiceDeLineas(meta?.heroes);
  const frecuencias = frecuenciaDeRoles(meta?.heroes ?? []);
  const rangoUsado = rangoActivo(meta, rango);
  // Todo por clave normalizada: la API y el catálogo escriben algunos héroes
  // distinto y sin esto se quedaban sin datos en silencio. Las matrices
  // tienen nombre de héroe en los DOS niveles.
  // La fuerza de cada héroe sale de la ventana más corta cuya precisión
  // aguanta (3 días si la ingesta la trae y es coherente con la de 7, ver
  // ventana.js); cruces y parejas siguen a 7. Es el ÚNICO sitio donde se
  // decide: la app, el bot y las pruebas ven las mismas estadísticas.
  const semana = indexarPorNombre(meta?.statsByRank?.[rangoUsado] ?? meta?.stats);
  const recientes = meta?.recientes?.statsByRank?.[rangoUsado] ? indexarPorNombre(meta.recientes.statsByRank[rangoUsado]) : null;
  const { stats, ventana } = elegirVentana(semana, recientes, meta?.recientes?.dias ?? 3);
  const metaCtx = {
    stats,
    statsSemana: semana,
    ventana,
    counters: indexarPorNombre(meta?.counters, 2),
    synergies: indexarPorNombre(meta?.synergies, 2),
    // Lo que cabe esperar de equilibrio de daño en un equipo de n héroes
    // (modelo.js, terminoEquilibrio): centra el término a medias.
    equilibrioEsperado: equilibrioEsperado(heroes, stats),
    // El centro del término de héroe es la media de LA MISMA ventana: con la
    // de 7 días, la que calculó la ingesta (idéntica a la de 2.x); con la de
    // 3, la de los valores que de verdad se usan.
    mediaDelRango: ventana.dias === 7
      ? (meta?.avgByRank?.[rangoUsado] ?? meta?.patchAvgWinRate ?? 0.5)
      : mediaDeWinrate(stats),
  };
  const poolsPorLinea = Object.fromEntries(LINEAS.map((l) => [l, poolDeLinea(heroes, lineas, l)]));
  return {
    heroes, lineas, frecuencias, rango: rangoUsado, meta: metaCtx, poolsPorLinea,
    porNombre: new Map(heroes.map((h) => [h.name, h])),
    catalogo, crudo: meta,
  };
}

/** Los héroes de una lista de nombres guardados; los que ya no existen se ignoran. */
export const resolverNombres = (datos, nombres = []) => nombres.map((n) => datos.porNombre.get(n)).filter(Boolean);

/** El pool de tu línea. */
export const poolDe = (datos, linea) => (linea ? datos.poolsPorLinea[linea] ?? [] : []);

/**
 * Por qué líneas enemigas falta alguien: por ahí va el término «por ver» del
 * modelo y por ahí se simulan los finales. Con los cinco a la vista, ninguna.
 */
export function lineasEnemigasAbiertas(datos, enemigos = []) {
  if (!enemigos.length || enemigos.length >= 5) return [];
  const ocupadas = new Set(lineasOcupadas(enemigos, datos.lineas, datos.frecuencias));
  return LINEAS.filter((l) => !ocupadas.has(l));
}

/**
 * El rival de tu línea: lo marcado a mano manda; si no, se deduce del mejor
 * reparto de los enemigos (y se calla cuando no está claro).
 */
export function rivalDeLinea(datos, { linea, enemigos = [], marcado = null } = {}) {
  const valido = marcado && enemigos.some((h) => h.name === marcado) ? marcado : null;
  if (valido) return { nombre: valido, marcado: true };
  return { nombre: detectarRivalDeLinea(enemigos, datos.lineas, linea, datos.frecuencias), marcado: false };
}

/** Lo que recibe `ordenarPicks` para este draft. Los candidatos son los héroes que el enemigo aún podría elegir. */
export function contextoDe(datos, { enemigos = [], aliados = [], baneos = [], maestria = null, lineasAbiertas = null } = {}) {
  const cogidos = new Set([...enemigos, ...aliados, ...baneos].map((h) => h.name));
  return {
    enemigos, aliados, baneos, maestria,
    meta: datos.meta,
    lineas: datos.lineas,
    lineasAbiertas: lineasAbiertas ?? lineasEnemigasAbiertas(datos, enemigos),
    poolsPorLinea: datos.poolsPorLinea,
    candidatos: datos.heroes.filter((h) => !cogidos.has(h.name)),
  };
}

/** El ranking de tu línea para este draft. */
export function ordenar(datos, { linea, ...draft }) {
  return ordenarPicks(poolDe(datos, linea), contextoDe(datos, draft));
}

/** La probabilidad de ganar con UN héroe concreto (el que apuntas, aunque no sea el nº1). */
export function estimarCon(datos, { yo, enemigos = [], aliados = [], baneos = [], maestria = null }) {
  return evaluarDraft({
    aliados, yo, enemigos, baneos, maestria,
    meta: datos.meta, lineas: datos.lineas,
    lineasAbiertas: lineasEnemigasAbiertas(datos, enemigos), poolsPorLinea: datos.poolsPorLinea,
  });
}

/** ¿Aguanta el nº1 lo que falta por salir? Solo con el draft a medias. */
export function simular(datos, { linea, enemigos = [], aliados = [], baneos = [], maestria = null, n, semilla } = {}) {
  const pool = poolDe(datos, linea);
  if (!enemigos.length || enemigos.length >= 5 || !pool.length) return null;
  return simularFinales({
    pool, enemigos, aliados, lineasAbiertas: lineasEnemigasAbiertas(datos, enemigos), poolsPorLinea: datos.poolsPorLinea,
    ctx: { meta: datos.meta, maestria, baneos, lineas: datos.lineas },
    ...(n ? { n } : {}), ...(semilla != null ? { semilla } : {}),
  });
}

/** Qué tiene y qué le falta a cada equipo, contigo (tu nº1) dentro. */
export function composicionDe({ aliados = [], enemigos = [], yo = null } = {}) {
  return (aliados.length || enemigos.length) && yo ? analizarComposicion({ aliados, yo, enemigos }) : null;
}

/** Qué pueden coger tus compañeros. Solo con algún enemigo a la vista: sin rival no es un consejo contra nadie. */
export function aconsejar(datos, { linea, yo = null, enemigos = [], aliados = [], baneos = [], lineasAbiertas = null } = {}) {
  if (!yo || !enemigos.length) return [];
  return aconsejarEquipo({
    heroes: datos.heroes, lineas: datos.lineas, frecuencias: datos.frecuencias, miLinea: linea, yo,
    enemigos, aliados, baneos, meta: datos.meta,
    lineasAbiertas: lineasAbiertas ?? lineasEnemigasAbiertas(datos, enemigos), poolsPorLinea: datos.poolsPorLinea,
  });
}

/** A quién banear por tu equipo. */
export function baneosSugeridos(datos, { aliados = [], enemigos = [], baneos = [] } = {}) {
  return datos.meta.stats ? sugerirBaneos(datos.heroes, { aliados, enemigos, baneos, meta: datos.meta }) : [];
}

/** El siguiente baneo probable en tu rango, con la co-ocurrencia de TUS partidas. */
export function siguientesBaneos(datos, { baneos = [], enemigos = [], aliados = [], partidas = [], historial = null, n = 10 } = {}) {
  if (!datos.meta.stats) return [];
  return proximosBaneos(datos.heroes, { baneos, enemigos, aliados, meta: datos.meta, historial: historial ?? coocurrenciaDeBaneos(partidas), n });
}

/**
 * Todo de una vez, para quien no tiene render que cuidar (diagnóstico, bot,
 * paridad, pruebas). Devuelve lo mismo que la app calcula pieza a pieza.
 *
 * @param {Datos} datos
 * @param {object} draft  { linea, enemigos, aliados, baneos, maestria, rivalMarcado, conSimulacion }
 */
export function recomendar(datos, { linea, enemigos = [], aliados = [], baneos = [], maestria = null, rivalMarcado = null, conSimulacion = true } = {}) {
  const pool = poolDe(datos, linea);
  const lineasAbiertas = lineasEnemigasAbiertas(datos, enemigos);
  const ranking = ordenarPicks(pool, contextoDe(datos, { enemigos, aliados, baneos, maestria, lineasAbiertas }));
  const empate = empatados(ranking);
  const rival = rivalDeLinea(datos, { linea, enemigos, marcado: rivalMarcado });
  const yo = ranking[0]?.heroe ?? null;
  const robustez = conSimulacion ? simular(datos, { linea, enemigos, aliados, baneos, maestria }) : null;
  const composicion = composicionDe({ aliados, enemigos, yo });
  const consejos = aconsejar(datos, { linea, yo, enemigos, aliados, baneos, lineasAbiertas });
  const analisis = analizarDraft({ ranking, enemigos, aliados, meta: datos.meta, rivalDeLinea: rival.nombre, empate, robustez, composicion });
  return {
    pool, lineasAbiertas, ranking, empate, rival, robustez, composicion, consejos, analisis,
    baneosSugeridos: baneosSugeridos(datos, { aliados, enemigos, baneos }),
    cobertura: cobertura(pool, datos.meta.stats, datos.meta.counters),
  };
}
