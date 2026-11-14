/**
 * La identidad de la partida en el móvil: `completoDesde` arranca al
 * completarse el draft (de él cuelga la pregunta de cómo fue). Corregir un
 * draft completo (la × a uno mal leído y meter al de verdad) es la MISMA
 * partida; un draft nuevo, otra. Y un draft cerrado por la partida cuenta
 * como completo.
 */
import { test, ok, eq } from '../ayuda.mjs';
import { conCompleto, cerrarConPartida, draftCompleto, COMUNES_DE_LA_MISMA, MISMA_PARTIDA_MS } from '../../src/app/estado/draftMovil.js';

const enemigos = ['Layla', 'Miya', 'Eudora', 'Nana', 'Zilong'];
const aliados = ['Chou', 'Tigreal', 'Franco', 'Akai'];
const T = 1_000_000;

test('quitar a uno y meter a otro con el draft completo conserva su instante; un draft nuevo no', () => {
  const completo = conCompleto({ enemigos, aliados }, T);
  eq(completo.completoDesde, T, 'completar no arranca el instante');
  const sinZilong = conCompleto({ ...completo, enemigos: enemigos.slice(0, 4) }, null);
  eq(sinZilong.completoDesde, null, 'incompleto sigue con instante');
  const corregido = conCompleto({ ...sinZilong, enemigos: [...enemigos.slice(0, 4), 'Alucard'] }, T + 60000);
  eq(corregido.completoDesde, T, 'corregir un enemigo arranca otra partida');
  const sinDos = conCompleto({ ...corregido, aliados: aliados.slice(0, 3) }, null);
  eq(conCompleto({ ...sinDos, aliados: [...aliados.slice(0, 3), 'Estes'] }, T + 120000).completoDesde, T, 'una segunda corrección arranca otra partida');
  const otra = conCompleto({ ...sinZilong, enemigos: ['Fanny', 'Gusion', 'Lesley', 'Kagura', 'Hilda'], aliados: ['Rafaela', 'Saber', 'Gloo', 'Clint'] }, T + 60000);
  eq(otra.completoDesde, T + 60000, 'un draft nuevo hereda la partida anterior');
  eq(conCompleto({ ...sinZilong, enemigos }, T + MISMA_PARTIDA_MS).completoDesde, T + MISMA_PARTIDA_MS, 'pasada media hora sigue siendo la misma partida');
  ok(COMUNES_DE_LA_MISMA >= 6 && COMUNES_DE_LA_MISMA < 9, 'el mínimo de héroes en común no deja corregir o no distingue');
  eq(conCompleto({ enemigos, aliados, completoDesde: 5 }, null).completoDesde, 5, 'sin instante (limpieza al cargar) cambia algo');
});

test('la partida empieza con el draft a medias: se cierra con lo que tiene, cuenta como completo y meter después al que faltaba es la MISMA partida', () => {
  const aMedias = conCompleto({ enemigos, aliados: aliados.slice(0, 3) }, T);
  eq(aMedias.completoDesde, null, 'a medias ya tenía instante');
  const cerrado = cerrarConPartida(aMedias, T + 5000);
  ok(draftCompleto(cerrado), 'cerrado no cuenta como completo');
  eq(cerrado.completoDesde, T + 5000);
  eq(conCompleto({ ...cerrado, aliados }, T + 60000).completoDesde, T + 5000, 'completar un draft cerrado arranca otra partida');
  eq(conCompleto({ ...cerrado, enemigos: enemigos.slice(0, 4) }, null).completoDesde, T + 5000, 'quitar a uno de un draft cerrado lo borra');
  eq(cerrarConPartida(cerrado, T + 90000), cerrado, 'cerrar otra vez cambia el instante');
  const completo = conCompleto({ enemigos, aliados }, T);
  eq(cerrarConPartida(completo, T + 1000), completo, 'cierra un draft ya completo');
  const sinNadie = { enemigos: [], aliados: [], baneos: ['Hirara'], completoDesde: null };
  eq(cerrarConPartida(sinNadie, T), sinNadie, 'cierra un draft sin enemigos (la app abierta entre dos partidas)');
});
