/**
 * Pruebas de src/motor/perfil.js: fundir un perfil importado con el de aquí
 * (por instante, gana la copia local) y sanear lo que llega de un código
 * pegado. La otra mitad de esta prueba (la maestría por nombre normalizado)
 * vive en maestria.test.mjs.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { fundirPerfil, sanear } from '../../src/motor/perfil.js';
import { apuntar, olvidar, corregir, resumen } from '../../src/motor/registro.js';
import { maestriaDesdeRegistro } from '../../src/motor/maestria.js';

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

await terminar('motor/perfil');
