/**
 * Revisar lo que no vio el lector con sus capturas (3.86.0, src/app/revisar.js):
 * cruzar los recortes con TUS partidas, poner cada nombre en su hueco y sacar
 * lo que se guarda.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { revisiones, cambiosDeRevision, porRevisar, imagenValida, encuadre, tusMasJugados, TOPE_IMAGEN } from '../../src/app/revisar.js';

const HEROES = ['Atlas', 'Clint', 'Franco', 'Gord', 'Khufra', 'Layla', 'Minotaur', 'Rafaela', 'Selena', 'Tigreal', 'Zilong', 'Floryn'];
const PNG = 'iVBORw0KGgoAAAANSUhEUg==';
const T = 1793222711480;
const recorte = (extra = {}) => ({ j: 1, recibido: '2026-10-28T21:25:39Z', d: { v: 1, partida: T, faltan: 2, capturas: [{ id: 'lectura-2026-10-28T21-02-27-027Z-1517', picks: PNG }], leidos: { enemigos: ['Clint', 'Khufra', null, 'Atlas', 'Franco'], aliados: ['Gord', 'Selena', null, null, 'Layla'], tuyoFila: 3, baneos: [] }, ...extra } });
const partida = (extra = {}) => ({ t: T, pick: 'Floryn', supuesto: true, gane: true, draft: { linea: 'roam', enemigos: ['Clint', 'Khufra', 'Atlas', 'Franco'], aliados: ['Gord', 'Selena', 'Layla'] }, ...extra });

test('una revisión por partida tuya con recorte: lo leído en su hueco y tu fila vacía si el pick era supuesto', () => {
  const r = revisiones([recorte(), recorte({ capturas: [{ id: 'lectura-otra', picks: PNG }] })], [partida()], HEROES);
  eq(r.length, 1, 'dos recortes de la misma partida salen dos veces');
  eq(r[0].capturas[0].id, 'lectura-2026-10-28T21-02-27-027Z-1517', 'no se queda con el más reciente');
  eq(JSON.stringify(r[0].enemigos), JSON.stringify(['Clint', 'Khufra', null, 'Atlas', 'Franco']));
  eq(r[0].aliados[3], null, 'tu fila sale con el pick supuesto: es justo lo que hay que decir');
  ok(r[0].pendiente, 'una partida con el pick supuesto no está por revisar');
  eq(revisiones([recorte()], [{ ...partida(), t: T + 1 }], HEROES).length, 0, 'sale un recorte de una partida que no es tuya');
  eq(revisiones([{ d: { tipo: 'final', partida: T, capturas: [{ id: 'lectura-1', picks: PNG }] } }], [partida()], HEROES).length, 0, 'sale una pantalla del final');
});

test('lo arreglado después cae en el hueco que quedó vacío; tu pick confirmado va en tu fila', () => {
  const p = partida({ supuesto: undefined, pick: 'Minotaur', draft: { linea: 'roam', enemigos: ['Clint', 'Khufra', 'Atlas', 'Franco', 'Zilong'], aliados: ['Gord', 'Selena', 'Layla', 'Rafaela'] } });
  const [r] = revisiones([recorte()], [p], HEROES);
  eq(r.enemigos[2], 'Zilong', 'el enemigo arreglado no va al hueco sin leer');
  eq(r.aliados[3], 'Minotaur', 'tu pick no va en tu fila');
  eq(r.aliados[2], 'Rafaela', 'el compañero arreglado no va al hueco sin leer');
  ok(!r.pendiente, 'una partida entera y con tu pick sigue por revisar');
});

test('lo de la base de datos lo escribe cualquiera: solo PNG en base64 acotado, ids con forma y nombres del catálogo', () => {
  ok(imagenValida(PNG));
  ok(!imagenValida('PHN2Zz4='), 'pasa algo que no es un PNG');
  ok(!imagenValida('iVBORw0KGgo"><script>'), 'pasa un PNG con comillas');
  ok(!imagenValida('iVBORw0KGgo' + 'A'.repeat(TOPE_IMAGEN)), 'pasa una imagen enorme');
  const raro = recorte({ capturas: [{ id: '../x', picks: PNG }, { id: 'lectura-2', picks: 'data:text/html,hola' }] });
  eq(revisiones([raro], [partida()], HEROES).length, 0, 'sale un recorte sin una captura con forma');
  const nombres = revisiones([recorte({ leidos: { enemigos: ['<b>', 'Nadie'], aliados: [], tuyoFila: 9 } })], [partida()], HEROES)[0];
  ok(nombres.enemigos.slice(0, 2).every((n) => n !== '<b>' && n !== 'Nadie'), 'un nombre que no es del catálogo llega al hueco');
  eq(nombres.tuyoFila, -1, 'una fila imposible pasa');
  // Otro lector sube un recorte con el instante de tu partida (3.86.1): no se sabe cuál es el tuyo y no sale.
  eq(revisiones([recorte(), { ...recorte(), j: 7 }], [partida()], HEROES).length, 0, 'sale una partida con recortes de dos lectores');
});

test('lo que se guarda: tu pick de tu fila, cinco enemigos y cuatro compañeros, sin repetir', () => {
  const huecos = { enemigos: ['Clint', 'Khufra', 'zilong', 'Atlas', 'Franco'], aliados: ['Gord', 'Selena', 'Rafaela', 'Minotaur', 'Layla'], tuyoFila: 3 };
  eq(JSON.stringify(cambiosDeRevision(huecos, HEROES)), JSON.stringify({ pick: 'Minotaur', enemigos: ['Clint', 'Khufra', 'Zilong', 'Atlas', 'Franco'], aliados: ['Gord', 'Selena', 'Rafaela', 'Layla'] }));
  eq(cambiosDeRevision({ ...huecos, aliados: ['Gord', 'Selena', 'Rafaela', '', 'Layla'] }, HEROES).error, 'tuyo', 'guarda sin saber tu pick');
  eq(cambiosDeRevision({ ...huecos, enemigos: ['Gord', 'Khufra', 'Zilong', 'Atlas', 'Franco'] }, HEROES).error, 'repetido', 'guarda a uno en los dos equipos');
  eq(cambiosDeRevision({ ...huecos, enemigos: ['Clint', 'Nadie'] }, HEROES).error, 'nombre', 'guarda un nombre que no existe');
  // Sin tu fila: «Tú» aparte, y si sale también en un hueco no cuenta como compañero.
  const sinFila = cambiosDeRevision({ ...huecos, tuyoFila: -1, tuyo: 'Minotaur' }, HEROES);
  eq(JSON.stringify(sinFila.aliados), JSON.stringify(['Gord', 'Selena', 'Rafaela', 'Layla']));
  eq(sinFila.pick, 'Minotaur');
  // Un hueco a medias se puede guardar: lo que no sabes, vacío.
  eq(cambiosDeRevision({ ...huecos, enemigos: ['Clint', '', '', '', ''] }, HEROES).enemigos.join(), 'Clint');
});

test('porRevisar y el encuadre de cada cara', () => {
  ok(porRevisar({ draft: { enemigos: ['a'], aliados: [] } }) && !porRevisar({ draft: { enemigos: [1, 2, 3, 4, 5], aliados: [1, 2, 3, 4] } }));
  const e = encuadre('enemigos', 2, 0.5);
  eq(e.posicion, '-95px -170px', 'la cara del tercer enemigo no está en su sitio');
  eq(e.ancho, 115);
  eq(encuadre('aliados', 0, 1).fondo, '420px 850px');
});

test('tus más jugados para tu hueco (3.87.3): por partidas, sin supuestos, sin los que ya salen y del catálogo', () => {
  const p = (pick, t, extra = {}) => ({ pick, t, gane: true, ...extra });
  const partidas = [p('Minotaur', 1), p('Floryn', 2), p('Minotaur', 3), p('rafaela', 4), p('Rafaela', 5), p('Floryn', 6, { supuesto: true }), p('Nadie', 7), p('Gord', 8)];
  eq(tusMasJugados(partidas, HEROES).join(), 'Rafaela,Minotaur,Gord,Floryn', 'no van por partidas (a igualdad, la más reciente), o cuenta un supuesto o un nombre fuera del catálogo');
  eq(tusMasJugados(partidas, HEROES, ['Gord', 'minotaur']).join(), 'Rafaela,Floryn', 'sale uno que ya está en el draft');
  eq(tusMasJugados(partidas, HEROES, [], 2).length, 2);
  eq(tusMasJugados(null, HEROES).length, 0);
});

await terminar('app/revisar');
