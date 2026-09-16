/**
 * Pruebas de src/motor/diagnostico/: el autodiagnóstico que corre en el
 * móvil y en el bot contra los mismos datos. Que vea datos imposibles (la
 * ingesta conserva lo anterior cuando un endpoint falla, así que una API
 * rota se nota en los VALORES), caídas frente a su propio historial, el
 * porqué del nº1 y una medición pro que falta.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { catalogo, heroes, poolRoam, crearRnd } from '../fixtures/catalogo.mjs';
import { prepararDatos } from '../../src/motor/draft.js';
import { diagnosticar } from '../../src/motor/diagnostico/index.js';
import { ESCALA } from '../../src/motor/modelo.js';

test('el diagnostico detecta datos imposibles y caidas frente a su propio historial', () => {
  const entorno = { version: '1.0', buildTime: null, rango: 'glory', width: 412, height: 915, standalone: false, storage: true, sw: 'activo', sinDatosPersonales: true };
  const filaOK = (n) => Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`H${i}`, 0.5 + ((n + i) % 7 - 3) / 100]));
  const meta = {
    generatedAt: new Date().toISOString(), heroes: [{ name: 'A' }],
    stats: { A: { winRate: 0.52, pickRate: 0.5, banRate: 0.1 }, B: { winRate: 0.49, pickRate: 0.5, banRate: 0.2 } },
    counters: { A: filaOK(1), B: filaOK(2) }, synergies: {},
  };
  // Los datos como los monta la app (prepararDatos): el catálogo fundido con
  // ese meta y las matrices indexadas por clave.
  const datosDe = (m) => prepararDatos({ catalogo: { heroes: catalogo.heroes }, meta: m, rango: entorno.rango });
  const base = { linea: 'roam', maestria: {}, partidas: [], entorno };
  const informe = (m, extra = {}) => diagnosticar({ ...base, datos: datosDe(m), ...extra }).texto;
  const avisosDe = (m, hist) => informe(m, { historial: hist }).split('\n').filter((l) => /^\[AVISO\]/.test(l));

  // Una corrida que conservó lo anterior por API caída avisa; una con
  // estadísticas nuevas, no; y un fichero de antes de esa marca, tampoco.
  ok(avisosDe({ ...meta, rank: 'glory', diagnostics: { conservado: true, frescos: [] } }, null).some((l) => /NO descargó/.test(l)), 'no avisa de una corrida que conservó lo anterior');
  ok(!avisosDe({ ...meta, diagnostics: { conservado: false, frescos: ['glory'] } }, null).some((l) => /NO descargó/.test(l)), 'avisa con estadísticas nuevas');
  ok(!avisosDe({ ...meta, diagnostics: {} }, null).some((l) => /NO descargó/.test(l)), 'avisa con un fichero antiguo sin la marca');

  // Estadísticas de un rango y cruces de otro: se dice. Los cruces, las
  // parejas y las builds son siempre del rango de la ingesta.
  ok(informe({ ...meta, rank: 'glory' }, { entorno: { ...entorno, rango: 'epic' } }).includes('dos poblaciones'), 'no avisa de que las estadísticas y los cruces son de rangos distintos');
  ok(!informe({ ...meta, rank: 'glory' }, { entorno: { ...entorno, rango: 'glory' } }).includes('dos poblaciones'), 'avisa con el mismo rango');

  // Datos sanos: ninguno de los avisos nuevos.
  const limpio = avisosDe(meta, null);
  ok(!limpio.some((l) => /imposible|planas|suman/.test(l)), `avisa con datos sanos: ${limpio.join(' | ')}`);

  // Un winrate del 90%, una cuota que no suma, una fila plana: cada uno se ve.
  ok(avisosDe({ ...meta, stats: { ...meta.stats, A: { ...meta.stats.A, winRate: 0.9 } } }, null).some((l) => /imposibles/.test(l)), 'no ve un winrate del 90%');
  ok(avisosDe({ ...meta, stats: { A: { winRate: 0.5, pickRate: 3 }, B: { winRate: 0.5, pickRate: 3 } } }, null).some((l) => /suman/.test(l)), 'no ve cuotas de pick que no suman uno');
  const plana = Object.fromEntries(Array.from({ length: 30 }, (_, i) => [`H${i}`, 0.5]));
  ok(informe({ ...meta, counters: { A: plana, B: filaOK(2) } }).includes('planas'), 'no ve una fila de counters plana');

  // Historial: una caida del 30% en cruces frente a una serie estable, avisa;
  // el valor de siempre, no.
  const serie = Array.from({ length: 10 }, (_, i) => ({ fecha: `2026-08-${10 + i}T00:00`, fallos: 0, cruces: 60 + (i % 2), sinergias: 0, objetos: 0, builds: 0, heroes: 1, pools: { roam: poolRoam.length } }));
  ok(!avisosDe(meta, serie).some((l) => /cruces ha CAÍDO/.test(l)), 'avisa de caida con el valor de siempre');
  const menos = { ...meta, counters: { A: Object.fromEntries(Object.entries(filaOK(1)).slice(0, 12)), B: Object.fromEntries(Object.entries(filaOK(2)).slice(0, 12)) } };
  ok(avisosDe(menos, serie).some((l) => /cruces ha CAÍDO/.test(l)), 'no ve una caida del 60% de cruces frente a su historial');
  // Con menos de cuatro corridas no hay serie y no se inventa ninguna.
  ok(informe(meta, { historial: serie.slice(0, 2) }).includes('aún no hay serie'), 'con dos corridas se cree que tiene serie');

  // El draft: el diagnostico dice POR QUE gana el nº1 (el componente que mas
  // lo separa del nº2, con su signo) y si el pick aguanta lo que falta por
  // salir. Sin eso, una recomendacion solo se puede creer, no discutir.
  const ranking = [
    { heroe: { name: 'A' }, p: 0.60, puntos: { heroes: 2, cruces: 5, parejas: 1, tu: 0, porVer: 0 } },
    { heroe: { name: 'B' }, p: 0.52, puntos: { heroes: 3, cruces: 0, parejas: 1, tu: 0, porVer: 0 } },
  ];
  const robustez = { cuota: { A: 0.7, B: 0.3 }, lider: 'A', cuotaLider: 0.7, n: 10, lineasAbiertas: ['mid', 'gold'] };
  const conDraft = informe(meta, { draft: { aliados: [{ name: 'A' }], enemigos: [{ name: 'B' }], ranking, analisis: [], robustez } });
  ok(/Por qué A y no B: 8\.0 puntos de margen · lo decide cruces \(\+5\), luego heroes \(-1\)/.test(conDraft), `no explica por que gana el nº1: ${conDraft.split('\n').find((l) => l.startsWith('Por qué'))}`);
  ok(/Líneas enemigas abiertas: mid, gold · en 10 finales plausibles, nº1: A 70%/.test(conDraft), 'no dice si el pick aguanta lo que falta');
  ok(/A aguanta el 70%: pick seguro/.test(conDraft), 'no califica el pick por su cuota');

  // Partidas profesionales: pro.yml escribe pro.json sin medicion y la anade
  // con `medir-pro.mjs || true`. Si el script falla, el fichero se commitea
  // sin ella y nadie lo ve. Con partidas de sobra tiene que chillar; con
  // pocas (medir-pro no mide por debajo de 30) o con la medicion, no.
  const heroesPro = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`H${i}`, { picks: 3 }]));
  const proBase = { generatedAt: new Date().toISOString(), torneos: 3, sinMapear: {}, heroes: heroesPro };
  const fallosPro = (pro) => informe(meta, { pro }).split('\n').filter((l) => /^\[FALLO\].*medici/.test(l));
  ok(fallosPro({ ...proBase, partidas: 100 }).length === 1, 'no ve que pro.json viene sin la medicion del motor');
  ok(fallosPro({ ...proBase, partidas: 10 }).length === 0, 'exige medicion con diez partidas, que medir-pro no mide');
  const medicion = { usables: 100, desde: '2026-05-01', azul: 0.52, terminos: { modelo: { acierto: 0.57, auc: 0.6, pendiente: 0.7, errorPendiente: 0.2 }, heroes: {}, cruces: {}, parejas: {} } };
  ok(fallosPro({ ...proBase, partidas: 100, medicion }).length === 0, 'falla con la medicion presente');
  // La escala: con la medida hecha con ESTA escala, una pendiente lejos de 1
  // avisa; con una medida de otro modelo (sin `escala`, o distinta), no.
  const avisoEscala = (m) => informe(meta, { pro: { ...proBase, partidas: 400, medicion: m } }).split('\n').filter((l) => /^\[AVISO\].*escala ya no encaja/.test(l)).length;
  const lejos = { ...medicion, usables: 400, terminos: { ...medicion.terminos, modelo: { ...medicion.terminos.modelo, pendiente: 0.4, errorPendiente: 0.1 } } };
  eq(avisoEscala({ ...lejos, escala: ESCALA }), 1, 'no avisa de una pendiente lejos de 1 medida con esta escala');
  eq(avisoEscala(lejos), 0, 'avisa con una medida del modelo anterior (sin escala)');
  eq(avisoEscala({ ...lejos, escala: ESCALA + 1 }), 0, 'avisa con una medida hecha con otra escala');
  eq(avisoEscala({ ...lejos, escala: ESCALA, terminos: { ...lejos.terminos, modelo: { ...lejos.terminos.modelo, pendiente: 0.95 } } }), 0, 'avisa con la pendiente en 1');
  // Y una medición a medias (sin un término) no tumba el diagnóstico entero.
  ok(informe(meta, { pro: { ...proBase, partidas: 400, medicion: { ...lejos, escala: ESCALA, terminos: { modelo: lejos.terminos.modelo } } } }).includes('Estimación contra'), 'una medición sin todos los términos revienta el diagnóstico');
});

test('revision linea a linea del diagnostico: nombres de maestria que no casan y medicion pro a medias', () => {
  const entorno = { version: 'test', rango: 'mythic', width: 412, height: 915, storage: true };
  const statsT = Object.fromEntries(heroes.map((x) => [x.name, { winRate: 0.5, pickRate: 0.01 }]));
  const meta = { generatedAt: new Date().toISOString(), ranks: ['mythic'], days: 7, heroCount: 133, stats: statsT, statsByRank: { mythic: statsT }, diagnostics: {} };
  const datos = prepararDatos({ catalogo: { heroes: catalogo.heroes }, meta, rango: 'mythic' });
  const base = { datos, linea: 'roam', partidas: [], entorno };

  // 6. El diagnóstico dice QUÉ nombres de maestría no casan con el catálogo:
  //    antes solo miraba la primera clave y, si no casaba, callaba.
  const conZzzz = diagnosticar({ ...base, maestria: { Zzzz: { games: 500, winRate: 0.6 }, Khufra: { games: 10, winRate: 0.5 } } });
  ok(/no casan.*Zzzz/.test(conZzzz.texto), 'no dice que Zzzz no casa con el catálogo');

  // 7. Con ≥30 partidas pro pero <30 USABLES no es un fallo del bot:
  //    medir-pro escribe siempre el resumen, también con pocas usables.
  const heroesPro = Object.fromEntries(Array.from({ length: 60 }, (_, i) => [`H${i}`, { picks: 3 }]));
  const pocasUsables = diagnosticar({ ...base, maestria: {}, pro: { generatedAt: new Date().toISOString(), torneos: 3, sinMapear: {}, heroes: heroesPro, partidas: 40, medicion: { usables: 20, terminos: {} } } });
  ok(!/\[FALLO\].*medici/.test(pocasUsables.texto), 'FALLO falso con 20 usables de 40 partidas');
});

test('el autodiagnóstico detecta datos rotos y aprueba los buenos', () => {
  const rnd = crearRnd(99);
  const entorno = { version: 'test', rango: 'mythic', width: 412, height: 915, storage: true };
  const stats = Object.fromEntries(heroes.map((x) => [x.name, { winRate: 0.497 + (rnd() - 0.5) * 0.06, pickRate: 0.02 }]));
  const base = { linea: 'roam', maestria: {}, partidas: [], entorno };
  // Los datos como los monta la app: el mismo prepararDatos que la interfaz,
  // en vez de armar a mano el catálogo, el pool y el meta indexado.
  const datosDe = (meta) => prepararDatos({ catalogo: { heroes: catalogo.heroes }, meta, rango: 'mythic' });

  const bueno = diagnosticar({
    ...base,
    datos: datosDe({ generatedAt: new Date().toISOString(), ranks: ['mythic'], days: 7, heroCount: 133, stats, statsByRank: { mythic: stats }, patchAvgWinRate: 0.497, diagnostics: {} }),
  });
  // Sin counters siempre hay un fallo; lo que no puede haber son fallos de motor.
  ok(!bueno.texto.includes('[FALLO] Winrate NO influye'), 'marca el winrate como plano teniéndolo');
  ok(!bueno.texto.includes('[FALLO] Contra dashes'), 'falla la sensatez táctica con datos buenos');

  const roto = diagnosticar({
    ...base,
    datos: datosDe({ generatedAt: new Date(0).toISOString(), ranks: [], days: 7, heroCount: 0, stats: {}, statsByRank: {}, patchAvgWinRate: 0.5, diagnostics: {} }),
  });
  ok(roto.fallos > bueno.fallos, 'no distingue unos datos rotos de unos buenos');
  ok(roto.texto.includes('Winrate NO influye'), 'no detecta que los winrates no entran');
});

await terminar('motor/diagnostico');
