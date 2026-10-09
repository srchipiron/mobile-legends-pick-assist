/**
 * Pruebas de la revisión del draft (3.49.0, `revisarPartida` y
 * `revisarDrafts` en draft.js). Propiedades, no el dato del día: el que
 * coge el nº1 sale «bien»; el que coge el último ve al nº1 con la diferencia
 * exacta; las previas y los drafts sin línea no cuentan; un héroe de otra
 * línea se puntúa aparte; y la comparación pide 10 y 10.
 */
import { test, ok, eq, casi, leerJson, terminar, generador } from '../arnes.mjs';
import { catalogo } from '../fixtures/catalogo.mjs';
import { prepararDatos, resolverNombres, ordenar, estimarCon, revisarPartida, revisarDrafts } from '../../src/motor/draft.js';
import { MARGEN_EMPATE } from '../../src/motor/ranking.js';
import { BRECHA_CLARA } from '../../src/motor/analisis.js';

const datos = prepararDatos({ catalogo, meta: leerJson('public/data/roam-meta.json'), rango: 'glory' });
const DRAFT = { linea: 'roam', enemigos: ['Layla', 'Fanny', 'Chou', 'Kagura', 'Granger'], aliados: ['Lukas', 'Pharsa'] };
const ranking = ordenar(datos, { linea: 'roam', enemigos: resolverNombres(datos, DRAFT.enemigos), aliados: resolverNombres(datos, DRAFT.aliados) });
const partida = (pick, extra = {}) => ({ t: 1000, pick, gane: true, draft: DRAFT, ...extra });

test('coger el nº1 es «bien», sin mejor ni diferencia', () => {
  const r = revisarPartida(datos, partida(ranking[0].heroe.name));
  eq(r.veredicto, 'bien'); eq(r.puesto, 1); eq(r.mejor, null); eq(r.dif, 0);
  eq(r.de, ranking.length);
});

test('coger el último dice quién era el nº1 y cuánto se dejó', () => {
  const ultimo = ranking.at(-1);
  const r = revisarPartida(datos, partida(ultimo.heroe.name));
  eq(r.puesto, ranking.length);
  eq(r.mejor.heroe, ranking[0].heroe.name);
  casi(r.dif, ranking[0].p - ultimo.p, 1e-12);
  eq(r.veredicto, r.dif * 100 >= BRECHA_CLARA ? 'mejor' : r.dif < MARGEN_EMPATE ? 'bien' : 'poco');
  ok(r.dif * 100 >= BRECHA_CLARA, 'del primero al último hay más de la brecha clara');
});

test('cada puesto lleva el veredicto de sus márgenes, y salen empates y «por poco» de verdad', () => {
  const vistos = { empate: 0, poco: 0 };
  // 12 drafts de enemigos al azar (semilla fija) fuera del pool de roam.
  const azar = generador(11);
  const fuera = datos.heroes.filter((x) => !x.roam && !DRAFT.aliados.includes(x.name)).map((x) => x.name);
  const drafts = Array.from({ length: 12 }, () => {
    const l = [...fuera]; const e = [];
    while (e.length < 5) e.push(l.splice(Math.floor(azar() * l.length), 1)[0]);
    return e;
  });
  for (const enemigos of drafts) {
    const d = { ...DRAFT, enemigos };
    const rk = ordenar(datos, { linea: 'roam', enemigos: resolverNombres(datos, enemigos), aliados: resolverNombres(datos, DRAFT.aliados) });
    rk.forEach((c, i) => {
      const r = revisarPartida(datos, partida(c.heroe.name, { draft: d }));
      const dif = rk[0].p - c.p;
      const esperado = i === 0 || dif < MARGEN_EMPATE ? 'bien' : dif * 100 >= BRECHA_CLARA ? 'mejor' : 'poco';
      eq(r.veredicto, esperado, `${c.heroe.name}: ${r.veredicto} y tocaba ${esperado}`);
      if (i > 0 && esperado === 'bien') vistos.empate++;
      if (esperado === 'poco') vistos.poco++;
    });
  }
  ok(vistos.empate > 0 && vistos.poco > 0, `la prueba no ve los dos márgenes: ${JSON.stringify(vistos)}`);
});

test('un héroe de otra línea se puntúa aparte, sin puesto', () => {
  const r = revisarPartida(datos, partida('Hayabusa'));
  eq(r.puesto, null);
  const [yo] = resolverNombres(datos, ['Hayabusa']);
  casi(r.p, estimarCon(datos, { yo, enemigos: resolverNombres(datos, DRAFT.enemigos), aliados: resolverNombres(datos, DRAFT.aliados) }).p, 1e-12);
});

test('sin draft, sin línea, sin enemigos o con un héroe desconocido no hay revisión', () => {
  eq(revisarPartida(datos, { t: 1, pick: 'Diggie', gane: true }), null);
  eq(revisarPartida(datos, partida('Diggie', { draft: { ...DRAFT, linea: undefined } })), null);
  eq(revisarPartida(datos, partida('Diggie', { draft: { ...DRAFT, enemigos: [] } })), null);
  eq(revisarPartida(datos, partida('NoExiste')), null);
});

test('los baneos de la partida no se recomiendan como mejores', () => {
  const r = revisarPartida(datos, partida(ranking.at(-1).heroe.name, { bans: [ranking[0].heroe.name] }));
  eq(r.mejor.heroe, ranking[1].heroe.name);
});

test('revisarDrafts: sin previas, con recuentos, y la comparación solo con 10 y 10', () => {
  const malo = ranking.at(-1).heroe.name; const bueno = ranking[0].heroe.name;
  const lista = [];
  for (let i = 0; i < 12; i++) lista.push({ t: i, pick: malo, gane: i < 3, draft: DRAFT });
  for (let i = 0; i < 12; i++) lista.push({ t: 100 + i, pick: bueno, gane: i < 10, draft: DRAFT });
  lista.push({ t: 500, pick: bueno, gane: true, draft: DRAFT, previa: true });
  const r = revisarDrafts(datos, lista);
  eq(r.n, 24); eq(r.bien, 12); eq(r.claro, 12);
  ok(r.comparacion && r.comparacion.nClaro === 12 && r.comparacion.nResto === 12, 'comparación con 12 y 12');
  ok(r.comparacion.seVe && r.comparacion.dif < 0, '3/12 frente a 10/12 se distingue');
  eq(revisarDrafts(datos, lista.slice(3)).comparacion, null, 'con 9 de un lado no se compara');
  eq(revisarDrafts(datos, []).n, 0);
});

await terminar('motor/revision');
