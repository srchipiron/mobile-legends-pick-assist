/**
 * Pruebas de src/motor/draft.js: el cerebro. Por aquí pasa TODO —la app, el
 * diagnóstico del móvil, el del bot y el arnés de paridad—, así que es el
 * único sitio donde se decide qué rango manda, cómo se resuelven los nombres
 * guardados y qué líneas enemigas quedan abiertas. Hasta ahora no tenía
 * pruebas propias: se ejercitaba de refilón desde las de otros módulos.
 */
import { test, ok, eq, leerJson, terminar } from '../arnes.mjs';
import { catalogo, h } from '../fixtures/catalogo.mjs';
import { LINEAS } from '../../src/motor/catalogo.js';
import {
  rangoActivo, prepararDatos, resolverNombres, poolDe,
  lineasEnemigasAbiertas, rivalDeLinea, recomendar,
} from '../../src/motor/draft.js';
import { elegirVentana } from '../../src/motor/ventana.js';
import { indexarPorNombre } from '../../src/motor/nombres.js';

const meta = leerJson('public/data/roam-meta.json');

test('el rango activo: el pedido si esta, si no el de la ingesta, si no el primero', () => {
  // Antes la app se quedaba SIN estadisticas teniendolas de otro rango: pedia
  // un rango que la ingesta no habia descargado y `stats` salia vacio.
  const dos = { rank: 'mythic', statsByRank: { glory: {}, mythic: {} } };

  // 1. El rango pedido, si esta descargado.
  eq(rangoActivo(dos, 'glory'), 'glory', 'no usa el rango que se le pide');
  eq(rangoActivo(dos, 'mythic'), 'mythic', 'no usa el rango que se le pide');

  // 2. Pedido pero NO descargado: cae al de la ingesta, no se queda a cero.
  eq(rangoActivo(dos, 'legend'), 'mythic', 'con el rango pedido sin descargar no cae al de la ingesta');

  // 3. Ni el pedido ni el de la ingesta estan: el primero que haya.
  eq(rangoActivo({ rank: 'mythic', statsByRank: { epic: {}, legend: {} } }, 'glory'), 'epic',
    'no cae al primer rango disponible');

  // 4. Sin nada descargado no se inventa un rango: devuelve el que se sepa, y
  //    null si no se sabe ninguno.
  eq(rangoActivo({ rank: 'glory' }, null), 'glory', 'sin statsByRank pierde el rango de la ingesta');
  eq(rangoActivo({}, 'glory'), 'glory', 'sin statsByRank pierde el rango pedido');
  eq(rangoActivo({}, null), null, 'se inventa un rango sin datos');
  eq(rangoActivo(null, null), null, 'revienta sin meta');

  // 5. Con los datos de verdad y sin pedir nada, manda el de la INGESTA. El
  //    rango por defecto de Javi es `glory` (Gloria Mitica), no `mythic` ni
  //    el primero del fichero: si esto se mueve, la app entera decide con las
  //    estadisticas de otra poblacion sin decir nada.
  ok((meta.heroes ?? []).length >= 100, `roam-meta.json trae ${(meta.heroes ?? []).length} heroes: el rango no se puede comprobar`);
  eq(meta.rank, 'glory', `la ingesta viene del rango ${meta.rank}, no de glory`);
  eq(rangoActivo(meta, null), 'glory', 'sin pedir rango no usa el de la ingesta');
  eq(prepararDatos({ catalogo, meta }).rango, 'glory', 'prepararDatos no usa el rango de la ingesta');
  eq(prepararDatos({ catalogo, meta, rango: 'epic' }).rango, 'epic', 'prepararDatos ignora el rango pedido');
  // Y el rango elegido cambia las estadisticas de verdad, no solo la etiqueta.
  const wr = (r) => prepararDatos({ catalogo, meta, rango: r }).meta.stats?.khufra?.winRate;
  ok(wr('glory') != null && wr('epic') != null && wr('glory') !== wr('epic'),
    `el rango no cambia las estadisticas: glory ${wr('glory')} / epic ${wr('epic')}`);
});

