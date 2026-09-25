import { indexarPorNombre, nombreClave, buscar } from './nombres.js';
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
import { elegirVentana, elegirRango, mediaDeWinrate } from './ventana.js';

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
  // Y el RANGO del que sale: el tuyo, salvo que sea Gloria y Gloria tenga
  // tan pocas partidas que no se parezca a Mítico (reinicio de temporada,
  // ventana.js). `rango` sigue siendo el tuyo: es lo que se apunta en cada
  // partida y lo que eliges; `meta.fuerza` dice de dónde sale la fuerza.
  const porRango = Object.fromEntries(Object.entries(meta?.statsByRank ?? {}).map(([r, s]) => [r, indexarPorNombre(s)]));
  const fuerza = elegirRango(porRango, rangoUsado);
  const semana = porRango[fuerza.rango] ?? indexarPorNombre(meta?.stats);
  const recientes = meta?.recientes?.statsByRank?.[fuerza.rango] ? indexarPorNombre(meta.recientes.statsByRank[fuerza.rango]) : null;
  const { stats, ventana } = elegirVentana(semana, recientes, meta?.recientes?.dias ?? 3);
  const poolsPorLinea = Object.fromEntries(LINEAS.map((l) => [l, poolDeLinea(heroes, lineas, l)]));
  const metaCtx = {
    stats,
    statsSemana: semana,
    ventana,
    fuerza,
    // El winrate de cada héroe EN CADA LÍNEA (3.12.0), por clave normalizada.
    // Se ENSEÑA, no puntúa: medido en 3.11.0, no mejora la predicción sobre
    // el global de la misma ventana. Su ventana es de ~15–30 días del rango
    // de la ingesta (Gloria), no la de la fuerza.
    winrateLinea: indexarPorNombre(meta?.winrateLinea),
    counters: indexarPorNombre(meta?.counters, 2),
    synergies: indexarPorNombre(meta?.synergies, 2),
    // Lo que cabe esperar de equilibrio de daño en un equipo de n héroes,
    // uno por línea (modelo.js, terminoEquilibrio): centra el término a
    // medias. Con las líneas, no con cinco al azar de los 133: las líneas
    // no reparten el daño igual y un equipo real mezcla más.
    equilibrioEsperado: equilibrioEsperado(heroes, stats, poolsPorLinea),
    // El centro del término de héroe es la media de LA MISMA ventana y
    // PONDERADA por cuota de pick (ventana.js). Hasta 3.7.1 con la de 7 días
    // se usaba `avgByRank` de la ingesta, que es la media simple de los 133:
    // 0,482 frente a 0,502, y cada héroe visto sumaba +0,09 de logit. La
    // ingesta sigue escribiendo `avgByRank`, pero ya no decide nada.
    mediaDelRango: mediaDeWinrate(stats),
  };
  return {
    heroes, lineas, frecuencias, rango: rangoUsado, meta: metaCtx, poolsPorLinea,
    porNombre: new Map(heroes.map((h) => [h.name, h])),
    catalogo, crudo: meta,
  };
}

/** El winrate de un héroe en una línea (0..1) o null si la API no lo da. El único sitio que lo lee. */
export function winrateEnLinea(datos, heroe, linea) {
  const v = buscar(datos?.meta?.winrateLinea ?? {}, heroe?.name ?? heroe)?.[linea];
  return typeof v === 'number' && v > 0 && v < 1 ? v : null;
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
 * Tu pick, del que hablan el análisis, la composición y el consejo a los
 * compañeros: el que has FIJADO («Lo cojo», 3.5.0) si está en el ranking, y
 * si no el nº1. Antes todo lo posterior al pick hablaba del nº1 aunque
 * cogieras el nº2 (nº1 y nº2 empatan en uno de cada cuatro drafts).
 */
export function eleccionDe(ranking, miPick = null) {
  if (miPick) {
    const c = ranking.find((r) => r.heroe === miPick || r.heroe.name === miPick.name);
    if (c) return c;
  }
  return ranking[0] ?? null;
}

/**
 * Tu plan antes de que salga nadie: los mejores de tu línea con el draft
 * vacío (fuerza general y tu maestría), con su tasa de ban. Para la fase de
 * baneos: la mitad de las veces el plan A llega baneado (Marcel 55%, Gloo
 * 51% de ban en Gloria) y conviene saberlo antes de los 30 segundos.
 */
export function planDePicks(datos, { linea, maestria = null, n = 3 } = {}) {
  return ordenar(datos, { linea, maestria }).slice(0, n)
    .map((c) => ({ heroe: c.heroe, p: c.p, banRate: datos.meta.stats?.[nombreClave(c.heroe.name)]?.banRate ?? null }));
}

/**
 * Todo de una vez, para quien no tiene render que cuidar (diagnóstico, bot,
 * paridad, pruebas). Devuelve lo mismo que la app calcula pieza a pieza.
 *
 * @param {Datos} datos
 * @param {object} draft  { linea, enemigos, aliados, baneos, maestria, rivalMarcado, miPick, conSimulacion }
 */
export function recomendar(datos, { linea, enemigos = [], aliados = [], baneos = [], maestria = null, rivalMarcado = null, miPick = null, conSimulacion = true } = {}) {
  const pool = poolDe(datos, linea);
  const lineasAbiertas = lineasEnemigasAbiertas(datos, enemigos);
  const ranking = ordenarPicks(pool, contextoDe(datos, { enemigos, aliados, baneos, maestria, lineasAbiertas }));
  const empate = empatados(ranking);
  const rival = rivalDeLinea(datos, { linea, enemigos, marcado: rivalMarcado });
  const eleccion = eleccionDe(ranking, miPick);
  const yo = eleccion?.heroe ?? null;
  const robustez = conSimulacion ? simular(datos, { linea, enemigos, aliados, baneos, maestria }) : null;
  const composicion = composicionDe({ aliados, enemigos, yo });
  const consejos = aconsejar(datos, { linea, yo, enemigos, aliados, baneos, lineasAbiertas });
  const analisis = analizarDraft({ eleccion, ranking, enemigos, aliados, baneos, meta: datos.meta, rivalDeLinea: rival.nombre, empate, robustez, composicion });
  return {
    pool, lineasAbiertas, ranking, empate, rival, eleccion, robustez, composicion, consejos, analisis,
    baneosSugeridos: baneosSugeridos(datos, { aliados, enemigos, baneos }),
    cobertura: cobertura(pool, datos.meta.stats, datos.meta.counters),
  };
}
