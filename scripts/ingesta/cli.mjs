/**
 * La corrida: descubre las rutas, pide cada recurso conservando lo anterior
 * cuando algo falla, baja las imágenes y escribe el JSON. Aquí no se decide
 * nada sobre la forma de las respuestas. La ingesta NO falla por un endpoint
 * caído: sale con 0 salvo un error de programación [C].
 */

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { DIAS_RECIENTES, RAIZ, crearContexto, leerOpciones } from './contexto.mjs';
import { esFalloDePaso } from './descarga.mjs';
import { descubrirRutas, medirRutas } from './descubrimiento.mjs';
import { pedirBuilds, pedirEquipo, pedirEstadisticas, pedirFichas, pedirLineas, pedirLista, pedirTalentos } from './peticiones.mjs';
import { pedirRelaciones } from './relaciones.mjs';
import {
  anotarHistoria, anotarParche, conservarFichas, estadisticasFrescas, fechaDeLaCorrida, fechaDeLaMatriz, frescura,
  fundirEquipo, fundirPorHeroeYLinea, kitsRehechos, leerPrevio, relacionesDeLaCorrida,
} from './fusion.mjs';
import { bajarImagenes } from './imagenes.mjs';
import { pedirTiers } from './tiers.mjs';
import { serializar } from './salida.mjs';
import { nombreClave } from '../../src/motor/nombres.js';
import { LINEAS, fundirCatalogo } from '../../src/motor/catalogo.js';
import { elegirRangoDeRelaciones } from '../../src/motor/ventana.js';

/** Esperas antes de volver a pedir los rangos que dieron un fallo de paso: ratos de «Error 1101» de ~1 min [M]. */
export const REINTENTOS_ESTADISTICAS_MS = [20000, 60000];
/** Espera antes de pedir otra vez el respaldo de los cruces si cayó entero y el pedido no [M]. */
export const REINTENTO_RESPALDO_MS = 60000;
/** El 90 % de los héroes pedidos: el listón de «llegó casi entero» (frescura y respaldo) [D]. */
const CASI_ENTERO = 0.9;

const ahora = () => new Date().toISOString();
const paresDe = (m) => Object.values(m ?? {}).reduce((n, porLinea) => n + Object.keys(porLinea ?? {}).length, 0);
const filasCon = (m) => Object.values(m?.counters ?? {}).filter((f) => Object.keys(f ?? {}).length).length;
const media = (stats) => {
  const r = Object.values(stats).map((s) => s.winRate).filter((n) => n != null);
  return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0.5;
};

/** El paso que, si falla, deja lo de antes: devuelve lo que dio `intento` o `undefined` (y lo dice). */
async function intentar(nombre, intento) {
  try {
    return await intento();
  } catch (err) {
    console.warn(`  · ${nombre}: fallo (${err.message}); se conserva lo anterior`);
    return undefined;
  }
}

/** Las estadísticas de cada rango a `dias`; los fallos de paso se repiten (2 vueltas). No lanza. */
async function estadisticasConReintento(ctx, dias) {
  const datos = {};
  const fallos = {};
  const alPrincipio = new Set();
  let pendientes = [...ctx.op.ranks];
  let vueltas = 0;
  for (;;) {
    for (const rank of pendientes) {
      try { datos[rank] = await pedirEstadisticas(ctx, rank, dias); delete fallos[rank]; } catch (err) { fallos[rank] = err; if (!vueltas) alPrincipio.add(rank); }
      await ctx.sleep(250);
    }
    pendientes = pendientes.filter((r) => fallos[r] && esFalloDePaso(fallos[r]));
    if (!pendientes.length || vueltas >= REINTENTOS_ESTADISTICAS_MS.length) break;
    console.log(`  · estadísticas a ${dias} días: ${pendientes.join(', ')} fallaron; las pido otra vez en ${REINTENTOS_ESTADISTICAS_MS[vueltas] / 1000} s`);
    await ctx.sleep(REINTENTOS_ESTADISTICAS_MS[vueltas]);
    vueltas += 1;
  }
  const reintento = vueltas ? { vueltas, recuperados: [...alPrincipio].filter((r) => datos[r]), sinRecuperar: [...alPrincipio].filter((r) => !datos[r]) } : null;
  // Por rango: `${n} héroes` o el fallo, en el orden de `ranks`.
  const textos = Object.fromEntries(ctx.op.ranks.map((r) => [r, datos[r] ? `${Object.keys(datos[r]).length} héroes` : `fallo: ${fallos[r].message.slice(0, 120)}`]));
  return { datos, fallos, reintento, textos };
}