test('los nombres guardados se validan contra el catalogo al cargar', () => {
  // El draft se guarda por NOMBRE, y un heroe renombrado por la API (o un
  // catalogo cambiado) dejaba un nombre que no pintaba ficha, no se podia
  // quitar, contaba como cogido y dejaba un hueco de mas. Se validan; no se
  // confian.
  const datos = prepararDatos({ catalogo, meta });
  const vivos = resolverNombres(datos, ['Khufra', 'Atlas']);
  eq(vivos.length, 2, 'pierde nombres que si estan en el catalogo');
  eq(vivos.map((x) => x.name).join(','), 'Khufra,Atlas', 'no devuelve los heroes en el orden guardado');

  const conFantasma = resolverNombres(datos, ['Khufra', 'Heroe Que Ya No Existe', 'Atlas']);
  eq(conFantasma.length, 2, 'un nombre que ya no existe se cuela en el draft');
  ok(!conFantasma.some((x) => x == null), 'deja un hueco nulo en vez de quitarlo');
  eq(resolverNombres(datos, ['Heroe Que Ya No Existe']).length, 0, 'un nombre desconocido resuelve a algo');
  eq(resolverNombres(datos, []).length, 0, 'una lista vacia resuelve a algo');
  eq(resolverNombres(datos).length, 0, 'sin lista revienta');

  // Y el rival marcado se desmarca si ya no esta entre los enemigos.
  eq(rivalDeLinea(datos, { linea: 'roam', enemigos: [h('Kadita')], marcado: 'Kadita' }).marcado, true,
    'no respeta el rival marcado a mano');
  eq(rivalDeLinea(datos, { linea: 'roam', enemigos: [h('Kadita')], marcado: 'Ixia' }).marcado, false,
    'marca como rival a alguien que no esta enfrente');
});

test('las lineas enemigas abiertas: ninguna sin enemigos y ninguna con los cinco', () => {
  const datos = prepararDatos({ catalogo, meta });

  // Sin enemigos no hay informacion: NO son cinco lineas abiertas, son cero.
  // Con cero enemigos el termino «por ver» no tiene contra quien esperar
  // nada, y repartir un draft vacio entre las cinco lineas seria inventarselo.
  eq(lineasEnemigasAbiertas(datos, []).length, 0, 'con el draft vacio se inventa lineas abiertas');
  eq(lineasEnemigasAbiertas(datos).length, 0, 'sin enemigos revienta');

  // Con tres enemigos de tres lineas claras, quedan dos.
  const tres = [h('Layla'), h('Fanny'), h('Pharsa')];
  const abiertas = lineasEnemigasAbiertas(datos, tres);
  eq(abiertas.length, 2, `con tres enemigos deberian quedar dos lineas: ${abiertas}`);
  ok(abiertas.every((l) => LINEAS.includes(l)), `linea abierta que no es una linea: ${abiertas}`);
  ok(new Set(abiertas).size === abiertas.length, `una linea repetida: ${abiertas}`);

  // Con los cinco a la vista no queda nada por ver.
  const cinco = [h('Layla'), h('Fanny'), h('Pharsa'), h('Chou'), h('Khufra')];
  eq(lineasEnemigasAbiertas(datos, cinco).length, 0, 'con los cinco enemigos sigue esperando picks');
  // Y con seis (no deberia pasar, pero el draft se guarda por nombre) tampoco.
  eq(lineasEnemigasAbiertas(datos, [...cinco, h('Atlas')]).length, 0, 'con mas de cinco enemigos sigue esperando picks');
});

