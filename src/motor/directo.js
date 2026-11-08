import { TRAMOS } from './fases.js';

/**
 * La DURACIÓN de una partida y su tramo (3.44.0). Aquí vivían también los
 * consejos en voz alta por minutos (el «guion»); se quitaron en 3.96.0, a
 * petición de Javi, con la voz. Queda lo que usan el registro de partidas y
 * el lector: qué duración es posible y en qué tramo de fases cae.
 */

/**
 * Lo que puede durar una partida, en minutos: los mismos límites que
 * `tramoDe` de medir-fases.mjs (de 3 a 90, sin los extremos). Fuera de eso
 * es una medida rota, no una partida: ni tramo ni duración apuntada.
 */
export const DURACION_MINIMA = 3;
export const DURACION_MAXIMA = 90;
export const esDuracionPosible = (min) => typeof min === 'number' && min > DURACION_MINIMA && min < DURACION_MAXIMA;

/**
 * El tramo de una duración en minutos (10–12 → 0 … 20+ → 4 y 5): el mismo
 * reparto que medir-fases.mjs, para que lo que se mide en tus partidas sea
 * lo mismo que se midió en las pro.
 */
export function tramoDeMinutos(min) {
  if (!esDuracionPosible(min)) return null;
  return Math.max(0, Math.min(TRAMOS.length - 1, Math.floor((min - TRAMOS[0]) / 2)));
}
