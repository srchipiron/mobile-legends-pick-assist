/**
 * Pruebas de src/motor/modelo.js: los términos del modelo, uno a uno. Que el
 * término de héroe sea el winrate sin encoger (el dato no lo pide) y que el
 * cruce real mande sobre las reglas por etiqueta.
 */
import { test, ok, eq, leerJson, terminar } from '../arnes.mjs';
import { catalogo, h, crearRnd } from '../fixtures/catalogo.mjs';
import { indexarPorNombre } from '../../src/motor/nombres.js';
import { terminoHeroe, terminoCruce, evaluarDraft, logit, ESCALA } from '../../src/motor/modelo.js';
import { mediaDeSinergia } from '../../src/motor/matrices.js';
import { LINEAS } from '../../src/motor/catalogo.js';
import { prepararDatos, estimarCon, ordenar } from '../../src/motor/draft.js';

test('el winrate NO se encoge por una muestra inventada', () => {
  // Medido el ruido real entre 14 corridas consecutivas de la ingesta: la
  // desviación del winrate de un héroe entre corridas es 0,0002-0,0003 en
  // todos los cuartiles de pickrate, frente a 0,0316 entre héroes. El
  // encogimiento que había (prior 400 sobre pickRate × 40000) conservaba el
  // 18% del desvío de un héroe raro: Masha 57,7% se trataba como 50,5%.
  const T = (stat) => terminoHeroe({ name: 'X' }, indexarPorNombre({ X: stat }), 0.497).valor;
  const raro = T({ winRate: 0.577, pickRate: 0.0015 });
  ok(Math.abs(raro - (logit(0.577) - logit(0.497))) < 1e-9, `un héroe raro pierde su desvío: ${raro}`);
  ok(Math.abs(T({ winRate: 0.54, pickRate: 0.03 }) - T({ winRate: 0.54, pickRate: 0.002 })) < 1e-9, 'el mismo winrate vale distinto según el pickrate sin que el ruido lo justifique');
  ok(T({ winRate: 0.56, pickRate: 0.002 }) > T({ winRate: 0.54, pickRate: 0.03 }), 'un 56% raro no vale más que un 54% popular');
  // Sobre los datos reales: el orden del componente es el del winrate.
  const stats = Object.values(leerJson('public/data/roam-meta.json').stats ?? {});
  if (stats.length > 50) {
    const rango = (a) => { const idx = a.map((v, i) => [v, i]).sort((x, y) => x[0] - y[0]); const r = []; idx.forEach(([, i], k) => { r[i] = k; }); return r; };
    const rw = rango(stats.map((s) => s.winRate)); const rm = rango(stats.map((s) => terminoHeroe({ name: 'X' }, { x: s }, 0.5).valor));
    const n = rw.length; const d2 = rw.reduce((acc, v, i) => acc + (v - rm[i]) ** 2, 0);
    const spearman = 1 - 6 * d2 / (n * (n * n - 1));
    ok(spearman > 0.99, `el término de héroe no ordena como el winrate (Spearman ${spearman.toFixed(3)})`);
  }
});

test('el dato real de la API puede contradecir a las reglas por tags', () => {
  // Por tags, Belerick contraataca a Fanny (peel + anti_dive). Si las partidas
  // reales dicen que pierde el matchup, debe mandar el dato, no mi regla.
  const malo = terminoCruce(h('Belerick'), h('Fanny'), indexarPorNombre({ Belerick: { Fanny: 0.44 } }, 2)).valor;
  const porTags = terminoCruce(h('Belerick'), h('Fanny'), undefined).valor;
  const bueno = terminoCruce(h('Belerick'), h('Fanny'), indexarPorNombre({ Belerick: { Fanny: 0.58 } }, 2)).valor;
  ok(malo < porTags, 'un matchup perdido no baja la puntuación');
  ok(bueno > malo, 'el dato real no ordena los matchups');
});