test('recomendar devuelve todas sus piezas con el draft vacio y con el draft completo', () => {
  ok((meta.heroes ?? []).length >= 100 && meta.counters,
    `roam-meta.json trae ${(meta.heroes ?? []).length} heroes y ${meta.counters ? '' : 'NINGUNA '}matriz de cruces: recomendar no se puede comprobar`);
  const datos = prepararDatos({ catalogo, meta });
  const pools = datos.poolsPorLinea;
  ok(!LINEAS.some((l) => pools[l].length < 10),
    `alguna linea se queda sin pool: ${LINEAS.map((l) => `${l}:${pools[l].length}`).join(' ')}`);

  // 1. Draft vacio: hay ranking (el pool entero) y no se inventa nada de lo
  //    que hace falta tener a alguien delante.
  const vacio = recomendar(datos, { linea: 'roam' });
  eq(vacio.pool.length, pools.roam.length, 'el pool del draft vacio no es el de la linea');
  eq(vacio.ranking.length, pools.roam.length, 'el ranking del draft vacio no cubre el pool');
  ok(vacio.ranking.every((r) => r.p > 0 && r.p < 1), 'alguna nota no es una probabilidad');
  ok(vacio.ranking.every((r, i) => i === 0 || vacio.ranking[i - 1].p >= r.p), 'el ranking no esta ordenado');
  eq(vacio.lineasAbiertas.length, 0, 'con el draft vacio se inventa lineas abiertas');
  eq(vacio.rival.nombre, null, 'se inventa un rival de linea sin enemigos');
  eq(vacio.robustez, null, 'simula finales sin un solo enemigo');
  eq(vacio.composicion, null, 'analiza la composicion de un equipo vacio');
  eq(vacio.consejos.length, 0, 'aconseja a los companeros sin ningun enemigo a la vista');
  ok(Array.isArray(vacio.analisis) && vacio.analisis.length <= 3, `el analisis suelta ${vacio.analisis.length} frases`);
  ok(Array.isArray(vacio.empate), 'empate no es una lista');
  ok(vacio.baneosSugeridos.length > 0, 'no sugiere ningun baneo con las estadisticas delante');
  eq(vacio.cobertura.total, pools.roam.length, 'la cobertura no cuenta el pool entero');

  // 2. Draft completo (cinco enemigos, cuatro aliados, dos baneos): todas las
  //    piezas, sin lineas abiertas y sin simulacion, porque no falta nada.
  const enemigos = [h('Layla'), h('Fanny'), h('Pharsa'), h('Chou'), h('Franco')];
  const aliados = [h('Melissa'), h('Ling'), h('Kagura'), h('Masha')];
  const baneos = [h('Kadita'), h('Ixia')];
  const lleno = recomendar(datos, { linea: 'roam', enemigos, aliados, baneos, maestria: { Khufra: { games: 120, winRate: 0.58 } } });
  eq(lleno.lineasAbiertas.length, 0, 'con los cinco enemigos sigue esperando picks');
  eq(lleno.robustez, null, 'simula finales con el draft completo');
  ok(lleno.ranking.length > 0, 'el ranking se queda vacio con el draft completo');
  const fuera = new Set([...enemigos, ...aliados, ...baneos].map((x) => x.name));
  ok(!lleno.ranking.some((r) => fuera.has(r.heroe.name)), 'recomienda a alguien cogido o baneado');
  ok(lleno.rival.nombre != null && enemigos.some((e) => e.name === lleno.rival.nombre),
    `el rival de linea deducido (${lleno.rival.nombre}) no esta entre los enemigos`);
  eq(lleno.rival.marcado, false, 'dice que el rival esta marcado a mano sin estarlo');
  ok(lleno.composicion && lleno.composicion.mio && lleno.composicion.suyo, 'no analiza la composicion con los dos equipos llenos');
  ok(lleno.consejos.length === 0 || lleno.consejos.every((c) => c.linea !== 'roam'), 'aconseja para mi propia linea');
  ok(Array.isArray(lleno.analisis) && lleno.analisis.length > 0 && lleno.analisis.length <= 3,
    `el analisis suelta ${lleno.analisis.length} frases con el draft entero delante`);
  ok(lleno.analisis.every((f) => f.clave && f.tono), `una frase sin clave o sin tono: ${JSON.stringify(lleno.analisis)}`);

  // 3. Y el draft SI cambia la recomendacion: si el nº1 fuera el mismo con el
  //    draft vacio que con cinco enemigos y cuatro aliados, esto seria una
  //    lista del meta, no un asistente de draft.
  ok(vacio.ranking[0].heroe.name !== lleno.ranking[0].heroe.name
    || vacio.ranking[1].heroe.name !== lleno.ranking[1].heroe.name,
  `mismo ranking con el draft vacio que con el completo: ${lleno.ranking.slice(0, 2).map((r) => r.heroe.name)}`);

  // 4. Sin linea no hay pool y no revienta: la app arranca asi.
  const sinLinea = recomendar(datos, { linea: null, enemigos });
  eq(sinLinea.pool.length, 0, 'saca pool sin saber que linea juegas');
  eq(sinLinea.ranking.length, 0, 'ordena un pool vacio');
  eq(poolDe(datos, null).length, 0, 'poolDe se inventa un pool sin linea');
});

