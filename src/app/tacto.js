/**
 * Un toque que se nota (3.22.0): un pulso corto al marcar o quitar algo del
 * draft, como el «tic» de los selectores de iOS y Android. Con la partida
 * encima se mira la rejilla y no el hueco: el pulso dice «entró» sin
 * levantar la vista. Solo lo hace un navegador con `navigator.vibrate`
 * (Chrome en Android); en iOS no existe y no pasa nada.
 *
 * Se llama SOLO desde lo que toca el dedo (selector, chips, ×, nombre de la
 * tarjeta), nunca desde el estado: la limpieza de nombres al cargar el
 * catálogo también cambia el draft y no debe vibrar.
 */

/** Decisión de producto: el pulso más corto que se nota en un móvil de gama media. */
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
