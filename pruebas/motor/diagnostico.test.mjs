/**
 * Pruebas de src/motor/diagnostico/: el autodiagnóstico que corre en el
 * móvil y en el bot contra los mismos datos. Que vea datos imposibles (la
 * ingesta conserva lo anterior cuando un endpoint falla, así que una API
 * rota se nota en los VALORES), caídas frente a su propio historial, el
 * porqué del nº1 y una medición pro que falta.
 */
import { seccionPro } from '../../src/motor/diagnostico/seccion-pro.js';
import { test, ok, eq, terminar } from '../arnes.mjs';
import { catalogo, heroes, poolRoam, crearRnd, h } from '../fixtures/catalogo.mjs';
import { prepararDatos } from '../../src/motor/draft.js';
import { diagnosticar, titular } from '../../src/motor/diagnostico/index.js';
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
  // La sensatez táctica que el diagnóstico comprueba de verdad es que la
  // RECOMENDACIÓN cambie según el equipo enemigo (hasta 1.5.0 se exigía que
  // el nº1 «cortara dashes», y eso solo se cumplía porque mandaban las
  // reglas por tags). Antes aquí ponía `!texto.includes('[FALLO] Contra
  // dashes')`, que no podía fallar nunca: «Contra dashes:» se emite con
  // `inf.linea()` y nunca lleva prefijo de estado.
  const lineas = bueno.texto.split('\n');
  ok(lineas.some((l) => /^\[OK/.test(l) && /La recomendación cambia según el equipo enemigo/.test(l)),
    `la sensatez táctica no sale en verde con datos buenos: ${lineas.filter((l) => /recomendación/.test(l)).join(' | ')}`);
  ok(!lineas.some((l) => /^\[FALLO\]/.test(l) && /MISMA recomendación/.test(l)),
    'falla la sensatez táctica con datos buenos: misma recomendación ante equipos enemigos opuestos');

  const roto = diagnosticar({
    ...base,
    datos: datosDe({ generatedAt: new Date(0).toISOString(), ranks: [], days: 7, heroCount: 0, stats: {}, statsByRank: {}, patchAvgWinRate: 0.5, diagnostics: {} }),
  });
  ok(roto.fallos > bueno.fallos, 'no distingue unos datos rotos de unos buenos');
  ok(roto.texto.includes('Winrate NO influye'), 'no detecta que los winrates no entran');
});

test('el diagnostico lleva el draft con nombres, para poder reproducir una partida', () => {
  // Desde que los huecos ensenan la cara y no el nombre, una captura no dice
  // quien estaba enfrente: hubo que reconstruir a medias el draft de una
  // derrota. El diagnostico es lo que Javi pega, asi que tiene que llevarlo.
  const base = {
    datos: prepararDatos({ catalogo: { heroes: catalogo.heroes }, meta: { heroes: [] }, rango: 'glory' }),
    maestria: {}, partidas: [], linea: 'roam',
    entorno: { version: '1.0', buildTime: null, rango: 'glory', width: 400, height: 800, storage: true, sw: 'x', sinDatosPersonales: true },
  };
  const draft = {
    enemigos: [h('Kadita'), h('Ixia')], aliados: [h('Layla')], baneos: [],
    rival: { nombre: 'Kadita', marcado: false },
    ranking: [{ heroe: h('Atlas'), p: 0.79, motivos: [{ clave: 'regla.ganaMatchup', params: { e: 'Ixia' } }] }],
    analisis: [{ clave: 'analisis.cuidadoCon', params: { e: 'Ixia', pct: 48 } }],
  };
  const con = diagnosticar({ ...base, draft }).texto;
  for (const esperado of ['DRAFT ACTUAL', 'Kadita', 'Ixia', 'Layla', 'Atlas 79', 'ganaMatchup:Ixia', 'cuidadoCon', 'deducido']) {
    ok(con.includes(esperado), `el diagnostico no lleva "${esperado}"`);
  }
  // Marcado a mano se distingue de deducido: no es lo mismo que la app se
  // equivoque de rival a que lo hayas puesto tu.
  ok(diagnosticar({ ...base, draft: { ...draft, rival: { nombre: 'Kadita', marcado: true } } }).texto.includes('marcado a mano'),
    'no distingue el rival marcado a mano del deducido');

  // Sin draft, lo dice y no cuenta como aviso ni fallo.
  const sin = diagnosticar({ ...base, draft: null });
  ok(sin.texto.includes('sin draft'), 'sin draft no lo dice');
  eq(sin.fallos, diagnosticar({ ...base, draft }).fallos, 'el draft cambia el numero de fallos');
});

