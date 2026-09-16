/**
 * Pruebas de src/motor/matrices.js: la lectura de las matrices de la API
 * (cruces y parejas) y el recuento de lo que traen. Un héroe sin fila se
 * queda sin datos en silencio, así que la cobertura tiene que decir quién
 * falta, por nombre.
 */
import { test, ok, eq, leerJson, leerTexto, terminar } from '../arnes.mjs';
import { h } from '../fixtures/catalogo.mjs';
import { indexarPorNombre } from '../../src/motor/nombres.js';
import {
  cobertura, cruce, sinergia, CRUCE_DESTACABLE, CRUCE_MALO, PAREJA_DESTACABLE,
} from '../../src/motor/matrices.js';
import { terminoPareja } from '../../src/motor/modelo.js';

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
  const meta = leerJson('public/data/roam-meta.json');
  const C = indexarPorNombre(meta.counters, 2);
  const nombres = (meta.heroes ?? []).map((x) => x.name);
  // Sin heroes no se puede calibrar nada, y eso es un FALLO, no un pase.
  ok(nombres.length >= 100, `roam-meta.json trae ${nombres.length} heroes: la calibracion del umbral no se puede comprobar`);

  const v = [];
  for (const a of nombres) for (const b of nombres) {
    if (a === b) continue;
    const x = cruce(C, a, b);
    if (x != null) v.push(x);
  }
  const porEncima = v.filter((x) => x >= CRUCE_DESTACABLE).length / v.length;
  const porDebajo = v.filter((x) => x <= CRUCE_MALO).length / v.length;

  // El umbral tiene que caer en la COLA de la distribucion real, no donde a
  // uno le suene bien. Estuvo en 0.53, que es el percentil 99: el motivo
  // respaldado por datos salia en el 1,6% de los cruces y en su lugar se leian
  // los de los tags, que es lo que la app tenia peor fundado.
  ok(porEncima > 0.04 && porEncima < 0.20,
    `"ganas el cruce" sale en el ${(porEncima * 100).toFixed(1)}% de los cruces: no esta en la cola`);
  ok(porDebajo > 0.04 && porDebajo < 0.20,
    `"pierdes el cruce" sale en el ${(porDebajo * 100).toFixed(1)}% de los cruces: no esta en la cola`);
  // Y simetricos: no hay razon para avisar mas de lo malo que de lo bueno.
  ok(Math.abs(porEncima - porDebajo) < 0.03, 'los dos umbrales no cubren la misma cola');

  // Las PAREJAS tienen su propia distribucion y no valen los numeros de los
  // cruces: p90 = 0.5100 frente a 0.5154. Tambien estuvo en 0.53, que aqui es
  // el percentil 99: "combina bien con X" salia en el 1,3% de las parejas.
  const S = indexarPorNombre(meta.synergies, 2);
  const par = [];
  for (let i = 0; i < nombres.length; i++) {
    for (let j = i + 1; j < nombres.length; j++) {
      const x = sinergia(S, nombres[i], nombres[j]);
      if (x != null) par.push(x);
    }
  }
  const buenas = par.filter((x) => x >= PAREJA_DESTACABLE).length / par.length;
  ok(buenas > 0.04 && buenas < 0.20,
    `"combina bien" sale en el ${(buenas * 100).toFixed(1)}% de las parejas: no esta en la cola`);
  ok(PAREJA_DESTACABLE !== CRUCE_DESTACABLE,
    'las parejas usan el umbral de los cruces: son distribuciones distintas');
});

test('ningun 0.53 escrito a mano suelto en el motor', () => {
  // Tres veces ha aparecido el mismo 0.53 en sitios distintos -counters,
  // analisis del draft y sinergias- y las tres es el percentil 99 de su
  // distribucion, o sea "casi nunca". Es la clase de constante que se copia de
  // un sitio a otro sin volver a medirla.
  // (En 3.0 el viejo score.js está repartido entre nombres, catalogo,
  // matrices y maestria: se miran los cuatro además de modelo, ranking y
  // analisis, que son donde vivían los tres 0.53.)
  const motor = ['nombres', 'catalogo', 'matrices', 'maestria', 'modelo', 'ranking', 'analisis']
    .map((f) => leerTexto(`src/motor/${f}.js`))
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

await terminar('motor/matrices');
