/**
 * Los motivos de una sugerencia del consejo a los compañeros: los que van a
 * favor delante, sin perder el orden del motor, y como mucho tres. En pura
 * porque la prueba de navegador depende del dato del día: con los datos del
 * 27 de septiembre de 2026 ninguna sugerencia mezclaba los dos signos.
 */
import { test, eq, terminar } from '../arnes.mjs';
import { motivosAEnsenar } from '../../src/app/motivos.js';

const m = (id, bueno) => ({ id, bueno });
const ids = (l) => l.map((x) => x.id).join(',');

test('los motivos a favor van delante, en el orden del motor, y como mucho tres', () => {
  eq(ids(motivosAEnsenar([m('a', false), m('b', true), m('c', false), m('d', true)])), 'b,d,a', 'no pone los buenos delante');
  eq(ids(motivosAEnsenar([m('a', true), m('b', true), m('c', true), m('d', true)])), 'a,b,c', 'no corta a tres');
  eq(ids(motivosAEnsenar([m('a', false), m('b', false)])), 'a,b', 'sin motivos buenos pierde los malos');
  eq(ids(motivosAEnsenar([m('a', true), m('b', false)], 1)), 'a');
  eq(motivosAEnsenar().length, 0);
});

await terminar('app/motivos');
