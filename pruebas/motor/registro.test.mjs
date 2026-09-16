/**
 * Pruebas de src/motor/registro.js: las partidas apuntadas (qué se guarda
 * con cada una) y la calibración de la probabilidad estimada, que compara
 * lo previsto con lo que pasó: Brier contra la moneda, y si con ≥50% se
 * ganó más que con <50%. Las partidas previas no entran aunque traigan
 * número.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { apuntar, calibracion, resumen, siguioConsejo, MINIMO_PARA_CALIBRAR, MINIMO_PARA_CONCLUIR } from '../../src/motor/registro.js';
import { maestriaDesdeRegistro } from '../../src/motor/maestria.js';
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

await terminar('motor/registro');
