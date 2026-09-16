import { nombreClave } from '../nombres.js';
import { cruce, cobertura, densidadCounters } from '../matrices.js';
import { coberturaBuilds } from '../builds.js';

/**
 * Los datos con los que decide la app: que estén, que sean frescos, que
 * cubran el pool de tu línea y que sus VALORES sean posibles. La ingesta
 * conserva lo anterior cuando un endpoint falla, así que una API rota no se
 * nota en la forma del fichero: se nota en los valores.
 */

const media = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const desv = (a) => Math.sqrt(a.reduce((s, x) => s + (x - media(a)) ** 2, 0) / (a.length - 1));

/** @param {import('./informe.js').Informe} inf */
export function seccionDatos(inf, { datos, linea, entorno = {} }) {
  const meta = datos.crudo;
  const pool = datos.poolsPorLinea[linea] ?? [];
  inf.seccion('DATOS');
  inf.check(!!datos.catalogo?.heroes?.length, `Catálogo: ${datos.catalogo?.heroes?.length ?? 0} héroes`, 'Catálogo vacío o no cargado');
  inf.check(pool.length > 0, `Línea ${linea}: ${pool.length} héroes en el pool`, `Línea ${linea}: pool VACÍO, no hay nada que recomendar`);
  if (!meta) {
    inf.add('FALLO', 'roam-meta.json no cargado: la app va solo con reglas por tags');
    return;
  }
  const gen = new Date(meta.generatedAt);
  const horas = (Date.now() - gen) / 3.6e6;
  inf.linea(`Generado: ${gen.toLocaleString('es-ES')} (hace ${Math.round(horas)} h)`);
  inf.check(horas < 36, 'Datos frescos', `Datos de hace ${Math.round(horas)} h: la actualización automática puede estar rota`, true);
  inf.linea(`Rangos: ${meta.ranks?.join(', ') || 'ninguno'} · activo: ${entorno.rango ?? '?'}`);
  // Las estadísticas cambian con el rango; los cruces, parejas y builds son
  // SIEMPRE del rango de la ingesta. Con otro rango se mezclan poblaciones.
  if (entorno.rango && meta.rank && entorno.rango !== meta.rank) {
    inf.check(false, '', `Estadísticas de ${entorno.rango} pero cruces, parejas y builds de ${meta.rank}: dos poblaciones mezcladas`, true);
  }
  if (meta.coberturaPorLinea) {
    inf.linea('Cobertura por línea: ' + Object.entries(meta.coberturaPorLinea).map(([l, c]) => `${l} ${c.conCounters}/${c.total}`).join(' · '));
  }
  inf.linea(`Ventana: ${meta.days ?? '?'} días · héroes con estadísticas: ${meta.heroCount ?? 0}`);
  inf.linea(`API: ${meta.diagnostics?.base ?? 'desconocida'}`);
  if (meta.diagnostics?.conservado != null) {
    inf.check(!meta.diagnostics.conservado, `Última corrida con estadísticas nuevas (${(meta.diagnostics.frescos ?? []).join(', ') || 'ninguno'})`,
      `La última corrida NO descargó estadísticas de ${meta.rank ?? 'tu rango'}: se conservan las anteriores (API caída o cambiada)`, true);
  }
  const st = Object.entries(meta.stats ?? {});
  if (st.length) {
    const raros = st.filter(([, v]) => v?.winRate != null && (v.winRate < 0.35 || v.winRate > 0.65)).map(([n]) => n);
    inf.check(!raros.length, 'Winrates dentro de lo posible (35-65%)', `Winrates imposibles: ${raros.slice(0, 5).join(', ')} (¿API rota?)`, true);
    const sumaPick = st.reduce((acc, [, v]) => acc + (v?.pickRate ?? 0), 0);
    inf.check(Math.abs(sumaPick - 1) < 0.05, `Cuotas de pick suman ${sumaPick.toFixed(3)}`,
      `Cuotas de pick suman ${sumaPick.toFixed(3)}, no 1: pickRate ya no es cuota y lo calibrado sobre ella está mal`, true);
    const banMal = st.filter(([, v]) => v?.banRate > 1 || v?.banRate < 0).map(([n]) => n);
    inf.check(!banMal.length, 'Tasas de ban dentro de 0-100%', `Tasas de ban imposibles: ${banMal.slice(0, 5).join(', ')}`, true);
  }
  const filas = Object.entries(datos.meta.counters ?? {});
  if (filas.length) {
    const planas = filas.filter(([, fila]) => {
      const v = Object.values(fila ?? {}).filter((x) => typeof x === 'number');
      return v.length > 20 && v.every((x) => Math.abs(x - 0.5) < 1e-6);
    }).map(([n]) => n);
    inf.check(!planas.length, 'Ninguna fila de counters plana', `Filas de counters planas (todo 0.5): ${planas.slice(0, 5).join(', ')}`, true);
  }
  for (const [r, v] of Object.entries(meta.diagnostics?.rangos ?? {})) {
    if (String(v).startsWith('fallo')) inf.add('AVISO', `Rango ${r}: ${v}`);
  }
}

