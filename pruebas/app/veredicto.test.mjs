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
import { test, ok, terminar, leerTexto } from '../arnes.mjs';
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

await terminar('app/veredicto');
