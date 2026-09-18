/**
 * La orquestacion: lee los argumentos, descubre las rutas, pide cada recurso
 * conservando lo anterior cuando algo falla, baja las imagenes y escribe el
 * JSON. Aqui no se decide NADA sobre la forma de las respuestas.
 */

import { writeFile, readFile, mkdir } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  DAYS, DIAS_RECIENTES, HEROES, ICONOS, OUT, RANK, RANKS, RETRATOS, diagnostics, estado, sleep,
} from './contexto.mjs';
import { discoverRoutes, elegirRutaConMasDatos } from './descubrimiento.mjs';
import {
  fetchBuilds, fetchEquipo, fetchFichas, fetchHeroList, fetchStats,
} from './extraccion.mjs';
import { fetchRelations } from './relaciones.mjs';
import {
  anotarFrescura, conservarFichasPrevias, fechaDeLaCorrida, fundirRelaciones,
  kitsRehechos, leerPrevio, relacionesPrevias,
} from './fusion.mjs';
import { bajarImagenes } from './imagenes.mjs';
import { serializar } from './salida.mjs';
// La MISMA funcion que usa la app para decidir quien entra al pool de roam.
// Duplicar el criterio aqui ya costo un fallo: la app metia a Marcel (support
// segun la API) y la ingesta no le pedia counters, porque miraba solo el
// catalogo escrito a mano.
import { nombreClave as normName } from '../../src/motor/nombres.js';
import { fundirCatalogo as mergeCatalog } from '../../src/motor/catalogo.js';

export { parseArgs } from './contexto.mjs';

