/**
 * La antigüedad de los datos (3.60.1): desde 3.59.6 `generatedAt` es la de
 * las estadísticas y la matriz lleva la suya; con la matriz conservada días,
 * la cabecera decía «0 h» y nada se marcaba viejo.
 */
import { test, ok, eq, casi, terminar } from '../arnes.mjs';
import { edadDeLosDatos } from '../../src/app/estado/useDatos.js';

const ahora = Date.parse('2026-10-20T12:00:00Z');
const hace = (h) => new Date(ahora - h * 3.6e6).toISOString();

test('manda lo más viejo de las estadísticas y la matriz', () => {
  const r = edadDeLosDatos({ generatedAt: hace(1), relaciones: { descargada: hace(240) } }, ahora);
  casi(r.edadHoras, 240, 1e-9, 'con la matriz de hace 10 días la edad no es la de la matriz');
  casi(r.edadMatrizHoras, 240, 1e-9);
  eq(r.generado?.toISOString(), hace(1), 'la fecha de las estadísticas cambia');
  // Al revés (no debería pasar, pero): la de las estadísticas.
  casi(edadDeLosDatos({ generatedAt: hace(50), relaciones: { descargada: hace(2) } }, ahora).edadHoras, 50, 1e-9);
});

test('sin `descargada` (ficheros de antes) la matriz es de generatedAt; sin fechas, nada', () => {
  const r = edadDeLosDatos({ generatedAt: hace(3) }, ahora);
  ok(Math.abs(r.edadHoras - 3) < 1e-9 && Math.abs(r.edadMatrizHoras - 3) < 1e-9, JSON.stringify(r));
  const nada = edadDeLosDatos({ generatedAt: 'no es una fecha', relaciones: { descargada: 'tampoco' } }, ahora);
  ok(nada.edadHoras === null && nada.generado === null && nada.edadMatrizHoras === null, JSON.stringify(nada));
  eq(edadDeLosDatos(null, ahora).edadHoras, null);
  // Solo la matriz con fecha válida: cuenta esa.
  casi(edadDeLosDatos({ generatedAt: 'x', relaciones: { descargada: hace(7) } }, ahora).edadHoras, 7, 1e-9);
});

await terminar('app/edad-datos');
