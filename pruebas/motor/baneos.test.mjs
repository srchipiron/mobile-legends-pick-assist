/**
 * Pruebas de src/motor/baneos.js: a quién conviene banear por tu equipo.
 * Lo que vigila: que la amenaza salga del CRUCE REAL contra tus aliados (y
 * de la tabla de etiquetas solo sin dato), sin escalón, y que la pérdida
 * esperada escale con lo que ese héroe sale de verdad cuando está libre.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { heroes, h } from '../fixtures/catalogo.mjs';
import { indexarPorNombre } from '../../src/motor/nombres.js';
import { sugerirBaneos, proximosBaneos, coocurrenciaDeBaneos } from '../../src/motor/baneos.js';
import { apuntar } from '../../src/motor/registro.js';
import { sanear } from '../../src/motor/perfil.js';
import { CRUCE_DESTACABLE } from '../../src/motor/matrices.js';

test('los baneos señalan la amenaza real contra tu equipo', () => {
  const stats = Object.fromEntries(heroes.map((x) => [x.name, { winRate: 0.50, banRate: 0.04, pickRate: 0.02, matches: 5000 }]));
  stats.Fanny = { winRate: 0.53, banRate: 0.60, pickRate: 0.02, matches: 9000 };
  const r = sugerirBaneos(heroes, { aliados: [h('Melissa')], meta: { stats: indexarPorNombre(stats), mediaDelRango: 0.50 } });
  ok(r[0].heroe.name === 'Fanny', `esperaba Fanny la primera, salió ${r[0].heroe.name}`);
});

test('los baneos miden el peligro con el cruce real, y con la tabla solo sin dato', () => {
  const H = (name, tags = []) => ({ name, role: 'assassin', tags, lanes: ['jungle'] });
  const aliado = { name: 'Al', role: 'marksman', tags: ['immobile', 'hypercarry'], lanes: ['gold'] };
  const X = H('X'); const Y = H('Y'); const Z = H('Z', ['dive', 'burst']);
  const stats = indexarPorNombre(Object.fromEntries(['X', 'Y', 'Z', 'Al'].map((n) => [n, { winRate: 0.5, banRate: 0.1, pickRate: 0.02 }])));
  // Con dato: X gana el cruce a tu aliado (56%), Y lo pierde (44%), Z (con las
  // etiquetas de la tabla) va al 50%. Manda el dato: X primero; Y y Z no
  // quitan nada, asi que ni salen.
  const counters = indexarPorNombre({ X: { Al: 0.56 }, Y: { Al: 0.44 }, Z: { Al: 0.5 } }, 2);
  const conDato = sugerirBaneos([X, Y, Z], { aliados: [aliado], meta: { stats, counters, mediaDelRango: 0.5 } });
  eq(conDato[0]?.heroe.name, 'X', `con dato deberia mandar el cruce: ${conDato.map((b) => b.heroe.name)}`);
  ok(!conDato.some((b) => b.heroe.name === 'Z'), 'con cruce al 50% la tabla por etiquetas no deberia sumar nada');
  ok(!conDato.some((b) => b.heroe.name === 'Y'), 'un heroe que pierde el cruce no es un peligro');
  ok(conDato[0].motivos[0]?.clave === 'peligro.ganaCruce' && conDato[0].motivos[0].params.pct === 56, `motivo de X: ${JSON.stringify(conDato[0].motivos)}`);
  ok(0.56 >= CRUCE_DESTACABLE, 'el fixture tiene que superar el umbral de motivo');
  // Sin escalon: un 50,1% quita casi nada.
  const rozando = sugerirBaneos([X, Y], { aliados: [aliado], meta: { stats, counters: indexarPorNombre({ X: { Al: 0.501 }, Y: { Al: 0.5 } }, 2), mediaDelRango: 0.5 } });
  ok(!rozando.length || rozando[0].puntos === 0, `un 50,1% deberia valer casi lo mismo que un 50%: ${rozando.map((b) => b.valor)}`);
  // Y la perdida esperada cuenta CUANTO sale: el mismo cruce con el doble de
  // pickrate es el doble de peligro, y un banrate alto no lo esconde.
  const dos = sugerirBaneos([X, Y], { aliados: [aliado], meta: { stats: indexarPorNombre({ X: { winRate: 0.5, banRate: 0.1, pickRate: 0.02 }, Y: { winRate: 0.5, banRate: 0.55, pickRate: 0.02 }, Al: { winRate: 0.5 } }), counters: indexarPorNombre({ X: { Al: 0.56 }, Y: { Al: 0.56 } }, 2), mediaDelRango: 0.5 } });
  eq(dos[0].heroe.name, 'Y', 'con el mismo cruce, el mas baneado (que sale mas cuando esta libre) deberia ir primero');
  ok(Math.abs(dos[0].valor / dos[1].valor - 2) < 1e-6, `la perdida esperada no escala con la disponibilidad: ${dos.map((b) => b.valor)}`);
  // Sin dato (heroe recien salido): la tabla por etiquetas sigue mandando.
  const sinDato = sugerirBaneos([X, Z], { aliados: [aliado], meta: { stats, counters: {}, mediaDelRango: 0.5 } });
  eq(sinDato[0].heroe.name, 'Z', 'sin cruce, la tabla de peligro deberia poner primero al que salta encima');
  eq(sinDato[0].motivos[0]?.clave, 'peligro.saltaEncima', 'sin cruce no sale el motivo por etiqueta');
});

test('el siguiente baneo probable es el más baneado del rango que aún no está marcado', () => {
  const lista = ['A', 'B', 'C', 'D', 'X Borg'].map((n) => ({ name: n, tags: [] }));
  const stats = indexarPorNombre({ A: { banRate: 0.8 }, B: { banRate: 0.6 }, C: { banRate: 0.1 }, D: { winRate: 0.5 }, 'X.Borg': { banRate: 0.7 } });
  const meta = { stats };
  const nombres = (l) => l.map((x) => x.heroe.name).join(',');
  // Ordenado por tasa de ban, con la clave normalizada (X Borg / X.Borg) y sin el héroe sin tasa.
  eq(nombres(proximosBaneos(lista, { meta, n: 10 })), 'A,X Borg,B,C', 'no ordena por tasa de ban');
  // Al marcar el primero, entra el siguiente: eso es lo que evita escribir.
  eq(nombres(proximosBaneos(lista, { meta, baneos: [lista[0]], n: 2 })), 'X Borg,B', 'no refresca al marcar el primero');
  // Lo cogido por cualquier lado no se propone.
  eq(nombres(proximosBaneos(lista, { meta, enemigos: [lista[4]], aliados: [lista[1]], n: 10 })), 'A,C', 'propone a un héroe ya cogido');
  ok(proximosBaneos(lista, { meta: {}, n: 10 }).length === 0, 'inventa tasas sin estadísticas');

  // Con tu historial: lo que en tus partidas cayó junto a lo ya marcado sube.
  // C se banea poco en el rango (10%) pero en tus partidas SIEMPRE cae con A;
  // con A marcada, C pasa por delante de B (60%). Sin marcar nada, o sin
  // historial, manda la tasa de ban. Y el suavizado es continuo: una sola
  // partida mueve poco, no salta.
  const partida = (bans, t) => ({ t, pick: 'A', gane: true, bans });
  const muchas = coocurrenciaDeBaneos(Array.from({ length: 12 }, (_, i) => partida(['A', 'C'], i + 1)));
  eq(muchas.N, 12, 'no cuenta las partidas con baneos');
  eq(nombres(proximosBaneos(lista, { meta, baneos: [lista[0]], historial: muchas, n: 3 })), 'C,X Borg,B', 'el historial no sube lo que cae junto a lo marcado');
  eq(nombres(proximosBaneos(lista, { meta, historial: muchas, n: 3 })), 'A,X Borg,B', 'sin nada marcado el historial cambia el orden');
  eq(nombres(proximosBaneos(lista, { meta, baneos: [lista[0]], historial: coocurrenciaDeBaneos([]), n: 3 })), 'X Borg,B,C', 'sin historial no manda la tasa de ban');
  const una = coocurrenciaDeBaneos([partida(['A', 'C'], 1)]);
  const conUna = proximosBaneos(lista, { meta, baneos: [lista[0]], historial: una, n: 3 });
  ok(conUna[0].heroe.name === 'X Borg' && conUna.find((x) => x.heroe.name === 'C').factor > 1, `una sola partida ya empuja pero no salta: ${JSON.stringify(conUna.map((x) => [x.heroe.name, x.factor.toFixed(2)]))}`);
  // Basura en bans: no cuenta ni revienta.
  eq(coocurrenciaDeBaneos([{ bans: 'A' }, { bans: [1, null] }, { bans: ['A'] }]).N, 1, 'cuenta partidas con baneos rotos');

  // Y las partidas guardan sus baneos, saneados; sin baneos no llevan el campo.
  const con = apuntar([], { pick: 'A', gane: true, bans: ['Fanny', 7, '', 'Ling'], t: 5 })[0];
  eq((con.bans ?? []).join(','), 'Fanny,Ling', `apuntar no guarda los baneos limpios: ${JSON.stringify(con)}`);
  ok(!('bans' in apuntar([], { pick: 'A', gane: true, t: 6 })[0]), 'una partida sin baneos lleva el campo');
  const saneadas = sanear({ partidas: [{ pick: 'A', t: 1, bans: ['Fanny', 3] }, { pick: 'B', t: 2, bans: 'Fanny' }] }).partidas;
  eq(JSON.stringify(saneadas.map((p) => p.bans ?? null)), '[["Fanny"],null]', `sanear no limpia los baneos: ${JSON.stringify(saneadas)}`);
});

await terminar('motor/baneos');
