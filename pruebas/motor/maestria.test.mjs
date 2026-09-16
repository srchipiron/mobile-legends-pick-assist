/**
 * Pruebas de src/motor/maestria.js: tu maestría, escrita a mano o sacada de
 * las partidas apuntadas, leída por clave normalizada y comparada contra TU
 * nivel. La otra mitad de la prueba de perfiles (fundir y sanear) vive en
 * perfil.test.mjs.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { h } from '../fixtures/catalogo.mjs';
import { buscar } from '../../src/motor/nombres.js';
import { maestriaEfectiva, notaDeMaestria } from '../../src/motor/maestria.js';

test('perfiles y registro: fundir por instante, sanear lo que llega y maestria por nombre normalizado', () => {
  // 3. La maestria escrita como "X.Borg" le sirve al heroe "X Borg", y el
  //    motor la lee: antes 400 partidas desaparecian por un punto.
  const ef = maestriaEfectiva({ 'X.Borg': { games: 400, winRate: 0.6 } }, [{ t: 3, pick: 'X Borg', gane: true }]);
  eq(Object.keys(ef).length, 1, `dos claves para el mismo heroe: ${Object.keys(ef)}`);
  eq(buscar(ef, 'X Borg')?.games, 400, 'buscar no encuentra la maestria por el nombre del catalogo');
  ok(notaDeMaestria({ name: 'X Borg' }, ef).valor > 0.5, 'el motor no lee la maestria escrita con otra grafia');
  // 4. winRate null importado: neutro, no 0%.
  eq(notaDeMaestria({ name: 'A' }, { A: { games: 50, winRate: null } }).valor, 0.5, 'winRate null castiga en vez de ser neutro');
});

test('pocas partidas apenas mueven la maestría', () => {
  const muchas = notaDeMaestria(h('Belerick'), { Belerick: { games: 80, winRate: 0.62 } }).valor;
  const pocas = notaDeMaestria(h('Belerick'), { Belerick: { games: 3, winRate: 1.0 } }).valor;
  ok(pocas < muchas, '3 partidas al 100% no pueden pesar tanto');
});

await terminar('motor/maestria');
