/**
 * Lo que comparten las pruebas del motor: el catálogo real, fundido sin API
 * (solo tags y roles escritos a mano), y un acceso por nombre que falla si el
 * héroe no existe, para que una prueba no pase en silencio con `undefined`.
 */
import { leerJson } from '../arnes.mjs';
import { fundirCatalogo } from '../../src/motor/catalogo.js';

export const catalogo = leerJson('public/data/heroes.json');
export const heroes = fundirCatalogo(catalogo.heroes, []);
export const poolRoam = heroes.filter((h) => h.roam);
const porNombre = new Map(heroes.map((h) => [h.name, h]));

/** El héroe del catálogo con ese nombre; lanza si no está. */
export const h = (n) => {
  const x = porNombre.get(n);
  if (!x) throw new Error(`el catálogo no tiene a ${n}`);
  return x;
};

/**
 * El generador congruencial de las pruebas antiguas. Solo MUESTREA drafts
 * sintéticos (no calibra nada), así que su correlación serial no importa;
 * cada fichero arranca su propia secuencia con `crearRnd()`.
 */
export const crearRnd = (semilla = 99) => {
  let s = semilla;
  return () => (s = (s * 1103515245 + 12345) % 2147483648) / 2147483648;
};