test('la estimacion de victoria: neutra sin datos, simetrica, y cae donde se midio', () => {
  // (En 1.x/2.x era `estimarVictoria`, que desde 2.0 es EL MISMO `evaluarDraft`
  // con el que se ordenan los picks: la estimación que enseña la app es la del
  // nº1 y la que se guarda con cada partida apuntada es la del héroe cogido.)

  // 1. Sin nadie no hay nada que estimar; sin datos, todo el mundo al 50%.
  eq(evaluarDraft({}), null, 'estima sin nadie en el draft');
  const H = (name, extra = {}) => ({ name, role: 'tank', tags: [], ...extra });
  const sinDatos = evaluarDraft({ aliados: [H('A')], yo: H('Y'), enemigos: [H('E')], meta: {} });
  ok(Math.abs(sinDatos.p - 0.5) < 1e-9, `sin datos deberia dar 50%, da ${sinDatos.p}`);

  // 2. Cada termino va por su lado y con su signo. Fixture con un solo dato
  //    por termino: un heroe fuerte, un cruce ganado, una pareja buena.
  const stats = indexarPorNombre({ Y: { winRate: 0.55 }, A: { winRate: 0.5 }, E: { winRate: 0.5 } });
  const counters = indexarPorNombre({ Y: { E: 0.55 } }, 2);
  const synergies = indexarPorNombre({ Y: { A: 0.55 }, A: { Y: 0.55, E: 0.45 }, E: { A: 0.45 } }, 2);
  const meta = { stats, counters, synergies };
  const r = evaluarDraft({ aliados: [H('A')], yo: H('Y'), enemigos: [H('E')], meta });
  ok(Math.abs(r.terminos.heroes - logit(0.55)) < 1e-9, `termino de heroes ${r.terminos.heroes}`);
  ok(Math.abs(r.terminos.cruces - logit(0.55)) < 1e-9, `termino de cruces ${r.terminos.cruces}`);
  // El mismo centro que usa evaluarDraft: sin índice de líneas, ponderado por las stats.
  const centro = mediaDeSinergia(synergies, null, stats);
  ok(Math.abs(r.terminos.parejas - (logit(0.55) - logit(centro))) < 1e-9, `termino de parejas ${r.terminos.parejas}`);
  ok(r.p > 0.5 && r.p < 0.7, `con tres ventajas pequenas deberia ir por encima del 50%, no ${r.p}`);
  //    Un cruce PERDIDO resta: el 0.45 se lee desde el otro lado si hace falta.
  const perdido = evaluarDraft({ aliados: [], yo: H('E'), enemigos: [H('Y')], meta });
  ok(perdido.terminos.cruces < 0, 'un cruce perdido no resta');

  // 3. Tu maestria: con 100 partidas al 70% con tu heroe, sube; y el termino
  //    sustituye al del heroe, no se suma encima (nivel 0.5, k medido).
  const conMaestria = evaluarDraft({ aliados: [H('A')], yo: H('Y'), enemigos: [H('E')], meta, maestria: { Y: { games: 100, winRate: 0.7 } } });
  ok(conMaestria.p > r.p + 0.02, `100 partidas al 70% deberian subir la estimacion: ${r.p} -> ${conMaestria.p}`);
  ok(conMaestria.terminos.heroes === r.terminos.heroes, 'el termino de heroes cambia con la maestria: se cuenta dos veces');

  // 4. Sobre los datos reales: simetrica (p + p del otro lado = 1) y, en 200
  //    drafts completos al azar, centrada en el 50% y entre el 30% y el 70%
  //    (p05/p95 medidos: 30/70). Centrar los cruces en la media de la fila
  //    en vez de en 0.5 desplazaba la mediana al 64%; esto lo caza.
  //    Los datos como los monta la app (prepararDatos) y la estimación por
  //    la vía de la app (estimarCon: con el índice de líneas para centrar
  //    las parejas y la media del rango para los héroes).
  const real = leerJson('public/data/roam-meta.json');
  if (!(real.heroes ?? []).length || !real.counters) return;
  const datos = prepararDatos({ catalogo, meta: real });
  const pools = datos.poolsPorLinea;
  if (LINEAS.some((ln) => pools[ln].length < 10)) return;
  const rnd = crearRnd(3);
  const ps = [];
  for (let d = 0; d < 200; d++) {
    const u = new Set();
    const coge = (ln) => { const c = pools[ln].filter((h) => !u.has(h.name)); const h = c[Math.floor(rnd() * c.length)]; u.add(h.name); return h; };
    const A = LINEAS.map(coge); const E = LINEAS.map(coge);
    const ida = estimarCon(datos, { yo: A[0], aliados: A.slice(1), enemigos: E });
    const vuelta = estimarCon(datos, { yo: E[0], aliados: E.slice(1), enemigos: A });
    // Los dos sentidos de un cruce suman 1 a cuatro decimales, no a dieciseis.
    ok(Math.abs(ida.p + vuelta.p - 1) < 1e-3, `no es simetrica: ${ida.p} + ${vuelta.p}`);
    ps.push(ida.p);
  }
  ps.sort((a, b) => a - b);
  const q = (f) => ps[Math.floor(ps.length * f)];
  ok(Math.abs(q(0.5) - 0.5) < 0.06, `la mediana en drafts al azar deberia ser 50%, es ${q(0.5)}`);
  // Con la escala medida (0.44) la dispersion de drafts al azar es 40/60
  // (p05/p95), no 30/70: aquello era el modelo sin calibrar.
  ok(q(0.05) > 0.33 && q(0.05) < 0.47 && q(0.95) > 0.53 && q(0.95) < 0.67, `p05/p95 fuera de lo medido: ${q(0.05)} / ${q(0.95)}`);
});

