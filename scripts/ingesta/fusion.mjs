/**
 * Lo que se conserva de la corrida anterior y lo que eso le hace a las
 * fechas. Todo puro salvo `leerPrevio`: la fecha de hoy se pasa.
 */

import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { RAIZ } from './contexto.mjs';
import { LINEAS, huellaDeKit } from '../../src/motor/catalogo.js';
import { HISTORIA_DIAS } from '../../src/motor/tendencia.js';

/** Los campos que la ingesta ya no escribe: un fichero de antes de 4.0 los trae y no se arrastran [C]. */
export function sinCamposMuertos(previo) {
  if (!previo || typeof previo !== 'object') return previo;
  const sinMatches = (stats) => (stats && typeof stats === 'object'
    ? Object.fromEntries(Object.entries(stats).map(([n, s]) => [n, s && typeof s === 'object' ? (({ matches, ...r }) => r)(s) : s]))
    : stats);
  const { roamCoverage, patchAvgWinRate, ...limpio } = previo;
  if (Array.isArray(limpio.heroes)) limpio.heroes = limpio.heroes.map((h) => (h && typeof h === 'object' ? (({ lane, ...r }) => r)(h) : h));
  if (limpio.stats) limpio.stats = sinMatches(limpio.stats);
  if (limpio.statsByRank) limpio.statsByRank = Object.fromEntries(Object.entries(limpio.statsByRank).map(([r, s]) => [r, sinMatches(s)]));
  return limpio;
}

/**
 * Lo anterior sale de los DATOS GUARDADOS (`--previo`, public/data, `--out`):
 * los workflows escriben a un temporal que no existe, y «conservar» la nada
 * tiraba la corrida por un fallo suelto [C].
 */
export async function leerPrevio(op) {
  for (const ruta of [op.previo, resolve(RAIZ, 'public/data/roam-meta.json'), op.out].filter(Boolean)) {
    try {
      return sinCamposMuertos(JSON.parse(await readFile(ruta, 'utf8')));
    } catch { /* primera corrida, o salida a un temporal */ }
  }
  return null;
}

const noVacia = (v) => Array.isArray(v) && v.length > 0;
const esTexto = (v) => typeof v === 'string' && v !== '';
/** Lo que la ficha de un héroe conserva de la corrida anterior si hoy no llega, por nombre [D]. */
const DE_LA_FICHA = { damage: Boolean, habilidades: noVacia, retrato: Boolean, cara: Boolean, speciality: noVacia, kitTexto: esTexto, kitCifras: esTexto };

/** Cada héroe hereda de la corrida anterior lo de su ficha; devuelve los nombres que ya tenían daño. */
export function conservarFichas(heroList, previous) {
  const antes = previous?.heroes ?? [];
  for (const [campo, vale] of Object.entries(DE_LA_FICHA)) {
    const previos = new Map(antes.filter((h) => vale(h?.[campo])).map((h) => [h.name, h[campo]]));
    for (const h of heroList) if (previos.has(h.name)) h[campo] = previos.get(h.name);
  }
  return new Set(antes.filter((h) => h?.damage).map((h) => h.name));
}

/**
 * `{ héroe: { línea: valor } }` fundido PAR A PAR (winrate y curva por línea,
 * builds): lo de hoy manda, lo que falla hoy se conserva, y solo en las
 * líneas que el héroe juega HOY [C].
 */
export function fundirPorHeroeYLinea(previo = {}, fresco = {}, heroList = []) {
  const valores = {};
  let conservados = 0;
  for (const h of heroList) {
    for (const lane of (h.lanes ?? []).filter((l) => LINEAS.includes(l))) {
      const nuevo = fresco?.[h.name]?.[lane];
      const viejo = previo?.[h.name]?.[lane];
      if (nuevo != null) (valores[h.name] ??= {})[lane] = nuevo;
      else if (viejo != null) { (valores[h.name] ??= {})[lane] = viejo; conservados += 1; }
    }
  }
  return { valores, conservados };
}

/**
 * Los objetos. Sin NINGUNA defensa en lo fresco, la ruta larga no respondió:
 * cada objeto conserva defensa y tipo y junta sus efectos [M]. Con alguna ruta
 * caída (`completo: false`) se conservan los guardados que hoy no llegan; con
 * todas respondiendo, el que falta se quita (Moonton retira objetos) [M].
 */
export function fundirEquipo(previo = {}, fresco = {}, { completo = true } = {}) {
  if (!Object.keys(fresco ?? {}).length) return { equipo: previo ?? {}, conservados: Object.keys(previo ?? {}).length };
  const faltan = completo ? [] : Object.keys(previo ?? {}).filter((id) => !(id in fresco));
  const conFaltan = (equipo, conservados) => {
    for (const id of faltan) equipo[id] = previo[id];
    return { equipo, conservados: conservados + faltan.length };
  };
  if (Object.values(fresco).some((o) => o?.magica || o?.fisica)) return conFaltan({ ...fresco }, 0);
  const equipo = {};
  let conservados = 0;
  for (const [id, o] of Object.entries(fresco)) {
    const viejo = previo?.[id];
    if (!(viejo?.magica || viejo?.fisica || viejo?.efectos?.length || viejo?.tipo)) { equipo[id] = o; continue; }
    const efectos = [...new Set([...(viejo.efectos ?? []), ...(o.efectos ?? [])])];
    equipo[id] = { ...o, tipo: o.tipo ?? viejo.tipo ?? null, ...(viejo.magica ? { magica: viejo.magica } : {}), ...(viejo.fisica ? { fisica: viejo.fisica } : {}), ...(efectos.length ? { efectos } : {}) };
    conservados += 1;
  }
  return conFaltan(equipo, conservados);
}