test('prepararDatos decide la ventana en UN sitio: la corta si viene y es coherente, si no la de 7', () => {
  // Es el unico sitio donde se decide, asi que la app, el bot y el arnes de
  // paridad ven las mismas estadisticas. Y el centro del termino de heroe
  // (mediaDelRango) tiene que ser el de LA MISMA ventana, o el termino queda
  // descentrado justo cuando cambia la ventana.
  // Los datos reales traen ya la ventana corta (3.2.0), asi que la base de
  // la prueba es el meta SIN ella: es la unica forma de saber que lo que
  // cambia lo cambia la ventana y no otra cosa.
  const sinRecientes = { ...meta }; delete sinRecientes.recientes;
  const sin = prepararDatos({ catalogo, meta: sinRecientes });
  eq(sin.meta.ventana.dias, 7, 'sin ventana corta no manda la de 7');
  ok(sin.meta.statsSemana, 'no expone las estadisticas de la semana');
  eq(sin.meta.mediaDelRango, meta.avgByRank[sin.rango], 'con la de 7 la media no es la que calculo la ingesta');
  // Y con los datos reales tal cual, la decision es la de elegirVentana
  // sobre las mismas entradas: la corta si es coherente, la de 7 si no.
  // NO se exige que sea la corta: el 19 de septiembre de 2026, tres dias
  // despues del reinicio de temporada, la de 3 dias de Gloria vino vacia
  // (Lolita al 100%, σ 0,168 frente a 0,032; r = -0,01 con la de 7) y la
  // guarda la descarto, que es justo lo que tiene que hacer. Una prueba que
  // exigiera la corta habria bloqueado el despliegue por un dato legitimo.
  const real = prepararDatos({ catalogo, meta });
  const recientesReales = meta.recientes?.statsByRank?.[real.rango] ? indexarPorNombre(meta.recientes.statsByRank[real.rango]) : null;
  const decision = elegirVentana(indexarPorNombre(meta.statsByRank?.[real.rango] ?? meta.stats), recientesReales, meta.recientes?.dias ?? 3);
  eq(real.meta.ventana.dias, decision.ventana.dias, `prepararDatos decide otra ventana (${real.meta.ventana.dias}) que elegirVentana (${decision.ventana.dias}: ${decision.ventana.motivo})`);
  eq(real.meta.ventana.motivo, decision.ventana.motivo);

  // Con una ventana corta coherente (la de 7 desplazada 0,3 pp): entra, y
  // la media se recalcula con lo que de verdad se usa.
  const rango = sin.rango;
  const base = meta.statsByRank?.[rango] ?? meta.stats;
  const corta = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, { winRate: v.winRate + 0.003 }]));
  const con = prepararDatos({ catalogo, meta: { ...sinRecientes, recientes: { dias: 3, statsByRank: { [rango]: corta } } } });
  eq(con.meta.ventana.dias, 3, `la ventana corta coherente no entra: ${con.meta.ventana.motivo}`);
  ok(con.meta.ventana.usados > 100, `solo ${con.meta.ventana.usados} heroes con la ventana corta`);
  ok(Math.abs(con.meta.mediaDelRango - (sin.meta.mediaDelRango + 0.003)) < 1e-6,
    `la media no es la de la ventana usada: ${con.meta.mediaDelRango} frente a ${sin.meta.mediaDelRango} + 0.003`);
  // Cruces y parejas siguen siendo los de 7 dias: la ventana corta solo es de estadisticas.
  ok(con.meta.counters === con.meta.counters && Object.keys(con.meta.counters).length === Object.keys(sin.meta.counters).length, 'la matriz ha cambiado');

  // Con una ventana corta como la de 1 dia (0% y 100%): NO entra, y la media
  // vuelve a ser exactamente la de la ingesta.
  const basura = Object.fromEntries(Object.keys(base).map((k, i) => [k, { winRate: i % 2 }]));
  const mal = prepararDatos({ catalogo, meta: { ...sinRecientes, recientes: { dias: 1, statsByRank: { [rango]: basura } } } });
  eq(mal.meta.ventana.dias, 7, 'una ventana corta imposible ha entrado');
  eq(mal.meta.mediaDelRango, sin.meta.mediaDelRango, 'al descartar la corta la media no es la de la ingesta');
  eq(mal.meta.stats, mal.meta.statsSemana, 'al descartar la corta las estadisticas no son las de la semana');
});

await terminar('motor/draft');
