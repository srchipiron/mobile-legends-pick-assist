import { nombreClave } from './nombres.js';
import { maestriaEfectiva, winrateDeReferencia } from './maestria.js';

/**
 * Registro de partidas: a quién cogiste, a quién recomendaba la app, la
 * probabilidad que estimaba, los baneos y si ganaste. Es lo único que puede
 * decir si acertar el pick que recomienda la app hace ganar más.
 *
 * Una partida apuntada: `{ t, pick, gane, rango, recomendados, estimacion?, bans?, draft?, lector?, previa? }`.
 * El instante `t` ES su identidad: por ahí se quita, se corrige y se
 * deduplica al fundir perfiles.
 *
 * `draft` (3.5.0) es el draft que tenías delante: `{ linea, enemigos,
 * aliados, rival? }`, unos 200 bytes. Es lo que hace medible el modelo en
 * TU cola (re-puntuar partidas viejas con cada modelo nuevo, como
 * `medir-pro.mjs` con las pro): una partida apuntada sin su draft es
 * irrecuperable. Se guarda tal cual estaba, con nombres, como el draft.
 */

/** El draft de una partida, con la forma esperada, o null si no hay nada que guardar. */
export function sanearDraft(draft) {
  if (!draft || typeof draft !== 'object' || Array.isArray(draft)) return null;
  const nombres = (lista, max) => (Array.isArray(lista) ? lista.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim()).slice(0, max) : []);
  const salida = { enemigos: nombres(draft.enemigos, 5), aliados: nombres(draft.aliados, 4) };
  if (typeof draft.linea === 'string' && draft.linea) salida.linea = draft.linea;
  if (typeof draft.rival === 'string' && draft.rival && salida.enemigos.includes(draft.rival)) salida.rival = draft.rival;
  return salida.enemigos.length || salida.aliados.length || salida.linea ? salida : null;
}

/**
 * Lo que leyó el lector de la tablet en esa partida (3.25.0): `{ baneos,
 * enemigos }`, nombres. Se guarda con la partida para MEDIR el lector contra
 * lo que acabó en el draft (`aciertosDelLector`): lo que Javi corrigió a
 * mano es justo lo que el lector leyó mal.
 */
export function sanearLectura(lectura) {
  if (!lectura || typeof lectura !== 'object' || Array.isArray(lectura)) return null;
  const nombres = (lista, max) => (Array.isArray(lista) ? lista.filter((n) => typeof n === 'string' && n.trim()).map((n) => n.trim()).slice(0, max) : []);
  const salida = { baneos: nombres(lectura.baneos, 10), enemigos: nombres(lectura.enemigos, 5) };
  // Tu equipo y tu fila (3.31.0).
  const aliados = nombres(lectura.aliados, 5);
  if (aliados.length) salida.aliados = aliados;
  if (typeof lectura.tuyo === 'string' && lectura.tuyo.trim()) salida.tuyo = lectura.tuyo.trim().slice(0, 40);
  // Los ids de las capturas del lector (3.27.0): con ellos la app le devuelve
  // lo que había de verdad, para que aprenda. Solo viven en el draft.
  const ids = Array.isArray(lectura.ids) ? lectura.ids.filter((x) => typeof x === 'string' && /^lectura-[\w-]{1,60}$/.test(x)).slice(-20) : [];
  if (ids.length) salida.ids = ids;
  // Lo que no reconoció en la última lectura (3.28.0): hueco, candidato y
  // parecido. Y lo que aprendió de la corrección. Viajan con la partida.
  const dudas = Array.isArray(lectura.dudas) ? lectura.dudas
    .filter((d) => d && typeof d === 'object' && /^[tsea][1-5]$/.test(d.hueco) && typeof d.candidato === 'string' && d.candidato.trim() && Number.isFinite(Number(d.parecido)))
    .map((d) => ({ hueco: d.hueco, candidato: d.candidato.trim().slice(0, 40), parecido: Math.max(0, Math.min(1, Math.round(Number(d.parecido) * 100) / 100)) })).slice(0, 15) : [];
  if (dudas.length) salida.dudas = dudas;
  const a = lectura.aprendizaje;
  if (a && typeof a === 'object') {
    const aprendizaje = { aprendidos: nombres(a.aprendidos, 10), sinEncontrar: nombres(a.sinEncontrar, 10) };
    if (aprendizaje.aprendidos.length || aprendizaje.sinEncontrar.length) salida.aprendizaje = aprendizaje;
  }
  return salida.baneos.length || salida.enemigos.length || salida.aliados || salida.tuyo || ids.length || dudas.length || salida.aprendizaje ? salida : null;
}