/** Cobertura del pool de tu línea: winrates, cruces, builds, objetos y nombres. */
export function seccionCobertura(inf, { datos, linea, entorno = {} }) {
  const meta = datos.crudo;
  const pool = datos.poolsPorLinea[linea] ?? [];
  inf.seccion('COBERTURA');
  const cov = cobertura(pool, datos.meta.stats, datos.meta.counters);
  inf.check(cov.conDatos === cov.total, `Winrates: ${cov.conDatos}/${cov.total} héroes de tu línea`,
    `Winrates: faltan ${cov.faltan.length} (${cov.faltan.slice(0, 8).join(', ')})`);
  inf.check(cov.conCounters > 0, `Counters: ${cov.conCounters}/${cov.total} héroes de tu línea`,
    'Counters: ninguno. El motor usa reglas por tags, no partidas reales');
  if (cov.conCounters) {
    const d = densidadCounters(pool, datos.meta.counters, datos.heroes);
    inf.linea(`Matriz: ${d.media.toFixed(0)} rivales por roamer de media · cubre el ${(d.cobertura * 100).toFixed(1)}% de los cruces posibles`);
    // Mide la SALUD de la descarga: la ruta que daba cinco cruces sigue
    // existiendo, y 60 chilla mucho antes de que la app vuelva a decidir con
    // reglas escritas a mano.
    inf.check(d.media >= 60, `Matriz completa: ${d.media.toFixed(0)} rivales por héroe`,
      `Solo ${d.media.toFixed(0)} rivales por héroe: la descarga se ha quedado en la ruta corta`, true);
  }
  const cb = coberturaBuilds(pool, meta?.builds, linea);
  if (Object.keys(meta?.builds ?? {}).length) {
    inf.check(cb.con >= cb.total * 0.8, `Builds: ${cb.con}/${cb.total} héroes de tu línea`, `Builds: solo ${cb.con} de ${cb.total} héroes de tu línea`, true);
    const objetos = Object.values(meta?.equipment ?? {});
    const conDefensa = objetos.filter((o) => o.magica || o.fisica).length;
    inf.check(conDefensa >= 20, `Objetos: ${objetos.length} · ${conDefensa} con defensa medida`,
      `Objetos: solo ${conDefensa} con defensa medida de ${objetos.length}: el texto del juego ha cambiado de forma`, true);
    const sinNombre = new Set();
    for (const porLinea of Object.values(meta.builds)) {
      for (const lista of Object.values(porLinea)) for (const b of lista) for (const id of b.objetos ?? []) if (!meta.equipment?.[id]) sinNombre.add(id);
    }
    if (sinNombre.size) inf.linea(`  objetos sin nombre en el catálogo: ${[...sinNombre].slice(0, 8).join(', ')}`);
  } else {
    inf.linea('Builds: ninguna todavía (la pantalla de objetos saldrá vacía)');
  }
  if (!cov.conCounters && meta?.diagnostics) {
    inf.linea(`  ruta counter: ${meta.diagnostics.relations?.rutaCounter ?? 'no encontrada en el esquema'}`);
    for (const e of meta.diagnostics.relations?.errores ?? []) inf.linea(`  ${e}`);
    if (meta.diagnostics.relations?.muestra) inf.linea(`  respuesta tal cual: ${meta.diagnostics.relations.muestra}`);
    if (meta.diagnostics.schema?.heroPaths) inf.linea(`  rutas de héroes en la API: ${meta.diagnostics.schema.heroPaths.join(' ')}`);
  }
  const nombresApi = Object.keys(meta?.statsByRank?.[entorno.rango] ?? meta?.stats ?? {});
  const catalogoNorm = new Set(datos.catalogo?.heroes?.map((h) => nombreClave(h.name)) ?? []);
  const huerfanos = nombresApi.filter((n) => !catalogoNorm.has(nombreClave(n)));
  inf.check(huerfanos.length < 12, `Nombres: ${nombresApi.length} de la API, ${huerfanos.length} sin tags propios`,
    `Nombres: ${huerfanos.length} sin casar (${huerfanos.slice(0, 10).join(', ')})`, true);
}

/**
 * Cuánto más dispersos son los cruces de los héroes raros que los de los
 * populares (cuartiles de pickrate). Sostiene que el cruce no se encoja por
 * muestra: si la fuente pasa a dar estimaciones temblorosas para los raros,
 * hay que volver a medirlo. Lo vigila el diagnóstico y lo apunta el bot en el
 * historial, con la MISMA función.
 *
 * @returns {{ razon, siFueraRuido } | null}  null sin cien filas con dato
 */
