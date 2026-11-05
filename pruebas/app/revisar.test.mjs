/**
 * Revisar lo que no vio el lector con sus capturas (3.86.0, src/app/revisar.js):
 * cruzar los recortes con TUS partidas, poner cada nombre en su hueco y sacar
 * lo que se guarda.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { readFileSync } from 'node:fs';
import { revisiones, cambiosDeRevision, porRevisar, imagenValida, encuadre, tusMasJugados, companerosHabituales, carasParaHueco, sinResultado, CARAS_POR_HUECO, TOPE_IMAGEN } from '../../src/app/revisar.js';
import { prepararDatos, probablesDelBando } from '../../src/motor/draft.js';
import { RAIZ } from '../arnes.mjs';

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

const leerJson = (f) => JSON.parse(readFileSync(`${RAIZ}/${f}`, 'utf8'));

test('tus compañeros de siempre (3.89.0): por veces a tu lado, sin los del draft, del catálogo', () => {
  const ps = [
    { t: 1, draft: { aliados: ['Gord', 'Selena', 'Nadie'] } },
    { t: 2, draft: { aliados: ['gord', 'Layla'] } },
    { t: 3, draft: { aliados: ['Gord', 'Selena'] } },
    { t: 4 }, null,
  ];
  eq(companerosHabituales(ps, HEROES).join(), 'Gord,Selena,Layla', 'no van por veces a tu lado');
  eq(companerosHabituales(ps, HEROES, ['Gord']).join(), 'Selena,Layla', 'sale uno que ya está en el draft');
  eq(companerosHabituales(ps, HEROES, [], 1).join(), 'Gord');
});

test('las caras al tocar un hueco (3.89.0): los tuyos delante, luego el motor, nunca uno del draft; buscando, el que empieza así', () => {
  const datos = prepararDatos({ catalogo: leerJson('public/data/heroes.json'), meta: leerJson('public/data/roam-meta.json'), rango: 'glory' });
  const fuera = ['Clint', 'Khufra', 'Gord'];
  const c = carasParaHueco(datos, { lado: 'enemigos', equipo: ['Clint', 'Khufra'], fuera });
  eq(c.length, CARAS_POR_HUECO);
  ok(!c.some((h) => fuera.includes(h.name)), 'sale uno que ya está en el draft');
  const motor = probablesDelBando(datos, { equipo: ['Clint', 'Khufra'].map((n) => datos.heroes.find((h) => h.name === n)), bando: 'enemigos' }).filter((h) => !fuera.includes(h.name)).slice(0, CARAS_POR_HUECO);
  eq(c.map((h) => h.name).join(), motor.map((h) => h.name).join(), 'los rivales no van en el orden del motor');
  const a = carasParaHueco(datos, { lado: 'aliados', equipo: ['Gord'], fuera, linea: 'roam', primeros: ['Zilong', 'Gord', 'Nadie', 'Layla'] });
  eq(a.slice(0, 2).map((h) => h.name).join(), 'Zilong,Layla', 'tus compañeros de siempre no van delante (o va uno del draft o uno que no existe)');
  eq(new Set(a.map((h) => h.name)).size, a.length, 'una cara sale dos veces');
  const b = carasParaHueco(datos, { lado: 'enemigos', fuera, buscar: 'la' });
  ok(b.length && b.every((h) => /la/i.test(h.name)), 'buscando sale uno que no casa');
  ok(b[0].name.toLowerCase().startsWith('la'), `buscando «la» no van primero los que empiezan así: ${b[0].name}`);
  ok(!carasParaHueco(datos, { lado: 'enemigos', fuera, buscar: 'clin' }).length, 'buscando sale uno del draft');
  eq(carasParaHueco(null, {}).length, 0);
});

test('las partidas sin resultado (3.89.4, 3.90.2): las tuyas (mis_recortes con tu clave), sin las ya contestadas, las descartadas ni las que pisan una partida tuya', () => {
  const T2 = T + 3 * 3600000;
  // Como las da `mis_recortes`: sin `j` (todas son de tu clave).
  const fin = (t, extra = {}) => ({ recibido: '2026-11-04T21:00:00Z', d: { v: 1, tipo: 'final', desde: t - 900000, motivo: 'vi la tabla del final pero no la reconozco', capturas: [{ id: 'fotograma-1', miniatura: PNG }, { id: 'fotograma-2', miniatura: 'no es png' }], partida: { t, pick: 'floryn', origen: 'lector', supuesto: true, rango: 'glory', recomendados: ['Floryn', 'Nadie'], draft: { linea: 'roam', enemigos: ['Clint', 'Nadie'], aliados: ['Gord'] }, bans: ['Atlas'] }, ...extra } });
  const propios = [fin(T2), fin(T2 + 7200000), { d: { tipo: 'final' } }, recorte().d];
  const r = sinResultado(propios, [partida()], HEROES);
  eq(r.map((x) => x.t).join(), `${T2 + 7200000},${T2}`, 'no salen las tuyas en orden, o sale algo sin forma');
  const p = r[1].partida;
  ok(p.pick === 'Floryn' && p.supuesto && !('gane' in p) && p.draft.enemigos.join() === 'Clint' && p.recomendados.join() === 'Floryn' && p.bans.join() === 'Atlas', `la partida no sale saneada: ${JSON.stringify(p)}`);
  eq(r[1].pantallas.length, 1, 'enseña una pantalla que no es un PNG');
  // Ya contestada (en la tablet o aquí): la partida apuntada lleva el MISMO instante (3.90.2).
  const contestada = { t: T2, pick: 'Floryn', gane: false, rango: 'glory' };
  eq(sinResultado(propios, [partida(), contestada], HEROES).map((x) => x.t).join(), `${T2 + 7200000}`, 'una contestada sigue saliendo');
  // Otra partida tuya un minuto después (con el mismo héroe) no la tapa: antes la ventana de 10 min la escondía.
  eq(sinResultado(propios, [partida(), { ...contestada, t: T2 + 60000 }], HEROES).length, 2, 'una partida cercana tapa la que está sin resultado');
  // Descartada.
  eq(sinResultado(propios, [partida()], HEROES, [T2]).map((x) => x.t).join(), `${T2 + 7200000}`, 'una descartada sigue saliendo');
  // Con el instante de una partida tuya, nunca (3.90.2): «No la jugué» la borraría.
  const pisa = fin(T, { partida: { ...fin(T).d.partida, pick: 'Gord' } });
  eq(sinResultado([pisa], [partida()], HEROES).length, 0, 'sale una con el instante de una partida tuya: «No la jugué» la borraría');
});

await terminar('app/revisar');
