/**
 * Las pruebas de interfaz abren la app COMPILADA (dist/) en un Chrome de
 * verdad con playwright-core, que no descarga navegador: en local se usa el
 * que diga PLAYWRIGHT_CHROME (o el de /opt/pw-browsers si existe) y en el
 * runner de GitHub el Chrome del sistema (`channel: 'chrome'`).
 *
 * El servidor sirve dist/ por HTTP en 127.0.0.1 con un puerto libre: la app
 * registra un service worker, y eso solo funciona sobre http en localhost.
 */
import { chromium } from 'playwright-core';
import { test } from '../arnes.mjs';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
const DIST = process.env.PRUEBAS_DIST ?? resolve(RAIZ, 'dist');

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};

export async function servirDist() {
  const srv = createServer(async (req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    try {
      const cuerpo = await readFile(join(DIST, p));
      res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(cuerpo);
    } catch {
      res.writeHead(404); res.end();
    }
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${srv.address().port}/`;
  return { url, cerrar: () => new Promise((r) => srv.close(r)) };
}

function ejecutableLocal() {
  if (process.env.PLAYWRIGHT_CHROME) return process.env.PLAYWRIGHT_CHROME;
  const base = '/opt/pw-browsers';
  if (!existsSync(base)) return null;
  const candidatos = ['chromium-1194/chrome-linux/chrome', 'chromium/chrome-linux/chrome'];
  for (const c of candidatos) if (existsSync(join(base, c))) return join(base, c);
  return null;
}

export async function abrirNavegador() {
  const ejecutable = ejecutableLocal();
  if (ejecutable) return chromium.launch({ executablePath: ejecutable });
  // Runner de GitHub (ubuntu-latest trae Google Chrome).
  return chromium.launch({ channel: 'chrome' });
}

/**
 * Una página nueva con el estado guardado que se pida (las claves
 * roam-picker:* de siempre), ya cargada y en reposo.
 */
export async function paginaCon(navegador, url, { viewport = { width: 390, height: 844 }, locale = 'es-ES', almacen = {} } = {}) {
  const contexto = await navegador.newContext({ viewport, locale });
  const pagina = await contexto.newPage();
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(e.message));
  // Se siembra UNA vez por contexto, no en cada navegación: `addInitScript`
  // corre también al recargar, así que sin el pestillo una recarga devolvía
  // los valores sembrados y tapaba lo que la app hubiera guardado. Una prueba
  // que recargue para comprobar que algo persiste estaría comprobando el
  // sembrado.
  await pagina.addInitScript((datos) => {
    try {
      if (sessionStorage.getItem('__sembrado')) return;
      sessionStorage.setItem('__sembrado', '1');
    } catch { /* sin sessionStorage: se siembra igual */ }
    for (const [clave, valor] of Object.entries(datos)) localStorage.setItem(clave, JSON.stringify(valor));
  }, almacen);
  await pagina.goto(url, { waitUntil: 'networkidle' });
  await pagina.waitForTimeout(500);
  return { contexto, pagina, errores };
}

/** El mismo `test/ok/eq` que el arnés, pero para ficheros e2e que abren un navegador. */
export { test, ok, eq, casi, terminar, leerJson } from '../arnes.mjs';

/**
 * Una prueba de navegador, en SERIE: las del arnés arrancan todas a la vez
 * (registran la promesa y siguen), y diez contextos de Chrome a la vez en
 * un runner de dos núcleos son tiempos de espera que fallan por azar. Aquí
 * se espera a que acabe y luego se anota el resultado en el arnés.
 */
export async function prueba(nombre, fn) {
  let error = null;
  try { await fn(); } catch (e) { error = e; }
  test(nombre, () => { if (error) throw error; });
}

/** Ancho desplazable de la página: sin desborde horizontal tiene que ser el del viewport. */
export const anchoDePagina = (pagina) => pagina.evaluate(() => document.scrollingElement.scrollWidth);

/** Abre el desplegable de Ajustes si está cerrado (tocarlo estando abierto lo cierra). */
export async function abrirAjustes(pagina) {
  if (!(await pagina.locator('.more').evaluate((e) => e.open))) {
    await pagina.locator('.more summary').click();
    await pagina.waitForTimeout(200);
  }
}

/** Elige un héroe en el selector abierto escribiendo su nombre y tocando el primero. */
export async function elegirEnSelector(pagina, nombre) {
  await pagina.locator('.sheet input').fill(nombre);
  await pagina.waitForTimeout(150);
  await pagina.locator('.hero-grid button', { hasText: nombre }).first().click();
  await pagina.waitForTimeout(250);
}
