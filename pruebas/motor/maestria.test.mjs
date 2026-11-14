/**
 * Pruebas de src/motor/maestria.js: tu maestría, escrita a mano o sacada de
 * las partidas apuntadas, leída por clave normalizada y comparada contra TU
 * nivel. La otra mitad de la prueba de perfiles (fundir y sanear) vive en
 * perfil.test.mjs.
 */
import { test, ok, eq } from '../ayuda.mjs';

import { nombreClave } from '../../src/motor/nombres.js';
import { maestriaEfectiva, fecharMaestria, maestriaDesdeRegistro, maestriaDeSiempre, TOPE_DE_SIEMPRE } from '../../src/motor/maestria.js';
import { generador } from '../../src/motor/robustez.js';




test('revision linea a linea del registro: la maestria del registro suma las dos grafias', () => {
  // 3. «X.Borg» escrito a mano y «X Borg» en el catálogo: 400 partidas fuera
  //    del ranking sin aviso. Se agrupa por clave, no por el nombre crudo.
  const grafias = [
    ...Array.from({ length: 30 }, (_, i) => ({ t: i, pick: 'X.Borg', gane: true })),
    ...Array.from({ length: 30 }, (_, i) => ({ t: 100 + i, pick: 'X Borg', gane: false })),
  ];
  const porRegistro = Object.entries(maestriaDesdeRegistro(grafias)).find(([n]) => nombreClave(n) === 'xborg')?.[1];
  eq(porRegistro?.games, 60, `X.Borg y X Borg se cuentan aparte: ${JSON.stringify(maestriaDesdeRegistro(grafias))}`);
  eq(maestriaEfectiva({}, grafias).xborg?.games, 60, 'maestriaEfectiva se queda con la mitad de las partidas');
});

test('fecharMaestria: pone la fecha a lo que no la tiene, respeta la que hay y no toca nada si no hace falta', () => {
  const m = { Rafaela: { games: 564, winRate: 0.53 }, Estes: { games: 694, winRate: 0.522, desde: 5 }, Raro: { games: 3, winRate: 0.5, desde: 'ayer' } };
  const f = fecharMaestria(m, 1000);
  eq(f.Rafaela.desde, 1000, 'la maestría sin fecha no se fecha');
  eq(f.Estes.desde, 5, 'pisa una fecha que ya había');
  eq(f.Raro.desde, 1000, 'una fecha que no es un instante cuenta como fecha');
  eq(f.Rafaela.games, 564); eq(m.Rafaela.desde, undefined, 'modifica la maestría que le pasan');
  ok(fecharMaestria(f, 2000) === f, 'con todo fechado devuelve otra referencia (el efecto guardaría en bucle)');
  const vacia = {}; ok(fecharMaestria(vacia) === vacia, 'sin maestría devuelve otra referencia');
  // Y el efecto que buscamos: lo apuntado DESPUÉS de fechar se suma.
  eq(maestriaEfectiva(f, [{ t: 1500, pick: 'Rafaela', gane: true, recomendados: [] }, { t: 500, pick: 'Rafaela', gane: true, recomendados: [] }]).rafaela.games, TOPE_DE_SIEMPRE + 2, 'lo apuntado con la app no se suma entero sobre lo de siempre acotado');
});

test('fechar la maestría no cambia lo que cuenta: ni con pocas partidas a mano ni con previas', () => {
  // 3.13.1 fecha sola lo escrito a mano, y con la fecha la base dejaba de
  // ser «la fuente con más partidas»: 4 partidas a mano al 25% tapaban 40
  // apuntadas al 75%, y las previas de un héroe fechado no contaban. La
  // propiedad: fechar AHORA (después de todo lo apuntado) no cambia nada.
  const azar = generador(7);
  for (let caso = 0; caso < 200; caso++) {
    const heroes = ['Kaja', 'Rafaela', 'X.Borg', 'Estes'];
    const maestria = {};
    for (const n of heroes) if (azar() < 0.7) maestria[n === 'X.Borg' && azar() < 0.5 ? 'X Borg' : n] = { games: Math.floor(azar() * 60), winRate: 0.3 + azar() * 0.4 };
    const partidas = Array.from({ length: Math.floor(azar() * 80) }, (_, i) => ({ t: 1000 + i, pick: heroes[Math.floor(azar() * heroes.length)], gane: azar() < 0.6, recomendados: [], ...(azar() < 0.2 ? { previa: true } : {}) }));
    const sin = maestriaEfectiva(maestria, partidas);
    const con = maestriaEfectiva(fecharMaestria(maestria, 5000), partidas);
    for (const k of new Set([...Object.keys(sin), ...Object.keys(con)])) {
      ok(sin[k]?.games === con[k]?.games && Math.abs((sin[k]?.winRate ?? 0) - (con[k]?.winRate ?? 0)) < 1e-12,
        `caso ${caso}: fechar cambia ${k} de ${JSON.stringify(sin[k])} a ${JSON.stringify(con[k])}`);
    }
  }
  // El caso que lo destapó, y que lo apuntado DESPUÉS se suma encima.
  const kaja = { Kaja: { games: 4, winRate: 0.25, desde: 5000 } };
  const apuntadas = Array.from({ length: 40 }, (_, i) => ({ t: 1000 + i, pick: 'Kaja', gane: i % 4 !== 0, recomendados: [] }));
  eq(maestriaEfectiva(kaja, apuntadas).kaja.games, 44, '4 partidas a mano con fecha tapan 40 apuntadas antes');
  eq(maestriaEfectiva(kaja, [...apuntadas, { t: 6000, pick: 'Kaja', gane: true, recomendados: [] }]).kaja.games, 45, 'lo apuntado después no se suma');
});

