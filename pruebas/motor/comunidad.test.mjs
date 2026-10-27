import { test, ok, eq, casi, terminar } from '../arnes.mjs';
import { medirComunidad, porJugador, MINIMO_POR_RAMA } from '../../src/motor/comunidad.js';

let t = 1788000000000;
/** n partidas de un jugador: `siguiendo` de ellas con el pick recomendado, ganadas según `gana(i, sigue)`. */
function jugador(j, { n, siguiendo, gana, extra = {} }) {
  return Array.from({ length: n }, (_, i) => {
    const sigue = i < siguiendo;
    t += 1;
    return { j, t, d: { t, pick: sigue ? 'Rafaela' : 'Diggie', recomendados: ['Rafaela', 'Estes', 'Angela'], gane: gana(i, sigue), ...extra } };
  });
}

test('mezclar jugadores engaña y dentro de cada uno no: uno bueno que sigue mucho, uno flojo que casi no', () => {
  // A gana el 70% siga o no y sigue en 90 de 100; B gana el 40% siga o no y sigue en 10 de 100.
  const filas = [
    ...jugador(1, { n: 100, siguiendo: 90, gana: (i) => (i % 10) < 7 }),
    ...jugador(2, { n: 100, siguiendo: 10, gana: (i) => (i % 10) < 4 }),
  ];
  const m = medirComunidad(filas);
  ok(m.siguiendo.winrate - m.libre.winrate > 0.2, `la mezcla no engaña: ${m.siguiendo.winrate} frente a ${m.libre.winrate}`);
  ok(Math.abs(m.entreRamas.dif) < 0.05, `dentro de cada jugador sale una diferencia que no existe: ${m.entreRamas.dif}`);
  eq(m.entreRamas.jugadores, 2);
  eq(m.entreRamas.seVe, false, 'con dos jugadores da conclusión');
});

test('si seguir la app ayuda a todos, se ve dentro de cada uno, y contra su winrate de siempre', () => {
  const filas = []; const refs = {};
  for (let j = 1; j <= 6; j += 1) {
    // Siguiendo gana 65 de 100; por libre, 45 de 100. Su winrate de siempre, 50%.
    filas.push(...jugador(j, { n: 200, siguiendo: 100, gana: (i, sigue) => (sigue ? (i % 20) < 13 : (i % 20) < 9) }));
    refs[String(j)] = { winRate: 0.5, partidas: 1000 };
  }
  const m = medirComunidad(filas, refs);
  casi(m.entreRamas.dif, 0.2, 0.01);
  ok(m.entreRamas.seVe, `no se distingue: ±${m.entreRamas.margen}`);
  casi(m.contraReferencia.dif, 0.15, 0.01);
  ok(m.contraReferencia.seVe, 'contra la referencia no se distingue');
  eq(m.contraReferencia.jugadores, 6);
  casi(m.contraReferencia.esperado, 0.5, 1e-9);
});

test('con dos jugadores no hay conclusión aunque la diferencia sea enorme: serían ellos, no la app', () => {
  const filas = []; const refs = {};
  for (let j = 1; j <= 2; j += 1) {
    filas.push(...jugador(j, { n: 400, siguiendo: 200, gana: (i, sigue) => (sigue ? (i % 10) < 8 : (i % 10) < 3) }));
    refs[String(j)] = { winRate: 0.5, partidas: 1000 };
  }
  const m = medirComunidad(filas, refs);
  ok(m.entreRamas.dif > m.entreRamas.margen && m.contraReferencia.dif > m.contraReferencia.margen, 'el caso no tiene una diferencia que pase el margen');
  eq(m.entreRamas.seVe, false, 'concluye entre ramas con dos jugadores');
  eq(m.contraReferencia.seVe, false, 'concluye contra la referencia con dos jugadores');
});

test('la referencia es la de CADA jugador: uno que gana el 60% siempre no «mejora» por ganar el 60% con la app', () => {
  const filas = []; const refs = {};
  for (let j = 1; j <= 4; j += 1) {
    const p = j <= 2 ? 0.6 : 0.45;
    filas.push(...jugador(j, { n: 100, siguiendo: 100, gana: (i) => (i % 20) < p * 20 }));
    refs[String(j)] = { winRate: p, partidas: 2000 };
  }
  const m = medirComunidad(filas, refs);
  ok(Math.abs(m.contraReferencia.dif) < 0.01, `sale una mejora que no existe: ${m.contraReferencia.dif}`);
  // Uno que se inventa un winrate de siempre del 0,01% no cuenta.
  const falso = medirComunidad([...filas, ...jugador(9, { n: 100, siguiendo: 100, gana: () => true })], { ...refs, 9: { winRate: 0.0001, partidas: 1000000 } });
  eq(falso.contraReferencia.jugadores, 4, 'cuenta un winrate de siempre imposible');
});

test('solo lector mira las apuntadas por el lector; las previas y lo que no tiene forma no cuentan', () => {
  const filas = [
    ...jugador(1, { n: 20, siguiendo: 20, gana: () => true, extra: { origen: 'lector' } }),
    ...jugador(1, { n: 30, siguiendo: 30, gana: () => false }),
    ...jugador(2, { n: 10, siguiendo: 5, gana: () => true, extra: { previa: true } }),
    { j: 3, t: 1, d: null }, { j: 3, t: 2, d: { pick: 5, gane: true } }, { j: 3, t: 3, d: { pick: 'X', gane: 'sí' } }, null,
  ];
  const m = medirComunidad(filas, { 1: { winRate: 0.5, partidas: 100 } });
  eq(m.partidas, 50); eq(m.jugadores, 1);
  eq(m.soloLector.n, 20); casi(m.soloLector.real, 1, 1e-9);
  eq(m.contraReferencia.n, 50);
  eq(porJugador(filas).size, 1);
});

test(`un jugador sin ${MINIMO_POR_RAMA} partidas en cada rama no entra en la comparación entre ramas; con nada, nada`, () => {
  const m = medirComunidad(jugador(1, { n: 20, siguiendo: 17, gana: (i) => i % 2 === 0 }));
  eq(m.entreRamas.jugadores, 0);
  const vacio = medirComunidad([], null);
  eq(vacio.jugadores, 0); eq(vacio.contraReferencia.n, 0); eq(vacio.calibracion.n, 0);
  eq(medirComunidad('basura').partidas, 0, 'lanza o cuenta algo con basura');
});

test('el pick supuesto no entra en la medida de la comunidad (3.81.2): su pick es el nº1 porque no se leyó el tuyo', () => {
  const filas = [{ j: 1, d: { t: 1, pick: 'Diggie', gane: true, recomendados: ['Diggie'], supuesto: true } }, { j: 1, d: { t: 2, pick: 'Gord', gane: false, recomendados: ['Diggie'] } }];
  eq(porJugador(filas).get('1')?.length, 1, 'la supuesta cuenta como siguiendo la app');
  eq(medirComunidad(filas).siguiendo.n, 0);
});

await terminar('motor/comunidad');
