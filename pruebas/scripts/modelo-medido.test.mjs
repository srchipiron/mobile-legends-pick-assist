/**
 * La MEDICIÓN del modelo contra partidas con resultado. Dos cosas que no
 * viven en el motor y por eso no caben en `pruebas/motor/`: la maquinaria de
 * medida (`medir-rival.mjs`: regresión logística y reparto de líneas) y el
 * ajuste de la escala sobre el corpus profesional (`ajustar-modelo.mjs`).
 *
 * Aquí vuelve la comprobación que el port anterior perdió: que la `ESCALA`
 * del código sea la que hoy sale de medir las partidas pro. `CLAUDE.md`
 * («El modelo») lo promete con estas palabras: «La prueba "el modelo: la
 * nota es la probabilidad…" falla si la escala medida hoy se aleja más de
 * 2,5 SE de la del código». Sin esto, la promesa estaba en el nombre de una
 * prueba y en ningún sitio más.
 */
import { test, ok, eq, terminar, leerJson } from '../arnes.mjs';
import { catalogo } from '../fixtures/catalogo.mjs';
import { LINEAS } from '../../src/motor/catalogo.js';
import { indiceDeLineas, frecuenciaDeRoles, detectarRivalDeLinea } from '../../src/motor/lineas.js';
import { generador } from '../../src/motor/robustez.js';
import { prepararDatos, estimarCon } from '../../src/motor/draft.js';
import { ESCALA, ESCALA_SE, PESO_EQUILIBRIO_DANO, terminoEquilibrio } from '../../src/motor/modelo.js';
import { logistica, asignarLineas } from '../../scripts/medir-rival.mjs';
import { cargar, terminosDe, validar } from '../../scripts/ajustar-modelo.mjs';

test('la medida del rival de linea: la logistica recupera coeficientes conocidos y el reparto de lineas es el de la app', () => {
  // Datos sinteticos con coeficientes conocidos (a=0.3, b1=1.5, b2=-0.8): el
  // ajuste tiene que recuperarlos dentro de tres errores tipicos. Con el
  // generador del motor (mulberry32): el congruencial de otras pruebas
  // sesgaba el intercepto +0.03 de forma sistematica.
  const rnd = generador(17);
  const X = []; const y = [];
  for (let i = 0; i < 3000; i++) {
    const x1 = rnd() * 2 - 1; const x2 = rnd() * 2 - 1;
    const p = 1 / (1 + Math.exp(-(0.3 + 1.5 * x1 - 0.8 * x2)));
    X.push([1, x1, x2]); y.push(rnd() < p ? 1 : 0);
  }
  const r = logistica(X, y);
  ok(Math.abs(r.b[1] - 1.5) < 3 * r.se[1] && r.se[1] < 0.2, `b1 ${r.b[1]} ± ${r.se[1]} (esperado 1.5)`);
  ok(Math.abs(r.b[2] + 0.8) < 3 * r.se[2], `b2 ${r.b[2]} ± ${r.se[2]} (esperado -0.8)`);
  ok(Math.abs(r.b[0] - 0.3) < 3 * r.se[0], `a ${r.b[0]} ± ${r.se[0]} (esperado 0.3)`);
  // Y el generador del motor no tiene correlacion serial apreciable.
  const g = generador(5); const v = Array.from({ length: 20000 }, g); const m = v.reduce((a, b) => a + b) / v.length;
  let num = 0; let den = 0; for (let i = 0; i < v.length - 1; i++) num += (v[i] - m) * (v[i + 1] - m); for (const x of v) den += (x - m) ** 2;
  ok(Math.abs(num / den) < 0.008, `correlacion serial del generador ${num / den}`);
  ok(Number.isFinite(r.logL) && r.logL < 0, 'log-verosimilitud');
  // El reparto de lineas coincide con lo que la app deduce cuando no duda.
  const listado = [
    { name: 'Angela', role: 'support', lane: 'roam' }, { name: 'Kagura', role: 'mage', lane: 'mid' },
    { name: 'Claude', role: 'marksman', lane: 'gold' }, { name: 'Saber', role: 'assassin', lane: 'jungle' },
    { name: 'Argus', role: 'fighter', lane: 'exp' },
  ];
  const info = indiceDeLineas(listado); const frec = frecuenciaDeRoles(listado.map((x) => ({ ...x, lanes: x.lane.split(',') })));
  const equipo = listado.map((x) => ({ name: x.name }));
  const reparto = asignarLineas(equipo, info, frec);
  for (const l of ['roam', 'mid', 'gold', 'jungle', 'exp']) {
    eq(reparto[l].name, detectarRivalDeLinea(equipo, info, l, frec), `reparto de ${l} distinto del de la app`);
  }
});