/**
 * ¿Cuánto acierta el lector? De lo que puso en el draft, cuánto seguía ahí
 * al apuntar la partida: un nombre leído que no está en los baneos ni en
 * los enemigos finales es uno que Javi tuvo que quitar. `fallos` dice
 * cuáles, para afinar el reconocimiento con esos héroes.
 */
export function aciertosDelLector(partidas = []) {
  const con = (partidas ?? []).filter((p) => sanearLectura(p?.lector));
  const fallos = {};
  let leidos = 0, acertados = 0;
  for (const p of con) {
    const l = sanearLectura(p.lector);
    const finales = new Set([...(p.bans ?? []), ...(p.draft?.enemigos ?? []), ...(p.draft?.aliados ?? []), ...(p.pick ? [p.pick] : [])].map(nombreClave));
    for (const n of [...l.baneos, ...l.enemigos, ...(l.aliados ?? []), ...(l.tuyo ? [l.tuyo] : [])]) {
      leidos += 1;
      if (finales.has(nombreClave(n))) acertados += 1;
      else fallos[n] = (fallos[n] ?? 0) + 1;
    }
  }
  // Lo que dudó (3.28.0): a quién se parecía cada hueco sin reconocer, y qué
  // aprendió o no encontró al corregir. Agregado por nombre.
  const dudas = {}, aprendidos = {}, sinEncontrar = {};
  for (const p of con) {
    const l = sanearLectura(p.lector);
    for (const d of l.dudas ?? []) dudas[d.candidato] = (dudas[d.candidato] ?? 0) + 1;
    for (const n of l.aprendizaje?.aprendidos ?? []) aprendidos[n] = (aprendidos[n] ?? 0) + 1;
    for (const n of l.aprendizaje?.sinEncontrar ?? []) sinEncontrar[n] = (sinEncontrar[n] ?? 0) + 1;
  }
  return { partidas: con.length, leidos, acertados, acierto: leidos ? acertados / leidos : null, fallos, dudas, aprendidos, sinEncontrar };
}

/** Partidas mínimas de cada rama antes de que los números signifiquen algo. */
export const MINIMO_PARA_CONCLUIR = 30;

/** Partidas con estimación a partir de las cuales se dice algo de la calibración. */
export const MINIMO_PARA_CALIBRAR = 20;

/**
 * Una partida nueva al principio de la lista, recortada a `tope`. Dos toques
 * rápidos caían en el mismo milisegundo y borrar una se llevaba las dos:
 * los instantes repetidos se desempatan.
 */
