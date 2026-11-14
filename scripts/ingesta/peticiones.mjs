/**
 * Lo que se pide a la API, recurso a recurso. Cada función devuelve lo que
 * llegó y su diagnóstico; quien llama decide qué se conserva.
 */

import { buscarRecurso, callRoute } from './descarga.mjs';
import { extraerLineas, extraerRol, leerFicha, leerObjetos, leerTalentos, recogerBuilds, recogerCurva, recogerWinrateLinea } from './extraccion.mjs';
import { NAME_KEYS, asRate, idPrincipal, pick } from './relaciones.mjs';
import { LINEAS } from '../../src/motor/catalogo.js';

const round4 = (v) => Math.round(v * 1e4) / 1e4;
const pares = (m) => Object.values(m).reduce((n, porLinea) => n + Object.keys(porLinea).length, 0);

/** La lista de héroes con su id, rol y líneas (varias por héroe). Sin esquema, a ciegas. */
export async function pedirLista(ctx) {
  const valores = { size: 300, index: 1, page_size: 300, page_index: 1, lang: 'en' };
  const { rows } = ctx.rutas?.position
    ? await callRoute(ctx.rutas.position, valores)
    : await buscarRecurso(ctx, ['/hero-position/', '/hero-position', '/hero-list/'], valores);
  const heroes = [];
  for (const row of rows) {
    const name = pick(row, NAME_KEYS);
    if (!name) continue;
    heroes.push({
      name: String(name).trim(),
      id: idPrincipal(row),
      role: String(pick(row, ['role', 'hero_role', 'primary_role']) ?? '').toLowerCase() || extraerRol(row),
      lanes: extraerLineas(row),
    });
  }
  return heroes;
}

/**
 * Las estadísticas de un rango a `dias`. Una ventana distinta de la de
 * siempre que la API no aceptó es un error, no «3 días» con los de 7 [C].
 */
export async function pedirEstadisticas(ctx, rank, dias = ctx.op.dias) {
  const valores = {
    days: dias, past_days: dias, rank, rank_id: rank,
    size: 200, index: 1, page_size: 200, page_index: 1,
    sort_field: 'win_rate', sort_order: 'desc', order: 'desc', lang: 'en',
  };
  const { rows, sin = [] } = ctx.rutas?.rank
    ? await callRoute(ctx.rutas.rank, valores)
    : await buscarRecurso(ctx, ['/hero-rank/', '/hero-rank', '/hero-rate/'], valores);
  if (dias !== ctx.op.dias && (sin.includes('days') || sin.includes('past_days'))) throw new Error(`la API no acepta days=${dias}`);
  const stats = {};
  for (const row of rows) {
    const name = pick(row, NAME_KEYS);
    if (!name) continue;
    stats[String(name).trim()] = {
      winRate: asRate(pick(row, ['win_rate', 'winRate', 'main_hero_win_rate'])),
      pickRate: asRate(pick(row, ['pick_rate', 'pickRate', 'main_hero_appearance_rate'])),
      banRate: asRate(pick(row, ['ban_rate', 'banRate', 'main_hero_ban_rate'])),
      heroId: idPrincipal(row),
    };
  }
  return stats;
}

/** La ficha de cada héroe (por id o nombre), una petición cada uno. `{ fichas, errores }`; no lanza. */
export async function pedirFichas(ctx, heroes) {
  const fichas = {};
  const errores = [];
  if (!ctx.rutas?.detail || !heroes.length) return { fichas, errores };
  for (const h of heroes) {
    try {
      const { data } = await callRoute(ctx.rutas.detail, { lang: 'en' }, h.id ?? h.name);
      fichas[h.name] = leerFicha(data);
    } catch (err) {
      if (errores.length < 4) errores.push(`${h.name}: ${err.message}`);
    }
    await ctx.sleep(250);
  }
  return { fichas, errores };
}

/**
 * El catálogo de objetos de TODAS las rutas candidatas, campo a campo (la
 * larga trae la defensa, la corta los 184). `{ equipo, rutas, caidas }`, o
 * `{ equipo: {} }` sin ruta en el esquema; una ruta caída no tumba a las otras.
 */
export async function pedirEquipo(ctx) {
  if (!ctx.rutas?.equipment) return { equipo: {} };
  const rutas = [ctx.rutas.equipment, ...(ctx.rutas.equipment.alternativas ?? [])];
  const equipo = {};
  let caidas = 0;
  for (const ruta of rutas) {
    let rows;
    try {
      ({ rows } = await callRoute(ruta, { size: 300, index: 1, lang: 'en' }));
    } catch {
      caidas += 1;
      continue;
    }
    leerObjetos(rows, equipo);
    await ctx.sleep(200);
  }
  return { equipo, rutas: rutas.length, caidas };
}

/** Los talentos de los emblemas, una petición (lanza si falla). */
export async function pedirTalentos(ctx) {
  if (!ctx.rutas?.talentos) return {};
  const { rows } = await callRoute(ctx.rutas.talentos, { size: 300, index: 1, lang: 'en' });
  return leerTalentos(rows);
}

/** Una petición por héroe y por línea que juega (no las 665: la build de jungla de un support es ruido) [D]. */
async function porHeroeYLinea(ctx, ruta, heroes, leer) {
  const errores = [];
  let pedidas = 0;
  for (const h of heroes) {
    for (const lane of (h.lanes ?? []).filter((l) => LINEAS.includes(l))) {
      pedidas += 1;
      try {
        const { data } = await callRoute(ruta, { lane, rank: ctx.op.rank, lang: 'en', size: 20, index: 1 }, h.id ?? h.name);
        leer(h.name, lane, data);
      } catch (err) {
        if (errores.length < 4) errores.push(`${h.name}/${lane}: ${err.message}`);
      }
      await ctx.sleep(200);
    }
  }
  return { pedidas, errores };
}

/** Las builds por héroe y línea, tal como se juegan en el rango (no causales: la app lo dice) [D]. `{ builds, diag }`. */
export async function pedirBuilds(ctx, heroes) {
  const builds = {};
  if (!ctx.rutas?.builds) return { builds, diag: null };
  const { pedidas, errores } = await porHeroeYLinea(ctx, ctx.rutas.builds, heroes, (n, lane, data) => {
    const lista = recogerBuilds(data);
    if (lista.length) (builds[n] ??= {})[lane] = lista;
  });
  const total = Object.values(builds).reduce((a, porLinea) => a + Object.values(porLinea).reduce((b, l) => b + l.length, 0), 0);
  return { builds, diag: { pedidas, heroes: Object.keys(builds).length, builds: total, errores } };
}

/**
 * El winrate de cada héroe en cada línea (`total_win_rate`) y la curva por
 * duración de la MISMA respuesta. Se enseñan, no puntúan [M]. `{ winrate,
 * curvas, diag }`.
 */
export async function pedirLineas(ctx, heroes) {
  const winrate = {};
  const curvas = {};
  if (!ctx.rutas?.lineas) return { winrate, curvas, diag: null };
  const { pedidas, errores } = await porHeroeYLinea(ctx, ctx.rutas.lineas, heroes, (n, lane, data) => {
    const wr = recogerWinrateLinea(data);
    if (wr != null) (winrate[n] ??= {})[lane] = round4(wr);
    const curva = recogerCurva(data);
    if (curva) (curvas[n] ??= {})[lane] = curva;
  });
  return { winrate, curvas, diag: { pedidas, heroes: Object.keys(winrate).length, valores: pares(winrate), curvas: pares(curvas), errores } };
}
