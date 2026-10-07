/**
 * La identidad del draft ante el lector (3.44.1): `completoDesde` dice qué
 * partida se vigila. Corregir un draft completo (la × a uno mal leído y
 * meter al de verdad) es la MISMA partida; un draft nuevo, otra.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { conCompleto, cerrarConPartida, draftCompleto, COMUNES_DE_LA_MISMA, MISMA_PARTIDA_MS } from '../../src/app/estado/useDraft.js';
import { lecturasEnPartida, LECTURAS_EN_PARTIDA } from '../../src/app/lector.js';
import { LECTURAS_EN_PARTIDA as EN_PARTIDA_DEL_LECTOR } from '../../scripts/lector/servir.mjs';

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

test('la partida empieza con el draft a medias (3.46.0): se cierra con lo que tiene, cuenta como completo y meter después al que faltaba es la MISMA partida', () => {
  // Como el 7 de octubre de 2026: cinco enemigos y tres compañeros (el cuarto no se leyó).
  const aMedias = conCompleto({ enemigos, aliados: aliados.slice(0, 3) }, T);
  eq(aMedias.completoDesde, null, 'a medias ya tenía instante');
  const cerrado = cerrarConPartida(aMedias, T + 5000);
  ok(draftCompleto(cerrado), 'cerrado no cuenta como completo (no arranca la vigilancia)');
  eq(cerrado.completoDesde, T + 5000, 'cerrado sin instante: el lector no sabría qué partida vigila');
  // Meter a mano al que faltaba (o quitar a uno mal leído): el mismo instante.
  eq(conCompleto({ ...cerrado, aliados }, T + 60000).completoDesde, T + 5000, 'completar un draft cerrado arranca otra partida');
  eq(conCompleto({ ...cerrado, enemigos: enemigos.slice(0, 4) }, null).completoDesde, T + 5000, 'quitar a uno de un draft cerrado lo borra');
  // Volver a cerrar no cambia nada; un draft completo no se toca; sin enemigos no se cierra.
  eq(cerrarConPartida(cerrado, T + 90000), cerrado, 'cerrar otra vez cambia el instante');
  const completo = conCompleto({ enemigos, aliados }, T);
  eq(cerrarConPartida(completo, T + 1000), completo, 'cierra un draft ya completo');
  const vacio = { enemigos: [], aliados: [], baneos: ['Hirara'], completoDesde: null };
  eq(cerrarConPartida(vacio, T), vacio, 'cierra un draft sin enemigos (la app abierta entre dos partidas)');
});

test('las lecturas en partida se cuentan SEGUIDAS, una fuera (o un lector viejo sin el dato) vuelve a cero, y la app y el lector piden las mismas', () => {
  let n = 0;
  for (const partida of [true, true]) n = lecturasEnPartida(n, { partida });
  ok(n >= LECTURAS_EN_PARTIDA, 'dos lecturas en partida no bastan');
  eq(lecturasEnPartida(n, { partida: false }), 0);
  eq(lecturasEnPartida(n, {}), 0, 'un lector sin el dato cuenta como en partida');
  eq(lecturasEnPartida(n, { partida: 'true' }), 0, 'un texto cuenta como en partida');
  eq(LECTURAS_EN_PARTIDA, EN_PARTIDA_DEL_LECTOR, 'la app y el lector no piden las mismas lecturas seguidas');
});

await terminar('app/identidad-draft');
