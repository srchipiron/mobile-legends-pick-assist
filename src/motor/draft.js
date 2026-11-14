import { indexarPorNombre, nombreClave, buscar } from './nombres.js';
import { fundirCatalogo, LINEAS, poolDeLinea, equilibrioEsperado } from './catalogo.js';
import { indiceDeLineas, frecuenciaDeRoles, lineasOcupadas, detectarRivalDeLinea } from './lineas.js';
import { cobertura, cruce, sinergia, mediaDeSinergia, CRUCE_DESTACABLE, CRUCE_MALO, PAREJA_DESTACABLE } from './matrices.js';
import { ordenarPicks, empatados, MARGEN_EMPATE } from './ranking.js';
import { evaluarDraft } from './modelo.js';
import { sugerirBaneos, proximosBaneos, coocurrenciaDeBaneos } from './baneos.js';
import { simularFinales } from './robustez.js';
import { aconsejarEquipo } from './equipo.js';
import { analizarComposicion } from './composicion.js';
import { analizarDraft, BRECHA_CLARA } from './analisis.js';
import { esPrevia, esSupuesta, compararProporciones, conResultado } from './registro.js';
import { planDePartida } from './plan.js';
import { elegirVentana, elegirRango, mediaDeWinrate, RANGO_DE_RESPALDO, tiersVigentes } from './ventana.js';
import { movimientos } from './tendencia.js';
import { centroDeFases, fasesDePartida } from './fases.js';
import { DIA_MS } from './estadistica.js';

export { tiersVigentes, TIERS_CADUCAN_DIAS } from './ventana.js';

/**
 * EL cerebro: de los ficheros de datos y el draft a todo lo que enseñan la app, la
 * tablet, el diagnóstico y los scripts. Un solo sitio decide cómo se indexa el
 * meta, qué rango y qué ventana mandan, cómo se resuelven los nombres y qué líneas
 * están abiertas (dos montajes distintos ya hicieron que la app decidiera con uno
 * y la vigilancia con otro). Las piezas van separadas porque la app memoriza cada
 * una (el ranking con cada toque; la simulación y el consejo, diferidos);
 * `recomendar` las junta para quien no tiene render que cuidar.
 *
 * @typedef {object} Datos
 * @property {object[]} heroes       catálogo fundido con la API
 * @property {Map} lineas            clave → { role, lanes }
 * @property {object} frecuencias    { linea: { rol: 0..1 } }
 * @property {string|null} rango     el rango elegido (el que se apunta en cada partida)
 * @property {object} meta           el contexto del modelo, indexado por clave
 * @property {object} poolsPorLinea  { linea: héroes que se juegan ahí }
 * @property {Map} porNombre         nombre tal cual → héroe
 * @property {object|null} catalogo  heroes.json tal cual
 * @property {object|null} crudo     roam-meta.json tal cual
 */

/** El rango pedido si está descargado; si no, el de la ingesta; si no, el primero que haya. */
export function rangoActivo(meta, rango = null) {
  const disponibles = meta?.statsByRank ?? {};
  if (rango && disponibles[rango]) return rango;
  if (meta?.rank && disponibles[meta.rank]) return meta.rank;
  return Object.keys(disponibles)[0] ?? meta?.rank ?? rango ?? null;
}

/**
 * Se prepara UNA vez por carga. La fuerza sale del rango que aguanta (Gloria o su
 * respaldo) y de la ventana más corta que aguanta (3 o 7 días); cruces y parejas a
 * 7, del rango que decidió la ingesta. El centro del término de héroe es la media
 * PONDERADA de la misma ventana.
 * @returns {Datos}
 */
