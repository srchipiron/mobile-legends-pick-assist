/**
 * Los guardarraíles de `npm test` comprobados rompiendo lo que vigilan: un
 * `check-css` con la expresión muerta y un `check-order` que no veía
 * `const [x] =` pasaron años sin cazar nada. Cada script acepta una ruta por
 * argumento y aquí se le da un fichero roto a propósito.
 */
import { mkdtempSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test, ok, eq, terminar, RAIZ, leerTexto } from '../arnes.mjs';

const correr = (script, args) => spawnSync(process.execPath, [join(RAIZ, 'scripts/comprobar', script), ...args], { cwd: RAIZ, encoding: 'utf8' });
const tmp = mkdtempSync(join(tmpdir(), 'comprobar-'));

test('orden.mjs caza un uso antes de declarar, también desestructurado y con let, y no se queja de una flecha', () => {
  const roto = join(tmp, 'roto.jsx');
  writeFileSync(roto, 'export function A() {\n  const [a, setA] = useState(v);\n  const v = useMemo(() => 1, []);\n  return a;\n}\n');
  eq(correr('orden.mjs', [roto]).status, 1, 'no ve el useState que lee un useMemo de más abajo');
  writeFileSync(roto, 'export function A() {\n  let b = x + 1;\n  let x = 2;\n  return b;\n}\n');
  eq(correr('orden.mjs', [roto]).status, 1, 'no ve un let usado antes');
  const bien = join(tmp, 'bien.jsx');
  writeFileSync(bien, 'const f = (n) => n + 1;\nexport function B() {\n  const n = f(1);\n  const g = (n) => n * 2;\n  return g(n);\n}\n');
  eq(correr('orden.mjs', [bien]).status, 0, 'se queja de un parámetro de flecha que se llama como una variable de fuera');
  // Sobre la app de verdad, en verde: si no, npm test no arrancaría.
  eq(correr('orden.mjs', [join(RAIZ, 'src')]).status, 0, 'la app tiene un uso antes de declarar');
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

await terminar('scripts/comprobar');