export function apuntar(partidas, entrada, tope = 500) {
  const ocupados = new Set((partidas ?? []).map((p) => p.t));
  let t = entrada.t ?? Date.now();
  while (ocupados.has(t)) t += 1;
  const limpia = {
    t,
    pick: String(entrada.pick ?? '').trim(),
    recomendados: (Array.isArray(entrada.recomendados) ? entrada.recomendados : []).slice(0, 3),
    gane: !!entrada.gane,
    rango: entrada.rango ?? null,
    ...(typeof entrada.estimacion === 'number' && entrada.estimacion > 0 && entrada.estimacion < 1
      ? { estimacion: Math.round(entrada.estimacion * 1000) / 1000 } : {}),
    ...(entrada.previa ? { previa: true } : {}),
    // Apuntada SOLA por el lector del resultado (3.32.0): se mide aparte.
    ...(entrada.origen === 'lector' ? { origen: 'lector' } : {}),
    ...(Array.isArray(entrada.bans) && entrada.bans.some((b) => typeof b === 'string' && b)
      ? { bans: entrada.bans.filter((b) => typeof b === 'string' && b).slice(0, 10) } : {}),
    ...(sanearDraft(entrada.draft) ? { draft: sanearDraft(entrada.draft) } : {}),
    ...(sanearLectura(entrada.lector) ? { lector: sanearLectura(entrada.lector) } : {}),
  };
  if (!limpia.pick) return partidas;
  return [limpia, ...(partidas ?? [])].sort((a, b) => (b.t ?? 0) - (a.t ?? 0)).slice(0, tope);
}

/** Quitar una partida apuntada por error. */
export const olvidar = (partidas = [], t) => partidas.filter((p) => p.t !== t);

/** Cambiar el resultado de una partida mal apuntada. */
export const corregir = (partidas = [], t, gane) => partidas.map((p) => (p.t === t ? { ...p, gane: !!gane } : p));

/**
 * ¿Es de antes de usar la app? Cuenta para la maestría y NO para comprobar si
 * la app acierta: jugar sin la app abierta no es ignorar su consejo.
 */
export const esPrevia = (p) => !!p?.previa;

/** ¿El pick estaba entre lo recomendado? Por clave, no crudo: la API cambia grafías. */
export function siguioConsejo(partida) {
  const pick = nombreClave(partida?.pick);
  if (!pick) return false;
  return (partida.recomendados ?? []).some((n) => nombreClave(n) === pick);
}

/**
 * ¿La probabilidad estimada se parece a lo que pasa? Media prevista frente a
 * winrate real, Brier (0.25 es una moneda) con su error típico, y si con
 * ≥50% se ganó más que con <50%. Sin margen, el modelo perfecto disparaba
 * «peor que una moneda» un tercio de las veces con 20 partidas.
 */
export function calibracion(partidas = []) {
  const con = partidas.filter((p) => !esPrevia(p) && typeof p.estimacion === 'number');
  const n = con.length;
  if (!n) return { n: 0, concluyente: false, faltan: MINIMO_PARA_CALIBRAR };
  const media = (lista, f) => lista.reduce((acc, p) => acc + f(p), 0) / lista.length;
  const ganada = (p) => (p.gane ? 1 : 0);
  const altas = con.filter((p) => p.estimacion >= 0.5);
  const bajas = con.filter((p) => p.estimacion < 0.5);
  const brier = media(con, (p) => (p.estimacion - ganada(p)) ** 2);
  const brierSE = n > 1 ? Math.sqrt(con.reduce((acc, p) => acc + ((p.estimacion - ganada(p)) ** 2 - brier) ** 2, 0) / (n - 1) / n) : 0;
  return {
    n,
    prevista: media(con, (p) => p.estimacion),
    real: media(con, ganada),
    brier,
    brierSE,
    brierMoneda: 0.25,
    peorQueMoneda: n >= MINIMO_PARA_CALIBRAR && brier - 1.96 * brierSE > 0.25,
    altas: { n: altas.length, real: altas.length ? media(altas, ganada) : null },
    bajas: { n: bajas.length, real: bajas.length ? media(bajas, ganada) : null },
    concluyente: n >= MINIMO_PARA_CALIBRAR,
    faltan: Math.max(0, MINIMO_PARA_CALIBRAR - n),
  };
}

/**
 * Partidas necesarias para distinguir del azar una diferencia como la vista:
 * UNA muestra contra una referencia conocida (miles de partidas), al 5% y 80%
 * de potencia. La fórmula de dos muestras con el coeficiente doblado pedía
 * 189 donde hacen falta 50.
 */
