/**
 * La ficha de un héroe (3.67.0, fichaDeHeroe en draft.js): lo que el motor
 * ya sabe de él, con los datos reales. Propiedades, no números del día.
 */
import { test, ok, eq, leerJson, terminar } from '../arnes.mjs';
import { prepararDatos, fichaDeHeroe, POR_FICHA, poolDe, tocadoPorElParche } from '../../src/motor/draft.js';
import { cruce, sinergia } from '../../src/motor/matrices.js';
import { LINEAS } from '../../src/motor/catalogo.js';

const datos = prepararDatos({ catalogo: leerJson('public/data/heroes.json'), meta: leerJson('public/data/roam-meta.json'), rango: 'glory' });

test('la ficha: sus cruces y parejas son los de las matrices, ordenados, sin él mismo y sin inventar', () => {
  for (const nombre of ['Tigreal', 'Fanny', 'Layla', 'Chou', 'Valentina']) {
    const f = fichaDeHeroe(datos, nombre);
    ok(f, `sin ficha para ${nombre}`);
    eq(f.leGanaA.length, POR_FICHA); eq(f.leGanan.length, POR_FICHA);
    for (const x of [...f.leGanaA, ...f.leGanan]) eq(x.valor, cruce(datos.meta.counters, f.heroe.name, x.heroe.name), `el cruce con ${x.heroe.name} no es el de la matriz`);
    for (const x of [...f.combinaCon, ...f.peorCon]) eq(x.valor, sinergia(datos.meta.synergies, f.heroe.name, x.heroe.name), `la pareja con ${x.heroe.name} no es la de la matriz`);
    ok(Math.min(...f.leGanaA.map((x) => x.valor)) >= Math.max(...f.leGanan.map((x) => x.valor)), `${nombre}: a quien gana va por debajo de quien le gana`);
    ok(f.leGanaA.every((x, i, l) => i === 0 || l[i - 1].valor >= x.valor), `${nombre}: «le gana a» no va de más a menos`);
    ok(f.leGanan.every((x, i, l) => i === 0 || l[i - 1].valor <= x.valor), `${nombre}: «le ganan» no empieza por el peor`);
    ok(![...f.leGanaA, ...f.leGanan, ...f.combinaCon, ...f.peorCon].some((x) => x.heroe.name === f.heroe.name), `${nombre} sale contra sí mismo`);
    // Las parejas, solo con quien puede ir en otra línea.
    const suyas = LINEAS.filter((l) => poolDe(datos, l).some((h) => h.name === f.heroe.name));
    for (const x of [...f.combinaCon, ...f.peorCon]) {
      const otras = LINEAS.filter((l) => poolDe(datos, l).some((h) => h.name === x.heroe.name));
      ok(otras.some((l) => !suyas.includes(l)), `${nombre}: pareja con ${x.heroe.name}, que solo juega su misma línea`);
    }
    eq(JSON.stringify(f.lineas.map((l) => l.linea)), JSON.stringify(suyas));
    ok(f.stat && f.stat.winRate > 0.3 && f.stat.winRate < 0.7, `${nombre}: winrate raro ${f.stat?.winRate}`);
  }
});

test('la ficha encuentra al héroe con otra grafía y no se inventa uno que no existe', () => {
  eq(fichaDeHeroe(datos, 'x borg')?.heroe.name, fichaDeHeroe(datos, 'X.Borg')?.heroe.name);
  eq(fichaDeHeroe(datos, 'Nadie Nunca'), null);
  eq(fichaDeHeroe(datos, null), null);
  eq(fichaDeHeroe({ heroes: [] }, 'Tigreal'), null);
});

test('tocado por el parche (3.102.0): con su fecha y los días, solo durante la ventana de los datos, por clave y sin mirar el reloj', () => {
  const catalogo = leerJson('public/data/heroes.json');
  const meta = leerJson('public/data/roam-meta.json');
  const d = prepararDatos({ catalogo, meta: { ...meta, days: 7, tocados: { Atlas: '2026-11-11', 'Popol and Kupa': '2026-11-11', Roto: '11/11/2026' } }, rango: 'glory' });
  const dia = (f, h = 12) => Date.parse(`${f}T${String(h).padStart(2, '0')}:00:00Z`);
  eq(JSON.stringify(tocadoPorElParche(d, 'Atlas', dia('2026-11-11', 0))), JSON.stringify({ fecha: '2026-11-11', dias: 0, quedan: 7 }), 'el mismo día');
  eq(tocadoPorElParche(d, { name: 'popol and kupa' }, dia('2026-11-17', 23))?.dias, 6, 'el sexto día, o sin casar por clave');
  eq(tocadoPorElParche(d, 'Atlas', dia('2026-11-18', 0)), null, 'sigue cumplida la ventana');
  eq(tocadoPorElParche(d, 'Atlas', dia('2026-11-10')), null, 'antes de la fecha');
  eq(tocadoPorElParche(d, 'Atlas'), null, 'sin reloj, el motor no puede saber cuánto hace');
  eq(tocadoPorElParche(d, 'Roto', dia('2026-11-12')), null, 'una fecha sin forma');
  eq(tocadoPorElParche(d, 'Diggie', dia('2026-11-12')), null, 'uno sin tocar');
  // La ventana es la de los datos: con 3 días, al cuarto ya no.
  const d3 = prepararDatos({ catalogo, meta: { ...meta, days: 3, tocados: { Atlas: '2026-11-11' } }, rango: 'glory' });
  ok(tocadoPorElParche(d3, 'Atlas', dia('2026-11-13')) && !tocadoPorElParche(d3, 'Atlas', dia('2026-11-14')), 'no sigue a la ventana de los datos');
  // La ficha lo lleva con el reloj que le pasen.
  eq(fichaDeHeroe(d, 'Atlas', { ahora: dia('2026-11-14') }).parche?.dias, 3);
  eq(fichaDeHeroe(d, 'Atlas').parche, null);
});

await terminar('motor/ficha');
