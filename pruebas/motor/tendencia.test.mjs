/**
 * Pruebas de src/motor/tendencia.js y `movimientosDelMeta` (3.50.0): quién
 * sube y quién baja. Con una historia sintética: la foto de hace una semana,
 * el cambio respecto a lo que se juega (un rango que sube entero no hace
 * subir a nadie), la confirmación del otro rango y los estados sin datos.
 */
import { test, ok, eq, casi, leerJson, terminar } from '../arnes.mjs';
import { catalogo } from '../fixtures/catalogo.mjs';
import { movimientos, fotoDeReferencia, UMBRAL_MOVIMIENTO, CONFIRMACION } from '../../src/motor/tendencia.js';
import { prepararDatos, movimientosDelMeta, poolDe } from '../../src/motor/draft.js';
import { nombreClave } from '../../src/motor/nombres.js';

const HEROES = ['Atlas', 'Khufra', 'Diggie', 'Layla', 'Fanny', 'Chou'];
const stats = (wr) => Object.fromEntries(HEROES.map((h) => [h, { winRate: wr[h] ?? 0.5, pickRate: 1 / HEROES.length }]));
const foto = (fecha, wrG = {}, wrM = {}) => ({ fecha, glory: Object.fromEntries(HEROES.map((h) => [h, [wrG[h] ?? 0.5, 1 / HEROES.length]])), mythic: Object.fromEntries(HEROES.map((h) => [h, [wrM[h] ?? 0.5, 1 / HEROES.length]])) });

test('la foto de referencia: la más cercana a 7 días, entre 5 y 9, con los dos rangos', () => {
  const h = [foto('2026-09-28'), foto('2026-10-02'), foto('2026-10-04'), { fecha: '2026-10-01', glory: {} }];
  eq(fotoDeReferencia(h, '2026-10-08', ['glory', 'mythic']).foto.fecha, '2026-10-02');
  eq(fotoDeReferencia([foto('2026-10-04')], '2026-10-08', ['glory', 'mythic']), null, 'a 4 días se acepta');
  eq(fotoDeReferencia([foto('2026-09-28')], '2026-10-08', ['glory', 'mythic']), null, 'a 10 días se acepta');
  eq(fotoDeReferencia([{ fecha: '2026-10-01', glory: foto('x').glory }], '2026-10-08', ['glory', 'mythic']), null, 'sin el otro rango se acepta');
});

test('sube y baja: un punto en tu rango y medio en el mismo sentido en el otro, respecto a lo que se juega', () => {
  const ahoraG = stats({ Atlas: 0.53, Khufra: 0.47, Diggie: 0.52, Layla: 0.52 });
  const ahoraM = stats({ Atlas: 0.51, Khufra: 0.49, Diggie: 0.495, Layla: 0.502 });
  const r = movimientos({ historia: [foto('2026-10-01')], statsByRank: { glory: ahoraG, mythic: ahoraM }, hoy: '2026-10-08', rango: 'glory', otro: 'mythic' });
  eq(r.estado, 'ok'); eq(r.desde, '2026-10-01'); eq(r.dias, 7);
  eq(r.suben.map((f) => f.heroe).join(), 'Atlas', `suben: ${r.suben.map((f) => f.heroe)}`);
  eq(r.bajan.map((f) => f.heroe).join(), 'Khufra', `bajan: ${r.bajan.map((f) => f.heroe)}`);
  // Diggie va al revés en Mítico; Layla, a +0,2 puntos (centrado) en Mítico: no confirman.
  eq(r.noConfirmados, 2);
  ok(r.suben[0].dif >= UMBRAL_MOVIMIENTO && r.suben[0].difOtro >= CONFIRMACION, 'Atlas no pasa los dos umbrales');
});

test('un rango que sube entero no hace subir a nadie (centrado por cuota de pick)', () => {
  const todos = Object.fromEntries(HEROES.map((h) => [h, 0.53]));
  const r = movimientos({ historia: [foto('2026-10-01')], statsByRank: { glory: stats(todos), mythic: stats(todos) }, hoy: '2026-10-08', rango: 'glory', otro: 'mythic' });
  eq(r.suben.length + r.bajan.length, 0, `con todos +3 sube alguien: ${r.suben.map((f) => f.heroe)}`);
  const unoPesado = movimientos({
    historia: [foto('2026-10-01')], hoy: '2026-10-08', rango: 'glory', otro: 'mythic',
    statsByRank: { glory: { ...stats({}), Atlas: { winRate: 0.53, pickRate: 0.9 } }, mythic: { ...stats({}), Atlas: { winRate: 0.53, pickRate: 0.9 } } },
  });
  ok(unoPesado.suben.every((f) => f.heroe === 'Atlas') && unoPesado.suben.length <= 1, 'el centro no pondera por cuota de pick');
  casi(unoPesado.suben[0]?.dif ?? 0, 0.03 - 0.03 * 0.9 / (0.9 + 5 / 6), 1e-9);
});