/**
 * Cruces y parejas del rango pedido y, si trajo algo, de su respaldo; la
 * guarda de rango (ventana.js) decide cuál se queda. Si el pedido llegó casi
 * entero y el respaldo no, el respaldo se pide UNA vez más [M].
 */
async function relacionesDeRango(ctx, nombres, stats, heroList, previous, remedir) {
  const { op } = ctx;
  const minimas = Math.ceil(CASI_ENTERO * nombres.length);
  const guarda = (o) => elegirRangoDeRelaciones({
    rango: op.rank, filasMinimas: minimas, ultima: previous?.relaciones?.ultima ?? null, fecha: ahora(), ...(op.celdas != null ? { minimo: op.celdas } : {}), ...o,
  });
  const pedido = await pedirRelaciones(ctx, nombres, stats, heroList, op.rank, { remedir });
  const r = { elegidas: pedido, rango: { rango: op.rank, pedido: op.rank, coherencia: null, motivo: null }, diag: pedido.diag, respaldoReintentado: null };
  // Sin nada del pedido no se pide el respaldo: no hay con qué comparar [C].
  if (!op.respaldo || !filasCon(pedido)) return r;
  try {
    let otras = await pedirRelaciones(ctx, nombres, stats, heroList, op.respaldo, { remedir });
    // El diagnóstico es el de la ÚLTIMA pasada del respaldo, la elegida o no.
    let diagRespaldo = otras.diag;
    if (filasCon(pedido) >= minimas && filasCon(otras) < minimas) {
      const antes = filasCon(otras);
      console.log(`  · ${op.respaldo}: ${antes} de ${nombres.length} para comprobar ${op.rank}; lo pido otra vez en ${REINTENTO_RESPALDO_MS / 1000} s`);
      await ctx.sleep(REINTENTO_RESPALDO_MS);
      const otraVez = await pedirRelaciones(ctx, nombres, stats, heroList, op.respaldo, { remedir });
      diagRespaldo = otraVez.diag;
      if (filasCon(otraVez) > antes) otras = otraVez;
      r.respaldoReintentado = { antes, despues: filasCon(otras) };
    }
    r.rango = guarda({ pedidas: pedido, respaldo: otras });
    if (r.rango.rango === op.respaldo) { r.elegidas = otras; r.diag = diagRespaldo; }
  } catch (err) {
    const sin = guarda({ pedidas: pedido, respaldo: null });
    r.rango = { ...sin, motivo: `${sin.motivo}: ${err.message}` };
    // Sin respaldo y con la última comprobación diciendo que el pedido está roto, no entra nada nuevo.
    if (r.rango.rango === op.respaldo) r.elegidas = { counters: {}, synergies: {} };
  }
  const c = r.rango.coherencia;
  console.log(`  · cruces y parejas de ${r.rango.rango}${c ? ` (r con ${op.respaldo}: cruces ${c.counters?.toFixed(2) ?? '-'}, parejas ${c.synergies?.toFixed(2) ?? '-'})` : ''}${r.rango.motivo ? `: ${r.rango.motivo}` : ''}`);
  return r;
}