const matricesDe = (previous) => ({ counters: { ...(previous?.counters ?? {}) }, synergies: { ...(previous?.synergies ?? {}) } });
const llena = (fila) => Object.keys(fila ?? {}).length > 0;

/** Una fila nueva con menos de la mitad de celdas que la guardada no la sustituye (sana: cambia en 1-2 héroes) [M]. */
export const esCorta = (fila, previa) => Object.keys(fila ?? {}).length < Object.keys(previa ?? {}).length / 2;

/**
 * La matriz de la corrida: sin ninguna fila de cruces nueva, la guardada TAL
 * CUAL (`conservado`, con su etiqueta); con filas de OTRO rango que el de la
 * guardada se empieza de cero (no se funden rangos); lo corto se mide contra
 * lo guardado aunque sea de otro rango [C]. Luego se cose (`recoser`).
 */
export function relacionesDeLaCorrida(previous, elegidas, rango) {
  if (!Object.values(elegidas?.counters ?? {}).some(llena)) return { relations: matricesDe(previous), frescas: 0, frescasParejas: 0, conservado: true };
  const rangoPrevio = previous?.relaciones?.rango ?? previous?.rank ?? null;
  const relations = rangoPrevio && rangoPrevio !== rango ? { counters: {}, synergies: {} } : matricesDe(previous);
  const guardada = matricesDe(previous);
  let frescas = 0, frescasParejas = 0, cortas = 0, cortasParejas = 0;
  for (const [nombre, fila] of Object.entries(elegidas.counters)) {
    if (!llena(fila)) continue;
    const parejas = elegidas.synergies?.[nombre] ?? {};
    if (llena(parejas)) {
      if (esCorta(parejas, guardada.synergies?.[nombre])) cortasParejas += 1;
      else { relations.synergies[nombre] = parejas; frescasParejas += 1; }
    }
    if (esCorta(fila, guardada.counters?.[nombre])) { cortas += 1; continue; }
    relations.counters[nombre] = fila;
    frescas += 1;
  }
  const recosidas = recoser(relations, elegidas);
  return { relations, frescas, frescasParejas, cortas, cortasParejas, recosidas, conservado: frescas === 0 && frescasParejas === 0 };
}

/**
 * Cose las filas conservadas a las frescas: los cruces son antisimétricos y
 * las parejas simétricas [M], así que la celda de una fila de ayer contra un
 * héroe de hoy sale de la fila de hoy. Solo celdas que ya existían; las filas
 * se copian antes de tocarlas. Devuelve cuántas celdas cambió.
 */
export function recoser(relations, fresh) {
  const frescas = (m, f) => new Set(Object.keys(f ?? {}).filter((n) => m[n] === f[n]));
  const a4 = (v) => Math.round(v * 10000) / 10000;
  let celdas = 0;
  const coser = (matriz, hoy, valor) => {
    for (const [x, fila] of Object.entries(matriz)) {
      if (hoy.has(x) || !fila) continue;
      const nueva = { ...fila };
      let cambio = false;
      for (const y of hoy) {
        const suya = matriz[y]?.[x];
        if (x !== y && y in nueva && Number.isFinite(suya) && nueva[y] !== valor(suya)) { nueva[y] = valor(suya); celdas += 1; cambio = true; }
      }
      if (cambio) matriz[x] = nueva;
    }
  };
  coser(relations.counters, frescas(relations.counters, fresh?.counters), (v) => a4(1 - v));
  coser(relations.synergies, frescas(relations.synergies, fresh?.synergies), (v) => v);
  return celdas;
}

/** Fresca si llegó casi entera, cruces Y parejas: el 90 %, el mismo listón que el respaldo [M]. */
export function frescura(relaciones, pedidas, parejas = relaciones) {
  return {
    frescosRecursos: { relaciones, parejas, pedidas },
    matrizNueva: pedidas ? relaciones / pedidas >= 0.9 && parejas / pedidas >= 0.9 : false,
  };
}

/** ¿Se descargaron las estadísticas que DECIDEN, las del rango pedido y las de su respaldo? [C] */
export function estadisticasFrescas(frescos, rango, respaldo) {
  return frescos.includes(rango) && (!respaldo || frescos.includes(respaldo));
}

/** `generatedAt` sigue a las ESTADÍSTICAS: sin las que deciden, la fecha de lo conservado [C]. */
export function fechaDeLaCorrida({ estadisticasNuevas, previous, ahora = new Date().toISOString() }) {
  return estadisticasNuevas ? ahora : (previous?.generatedAt ?? null);
}

