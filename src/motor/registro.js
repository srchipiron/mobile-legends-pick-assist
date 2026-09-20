import { nombreClave } from './nombres.js';
import { maestriaEfectiva, winrateDeReferencia } from './maestria.js';

/**
 * Registro de partidas: a quién cogiste, a quién recomendaba la app, la
 * probabilidad que estimaba, los baneos y si ganaste. Es lo único que puede
 * decir si acertar el pick que recomienda la app hace ganar más.
 *
 * Una partida apuntada: `{ t, pick, gane, rango, recomendados, estimacion?, bans?, draft?, previa? }`.
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
    ...(Array.isArray(entrada.bans) && entrada.bans.some((b) => typeof b === 'string' && b)
      ? { bans: entrada.bans.filter((b) => typeof b === 'string' && b).slice(0, 10) } : {}),
    ...(sanearDraft(entrada.draft) ? { draft: sanearDraft(entrada.draft) } : {}),
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
  return {
    total: partidas.length,
    previas: partidas.length - conApp.length,
    siguiendo: con.length,
    porLibre: sin.length,
    wrSiguiendo,
    wrPorLibre: wr(sin),
    referencia,
    contraReferencia,
    concluyente: con.length >= MINIMO_PARA_CONCLUIR && sin.length >= MINIMO_PARA_CONCLUIR,
    faltan: Math.max(0, MINIMO_PARA_CONCLUIR - con.length) + Math.max(0, MINIMO_PARA_CONCLUIR - sin.length),
  };
}
