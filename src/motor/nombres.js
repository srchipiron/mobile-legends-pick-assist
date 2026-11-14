/**
 * Nombres de héroe: la clave de todos los datos.
 *
 * La API y el catálogo escriben lo mismo de formas distintas («X.Borg» / «X Borg»,
 * «Chang'e» / «Change»), y un fallo aquí es invisible: el héroe se queda sin datos.
 * Todo se busca por la clave normalizada, y las matrices se indexan en sus DOS
 * niveles (con uno, el segundo nivel se quedaba crudo y 34 héroes perdían su riesgo).
 */

/** Minúsculas, sin tildes, «&» = «and», sin signos. */
export const nombreClave = (nombre) => String(nombre ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[̀-ͯ]/g, '')
  .replace(/&/g, 'and')
  .replace(/[^a-z0-9]/g, '');

/**
 * Reindexa `{nombre: valor}` por clave. `niveles`: 1 para estadísticas, 2 para
 * cruces y parejas. Se dice, no se adivina por la forma del valor.
 */
export function indexarPorNombre(obj, niveles = 1) {
  if (!obj) return undefined;
  const salida = {};
  for (const [k, v] of Object.entries(obj)) salida[nombreClave(k)] = niveles > 1 ? indexarPorNombre(v, niveles - 1) : v;
  return salida;
}

/** Por clave y, si no, por el nombre tal cual (un mapa sin indexar no puede empatar a todos a 0,5 en silencio). */
export const buscar = (mapa, nombre) => (mapa ? mapa[nombreClave(nombre)] ?? mapa[nombre] : undefined);

/**
 * Identidad de un motivo: clave (sin el matiz «Poco») + a quién señala. De esto
 * dependen el filtro de motivos comunes y el de repetidos.
 */
export const idMotivo = (m) => `${m.clave.replace(/Poco$/, '')}|${m.params?.e ?? m.params?.a ?? ''}`;