export function prepararDatos({ catalogo = null, meta = null, rango = null } = {}) {
  const heroes = catalogo ? fundirCatalogo(catalogo.heroes, meta?.heroes) : [];
  const lineas = indiceDeLineas(meta?.heroes);
  const rangoUsado = rangoActivo(meta, rango);
  const porRango = Object.fromEntries(Object.entries(meta?.statsByRank ?? {}).map(([r, s]) => [r, indexarPorNombre(s)]));
  const fuerza = elegirRango(porRango, rangoUsado);
  const semana = porRango[fuerza.rango] ?? indexarPorNombre(meta?.stats);
  const recientes = meta?.recientes?.statsByRank?.[fuerza.rango] ? indexarPorNombre(meta.recientes.statsByRank[fuerza.rango]) : null;
  const { stats, ventana } = elegirVentana(semana, recientes, meta?.recientes?.dias ?? 3);
  const poolsPorLinea = Object.fromEntries(LINEAS.map((l) => [l, poolDeLinea(heroes, lineas, l)]));
  return {
    heroes,
    lineas,
    frecuencias: frecuenciaDeRoles(meta?.heroes ?? []),
    rango: rangoUsado,
    meta: {
      stats,
      statsSemana: semana,
      ventana,
      fuerza,
      relaciones: meta?.relaciones ?? null,
      // Se ENSEÑAN, no puntúan: el winrate por línea y la curva por duración (fases).
      winrateLinea: indexarPorNombre(meta?.winrateLinea),
      curvaLinea: indexarPorNombre(meta?.curvaLinea),
      centroDeFases: meta?.curvaLinea ? centroDeFases(meta.curvaLinea, meta.winrateLinea, stats) : null,
      counters: indexarPorNombre(meta?.counters, 2),
      synergies: indexarPorNombre(meta?.synergies, 2),
      equilibrioEsperado: equilibrioEsperado(heroes, stats, poolsPorLinea),
      mediaDelRango: mediaDeWinrate(stats),
      tocados: indexarPorNombre(meta?.tocados) ?? {},
      days: Number.isFinite(meta?.days) ? meta.days : null,
    },
    poolsPorLinea,
    porNombre: new Map(heroes.map((h) => [h.name, h])),
    catalogo,
    crudo: meta,
  };
}

/** El winrate de un héroe en una línea (0..1) o null. El único acceso. */
export function winrateEnLinea(datos, heroe, linea) {
  const v = buscar(datos?.meta?.winrateLinea ?? {}, heroe?.name ?? heroe)?.[linea];
  return typeof v === 'number' && v > 0 && v < 1 ? v : null;
}

/**
 * `{fecha, dias, quedan}` si la ingesta vio cambiar sus habilidades hace menos de la
 * ventana de los datos (`days`, 7): su winrate y sus cruces aún mezclan días de
 * antes. Se ENSEÑA. null sin `ahora` (el motor no mira el reloj).
 */
export function tocadoPorElParche(datos, heroe, ahora) {
  const fecha = buscar(datos?.meta?.tocados ?? {}, heroe?.name ?? heroe);
  if (!Number.isFinite(ahora) || typeof fecha !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(fecha)) return null;
  const dias = Math.floor((ahora - Date.parse(`${fecha}T00:00:00Z`)) / DIA_MS);
  const ventana = Number.isFinite(datos?.meta?.days) && datos.meta.days > 0 ? datos.meta.days : 7;
  return dias >= 0 && dias < ventana ? { fecha, dias, quedan: ventana - dias } : null;
}

/** Los héroes de unos nombres guardados (por nombre tal cual); los que ya no existen se ignoran. */
export const resolverNombres = (datos, nombres = []) => nombres.map((n) => datos.porNombre.get(n)).filter(Boolean);
export const poolDe = (datos, linea) => (linea ? datos.poolsPorLinea[linea] ?? [] : []);

/** Por qué líneas enemigas falta alguien (con 0 o con los cinco, ninguna). */
export function lineasEnemigasAbiertas(datos, enemigos = []) {
  if (!enemigos.length || enemigos.length >= 5) return [];
  const ocupadas = new Set(lineasOcupadas(enemigos, datos.lineas, datos.frecuencias));
  return LINEAS.filter((l) => !ocupadas.has(l));
}

/** El rival de tu línea: el marcado a mano manda; si no, el mejor reparto (que se calla si no está claro). */
export function rivalDeLinea(datos, { linea, enemigos = [], marcado = null } = {}) {
  if (marcado && enemigos.some((h) => h.name === marcado)) return { nombre: marcado, marcado: true };
  return { nombre: detectarRivalDeLinea(enemigos, datos.lineas, linea, datos.frecuencias), marcado: false };
}

