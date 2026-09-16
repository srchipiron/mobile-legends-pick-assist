/**
 * La forma del código: el motor es puro (no importa de la app, de React, de
 * scripts ni de Node), no hay ciclos de importación, y ningún fichero de la
 * app se llama igual que otro (dos `Baneos.jsx` en dos carpetas era una
 * trampa para quien busca). Y las carpetas viejas ya no existen.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, join, relative, resolve } from 'node:path';
import { test, ok, terminar, RAIZ } from '../arnes.mjs';

function ficherosDe(dir) {
  return readdirSync(dir).flatMap((n) => {
    const r = join(dir, n);
    return statSync(r).isDirectory() ? ficherosDe(r) : (/\.(jsx?|mjs)$/.test(r) ? [r] : []);
  });
}
const importsDe = (f) => [...readFileSync(f, 'utf8').matchAll(/^import\s[^;]*?from\s+'([^']+)'|^import\s+'([^']+)'|^export\s[^;]*?from\s+'([^']+)'/gm)].map((m) => m[1] ?? m[2] ?? m[3]);

const motor = ficherosDe(join(RAIZ, 'src/motor'));
const app = ficherosDe(join(RAIZ, 'src/app'));

test('el motor no importa nada de la app, de React, de scripts ni de Node', () => {
  for (const f of motor) {
    for (const imp of importsDe(f)) {
      ok(imp.startsWith('.'), `${relative(RAIZ, f)} importa "${imp}": el motor solo importa del motor`);
      const destino = resolve(dirname(f), imp);
      ok(destino.startsWith(join(RAIZ, 'src/motor')), `${relative(RAIZ, f)} importa fuera del motor: ${imp}`);
    }
  }
});

test('no hay ciclos de importación en src/', () => {
  const grafo = new Map();
  for (const f of [...motor, ...app]) grafo.set(f, importsDe(f).filter((i) => i.startsWith('.')).map((i) => resolve(dirname(f), i)));
  const estado = new Map();
  const pila = [];
  const visitar = (f) => {
    if (estado.get(f) === 2) return;
    if (estado.get(f) === 1) throw new Error(`ciclo: ${[...pila.slice(pila.indexOf(f)), f].map((x) => relative(RAIZ, x)).join(' → ')}`);
    estado.set(f, 1); pila.push(f);
    for (const d of grafo.get(f) ?? []) if (grafo.has(d)) visitar(d);
    pila.pop(); estado.set(f, 2);
  };
  for (const f of grafo.keys()) visitar(f);
});

test('ningún fichero de src/ se llama igual que otro', () => {
  const vistos = new Map();
  for (const f of [...motor, ...app]) {
    const nombre = basename(f);
    if (nombre === 'index.js') continue;
    ok(!vistos.has(nombre), `${nombre} está en ${relative(RAIZ, vistos.get(f) ?? vistos.get(nombre) ?? '')} y en ${relative(RAIZ, f)}`);
    vistos.set(nombre, f);
  }
});

test('las carpetas de 2.x ya no existen', () => {
  for (const ruta of ['src/engine', 'src/components', 'src/App.jsx', 'src/i18n.js', 'scripts/test-engine.mjs', 'scripts/check-order.mjs', 'scripts/check-css.mjs', 'scripts/check-version.mjs']) {
    ok(!existsSync(join(RAIZ, ruta)), `${ruta} sigue en el repositorio: el código viejo se borra, no se deja al lado`);
  }
});

await terminar('app/dependencias');
