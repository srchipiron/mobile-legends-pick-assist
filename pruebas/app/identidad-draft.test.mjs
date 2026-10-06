/**
 * La identidad del draft ante el lector (3.44.1): `completoDesde` dice qué
 * partida se vigila. Corregir un draft completo (la × a uno mal leído y
 * meter al de verdad) es la MISMA partida; un draft nuevo, otra.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { conCompleto, COMUNES_DE_LA_MISMA, MISMA_PARTIDA_MS } from '../../src/app/estado/useDraft.js';

const enemigos = ['Layla', 'Miya', 'Eudora', 'Nana', 'Zilong'];
const aliados = ['Chou', 'Tigreal', 'Franco', 'Akai'];
const T = 1_000_000;

test('quitar a uno y meter a otro con el draft completo conserva su instante; un draft nuevo no', () => {
  const completo = conCompleto({ enemigos, aliados }, T);
  eq(completo.completoDesde, T, 'completar no arranca el instante');
  const sinZilong = conCompleto({ ...completo, enemigos: enemigos.slice(0, 4) }, null);
  eq(sinZilong.completoDesde, null, 'incompleto sigue con instante');
  const corregido = conCompleto({ ...sinZilong, enemigos: [...enemigos.slice(0, 4), 'Alucard'] }, T + 60000);
  eq(corregido.completoDesde, T, 'corregir un enemigo arranca otra partida (el lector tira la que vigilaba)');
  // Dos correcciones seguidas, también.
  const sinDos = conCompleto({ ...corregido, aliados: aliados.slice(0, 3) }, null);
  const otraVez = conCompleto({ ...sinDos, aliados: [...aliados.slice(0, 3), 'Estes'] }, T + 120000);
  eq(otraVez.completoDesde, T, 'una segunda corrección arranca otra partida');
  // Un draft distinto (otra partida) con los huecos rellenados uno a uno: instante nuevo.
  const otra = conCompleto({ ...sinZilong, enemigos: ['Fanny', 'Gusion', 'Lesley', 'Kagura', 'Hilda'], aliados: ['Rafaela', 'Saber', 'Gloo', 'Clint'] }, T + 60000);
  eq(otra.completoDesde, T + 60000, 'un draft nuevo hereda la partida anterior');
  // La misma gente, pero pasada una partida entera: otra partida.
  eq(conCompleto({ ...sinZilong, enemigos }, T + MISMA_PARTIDA_MS).completoDesde, T + MISMA_PARTIDA_MS, 'pasada media hora sigue siendo la misma partida');
  ok(COMUNES_DE_LA_MISMA >= 6 && COMUNES_DE_LA_MISMA < 9, 'el mínimo de héroes en común no deja corregir o no distingue');
  // Sin instante (limpieza de nombres al cargar), nada cambia.
  eq(conCompleto({ enemigos, aliados, completoDesde: 5 }, null).completoDesde, 5);
});

await terminar('app/identidad-draft');
