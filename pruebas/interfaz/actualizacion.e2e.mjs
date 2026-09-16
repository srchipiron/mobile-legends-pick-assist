/**
 * Que la app se actualice SOLA cuando sale una versión nueva.
 *
 * El service worker guarda la app entera para que funcione sin cobertura, y
 * el navegador solo comprueba si hay una nueva al navegar: con la pestaña
 * abierta desde hace horas te quedas con la de ayer. Pasó, y el diagnóstico
 * tenía que pedirte que cerraras y volvieras a abrir.
 *
 * `CLAUDE.md` llama a este mecanismo imprescindible y dice que se comprobó
 * «en un navegador de verdad, publicando una versión nueva con la pestaña
 * abierta: quitándolo, no se actualiza». Eso es justo lo que hace esta
 * prueba: compila DOS versiones, sirve la primera, deja que el worker tome
 * el control, cambia lo publicado por la segunda y comprueba que la pestaña
 * se pone al día sola. Con un `sw.js` de mentira no se comprobaría nada: el
 * fallo está en cuándo el navegador de verdad pregunta.
 */
import { spawnSync } from 'node:child_process';
import { createServer } from 'node:http';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { extname, join, normalize, resolve } from 'node:path';
import { abrirNavegador, prueba, ok, eq, terminar, RAIZ } from './navegador.mjs';

const TIPOS = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};
const tmp = mkdtempSync(join(tmpdir(), 'actualizacion-'));
const VERSION_NUEVA = '9.9.9';
const pkg = resolve(RAIZ, 'package.json');
const original = readFileSync(pkg, 'utf8');
const versionReal = JSON.parse(original).version;

/** Compila el repositorio a un directorio, opcionalmente con otra versión. */
function compilar(destino, version = null) {
  try {
    if (version) writeFileSync(pkg, original.replace(`"version": "${versionReal}"`, `"version": "${version}"`));
    const r = spawnSync('npx', ['vite', 'build', '--outDir', destino, '--emptyOutDir'], { cwd: RAIZ, encoding: 'utf8' });
    if (r.status !== 0) throw new Error(`no compila: ${(r.stderr || r.stdout || '').slice(-400)}`);
  } finally {
    // La versión del repositorio se restaura SIEMPRE, aunque la compilación
    // reviente: dejarla en 9.9.9 rompería el despliegue.
    if (version) writeFileSync(pkg, original);
  }
}

const dirA = join(tmp, 'vieja');
const dirB = join(tmp, 'nueva');
compilar(dirB, VERSION_NUEVA);
compilar(dirA);
eq(JSON.parse(readFileSync(pkg, 'utf8')).version, versionReal, 'la versión de package.json no se ha restaurado');
eq(JSON.parse(readFileSync(join(dirB, 'version.json'), 'utf8')).version, VERSION_NUEVA, 'la segunda compilación no lleva la versión nueva');

