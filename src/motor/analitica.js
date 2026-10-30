import { esPrevia, esSupuesta, compararProporciones } from './registro.js';
import { wilson } from './habitos.js';
import { nombreClave } from './nombres.js';

/**
 * La analítica de tus partidas (3.88.0). Javi: «haz que la app sirva como
 * dashboard de partidas, estadísticas, con qué juego mejor… la tablet lee
 * todo y lleva los datos a la app, que los analiza y los interpreta».
 *
 * Lo que ya había se queda donde estaba y se reutiliza (`tusNumeros`,
 * `tuSemana`, `resumen`); aquí va lo que faltaba: la evolución semana a
 * semana, con quién ganas y contra quién pierdes, por línea y por día. Las
 * reglas son las del Veredicto: cada número con su intervalo, y «mejor» o
 * «peor» que tu media solo si el intervalo la deja fuera. Puro: el reloj y
 * el día de la semana se inyectan.
 */

// Decisión de producto: doce semanas son un trimestre, lo que cabe en el ancho de un móvil.
export const SEMANAS_EN_LA_EVOLUCION = 12;
const SEMANA_MS = 7 * 24 * 60 * 60 * 1000;
// Decisión de producto: un compañero o un rival sale desde 8 partidas con él
// (con 8, el intervalo de Wilson ya es ±30 puntos: menos es una anécdota).
export const MINIMO_CON_UNO = 8;
// Decisión de producto: cuántos compañeros y rivales se enseñan por lista.
export const CUANTOS_POR_LISTA = 5;
// Decisión de producto: una línea o un día de la semana sale desde 10 partidas (`MINIMO_POR_GRUPO` de habitos).
export const MINIMO_POR_GRUPO = 10;

/** Las partidas que cuentan: apuntadas con la app (las previas no tienen hora ni draft), con resultado. */
export const partidasValidas = (partidas = []) => (partidas ?? [])
  .filter((p) => p && !esPrevia(p) && Number.isFinite(p.t) && typeof p.gane === 'boolean')
  .sort((a, b) => a.t - b.t);

const ganadas = (lista) => lista.filter((p) => p.gane).length;
const conIntervalo = (g, n, media) => {
  const ic = wilson(g, n);
  return { n, ganadas: g, wr: g / n, ...ic, lado: media == null ? null : ic.bajo > media ? 'mejor' : ic.alto < media ? 'peor' : null };
};

/**
 * Semana a semana, de la más vieja a la más nueva: la semana `i` son los 7
 * días que acaban `i` semanas antes de `ahora` (no semanas de calendario: así
 * la última siempre es «los últimos 7 días», como en «Tu semana»). Las
 * semanas sin partidas salen con `n: 0` y `wr: null`, para que el hueco se vea.
 */
export function evolucion(partidas = [], { ahora = Date.now(), semanas = SEMANAS_EN_LA_EVOLUCION } = {}) {
  const lista = partidasValidas(partidas).filter((p) => p.t <= ahora);
  const cubos = Array.from({ length: semanas }, (_, i) => ({ hasta: ahora - (semanas - 1 - i) * SEMANA_MS, partidas: [] }));
  for (const p of lista) {
    const atras = Math.floor((ahora - p.t) / SEMANA_MS);
    if (atras < semanas) cubos[semanas - 1 - atras].partidas.push(p);
  }
  return cubos.map((c) => ({ desde: c.hasta - SEMANA_MS, hasta: c.hasta, n: c.partidas.length, ganadas: ganadas(c.partidas), wr: c.partidas.length ? ganadas(c.partidas) / c.partidas.length : null }));
}

/**
 * Con quién ganas (`lado: 'aliados'`) o contra quién (`'enemigos'`): para
 * cada héroe que salió en ese equipo al menos `minimo` veces, tu winrate con
 * él ahí, su intervalo y si se distingue de tu media. Por clave de nombre.
 * Las de pick supuesto cuentan (el draft es el leído; lo dudoso era TU héroe).
 * Devuelve los `cuantos` mejores y peores por el borde del intervalo (el bajo
 * para los mejores, el alto para los peores: con pocas partidas no se adelanta
 * a uno de 8 de 8 sobre uno de 18 de 22).
 */
