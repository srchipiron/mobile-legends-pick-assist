/**
 * Pruebas de src/motor/nombres.js: la clave normalizada de un nombre, que es
 * la clave de TODOS los datos. La API y el catálogo escriben lo mismo de
 * formas distintas («X.Borg» / «X Borg»), y un fallo aquí es invisible: el
 * héroe se queda sin datos y nadie se entera.
 */
import { test, ok, terminar } from '../arnes.mjs';
import { nombreClave, indexarPorNombre } from '../../src/motor/nombres.js';

test('los nombres se normalizan pese a puntuación y variantes', () => {
  const pares = [['X.Borg', 'X Borg'], ['Yi Sun-shin', 'Yi Sun Shin'], ["Chang'e", 'Change'],
    ['Popol and Kupa', 'Popol & Kupa'], ['Lapu-Lapu', 'LapuLapu']];
  for (const [a, b] of pares) ok(nombreClave(a) === nombreClave(b), `${a} ≠ ${b}`);
});

test('las estadísticas indexadas solo se leen con el nombre normalizado', () => {
  // Este fallo estuvo publicado: la tarjeta buscaba stats[hero.name] contra un
  // mapa indexado en minúsculas, así que TODAS mostraban "sin datos".
  const idx = indexarPorNombre({ 'X.Borg': { winRate: 0.53 } });
  ok(idx['X.Borg'] === undefined, 'el nombre crudo no debería encontrar nada');
  ok(idx[nombreClave('X Borg')]?.winRate === 0.53, 'el normalizado sí debe encontrarlo');
});

test('la matriz de counters se indexa en sus DOS niveles', () => {
  // Este fallo estuvo publicado: App.jsx indexaba con profundidad 1, el segundo
  // nivel se quedaba crudo ("Wanwan") y todo lo que lo buscaba normalizado
  // fallaba en silencio.
  const crudo = { 'X.Borg': { Wanwan: 0.44 } };
  ok(indexarPorNombre(crudo)[nombreClave('X Borg')]?.[nombreClave('Wanwan')] === undefined,
    'con profundidad 1 el segundo nivel NO queda normalizado');
  ok(indexarPorNombre(crudo, 2)[nombreClave('X Borg')]?.[nombreClave('Wanwan')] === 0.44,
    'con profundidad 2 debe encontrarse por clave normalizada');
});

await terminar('motor/nombres');
