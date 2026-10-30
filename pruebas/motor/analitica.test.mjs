/**
 * La analítica de tus partidas (3.88.0, src/motor/analitica.js): la evolución
 * semana a semana, con quién ganas y contra quién, por línea, por día y con
 * la app. Cada número con su intervalo; «mejor/peor» solo fuera de él.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { evolucion, porCompaneros, porLinea, porDia, conLaApp, partidasValidas, MINIMO_CON_UNO } from '../../src/motor/analitica.js';

const DIA = 24 * 60 * 60 * 1000;
const AHORA = Date.UTC(2026, 9, 30, 12);
const p = (diasAtras, gane, extra = {}) => ({ t: AHORA - diasAtras * DIA, gane, pick: 'Floryn', ...extra });

test('las que cuentan: con la app, con resultado y en orden; las previas no', () => {
  const l = partidasValidas([p(2, true), { t: 5, gane: true, pick: 'X', previa: true }, p(1, false), { t: 9, pick: 'X' }, null]);
  eq(l.length, 2);
  ok(l[0].t < l[1].t, 'no salen en orden');
});

test('la evolución: doce semanas hacia atrás, la última son los últimos 7 días, y los huecos se ven', () => {
  const e = evolucion([p(0.5, true), p(1, false), p(6.9, true), p(7.1, false), p(20, true), p(200, true)], { ahora: AHORA });
  eq(e.length, 12);
  eq(e[11].n, 3, 'la última semana no son los últimos 7 días');
  eq(e[11].ganadas, 2);
  eq(e[10].n, 1, 'la de 7,1 días no cae en la semana anterior');
  eq(e[9].n, 1, 'la de 20 días no cae tres semanas atrás');
  eq(e[8].n, 0); eq(e[8].wr, null, 'una semana vacía no sale como 0%');
  eq(e.reduce((s, x) => s + x.n, 0), 5, 'la de hace 200 días entra en la evolución');
  eq(evolucion([p(-1, true)], { ahora: AHORA }).reduce((s, x) => s + x.n, 0), 0, 'una partida del futuro entra');
});

test('con quién ganas: desde el mínimo, con su intervalo, y «mejor» solo si deja fuera tu media', () => {
  const lista = [];
  // Gord a tu lado: 9 de 10. Tu media sin él, 50%.
  for (let i = 0; i < 10; i++) lista.push(p(i + 1, i < 9, { draft: { linea: 'roam', aliados: ['Gord', 'Layla'], enemigos: ['Clint'] } }));
  for (let i = 0; i < 30; i++) lista.push(p(i + 20, i % 2 === 0, { draft: { linea: 'roam', aliados: ['Selena'], enemigos: ['Clint'] } }));
  // Uno que sale menos del mínimo.
  for (let i = 0; i < MINIMO_CON_UNO - 1; i++) lista.push(p(i + 60, false, { draft: { linea: 'roam', aliados: ['Zilong'], enemigos: [] } }));
  const r = porCompaneros(lista, { lado: 'aliados' });
  eq(r.mejores[0].heroe, 'Gord', 'el mejor compañero no es Gord');
  eq(r.mejores[0].lado, 'mejor', 'Gord 9 de 10 no se distingue de una media del 50%');
  ok(!r.mejores.some((h) => h.heroe === 'Zilong'), 'sale uno por debajo del mínimo');
  ok(r.mejores[0].bajo > 0.5 && r.mejores[0].alto <= 1, 'sin intervalo');
  const layla = r.mejores.find((h) => h.heroe === 'Layla');
  ok(layla && layla.n === 10, 'cuenta mal a la de la misma partida');
  const contra = porCompaneros(lista, { lado: 'enemigos' });
  eq(contra.heroes, 1, 'un rival de menos del mínimo cuenta');
  eq(contra.mejores[0].lado, null, 'Clint (siempre) se distingue de tu media');
  // Un héroe repetido en la misma partida (datos raros) cuenta una vez.
  eq(porCompaneros([p(1, true, { draft: { aliados: ['Gord', 'gord'] } })], { minimo: 1 }).mejores[0].n, 1);
});

test('los mejores por el borde bajo: 4 de 4 (100%) no adelanta a 18 de 20 (90%), que se sabe mejor', () => {
  const lista = [];
  for (let i = 0; i < 4; i++) lista.push(p(i, true, { draft: { aliados: ['Uno'] } }));
  for (let i = 0; i < 20; i++) lista.push(p(i + 10, i < 18, { draft: { aliados: ['Dos'] } }));
  for (let i = 0; i < 40; i++) lista.push(p(i + 40, i % 2 === 0, { draft: { aliados: ['Tres'] } }));
  const r = porCompaneros(lista, { minimo: 4 });
  eq(r.mejores.map((h) => h.heroe).slice(0, 2).join(), 'Dos,Uno', 'ordena por el winrate y no por el borde bajo');
  eq(r.peores[0].heroe, 'Tres', 'no ordena los peores por el borde alto');
});

test('por línea y por día: cada grupo contra el resto, desde 10 en cada lado', () => {
  const lista = [];
  for (let i = 0; i < 20; i++) lista.push(p(i, i < 18, { draft: { linea: 'roam' } }));
  for (let i = 0; i < 20; i++) lista.push(p(i + 30, i < 6, { draft: { linea: 'exp' } }));
  for (let i = 0; i < 5; i++) lista.push(p(i + 60, true, { draft: { linea: 'mid' } }));
  const l = porLinea(lista);
  eq(l.map((g) => g.id).sort().join(), 'exp,roam', 'una línea con menos de 10 sale');
  const roam = l.find((g) => g.id === 'roam');
  ok(roam.seVe && roam.dif > 0, `roam 18/20 contra exp 6/20 no se distingue: ${JSON.stringify(roam)}`);
  const d = porDia(lista, { dia: (t) => (Math.floor((AHORA - t) / DIA) < 20 ? 6 : 1) });
  eq(d.map((g) => g.id).join(), '1,6', 'los días no van de lunes a domingo');
  // El domingo con más partidas (30) que el miércoles (15): aun así va detrás.
  const semana = porDia(lista, { dia: (t) => (Math.floor((AHORA - t) / DIA) < 40 ? 0 : 3) });
  eq(semana.map((g) => `${g.id}:${g.n}`).join(), '3:15,0:30', 'los días no van de lunes a domingo (van por partidas)');
});

test('con la app: el nº1, entre los tres y por libre; las de pick supuesto no cuentan', () => {
  const r = conLaApp([
    p(1, true, { pick: 'A', recomendados: ['A', 'B', 'C'] }),
    p(2, false, { pick: 'B', recomendados: ['A', 'B', 'C'] }),
    p(3, true, { pick: 'Z', recomendados: ['A', 'B', 'C'] }),
    p(4, true, { pick: 'A', recomendados: ['A', 'B', 'C'], supuesto: true }),
    p(5, true, { pick: 'A' }),
  ]);
  eq(r.n, 3, 'cuenta una supuesta o una sin recomendados');
  eq(r.numeroUno.n, 1); eq(r.entreLosTres.n, 2); eq(r.porLibre.n, 1);
  eq(r.entreLosTres.ganadas, 1);
});

await terminar('motor/analitica');
