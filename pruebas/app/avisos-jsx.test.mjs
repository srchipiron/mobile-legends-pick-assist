/**
 * Lo que el compilador AVISA y no rompe. Un atributo repetido en un
 * elemento JSX (`lectorAuto={…} … lectorAuto={…}`, en App.jsx de 3.28.0
 * a 3.36.0) compila, gana el último y nadie se entera: ESLint no lo mira
 * (no lleva el plugin de React) y Vite lo dice en un aviso que solo sale
 * en el registro de la compilación. Aquí cada fichero de `src/` pasa por
 * esbuild (el mismo que usa Vite) y cualquier aviso es un fallo.
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { transformSync } from 'esbuild';
import { test, ok, terminar, RAIZ } from '../arnes.mjs';

const ficheros = (dir) => readdirSync(dir).flatMap((n) => {
  const ruta = join(dir, n);
  return statSync(ruta).isDirectory() ? ficheros(ruta) : /\.(jsx?|mjs)$/.test(n) ? [ruta] : [];
});

test('ningún fichero de src/ compila con avisos (atributos repetidos, claves repetidas…)', () => {
  const lista = ficheros(join(RAIZ, 'src'));
  ok(lista.length > 30, `solo ${lista.length} ficheros en src/: ¿se ha movido la carpeta?`);
  const avisos = [];
  for (const f of lista) {
    const { warnings } = transformSync(readFileSync(f, 'utf8'), { loader: 'jsx', sourcefile: f, logLevel: 'silent' });
    for (const w of warnings) avisos.push(`${relative(RAIZ, f)}:${w.location?.line ?? '?'} ${w.text}`);
  }
  ok(!avisos.length, `avisos del compilador:\n  ${avisos.join('\n  ')}`);
});

await terminar('app/avisos-jsx');
