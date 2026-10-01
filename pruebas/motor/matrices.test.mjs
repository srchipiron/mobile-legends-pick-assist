/**
 * Pruebas de src/motor/matrices.js: la lectura de las matrices de la API
 * (cruces y parejas) y el recuento de lo que traen. Un héroe sin fila se
 * queda sin datos en silencio, así que la cobertura tiene que decir quién
 * falta, por nombre.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { test, ok, eq, leerJson, RAIZ, terminar } from '../arnes.mjs';
import { h } from '../fixtures/catalogo.mjs';
import { indexarPorNombre } from '../../src/motor/nombres.js';
import {
  cobertura, cruce, sinergia, CRUCE_DESTACABLE, CRUCE_MALO, PAREJA_DESTACABLE,
} from '../../src/motor/matrices.js';
import { mediaDeSinergia, COLA_DEL_MOTIVO } from '../../src/motor/matrices.js';
import { metaSintetica } from '../fixtures/meta-sintetico.mjs';
import { medirColas } from '../../src/motor/diagnostico/seccion-datos.js';
import { terminoPareja } from '../../src/motor/modelo.js';

/** Todos los .js de src/motor, subcarpetas incluidas (diagnostico/). */
function ficherosDelMotor(dir) {
  const salida = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) { salida.push(...ficherosDelMotor(ruta)); continue; }
    if (nombre.endsWith('.js')) salida.push(ruta);
  }
  return salida.sort();
}

test('la cobertura detecta héroes sin datos', () => {
  const c = cobertura([h('Khufra'), h('Atlas')], indexarPorNombre({ Khufra: { winRate: 0.5 } }));
  ok(c.conDatos === 1 && c.faltan[0] === 'Atlas', JSON.stringify(c));
});

test('la sinergia se lee en los dos sentidos, como los counters', () => {
  // Llevar a A con B es lo mismo que llevar a B con A, asi que el dato vale
  // igual por los dos lados. NO se le da la vuelta: eso es cosa de los
  // counters, donde A gana lo que B pierde.
  const m = indexarPorNombre({ Tigreal: { Layla: 0.56, Franco: 0.44 } }, 2);
  eq(sinergia(m, 'Tigreal', 'Layla'), 0.56);
  eq(sinergia(m, 'Layla', 'Tigreal'), 0.56, 'no encuentra el dato por el otro lado');
  eq(sinergia(m, 'Layla', 'Franco'), undefined, 'se inventa una sinergia que no existe');

  // Y que el termino de parejas lo aproveche de verdad: sin esto el dato
  // existia y no lo miraba nadie, que es como se perdia el 37% de los cruces.
  const yo = { name: 'Layla', tags: [] };
  const aliado = { name: 'Tigreal', tags: [] };
  const conDato = terminoPareja(yo, aliado, m, 0.5).valor;
  const sinDato = terminoPareja(yo, aliado, indexarPorNombre({}, 2), 0.5).valor;
  ok(conDato > sinDato, 'no usa el dato de sinergia cuando solo esta apuntado del otro lado');
});

test('el umbral de "ganas el cruce" sale de la distribucion, no de una intuicion', () => {
  // Se comprueba sobre el meta SINTÉTICO, que reproduce la distribución con
  // la que se calibraron los umbrales (p90/p10 0,5154/0,4846 en los cruces,
  // 0,51 en las parejas): hasta 3.30.1 se exigía sobre los datos del día y
  // el 1 de octubre de 2026 (parejas más dispersas: «combina bien» en el
  // 27,4% de los pares) tumbó el despliegue de un arreglo que no tocaba
  // el motor. La cifra del día la vigila el diagnóstico (aviso) y aquí solo
  // se escribe en el registro.
  const sintetico = metaSintetica();
  const C = indexarPorNombre(sintetico.counters, 2);
  const nombres = sintetico.heroes.map((x) => x.name);
  ok(nombres.length >= 100, `el meta sintético trae ${nombres.length} heroes: la calibracion del umbral no se puede comprobar`);

  const v = [];
  for (const a of nombres) for (const b of nombres) {
    if (a === b) continue;
    const x = cruce(C, a, b);
    if (x != null) v.push(x);
  }
  const porEncima = v.filter((x) => x >= CRUCE_DESTACABLE).length / v.length;
  const porDebajo = v.filter((x) => x <= CRUCE_MALO).length / v.length;
  const [desde, hasta] = COLA_DEL_MOTIVO;

  // El umbral tiene que caer en la COLA de la distribucion real, no donde a
  // uno le suene bien. Estuvo en 0.53, que es el percentil 99: el motivo
  // respaldado por datos salia en el 1,6% de los cruces y en su lugar se leian
  // los de los tags, que es lo que la app tenia peor fundado.
  ok(porEncima > desde && porEncima < hasta,
    `"ganas el cruce" sale en el ${(porEncima * 100).toFixed(1)}% de los cruces: no esta en la cola`);
  ok(porDebajo > desde && porDebajo < hasta,
    `"pierdes el cruce" sale en el ${(porDebajo * 100).toFixed(1)}% de los cruces: no esta en la cola`);
  // Y simetricos: no hay razon para avisar mas de lo malo que de lo bueno.
  ok(Math.abs(porEncima - porDebajo) < 0.03, 'los dos umbrales no cubren la misma cola');

  // Las PAREJAS tienen su propia distribucion y no valen los numeros de los
  // cruces: p90 = 0.5100 frente a 0.5154. Tambien estuvo en 0.53, que aqui es
  // el percentil 99: "combina bien con X" salia en el 1,3% de las parejas.
  const S = indexarPorNombre(sintetico.synergies, 2);
  const par = [];
  for (let i = 0; i < nombres.length; i++) {
    for (let j = i + 1; j < nombres.length; j++) {
      const x = sinergia(S, nombres[i], nombres[j]);
      if (x != null) par.push(x);
    }
  }
  const buenas = par.filter((x) => x >= PAREJA_DESTACABLE).length / par.length;
  ok(buenas > desde && buenas < hasta,
    `"combina bien" sale en el ${(buenas * 100).toFixed(1)}% de las parejas: no esta en la cola`);
  ok(PAREJA_DESTACABLE !== CRUCE_DESTACABLE,
    'las parejas usan el umbral de los cruces: son distribuciones distintas');

  // Y la medida de hoy, la misma que enseña el diagnóstico, al registro: se
  // mueve con el dato (27,4% de parejas el 1 de octubre de 2026), no se exige.
  const meta = leerJson('public/data/roam-meta.json');
  ok((meta.heroes ?? []).length >= 100, `roam-meta.json trae ${(meta.heroes ?? []).length} heroes`);
  const hoy = medirColas({ stats: meta.stats, counters: indexarPorNombre(meta.counters, 2), synergies: indexarPorNombre(meta.synergies, 2) });
  const pct = (x) => (x == null ? 'sin dato' : `${(x * 100).toFixed(1)}%`);
  console.log(`  motivos con dato hoy: «ganas el cruce» ${pct(hoy?.cruces)} · «combina bien» ${pct(hoy?.parejas)} (calibrados entre el ${desde * 100}% y el ${hasta * 100}%)`);
});

