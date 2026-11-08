/**
 * Lo que queda de la subida a GitHub (3.10.0–3.97.0). Tus partidas subían
 * solas a una incidencia del proyecto; desde 3.98.0 van solo a la base de
 * datos (useComunidad), y el token de GitHub queda para la administración
 * (publicar licencias y comunidad.json, github.js). Aquí: la huella y los
 * plazos que comparte useComunidad, y lo guardado en `roam-picker:envio`.
 * Puro, sin React ni red.
 */

/** Cuánto se espera tras un cambio antes de subir: corregir un resultado justo después de apuntarlo sube una vez, no dos. Decisión de producto. */
export const ESPERA_MS = 3000;

/** Tras un fallo (sin red, clave caducada), cuánto se espera antes de volver a intentarlo con los mismos datos. Decisión de producto. */
export const REINTENTO_MS = 10 * 60 * 1000;

/**
 * Huella de lo que se sube (partidas y maestría): si no cambia, no se sube.
 * FNV-1a sobre el JSON, con el nº de partidas delante para leerla a ojo.
 */
export function huellaDe({ partidas = [], mastery = {} } = {}) {
  const texto = JSON.stringify({ p: partidas, m: mastery });
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${partidas.length}.${h.toString(16)}`;
}

/**
 * Lo guardado en `roam-picker:envio` (la clave no se renombra): desde 3.98.0
 * solo el token de GitHub. Lo demás que hubiera (la incidencia de tus
 * partidas, la de la tablet, lo ya subido) se olvida.
 */
export function sanearEnvio(x) {
  const o = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  return { token: typeof o.token === 'string' && o.token.trim() ? o.token.trim() : null };
}