export function porCompaneros(partidas = [], { lado = 'aliados', minimo = MINIMO_CON_UNO, cuantos = CUANTOS_POR_LISTA } = {}) {
  const lista = partidasValidas(partidas).filter((p) => Array.isArray(p.draft?.[lado]));
  const media = lista.length ? ganadas(lista) / lista.length : null;
  const porHeroe = new Map();
  for (const p of lista) {
    const vistos = new Set();
    for (const nombre of p.draft[lado]) {
      const clave = nombreClave(nombre);
      if (!clave || vistos.has(clave)) continue;
      vistos.add(clave);
      if (!porHeroe.has(clave)) porHeroe.set(clave, { heroe: nombre, n: 0, g: 0 });
      const h = porHeroe.get(clave); h.n++; if (p.gane) h.g++;
    }
  }
  const todos = [...porHeroe.values()].filter((h) => h.n >= minimo).map((h) => ({ heroe: h.heroe, ...conIntervalo(h.g, h.n, media) }));
  return {
    partidas: lista.length,
    media,
    heroes: todos.length,
    mejores: [...todos].sort((a, b) => b.bajo - a.bajo || b.n - a.n).slice(0, cuantos),
    peores: [...todos].sort((a, b) => a.alto - b.alto || b.n - a.n).slice(0, cuantos),
  };
}

/**
 * Por grupo (línea, día de la semana…): cada uno contra el resto, con el
 * error agrupado de `compararProporciones`, desde `MINIMO_POR_GRUPO` partidas
 * en el grupo y en el resto. `clave(p)` da el grupo o null.
 */
function porGrupo(lista, clave, { minimo = MINIMO_POR_GRUPO, orden = null } = {}) {
  const grupos = new Map();
  for (const p of lista) {
    const k = clave(p);
    if (k == null) continue;
    if (!grupos.has(k)) grupos.set(k, []);
    grupos.get(k).push(p);
  }
  const conGrupo = [...grupos.values()].flat();
  return [...grupos.entries()]
    .map(([id, g]) => {
      const resto = conGrupo.filter((p) => !g.includes(p));
      if (g.length < minimo || resto.length < minimo) return null;
      const a = ganadas(g) / g.length, b = ganadas(resto) / resto.length;
      return { id, n: g.length, wr: a, nResto: resto.length, wrResto: b, ...compararProporciones(a, g.length, b, resto.length) };
    })
    .filter(Boolean)
    .sort(orden ?? ((x, y) => y.n - x.n));
}

/** Por la línea del draft. */
export const porLinea = (partidas = []) => porGrupo(partidasValidas(partidas), (p) => (typeof p.draft?.linea === 'string' ? p.draft.linea : null));

const diaLocal = (t) => new Date(t).getDay();
/** Por día de la semana (0 domingo … 6 sábado), con la hora local inyectable. */
// De lunes a domingo, como se lee una semana en España.
const deLunes = (d) => (d + 6) % 7;
export const porDia = (partidas = [], { dia = diaLocal } = {}) => porGrupo(partidasValidas(partidas), (p) => dia(p.t), { orden: (x, y) => deLunes(x.id) - deLunes(y.id) });

/** Siguiendo la app (tu pick entre sus tres) o por libre, y con su nº1 exacto: lo que pasó, con su intervalo. */
export function conLaApp(partidas = []) {
  const lista = partidasValidas(partidas).filter((p) => !esSupuesta(p) && Array.isArray(p.recomendados) && p.recomendados.length && nombreClave(p.pick));
  const media = lista.length ? ganadas(lista) / lista.length : null;
  const de = (filtro) => { const l = lista.filter(filtro); return l.length ? conIntervalo(ganadas(l), l.length, null) : null; };
  const pick = (p) => nombreClave(p.pick);
  return {
    n: lista.length,
    media,
    numeroUno: de((p) => nombreClave(p.recomendados[0]) === pick(p)),
    entreLosTres: de((p) => p.recomendados.slice(0, 3).some((r) => nombreClave(r) === pick(p))),
    porLibre: de((p) => !p.recomendados.slice(0, 3).some((r) => nombreClave(r) === pick(p))),
  };
}
