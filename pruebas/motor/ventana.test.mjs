/**
 * Pruebas de src/motor/ventana.js: qué ventana manda en la fuerza de un
 * héroe. Lo que se protege es la GUARDA: que la de 3 días entre cuando es
 * coherente con la de 7, y que no entre cuando viene como la de 1 día
 * (héroes al 0% y al 100%, r = 0,09), que es la forma real de fallar.
 */
import { test, ok, eq, casi, terminar } from '../arnes.mjs';
import { elegirVentana, elegirRango, elegirRangoDeRelaciones, mediaDeWinrate, COHERENCIA_MINIMA, COHERENCIA_DE_RANGO_MINIMA, CELDAS_PARA_COMPARAR, WINRATE_POSIBLE } from '../../src/motor/ventana.js';

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

test('rango: Gloria manda si se parece a Mítico; si no (reinicio de temporada), Mítico, y se dice por qué', () => {
  const mitico = semana;
  // Gloria llena: Mítico con ruido pequeño (r ≈ 0,9, como en un parche asentado).
  const llena = Object.fromEntries(Object.entries(mitico).map(([k, s], i) => [k, { ...s, winRate: s.winRate + ((i * 7) % 5 - 2) * 0.004 }]));
  const a = elegirRango({ glory: llena, mythic: mitico }, 'glory');
  eq(a.rango, 'glory'); eq(a.pedido, 'glory'); eq(a.motivo, null);
  ok(a.coherencia >= COHERENCIA_DE_RANGO_MINIMA, `Gloria llena sale incoherente: r=${a.coherencia}`);
  // Gloria vacía: el mismo rango de valores, barajado (r ≈ 0).
  const vacia = Object.fromEntries(Object.entries(mitico).map(([k, s], i) => [k, { ...s, winRate: 0.44 + ((i * 17) % 13) / 100 }]));
  const b = elegirRango({ glory: vacia, mythic: mitico }, 'glory');
  eq(b.rango, 'mythic', `Gloria revuelta sigue mandando (r=${b.coherencia})`); eq(b.pedido, 'glory');
  ok(b.coherencia < COHERENCIA_DE_RANGO_MINIMA && /glory/.test(b.motivo), `no dice por qué: ${b.motivo}`);
  // Sin datos de Gloria para comparar (menos de 20 héroes posibles): Mítico.
  const pocos = Object.fromEntries(Object.entries(vacia).slice(0, 10));
  eq(elegirRango({ glory: pocos, mythic: mitico }, 'glory').rango, 'mythic');
  // Y al revés: si el que falla es MÍTICO (vacío, sin winrates o a medias),
  // no se cae a él. Hasta 3.14.0 se caía y los 133 se quedaban sin fuerza.
  for (const [que, roto] of [['vacío', {}], ['sin winrates', Object.fromEntries(Object.keys(mitico).map((k) => [k, { ...mitico[k], winRate: null }]))], ['a medias', Object.fromEntries(Object.entries(mitico).slice(0, 15))]]) {
    const d = elegirRango({ glory: llena, mythic: roto }, 'glory');
    eq(d.rango, 'glory', `con Mítico ${que} manda Mítico`);
    ok(/mythic/.test(d.motivo ?? ''), `con Mítico ${que} no dice que no se puede comprobar: ${d.motivo}`);
  }
  // Otros rangos, o sin Mítico descargado: el pedido, sin tocar.
  eq(elegirRango({ glory: vacia, mythic: mitico, legend: vacia }, 'mythic').rango, 'mythic');
  eq(elegirRango({ glory: vacia }, 'glory').rango, 'glory');
  eq(elegirRango({}, 'glory').rango, 'glory');
  // El umbral está entre lo medido: 0,86–0,90 con Gloria llena, 0,63–0,67 vacía.
  ok(COHERENCIA_DE_RANGO_MINIMA > 0.67 && COHERENCIA_DE_RANGO_MINIMA < 0.86, `umbral fuera de lo medido: ${COHERENCIA_DE_RANGO_MINIMA}`);
});

/**
 * Una matriz de 30×30 (870 celdas) con valores repartidos alrededor de 0,5.
 * `ruido` añade, celda a celda, una parte que no tiene nada que ver con la
 * otra matriz: con 0 es la misma, con mucho es ruido de muestra.
 */
