import { nombreClave } from '../nombres.js';
import { cruce, sinergia, cobertura, densidadCounters, CRUCE_DESTACABLE, PAREJA_DESTACABLE, COLA_DEL_MOTIVO } from '../matrices.js';
import { coberturaBuilds } from '../builds.js';
import { WINRATE_POSIBLE, RANGO_DE_RESPALDO } from '../ventana.js';

/**
 * Los datos con los que decide la app: que estén, que sean frescos, que
 * cubran el pool de tu línea y que sus VALORES sean posibles. La ingesta
 * conserva lo anterior cuando un endpoint falla, así que una API rota no se
 * nota en la forma del fichero: se nota en los valores.
 */

const media = (a) => a.reduce((x, y) => x + y, 0) / a.length;
const desv = (a) => Math.sqrt(a.reduce((s, x) => s + (x - media(a)) ** 2, 0) / (a.length - 1));

/**
 * Qué no descargó la última corrida (3.43.1): el aviso decía siempre «no
 * descargó estadísticas de glory» aunque lo que faltara fuera la matriz de
 * cruces, las parejas o el rango de respaldo.
 */
export function queFaltaDeLaCorrida(meta) {
  const d = meta?.diagnostics ?? {};
  const falta = [];
  const frescos = d.frescos ?? [];
  const respaldo = RANGO_DE_RESPALDO[meta?.rank];
  if (meta?.rank && !frescos.includes(meta.rank)) falta.push(`estadísticas de ${meta.rank}`);
  if (respaldo && !frescos.includes(respaldo)) falta.push(`estadísticas de ${respaldo} (el rango de respaldo)`);
  const r = d.frescosRecursos;
  if (r?.pedidas) {
    if (r.relaciones / r.pedidas < 0.9) falta.push(`cruces (${r.relaciones} de ${r.pedidas} héroes)`);
    else if (r.parejas != null && r.parejas / r.pedidas < 0.9) falta.push(`parejas (${r.parejas} de ${r.pedidas} héroes)`);
  }
  return falta;
}

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
  if (meta.coberturaPorLinea) {
    inf.linea('Cobertura por línea: ' + Object.entries(meta.coberturaPorLinea).map(([l, c]) => `${l} ${c.conCounters}/${c.total}`).join(' · '));
  }
  inf.linea(`Ventana: ${meta.days ?? '?'} días · héroes con estadísticas: ${meta.heroCount ?? 0}`);
  // Qué ventana manda en la fuerza de cada héroe. Con la de 3 días coherente
  // con la de 7 la app reacciona a un parche en tres días en vez de siete; si
  // la corta viene rara (temporada recién empezada, API a medias), manda la
  // de 7 y aquí se ve por qué.
  // Y de qué rango: tras un reinicio de temporada Gloria se vacía y su
  // winrate es ruido; entonces manda Mítico (ventana.js, elegirRango).
  const f = datos.meta?.fuerza;
  if (f?.motivo && f.rango === f.pedido) {
    inf.check(false, '', `Fuerza de héroe: de ${f.rango}, sin poder comprobarla: ${f.motivo}`, true);
  } else if (f?.motivo) {
    inf.check(false, '', `Fuerza de héroe: de ${f.rango} en vez de ${f.pedido} porque ${f.motivo}`, true);
  } else if (f?.coherencia != null) {
    inf.linea(`Fuerza de héroe: de ${f.rango} (coherencia con el rango de abajo r=${f.coherencia.toFixed(3)})`);
  }
  // Y de qué rango salen cruces y parejas (3.35.0): la ingesta aplica la
  // misma guarda a las matrices (ventana.js, elegirRangoDeRelaciones), que
  // la ruta no tiene ventana de días y tras un reinicio Gloria se llena de
  // ruido. Sin el campo (datos de antes de 3.35.0), del rango de la ingesta.
  const rel = meta.relaciones;
  const coh = rel?.coherencia ? Object.entries(rel.coherencia).filter(([, x]) => x != null).map(([m, x]) => `${m === 'counters' ? 'cruces' : 'parejas'} r=${x.toFixed(3)}`).join(', ') : '';
  if (rel?.motivo && rel.rango === rel.pedido) {
    inf.check(false, '', `Cruces y parejas: de ${rel.rango}, sin poder comprobarlos: ${rel.motivo}`, true);
  } else if (rel?.motivo) {
    inf.check(false, '', `Cruces y parejas: de ${rel.rango} en vez de ${rel.pedido} porque ${rel.motivo}`, true);
  } else if (rel) {
    inf.linea(`Cruces y parejas: de ${rel.rango}${coh ? ` (coherencia con el rango de abajo: ${coh})` : ''}`);
  }
  // Las estadísticas cambian con el rango que elijas; cruces y parejas son
  // los que eligió la INGESTA (`relaciones.rango`, Mítico tras un reinicio)
  // y las builds, las del rango de la ingesta. Hasta 3.43.1 se comparaba tu
  // rango con `meta.rank` y, con cruces de Mítico, eligiendo Mítico decía
  // «cruces de glory: dos poblaciones mezcladas», que era falso.
  const rangoFuerza = f?.rango ?? entorno.rango;
  const rangoRel = rel?.rango ?? meta.rank;
  if (rangoFuerza && rangoRel && rangoFuerza !== rangoRel) {
    inf.check(false, '', `Fuerza de héroe de ${rangoFuerza} pero cruces y parejas de ${rangoRel}: dos poblaciones mezcladas`, true);
  }
  if (entorno.rango && meta.rank && entorno.rango !== meta.rank) {
    inf.linea(`Builds: de ${meta.rank} (la ingesta solo las baja de ese rango)`);
  }
  const v = datos.meta?.ventana;
  if (v?.dias === 7 && meta.recientes) {
    inf.check(false, '', `Fuerza de héroe: ventana de 7 días porque la de ${meta.recientes.dias} no vale: ${v.motivo}`, true);
  } else if (v?.dias && v.dias !== 7) {
    inf.linea(`Fuerza de héroe: ventana de ${v.dias} días (${v.usados} héroes; coherencia con 7 días r=${v.coherencia?.toFixed(3)})`);
  } else {
    inf.linea('Fuerza de héroe: ventana de 7 días (la ingesta no trae la reciente todavía)');
  }
  inf.linea(`API: ${meta.diagnostics?.base ?? 'desconocida'}`);
  if (meta.diagnostics?.conservado != null) {
    inf.check(!meta.diagnostics.conservado, `Última corrida con estadísticas nuevas (${(meta.diagnostics.frescos ?? []).join(', ') || 'ninguno'})`,
      `La última corrida NO descargó ${queFaltaDeLaCorrida(meta).join(' ni ') || `estadísticas de ${meta.rank ?? 'tu rango'}`}: se conservan las anteriores (API caída o cambiada)`, true);
  }
  // La fuerza puede salir del rango de respaldo (Mítico): si ese no se
  // descargó, la guarda compara y puntúa con un dato de otra corrida.
  const frescos = meta.diagnostics?.frescos;
  if (Array.isArray(frescos) && f?.rango && meta.statsByRank?.[f.rango] && !frescos.includes(f.rango)) {
    inf.check(false, '', `Fuerza de héroe: de ${f.rango}, que la última corrida NO descargó: es de una corrida anterior`, true);
  }
  // Las estadísticas que DECIDEN (las de 7 días del rango de la fuerza), no
  // las de la ingesta: con la guarda de rango activa eran las de Gloria y
  // un Mítico roto pasaba estas comprobaciones sin mirarlo.
  const st = Object.entries(datos.meta?.statsSemana ?? meta.stats ?? {});
  if (st.length) {
    const raros = st.filter(([, v]) => v?.winRate != null && (v.winRate < WINRATE_POSIBLE[0] || v.winRate > WINRATE_POSIBLE[1])).map(([n]) => n);
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
  // Un héroe recién salido (sin tags escritos a mano: `inferred`) no tiene
  // winrate los primeros días, y eso es legítimo: como FALLO tumbaba
  // `npm test` y con él el despliegue de los datos (auditoría de 3.21.1).
  // Uno CONOCIDO sin winrate sí es una descarga rota.
  const faltanConocidos = cov.faltan.filter((n) => !datos.porNombre.get(n)?.inferred);
  const faltanNuevos = cov.faltan.filter((n) => datos.porNombre.get(n)?.inferred);
  inf.check(!faltanConocidos.length, `Winrates: ${cov.conDatos}/${cov.total} héroes de tu línea`,
    `Winrates: faltan ${faltanConocidos.length} (${faltanConocidos.slice(0, 8).join(', ')})`);
  if (faltanNuevos.length) inf.add('AVISO', `Héroes nuevos sin winrate todavía (normal los primeros días): ${faltanNuevos.join(', ')}`);
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
  // Las curvas por duración (3.43.0): sin ellas el plan de partida se queda
  // sin fases y nada más se entera. La de su línea o, si no juega esa, otra.
  const curvas = datos.meta?.curvaLinea ?? {};
  if (Object.keys(curvas).length) {
    const conCurva = pool.filter((h) => curvas[nombreClave(h.name)]?.[linea]).length;
    inf.check(conCurva >= pool.length * 0.8, `Fases: ${conCurva}/${pool.length} héroes de tu línea con curva por duración`,
      `Fases: solo ${conCurva} de ${pool.length} héroes de tu línea con curva por duración: el plan habla de fases con medio equipo`, true);
  } else {
    inf.check(false, '', 'Fases: sin curvas por duración: el plan de partida no dice cómo va según el minuto (¿falla la ruta win-rate/timeline?)', true);
  }
  // Lo conservado de otra corrida (3.43.2): con la ruta cambiada de forma,
  // las curvas y el winrate por línea se quedaban los de antes para siempre
  // y la cobertura seguía diciendo «37/37».
  const lin = meta?.diagnostics?.lineas;
  if (lin?.curvasConservadas > 0) inf.check(false, '', `Fases: ${lin.curvasConservadas} curvas por duración son de una corrida anterior (la última no las trajo)`, true);
  if (lin?.conservados > 0) inf.check(false, '', `Winrate por línea: ${lin.conservados} pares son de una corrida anterior (la última no los trajo)`, true);
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
  // Un héroe al que le rehacen las habilidades conserva su nombre y sus tags
  // viejos: no lo ve el aviso de arriba, que solo mira quién FALTA. Con la
  // matriz de cruces al 100% un tag rancio no decide ningún counter, pero sí
  // ensucia el consejo de composición y el texto de los motivos.
  const cambiados = meta?.heroesCambiados ?? [];
  inf.check(!cambiados.length, 'Kits: ninguno rehecho desde que se escribieron sus tags',
    `Kits rehechos, tags escritos para otro héroe: ${cambiados.slice(0, 6).map((h) => `${h.name} (${h.antes} → ${h.ahora})`).join(', ')}`, true);
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

/**
 * En qué parte de los pares del día sale cada motivo con dato: «ganas el
 * cruce» (cruce ≥ `CRUCE_DESTACABLE`) y «combina bien» (pareja ≥
 * `PAREJA_DESTACABLE`). Calibrados al p90 de un parche asentado; un día
 * ruidoso los saca de la cola (1 de octubre de 2026: las parejas al 27%).
 *
 * @returns {{ cruces: number, parejas: number } | null}  null sin cien pares
 */
export function medirColas(meta) {
  const nombres = Object.keys(meta?.stats ?? {});
  const parte = (m, f, umbral) => {
    if (!m) return null;
    let n = 0, encima = 0;
    for (let i = 0; i < nombres.length; i++) for (let j = i + 1; j < nombres.length; j++) {
      const x = f(m, nombres[i], nombres[j]);
      if (x == null) continue;
      n += 1;
      if (x >= umbral) encima += 1;
    }
    return n >= 100 ? encima / n : null;
  };
  const cruces = parte(meta?.counters, cruce, CRUCE_DESTACABLE);
  const parejas = parte(meta?.synergies, sinergia, PAREJA_DESTACABLE);
  return cruces == null && parejas == null ? null : { cruces, parejas };
}

/** Salud estadística de los datos. No va en las pruebas a propósito: mira los DATOS, que cambian dos veces al día. */
export function seccionSalud(inf, { datos }) {
  const colas = medirColas(datos.meta);
  if (colas) {
    const [desde, hasta] = COLA_DEL_MOTIVO;
    const pct = (x) => (x == null ? 'sin dato' : `${(x * 100).toFixed(1)}%`);
    const enCola = (x) => x == null || (x >= desde && x <= hasta);
    inf.linea(`Motivos con dato: «ganas el cruce» en el ${pct(colas.cruces)} de los cruces, «combina bien» en el ${pct(colas.parejas)} de las parejas (calibrados al 10%)`);
    inf.check(enCola(colas.cruces) && enCola(colas.parejas), 'Los motivos con dato salen en la cola de la distribución',
      `Los motivos con dato se salen de la cola (cruces ${pct(colas.cruces)}, parejas ${pct(colas.parejas)}; calibrados entre el ${desde * 100}% y el ${hasta * 100}%): el dato de hoy es más disperso que el del parche con el que se calibraron los umbrales, y el motivo dice menos`, true);
  }
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