export function medirRuido(datos) {
  const stats = datos.crudo?.stats ?? {};
  const counters = datos.meta.counters;
  if (!counters || !datos.meta.stats) return null;
  const nombres = Object.keys(stats);
  const filas = [];
  for (const n of nombres) {
    const pr = stats[n]?.pickRate;
    if (!(pr > 0)) continue;
    const v = nombres.filter((o) => o !== n).map((o) => cruce(counters, n, o)).filter((x) => x != null);
    if (v.length > 50) filas.push({ pr, sd: desv(v) });
  }
  if (filas.length < 100) return null;
  filas.sort((a, b) => a.pr - b.pr);
  const corte = Math.floor(filas.length / 4);
  const raros = filas.slice(0, corte);
  const comunes = filas.slice(-corte);
  return {
    razon: media(raros.map((f) => f.sd)) / media(comunes.map((f) => f.sd)),
    siFueraRuido: Math.sqrt(media(comunes.map((f) => f.pr)) / media(raros.map((f) => f.pr))),
  };
}

/** Salud estadística de los datos. No va en las pruebas a propósito: mira los DATOS, que cambian dos veces al día. */
export function seccionSalud(inf, { datos }) {
  const r = medirRuido(datos);
  if (!r) return;
  inf.linea(`Ruido: los héroes raros dispersan ${r.razon.toFixed(2)}x lo que los populares (muestreo puro daría ${r.siFueraRuido.toFixed(2)}x)`);
  inf.check(r.razon < 1 + (r.siFueraRuido - 1) * 0.4, 'El dato de los héroes poco jugados sigue siendo firme',
    `Los cruces de los héroes raros se han vuelto ruidosos (${r.razon.toFixed(2)}x): hay que volver a medir si el cruce pide encogerse`, true);
}

/** Las cifras de esta corrida que se comparan con el historial y que el bot anota. */
export function cifrasDe(datos, linea) {
  const meta = datos.crudo ?? {};
  const pares = (m) => Object.values(m ?? {}).reduce((acc, fila) => acc + Object.keys(fila ?? {}).length, 0);
  return {
    cruces: pares(meta.counters),
    sinergias: pares(meta.synergies),
    objetos: Object.keys(meta.equipment ?? {}).length,
    // Las builds, no los héroes con builds: perder dos de las tres de cada
    // héroe no mueve el segundo número y sí el primero.
    builds: Object.values(meta.builds ?? {}).reduce((acc, p) => acc + Object.values(p ?? {}).reduce((m, l) => m + (l?.length ?? 0), 0), 0),
    heroes: (meta.heroes ?? []).length,
    [`pool ${linea}`]: (datos.poolsPorLinea[linea] ?? []).length,
  };
}

/**
 * La app comparada con SU propio pasado: mediana de las últimas corridas y
 * holgura de 3 MAD (nunca menos del 2% de la mediana, para que una serie
 * clavada no chille por un cruce de más o de menos).
 */
export function seccionHistorial(inf, { datos, linea, historial = null }) {
  inf.seccion('HISTORIAL');
  const filas = Array.isArray(historial) ? historial.filter((f) => f && typeof f === 'object') : [];
  if (filas.length < 4 || !datos.crudo) {
    inf.linea(filas.length ? `Solo ${filas.length} corridas: aún no hay serie` : '(sin historial a mano)');
    return;
  }
  const hoy = cifrasDe(datos, linea);
  const ultimas = filas.slice(-30);
  inf.linea(`${ultimas.length} corridas anteriores (última ${ultimas[ultimas.length - 1].fecha?.slice(0, 16) ?? '?'})`);
  for (const [clave, valor] of Object.entries(hoy)) {
    const serie = ultimas.map((f) => (clave.startsWith('pool ') ? f.pools?.[linea] : f[clave])).filter((x) => typeof x === 'number');
    if (serie.length < 4) continue;
    const orden = [...serie].sort((x, y) => x - y);
    const mediana = orden[Math.floor(orden.length / 2)];
    const desvs = serie.map((x) => Math.abs(x - mediana)).sort((x, y) => x - y);
    const mad = desvs[Math.floor(desvs.length / 2)];
    const holgura = Math.max(3 * mad, mediana * 0.02);
    inf.check(!(mediana - valor > holgura), `${clave}: ${valor} (mediana de la serie ${mediana})`,
      `${clave} ha CAÍDO: ${valor} frente a una mediana de ${mediana} (±${Math.round(holgura)})`, true);
  }
  const conFallos = ultimas.filter((f) => f.fallos > 0).length;
  if (conFallos) inf.linea(`Corridas con fallos en la serie: ${conFallos} de ${ultimas.length}`);
}