test('mandan las recientes (3.56.0): lo de siempre cuenta como mucho TOPE_DE_SIEMPRE partidas y se suman TODAS las apuntadas con la app', () => {
  const desde = 1_000_000;
  const p = (t, gane, extra = {}) => ({ t, pick: 'Rafaela', gane, recomendados: [], ...extra });
  const partidas = [p(desde - 5, true), p(desde + 1, true), p(desde + 2, true), p(desde + 3, false), p(desde + 4, true, { previa: true })];
  const r = maestriaEfectiva({ Rafaela: { games: 564, winRate: 0.5, desde } }, partidas).rafaela;
  // 564 al 50% cuentan como TOPE_DE_SIEMPRE; más las 4 con la app (3 ganadas), también la de ANTES de la fecha; la previa es «de siempre».
  eq(r.games, TOPE_DE_SIEMPRE + 4, `suma mal las partidas: ${JSON.stringify(r)}`);
  ok(Math.abs(r.winRate - (TOPE_DE_SIEMPRE * 0.5 + 3) / (TOPE_DE_SIEMPRE + 4)) < 1e-12, `el winrate no es el ponderado: ${r.winRate}`);
  eq(r.apuntadas, 4); eq(r.deSiempre, 564, 'no guarda cuántas eran de siempre');
  // Lo de siempre con pocas partidas entra entero.
  eq(maestriaEfectiva({ Rafaela: { games: 10, winRate: 0.5 } }, []).rafaela.games, 10);
  // Las 26 de Diggie con la app pesan más que sus 3.821 de siempre (el caso que lo motivó).
  const diggie = Array.from({ length: 26 }, (_, i) => ({ t: i, pick: 'Diggie', gane: i < 12, recomendados: [] }));
  ok(maestriaEfectiva({ Diggie: { games: 3821, winRate: 0.54 } }, diggie).diggie.winRate < 0.515, 'las partidas de siempre siguen tapando a las de la app (antes 0,539; con el tope, (40·0,54 + 12)/66 = 0,509)');
  // Sin maestría a mano: el registro entero, previas incluidas (para eso se meten).
  eq(maestriaEfectiva({}, partidas).rafaela.games, 5);
  // Continuo: apuntar UNA partida más mueve el winrate un poco, sin saltos (sin saltos).
  const mas = maestriaEfectiva({ Rafaela: { games: 564, winRate: 0.5, desde } }, [...partidas, p(desde + 9, true)]).rafaela;
  ok(mas.games === r.games + 1 && Math.abs(mas.winRate - r.winRate) < 0.02, `una partida más salta: ${r.winRate} → ${mas.winRate}`);
  // Y cruzar el tope tampoco salta: 40 y 41 partidas de siempre dan lo mismo.
  eq(maestriaEfectiva({ A: { games: TOPE_DE_SIEMPRE, winRate: 0.6 } }, []).a.games, maestriaEfectiva({ A: { games: TOPE_DE_SIEMPRE + 1, winRate: 0.6 } }, []).a.games);
  // Por clave normalizada, como todo: «X.Borg» a mano y «X Borg» apuntado.
  eq(maestriaEfectiva({ 'X.Borg': { games: 10, winRate: 0.5, desde } }, [{ t: desde + 1, pick: 'X Borg', gane: true, recomendados: [] }]).xborg.games, 11, 'no casa X.Borg con X Borg');
  // El Veredicto sigue comparando con lo de siempre ENTERO.
  eq(maestriaDeSiempre({ Diggie: { games: 3821, winRate: 0.54 } }, diggie).diggie.games, 3821);
});
