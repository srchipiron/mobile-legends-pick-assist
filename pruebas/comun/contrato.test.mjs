/**
 * El contrato del protocolo 2 entre el móvil y la tablet (src/comun/contrato.js).
 * Lo que cruza la wifi es un dato de fuera para los dos lados: se sanea entero.
 */
import { test, ok, eq } from '../ayuda.mjs';
import {
  sanearAjustes, sanearDraftTablet, sanearPartidaTablet, sanearRespuestaDraft, sanearCorreccion, sanearResultado,
  RUTAS, PROTOCOLO, NOMBRE_DE_HEROE, IP_PRIVADA,
} from '../../src/comun/contrato.js';

test('los nombres de héroe de verdad pasan y lo que no es un nombre no', () => {
  for (const n of ['Popol and Kupa', 'X.Borg', "Chang'e", 'Lapu-Lapu', 'Yi Sun-shin', 'Luo Yi']) ok(NOMBRE_DE_HEROE.test(n), `${n} no pasa`);
  for (const n of ['', '<img>', 'a'.repeat(41), 'x\ny', '../etc']) ok(!NOMBRE_DE_HEROE.test(n), `${JSON.stringify(n)} pasa`);
  ok(IP_PRIVADA.test('192.168.1.40') && IP_PRIVADA.test('10.0.0.2') && IP_PRIVADA.test('172.20.3.4'), 'una IP privada no pasa');
  ok(!IP_PRIVADA.test('8.8.8.8') && !IP_PRIVADA.test('tablet.local') && !IP_PRIVADA.test('172.32.0.1'), 'pasa algo que no es una IP privada');
});

test('el draft de la tablet: cinco huecos por equipo, tu pick de tu fila, baneos sin repetir y nada sin forma', () => {
  const d = sanearDraftTablet({
    desde: 1763150000000, cerrado: true, cerradoEn: 1763150090000, linea: 'roam',
    enemigos: ['Ling', null, '<b>', 'Gord'], aliados: ['Miya', 'Tigreal', null, 'Layla', 'Eudora'], tuyoFila: 1,
    baneos: ['Fanny', 'Fanny', 'Lancelot', 7], porPicks: true, extra: 'fuera',
  });
  eq(JSON.stringify(d.enemigos), JSON.stringify(['Ling', null, null, 'Gord', null]));
  eq(d.tuyo, 'Tigreal', 'tu pick no sale de tu fila');
  eq(JSON.stringify(d.baneos), JSON.stringify(['Fanny', 'Lancelot']));
  ok(d.cerrado && d.cerradoEn === 1763150090000 && d.porPicks && !d.corregido && !('extra' in d), JSON.stringify(d));
  eq(sanearDraftTablet({ desde: 'ayer' }), null, 'un draft sin identidad pasa');
  eq(sanearDraftTablet({ desde: 1, tuyoFila: 9 }).tuyoFila, -1);
  eq(sanearDraftTablet({ desde: 1, cerrado: false, cerradoEn: 5 }).cerradoEn, null, 'un draft abierto trae instante de cierre');
});

test('la partida de la tablet: solo estados conocidos, y el registro solo si está apuntada y trae su t', () => {
  eq(sanearPartidaTablet({ desde: 5, estado: 'borrada' }), null);
  const p = sanearPartidaTablet({ desde: 5, estado: 'apuntada', gane: true, registro: { t: 1763150999000, pick: 'Tigreal' } });
  ok(p.gane === true && p.registro?.t === 1763150999000, JSON.stringify(p));
  eq(sanearPartidaTablet({ desde: 5, estado: 'vigilando', registro: { t: 9 } }).registro, null, 'una partida sin apuntar trae registro');
  eq(sanearPartidaTablet({ desde: 5, estado: 'apuntada', registro: { pick: 'x' } }).registro, null, 'un registro sin t pasa');
  eq(sanearRespuestaDraft({ protocolo: 1, draft: { desde: 5 } }), null, 'una tablet del protocolo viejo se toma por del nuevo');
  const r = sanearRespuestaDraft({ protocolo: PROTOCOLO, fase: 'tienda', draft: null });
  ok(r && r.fase === null && r.draft === null && r.partida === null, JSON.stringify(r));
});

test('la corrección del móvil: sin repetir, tú fuera de tus compañeros y nadie elegido entre los baneos', () => {
  const c = sanearCorreccion({ desde: 7, enemigos: ['Ling', 'Ling', 'Gord'], aliados: ['Tigreal', 'Miya', 'Gord', 'Layla', 'Eudora', 'Nana'], tuyo: 'Tigreal', baneos: ['Fanny', 'Miya', 'Lancelot'] });
  eq(JSON.stringify(c.enemigos), JSON.stringify(['Ling', 'Gord']));
  eq(JSON.stringify(c.aliados), JSON.stringify(['Miya', 'Layla']), 'tú o un enemigo entre tus compañeros, o más de cuatro');
  eq(JSON.stringify(c.baneos), JSON.stringify(['Fanny', 'Lancelot']), 'un elegido sale como baneado');
  eq(sanearCorreccion({ enemigos: ['Ling'] }), null, 'una corrección sin draft al que pertenecer');
  eq(JSON.stringify(sanearResultado({ desde: 3, gane: null })), JSON.stringify({ desde: 3, gane: null }), '«no la terminé» no pasa');
  eq(sanearResultado({ desde: 3, gane: 'si' }), null);
});

test('los ajustes: línea obligatoria, Gloria por defecto, maestría con forma y clave con forma', () => {
  eq(sanearAjustes({ rango: 'mythic' }), null);
  const a = sanearAjustes({ linea: 'roam', idioma: 'fr', maestria: { Tigreal: { games: 40, winRate: 0.6 }, '<x>': { games: 1, winRate: 1 }, Miya: { games: 0.5, winRate: 0.5 } }, clave: 'corta' });
  eq(JSON.stringify(a), JSON.stringify({ linea: 'roam', rango: 'glory', idioma: 'es', maestria: { Tigreal: { games: 40, winRate: 0.6 } } }));
  eq(sanearAjustes({ linea: 'mid', clave: 'A'.repeat(43) }).clave, 'A'.repeat(43));
});

test('cada ruta dice quién la usa, y solo /reto va sin código', () => {
  for (const [ruta, quien] of Object.entries(RUTAS)) {
    ok(/^(GET|POST) \/[a-z]+$/.test(ruta), `ruta sin forma: ${ruta}`);
    ok(['app', 'apk', 'ambos', 'cualquiera'].includes(quien), `${ruta}: ${quien}`);
  }
  eq(Object.entries(RUTAS).filter(([, q]) => q === 'cualquiera').map(([r]) => r).join(), 'GET /reto');
  ok(Object.isFrozen(RUTAS));
});
