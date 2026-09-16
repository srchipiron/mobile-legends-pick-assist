/**
 * Pruebas de src/motor/maestria.js: tu maestría, escrita a mano o sacada de
 * las partidas apuntadas, leída por clave normalizada y comparada contra TU
 * nivel. La otra mitad de la prueba de perfiles (fundir y sanear) vive en
 * perfil.test.mjs.
 */
import { test, ok, eq, leerJson, terminar } from '../arnes.mjs';
import { catalogo, h } from '../fixtures/catalogo.mjs';
import { buscar, nombreClave } from '../../src/motor/nombres.js';
import { maestriaEfectiva, maestriaDesdeRegistro, notaDeMaestria, priorDeMaestria } from '../../src/motor/maestria.js';
import { generador } from '../../src/motor/robustez.js';
import { ordenarPicks } from '../../src/motor/ranking.js';
import { ESCALA } from '../../src/motor/modelo.js';
import { prepararDatos } from '../../src/motor/draft.js';

test('perfiles y registro: fundir por instante, sanear lo que llega y maestria por nombre normalizado', () => {
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

await terminar('motor/maestria');