/** Lo que recibe `ordenarPicks`. Candidatos: los que el enemigo aún podría elegir. */
export function contextoDe(datos, { enemigos = [], aliados = [], baneos = [], lineasAbiertas = null } = {}) {
  const cogidos = new Set([...enemigos, ...aliados, ...baneos].map((h) => h.name));
  return {
    enemigos, aliados, baneos,
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

/** La probabilidad con UN héroe concreto (el que apuntas, aunque no sea el nº1). */
export function estimarCon(datos, { yo, enemigos = [], aliados = [], baneos = [] }) {
  return evaluarDraft({
    aliados, yo, enemigos, baneos, meta: datos.meta, lineas: datos.lineas,
    lineasAbiertas: lineasEnemigasAbiertas(datos, enemigos), poolsPorLinea: datos.poolsPorLinea,
  });
}

/** ¿Aguanta el nº1 lo que falta por salir? Solo con el draft a medias. */
export function simular(datos, { linea, enemigos = [], aliados = [], baneos = [], n, semilla } = {}) {
  const pool = poolDe(datos, linea);
  if (!enemigos.length || enemigos.length >= 5 || !pool.length) return null;
  return simularFinales({
    pool, enemigos, aliados, lineasAbiertas: lineasEnemigasAbiertas(datos, enemigos), poolsPorLinea: datos.poolsPorLinea,
    ctx: { meta: datos.meta, baneos, lineas: datos.lineas },
    ...(n ? { n } : {}), ...(semilla != null ? { semilla } : {}),
  });
}

/** Qué tiene y qué le falta a cada equipo contigo dentro. */
export function composicionDe({ aliados = [], enemigos = [], yo = null } = {}) {
  return (aliados.length || enemigos.length) && yo ? analizarComposicion({ aliados, yo, enemigos }) : null;
}

/** Qué pueden coger tus compañeros. Solo con algún enemigo: sin rival no es un consejo contra nadie. */
export function aconsejar(datos, { linea, yo = null, enemigos = [], aliados = [], baneos = [], lineasAbiertas = null } = {}) {
  if (!yo || !enemigos.length) return [];
  return aconsejarEquipo({
    heroes: datos.heroes, lineas: datos.lineas, frecuencias: datos.frecuencias, miLinea: linea, yo,
    enemigos, aliados, baneos, meta: datos.meta,
    lineasAbiertas: lineasAbiertas ?? lineasEnemigasAbiertas(datos, enemigos), poolsPorLinea: datos.poolsPorLinea,
  });
}

/** [P] Suelo de la cuota de un héroe con sus líneas ocupadas: queda detrás, no desaparece (con 0,001 da igual). */
const SUELO_LINEA_CERRADA = 0.05;

/**
 * El orden de las caras en el selector: cuota de pick × (suelo + la parte de sus
 * líneas que ese equipo aún tiene libre; para tu equipo, sin tu línea). [M] En los
 * drafts de Javi el que salió cae entre las 12 primeras en el 33 % de los enemigos
 * y el 45 % de los compañeros (cuota sola: 22 % y 14 %; disponibilidad, peor).
 * @returns {Array} todos los héroes, ordenados (copia)
 */
export function probablesDelBando(datos, { equipo = [], linea = null, bando = 'enemigos' } = {}) {
  const candidatas = bando === 'aliados' && linea ? LINEAS.filter((l) => l !== linea) : LINEAS;
  const ocupadas = new Set(lineasOcupadas(equipo, datos.lineas, datos.frecuencias, candidatas));
  const libres = new Set(candidatas.filter((l) => !ocupadas.has(l)));
  const suyas = Object.fromEntries(LINEAS.map((l) => [l, new Set((datos.poolsPorLinea?.[l] ?? []).map((h) => h.name))]));
  const nota = (h) => {
    const ls = LINEAS.filter((l) => suyas[l].has(h.name));
    if (!ls.length) return 0;
    return (buscar(datos.meta.stats, h.name)?.pickRate ?? 0) * (SUELO_LINEA_CERRADA + ls.filter((l) => libres.has(l)).length / ls.length);
  };
  const notas = new Map(datos.heroes.map((h) => [h.name, nota(h)]));
  return [...datos.heroes].sort((a, b) => notas.get(b.name) - notas.get(a.name) || a.name.localeCompare(b.name));
}

/** Para los baneos tu pick fijado es de tu equipo (si no, se proponía banearlo: 34 de 1.500 drafts). */
const conTuPick = (aliados, miPick) => (miPick && !aliados.some((a) => a.name === miPick.name) ? [...aliados, miPick] : aliados);

/** A quién banear por tu equipo. */
export function baneosSugeridos(datos, { aliados = [], enemigos = [], baneos = [], miPick = null } = {}) {
  return datos.meta.stats ? sugerirBaneos(datos.heroes, { aliados: conTuPick(aliados, miPick), enemigos, baneos, meta: datos.meta }) : [];
}

/** El siguiente baneo probable en tu rango, con la co-ocurrencia de TUS partidas. */
export function siguientesBaneos(datos, { baneos = [], enemigos = [], aliados = [], miPick = null, partidas = [], historial = null, n = 10 } = {}) {
  if (!datos.meta.stats) return [];
  return proximosBaneos(datos.heroes, { baneos, enemigos, aliados: conTuPick(aliados, miPick), meta: datos.meta, historial: historial ?? coocurrenciaDeBaneos(partidas), n });
}

/** De quién se habla (análisis, composición, consejo, plan, apuntar): tu pick fijado si está en el ranking; si no, el nº1. */
export function eleccionDe(ranking, miPick = null) {
  if (miPick) {
    const c = ranking.find((r) => r.heroe === miPick || r.heroe.name === miPick.name);
    if (c) return c;
  }
  return ranking[0] ?? null;
}

/** Los mejores de tu línea con el draft vacío y su tasa de ban: el plan de la fase de baneos. */
export function planDePicks(datos, { linea, n = 3 } = {}) {
  return ordenar(datos, { linea }).slice(0, n)
    .map((c) => ({ heroe: c.heroe, p: c.p, banRate: datos.meta.stats?.[nombreClave(c.heroe.name)]?.banRate ?? null }));
}

/**
 * El plan de partida de UN héroe (consejo, no nota). Los compañeros se reparten
 * SIN tu línea y el rival va EN tu línea (repartidos todos, el marcado caía en
 * otra en el 4 % de los drafts y su curva era la de esa otra).
 */
export function planear(datos, { yo = null, aliados = [], enemigos = [], linea = null, baneos = [], rivalMarcado = null } = {}) {
  if (!yo) return planDePartida({ yo, aliados, enemigos, meta: datos.meta });
  const mia = linea ?? datos.lineas.get(nombreClave(yo.name))?.lanes?.[0] ?? null;
  const companeros = aliados.filter((a) => a.name !== yo.name);
  const lineasNos = lineasOcupadas(companeros, datos.lineas, datos.frecuencias, LINEAS.filter((l) => l !== mia));
  const rival = mia ? rivalDeLinea(datos, { linea: mia, enemigos, marcado: rivalMarcado }).nombre : null;
  const otros = enemigos.filter((e) => e.name !== rival);
  const lineasOtros = lineasOcupadas(otros, datos.lineas, datos.frecuencias, rival ? LINEAS.filter((l) => l !== mia) : undefined);
  const lineasEllos = enemigos.map((e) => (e.name === rival ? mia : lineasOtros[otros.indexOf(e)]));
  const estimacion = (aliados.length || enemigos.length) ? estimarCon(datos, { yo, enemigos, aliados: companeros, baneos }) : null;
  const fases = estimacion ? fasesDePartida({
    pBase: estimacion.p,
    nos: [{ heroe: yo, linea: mia }, ...companeros.map((h, i) => ({ heroe: h, linea: lineasNos[i] ?? null }))],
    ellos: enemigos.map((h, i) => ({ heroe: h, linea: lineasEllos[i] ?? null })),
    datosFases: { curvaLinea: datos.meta.curvaLinea, winrateLinea: datos.meta.winrateLinea, centro: datos.meta.centroDeFases },
  }) : null;
  const plan = planDePartida({ yo, aliados, enemigos, meta: datos.meta, fases, rival: enemigos.find((e) => e.name === rival) ?? null });
  return { ...plan, cruces: crucesDelDraft(datos, { yo, enemigos, aliados: companeros }) };
}

/**
 * El cruce de tu héroe con CADA enemigo y la pareja con CADA compañero, con los
 * cortes de siempre (p90/p10 de los cruces; `PAREJA_DESTACABLE` y su simétrico
 * respecto al centro). Es el dato que ya puntúa, enseñado entero.
 */
export function crucesDelDraft(datos, { yo = null, enemigos = [], aliados = [] } = {}) {
  if (!yo || !datos?.meta) return { contra: [], con: [] };
  const contra = enemigos
    .map((e) => ({ nombre: e.name, pct: cruce(datos.meta.counters, yo.name, e.name) }))
    .filter((x) => Number.isFinite(x.pct))
    .sort((a, b) => b.pct - a.pct)
    .map((x) => ({ ...x, lado: x.pct >= CRUCE_DESTACABLE ? 'gana' : x.pct <= CRUCE_MALO ? 'pierde' : 'parejo' }));
  const centro = mediaDeSinergia(datos.meta.synergies, datos.lineas, datos.meta.stats ?? null);
  const con = aliados
    .filter((a) => nombreClave(a.name) !== nombreClave(yo.name))
    .map((a) => ({ nombre: a.name, s: sinergia(datos.meta.synergies, yo.name, a.name) }))
    .filter((x) => Number.isFinite(x.s))
    .sort((a, b) => b.s - a.s)
    .map((x) => ({ nombre: x.nombre, puntos: Math.round((x.s - centro) * 1000) / 10, lado: x.s >= PAREJA_DESTACABLE ? 'bien' : x.s <= 2 * centro - PAREJA_DESTACABLE ? 'mal' : 'parejo' }));
  return { contra, con };
}

/** Todo de una vez (tablet, diagnóstico, scripts, pruebas): lo mismo que la app calcula pieza a pieza. */
export function recomendar(datos, { linea, enemigos = [], aliados = [], baneos = [], rivalMarcado = null, miPick = null, conSimulacion = true } = {}) {
  const pool = poolDe(datos, linea);
  const lineasAbiertas = lineasEnemigasAbiertas(datos, enemigos);
  const ranking = ordenarPicks(pool, contextoDe(datos, { enemigos, aliados, baneos, lineasAbiertas }));
  const empate = empatados(ranking);
  const rival = rivalDeLinea(datos, { linea, enemigos, marcado: rivalMarcado });
  const eleccion = eleccionDe(ranking, miPick);
  const yo = eleccion?.heroe ?? null;
  const robustez = conSimulacion ? simular(datos, { linea, enemigos, aliados, baneos }) : null;
  const composicion = composicionDe({ aliados, enemigos, yo });
  return {
    pool, lineasAbiertas, ranking, empate, rival, eleccion, robustez, composicion,
    consejos: aconsejar(datos, { linea, yo, enemigos, aliados, baneos, lineasAbiertas }),
    analisis: analizarDraft({ eleccion, ranking, enemigos, aliados, baneos, meta: datos.meta, rivalDeLinea: rival.nombre, empate, robustez, composicion }),
    partida: planear(datos, { yo, aliados, enemigos, linea, baneos, rivalMarcado }),
    baneosSugeridos: baneosSugeridos(datos, { aliados, enemigos, baneos, miPick }),
    cobertura: cobertura(pool, datos.meta.stats, datos.meta.counters),
  };
}

/**
 * Un draft ya jugado, con los datos de HOY: ¿había en tu línea un pick mejor? Una
 * lectura a toro pasado (al elegir faltaban enemigos), con los márgenes del ranking.
 * null sin draft con línea o sin poder puntuar.
 */
export function revisarPartida(datos, partida) {
  const d = partida?.draft;
  if (!d?.linea || !partida.pick) return null;
  const enemigos = resolverNombres(datos, d.enemigos ?? []);
  const aliados = resolverNombres(datos, d.aliados ?? []);
  const baneos = resolverNombres(datos, partida.bans ?? []);
  const [yo] = resolverNombres(datos, [partida.pick]);
  if (!yo || !enemigos.length) return null;
  const ranking = ordenar(datos, { linea: d.linea, enemigos, aliados, baneos });
  if (!ranking.length) return null;
  const i = ranking.findIndex((r) => nombreClave(r.heroe.name) === nombreClave(yo.name));
  // Fuera del ranking (otra línea, o baneado en el draft guardado), aparte.
  const mio = i >= 0 ? ranking[i].p : estimarCon(datos, { yo, enemigos, aliados, baneos })?.p;
  if (!(mio > 0 && mio < 1)) return null;
  const mejor = ranking[0];
  const dif = Math.max(0, mejor.p - mio);
  const veredicto = i === 0 || dif < MARGEN_EMPATE ? 'bien' : dif * 100 >= BRECHA_CLARA ? 'mejor' : 'poco';
  return {
    t: partida.t, gane: partida.gane, pick: yo.name, puesto: i >= 0 ? i + 1 : null, de: ranking.length,
    p: mio, mejor: veredicto === 'bien' ? null : { heroe: mejor.heroe.name, p: mejor.p }, dif, veredicto,
  };
}

/** [P] Partidas de cada lado para comparar si las de «había uno claramente mejor» se perdieron más. */
const MINIMO_PARA_COMPARAR = 10;

/** Todas tus partidas con draft, revisadas (sin previas ni supuestas; la comparación, solo con resultado fiable). */
export function revisarDrafts(datos, partidas = []) {
  const filas = partidas.filter((p) => !esPrevia(p) && !esSupuesta(p))
    .map((p) => { const f = revisarPartida(datos, p); return f && { ...f, fiable: conResultado(p) }; })
    .filter(Boolean);
  const n = filas.length;
  if (!n) return { n: 0, filas };
  const claro = filas.filter((f) => f.veredicto === 'mejor' && f.fiable);
  const resto = filas.filter((f) => f.veredicto !== 'mejor' && f.fiable);
  const wr = (l) => l.filter((f) => f.gane).length / l.length;
  const comparacion = claro.length >= MINIMO_PARA_COMPARAR && resto.length >= MINIMO_PARA_COMPARAR
    ? { nClaro: claro.length, wrClaro: wr(claro), nResto: resto.length, wrResto: wr(resto), ...compararProporciones(wr(claro), claro.length, wr(resto), resto.length) }
    : null;
  return { n, filas, bien: filas.filter((f) => f.veredicto === 'bien').length, claro: claro.length, difMedia: filas.reduce((a, f) => a + f.dif, 0) / n, comparacion };
}

/** Quién sube y quién baja esta semana en el rango de la fuerza, confirmado por su par. Con `linea`, solo su pool. */
export function movimientosDelMeta(datos, { linea = null } = {}) {
  const crudo = datos?.crudo ?? {};
  const rango = datos?.meta?.fuerza?.rango ?? datos?.rango;
  const par = Object.entries(RANGO_DE_RESPALDO).find(([a, b]) => a === rango || b === rango);
  const otro = par ? (par[0] === rango ? par[1] : par[0]) : null;
  const hoy = typeof crudo.generatedAt === 'string' ? crudo.generatedAt.slice(0, 10) : null;
  const r = movimientos({ historia: crudo.historia, statsByRank: crudo.statsByRank, hoy, rango, otro });
  const salida = { ...r, rango, otro };
  if (!linea) return salida;
  const enLinea = new Set(poolDe(datos, linea).map((h) => nombreClave(h.name)));
  const filtrar = (l) => l.filter((f) => enLinea.has(nombreClave(f.heroe)));
  return { ...salida, suben: filtrar(r.suben), bajan: filtrar(r.bajan) };
}

/** [P] Cuántos en cada lista de la ficha: lo que cabe de un vistazo en el móvil. */
export const POR_FICHA = 5;

/**
 * La ficha de un héroe: lo que el motor ya sabe de él (por clave). Las parejas,
 * solo con quien juega alguna línea distinta (dos de la misma no coinciden).
 */
export function fichaDeHeroe(datos, nombre, { n = POR_FICHA, ahora = null } = {}) {
  const clave = nombreClave(nombre ?? '');
  const heroe = (datos?.heroes ?? []).find((h) => nombreClave(h.name) === clave);
  if (!heroe) return null;
  const stats = datos.meta?.stats ?? {};
  const lineasDe = (h) => LINEAS.filter((l) => poolDe(datos, l).some((x) => x.name === h.name));
  const suyas = lineasDe(heroe);
  const otros = datos.heroes.filter((h) => h.name !== heroe.name && buscar(stats, h.name));
  const cruces = otros.map((e) => ({ heroe: e, valor: cruce(datos.meta?.counters, heroe.name, e.name) })).filter((x) => Number.isFinite(x.valor)).sort((a, b) => b.valor - a.valor);
  const parejas = otros.filter((a) => lineasDe(a).some((l) => !suyas.includes(l)))
    .map((a) => ({ heroe: a, valor: sinergia(datos.meta?.synergies, heroe.name, a.name) })).filter((x) => Number.isFinite(x.valor)).sort((a, b) => b.valor - a.valor);
  const mov = movimientosDelMeta(datos);
  const stat = buscar(stats, heroe.name) ?? null;
  return {
    heroe,
    stat: stat ? { winRate: stat.winRate ?? null, pickRate: stat.pickRate ?? null, banRate: stat.banRate ?? null } : null,
    rango: datos.meta?.fuerza?.rango ?? datos.rango,
    lineas: suyas.map((l) => ({ linea: l, winRate: winrateEnLinea(datos, heroe, l) })),
    leGanaA: cruces.slice(0, n),
    leGanan: cruces.slice(-n).reverse(),
    combinaCon: parejas.slice(0, n),
    peorCon: parejas.slice(-n).reverse(),
    tier: tiersVigentes(datos.crudo)?.[heroe.name] ?? null,
    tendencia: [...(mov.suben ?? []), ...(mov.bajan ?? [])].find((f) => nombreClave(f.heroe) === clave)?.dif ?? null,
    parche: tocadoPorElParche(datos, heroe, ahora),
  };
}
