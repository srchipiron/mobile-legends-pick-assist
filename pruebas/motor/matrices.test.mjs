/**
 * Pruebas de src/motor/matrices.js: la lectura de las matrices de la API
 * (cruces y parejas) y el recuento de lo que traen. Un héroe sin fila se
 * queda sin datos en silencio, así que la cobertura tiene que decir quién
 * falta, por nombre.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { h } from '../fixtures/catalogo.mjs';
import { indexarPorNombre } from '../../src/motor/nombres.js';
import { cobertura, sinergia } from '../../src/motor/matrices.js';
import { terminoPareja } from '../../src/motor/modelo.js';

test('la cobertura detecta héroes sin datos', () => {
  const c = cobertura([h('Khufra'), h('Atlas')], indexarPorNombre({ Khufra: { winRate: 0.5 } }));
  ok(c.conDatos === 1 && c.faltan[0] === 'Atlas', JSON.stringify(c));
});

test('la sinergia se lee en los dos sentidos, como los counters', () => {
  // Llevar a A con B es lo mismo que llevar a B con A, asi que el dato vale
  // igual por los dos lados. NO se le da la vuelta: eso es cosa de los
  // counters, donde A gana lo que B pierde.
  const m = indexarPorNombre({ Tigreal: { Layla: 0.56, Franco: 0.44 } }, 2);
  eq(sinergia(m, 'Tigreal', 'Layla'), 0.56);
  eq(sinergia(m, 'Layla', 'Tigreal'), 0.56, 'no encuentra el dato por el otro lado');
  eq(sinergia(m, 'Layla', 'Franco'), undefined, 'se inventa una sinergia que no existe');

  // Y que el termino de parejas lo aproveche de verdad: sin esto el dato
  // existia y no lo miraba nadie, que es como se perdia el 37% de los cruces.
  const yo = { name: 'Layla', tags: [] };
  const aliado = { name: 'Tigreal', tags: [] };
  const conDato = terminoPareja(yo, aliado, m, 0.5).valor;
  const sinDato = terminoPareja(yo, aliado, indexarPorNombre({}, 2), 0.5).valor;
  ok(conDato > sinDato, 'no usa el dato de sinergia cuando solo esta apuntado del otro lado');
});

await terminar('motor/matrices');