test('el modelo: la nota es la probabilidad de ganar, sube con el cruce, y la escala es la medida en las partidas pro', () => {
  // 1. Ordenado por probabilidad, y la probabilidad es la del draft con el
  //    candidato dentro (el mismo numero que enseña la estimacion). Los datos
  //    y el ranking, por la vía de la app (prepararDatos + ordenar), y la
  //    estimación por la suya (estimarCon): tienen que ser el mismo número.
  const meta = leerJson('public/data/roam-meta.json');
  if (!(meta.heroes ?? []).length || !meta.counters) return;
  const datos = prepararDatos({ catalogo, meta });
  const pools = datos.poolsPorLinea;
  const enemigos = [pools.mid[0], pools.gold[1], pools.exp[2]]; const aliados = [pools.jungle[3]];
  const ranking = ordenar(datos, { linea: 'roam', enemigos, aliados });
  ok(ranking.every((r, i) => i === 0 || ranking[i - 1].p >= r.p), 'no esta ordenado por probabilidad');
  const directo = estimarCon(datos, { yo: ranking[0].heroe, aliados, enemigos });
  ok(Math.abs(directo.p - ranking[0].p) < 1e-12, 'la nota del ranking no es la estimacion del draft con el candidato');
  ok(ranking[0].p > 0.3 && ranking[0].p < 0.7, 'la probabilidad no esta donde toca');
  // 2. Monotona en el dato: subir un cruce del candidato sube su probabilidad
  //    exactamente en 0.44 veces la diferencia de logits.
  const yo = ranking[5].heroe; const e = enemigos[0];
  const conCruce = (v) => evaluarDraft({ yo, aliados, enemigos, meta: { ...datos.meta, counters: indexarPorNombre({ ...meta.counters, [yo.name]: { ...(meta.counters[yo.name] ?? {}), [e.name]: v } }, 2) }, lineas: datos.lineas }).logOdds;
  ok(Math.abs((conCruce(0.56) - conCruce(0.50)) - ESCALA * logit(0.56)) < 1e-9, 'la nota no sube con el cruce lo que dice la escala');
  // 3. Que la escala sea la medida en el corpus pro (regresión logística de
  //    «ganó» sobre H+C+S dentro de 2,5 errores típicos, y mejor fuera de
  //    muestra que el modelo de coeficientes 1) se comprueba con
  //    scripts/ajustar-modelo.mjs, que no es el motor: queda para la suite
  //    de scripts.
});

await terminar('motor/modelo');
