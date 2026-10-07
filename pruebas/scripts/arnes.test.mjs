/**
 * El arnés de las pruebas, probado como lo usa `correr.mjs`: un proceso por
 * fichero y lo que manda es el CÓDIGO DE SALIDA. Una prueba declarada
 * después de `terminar()` no se esperaba y, si fallaba tarde, el código ya
 * estaba puesto a 0: pasó en app/lector desde 3.44.0 hasta 3.46.1.
 */
import { mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';

const arnes = pathToFileURL(join(RAIZ, 'pruebas/arnes.mjs')).href;
const correr = (cuerpo) => {
  const f = join(mkdtempSync(join(tmpdir(), 'arnes-')), 'x.test.mjs');
  writeFileSync(f, `import { test, ok, terminar } from '${arnes}';\n${cuerpo}\n`);
  return spawnSync(process.execPath, [f], { encoding: 'utf8' });
};

test('una prueba asíncrona que falla tarde tumba el fichero', () => {
  const r = correr("test('tarde', async () => { await new Promise((s) => setTimeout(s, 50)); ok(false, 'mal'); });\nawait terminar('x');");
  eq(r.status, 1, `una prueba asíncrona que falla sale con ${r.status}`);
});

test('una prueba declarada DESPUÉS de terminar() es un fallo, no una prueba que no se mira', () => {
  const r = correr("test('antes', () => {});\nterminar('x');test('despues', async () => { await new Promise((s) => setTimeout(s, 50)); ok(false, 'mal'); });");
  eq(r.status, 1, `una prueba tras terminar() pasa en silencio (salida ${r.status})`);
  ok(/terminar/.test(r.stderr), `no dice por qué: ${r.stderr}`);
  const bien = correr("test('una', () => {});\nawait terminar('x');");
  eq(bien.status, 0, `un fichero sano falla: ${bien.stderr}`);
});

await terminar('scripts/arnes');