export async function main(argv = process.argv.slice(2)) {
  const op = leerOpciones(argv);
  const ctx = crearContexto(op);
  console.log(`Ingesta MLBB · rangos=${op.ranks.join(',')} · ventana=${op.dias}d`);

  const descubierto = await descubrirRutas(ctx);
  ctx.rutas = descubierto.rutas;
  if (ctx.rutas) for (const [k, r] of Object.entries(ctx.rutas)) console.log(`  · ${k}: ${r.method} ${r.template}`);
  else console.warn('  · no se pudo leer el esquema; pruebo rutas conocidas a ciegas');

  const catalogo = JSON.parse(await readFile(resolve(RAIZ, 'public/data/heroes.json'), 'utf8'));
  const previous = await leerPrevio(op);

  // La lista y las fichas: cada héroe conserva lo suyo si hoy no llega.
  const lista = await intentar('lista de héroes', () => pedirLista(ctx));
  const heroList = lista?.length ? lista : (previous?.heroes ?? []);
  if (lista) console.log(`  · lista completa: ${heroList.length} héroes`);
  const conDanoAntes = conservarFichas(heroList, previous);
  const fichas = await intentar('fichas', () => pedirFichas(ctx, heroList));
  for (const h of heroList) Object.assign(h, fichas?.fichas[h.name]);
  const leidas = Object.values(fichas?.fichas ?? {});
  const speciality = { pedidos: heroList.length, ok: leidas.filter((f) => f.speciality).length, errores: fichas?.errores ?? [] };
  const dano = { ok: leidas.filter((f) => f.damage).length, conservados: heroList.filter((h) => h.damage && conDanoAntes.has(h.name)).length, sin: heroList.filter((h) => !h.damage).length };
  if (fichas) console.log(`  · fichas: ${leidas.length}/${heroList.length} heroes`);
  console.log(`  · tipo de dano: ${heroList.length - dano.sin}/${heroList.length} heroes`);

  // Cruces de TODOS los héroes (la app recomienda para las cinco líneas), con el mismo catálogo que la app.
  const nombresPedir = [...new Set(fundirCatalogo(catalogo.heroes, heroList).map((h) => h.name))];
  console.log(`  · ${nombresPedir.length} heroes a los que pedir counters`);

  // Estadísticas: los rangos que fallan conservan lo anterior; `frescos` decide la fecha.
  const statsByRank = { ...(previous?.statsByRank ?? {}) };
  const frescos = [];
  const semana = await estadisticasConReintento(ctx, op.dias);
  for (const rank of op.ranks) {
    const s = semana.datos[rank];
    if (s && Object.keys(s).length) { statsByRank[rank] = s; frescos.push(rank); }
    if (s) console.log(`  · ${rank}: ${Object.keys(s).length} héroes`);
    else console.warn(`  · ${rank}: fallo (${semana.fallos[rank].message}); conservo lo anterior`);
  }
  const stats = statsByRank[op.rank] ?? Object.values(statsByRank)[0] ?? previous?.stats ?? {};
  // La ventana corta NUNCA se conserva: unos «recientes» viejos son peores que ninguno [M].
  const corta = await estadisticasConReintento(ctx, DIAS_RECIENTES);
  const recientesPorRango = Object.fromEntries(op.ranks.filter((r) => Object.keys(corta.datos[r] ?? {}).length).map((r) => [r, corta.datos[r]]));
  for (const rank of op.ranks.filter((r) => !corta.datos[r])) console.warn(`  · ${rank} (${DIAS_RECIENTES} días): fallo (${corta.fallos[rank].message}); la app usará la ventana de ${op.dias}`);

  const { tiers, diag: diagTiers } = await pedirTiers(op.tiers, heroList, previous, { sleep: ctx.sleep });
  console.log(`  · tier list (mlbb.gg): ${diagTiers}`);
  console.log(`  · ventana de ${DIAS_RECIENTES} días: ${Object.keys(recientesPorRango).join(', ') || 'ninguno'}`);

  // Antes de las 266 peticiones, por cuál de las rutas candidatas viene el dato entero [M].
  const rutasMedidas = {};
  const medir = async (clave, heroe) => { const t = await medirRutas(ctx, clave, heroe); if (t) rutasMedidas[clave] = t; };
  const heroeDePrueba = heroList.find((h) => h.id)?.id ?? nombresPedir[0];
  for (const clave of ['counter', 'compatibility']) await medir(clave, heroeDePrueba);

  let equipo = previous?.equipment ?? {};
  let diagEquipo = null;
  const objetos = await intentar('objetos', () => pedirEquipo(ctx));
  if (objetos) {
    const fundido = fundirEquipo(equipo, objetos.equipo, { completo: !objetos.caidas });
    equipo = fundido.equipo;
    if (objetos.rutas != null) diagEquipo = { rutas: objetos.rutas, caidas: objetos.caidas, conservados: fundido.conservados };
    console.log(`  · objetos: ${Object.keys(equipo).length}${fundido.conservados ? ` (${fundido.conservados} con lo de antes: ${objetos.caidas ?? '?'} de ${objetos.rutas ?? '?'} rutas no respondieron)` : ''}`);
  }

  const talentosHoy = await intentar('talentos', () => pedirTalentos(ctx));
  const talentos = talentosHoy && Object.keys(talentosHoy).length ? talentosHoy : (previous?.talentos ?? {});
  if (talentosHoy) console.log(`  · talentos: ${Object.keys(talentos).length}`);

  let builds = previous?.builds ?? {};
  const buildsHoy = await intentar('builds', () => pedirBuilds(ctx, heroList));
  const diagBuilds = buildsHoy?.diag ?? null;
  if (buildsHoy && Object.keys(buildsHoy.builds).length) {
    const fundido = fundirPorHeroeYLinea(previous?.builds, buildsHoy.builds, heroList);
    builds = fundido.valores;
    if (diagBuilds) diagBuilds.conservadas = fundido.conservados;
  }
  if (buildsHoy) console.log(`  · builds: ${Object.keys(builds).length} heroes`);

  // El winrate por línea y su curva (se enseñan, no puntúan), par a par; lo conservado se cuenta SIEMPRE.
  let winrateLinea = previous?.winrateLinea ?? {};
  let curvaLinea = previous?.curvaLinea ?? {};
  const lineasHoy = await intentar('winrate por linea', () => pedirLineas(ctx, heroList));
  const diagLineas = { ...(lineasHoy?.diag ?? {}), conservados: paresDe(winrateLinea), curvasConservadas: paresDe(curvaLinea) };
  if (lineasHoy && Object.keys(lineasHoy.winrate).length) {
    const fundido = fundirPorHeroeYLinea(previous?.winrateLinea, lineasHoy.winrate, heroList);
    winrateLinea = fundido.valores;
    diagLineas.conservados = fundido.conservados;
  }
  if (lineasHoy && Object.keys(lineasHoy.curvas).length) {
    const fundido = fundirPorHeroeYLinea(previous?.curvaLinea, lineasHoy.curvas, heroList);
    curvaLinea = fundido.valores;
    diagLineas.curvasConservadas = fundido.conservados;
  }
  if (lineasHoy) console.log(`  · winrate por linea: ${Object.keys(winrateLinea).length} heroes, curvas por duracion: ${Object.keys(curvaLinea).length}`);

  // Iconos solo de lo que la app puede enseñar (en una build, o con defensa o efecto); retratos por id.
  const imagenes = {};
  await intentar('iconos', async () => {
    const aEnsenar = new Set(Object.values(builds).flatMap((porLinea) => Object.values(porLinea).flatMap((lista) => lista.flatMap((b) => (b.objetos ?? []).map(String)))));
    for (const [id, o] of Object.entries(equipo)) if (o.magica || o.fisica || o.efectos?.length) aEnsenar.add(id);
    const urls = Object.fromEntries(Object.entries(equipo).filter(([id]) => aEnsenar.has(id)).map(([id, o]) => [id, o.icono]));
    imagenes.objetos = await bajarImagenes(urls, op.iconos, '.png', { sleep: ctx.sleep });
    console.log(`  · iconos: ${imagenes.objetos.bajados} bajados (${imagenes.objetos.cambiados} cambiados), ${imagenes.objetos.fallos} fallos (de ${Object.keys(urls).length} que se ensenan)`);
  });
  await intentar('retratos', async () => {
    const urls = Object.fromEntries(heroList.filter((h) => h.retrato && h.id != null).map((h) => [h.id, h.retrato]));
    imagenes.heroes = await bajarImagenes(urls, op.retratos, '.jpg', { sleep: ctx.sleep });
    console.log(`  · retratos: ${imagenes.heroes.bajados} bajados (${imagenes.heroes.cambiados} cambiados), ${imagenes.heroes.fallos} fallos (de ${Object.keys(urls).length} heroes)`);
  });

  // Cruces y parejas: rango (guarda), fusión con la guardada y frescura.
  let relations = { counters: { ...(previous?.counters ?? {}) }, synergies: { ...(previous?.synergies ?? {}) } };
  let relacionesRango = { rango: op.rank, pedido: op.rank, coherencia: null, motivo: null };
  let frescas = 0, frescasParejas = 0, diagRelaciones = null, respaldoReintentado = null;
  const hecho = await intentar('relaciones', async () => {
    const r = await relacionesDeRango(ctx, nombresPedir, stats, heroList, previous, medir);
    ({ rango: relacionesRango, diag: diagRelaciones, respaldoReintentado } = r);
    const corrida = relacionesDeLaCorrida(previous, r.elegidas, relacionesRango.rango);
    ({ relations, frescas, frescasParejas } = corrida);
    // Sin ninguna fila nueva se queda la matriz guardada, y con ella su etiqueta [C].
    if (corrida.conservado) relacionesRango = previous?.relaciones ?? { ...relacionesRango, motivo: 'sin cruces nuevos: se conservan los de la corrida anterior' };
    if (corrida.cortas || corrida.cortasParejas) {
      diagRelaciones = { ...(diagRelaciones ?? {}), cortas: corrida.cortas, cortasParejas: corrida.cortasParejas };
      console.warn(`  · relaciones: ${corrida.cortas} filas de cruces y ${corrida.cortasParejas} de parejas con menos de la mitad que la guardada: se conserva la guardada`);
    }
    console.log(`  · relaciones: ${frescas} héroes nuevos de ${nombresPedir.length} · ${Object.keys(relations.counters).length} con fila`);
    return true;
  });
  if (!hecho) relacionesRango = previous?.relaciones ?? relacionesRango;
  const { frescosRecursos, matrizNueva } = frescura(frescas, nombresPedir.length, frescasParejas);

  const estadisticasNuevas = estadisticasFrescas(frescos, op.rank, op.respaldo);
  const hoy = ahora().slice(0, 10);
  const parche = anotarParche(previous, heroList, hoy, { dias: op.dias });
  if (parche.reescrito) console.warn(`  · parche: cambian más de la mitad de ${parche.comparables} kits a la vez; parece la API reescribiendo textos y no marco a nadie`);
  else if (parche.cambiados.length) console.log(`  · parche: tocados hoy ${parche.cambiados.join(', ')}`);
  const conocidos = new Set(catalogo.heroes.map((h) => h.name));
  const newHeroes = [...new Set([...Object.keys(stats), ...heroList.map((h) => h.name)])].filter((n) => !conocidos.has(n));
  const heroesCambiados = kitsRehechos(heroList, catalogo.heroes);

  const out = {
    generatedAt: fechaDeLaCorrida({ estadisticasNuevas, previous }),
    rank: op.rank,
    relaciones: { ...relacionesRango, descargada: fechaDeLaMatriz({ matrizNueva, previous }) },
    ranks: Object.keys(statsByRank),
    days: op.dias,
    avgByRank: Object.fromEntries(Object.entries(statsByRank).map(([k, v]) => [k, media(v)])),
    heroCount: Object.keys(stats).length,
    // Cuántos héroes de cada línea tienen cruces: si la app puede recomendar de verdad en esa línea.
    coberturaPorLinea: Object.fromEntries(LINEAS.map((linea) => {
      const de = heroList.filter((h) => (h.lanes ?? []).includes(linea));
      return [linea, { total: de.length, conCounters: de.filter((h) => Object.keys(relations.counters[h.name] ?? {}).length).length }];
    })),
    heroes: heroList,
    newHeroes,
    heroesCambiados,
    tocados: parche.tocados,
    diagnostics: {
      base: ctx.fijada
        ? `${ctx.fijada.method} ${ctx.fijada.base}${ctx.fijada.prefix}`
        : (ctx.rutas?.rank ? `${ctx.rutas.rank.method} ${new URL(ctx.rutas.rank.template).origin}` : null),
      schema: descubierto.schema,
      parche: { comparables: parche.comparables, cambiados: parche.cambiados.length, reescrito: parche.reescrito },
      routes: descubierto.routes,
      frescos,
      frescosRecursos,
      conservado: !(estadisticasNuevas && matrizNueva),
      relations: diagRelaciones,
      speciality,
      rutasMedidas: Object.keys(rutasMedidas).length ? rutasMedidas : null,
      dano,
      builds: diagBuilds,
      equipo: diagEquipo,
      lineas: diagLineas,
      rangos: semana.textos,
      reintentoEstadisticas: semana.reintento,
      respaldoReintentado,
      recientes: corta.textos,
      tiers: diagTiers,
      // Lo que falló, solo si NO se descargó nada (con datos previos, `statsByRank` nunca está vacío) [D].
      failed: frescos.length ? [] : [...new Set(ctx.fallos)].slice(0, 12),
      imagenes: Object.keys(imagenes).length ? imagenes : null,
    },
    stats,
    statsByRank,
    ...(Object.keys(recientesPorRango).length ? { recientes: { dias: DIAS_RECIENTES, statsByRank: recientesPorRango } } : {}),
    ...(tiers ? { tiers } : {}),
    counters: relations.counters,
    synergies: relations.synergies,
    equipment: equipo,
    builds,
    talentos,
    winrateLinea,
    curvaLinea,
    historia: anotarHistoria(previous?.historia, statsByRank, frescos, hoy, { rangos: [op.rank, op.respaldo].filter(Boolean) }),
  };

  await mkdir(dirname(op.out), { recursive: true });
  await writeFile(op.out, serializar(out) + '\n');
  console.log(`Escrito ${op.out}`);

  if (diagRelaciones) {
    console.log(`Relaciones: ${diagRelaciones.ok} con datos · ${diagRelaciones.conId} por id · ${diagRelaciones.porNombre} por nombre`);
    for (const e of diagRelaciones.errores) console.warn(`  ${e}`);
  }
  const conStats = new Set(Object.keys(stats).map(nombreClave));
  const sinStats = nombresPedir.filter((n) => !conStats.has(nombreClave(n)));
  if (!Object.keys(statsByRank).length) {
    console.warn('SIN ESTADÍSTICAS. Combinaciones probadas que fallaron:');
    for (const f of [...new Set(ctx.fallos)].slice(0, 12)) console.warn(`  ${f}`);
  } else if (sinStats.length) {
    console.warn(`Héroes sin estadísticas (${sinStats.length}/${nombresPedir.length}): ${sinStats.join(', ')}. Si son muchos, los nombres de la API no casan con heroes.json.`);
  }
  if (newHeroes.length) console.log(`Héroes sin tags propios (usan los de su rol): ${newHeroes.join(', ')}`);
  if (heroesCambiados.length) console.log(`Héroes con el kit cambiado desde que se escribieron sus tags: ${heroesCambiados.map((h) => `${h.name} (${h.antes} → ${h.ahora})`).join(', ')}`);
}
