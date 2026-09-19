/**
 * Pruebas de src/motor/robustez.js: la simulación de lo que falta por
 * salir. Determinista, con cuotas que suman uno, sin baneados en ningún
 * final, cada final puntuado COMPLETO, y —lo que importa— que la cuota
 * prediga si el nº1 aguanta hasta el draft completo.
 */
import { test, ok, eq, leerJson, terminar } from '../arnes.mjs';
import { catalogo } from '../fixtures/catalogo.mjs';
import { LINEAS } from '../../src/motor/catalogo.js';
import { nombreClave, indexarPorNombre } from '../../src/motor/nombres.js';
import { ordenarPicks } from '../../src/motor/ranking.js';
import { simularFinales, CUOTA_ROBUSTA, generador } from '../../src/motor/robustez.js';
import { prepararDatos, lineasEnemigasAbiertas } from '../../src/motor/draft.js';

test('la robustez del pick: determinista, suma uno y predice si aguanta', () => {
  const meta = leerJson('public/data/roam-meta.json');
  // Sin datos no se simula nada, y eso es un FALLO, no un pase: con el
  // `return` de antes el fichero imprimía «1 de 1 correctas» sin haber
  // simulado un solo final.
  ok((meta.heroes ?? []).length >= 100 && meta.counters,
    `roam-meta.json trae ${(meta.heroes ?? []).length} heroes y ${meta.counters ? '' : 'NINGUNA '}matriz de cruces: la simulacion no se puede comprobar`);
  // Los datos como los monta la app: catálogo fundido con la API, matrices
  // indexadas por clave en los dos niveles y pools por línea.
  const datos = prepararDatos({ catalogo, meta });
  const M = datos.meta;
  const pools = datos.poolsPorLinea;
  ok(!LINEAS.some((l) => pools[l].length < 10),
    `alguna linea se queda sin pool: ${LINEAS.map((l) => `${l}:${pools[l].length}`).join(' ')}`);

  // 1. Con el mismo draft, la misma cuota: sin esto el numero bailaria entre
  //    dos aperturas del diagnostico y no se podria probar nada.
  const en = [pools.mid[0], pools.gold[1]];
  const abiertas = lineasEnemigasAbiertas(datos, en);
  const args = { pool: pools.roam, enemigos: en, lineasAbiertas: abiertas, poolsPorLinea: pools, ctx: { meta: M, maestria: {} } };
  const r1 = simularFinales(args);
  const r2 = simularFinales(args);
  ok(r1 && r2 && JSON.stringify(r1.cuota) === JSON.stringify(r2.cuota), 'la simulacion no es determinista');
  const suma = Object.values(r1.cuota).reduce((a, b) => a + b, 0);
  ok(Math.abs(suma - 1) < 1e-9, `las cuotas suman ${suma}, no 1`);
  ok(abiertas.length === 3 && r1.lineasAbiertas.length === 3, `con dos enemigos deberian quedar tres lineas abiertas: ${abiertas}`);

  // 2. Con el draft completo no hay nada que simular.
  eq(simularFinales({ ...args, enemigos: LINEAS.map((l) => pools[l][2]), lineasAbiertas: [] }), null,
    'simula finales con el draft ya completo');

  // 2b. Un baneado ni es candidato tuyo ni puede salir por ninguna linea. Con
  //     el lider baneado, la app lo quita del ranking: si la simulacion le
  //     siguiera votando, al nº1 real lo llamaria "fragil" con una cuota falsa.
  const lider = { name: r1.lider };
  const conBan = simularFinales({ ...args, ctx: { ...args.ctx, baneos: [lider] } });
  eq(conBan.cuota[r1.lider] ?? 0, 0, 'la simulacion vota a un heroe baneado');
  //     Y banear a unos cuantos es lo mismo que quitarlos de TODOS los pools
  //     enemigos (solo los que no son candidatos tuyos, para no tocar tu pool
  //     por el otro lado; un mago que tambien juega jungla sale de las dos).
  const enRoam = new Set(pools.roam.map((h) => h.name));
  const soloMid = pools.mid.filter((h) => !enRoam.has(h.name));
  ok(soloMid.length >= 5, 'el fixture necesita magos que no sean roamers');
  const fuera = new Set(soloMid.map((h) => h.name));
  const recortada = simularFinales({ ...args, poolsPorLinea: Object.fromEntries(LINEAS.map((l) => [l, pools[l].filter((h) => !fuera.has(h.name))])) });
  const baneada = simularFinales({ ...args, ctx: { ...args.ctx, baneos: soloMid } });
  ok(JSON.stringify(recortada.cuota) === JSON.stringify(baneada.cuota), 'un baneado puede salir por una linea abierta');

  // 2c. Cada final se puntua COMPLETO: el termino «por ver» del modelo se
  //     apaga aunque el ctx traiga lineas abiertas (son las del draft real,
  //     no las del final simulado). Sin esto, la esperanza contra lo que
  //     QUEDA en la linea (F, que casi nunca sale) se sumaria encima del
  //     cruce real contra el que SI salio (E). Fixture: por la roam abierta
  //     sale E (pickrate 50 veces el de F); A gana a E y pierde con F; B al
  //     reves y menos. Con E dentro gana A; con la esperanza colada (F),
  //     ganaria B.
  const H = (name, lanes) => ({ name, role: 'tank', lanes, tags: [] });
  const A = H('A', ['roam']); const B = H('B', ['roam']); const E = H('E', ['roam']); const F = H('F', ['roam']); const V = H('V', ['mid']);
  const st = indexarPorNombre({ A: { winRate: 0.5, pickRate: 0.01 }, B: { winRate: 0.5, pickRate: 0.01 }, V: { winRate: 0.5, pickRate: 0.01 }, E: { winRate: 0.5, pickRate: 0.05 }, F: { winRate: 0.5, pickRate: 0.001 } });
  const fixtureArgs = {
    pool: [A, B], enemigos: [V], lineasAbiertas: ['roam'], poolsPorLinea: { roam: [E, F] }, n: 8,
    ctx: { meta: { stats: st, counters: indexarPorNombre({ A: { V: 0.48, E: 0.56, F: 0.40 }, B: { V: 0.52, E: 0.49, F: 0.52 } }, 2), synergies: {} }, maestria: {} },
  };
  eq(simularFinales(fixtureArgs).lider, 'A', 'con E en el final deberia ganar A');
  const conAbiertasEnCtx = simularFinales({ ...fixtureArgs, ctx: { ...fixtureArgs.ctx, lineasAbiertas: ['roam'], poolsPorLinea: { roam: [E, F] } } });
  eq(conAbiertasEnCtx.lider, 'A', 'las lineas abiertas del ctx se cuelan en el final simulado: gana B por la esperanza contra F');

  // 2d. Lo que sale por una linea abierta se muestrea por lo que se JUEGA
  //     cuando no esta baneado (pickrate/(1−banrate), medido en 3.4.0: del
  //     13,0% al 15,3% de acierto en el top 10 de los picks que faltan).
  //     E se juega poco porque casi siempre lo banean: en esta partida no.
  //     Por pickrate a secas saldria F cinco veces mas y ganaria B.
  const stBan = indexarPorNombre({ A: { winRate: 0.5, pickRate: 0.01 }, B: { winRate: 0.5, pickRate: 0.01 }, V: { winRate: 0.5, pickRate: 0.01 }, E: { winRate: 0.5, pickRate: 0.01, banRate: 0.9 }, F: { winRate: 0.5, pickRate: 0.05, banRate: 0 } });
  const conBanRate = simularFinales({ ...fixtureArgs, n: 40, ctx: { ...fixtureArgs.ctx, meta: { ...fixtureArgs.ctx.meta, stats: stBan } } });
  eq(conBanRate.lider, 'A', `la simulacion no tiene en cuenta que E se juega cuando no lo banean: cuota ${JSON.stringify(conBanRate.cuota)}`);

  // 3. Lo que importa: la cuota PREDICE si el nº1 aguanta hasta el final. Medido
  //    con 3 enemigos vistos: si la cuota >= 0.5 aguanta el 59%, si no el 27%.
  //    Aqui se exige que la razon entre ambos sea al menos 1,5 sobre 150
  //    drafts, que deja holgura y sigue cazando una simulacion rota (razon 1).
  //    (Con el motor de 3.0, medido con cinco semillas: diferencia de tasas
  //    0,26–0,43; por la vía de la app, con las líneas abiertas DEDUCIDAS en
  //    vez de las reales, 0,19–0,43. Se mide con las reales: la deducción de
  //    líneas tiene su propia prueba de precisión.)
  let semilla = 5;
  const r = () => (semilla = (semilla * 1103515245 + 12345) % 2147483648) / 2147483648;
  const pr = (h) => M.stats[nombreClave(h.name)]?.pickRate ?? 0.001;
  const muestra = (pool, excl) => { const c = pool.filter((h) => !excl.has(h.name)); const t = c.reduce((a, h) => a + pr(h), 0); let x = r() * t; for (const h of c) { x -= pr(h); if (x <= 0) return h; } return c[c.length - 1]; };
  let robustos = 0; let robustosAguantan = 0; let fragiles = 0; let fragilesAguantan = 0;
  for (let d = 0; d < 150; d++) {
    const real = {}; const u = new Set();
    for (const l of LINEAS) { real[l] = muestra(pools[l], u); u.add(real[l].name); }
    const orden = [...LINEAS].sort(() => r() - 0.5);
    const vistos = orden.slice(0, 3).map((l) => real[l]);
    const ab = orden.slice(3);
    const P = ordenarPicks(pools.roam, { enemigos: vistos, aliados: [], meta: M, maestria: {} })[0].heroe.name;
    const T = ordenarPicks(pools.roam, { enemigos: LINEAS.map((l) => real[l]), aliados: [], meta: M, maestria: {} })[0].heroe.name;
    const sim = simularFinales({ pool: pools.roam, enemigos: vistos, lineasAbiertas: ab, poolsPorLinea: pools, ctx: { meta: M, maestria: {} }, n: 40, semilla: d + 1 });
    const cuota = sim?.cuota?.[P] ?? 0;
    if (cuota >= CUOTA_ROBUSTA) { robustos++; if (P === T) robustosAguantan++; } else { fragiles++; if (P === T) fragilesAguantan++; }
  }
  ok(robustos >= 10 && fragiles >= 10, `muestra desequilibrada: ${robustos} robustos, ${fragiles} fragiles`);
  const tasaR = robustosAguantan / robustos; const tasaF = fragilesAguantan / fragiles;
  ok(tasaR - tasaF >= 0.12,
    `la cuota no predice: los "robustos" (${robustos}) aguantan el ${(tasaR * 100).toFixed(0)}% y los "fragiles" (${fragiles}) el ${(tasaF * 100).toFixed(0)}% (diferencia ${(tasaR - tasaF).toFixed(2)}, minimo 0.12)`);
});

test('el generador del motor no tiene correlacion serial apreciable', () => {
  // El generador del motor es mulberry32: el congruencial de otras pruebas
  // tenía correlación serial (−0,011) y sesgaba de forma sistemática lo que
  // se ajustaba con él (+0,03 en un intercepto conocido, al recuperar los
  // coeficientes de una logística en scripts/medir-rival.mjs). Si alguien lo
  // cambia por otro, esto lo nota; con 60 finales el cambio de generador
  // mueve la cuota del nº1 una mediana de 5 puntos.
  const g = generador(5); const v = Array.from({ length: 20000 }, g); const m = v.reduce((a, b) => a + b) / v.length;
  let num = 0; let den = 0; for (let i = 0; i < v.length - 1; i++) num += (v[i] - m) * (v[i + 1] - m); for (const x of v) den += (x - m) ** 2;
  ok(Math.abs(num / den) < 0.008, `correlacion serial del generador ${num / den}`);
});

await terminar('motor/robustez');