const Z_ALFA = 1.96;
const Z_POTENCIA = 0.84;
function partidasNecesarias(p, base) {
  const dif = Math.abs(p - base);
  if (!(dif > 0)) return Infinity;
  const t = Z_ALFA * Math.sqrt(base * (1 - base)) + Z_POTENCIA * Math.sqrt(p * (1 - p));
  return Math.ceil((t * t) / (dif * dif));
}

/**
 * Las dos comparaciones del Veredicto:
 *  - siguiendo la app contra por libre: limpia en teoría, inalcanzable en la
 *    práctica (la rama «por libre» solo crece ignorando la app a propósito) y
 *    NO aleatorizada;
 *  - siguiendo la app contra tu winrate de siempre: se llena jugando. La
 *    referencia es la maestría MANUAL más las partidas previas, nunca las
 *    que se comparan: con ellas dentro la diferencia salía 0 y «faltan
 *    Infinity».
 */
export function resumen(partidas = [], maestria = {}) {
  const conApp = partidas.filter((p) => !esPrevia(p));
  const con = conApp.filter(siguioConsejo);
  const sin = conApp.filter((p) => !siguioConsejo(p));
  const wr = (lista) => (lista.length ? lista.filter((p) => p.gane).length / lista.length : null);
  const wrSiguiendo = wr(con);
  const referencia = winrateDeReferencia(maestriaEfectiva(maestria, partidas.filter(esPrevia)));

  let contraReferencia = null;
  if (wrSiguiendo != null && referencia && con.length >= 5) {
    // Error con la referencia, no con lo observado (prueba de puntuación):
    // con 11 partidas ganadas todas, Wald daría error CERO.
    const p0 = referencia.winRate;
    const se = Math.sqrt(p0 * (1 - p0) / con.length);
    const dif = wrSiguiendo - p0;
    const necesarias = partidasNecesarias(wrSiguiendo, p0);
    contraReferencia = {
      base: p0,
      partidasBase: referencia.partidas,
      dif,
      margen: 1.96 * se,
      seVe: se > 0 && Math.abs(dif) > 1.96 * se,
      faltan: Number.isFinite(necesarias) ? Math.max(0, necesarias - con.length) : null,
    };
  }
  // Siguiendo contra por libre, con su margen (3.18.0). Hasta ahora, con 30 y
  // 30, el informe decía «se puede concluir» sin decir QUÉ: con 69,8% (63)
  // frente a 71,9% (32) la diferencia es −2 puntos y el margen ±19. Prueba de
  // dos proporciones con el error AGRUPADO: con Wald, una rama ganada entera
  // daría error cero (el mismo fallo que ya costó la otra comparación).
  let entreRamas = null;
  if (con.length >= MINIMO_PARA_CONCLUIR && sin.length >= MINIMO_PARA_CONCLUIR) {
    const a = wrSiguiendo; const b = wr(sin);
    const p = (a * con.length + b * sin.length) / (con.length + sin.length);
    const se = Math.sqrt(p * (1 - p) * (1 / con.length + 1 / sin.length));
    const dif = a - b;
    entreRamas = { dif, margen: 1.96 * se, seVe: se > 0 && Math.abs(dif) > 1.96 * se };
  }
  return {
    total: partidas.length,
    previas: partidas.length - conApp.length,
    siguiendo: con.length,
    porLibre: sin.length,
    wrSiguiendo,
    wrPorLibre: wr(sin),
    referencia,
    contraReferencia,
    entreRamas,
    concluyente: con.length >= MINIMO_PARA_CONCLUIR && sin.length >= MINIMO_PARA_CONCLUIR,
    faltan: Math.max(0, MINIMO_PARA_CONCLUIR - con.length) + Math.max(0, MINIMO_PARA_CONCLUIR - sin.length),
  };
}
