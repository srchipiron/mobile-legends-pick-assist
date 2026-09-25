/**
 * Pruebas de src/motor/ventana.js: qué ventana manda en la fuerza de un
 * héroe. Lo que se protege es la GUARDA: que la de 3 días entre cuando es
 * coherente con la de 7, y que no entre cuando viene como la de 1 día
 * (héroes al 0% y al 100%, r = 0,09), que es la forma real de fallar.
 */
import { test, ok, eq, casi, terminar } from '../arnes.mjs';
import { elegirVentana, mediaDeWinrate, COHERENCIA_MINIMA, WINRATE_POSIBLE } from '../../src/motor/ventana.js';

/** 40 héroes con winrates repartidos entre 0,44 y 0,56, como los de verdad. */
const semana = Object.fromEntries(Array.from({ length: 40 }, (_, i) => [`h${i}`, { winRate: 0.44 + (i % 13) / 100, pickRate: 0.01, banRate: 0.1, heroId: i }]));
const desplazada = (d, f = (i) => i) => Object.fromEntries(Object.entries(semana).map(([k, s], i) => [k, { winRate: s.winRate + d + f(i) * 0.001 }]));

test('sin ventana corta manda la de 7 dias, tal cual', () => {
  for (const rec of [null, undefined, {}]) {
    const { stats, ventana } = elegirVentana(semana, rec);
    ok(stats === semana, 'sin recientes debería devolver las mismas estadísticas, no una copia con otro winrate');
    eq(ventana.dias, 7);
    eq(ventana.usados, 0);
  }
});

test('una ventana corta coherente entra heroe a heroe y conserva lo demas del registro', () => {
  // Como la medida real: la corta va 0,3 pp por encima con ruido pequeño.
  const rec = desplazada(0.003, (i) => (i % 3) - 1);
  const { stats, ventana } = elegirVentana(semana, rec, 3);
  eq(ventana.dias, 3, `no ha entrado la ventana corta: ${ventana.motivo}`);
  eq(ventana.usados, 40);
  ok(ventana.coherencia > COHERENCIA_MINIMA, `coherencia ${ventana.coherencia}`);
  casi(stats.h5.winRate, rec.h5.winRate, 1e-12, 'el winrate no es el reciente');
  casi(stats.h5.winRateSemana, semana.h5.winRate, 1e-12, 'no guarda el de la semana para enseñar la deriva');
  eq(stats.h5.pickRate, 0.01, 'el pickrate de la semana se ha perdido');
  eq(stats.h5.heroId, 5, 'el id se ha perdido');
  ok(semana.h5.winRateSemana === undefined, 'ha modificado las estadísticas de la semana en vez de crear otras');
});

test('la ventana de 1 dia (heroes al 0% y al 100%) NO entra, y se dice por que', () => {
  // La forma real de fallar: r = 0,09 con la de 7. Con la mitad de los
  // héroes a 0 y la otra mitad a 1 todos caen fuera de lo posible; con
  // valores posibles pero descorrelacionados, la guarda de coherencia.
  const basura = Object.fromEntries(Object.keys(semana).map((k, i) => [k, { winRate: i % 2 }]));
  let r = elegirVentana(semana, basura, 1);
  eq(r.dias ?? r.ventana.dias, 7, 'ha entrado una ventana con héroes al 0% y al 100%');
  ok(/héroes con dato reciente/.test(r.ventana.motivo), `motivo: ${r.ventana.motivo}`);

  // Valores posibles pero sin relación con la semana (barajados).
  const valores = Object.values(semana).map((s) => s.winRate);
  const barajada = Object.fromEntries(Object.keys(semana).map((k, i) => [k, { winRate: valores[(i * 17) % valores.length] }]));
  r = elegirVentana(semana, barajada, 3);
  eq(r.ventana.dias, 7, 'ha entrado una ventana descorrelacionada con la de 7 días');
  ok(/no se parece/.test(r.ventana.motivo), `motivo: ${r.ventana.motivo}`);
  ok(r.stats === semana, 'al descartar la corta no devuelve las de la semana tal cual');
});

test('un solo heroe imposible cae a 7 dias sin tumbar la ventana entera', () => {
  const rec = desplazada(0.002);
  rec.h7 = { winRate: WINRATE_POSIBLE[1] + 0.2 }; // un 85%: veinte partidas de un héroe raro
  rec.h8 = { winRate: null };
  const { stats, ventana } = elegirVentana(semana, rec, 3);
  eq(ventana.dias, 3, `un solo héroe raro ha tirado la ventana: ${ventana.motivo}`);
  eq(ventana.usados, 38);
  eq(stats.h7.winRate, semana.h7.winRate, 'el héroe imposible no ha caído a 7 días');
  eq(stats.h8.winRate, semana.h8.winRate, 'el héroe sin dato no ha caído a 7 días');
  casi(stats.h6.winRate, rec.h6.winRate, 1e-12, 'los demás no usan la ventana corta');
});

test('la media de la ventana es la misma cuenta que hace la ingesta', () => {
  // `avgOf` en la ingesta: media simple de los winrates que no son nulos.
  casi(mediaDeWinrate({ a: { winRate: 0.4 }, b: { winRate: 0.6 }, c: { winRate: null }, d: {} }), 0.5, 1e-12);
  eq(mediaDeWinrate({}), 0.5);
  // PONDERADA por cuota de pick: el centro es lo que cabe esperar del héroe
  // que sale en un draft. Con la media simple (0,482 frente a 0,502 el 24
  // de septiembre de 2026) cada héroe visto sumaba +0,09 de logit y 1
  // contra 5 daba el 45% (incidencia #9).
  casi(mediaDeWinrate({ a: { winRate: 0.4, pickRate: 0.01 }, b: { winRate: 0.6, pickRate: 0.03 } }), 0.55, 1e-12, 'no pondera por cuota de pick');
  // Un héroe sin cuota pesa 0, no 1: entre cuotas que suman 1, «no sé» es 0.
  casi(mediaDeWinrate({ a: { winRate: 0.4, pickRate: 0.01 }, b: { winRate: 0.6, pickRate: 0.03 }, c: { winRate: 0.9 } }), 0.55, 1e-12, 'un héroe sin cuota mueve el centro');
  casi(mediaDeWinrate({ a: { winRate: 0.4, pickRate: 0 }, b: { winRate: 0.6, pickRate: 0 } }), 0.5, 1e-12, 'sin ninguna cuota no cae a la media simple');
});

await terminar('motor/ventana');