// Un servidor cuya raíz se puede cambiar en caliente: así «se publica» la
// versión nueva con la pestaña ya abierta, que es el caso que importa.
let raiz = dirA;
const srv = createServer(async (req, res) => {
  let p = decodeURIComponent(req.url.split('?')[0]);
  if (p === '/') p = '/index.html';
  try {
    const f = join(raiz, normalize(p).replace(/^(\.\.[/\\])+/, ''));
    res.writeHead(200, { 'Content-Type': TIPOS[extname(f)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(await readFile(f));
  } catch {
    res.writeHead(404); res.end();
  }
});
await new Promise((r) => srv.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${srv.address().port}/`;
const navegador = await abrirNavegador();

await prueba('la app se actualiza sola cuando sale una versión nueva', async () => {
  const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES' });
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(e.message));
  let recargas = 0;
  pagina.on('load', () => { recargas += 1; });
  await pagina.addInitScript(() => { localStorage.setItem('roam-picker:linea', JSON.stringify('roam')); });

  await pagina.goto(url, { waitUntil: 'networkidle' });
  // Sin worker al mando no hay nada que comprobar: la app se estaría
  // sirviendo de la red y se actualizaría sola por definición.
  await pagina.waitForFunction(() => navigator.serviceWorker.controller != null, { timeout: 20000 });
  await pagina.waitForTimeout(500);
  const pie = () => pagina.locator('.pie-version').textContent();
  eq((await pie()).trim(), `v${versionReal}`, 'la pestaña no arranca con la versión publicada');
  const recargasIniciales = recargas;

  // Se publica la nueva con la pestaña abierta.
  raiz = dirB;
  // Volver a la app: es cuando `useActualizacion` pregunta.
  await pagina.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await pagina.waitForTimeout(200);
  await pagina.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });

  await pagina.waitForFunction((v) => document.querySelector('.pie-version')?.textContent?.includes(v), VERSION_NUEVA, { timeout: 30000 })
    .catch(() => { throw new Error(`la app NO se ha actualizado sola: el pie sigue diciendo ${JSON.stringify(pagina.url())}`); });
  eq((await pie()).trim(), `v${VERSION_NUEVA}`, 'el pie no enseña la versión nueva');
  ok(recargas > recargasIniciales, 'la versión nueva aparece sin que la página se haya recargado');

  // Y no se queda recargando: una sola vez y para.
  //
  // OJO con lo que esto comprueba y lo que no: verificado por mutación, quitar
  // el pestillo `yaRecargado` de useActualizacion.js NO hace fallar esta
  // prueba, porque tras la recarga el hook se monta de cero y el pestillo
  // vuelve a empezar. El caso que el pestillo cubre —un navegador que
  // reinstala el worker y dispara `controllerchange` varias veces dentro de
  // la misma vida de la página— no se sabe simular aquí de forma fiel, así
  // que sigue sin prueba y conviene saberlo antes de tocarlo.
  const tras = recargas;
  await pagina.waitForTimeout(2500);
  eq(recargas, tras, `la página se ha recargado ${recargas - tras} veces más tras ponerse al día`);
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await prueba('con una hoja abierta no se recarga: esperaría a que se cierre', async () => {
  // Medido en su día: una actualización con «Tu maestría» abierta perdía lo
  // escrito. Por eso la recarga se aplaza mientras haya un [role=dialog].
  raiz = dirA;
  const contexto = await navegador.newContext({ viewport: { width: 390, height: 844 }, locale: 'es-ES' });
  const pagina = await contexto.newPage();
  await pagina.addInitScript(() => {
    localStorage.setItem('roam-picker:linea', JSON.stringify('roam'));
    localStorage.setItem('roam-picker:draft', JSON.stringify({ enemies: ['Layla'], allies: [], bans: [], enemyRoam: null, fase: 'picks' }));
  });
  await pagina.goto(url, { waitUntil: 'networkidle' });
  await pagina.waitForFunction(() => navigator.serviceWorker.controller != null, { timeout: 20000 });
  await pagina.waitForTimeout(400);

  // Se abre «Tu maestría» y se escribe algo.
  await pagina.locator('.more summary').click(); await pagina.waitForTimeout(200);
  await pagina.locator('.more .tools .reset').nth(0).click(); await pagina.waitForTimeout(400);
  eq(await pagina.locator('[role=dialog]').count(), 1, 'no se ha abierto la hoja de maestría');
  await pagina.locator('.mastery-row:not(.head)').first().locator('input').first().fill('123');

  raiz = dirB;
  await pagina.evaluate(() => { Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await pagina.waitForTimeout(6000);
  eq(await pagina.locator('[role=dialog]').count(), 1, 'la hoja se ha cerrado: la app se recargó con lo escrito dentro');
  eq(await pagina.locator('.mastery-row:not(.head)').first().locator('input').first().inputValue(), '123', 'se ha perdido lo escrito en la hoja');

  // Al cerrarla, se pone al día sin que nadie haga nada.
  await pagina.getByRole('button', { name: 'Cancelar' }).click();
  await pagina.waitForFunction((v) => document.querySelector('.pie-version')?.textContent?.includes(v), VERSION_NUEVA, { timeout: 30000 })
    .catch(() => { throw new Error('al cerrar la hoja la app no se actualiza: la recarga aplazada no llega nunca'); });
  await contexto.close();
});

await terminar('interfaz/actualizacion');
await navegador.close();
await new Promise((r) => srv.close(r));
rmSync(tmp, { recursive: true, force: true });
