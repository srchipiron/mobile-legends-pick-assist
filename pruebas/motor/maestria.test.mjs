/**
 * Pruebas de src/motor/maestria.js: tu maestría, escrita a mano o sacada de
 * las partidas apuntadas, leída por clave normalizada y comparada contra TU
 * nivel. La otra mitad de la prueba de perfiles (fundir y sanear) vive en
 * perfil.test.mjs.
 */
import { test, ok, eq, leerJson, terminar } from '../arnes.mjs';
import { catalogo, h } from '../fixtures/catalogo.mjs';
import { buscar, nombreClave } from '../../src/motor/nombres.js';
import { maestriaEfectiva, maestriaDesdeRegistro, notaDeMaestria, priorDeMaestria, tuNivel } from '../../src/motor/maestria.js';
import { generador } from '../../src/motor/robustez.js';
import { ordenarPicks } from '../../src/motor/ranking.js';
import { ESCALA } from '../../src/motor/modelo.js';
import { prepararDatos } from '../../src/motor/draft.js';

test('la maestria se lee por nombre normalizado y un winRate nulo no castiga', () => {
  // (Es la mitad «maestría» de la prueba original «perfiles y registro:
  //  fundir por instante, sanear lo que llega y maestria por nombre
  //  normalizado»; la mitad de fundir y sanear se quedó en perfil.test.mjs
  //  con aquel nombre. Las dos compartían nombre y una tapaba a la otra en
  //  el resumen.)
  // 3. La maestria escrita como "X.Borg" le sirve al heroe "X Borg", y el
  //    motor la lee: antes 400 partidas desaparecian por un punto.
  const ef = maestriaEfectiva({ 'X.Borg': { games: 400, winRate: 0.6 } }, [{ t: 3, pick: 'X Borg', gane: true }]);
  eq(Object.keys(ef).length, 1, `dos claves para el mismo heroe: ${Object.keys(ef)}`);
  eq(buscar(ef, 'X Borg')?.games, 400, 'buscar no encuentra la maestria por el nombre del catalogo');
  ok(notaDeMaestria({ name: 'X Borg' }, ef).valor > 0.5, 'el motor no lee la maestria escrita con otra grafia');
  // 4. winRate null importado: neutro, no 0%.
  eq(notaDeMaestria({ name: 'A' }, { A: { games: 50, winRate: null } }).valor, 0.5, 'winRate null castiga en vez de ser neutro');
});

test('pocas partidas apenas mueven la maestría', () => {
  const muchas = notaDeMaestria(h('Belerick'), { Belerick: { games: 80, winRate: 0.62 } }).valor;
  const pocas = notaDeMaestria(h('Belerick'), { Belerick: { games: 3, winRate: 1.0 } }).valor;
  ok(pocas < muchas, '3 partidas al 100% no pueden pesar tanto');
});

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

test('revision linea a linea del registro: priorDeMaestria recupera k = 0.25/sigma cuadrado', () => {
  // 8. En un encogimiento bayesiano el prior NO es libre: k = 0.25/σ², con σ
  //    la dispersión REAL del winrate entre tus héroes. Se simulan 12 héroes
  //    × 300 partidas con σ 0.04 (con corrección de Bessel) y tiene que salir
  //    k ≈ 156. El 20 de antes suponía ±11 puntos y cinco partidas al 90%
  //    puntuaban 0.87.
  const rnd = generador(99);
  const ks = [];
  for (let rep = 0; rep < 120; rep++) {
    const maestria = {};
    for (let i = 0; i < 12; i++) {
      const u1 = rnd() || 1e-9; const u2 = rnd();
      const wrReal = 0.5 + 0.04 * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
      let wins = 0; for (let g = 0; g < 300; g++) if (rnd() < wrReal) wins++;
      maestria[`H${i}`] = { games: 300, winRate: wins / 300 };
    }
    ks.push(priorDeMaestria(maestria));
  }
  ks.sort((a, b) => a - b);
  const medianaK = ks[Math.floor(ks.length / 2)];
  ok(Math.abs(medianaK - 156) / 156 <= 0.12, `k mediano ${medianaK.toFixed(0)}, esperado 156 ± 12%`);
});