test('ningun 0.53 escrito a mano suelto en el motor', () => {
  // Tres veces ha aparecido el mismo 0.53 en sitios distintos -counters,
  // analisis del draft y sinergias- y las tres es el percentil 99 de su
  // distribucion, o sea "casi nunca". Es la clase de constante que se copia de
  // un sitio a otro sin volver a medirla.
  // Se recorre src/motor ENTERO (incluido diagnostico/), no una lista escrita
  // a mano: la lista tenia siete ficheros de los dieciocho modulos del motor
  // y dejaba fuera justo donde el patron se repite (baneos, equipo,
  // composicion, robustez, draft, builds, reglas, lineas). Sin exclusiones:
  // los umbrales calibrados viven en matrices.js y son ASIGNACIONES
  // (`export const CRUCE_MALO = 0.4846;`), no comparaciones, asi que no casan.
  const ficheros = ficherosDelMotor(resolve(RAIZ, 'src/motor'));
  ok(ficheros.length >= 18, `solo se encuentran ${ficheros.length} modulos del motor: el recorrido no ve el arbol entero`);
  // Y que estan los que la lista escrita a mano dejaba fuera, por nombre: un
  // recuento solo dice cuantos, no cuales.
  const relativos = ficheros.map((f) => f.slice(resolve(RAIZ, 'src/motor').length + 1));
  for (const f of ['baneos.js', 'equipo.js', 'composicion.js', 'robustez.js', 'draft.js', 'builds.js', 'reglas.js', 'lineas.js', 'diagnostico/seccion-motor.js']) {
    ok(relativos.includes(f), `el recorrido del motor no llega a ${f}: ${relativos.join(', ')}`);
  }
  const motor = ficheros
    .map((f) => readFileSync(f, 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '')          // sin comentarios de bloque
    .split('\n').filter((l) => !/^\s*\/\//.test(l)).join('\n');

  const sueltos = [...motor.matchAll(/(?:>=|<=|>|<)\s*(0\.4[0-9]+|0\.5[0-9]+)\b/g)]
    .map((m) => m[1])
    .filter((v) => Number(v) !== 0.5); // 0.5 es el empate, no un umbral calibrado
  ok(!sueltos.length,
    `umbrales de cruce escritos a mano: ${[...new Set(sueltos)].join(', ')}. `
    + 'Van como constante medida contra la distribucion, no a ojo.');
});

test('un heroe sin estadisticas no pesa en el centro de las parejas', () => {
  // `?? 1` entre cuotas que suman 1: un héroe recién salido (en la matriz de
  // parejas, aún sin estadísticas) pesaba 133 veces lo que cualquier pareja
  // y movía el centro (medido con los datos reales: 0,36 pp por héroe).
  const synergies = { a: { b: 0.52, n: 0.30 }, b: { a: 0.52, n: 0.30 }, n: { a: 0.30, b: 0.30 } };
  const stats = { a: { pickRate: 0.01 }, b: { pickRate: 0.01 } };
  const conTodos = mediaDeSinergia(synergies, null, { ...stats, n: { pickRate: 0.01 } });
  const sinN = mediaDeSinergia(JSON.parse(JSON.stringify(synergies)), null, stats);
  ok(Math.abs(sinN - 0.52) < 1e-9, `el héroe sin estadísticas ha entrado en el centro: ${sinN} (con todos, ${conTodos})`);
  // Sin estadísticas, todos pesan igual: la media simple.
  ok(Math.abs(mediaDeSinergia(JSON.parse(JSON.stringify(synergies)), null, null) - (0.52 * 2 + 0.3 * 4) / 6) < 1e-9, 'sin estadísticas no es la media simple');
});

await terminar('motor/matrices');