test('el modelo: la escala es la medida en las partidas pro', async () => {
  // Es el punto 3 de «el modelo: la nota es la probabilidad de ganar, sube
  // con el cruce, y la escala es la medida en las partidas pro»: sobre el
  // corpus pro (si esta), la pendiente de la regresion logistica de «gano»
  // sobre H+C+S coincide con ESCALA dentro de 2,5 errores tipicos. Es una
  // prueba sobre datos reales, asi que lleva su margen medido (SE 0.10-0.12
  // con 900-1.500 partidas).
  const { usables, ctx } = await cargar(120);
  // Sin corpus no se mide nada, y eso es un FALLO, no un pase: con un `return`
  // el fichero imprimía «correctas» sin haber medido la escala, que es lo
  // único que esta prueba promete.
  ok(usables.length >= 300, `el corpus pro trae ${usables.length} partidas usables (mínimo 300): la escala no se puede medir`);
  const filas = usables.map((p) => terminosDe(p, ctx));
  // Lo que el motor suma desde 3.4.0: H + C + S + PESO_EQUILIBRIO_DANO · D.
  const r = validar(filas, (f) => [f.H + f.C + f.S + PESO_EQUILIBRIO_DANO * f.D]);
  const b = r.ajuste.b[1]; const se = r.ajuste.se[1];
  ok(Math.abs(b - ESCALA) < 2.5 * Math.max(se, ESCALA_SE), `la escala medida hoy (${b.toFixed(2)} ± ${se.toFixed(2)}) no es la del modelo (${ESCALA}): vuelve a ajustar y documentalo`);
  //    Y el modelo escalado predice mejor fuera de muestra que el de 1.x sin
  //    escala: es la razon de existir de la escala.
  const fijo = validar(filas, (f) => [f.H, f.C, f.S], { fijo: [1, 1, 1] });
  ok(r.cv.logL > fijo.cv.logL, `el modelo escalado no mejora al de coeficientes 1: ${r.cv.logL.toFixed(1)} vs ${fijo.cv.logL.toFixed(1)}`);
  //    Y el equilibrio de daño (3.4.0) sigue mejorando la validacion cruzada
  //    frente al modelo sin el: es la razon de existir del termino. Medido
  //    con ocho semillas de particion: +3,05 a +3,87 de logL por 1.000
  //    partidas a 120 dias (+2,52 a +3,38 a 400); con el signo cambiado,
  //    negativo. El minimo exigido (0,5) deja cinco veces de holgura.
  //    Y lo que mide el script es lo que suma el motor: el mismo termino,
  //    con el mismo signo (un signo cambiado en el motor no lo veria la
  //    validacion cruzada, que llama a `equilibrioDe` directamente).
  for (const [i, p] of usables.slice(0, 50).entries()) {
    const motor = terminoEquilibrio(p.equipos[0], p.equipos[1]).valor;
    ok(Math.abs(motor - PESO_EQUILIBRIO_DANO * filas[i].D) < 1e-12, `el motor suma ${motor} de equilibrio y el ajuste mide ${filas[i].D}`);
  }
  const sinDano = validar(filas, (f) => [f.H + f.C + f.S]);
  const ganancia = (r.cv.logL - sinDano.cv.logL) / filas.length * 1000;
  ok(ganancia >= 0.5, `el equilibrio de daño ya no mejora la validacion cruzada (${ganancia.toFixed(2)} de logL por 1.000 partidas, minimo 0,5): mide y decide si sigue en la nota`);

  //    El margen de 2,5 SE es el correcto para no tumbar el despliegue por
  //    ruido, pero deja pasar mucho: con el ajuste de hoy (0.40 ± 0.13) todo
  //    lo que hay entre 0.08 y 0.73 lo pasa, o sea que una ESCALA puesta a
  //    0.58 (+32%) no la caza NADIE. Lo que sí la caza es lo que la escala
  //    hace en pantalla, que también está medido y documentado: con drafts
  //    completos al azar la probabilidad va del 40% al 60% (p05/p95); sin
  //    escala iba del 30% al 70%, y eso era exagerar.
  //    El margen, medido con ocho semillas y 1.000 drafts cada una (3.4.0,
  //    con el equilibrio de daño dentro, que ensancha la banda): a 0.44 p05
  //    cae entre 0.3804 y 0.3867 y p95 entre 0.6106 y 0.6254; a 0.58, p05
  //    entre 0.3446 y 0.3525 y p95 entre 0.6441 y 0.6628. La banda deja un
  //    punto de holgura por el lado malo, mas del doble de lo que se mueve
  //    entre semillas, y una escala +32% se sale por los dos extremos
  //    (verificado por mutacion). Antes de 3.4.0: 0.3995–0.4093 y
  //    0.5917–0.5982.
  const meta = leerJson('public/data/roam-meta.json');
  ok((meta.heroes ?? []).length >= 100 && meta.counters, 'roam-meta.json llega sin héroes o sin matriz de cruces: la banda de probabilidad no se puede medir');
  const datos = prepararDatos({ catalogo, meta });
  const pools = datos.poolsPorLinea;
  ok(!LINEAS.some((ln) => pools[ln].length < 10), `alguna línea se ha quedado con menos de diez héroes (${LINEAS.map((ln) => `${ln} ${pools[ln].length}`).join(', ')}): no hay drafts que sortear`);
  const rnd = generador(3);
  const ps = [];
  for (let d = 0; d < 1000; d++) {
    const u = new Set();
    const coge = (ln) => { const c = pools[ln].filter((x) => !u.has(x.name)); const x = c[Math.floor(rnd() * c.length)]; u.add(x.name); return x; };
    const A = LINEAS.map(coge); const E = LINEAS.map(coge);
    ps.push(estimarCon(datos, { yo: A[0], aliados: A.slice(1), enemigos: E }).p);
  }
  ps.sort((a, b2) => a - b2);
  const q = (f) => ps[Math.floor(ps.length * f)];
  ok(q(0.05) > 0.37 && q(0.05) < 0.40, `p05 de 1.000 drafts al azar fuera de lo medido con la escala 0.44: ${q(0.05).toFixed(4)}`);
  ok(q(0.95) > 0.60 && q(0.95) < 0.63, `p95 de 1.000 drafts al azar fuera de lo medido con la escala 0.44: ${q(0.95).toFixed(4)}`);
});

await terminar('scripts/modelo-medido');