test('sin el otro rango o sin historia, se dice, no se inventa', () => {
  eq(movimientos({ historia: [foto('2026-10-01')], statsByRank: { glory: stats({}) }, hoy: '2026-10-08', rango: 'glory', otro: 'mythic' }).estado, 'sinOtro');
  eq(movimientos({ historia: [], statsByRank: { glory: stats({}), mythic: stats({}) }, hoy: '2026-10-08', rango: 'glory', otro: 'mythic' }).estado, 'sinHistoria');
  eq(movimientos({ historia: [foto('2026-10-01')], statsByRank: { epic: stats({}) }, hoy: '2026-10-08', rango: 'epic', otro: null }).estado, 'sinOtro');
});

test('movimientosDelMeta: el rango de la fuerza, el otro del par, la fecha del fichero y el pool de la línea', () => {
  const meta = leerJson('public/data/roam-meta.json');
  const datos = prepararDatos({ catalogo, meta, rango: 'glory' });
  const todo = movimientosDelMeta(datos);
  eq(todo.rango, datos.meta.fuerza.rango);
  eq(todo.otro, todo.rango === 'glory' ? 'mythic' : 'glory');
  const roam = movimientosDelMeta(datos, { linea: 'roam' });
  const pool = new Set(poolDe(datos, 'roam').map((h) => nombreClave(h.name)));
  ok([...roam.suben, ...roam.bajan].every((f) => pool.has(nombreClave(f.heroe))), 'sale alguien de fuera de roam');
  ok(roam.suben.length <= todo.suben.length && roam.bajan.length <= todo.bajan.length);
  // Con una historia sintética en el fichero, la fecha de referencia sale de generatedAt.
  const hoy = meta.generatedAt.slice(0, 10);
  const hace7 = new Date(Date.parse(`${hoy}T00:00:00Z`) - 7 * 864e5).toISOString().slice(0, 10);
  const conHistoria = prepararDatos({ catalogo, meta: { ...meta, historia: [{ fecha: hace7, glory: {}, mythic: {} }] }, rango: 'glory' });
  eq(movimientosDelMeta(conHistoria).estado, 'sinHistoria', 'una foto vacía cuenta como historia');
  const sin = prepararDatos({ catalogo, meta: { ...meta, historia: undefined }, rango: 'glory' });
  eq(movimientosDelMeta(sin).estado, 'sinHistoria');
});

test('al revés en el otro rango no confirma, por mucho que se mueva', () => {
  const r = movimientos({
    historia: [foto('2026-10-01')], hoy: '2026-10-08', rango: 'glory', otro: 'mythic',
    statsByRank: { glory: stats({ Atlas: 0.56 }), mythic: stats({ Atlas: 0.44 }) },
  });
  eq(r.suben.length + r.bajan.length, 0, 'Atlas +5 en Gloria y −5 en Mítico sale como movimiento');
  ok(r.noConfirmados >= 1);
});

test('entre varias fotos válidas se coge la más cercana a 7 días', () => {
  const r = ['glory', 'mythic'];
  eq(fotoDeReferencia([foto('2026-09-29'), foto('2026-10-01'), foto('2026-10-03')], '2026-10-08', r).foto.fecha, '2026-10-01');
  eq(fotoDeReferencia([foto('2026-10-03'), foto('2026-09-29')], '2026-10-08', r).foto.fecha, '2026-10-03', 'a 5 días (y otra a 9): a 2 de 7 las dos, gana la que llega antes en la lista');
});

test('con la fuerza en Mítico (Gloria vaciada) compara Mítico y confirma con Gloria', () => {
  const datos = {
    rango: 'glory', meta: { fuerza: { rango: 'mythic' } }, poolsPorLinea: {},
    crudo: {
      generatedAt: '2026-10-08T20:00:00Z', historia: [foto('2026-10-01')],
      statsByRank: { glory: stats({ Atlas: 0.53 }), mythic: stats({ Khufra: 0.53 }) },
    },
  };
  const r = movimientosDelMeta(datos);
  eq(r.rango, 'mythic'); eq(r.otro, 'glory');
  eq(r.suben.length, 0, 'mira el rango pedido en vez del de la fuerza');
  eq(r.noConfirmados, 1, 'Khufra sube en Mítico y Gloria no lo confirma');
});

await terminar('motor/tendencia');