test('la maestría pesa según la evidencia y no salta al apuntar una partida', () => {
  const meta = leerJson('public/data/roam-meta.json');
  if (!(meta.heroes ?? []).length || !meta.counters) return;
  // Los datos como los monta la app (prepararDatos); el ranking se llama a
  // pelo, sin líneas abiertas, para medir SOLO lo que mueve la maestría.
  const datos = prepararDatos({ catalogo, meta });
  const todos = datos.heroes;
  const pool = datos.poolsPorLinea.roam;
  if (pool.length < 10) return;
  // Min-max se comía el encogimiento: 5 partidas al 90% y 1.000 al 70% daban
  // la misma contribución (0.150, el peso entero) y apuntar UNA partida (de
  // la 9 a la 10) cambiaba el nº1 en el 44% de los drafts.
  const objetivo = pool[3];
  const fuera = todos.filter((x) => !pool.includes(x)).slice(0, 5);
  const fondo = Object.fromEntries(fuera.map((x) => [x.name, { games: 60, winRate: 0.52 }]));
  const rnd = generador(11);
  const drafts = [];
  for (let i = 0; i < 200; i++) { const e = []; while (e.length < 3) { const x = todos[Math.floor(rnd() * todos.length)]; if (!e.includes(x) && x !== objetivo) e.push(x); } drafts.push(e); }
  const con = (games, wr) => drafts.map((e) => ordenarPicks(pool, { enemigos: e, meta: datos.meta, maestria: { ...fondo, [objetivo.name]: { games, winRate: wr } }, candidatos: todos }));
  // En puntos de probabilidad (la escala del ranking): sin reescala, lo que
  // vale la maestría ES lo que mueve.
  const contrib = (r) => r.reduce((s, x) => s + ESCALA * x.find((y) => y.heroe.name === objetivo.name).terminos.tu * 25, 0) / r.length;
  const r5 = con(5, 0.9); const r12 = con(12, 0.6); const r300 = con(300, 0.65);
  // Con el prior medido (k≈70 con este perfil) cinco victorias de cinco
  // valen ~1,4 puntos; 300 partidas al 65%, ~4,7. Lo que se vigila es la
  // proporcion: la evidencia debil no puede acercarse a la fuerte.
  ok(contrib(r5) < 2 && contrib(r5) < contrib(r300) / 2, `5 partidas al 90% mueven ${contrib(r5).toFixed(2)} puntos (300 al 65%: ${contrib(r300).toFixed(2)})`);
  ok(contrib(r12) < contrib(r300), `12 partidas al 60% (${contrib(r12).toFixed(3)}) valen más que 300 al 65% (${contrib(r300).toFixed(3)})`);
  const r9 = con(9, 0.6); const r10 = con(10, 0.6);
  const salta = r9.filter((x, i) => x[0].heroe.name !== r10[i][0].heroe.name).length;
  ok(salta <= 10, `apuntar una partida (de la 9 a la 10) cambia el nº1 en ${salta} de 200 drafts`);
  // Y el prior de la maestría tampoco salta cuando el quinto héroe llega a 30 partidas.
  const base = { A: { games: 80, winRate: 0.55 }, B: { games: 60, winRate: 0.5 }, C: { games: 40, winRate: 0.48 }, D: { games: 35, winRate: 0.53 } };
  const k29 = priorDeMaestria({ ...base, E: { games: 29, winRate: 0.6 } }); const k30 = priorDeMaestria({ ...base, E: { games: 30, winRate: 0.6 } });
  ok(Math.abs(k30 - k29) / k29 < 0.05, `el prior salta de ${k29.toFixed(0)} a ${k30.toFixed(0)} con una partida`);
});

