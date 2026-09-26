/**
 * Que la pantalla del Veredicto siga siendo honesta.
 *
 * `CLAUDE.md` llama a estas tres reglas «no negociables»: el margen va en la
 * misma frase que la diferencia, no se afirma nada mientras la diferencia
 * quepa en el margen, y se dice que no está aleatorizado. Con once partidas
 * al 73% el margen es ±29 puntos: el número sin el margen es publicidad.
 *
 * La comprobación existía en 2.0.2 (`la pantalla del veredicto ensena el
 * margen y la trampa, no solo el numero`, contra `src/components/ui.jsx`) y
 * el port de 3.0 la perdió: leía la interfaz desde la prueba del motor, y el
 * motor ya no puede leer la interfaz. Lo que quedó garantizado en el motor
 * (`resumen()` devuelve siempre el margen) no dice nada de si la PANTALLA lo
 * pinta, que es lo que se ve.
 *
 * Se mira el código SIN comentarios a propósito: el docstring del componente
 * cita las tres reglas, así que una guarda por texto pasaría sola aunque el
 * JSX no las cumpliera. Ya ha pasado tres veces en este proyecto.
 */
import { test, ok, eq, terminar, leerTexto } from '../arnes.mjs';
import { CLAVES } from '../../src/app/i18n/index.js';
import { resumen } from '../../src/motor/registro.js';

/** El código de un fichero sin comentarios de línea ni de bloque. */
const sinComentarios = (ruta) => leerTexto(ruta).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

test('la pantalla del veredicto enseña el margen y la trampa, no solo el número', () => {
  const jsx = sinComentarios('src/app/componentes/Veredicto.jsx');

  // Las tres cosas que no pueden desaparecer de esa pantalla sin que deje de
  // ser honesta, y que además existan en los dos idiomas: una clave que la
  // pantalla usa y el diccionario no tiene sale cruda en pantalla.
  for (const clave of ['veredicto.dif', 'veredicto.noSeVe', 'veredicto.trampa']) {
    ok(jsx.includes(clave), `la pantalla ya no usa ${clave}`);
    ok(CLAVES.includes(clave), `${clave} no existe en los idiomas`);
  }

  // Y que el margen se pinte en la MISMA frase que la diferencia. Separarlos
  // en dos párrafos es exactamente cómo se acaba enseñando el número solo.
  ok(/veredicto\.dif[\s\S]{0,260}margen/.test(jsx),
    'el margen se ha separado de la diferencia: el número solo es publicidad');

  // Mientras la diferencia quepa en el margen no se afirma nada: la rama de
  // «todavía no se sabe» tiene que seguir colgando de `seVe`.
  ok(/seVe[\s\S]{0,400}veredicto\.noSeVe/.test(jsx),
    'la pantalla ya no distingue entre «se ve» y «todavía no se sabe»');
});

test('el motor da margen y duda con pocas partidas, que es lo que la pantalla pinta', () => {
  // La otra mitad: que lo que la pantalla enseña venga con margen de verdad.
  // Once partidas ganando ocho es una racha normal, no una prueba de nada.
  const t0 = Date.parse('2026-09-01T10:00:00Z');
  const partidas = Array.from({ length: 11 }, (_, i) => ({
    t: t0 + i * 3600000, pick: 'Akai', gane: i < 8, recomendados: ['Akai'],
  }));
  const r = resumen(partidas, { Akai: { games: 400, winRate: 0.52 } });
  const c = r.contraReferencia;
  ok(c, 'sin comparación no hay nada que pintar');
  ok(c.margen > 0, 'la comparación vuelve sin margen: la pantalla no podría enseñarlo');
  ok(!c.seVe, `con 11 partidas al ${(r.wrSiguiendo * 100).toFixed(0)}% se afirma que la app funciona (margen ±${(c.margen * 100).toFixed(0)} puntos)`);
});

test('siguiendo contra por libre: con margen en la misma frase, sin afirmar nada mientras quepa, y solo con 30 y 30', () => {
  // Hasta 3.18.0 el informe decía «ya hay 30 y 30, se puede concluir» sin
  // decir qué: con 69,8% (63) frente a 71,9% (32), −2 puntos ± 19.
  const jsx = sinComentarios('src/app/componentes/Veredicto.jsx');
  for (const clave of ['veredicto.ramas', 'veredicto.ramasNoSeVe']) {
    ok(jsx.includes(clave), `la pantalla no usa ${clave}`);
    ok(CLAVES.includes(clave), `${clave} no existe en los idiomas`);
  }
  ok(/veredicto\.ramas'[\s\S]{0,260}margen/.test(jsx), 'el margen de siguiendo/por libre no va en la misma frase que la diferencia');
  ok(/\.seVe[\s\S]{0,200}veredicto\.ramasNoSeVe/.test(jsx), 'la comparación entre ramas no distingue «se ve» de «no se sabe»');
  const t0 = Date.parse('2026-09-01T10:00:00Z');
  const ramas = (nCon, gCon, nSin, gSin) => [
    ...Array.from({ length: nCon }, (_, i) => ({ t: t0 + i, pick: 'Akai', gane: i < gCon, recomendados: ['Akai'] })),
    ...Array.from({ length: nSin }, (_, i) => ({ t: t0 + 1e6 + i, pick: 'Akai', gane: i < gSin, recomendados: ['Tigreal'] })),
  ];
  const m = { Akai: { games: 400, winRate: 0.52 } };
  eq(resumen(ramas(63, 44, 29, 21), m).entreRamas, null, 'con menos de 30 por libre ya compara');
  const parecidas = resumen(ramas(63, 44, 32, 23), m).entreRamas;
  ok(parecidas && parecidas.margen > 0.15 && !parecidas.seVe, `con 69,8% frente a 71,9% afirma algo: ${JSON.stringify(parecidas)}`);
  // Una rama ganada entera no da margen cero (error agrupado, no Wald).
  // 30 de 30 frente a 0 de 30: con Wald el error es CERO y no se afirmaría
  // nada de la diferencia más grande posible.
  const entera = resumen(ramas(30, 30, 30, 0), m).entreRamas;
  ok(entera.margen > 0 && entera.seVe, `con 30/30 frente a 0/30 no se distingue o el margen sale cero: ${JSON.stringify(entera)}`);
  ok(resumen(ramas(100, 90, 100, 40), m).entreRamas.seVe, 'con 90% frente a 40% en 100 y 100 no se distingue nada');
});

await terminar('app/veredicto');
