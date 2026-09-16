/**
 * Pruebas de src/motor/maestria.js: tu maestría, escrita a mano o sacada de
 * las partidas apuntadas, leída por clave normalizada y comparada contra TU
 * nivel. La otra mitad de la prueba de perfiles (fundir y sanear) vive en
 * perfil.test.mjs.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { h } from '../fixtures/catalogo.mjs';
import { buscar, nombreClave } from '../../src/motor/nombres.js';
import { maestriaEfectiva, maestriaDesdeRegistro, notaDeMaestria, priorDeMaestria } from '../../src/motor/maestria.js';
import { generador } from '../../src/motor/robustez.js';

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

test('revision linea a linea del registro: la maestria del registro suma las dos grafias', () => {
  // 3. «X.Borg» escrito a mano y «X Borg» en el catálogo: 400 partidas fuera
  //    del ranking sin aviso. Se agrupa por clave, no por el nombre crudo.
  const grafias = [
    ...Array.from({ length: 30 }, (_, i) => ({ t: i, pick: 'X.Borg', gane: true })),
    ...Array.from({ length: 30 }, (_, i) => ({ t: 100 + i, pick: 'X Borg', gane: false })),
  ];
  const porRegistro = Object.entries(maestriaDesdeRegistro(grafias)).find(([n]) => nombreClave(n) === 'xborg')?.[1];
  eq(porRegistro?.games, 60, `X.Borg y X Borg se cuentan aparte: ${JSON.stringify(maestriaDesdeRegistro(grafias))}`);
  eq(maestriaEfectiva({}, grafias).xborg?.games, 60, 'maestriaEfectiva se queda con la mitad de las partidas');
});

test('revision linea a linea del registro: priorDeMaestria recupera k = 0.25/sigma cuadrado', () => {
  // 8. En un encogimiento bayesiano el prior NO es libre: k = 0.25/σ², con σ
  //    la dispersión REAL del winrate entre tus héroes. Se simulan 12 héroes
  //    × 300 partidas con σ 0.04 (con corrección de Bessel) y tiene que salir
  //    k ≈ 156. El 20 de antes suponía ±11 puntos y cinco partidas al 90%
  //    puntuaban 0.87.
  const rnd = generador(99);
  const ks = [];
  for (let rep = 0; rep < 120; rep++) {
    const maestria = {};
    for (let i = 0; i < 12; i++) {
      const u1 = rnd() || 1e-9; const u2 = rnd();
      const wrReal = 0.5 + 0.04 * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      let wins = 0; for (let g = 0; g < 300; g++) if (rnd() < wrReal) wins++;
      maestria[`H${i}`] = { games: 300, winRate: wins / 300 };
    }
    ks.push(priorDeMaestria(maestria));
  }
  ks.sort((a, b) => a - b);
  const medianaK = ks[Math.floor(ks.length / 2)];
  ok(Math.abs(medianaK - 156) / 156 <= 0.12, `k mediano ${medianaK.toFixed(0)}, esperado 156 ± 12%`);
});

await terminar('motor/maestria');