function matriz(semilla = 0, ruido = 0) {
  const m = {};
  for (let i = 0; i < 30; i += 1) {
    m[`h${i}`] = {};
    for (let j = 0; j < 30; j += 1) {
      if (i === j) continue;
      const base = ((i * 7 + j * 13) % 23 - 11) / 500;
      const otro = ruido * (((i * 31 + j * 17 + semilla * 5) % 29 - 14) / 500);
      m[`h${i}`][`h${j}`] = 0.5 + base + otro;
    }
  }
  return m;
}

test('cruces y parejas: Gloria manda si casa con Mítico; si no, salen de Mítico y se dice por qué', () => {
  const mitico = { counters: matriz(), synergies: matriz(1) };
  // Coherente (la misma estructura con un poco de ruido): Gloria.
  const buena = { counters: matriz(0, 0.3), synergies: matriz(1, 0.3) };
  const a = elegirRangoDeRelaciones({ pedidas: buena, respaldo: mitico, rango: 'glory' });
  eq(a.rango, 'glory');
  ok(a.coherencia.counters > 0.8 && a.coherencia.synergies > 0.8 && !a.motivo, JSON.stringify(a));
  // Ruido de muestra (como Gloria el 1-3 de octubre de 2026, r = 0,64/0,43): Mítico.
  const ruidosa = { counters: matriz(2, 3), synergies: matriz(3, 3) };
  const b = elegirRangoDeRelaciones({ pedidas: ruidosa, respaldo: mitico, rango: 'glory' });
  eq(b.rango, 'mythic');
  eq(b.pedido, 'glory');
  ok(/no se parecen/.test(b.motivo) && b.coherencia.counters < 0.8, JSON.stringify(b));
  // Decide la PEOR de las dos matrices: cruces buenos y parejas ruidosas
  // (las parejas tienen menos partidas y se degradan antes) también es Mítico.
  const mixta = { counters: matriz(0, 0.3), synergies: matriz(3, 3) };
  const c = elegirRangoDeRelaciones({ pedidas: mixta, respaldo: mitico, rango: 'glory' });
  eq(c.rango, 'mythic', `con las parejas ruidosas se queda Gloria: ${JSON.stringify(c)}`);
  const c2 = elegirRangoDeRelaciones({ pedidas: { counters: matriz(2, 3), synergies: matriz(1, 0.3) }, respaldo: mitico, rango: 'glory' });
  eq(c2.rango, 'mythic', `con los cruces ruidosos se queda Gloria: ${JSON.stringify(c2)}`);
});

test('cruces y parejas: sin respaldo, sin datos o con pocas celdas en común se queda lo pedido', () => {
  const mitico = { counters: matriz(), synergies: matriz(1) };
  const ruidosa = { counters: matriz(2, 3), synergies: matriz(3, 3) };
  // Mítico no tiene rango de respaldo: se queda Mítico aunque no case con nada.
  eq(elegirRangoDeRelaciones({ pedidas: ruidosa, respaldo: mitico, rango: 'mythic' }).rango, 'mythic');
  // La corrida de respaldo falló: lo pedido.
  eq(elegirRangoDeRelaciones({ pedidas: ruidosa, respaldo: null, rango: 'glory' }).rango, 'glory');
  // Pocas celdas en común: no se puede decidir, se queda lo pedido y se dice.
  const recorte = (m) => ({ h0: m.h0 });
  const d = elegirRangoDeRelaciones({ pedidas: { counters: recorte(ruidosa.counters), synergies: recorte(ruidosa.synergies) }, respaldo: mitico, rango: 'glory' });
  eq(d.rango, 'glory');
  ok(/pocos cruces/.test(d.motivo) && d.coherencia.counters === null, JSON.stringify(d));
  // El mínimo es una muestra de verdad, no un puñado (870 celdas aquí > 500;
  // la matriz real tiene 17.556).
  ok(CELDAS_PARA_COMPARAR >= 200 && CELDAS_PARA_COMPARAR <= 870, `mínimo de celdas raro: ${CELDAS_PARA_COMPARAR}`);
});

await terminar('motor/ventana');