async function main() {
  console.log(`Ingesta MLBB · rangos=${RANKS.join(',')} · ventana=${DAYS}d`);

  estado.ROUTES = await discoverRoutes();
  if (estado.ROUTES) {
    for (const [k, r] of Object.entries(estado.ROUTES)) console.log(`  · ${k}: ${r.method} ${r.template}`);
  } else {
    console.warn('  · no se pudo leer el esquema; pruebo rutas conocidas a ciegas');
  }

  const heroes = JSON.parse(await readFile(HEROES, 'utf8'));

  const previous = await leerPrevio();

  let heroList = previous?.heroes ?? [];
  try {
    const fresh = await fetchHeroList();
    if (fresh.length) heroList = fresh;
    console.log(`  · lista completa: ${heroList.length} héroes`);
  } catch (err) {
    console.warn(`  · lista de héroes: fallo (${err.message}); conservo la anterior`);
  }

  const { danoPrevio } = conservarFichasPrevias(heroList, previous);

  diagnostics.speciality = { pedidos: heroList.length, ok: 0, errores: [] };
  diagnostics.dano = { ok: 0, conservados: 0, sin: 0 };
  try {
    const fichas = await fetchFichas(heroList);
    for (const h of heroList) {
      const f = fichas[h.name];
      // Para TODOS, no solo para los que no están en el catálogo: son 133
      // listas cortas (5 KB) y con ellas derivar-tags.mjs no vuelve a pedir
      // 133 fichas por una ruta escrita a mano.
      if (f?.speciality) h.speciality = f.speciality;
      if (f?.damage) h.damage = f.damage;
      if (f?.retrato) h.retrato = f.retrato;
    }
    diagnostics.speciality.ok = Object.values(fichas).filter((f) => f.speciality).length;
    diagnostics.dano.ok = Object.values(fichas).filter((f) => f.damage).length;
    console.log(`  · fichas: ${Object.keys(fichas).length}/${heroList.length} heroes`);
  } catch (err) {
    console.warn(`  · fichas: fallo (${err.message}); se conserva lo anterior`);
  }
  diagnostics.dano.conservados = heroList.filter((h) => h.damage && danoPrevio[h.name]).length;
  diagnostics.dano.sin = heroList.filter((h) => !h.damage).length;
  console.log(`  · tipo de dano: ${heroList.length - diagnostics.dano.sin}/${heroList.length} heroes`);

  // Counters de TODOS los heroes, no solo de los roamers: la app recomienda
  // para las cinco lineas y un mediocarril necesita sus matchups igual que un
  // roamer. Son ~266 peticiones en vez de 70, que es el precio de que la app
  // sirva para cualquier rol.
  const todos = mergeCatalog(heroes.heroes, heroList);
  const nombresPedir = [...new Set(todos.map((h) => h.name))];
  const roamNames = [...new Set(todos.filter((h) => h.roam).map((h) => h.name))];
  console.log(`  · ${nombresPedir.length} heroes a los que pedir counters`);

  const statsByRank = { ...(previous?.statsByRank ?? {}) };
  // Qué rangos se han DESCARGADO en esta corrida, aparte de los conservados.
  // Es lo que decide la fecha del fichero: con la API caída la corrida
  // reproducía los datos de ayer con la fecha de hoy, pasaba el comparador
  // (no resolvía menos) y engañaba a la puerta de frescura del despliegue.
  const frescos = [];
  diagnostics.rangos = {};
  for (const rank of RANKS) {
    try {
      const s = await fetchStats(rank);
      if (Object.keys(s).length) { statsByRank[rank] = s; frescos.push(rank); }
      diagnostics.rangos[rank] = `${Object.keys(s).length} héroes`;
      console.log(`  · ${rank}: ${Object.keys(s).length} héroes`);
    } catch (err) {
      // Antes solo salía por consola y en la app no había forma de saber que
      // faltaban tres de los cuatro rangos.
      diagnostics.rangos[rank] = `fallo: ${err.message.slice(0, 120)}`;
      console.warn(`  · ${rank}: fallo (${err.message}); conservo lo anterior`);
    }
    await sleep(250);
  }
  const stats = statsByRank[RANK] ?? Object.values(statsByRank)[0] ?? previous?.stats ?? {};

  // La ventana corta de las estadisticas por heroe, por rango. NO se conserva
  // de la corrida anterior: unos datos "recientes" de hace dias son peores
  // que ninguno, y sin ellos la app cae sola a los de 7 dias (ventana.js).
  // Es un extra: un fallo aqui no tira la corrida ni deja de publicar.
  const recientesPorRango = {};
  diagnostics.recientes = {};
  for (const rank of RANKS) {
    try {
      const s = await fetchStats(rank, DIAS_RECIENTES);
      if (Object.keys(s).length) recientesPorRango[rank] = s;
      diagnostics.recientes[rank] = `${Object.keys(s).length} héroes`;
    } catch (err) {
      diagnostics.recientes[rank] = `fallo: ${err.message.slice(0, 120)}`;
      console.warn(`  · ${rank} (${DIAS_RECIENTES} días): fallo (${err.message}); la app usará la ventana de ${DAYS}`);
    }
    await sleep(250);
  }
  const recientes = Object.keys(recientesPorRango).length ? { dias: DIAS_RECIENTES, statsByRank: recientesPorRango } : null;
  console.log(`  · ventana de ${DIAS_RECIENTES} días: ${Object.keys(recientesPorRango).join(', ') || 'ninguno'}`);

  // Antes de pedir 266 veces, comprobar por cual de las rutas candidatas viene
  // el dato completo. Cuesta unas pocas peticiones y ha valido la matriz entera.
  const heroeDePrueba = heroList.find((h) => h.id)?.id ?? nombresPedir[0];
  for (const clave of ['counter', 'compatibility']) {
    try {
      await elegirRutaConMasDatos(clave, heroeDePrueba);
    } catch (err) {
      console.warn(`  · ${clave}: no se ha podido comparar rutas (${err.message}); se usa la del esquema`);
    }
  }

  // Objetos y builds. Como todo lo demas, si falla se conserva lo anterior: un
  // objeto no cambia de estadisticas de un dia para otro, y quedarse sin el
  // dato es peor que tenerlo con un dia de retraso.
  let equipo = previous?.equipment ?? {};
  try {
    const fresh = await fetchEquipo();
    if (Object.keys(fresh).length) equipo = fresh;
    console.log(`  · objetos: ${Object.keys(equipo).length}`);
  } catch (err) {
    console.warn(`  · objetos: fallo (${err.message}); conservo los anteriores`);
  }

  let builds = previous?.builds ?? {};
  try {
    const fresh = await fetchBuilds(heroList);
    if (Object.keys(fresh).length) builds = fresh;
    console.log(`  · builds: ${Object.keys(builds).length} heroes`);
  } catch (err) {
    console.warn(`  · builds: fallo (${err.message}); conservo las anteriores`);
  }

  // Los iconos, solo de los objetos que la app puede llegar a ensenar: los que
  // salen en alguna build y los que puede proponer por su defensa o su efecto.
  // Son ~70 de 184, y la segunda corrida no baja ninguno.
  try {
    const aEnsenar = new Set();
    for (const porLinea of Object.values(builds)) {
      for (const lista of Object.values(porLinea)) for (const b of lista) for (const id of b.objetos ?? []) aEnsenar.add(String(id));
    }
    for (const [id, o] of Object.entries(equipo)) if (o.magica || o.fisica || o.efectos?.length) aEnsenar.add(id);
    const subconjunto = Object.fromEntries(Object.entries(equipo).filter(([id]) => aEnsenar.has(id)));
    const urls = Object.fromEntries(Object.entries(subconjunto).map(([id, o]) => [id, o.icono]));
    const { bajados, fallos } = await bajarImagenes(urls, ICONOS, '.png', 'objetos');
    console.log(`  · iconos: ${bajados} nuevos, ${fallos} fallos (de ${Object.keys(subconjunto).length} que se ensenan)`);
  } catch (err) {
    console.warn(`  · iconos: fallo (${err.message}); se ensenaran solo los nombres`);
  }

  // Los retratos, uno por heroe, por su id: es lo que la app pide y no cambia
  // aunque a Moonton le de por reescribir el nombre.
  try {
    const urls = Object.fromEntries(
      heroList.filter((h) => h.retrato && h.id != null).map((h) => [h.id, h.retrato]),
    );
    const { bajados, fallos } = await bajarImagenes(urls, RETRATOS, '.jpg', 'heroes');
    console.log(`  · retratos: ${bajados} nuevos, ${fallos} fallos (de ${Object.keys(urls).length} heroes)`);
  } catch (err) {
    console.warn(`  · retratos: fallo (${err.message}); la lista saldra sin caras`);
  }

  const relations = relacionesPrevias(previous);
  let relacionesFrescas = 0;
  try {
    const fresh = await fetchRelations(nombresPedir, stats, heroList);
    relacionesFrescas = fundirRelaciones(relations, fresh);
    console.log(`  · relaciones: ${relacionesFrescas} héroes nuevos de ${nombresPedir.length} · ${Object.keys(relations.counters).length} con fila`);
  } catch (err) {
    console.warn(`  · relaciones: fallo (${err.message}); conservo las anteriores`);
  }
  const matrizNueva = anotarFrescura(relacionesFrescas, nombresPedir.length);

  const avgOf = (byName) => {
    const r = Object.values(byName).map((s) => s.winRate).filter((n) => n != null);
    return r.length ? r.reduce((a, b) => a + b, 0) / r.length : 0.5;
  };

  // Misma normalización que usa la app, para que el aviso coincida con la realidad.
  const statKeys = new Set(Object.keys(stats).map(normName));
  const sinDatos = roamNames.filter((n) => !statKeys.has(normName(n)));

  const known = new Set(heroes.heroes.map((h) => h.name));
  const seen = new Set([...Object.keys(stats), ...heroList.map((h) => h.name)]);
  const newHeroes = [...seen].filter((n) => !known.has(n));

  // Heroes a los que Moonton les ha rehecho el kit DESPUES de que alguien les
  // escribiera los tags a mano. `newHeroes` no los ve: siguen en el catalogo
  // y con su nombre de siempre, asi que se quedarian con tags de otro heroe
  // para siempre y en silencio. La huella (tipo de dano + speciality) se
  // guarda en heroes.json al revisar los tags, asi que el aviso PERSISTE
  // hasta que una persona los mire, igual que pasa con los heroes nuevos.
  // Un heroe cuya ficha no haya llegado conserva la anterior (ver
  // conservarFichasPrevias), asi que una peticion caida no inventa un aviso.
  const heroesCambiados = kitsRehechos(heroList, heroes.heroes);

  const estadisticasNuevas = frescos.includes(RANK);
  const generatedAt = fechaDeLaCorrida({ frescos, estadisticasNuevas, matrizNueva, previous });
  const out = {
    generatedAt,
    rank: RANK,
    ranks: Object.keys(statsByRank),
    days: DAYS,
    patchAvgWinRate: avgOf(stats),
    avgByRank: Object.fromEntries(Object.entries(statsByRank).map(([k, v]) => [k, avgOf(v)])),
    heroCount: Object.keys(stats).length,
    roamCoverage: { withData: roamNames.length - sinDatos.length, total: roamNames.length, missing: sinDatos },
    // Cuantos heroes de cada linea tienen counters. Es lo que dice si la app
    // puede recomendar de verdad para esa linea o esta a medias.
    coberturaPorLinea: Object.fromEntries(
      ['roam', 'jungle', 'mid', 'gold', 'exp'].map((linea) => {
        const de = heroList.filter((h) => (h.lanes ?? []).includes(linea));
        const con = de.filter((h) => Object.keys(relations.counters[h.name] ?? {}).length);
        return [linea, { total: de.length, conCounters: con.length }];
      }),
    ),
    heroes: heroList,
    newHeroes,
    heroesCambiados,
    diagnostics: {
      // Cuando las rutas salen del esquema, LOCKED no llega a usarse: la base
      // hay que sacarla de ahí o la app muestra "API: desconocida" teniéndola.
      base: estado.LOCKED
        ? `${estado.LOCKED.method} ${estado.LOCKED.base}${estado.LOCKED.prefix}`
        : (estado.ROUTES?.rank ? `${estado.ROUTES.rank.method} ${new URL(estado.ROUTES.rank.template).origin}` : null),
      schema: diagnostics.schema ?? null,
      routes: diagnostics.routes ?? null,
      frescos: diagnostics.frescos ?? [],
      frescosRecursos: diagnostics.frescosRecursos ?? null,
      conservado: diagnostics.conservado ?? false,
      relations: diagnostics.relations ?? null,
      speciality: diagnostics.speciality ?? null,
      rutasMedidas: diagnostics.rutasMedidas ?? null,
      dano: diagnostics.dano ?? null,
      builds: diagnostics.builds ?? null,
      rangos: diagnostics.rangos ?? null,
      recientes: diagnostics.recientes ?? null,
      ok: [...new Set(diagnostics.ok)].slice(0, 6),
      // Lo que falló, si NO se descargó nada: antes se vaciaba en cuanto había
      // datos previos (statsByRank lleva dentro el `previous`), o sea casi
      // siempre, y con la API caída el móvil veía `failed: []`.
      failed: frescos.length ? [] : [...new Set(diagnostics.failed)].slice(0, 12),
      imagenes: diagnostics.imagenes ?? null,
    },
    stats,
    statsByRank,
    ...(recientes ? { recientes } : {}),
    counters: relations.counters,
    synergies: relations.synergies,
    equipment: equipo,
    builds,
  };

  await mkdir(dirname(OUT), { recursive: true });
  await writeFile(OUT, serializar(out) + '\n');

  console.log(`Escrito ${OUT}`);
  if (diagnostics.relations) {
    const r = diagnostics.relations;
    console.log(`Relaciones: ${r.ok} con datos · ${r.conId} por id · ${r.porNombre} por nombre`);
    for (const e of r.errores) console.warn(`  ${e}`);
  }
  if (!Object.keys(statsByRank).length) {
    console.warn('SIN ESTADÍSTICAS. Combinaciones probadas que fallaron:');
    for (const f of [...new Set(diagnostics.failed)].slice(0, 12)) console.warn(`  ${f}`);
  } else if (sinDatos.length) {
    console.warn(`Roamers sin estadísticas (${sinDatos.length}/${roamNames.length}): ${sinDatos.join(', ')}`);
    console.warn('Si son muchos, los nombres de la API no coinciden con heroes.json.');
  }
  if (newHeroes.length) {
    console.log(`Héroes sin tags propios (usan los de su rol): ${newHeroes.join(', ')}`);
  }
  if (heroesCambiados.length) {
    console.log(`Héroes con el kit cambiado desde que se escribieron sus tags: ${heroesCambiados.map((h) => `${h.name} (${h.antes} → ${h.ahora})`).join(', ')}`);
  }
}

export { main };
