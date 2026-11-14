/**
 * Los guardarraíles de `npm test` comprobados rompiendo lo que vigilan: un
 * `check-css` con la expresión muerta y un `check-order` que no veía
 * `const [x] =` pasaron años sin cazar nada. Cada script acepta una ruta por
 * argumento y aquí se le da un fichero roto a propósito; las reglas de ESLint
 * que sustituyen a `orden.mjs` (4.0), con texto roto.
 */
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test, ok, eq, RAIZ, leerTexto } from '../ayuda.mjs';

const correr = (script, args) => spawnSync(process.execPath, [join(RAIZ, 'scripts/comprobar', script), ...args], { cwd: RAIZ, encoding: 'utf8' });
const tmp = mkdtempSync(join(tmpdir(), 'comprobar-'));

test('ESLint caza un uso antes de declarar (también desestructurado y con let), un import impuro en el motor y un umbral de cruce a mano', async () => {
  // Sustituye a comprobar/orden.mjs (4.0): se rompe a propósito con los mismos casos que él cazaba.
  const { ESLint } = await import('eslint');
  const eslint = new ESLint({ cwd: RAIZ });
  const fallos = async (texto, ruta) => (await eslint.lintText(texto, { filePath: join(RAIZ, ruta) }))[0].messages.map((m) => m.ruleId);
  ok((await fallos('export function A() {\n  const [a] = useState(v);\n  const v = useMemo(() => 1, []);\n  return a;\n}\nconst useState = (x) => [x];\nconst useMemo = (f) => f();\n', 'src/app/x.jsx')).includes('no-use-before-define'),
    'no ve el useState que lee un useMemo de más abajo');
  ok((await fallos('export function A() {\n  let b = x + 1;\n  let x = 2;\n  return b;\n}\n', 'src/app/x.js')).includes('no-use-before-define'), 'no ve un let usado antes');
  eq((await fallos('const f = (n) => n + 1;\nexport function B() {\n  const n = f(1);\n  const g = (n) => n * 2;\n  const h = () => z;\n  const z = 3;\n  return g(n) + h();\n}\n', 'src/app/x.js')).length, 0,
    'se queja de una flecha que nombra lo de más abajo, que es como se escriben los efectos');
  ok((await fallos("import React from 'react';\nexport const a = React;\n", 'src/motor/x.js')).includes('no-restricted-imports'), 'el motor puede importar React');
  ok((await fallos("import { leer } from '../app/estado/almacen.js';\nexport const a = leer;\n", 'src/motor/x.js')).includes('no-restricted-imports'), 'el motor puede importar de la app');
  ok((await fallos('export const malo = (c) => c >= 0.53;\n', 'src/motor/x.js')).includes('no-restricted-syntax'), 'un 0,53 escrito a mano en el motor pasa');
  eq((await fallos('export const bien = (c, r) => c > 0.5 && r > 0.6;\n', 'src/motor/x.js')).length, 0, 'se queja de 0,5 o de un umbral que no es de cruce');
});

test('css.mjs caza una regla normal después del primer @media, una clase sin estilo y la × oculta', () => {
  const css = leerTexto('src/styles.css');
  const conTardia = join(tmp, 'tardia.css');
  writeFileSync(conTardia, `${css}\n.slot { color: red; }\n`);
  eq(correr('css.mjs', [conTardia]).status, 1, 'no ve una regla normal escrita después del primer @media');
  const sinX = join(tmp, 'sin-x.css');
  writeFileSync(sinX, css.replace(/(\.slot \.x\s*\{)/, '$1 display: none;'));
  eq(correr('css.mjs', [sinX]).status, 1, 'no ve la × de quitar un pick oculta');
  const dir = join(tmp, 'jsx'); mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, 'X.jsx'), 'export const X = () => <div className="clase-que-no-existe" />;\n');
  eq(correr('css.mjs', [join(RAIZ, 'src/styles.css'), dir]).status, 1, 'no ve una clase que la interfaz usa y el CSS no tiene');
  eq(correr('css.mjs', []).status, 0, 'el CSS de verdad no pasa');
});

test('version.mjs exige la versión de package.json en el CHANGELOG', () => {
  const r = correr('version.mjs', []);
  eq(r.status, 0, `la versión actual no está documentada: ${r.stderr}`);
  const src = leerTexto('scripts/comprobar/version.mjs');
  ok(/texto\.length < 20/.test(src), 'ya no exige que la entrada diga algo');
});
