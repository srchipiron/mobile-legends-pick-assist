/**
 * Un pulso corto al tocar algo del draft («entró», sin levantar la vista de
 * la rejilla). Solo desde lo que toca el dedo, nunca desde el estado (la
 * limpieza de nombres al cargar cambia el draft y no debe vibrar). Solo con
 * `navigator.vibrate` (Chrome en Android).
 */

/** [P] El pulso más corto que se nota en un móvil de gama media. */
export const PULSO_MS = 10;

let activo = true;

/** Lo enciende o lo apaga el ajuste guardado (`useAjustes`). */
export function activarTacto(valor) { activo = valor !== false; }

/** ¿Puede vibrar este navegador? Sin eso el interruptor ni se enseña. */
export function puedeVibrar() {
  return typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';
}

/** Un pulso. Devuelve si se pidió (para las pruebas); nunca lanza. */
export function tic() {
  if (!activo || !puedeVibrar()) return false;
  try { return navigator.vibrate(PULSO_MS) !== false; } catch { return false; }
}
