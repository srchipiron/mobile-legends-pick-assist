/**
 * Pruebas de src/motor/matrices.js: la lectura de las matrices de la API
 * (cruces y parejas) y el recuento de lo que traen. Un héroe sin fila se
 * queda sin datos en silencio, así que la cobertura tiene que decir quién
 * falta, por nombre.
 */
import { test, ok, terminar } from '../arnes.mjs';
import { h } from '../fixtures/catalogo.mjs';
import { indexarPorNombre } from '../../src/motor/nombres.js';
import { cobertura } from '../../src/motor/matrices.js';

test('la cobertura detecta héroes sin datos', () => {
  const c = cobertura([h('Khufra'), h('Atlas')], indexarPorNombre({ Khufra: { winRate: 0.5 } }));
  ok(c.conDatos === 1 && c.faltan[0] === 'Atlas', JSON.stringify(c));
});

await terminar('motor/matrices');
