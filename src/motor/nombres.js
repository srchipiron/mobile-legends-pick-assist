/**
 * Nombres de héroe: la clave de todos los datos.
 *
 * La API y el catálogo escriben lo mismo de formas distintas («X.Borg» /
 * «X Borg», «Yi Sun-shin» / «Yi Sun Shin», «Chang'e» / «Change»), y un fallo
 * aquí es invisible: el héroe se queda sin datos y nadie se entera. Todo se
 * busca por la clave normalizada, y las matrices se indexan en sus DOS
 * niveles (`indexarPorNombre(m, 2)`): con uno solo, el segundo nivel se
 * quedaba crudo y `riesgoContrapick` devolvía null para 34 héroes sin que
 * nada chillara (0.4.0).
 */

/** Clave normalizada de un nombre: minúsculas, sin tildes, sin signos. */
export const nombreClave = (nombre) =>
  String(nombre ?? '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, 'and') // «Popol & Kupa» = «Popol and Kupa»
    .replace(/[^a-z0-9]/g, '');

/**
 * Reindexa `{ nombre: valor }` por clave. `niveles` dice cuántos niveles de
 * nombres hay: 1 para las estadísticas, 2 para las matrices de cruces y
 * parejas. Se dice, no se adivina: adivinarlo por la forma del valor rompía
 * en silencio con una estadística sin `winRate`.
 */
export function indexarPorNombre(obj, niveles = 1) {
  if (!obj) return undefined;
  const salida = {};
  for (const [k, v] of Object.entries(obj)) salida[nombreClave(k)] = niveles > 1 ? indexarPorNombre(v, niveles - 1) : v;
  return salida;
}

/**
 * Busca por clave y, si no, por el nombre tal cual. El respaldo importa: si
 * quien llama no indexó el mapa, sin él todo el mundo empataba a 0.50 sin
 * ningún aviso. Dentro de una fila, usa siempre esto, nunca `fila[clave]`.
 */
export const buscar = (mapa, nombre) => {
  if (!mapa) return undefined;
  return mapa[nombreClave(nombre)] ?? mapa[nombre];
};

/** ¿Dos nombres son el mismo héroe? */
export const mismoHeroe = (a, b) => nombreClave(a) === nombreClave(b);

/**
 * Identidad de un motivo: clave más a quién señala. Sin el «a quién», dos
 * motivos sobre enemigos distintos se tomarían por el mismo y se filtrarían
 * mal. De esto dependen el filtro de motivos comunes y el dedupe.
 */
export const idMotivo = (m) => `${m.clave}|${m.params?.e ?? m.params?.a ?? ''}`;
