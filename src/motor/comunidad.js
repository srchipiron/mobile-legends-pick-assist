import { siguioConsejo, esPrevia, esSupuesta, calibracion } from './registro.js';

/**
 * ¿Ayuda la app? Con las partidas de TODOS los jugadores de la base de datos
 * (3.69.0). Las mismas preguntas que el Veredicto de cada uno (registro.js),
 * pero sin mezclar jugadores: uno que gana mucho y sigue mucho la app haría
 * parecer que seguirla ayuda aunque no cambie nada. Por eso:
 *
 * - **Siguiendo contra por libre, DENTRO de cada jugador**: la diferencia de
 *   cada uno (con al menos `MINIMO_POR_RAMA` partidas en cada rama), pesada
 *   por lo que informa (1 / (1/n_siguiendo + 1/n_libre)), con su error.
 *   Sigue sin estar aleatorizado: cada uno elige cuándo hacer caso.
 * - **Siguiendo contra tu winrate de siempre** (el de la maestría, que cada
 *   uno sube como `referencia`): victorias de más sobre lo esperado, sumadas
 *   jugador a jugador, con la varianza de la binomial de cada uno.
 * - Lo mismo **solo con las apuntadas por el lector** (`origen: 'lector'`):
 *   las de a mano pueden llevar el sesgo de apuntar más las ganadas.
 * - La **calibración** de la probabilidad, con `calibracion` de siempre.
 *
 * `filas` es lo que da `partidas_comunidad`: `{ j, t, d }` (jugador, instante,
 * partida); `referencias`, `{ [j]: { winRate, partidas } }`.
 */

/** Partidas de un jugador en cada rama para que su diferencia cuente. Decisión de producto: con menos, su diferencia es ruido puro. */
export const MINIMO_POR_RAMA = 5;
/**
 * El winrate de siempre que se cree (el mismo filtro que el servidor): fuera
 * de 30–70% con cientos de partidas no existe en MLBB, y uno así inventado
 * movería la comparación de todos.
 */
export const REFERENCIA_POSIBLE = [0.3, 0.7];
/** Jugadores con algo que comparar para dar una conclusión (y no la de uno solo). Decisión de producto. */
export const MINIMO_JUGADORES = 3;

const Z = 1.96;

/** Las partidas válidas por jugador, sin las previas (de antes de usar la app). */
export function porJugador(filas = []) {
  const mapa = new Map();
  for (const f of filas) {
    const d = f?.d;
    if (!d || typeof d !== 'object' || typeof d.pick !== 'string' || typeof d.gane !== 'boolean' || esPrevia(d) || esSupuesta(d)) continue;
    const j = String(f.j);
    if (!mapa.has(j)) mapa.set(j, []);
    mapa.get(j).push(d);
  }
  return mapa;
}

/** Siguiendo contra por libre dentro de cada jugador, combinado. */
export function entreRamasPorJugador(mapa) {
  let pesos = 0; let suma = 0; let varianza = 0; let jugadores = 0;
  for (const partidas of mapa.values()) {
    const con = partidas.filter(siguioConsejo);
    const sin = partidas.filter((p) => !siguioConsejo(p));
    if (con.length < MINIMO_POR_RAMA || sin.length < MINIMO_POR_RAMA) continue;
    const a = con.filter((p) => p.gane).length / con.length;
    const b = sin.filter((p) => p.gane).length / sin.length;
    const p = partidas.filter((x) => x.gane).length / partidas.length;
    const w = 1 / (1 / con.length + 1 / sin.length);
    pesos += w; suma += w * (a - b);
    // Var(a−b) con la proporción agrupada del jugador; ponderada, w² · var.
    varianza += w * w * p * (1 - p) * (1 / con.length + 1 / sin.length);
    jugadores += 1;
  }
  if (!jugadores) return { jugadores: 0 };
  const dif = suma / pesos;
  const margen = Z * Math.sqrt(varianza) / pesos;
  return { jugadores, dif, margen, seVe: jugadores >= MINIMO_JUGADORES && margen > 0 && Math.abs(dif) > margen };
}

/** Siguiendo la app contra el winrate de siempre de cada uno: victorias de más por partida. */
export function contraReferencias(mapa, referencias = {}, { filtro = () => true } = {}) {
  let n = 0; let deMas = 0; let varianza = 0; let jugadores = 0; let ganadas = 0; let esperadas = 0;
  for (const [j, partidas] of mapa) {
    const ref = referencias?.[j];
    const p0 = ref?.winRate;
    if (!(typeof p0 === 'number' && p0 >= REFERENCIA_POSIBLE[0] && p0 <= REFERENCIA_POSIBLE[1])) continue;
    const con = partidas.filter((p) => siguioConsejo(p) && filtro(p));
    if (!con.length) continue;
    const g = con.filter((p) => p.gane).length;
    n += con.length; ganadas += g; esperadas += con.length * p0;
    deMas += g - con.length * p0;
    varianza += con.length * p0 * (1 - p0);
    jugadores += 1;
  }
  if (!n) return { jugadores: 0, n: 0 };
  const dif = deMas / n;
  const margen = Z * Math.sqrt(varianza) / n;
  return { jugadores, n, real: ganadas / n, esperado: esperadas / n, dif, margen, seVe: jugadores >= MINIMO_JUGADORES && margen > 0 && Math.abs(dif) > margen };
}

/** El informe entero. Nunca lanza: con datos raros, cuenta menos. */
export function medirComunidad(filas = [], referencias = {}) {
  const mapa = porJugador(Array.isArray(filas) ? filas : []);
  const todas = [...mapa.values()].flat();
  const con = todas.filter(siguioConsejo);
  const wr = (lista) => (lista.length ? lista.filter((p) => p.gane).length / lista.length : null);
  return {
    jugadores: mapa.size,
    partidas: todas.length,
    siguiendo: { n: con.length, winrate: wr(con) },
    libre: { n: todas.length - con.length, winrate: wr(todas.filter((p) => !siguioConsejo(p))) },
    entreRamas: entreRamasPorJugador(mapa),
    contraReferencia: contraReferencias(mapa, referencias),
    soloLector: contraReferencias(mapa, referencias, { filtro: (p) => p.origen === 'lector' }),
    calibracion: calibracion(todas),
  };
}