test('la maestria se mide contra TU nivel, no contra el 50%', () => {
  // Javi gana el 53.4% de sus partidas. Un heroe jugado a esa media exacta no
  // es mejor que uno que no ha tocado nunca: es EXACTAMENTE su nivel. Con la
  // escala centrada en 0.50 puntuaba 0.64 contra 0.50, o sea que la app
  // premiaba tener datos apuntados en vez de ser bueno con el heroe.
  const suya = { A: { games: 3821, winRate: 0.54 }, B: { games: 900, winRate: 0.51 } };
  const nivel = tuNivel(suya);
  ok(Math.abs(nivel - 0.534) < 0.002, `su nivel deberia rondar el 53.4%, sale ${nivel}`);

  const conNivel = (wr, games) => notaDeMaestria({ name: 'X' }, { ...suya, X: { games, winRate: wr } }).valor;
  const sinDatos = notaDeMaestria({ name: 'Z' }, suya).valor;
  eq(sinDatos, 0.5, 'un heroe sin datos tuyos deberia salir neutro');

  ok(Math.abs(conNivel(nivel, 500) - 0.5) < 0.02,
    `a tu media exacta deberia empatar con un heroe desconocido, sale ${conNivel(nivel, 500)}`);
  ok(conNivel(0.50, 500) < 0.45, 'un heroe al 50% deberia salir POR DEBAJO para un jugador del 53.4%');
  ok(conNivel(0.60, 500) > 0.7, 'un heroe muy por encima de tu nivel deberia destacar');

  // Y con pocas partidas se encoge hacia TU nivel, no hacia el 50%. Cuanto se
  // encoge NO es un numero suelto: el prior sale de 0.25/σ², con σ medida de la
  // dispersion real entre tus heroes. Con el valor viejo (20) cinco partidas al
  // 90% puntuaban 0.87, casi el tope.
  ok(conNivel(0.90, 2) < 0.58, `dos partidas ganadas no pueden disparar la nota: ${conNivel(0.90, 2)}`);
  ok(conNivel(0.90, 5) < 0.62, `cinco partidas al 90% no pueden disparar la nota: ${conNivel(0.90, 5)}`);
  ok(conNivel(0.90, 400) > 0.9, 'con muchisimas partidas al 90% la nota SI tiene que subir');

  // Con pocas partidas tu nivel se encoge hacia el 50%, y SIN acantilado. Antes
  // habia un corte en 100 partidas: por debajo, 0.50; por encima, tu winrate
  // entero. Medido, apuntar UNA partida mas (de 99 a 100) reordenaba el numero
  // 1 en 54 de 200 drafts. Un jugador no cambia de nivel entre la 99 y la 100.
  ok(Math.abs(tuNivel({ A: { games: 2, winRate: 1 } }) - 0.5) < 0.02,
    `se cree un nivel sacado de dos partidas: ${tuNivel({ A: { games: 2, winRate: 1 } })}`);
  eq(tuNivel({}), 0.5, 'se inventa un nivel sin datos');
  ok(tuNivel({ A: { games: 4000, winRate: 0.60 } }) > 0.58,
    'con miles de partidas deberia creerse tu nivel casi entero');

  // Y que crezca de forma continua: ningun par de valores consecutivos puede
  // dar un salto grande. Es lo que distingue un encogimiento de un corte.
  let anterior = tuNivel({ A: { games: 1, winRate: 0.60 } });
  let mayorSalto = 0;
  for (let n = 2; n <= 400; n++) {
    const ahora = tuNivel({ A: { games: n, winRate: 0.60 } });
    mayorSalto = Math.max(mayorSalto, Math.abs(ahora - anterior));
    anterior = ahora;
  }
  ok(mayorSalto < 0.002, `tu nivel da un salto de ${mayorSalto.toFixed(4)} entre dos partidas seguidas: sigue habiendo un corte`);
});

test('el encogimiento de la maestria sale de la dispersion medida', () => {
  // k = 0.25 / σ², con σ = lo que de verdad varia tu winrate entre heroes.
  // Un jugador MUY parejo (todos sus heroes casi igual) tiene que encogerse
  // mas; uno con heroes muy dispares, menos.
  const parejo = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [
    `H${i}`, { games: 800, winRate: 0.53 + (i % 2 ? 0.005 : -0.005) }]));
  const dispar = Object.fromEntries(Array.from({ length: 8 }, (_, i) => [
    `H${i}`, { games: 800, winRate: 0.53 + (i % 2 ? 0.07 : -0.07) }]));
  ok(priorDeMaestria(parejo) > priorDeMaestria(dispar),
    'un jugador parejo deberia encogerse MAS que uno con heroes muy dispares');

  // Y con topes: sin datos suficientes no se puede medir nada, y un caso
  // extremo no puede dar un prior absurdo.
  const k = priorDeMaestria({ A: { games: 500, winRate: 0.9 } });
  ok(k >= 0.25 / 0.08 ** 2 && k <= 0.25 / 0.02 ** 2, `prior fuera de los topes: ${k}`);
  ok(Number.isFinite(priorDeMaestria({})), 'sin datos deberia dar un prior por defecto');
});

