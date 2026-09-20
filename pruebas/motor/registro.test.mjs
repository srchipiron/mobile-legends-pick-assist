/**
 * Pruebas de src/motor/registro.js: las partidas apuntadas (qué se guarda
 * con cada una) y la calibración de la probabilidad estimada, que compara
 * lo previsto con lo que pasó: Brier contra la moneda, y si con ≥50% se
 * ganó más que con <50%. Las partidas previas no entran aunque traigan
 * número.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { sanear } from '../../src/motor/perfil.js';
import { sanearDraft, apuntar, olvidar, corregir, calibracion, esPrevia, resumen, siguioConsejo, MINIMO_PARA_CALIBRAR, MINIMO_PARA_CONCLUIR } from '../../src/motor/registro.js';
import { maestriaDesdeRegistro, maestriaEfectiva, winrateDeReferencia } from '../../src/motor/maestria.js';
import { nombreClave } from '../../src/motor/nombres.js';
import { generador } from '../../src/motor/robustez.js';

test('la calibracion compara lo previsto con lo que paso, y se guarda al apuntar', () => {
  // Al apuntar se guarda la estimacion redondeada; una invalida no se guarda.
  let ps = apuntar([], { pick: 'Khufra', gane: true, estimacion: 0.61234 });
  eq(ps[0].estimacion, 0.612, 'no guarda la estimacion al apuntar');
  ps = apuntar(ps, { pick: 'Khufra', gane: false, estimacion: 1.5 });
  eq(ps[0].estimacion, undefined, 'guarda una estimacion imposible');
  ps = apuntar(ps, { pick: 'Khufra', gane: true, previa: true, estimacion: 0.9 });
  // Las previas no entran en la calibracion aunque traigan numero.
  const c0 = calibracion(ps);
  eq(c0.n, 1, `solo una partida tiene estimacion valida y no es previa: ${c0.n}`);
  // Un modelo que acierta: Brier por debajo de la moneda y las altas ganan mas.
  const buenas = []; const malas = [];
  for (let i = 0; i < 40; i++) {
    const gane = i % 3 !== 0; // 26 de 40
    buenas.push({ t: i, pick: 'X', gane, estimacion: gane ? 0.65 : 0.4 });
    malas.push({ t: i, pick: 'X', gane, estimacion: gane ? 0.4 : 0.65 });
  }
  const cb = calibracion(buenas); const cm = calibracion(malas);
  ok(cb.concluyente && cb.n === 40 && cb.faltan === 0, 'con 40 partidas deberia ser concluyente');
  ok(cb.brier < cb.brierMoneda && cm.brier > cm.brierMoneda, `Brier: bueno ${cb.brier}, malo ${cm.brier}, moneda 0.25`);
  ok(cb.altas.real > cb.bajas.real, 'con un modelo que acierta, las altas deberian ganar mas');
  ok(Math.abs(cb.real - 26 / 40) < 1e-9, `winrate real ${cb.real}`);
  ok(calibracion(buenas.slice(0, 5)).faltan === MINIMO_PARA_CALIBRAR - 5, 'no dice cuantas faltan');
});

test('el registro de partidas cuenta lo que hace falta para decidir', () => {
  // Una partida sin héroe no se guarda: seria una fila inutil para siempre.
  ok(apuntar([], { gane: true }).length === 0, 'guarda una partida sin pick');

  const p = apuntar([], { pick: 'Khufra', recomendados: ['Khufra', 'Atlas', 'Franco'], gane: true });
  ok(p.length === 1 && siguioConsejo(p[0]), 'no detecta que seguiste la recomendación');
  ok(!siguioConsejo({ pick: 'Estes', recomendados: ['Khufra'] }), 'dice que seguiste el consejo y no fue así');

  // La mas reciente va primero.
  const dos = apuntar(p, { pick: 'Atlas', recomendados: [], gane: false });
  ok(dos[0].pick === 'Atlas', 'la última partida debería ir la primera');

  // No crece sin limite.
  let muchas = [];
  for (let i = 0; i < 20; i++) muchas = apuntar(muchas, { pick: 'Khufra', gane: true }, 10);
  ok(muchas.length === 10, `el registro debería recortarse: ${muchas.length}`);

  // No concluye con muestra escasa, ni aunque una rama vaya sobrada: comparar
  // 40 partidas contra 3 es justo lo que invita a tocar los pesos de mas.
  const sesgado = [];
  for (let i = 0; i < 40; i++) sesgado.push({ pick: 'Khufra', recomendados: ['Khufra'], gane: i % 2 === 0 });
  for (let i = 0; i < 3; i++) sesgado.push({ pick: 'Estes', recomendados: ['Khufra'], gane: true });
  const r = resumen(sesgado);
  ok(!r.concluyente, 'concluye con 3 partidas por libre');
  ok(r.faltan === MINIMO_PARA_CONCLUIR - 3, `mal el conteo de las que faltan: ${r.faltan}`);
  ok(Math.abs(r.wrSiguiendo - 0.5) < 0.01, `winrate siguiendo mal: ${r.wrSiguiendo}`);

  // Con muestra en las dos ramas si concluye.
  const equilibrado = [];
  for (let i = 0; i < 30; i++) equilibrado.push({ pick: 'Khufra', recomendados: ['Khufra'], gane: true });
  for (let i = 0; i < 30; i++) equilibrado.push({ pick: 'Estes', recomendados: ['Khufra'], gane: false });
  ok(resumen(equilibrado).concluyente, 'con 30 y 30 debería concluir');

  // Sin partidas no se inventa un winrate.
  ok(resumen([]).wrSiguiendo === null, 'se inventa un winrate sin partidas');

  // Y de aqui sale maestria real, no tecleada.
  const m = maestriaDesdeRegistro([
    { pick: 'Khufra', gane: true }, { pick: 'Khufra', gane: false }, { pick: 'Atlas', gane: true },
  ]);
  ok(m.Khufra.games === 2 && Math.abs(m.Khufra.winRate - 0.5) < 0.01, `maestría mal: ${JSON.stringify(m)}`);
});

test('revision linea a linea del registro: la referencia del Veredicto no lleva dentro las partidas comparadas', () => {
  // 1. Sin maestría a mano, 40 partidas con la app daban dif 0,000 y «faltan
  //    Infinity»: la base era esas mismas 40 partidas.
  let conApp = [];
  for (let i = 0; i < 40; i++) conApp = apuntar(conApp, { pick: 'B', gane: i % 4 !== 0, recomendados: ['B'], t: 1000 + i });
  ok(resumen(conApp, {}).contraReferencia == null, 'sin maestría a mano se inventa una referencia con las partidas comparadas');
  const conManual = resumen(conApp, { A: { games: 500, winRate: 0.6 } });
  eq(conManual.contraReferencia?.partidasBase, 500, `la referencia lleva dentro las partidas comparadas: ${JSON.stringify(conManual.contraReferencia)}`);
  ok(Math.abs(conManual.contraReferencia.dif - 0.15) < 1e-9, `dif ${conManual.contraReferencia.dif} (esperado 0.15)`);
  // Las previas SÍ entran en la referencia.
  const conPrevias = resumen([...conApp, ...Array.from({ length: 100 }, (_, i) => ({ t: 5000 + i, pick: 'C', gane: i % 2 === 0, previa: true, recomendados: [] }))], {});
  eq(conPrevias.contraReferencia?.partidasBase, 100, 'las partidas previas no hacen de referencia');

  // 2. Diferencia exactamente nula: faltan null, nunca Infinity.
  let empate = [];
  for (let i = 0; i < 20; i++) empate = apuntar(empate, { pick: 'B', gane: i % 2 === 0, recomendados: ['B'], t: 2000 + i });
  const r0 = resumen(empate, { A: { games: 500, winRate: 0.5 } }).contraReferencia;
  ok(r0 && r0.faltan === null, `con diferencia nula faltan debería ser null: ${r0?.faltan}`);
});

test('revision linea a linea del registro: el aviso «peor que una moneda» lleva margen', () => {
  // 5. Con un modelo calibrado (p uniforme en 35-65%, resultado Bernoulli(p))
  //    y 20 partidas no puede saltar más del 10% de las veces; antes, sin
  //    margen, saltaba en un tercio.
  const rnd = generador(99);
  let avisos = 0; const REPS = 1500;
  for (let k = 0; k < REPS; k++) {
    const ps = Array.from({ length: 20 }, (_, i) => { const p = 0.35 + rnd() * 0.30; return { t: i, pick: 'A', gane: rnd() < p, estimacion: p }; });
    if (calibracion(ps).peorQueMoneda) avisos++;
  }
  ok(avisos / REPS <= 0.10, `el aviso de Brier salta con el modelo perfecto el ${(avisos / REPS * 100).toFixed(1)}% de las veces`);
  const basura = Array.from({ length: 20 }, (_, i) => ({ t: i, pick: 'A', gane: i % 2 === 0, estimacion: i % 2 === 0 ? 0.1 : 0.9 }));
  ok(calibracion(basura).peorQueMoneda === true, 'un modelo al revés no dispara el aviso');
});

test('el registro sigue contando bien si la API cambia la grafia de un heroe', () => {
  // Las partidas viven meses en el movil. Si la API pasa de "X.Borg" a
  // "X Borg", una partida vieja no puede cambiar de bando: es el unico dato
  // con el que se puede comprobar si la app acierta.
  ok(siguioConsejo({ pick: 'X.Borg', recomendados: ['X Borg', 'Chou'] }),
    'una grafia distinta convierte un acierto en "por libre"');
  ok(siguioConsejo({ pick: 'Yi Sun-shin', recomendados: ['Yi Sun Shin'] }),
    'no reconoce el mismo heroe escrito con espacios');
  ok(!siguioConsejo({ pick: 'Chou', recomendados: ['Franco'] }), 'da por seguido un consejo que no se siguio');
  ok(!siguioConsejo({ pick: '', recomendados: [''] }), 'cuenta una partida sin pick');

  // Y que el resumen no concluya nada sin muestra en LAS DOS ramas.
  const con = Array.from({ length: 40 }, () => ({ pick: 'A', recomendados: ['A'], gane: true }));
  const sin = Array.from({ length: 3 }, () => ({ pick: 'B', recomendados: ['A'], gane: false }));
  ok(!resumen([...con, ...sin]).concluyente, 'concluye con 40 partidas contra 3');
});

test('el registro compara contra tu winrate de siempre, no solo contra la otra rama', () => {
  // La rama "por libre" no se llena jugando: para juntar 30 hay que ignorar la
  // app 30 veces a proposito. La maestria son miles de partidas que ya existen.
  const maestria = { Diggie: { games: 3821, winRate: 0.54 }, Franco: { games: 900, winRate: 0.51 } };
  const ref = winrateDeReferencia(maestria);
  eq(ref.partidas, 4721, 'no suma bien las partidas de la maestria');
  ok(ref.winRate > 0.53 && ref.winRate < 0.54, `pondera mal por partidas: ${ref.winRate}`);
  // Ponderado: el heroe de 3821 partidas manda sobre el de 900, no cuentan igual.
  ok(Math.abs(ref.winRate - 0.54) < Math.abs(ref.winRate - 0.51), 'no pondera por partidas');

  const jugadas = (n, ganadas) => Array.from({ length: n }, (_, i) => ({
    pick: 'Diggie', recomendados: ['Diggie'], gane: i < ganadas,
  }));

  // Con poca muestra tiene que decir que NO se ve, por muy grande que parezca.
  const poco = resumen(jugadas(11, 8), maestria);
  ok(poco.contraReferencia, 'no compara contra la referencia teniendo maestria');
  ok(!poco.contraReferencia.seVe, 'da por buena una diferencia de 11 partidas');
  ok(poco.contraReferencia.faltan > 20, 'se cree que con cuatro partidas mas basta');

  // Y con 11 partidas GANADAS TODAS, el error no puede salir cero. Con la
  // formula de Wald -que usa lo observado- p(1-p) seria 0 y diria que se ve
  // clarisimo con once partidas. Se usa la referencia, no lo observado.
  const todasGanadas = resumen(jugadas(11, 11), maestria);
  ok(todasGanadas.contraReferencia.margen > 0.15,
    `con 11 partidas el margen no puede ser ${todasGanadas.contraReferencia.margen}`);

  // La cuenta de partidas que faltan es la de UNA muestra contra una
  // referencia conocida, no la de dos muestras: la referencia son miles de
  // partidas y su error propio es despreciable. Con la formula equivocada
  // pedia casi cuatro veces mas.
  const esperado = Math.ceil(
    ((1.96 * Math.sqrt(0.534 * 0.466) + 0.84 * Math.sqrt((8 / 11) * (3 / 11))) ** 2)
    / ((8 / 11 - ref.winRate) ** 2),
  ) - 11;
  ok(Math.abs(poco.contraReferencia.faltan - esperado) <= 2,
    `la cuenta de potencia no cuadra: dice ${poco.contraReferencia.faltan}, deberia rondar ${esperado}`);

  // Con mucha muestra y una diferencia grande, tiene que verse.
  const mucho = resumen(jugadas(400, 300), maestria);
  ok(mucho.contraReferencia.seVe, 'no reconoce una diferencia clara con 400 partidas');
  eq(mucho.contraReferencia.faltan, 0, 'sigue pidiendo partidas cuando ya se ve');

  // Y si el winrate coincide con el de siempre, tampoco puede "verse" nada.
  const igual = resumen(jugadas(200, 107), maestria);
  ok(!igual.contraReferencia.seVe, 've una diferencia donde no la hay');

  // Sin maestria no hay contra que comparar: mejor callarse que inventar base.
  eq(resumen(jugadas(20, 15), {}).contraReferencia, null, 'se inventa una referencia sin maestria');
  eq(winrateDeReferencia({}), null, 'devuelve una referencia de la nada');
});

test('las partidas viejas personalizan pero NO ensucian la comparacion', () => {
  let ps = [];
  for (let i = 0; i < 11; i++) ps = apuntar(ps, { pick: 'Diggie', recomendados: ['Diggie'], gane: i < 8 });
  ps = apuntar(ps, { pick: 'Franco', recomendados: ['Diggie'], gane: true });
  ps = apuntar(ps, { pick: 'Franco', recomendados: ['Diggie'], gane: false });

  const antes = resumen(ps);
  eq(antes.siguiendo, 11, 'no cuenta bien las seguidas');
  eq(antes.porLibre, 2, 'no cuenta bien las de por libre');

  // Cuarenta partidas del historial del juego. La trampa: no llevan
  // `recomendados`, asi que sin marcarlas irian todas a "por libre" y la
  // comparacion pasaria a medir el winrate de siempre en vez de la app.
  for (let i = 0; i < 40; i++) {
    ps = apuntar(ps, { pick: 'Atlas', gane: i < 21, previa: true, t: 1600000000000 + i });
  }
  const despues = resumen(ps);
  eq(despues.total, 53, 'pierde partidas al meter las viejas');
  eq(despues.previas, 40, 'no distingue las viejas');
  eq(despues.siguiendo, antes.siguiendo, 'las viejas se han colado en las seguidas');
  eq(despues.porLibre, antes.porLibre, 'las viejas se han colado en "por libre"');
  ok(ps.filter(esPrevia).length === 40, 'no marca las viejas como previas');

  // Y SI tienen que personalizar: para eso se meten.
  // Las claves van normalizadas (ver maestriaEfectiva): se leen con nombreClave.
  const mE = maestriaEfectiva({ Diggie: { games: 3821, winRate: 0.54 } }, ps);
  const m = new Proxy(mE, { get: (o, k) => o[typeof k === 'string' ? nombreClave(k) : k] });
  eq(m.Atlas.games, 40, 'las partidas viejas no llegan a la maestria');
  ok(Math.abs(m.Atlas.winRate - 21 / 40) < 1e-9, 'calcula mal el winrate de las viejas');
  // La escrita a mano gana si tiene mas partidas: no se suman, se elige.
  eq(m.Diggie.games, 3821, 'el registro pisa la maestria escrita a mano, que tiene mucho mas');
  eq(m.Franco.games, 2, 'un heroe que solo esta en el registro no llega a la maestria');

  // Corregir y quitar, que es para lo que existe la pantalla.
  const unaSeguida = ps.find((p) => !esPrevia(p) && p.pick === 'Diggie');
  const corregidas = corregir(ps, unaSeguida.t, !unaSeguida.gane);
  eq(corregidas.length, ps.length, 'corregir cambia el numero de partidas');
  eq(corregidas.find((p) => p.t === unaSeguida.t).gane, !unaSeguida.gane, 'no cambia el resultado');
  eq(resumen(corregidas).siguiendo, 11, 'corregir mueve una partida de rama');

  const quitadas = olvidar(ps, unaSeguida.t);
  eq(quitadas.length, ps.length - 1, 'no quita la partida');
  ok(!quitadas.some((p) => p.t === unaSeguida.t), 'la partida quitada sigue ahi');
  eq(olvidar(ps, 'no-existe').length, ps.length, 'quita algo cuando no deberia');
});

test('el veredicto no canta victoria antes de tiempo', () => {
  // El caso real de Javi: 11 partidas siguiendo la app al 73% contra un 51,3%
  // histórico. Son +21 puntos, que suena a demostracion y NO lo es: el margen
  // es de ±29. Si esto se ensena como "la app te sube 21 puntos", la siguiente
  // racha lo desmiente y con razon.
  const maestria = { A: { games: 10535, winRate: 0.513 } };
  const partidas = [
    ...Array.from({ length: 8 }, (_, i) => ({ t: i, pick: 'A', recomendados: ['A'], gane: true })),
    ...Array.from({ length: 3 }, (_, i) => ({ t: 100 + i, pick: 'A', recomendados: ['A'], gane: false })),
  ];
  const r = resumen(partidas, maestria);
  ok(r.contraReferencia, 'no calcula la comparacion con 11 partidas');
  ok(r.contraReferencia.dif > 0.15, 'la prueba no esta midiendo el caso que cree');
  ok(!r.contraReferencia.seVe,
    `da por buena una diferencia de ${(r.contraReferencia.dif * 100).toFixed(1)} puntos con margen de ${(r.contraReferencia.margen * 100).toFixed(1)}`);
  ok(r.contraReferencia.faltan > 0, 'no dice cuantas partidas faltan');

  // Y al reves: con muestra de sobra y una diferencia grande, SI se afirma.
  // Si no, el veredicto seria un "no se sabe" perpetuo, que tampoco sirve.
  const muchas = Array.from({ length: 400 }, (_, i) => ({
    t: i, pick: 'A', recomendados: ['A'], gane: i % 100 < 70,
  }));
  const claro = resumen(muchas, maestria);
  ok(claro.contraReferencia.seVe,
    'con 400 partidas al 70% contra un 51% sigue diciendo que no se sabe');

  // Una diferencia pequena con muestra grande tampoco se canta.
  const rozando = Array.from({ length: 400 }, (_, i) => ({
    t: i, pick: 'A', recomendados: ['A'], gane: i % 100 < 53,
  }));
  ok(!resumen(rozando, maestria).contraReferencia.seVe,
    'canta victoria por dos puntos de diferencia');

  // El margen SIEMPRE viaja con la diferencia: quien pinte esto no puede
  // ensenar una sin la otra por descuido.
  ok(Number.isFinite(r.contraReferencia.margen) && r.contraReferencia.margen > 0,
    'la diferencia viene sin margen: el numero solo es publicidad');
});

test('cada partida apuntada guarda el draft que tenias delante, saneado', () => {
  // Sin el draft, una partida apuntada es irrecuperable para medir el modelo
  // en TU cola. Se guarda con nombres, como el draft, y saneado.
  const draft = { linea: 'roam', enemigos: ['Fanny', 'Layla', '', 7, 'Ling'], aliados: ['Chou'], rival: 'Fanny' };
  const [p] = apuntar([], { pick: 'Tigreal', gane: true, draft });
  eq(JSON.stringify(p.draft), JSON.stringify({ enemigos: ['Fanny', 'Layla', 'Ling'], aliados: ['Chou'], linea: 'roam', rival: 'Fanny' }));
  // Un rival que no está entre los enemigos no se guarda; sin nada, no hay campo.
  eq(apuntar([], { pick: 'Tigreal', draft: { enemigos: ['Layla'], rival: 'Fanny' } })[0].draft.rival, undefined);
  ok(!('draft' in apuntar([], { pick: 'Tigreal', draft: { enemigos: [], aliados: [] } })[0]), 'un draft vacío deja el campo');
  ok(!('draft' in apuntar([], { pick: 'Tigreal', draft: 'roam' })[0]), 'un draft con la forma rota deja el campo');
  eq(sanearDraft({ enemigos: ['A', 'B', 'C', 'D', 'E', 'F'] }).enemigos.length, 5, 'más de cinco enemigos');
  // Y sobrevive al saneado del perfil, que es por donde pasa lo guardado al cargar.
  const { partidas } = sanear({ partidas: [p, { ...p, t: p.t + 1, draft: { enemigos: 'no' } }] });
  eq(JSON.stringify(partidas[0].draft), JSON.stringify(p.draft), 'el saneado del perfil pierde el draft');
  ok(!('draft' in partidas[1]), 'el saneado del perfil deja un draft roto');
});

await terminar('motor/registro');