test('el titular del diagnostico no se contradice ni escribe mal el plural', () => {
  // Decia "Todo correcto (1 avisos)": afirma que esta todo bien Y que hay algo
  // que mirar, y encima en plural. Es la primera linea que se lee con prisa.
  ok(!/correcto/i.test(titular(0, 1)), `dice que todo esta correcto habiendo avisos: ${titular(0, 1)}`);
  ok(/1 aviso\b/.test(titular(0, 1)), `plural mal con un aviso: ${titular(0, 1)}`);
  ok(/3 avisos/.test(titular(0, 3)), `plural mal con tres avisos: ${titular(0, 3)}`);
  eq(titular(0, 0), 'Todo correcto', 'sin fallos ni avisos deberia decir que todo esta bien');
  ok(/1 FALLO\b/.test(titular(1, 0)), `plural mal con un fallo: ${titular(1, 0)}`);
  ok(/2 FALLOS/.test(titular(2, 0)), `plural mal con dos fallos: ${titular(2, 0)}`);
  // Con las dos cosas, las dos se dicen: un fallo no puede tapar los avisos.
  ok(/FALLO/.test(titular(1, 2)) && /aviso/.test(titular(1, 2)), `se pierde algo: ${titular(1, 2)}`);
});

test('el diagnostico avisa si el movil esta usando una version vieja', () => {
  // Paso de verdad: el service worker guarda la app entera, asi que Javi vio un
  // diagnostico con los DATOS de hoy y la APP de dos versiones antes, diciendo
  // "todo correcto". Desde el movil no habia forma de enterarse.
  const base = {
    datos: prepararDatos({ catalogo: { heroes: catalogo.heroes }, meta: { heroes: [] }, rango: 'glory' }),
    maestria: {}, partidas: [], linea: 'roam',
  };
  const entorno = (version, publicada) => ({
    version, versionPublicada: publicada, buildTime: null, rango: 'glory',
    width: 412, height: 915, standalone: false, storage: true, sw: 'activo',
    sinDatosPersonales: true,
  });

  // Se mira LA LINEA de la version, no el total de avisos: el fixture minimo ya
  // genera otros por su cuenta y contarlos todos mediria otra cosa.
  const avisoVersion = (r) => r.texto.split('\n').filter((l) => /^\[AVISO\].*versión|^\[AVISO\].*publicada/i.test(l));

  const vieja = diagnosticar({ ...base, entorno: entorno('1.11.0', '1.12.0') });
  ok(/1\.11\.0.*1\.12\.0/.test(vieja.texto), 'no dice que version tiene y cual hay publicada');
  eq(avisoVersion(vieja).length, 1, 'usar una version vieja no saca aviso');
  ok(vieja.avisos > diagnosticar({ ...base, entorno: entorno('1.12.0', '1.12.0') }).avisos,
    'la version vieja no suma un aviso respecto a estar al dia');

  const aldia = diagnosticar({ ...base, entorno: entorno('1.12.0', '1.12.0') });
  eq(avisoVersion(aldia).length, 0, 'avisa aunque la version sea la ultima');
  ok(/última publicada/.test(aldia.texto), 'no confirma que esta al dia');

  // Sin red no se puede preguntar: eso NO es un aviso, es no saberlo. Un
  // diagnostico que chilla cuando no hay cobertura deja de leerse.
  const sinRed = diagnosticar({ ...base, entorno: entorno('1.12.0', null) });
  eq(avisoVersion(sinRed).length, 0, 'avisa cuando simplemente no ha podido preguntar');
  ok(!/publicada/.test(sinRed.texto), 'habla de la version publicada sin haberla podido leer');
  // (La mitad que comprobaba que vite.config.js emite version.json y que
  // App.jsx lo pide con `no-store` NO es del motor: queda para las pruebas
  // de la app y de la compilación.)
});

test('la línea de la corrida pro dice la edad de los datos y, si el lunes Liquipedia cortó, lo explica (sin «? peticiones»)', () => {
  const hace = (d) => new Date(Date.now() - d * 86400e3).toISOString();
  const lineas = (pro) => { const L = []; seccionPro({ seccion: () => {}, linea: (t) => L.push(t), check: (bien, a, b) => L.push(bien ? a : b) }, { partidas: 10, generatedAt: hace(11.4), ...pro }); return L; };
  const cortada = lineas({ errores: ['Liquipedia sigue limitando tras 3 esperas'] });
  ok(!cortada.some((l) => /\? peticiones/.test(l)), 'sigue saliendo «? peticiones», un campo que pro.json ya no lleva');
  ok(cortada.some((l) => /Datos de hace 11\.4 días · 1 error en la última corrida/.test(l)), `no dice la edad ni los errores: ${cortada.filter((l) => /hace/.test(l))}`);
  ok(cortada.some((l) => /no pudo leer Liquipedia/.test(l)), 'no explica que la corrida semanal se quedó sin partidas');
  ok(!lineas({ errores: [], generatedAt: hace(2) }).some((l) => /no pudo leer Liquipedia/.test(l)), 'lo dice sin errores');
});

await terminar('motor/diagnostico');