test('el motivo de maestria se mide contra TU nivel, no contra un 55% fijo', () => {
  // Es el mismo fallo que ya se arreglo en la NOTA de maestria y que se habia
  // quedado vivo en el MOTIVO: un umbral absoluto (>=0.55) no significa lo
  // mismo para un jugador del 53% que para uno del 45%.
  const motivos = (mast, heroe) => {
    const nivel = tuNivel(mast);
    return notaDeMaestria({ name: heroe }, mast, nivel, priorDeMaestria(mast, nivel))
      .motivos.map((r) => r.clave);
  };
  const g = 300;

  // Jugador del 53%: seis heroes repartidos alrededor de lo suyo.
  const bueno = {
    flojo: { games: g, winRate: 0.46 }, medio: { games: g, winRate: 0.53 },
    justo: { games: g, winRate: 0.55 }, crack: { games: g, winRate: 0.62 },
    x: { games: g, winRate: 0.50 }, y: { games: g, winRate: 0.57 },
  };
  // 55% es practicamente su media: antes salia "lo llevas al 55%" como si
  // destacara, y no destaca nada.
  ok(!motivos(bueno, 'justo').includes('regla.maestriaBuena'),
    'a un jugador del 53% le dice que lleva bien un heroe que esta en su media');
  ok(motivos(bueno, 'crack').includes('regla.maestriaBuena'), 'no le reconoce su mejor heroe');
  ok(motivos(bueno, 'flojo').includes('regla.maestriaMala'), 'no le avisa de su peor heroe');

  // Jugador del 45%: su mejor heroe merece salir aunque no llegue al 55%.
  // Antes NUNCA se le reconocia ninguno.
  const flojo = {
    peor: { games: g, winRate: 0.38 }, medio: { games: g, winRate: 0.45 },
    bueno: { games: g, winRate: 0.53 }, x: { games: g, winRate: 0.42 },
    y: { games: g, winRate: 0.48 }, z: { games: g, winRate: 0.44 },
  };
  ok(motivos(flojo, 'bueno').includes('regla.maestriaBuena'),
    'a un jugador del 45% no le reconoce nunca su mejor heroe, porque no llega al 55%');
  ok(motivos(flojo, 'peor').includes('regla.maestriaMala'), 'no le avisa de su peor heroe');
  eq(motivos(flojo, 'medio').length, 0, 'saca motivo de un heroe que esta en su media');

  // Y se decide con el estimado ENCOGIDO: la evidencia debil no sale y la
  // fuerte si. Antes era al reves: 20 partidas al 60% sacaban motivo (12
  // victorias contra 10,6 esperadas: nada) y 300 al 57% no.
  const conNuevo = (n, wr) => ({ ...bueno, nuevo: { games: n, winRate: wr } });
  ok(!motivos(conNuevo(20, 0.60), 'nuevo').includes('regla.maestriaBuena'),
    '20 partidas al 60% no son evidencia de nada y saca motivo');
  // (62%, no 59%: con este perfil el nivel es 54,4% y σ 4,2 puntos, asi que
  // 59% encogido se queda a +3,1, por debajo de una desviacion. Primera version
  // de esta prueba pedia 59% y era la prueba la que estaba mal, no el motor.)
  ok(motivos(conNuevo(300, 0.62), 'nuevo').includes('regla.maestriaBuena'),
    '300 partidas al 62% son una senal real y no saca motivo');
  ok(!motivos(conNuevo(5, 1.0), 'nuevo').includes('regla.maestriaBuena'),
    'cinco partidas ganadas disparan el motivo');
});

test('maestría con fecha: las partidas apuntadas DESPUÉS se suman; las de antes, las previas y la maestría sin fecha, no', () => {
  const desde = 1_000_000;
  const p = (t, gane, extra = {}) => ({ t, pick: 'Rafaela', gane, recomendados: [], ...extra });
  const partidas = [p(desde - 5, true), p(desde + 1, true), p(desde + 2, true), p(desde + 3, false), p(desde + 4, true, { previa: true })];
  const conFecha = maestriaEfectiva({ Rafaela: { games: 100, winRate: 0.5, desde } }, partidas).rafaela;
  // 100 al 50% + 3 apuntadas después (2 ganadas); ni la de antes ni la previa.
  eq(conFecha.games, 103, `suma mal las partidas: ${JSON.stringify(conFecha)}`);
  ok(Math.abs(conFecha.winRate - (50 + 2) / 103) < 1e-12, `el winrate no es el ponderado: ${conFecha.winRate}`);
  eq(conFecha.apuntadas, 3);
  // Sin fecha (guardada antes de 3.13.0): como siempre, gana la fuente con más partidas.
  eq(maestriaEfectiva({ Rafaela: { games: 100, winRate: 0.5 } }, partidas).rafaela.games, 100, 'sin fecha se suman partidas que la maestría quizá ya incluye');
  // Sin maestría a mano: el registro entero, previas incluidas (para eso se meten).
  eq(maestriaEfectiva({}, partidas).rafaela.games, 5);
  // Continuo: apuntar UNA partida más mueve el winrate un poco, sin saltos (la lección de tuNivel).
  const mas = maestriaEfectiva({ Rafaela: { games: 100, winRate: 0.5, desde } }, [...partidas, p(desde + 9, true)]).rafaela;
  ok(mas.games === 104 && Math.abs(mas.winRate - conFecha.winRate) < 0.01, `una partida más salta: ${conFecha.winRate} → ${mas.winRate}`);
  // Por clave normalizada, como todo: «X.Borg» a mano y «X Borg» apuntado.
  eq(maestriaEfectiva({ 'X.Borg': { games: 10, winRate: 0.5, desde } }, [{ t: desde + 1, pick: 'X Borg', gane: true, recomendados: [] }]).xborg.games, 11, 'no casa X.Borg con X Borg');
});

await terminar('motor/maestria');
