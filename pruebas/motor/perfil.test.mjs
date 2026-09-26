/**
 * Pruebas de src/motor/perfil.js: fundir un perfil importado con el de aquí
 * (por instante, gana la copia local) y sanear lo que llega de un código
 * pegado. La otra mitad de esta prueba (la maestría por nombre normalizado)
 * vive en maestria.test.mjs.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { fundirPerfil, sanear, recogerPerfil, exportarPerfil, leerPerfil, sanearOlvidadas, TOPE_OLVIDADAS } from '../../src/motor/perfil.js';
import { apuntar, olvidar, corregir, resumen } from '../../src/motor/registro.js';
import { maestriaDesdeRegistro, tuNivel } from '../../src/motor/maestria.js';

test('perfiles y registro: fundir por instante, sanear lo que llega y maestria por nombre normalizado', () => {
  // 1. Una partida corregida aqui y reimportada de un codigo viejo es UNA, y
  //    gana la copia local (la corregida). Antes salian dos, olvidar(t)
  //    borraba las dos y la maestria contaba doble.
  const local = apuntar([], { t: 1000, pick: 'Tigreal', gane: false });
  const exportado = { mastery: {}, partidas: local };
  const corregido = corregir(local, 1000, true);
  const fundido = fundirPerfil({ mastery: {}, partidas: corregido }, exportado);
  eq(fundido.partidas.length, 1, `la partida corregida sale ${fundido.partidas.length} veces`);
  eq(fundido.partidas[0].gane, true, 'al fundir se pierde la correccion local');
  eq(olvidar(fundido.partidas, 1000).length, 0, 'olvidar no la quita');
  eq(maestriaDesdeRegistro(fundido.partidas).Tigreal.games, 1, 'la maestria la cuenta doble');

  // 2. Un perfil con la forma rota no mete basura ni revienta la pantalla.
  const roto = sanear({ mastery: 'abc', partidas: 'xy' });
  eq(Object.keys(roto.mastery).length, 0, 'las letras de un string entran como heroes');
  eq(roto.partidas.length, 0, 'un string entra como partidas');
  const raro = sanear({ mastery: { A: { games: 10, winRate: 0.6 }, B: { games: 0, winRate: 0.5 }, C: { games: 5, winRate: 7 }, D: 'x' }, partidas: [{ t: 1, pick: 'A', gane: true, recomendados: 'ABC' }, { pick: 'B' }, null] });
  eq(Object.keys(raro.mastery).join(','), 'A', `maestria saneada: ${Object.keys(raro.mastery)}`);
  eq(raro.partidas.length, 1, 'una partida sin instante o nula pasa el filtro');
  ok(Array.isArray(raro.partidas[0].recomendados), 'recomendados no es una lista');
  ok(resumen(fundirPerfil({ mastery: {}, partidas: [] }, { mastery: 'abc', partidas: [{ t: 2, pick: 'A', gane: true, recomendados: 'ABC' }] }).partidas) != null, 'resumen revienta con un perfil saneado');
  ok(Array.isArray(apuntar(null, { pick: 'A', gane: true })), 'apuntar(null) revienta');
  eq(apuntar([], { pick: 'A', gane: true, recomendados: 'ABC' })[0].recomendados.length, 0, 'recomendados como string se guarda troceado');
});

test('sanear deja intactos los datos validos: lo guardado en el movil no se pierde al cargar', () => {
  const mastery = { Tigreal: { games: 3821, winRate: 0.54 }, 'X.Borg': { games: 12, winRate: 0.5 } };
  const partidas = [
    { t: 1700000000000, pick: 'Tigreal', recomendados: ['Tigreal', 'Atlas', 'Khufra'], gane: true, rango: 'glory', estimacion: 0.55 },
    { t: 1700000000001, pick: 'Atlas', recomendados: [], gane: false, rango: null, previa: true },
  ];
  const s = sanear({ mastery, partidas, rango: 'glory', linea: 'roam' });
  eq(JSON.stringify(s.mastery), JSON.stringify(mastery), 'sanear altera una maestria valida');
  eq(JSON.stringify(s.partidas), JSON.stringify(partidas), 'sanear altera partidas validas');
  eq(s.rango, 'glory', 'sanear pierde campos sueltos');
  // Y con basura no revienta: devuelve vacio, no undefined.
  const roto = sanear({ mastery: null, partidas: 'no' });
  ok(Array.isArray(roto.partidas) && typeof roto.mastery === 'object', 'sanear no devuelve estructuras vacias con basura');
});

test('revision linea a linea del perfil: sanear coacciona o descarta cada campo roto', () => {
  // 4. `"500" > 0` es true: la maestría guardaba el TEXTO, `tuNivel` daba
  //    0,0000037 y la referencia «050050» partidas. Y llegaban partidas con
  //    `t: NaN`, `estimacion: 7` o `gane: 'no'`.
  const sucio = sanear({
    mastery: { Diggie: { games: '500', winRate: 0.6 }, Franco: { games: Infinity, winRate: 0.5 }, Tigreal: { games: 50, winRate: 0.5 } },
    partidas: [
      { t: NaN, pick: 'A', gane: true }, { t: NaN, pick: 'B', gane: true },
      { t: 1, pick: 'C', gane: 'no', estimacion: 7, previa: 'x', recomendados: ['C', 3] },
      { t: 2, pick: '  ', gane: true }, { t: 3, pick: 'D', gane: true, estimacion: 0.6, previa: true },
    ],
  });
  eq(sucio.mastery.Diggie?.games, 500, 'games como texto no se convierte');
  ok(!('Franco' in sucio.mastery), 'games Infinity pasa');
  ok(Number.isFinite(tuNivel(sucio.mastery)) && tuNivel(sucio.mastery) > 0 && tuNivel(sucio.mastery) < 1, `tuNivel con maestría saneada: ${tuNivel(sucio.mastery)}`);
  eq(sucio.partidas.length, 2, `partidas con t NaN o pick vacío sobreviven: ${JSON.stringify(sucio.partidas)}`);
  const c = sucio.partidas.find((p) => p.pick === 'C');
  ok(c && c.gane === false && !('estimacion' in c) && !('previa' in c) && c.recomendados.join() === 'C', `campos de C no saneados: ${JSON.stringify(c)}`);
  const d = sucio.partidas.find((p) => p.pick === 'D');
  ok(d && d.previa === true && d.estimacion === 0.6, `campos válidos de D perdidos: ${JSON.stringify(d)}`);
  eq(fundirPerfil({ partidas: [] }, { partidas: [{ t: NaN, pick: 'A', gane: true }, { t: NaN, pick: 'B', gane: true }] }).partidas.length, 0, 'dos partidas con t NaN se funden en una en vez de descartarse');
});

test('el perfil viaja entero y no puede borrar nada al llegar', async () => {
  const mastery = Object.fromEntries(
    ['Diggie', 'Franco', 'Khufra'].map((n, i) => [n, { games: 3821 - i * 900, winRate: 0.54 - i * 0.01 }]));
  const partidas = Array.from({ length: 13 }, (_, i) => ({
    t: 1700000000000 - i * 86400000, pick: 'Diggie', recomendados: ['Diggie'], gane: i % 3 !== 0,
  }));

  const codigo = await exportarPerfil(recogerPerfil({ mastery, partidas, rango: 'glory', linea: 'roam' }));
  ok(codigo.startsWith('MLPA1.'), 'el codigo no lleva su marca delante');

  const { perfil } = await leerPerfil(codigo);
  ok(perfil, 'un codigo recien hecho no se puede volver a leer');
  eq(Object.keys(perfil.mastery).length, 3, 'se pierden heroes por el camino');
  eq(perfil.partidas.length, 13, 'se pierden partidas por el camino');
  eq(perfil.mastery.Diggie.games, 3821, 'se pierde el numero de partidas de un heroe');

  // Un codigo a medias NO puede importarse: llevarse por delante 3821 partidas
  // de maestria por un pegado incompleto seria el peor fallo posible aqui.
  const [m, cuerpo, ctrl] = codigo.split('.');
  eq((await leerPerfil(`${m}.${cuerpo.slice(0, -8)}.${ctrl}`)).error, 'incompleto', 'traga un codigo cortado');
  eq((await leerPerfil(`${m}.${cuerpo.slice(0, -1)}X.${ctrl}`)).error, 'incompleto', 'traga un codigo alterado');
  eq((await leerPerfil('hola que tal')).error, 'formato', 'traga cualquier texto');
  eq((await leerPerfil('')).error, 'vacio', 'traga una cadena vacia');
  // Y los espacios y saltos de linea de un pegado real no pueden estorbar.
  ok((await leerPerfil(`  ${m}.\n${cuerpo}.\n${ctrl} `)).perfil, 'un pegado con espacios no se lee');

  // Al fundir, gana quien tenga MAS partidas y no se pierde nada del otro lado.
  const enElPc = {
    mastery: { Diggie: { games: 10, winRate: 0.9 }, Chou: { games: 500, winRate: 0.52 } },
    partidas: [{ t: 1, pick: 'Chou', recomendados: [], gane: true }],
  };
  const f = fundirPerfil(enElPc, perfil);
  eq(f.mastery.Diggie.games, 3821, 'el dispositivo con MENOS partidas pisa al que tiene mas');
  ok(f.mastery.Chou, 'se pierde un heroe que solo estaba en el dispositivo de destino');
  eq(f.partidas.length, 14, 'no junta las partidas de los dos lados');

  // Y AL REVES, que es el caso peligroso: pegar un codigo VIEJO en el
  // dispositivo bueno. Si el que llega pisara sin mirar, aqui se irian 3821
  // partidas de maestria por pegar un codigo de hace un mes. La primera
  // version de esta prueba solo miraba la direccion facil y pasaba aunque se
  // quitara el mecanismo entero.
  const viejo = { mastery: { Diggie: { games: 12, winRate: 0.9 } }, partidas: [] };
  const alReves = fundirPerfil({ mastery, partidas }, viejo);
  eq(alReves.mastery.Diggie.games, 3821, 'un codigo viejo se lleva por delante la maestria buena');
  eq(alReves.partidas.length, 13, 'un codigo viejo se lleva por delante las partidas');

  // Importar dos veces no puede duplicar nada: se hara mas de una vez.
  const otraVez = fundirPerfil(f, perfil);
  eq(otraVez.partidas.length, 14, 'importar dos veces duplica las partidas');
  eq(Object.keys(otraVez.mastery).length, Object.keys(f.mastery).length, 'importar dos veces duplica maestria');
});

test('una partida quitada a propósito no vuelve al fundir, venga la marca de donde venga, y la marca viaja en el código', async () => {
  const a = { t: 1000, pick: 'Atlas', gane: true, recomendados: [] };
  const b = { t: 2000, pick: 'Tigreal', gane: false, recomendados: [] };
  // Móvil: quitó `a`. Llega un código viejo (otro dispositivo, o la base de datos) que aún la tiene.
  const movil = { mastery: {}, partidas: [b], olvidadas: [1000] };
  const viejo = { mastery: {}, partidas: [a, b] };
  const f1 = fundirPerfil(movil, viejo);
  eq(f1.partidas.length, 1, 'la partida quitada en el móvil vuelve al importar un código viejo');
  eq(f1.partidas[0].t, 2000);
  eq(f1.olvidadas.join(), '1000', 'la marca se pierde al fundir');
  // Al revés: lo guardado la tiene y el que llega trae la marca (la base de datos del proyecto).
  const f2 = fundirPerfil({ mastery: {}, partidas: [a, b] }, { mastery: {}, partidas: [b], olvidadas: [1000] });
  eq(f2.partidas.map((p) => p.t).join(), '2000', 'la marca que llega no quita la partida guardada');
  eq(f2.olvidadas.join(), '1000');
  // Y una vez quitada, un tercer código sin marca tampoco la devuelve (la marca se queda).
  eq(fundirPerfil(f2, viejo).partidas.length, 1, 'un código sin marca resucita la partida');
  // Viaja en el código de perfil, ida y vuelta.
  const { perfil } = await leerPerfil(await exportarPerfil(recogerPerfil({ partidas: [b], olvidadas: [1000] })));
  eq(perfil.olvidadas.join(), '1000', 'la marca no viaja en el código');
  // Sin marcas el código no cambia de forma (no se añade el campo).
  ok(!('olvidadas' in recogerPerfil({ partidas: [b] })), 'un perfil sin marcas lleva el campo vacío');
  // Saneado: números finitos, sin repetir, más recientes primero, con tope.
  eq(sanearOlvidadas([3, '2', 3, NaN, null, 'x', true, 1]).join(), '3,2,1');
  eq(sanearOlvidadas('basura').length, 0);
  eq(sanearOlvidadas(Array.from({ length: TOPE_OLVIDADAS + 50 }, (_, i) => i)).length, TOPE_OLVIDADAS);
  eq(sanear({ olvidadas: [5, 'x'] }).olvidadas.join(), '5');
});

test('la fecha de la maestría viaja en el código y se sanea', async () => {
  const limpio = sanear({ mastery: { A: { games: 10, winRate: 0.5, desde: 123 }, B: { games: 10, winRate: 0.5, desde: 'ayer' }, C: { games: 10, winRate: 0.5, desde: -1 } } }).mastery;
  eq(limpio.A.desde, 123, 'sanear pierde la fecha');
  ok(!('desde' in limpio.B) && !('desde' in limpio.C), 'sanear deja pasar una fecha que no es un instante');
  const { perfil } = await leerPerfil(await exportarPerfil(recogerPerfil({ mastery: { A: { games: 10, winRate: 0.5, desde: 123 } } })));
  eq(perfil.mastery.A.desde, 123, 'la fecha no viaja en el código de perfil');
});

test('al fundir la maestría gana la de más partidas AUNQUE la otra tenga fecha más reciente; en el empate, la que trae fecha', () => {
  // La fecha la pone también la app sola al ver una maestría sin fecha
  // (3.13.1), así que dice cuándo la vio ese dispositivo, no cuándo se
  // copiaron los números del juego: «gana la más reciente» dejaba que un
  // móvil con 10 partidas, fechado después, borrara las 3.821 del otro
  // (lo cazó persistencia.e2e en 3.14.0). En las dos direcciones.
  const buena = { Diggie: { games: 3821, winRate: 0.55, desde: 100 } };
  const nueva = { Diggie: { games: 10, winRate: 0.9, desde: 200 } };
  eq(fundirPerfil({ mastery: nueva }, { mastery: buena }).mastery.Diggie.games, 3821, 'una copia más reciente con menos partidas borra la buena');
  eq(fundirPerfil({ mastery: buena }, { mastery: nueva }).mastery.Diggie.games, 3821, 'una copia más reciente con menos partidas borra la buena (al revés)');
  // En el empate de partidas, la que trae fecha: si no, se perdía y la app la volvía a fechar a «ahora».
  const sinFecha = { Diggie: { games: 3821, winRate: 0.55 } };
  eq(fundirPerfil({ mastery: sinFecha }, { mastery: buena }).mastery.Diggie.desde, 100, 'en el empate se pierde la fecha');
  eq(fundirPerfil({ mastery: buena }, { mastery: sinFecha }).mastery.Diggie.desde, 100, 'en el empate se pierde la fecha (al revés)');
});

await terminar('motor/perfil');