/** La matriz lleva su fecha: nueva, ahora; conservada, la de la guardada (o su `generatedAt` si es de antes de la marca) [C]. */
export function fechaDeLaMatriz({ matrizNueva, previous, ahora = new Date().toISOString() }) {
  if (matrizNueva) return ahora;
  return previous?.relaciones?.descargada ?? previous?.generatedAt ?? null;
}

/**
 * Héroes cuyo kit cambió desde que se les escribieron los tags a mano (la
 * huella está en heroes.json: el aviso persiste hasta que alguien los mire).
 * Sin speciality no se avisa: una ficha caída no es un rework [D].
 */
export function kitsRehechos(heroList = [], catalogo = []) {
  const escrito = new Map(catalogo.filter((h) => h?.kit).map((h) => [h.name, h.kit]));
  return heroList
    .filter((h) => escrito.has(h?.name) && (h.speciality ?? []).length)
    .map((h) => ({ name: h.name, antes: escrito.get(h.name), ahora: huellaDeKit(h) }))
    .filter((x) => x.antes !== x.ahora);
}

/** Más de esta parte de los kits a la vez no es un parche, es la API reescribiendo textos (el del 11-11 tocó 32/133) [M]. */
export const PARCHE_MAX_PROPORCION = 0.5;

const ES_FECHA = /^\d{4}-\d{2}-\d{2}$/;
const dia = (f) => Date.parse(`${f}T00:00:00Z`);
const fechaValida = (f) => typeof f === 'string' && ES_FECHA.test(f) && Number.isFinite(dia(f));

/**
 * Los tocados por el parche: `{ nombre: 'AAAA-MM-DD' }` desde el día en que su
 * `kitCifras` dejó de ser la guardada, durante `dias` (la ventana de los
 * datos). Solo compara héroes con huella hoy y en lo guardado [D].
 */
export function anotarParche(previous, heroList = [], fecha, { dias = 7, maxProporcion = PARCHE_MAX_PROPORCION } = {}) {
  const antes = new Map((previous?.heroes ?? []).filter((h) => typeof h?.kitCifras === 'string').map((h) => [h.name, h.kitCifras]));
  const comparables = heroList.filter((h) => typeof h?.kitCifras === 'string' && antes.has(h.name));
  let cambiados = comparables.filter((h) => antes.get(h.name) !== h.kitCifras).map((h) => h.name);
  const reescrito = comparables.length > 0 && cambiados.length > comparables.length * maxProporcion;
  if (reescrito) cambiados = [];
  const tocados = {};
  if (fechaValida(fecha)) {
    for (const [nombre, f] of Object.entries(previous?.tocados ?? {})) {
      if (fechaValida(f) && dia(fecha) - dia(f) < dias * 864e5 && dia(fecha) >= dia(f)) tocados[nombre] = f;
    }
    for (const n of cambiados) tocados[n] = fecha;
  }
  const ordenado = Object.fromEntries(Object.entries(tocados).sort(([a], [b]) => a.localeCompare(b)));
  return { tocados: ordenado, cambiados, reescrito, comparables: comparables.length };
}

/**
 * La historia de la fuerza: una foto por día UTC de los rangos `rangos`
 * DESCARGADOS hoy (`[wr a 3 decimales, pick a 4]`, 0 < wr < 1); la misma
 * fecha se funde y lo de más de `dias` se cae [C].
 */
export function anotarHistoria(previa, statsByRank = {}, frescos = [], fecha, { rangos = [], dias = HISTORIA_DIAS } = {}) {
  const porFecha = new Map();
  for (const e of (Array.isArray(previa) ? previa : []).filter((x) => x && typeof x.fecha === 'string' && ES_FECHA.test(x.fecha))) porFecha.set(e.fecha, { ...e });
  const historia = [...porFecha.values()];
  const foto = {};
  for (const rango of rangos.filter((r) => frescos.includes(r))) {
    const fila = {};
    for (const [heroe, s] of Object.entries(statsByRank?.[rango] ?? {})) {
      const wr = Number(s?.winRate); const pick = Number(s?.pickRate);
      if (Number.isFinite(wr) && wr > 0 && wr < 1) fila[heroe] = [Math.round(wr * 1e3) / 1e3, Number.isFinite(pick) ? Math.round(pick * 1e4) / 1e4 : 0];
    }
    if (Object.keys(fila).length) foto[rango] = fila;
  }
  if (Object.keys(foto).length && ES_FECHA.test(fecha ?? '')) {
    const i = historia.findIndex((e) => e.fecha === fecha);
    if (i >= 0) historia[i] = { ...historia[i], ...foto };
    else historia.push({ fecha, ...foto });
  }
  const ultima = historia.map((e) => e.fecha).sort().at(-1);
  if (!ultima) return [];
  const limite = new Date(dia(ultima) - (dias - 1) * 864e5).toISOString().slice(0, 10);
  return historia.filter((e) => e.fecha >= limite).sort((a, b) => a.fecha.localeCompare(b.fecha));
}
