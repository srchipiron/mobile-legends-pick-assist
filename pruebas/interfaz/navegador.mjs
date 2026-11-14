/**
 * Las pruebas de interfaz abren la app COMPILADA (dist/) en un Chrome de
 * verdad con playwright-core, sin descargar navegador: en local el que diga
 * PLAYWRIGHT_CHROME (o el de /opt/pw-browsers) y en el runner de GitHub el
 * Chrome del sistema (`channel: 'chrome'`). Corren con `node --test`: un
 * proceso por fichero y, dentro, una prueba detrás de otra; lo que se abre
 * se cierra en un `after()`.
 *
 * El servidor sirve dist/ por HTTP en 127.0.0.1 con un puerto libre: el
 * service worker solo funciona sobre http en localhost.
 */
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { chromium } from 'playwright-core';
import { RAIZ } from '../ayuda.mjs';

export { test, after } from 'node:test';
export { ok, eq, casi, leerJson, RAIZ } from '../ayuda.mjs';

const DIST = process.env.PRUEBAS_DIST ?? join(RAIZ, 'dist');
const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.svg': 'image/svg+xml', '.webmanifest': 'application/manifest+json',
};

/** Sirve una carpeta compilada (dist/ por defecto) sin caché. */
export async function servirDist(carpeta = DIST) {
  const srv = createServer(async (req, res) => {
    let p = decodeURIComponent(req.url.split('?')[0]);
    if (p === '/') p = '/index.html';
    try {
      const cuerpo = await readFile(join(carpeta, p));
      res.writeHead(200, { 'Content-Type': MIME[extname(p)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
      res.end(cuerpo);
    } catch {
      res.writeHead(404); res.end();
    }
  });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  return { url: `http://127.0.0.1:${srv.address().port}/`, cerrar: () => new Promise((r) => { srv.closeAllConnections?.(); srv.close(r); }) };
}

function ejecutableLocal() {
  if (process.env.PLAYWRIGHT_CHROME) return process.env.PLAYWRIGHT_CHROME;
  for (const c of ['chromium', 'chromium-1243/chrome-linux64/chrome', 'chromium-1194/chrome-linux/chrome']) {
    const ruta = join('/opt/pw-browsers', c);
    if (existsSync(ruta)) return ruta;
  }
  return null;
}

export async function abrirNavegador() {
  const ejecutable = ejecutableLocal();
  return ejecutable ? chromium.launch({ executablePath: ejecutable }) : chromium.launch({ channel: 'chrome' });
}

/**
 * Una página nueva con el estado guardado que se pida (las claves
 * `roam-picker:*`), ya cargada y en reposo. Se siembra UNA vez por contexto
 * (un pestillo en sessionStorage): `addInitScript` corre también al recargar,
 * y sin él una prueba de «persiste al recargar» comprobaría su propia siembra.
 *
 * @param tactil            un móvil de verdad (pantalla táctil, puntero grueso)
 * @param sinServiceWorker  para que `route` vea TODAS las peticiones (las del service worker no pasan)
 * @param antes             (pagina) para interceptar peticiones antes de cargar
 */
export async function paginaCon(navegador, url, { viewport = { width: 390, height: 844 }, locale = 'es-ES', almacen = {}, antes = null, esperar = 'networkidle', tactil = false, sinServiceWorker = false, escala = null } = {}) {
  const contexto = await navegador.newContext({ viewport, locale, ...(escala ? { deviceScaleFactor: escala } : {}), ...(tactil ? { hasTouch: true, isMobile: true } : {}), ...(sinServiceWorker ? { serviceWorkers: 'block' } : {}) });
  const pagina = await contexto.newPage();
  if (antes) await antes(pagina);
  const errores = [];
  pagina.on('pageerror', (e) => errores.push(e.message));
  await pagina.addInitScript((datos) => {
    try {
      if (sessionStorage.getItem('__sembrado')) return;
      sessionStorage.setItem('__sembrado', '1');
    } catch { /* sin sessionStorage: se siembra igual */ }
    for (const [clave, valor] of Object.entries(datos)) localStorage.setItem(clave, JSON.stringify(valor));
  }, almacen);
  await pagina.goto(url, { waitUntil: esperar });
  await pagina.waitForTimeout(500);
  return { contexto, pagina, errores };
}

/** Ancho desplazable de la página: sin desborde horizontal tiene que ser el del viewport. */
export const anchoDePagina = (pagina) => pagina.evaluate(() => document.scrollingElement.scrollWidth);

/** Abre el desplegable de Ajustes si está cerrado (tocarlo abierto lo cierra). */
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

/** Lo guardado en una clave `roam-picker:*`. */
export const leerGuardado = (pagina, clave = 'roam-picker:draft') => pagina.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), clave);

/** Espera (sondeando) a que `cond()` sea cierta; devuelve si lo fue antes del plazo. */
export async function esperarA(cond, { plazoMs = 15000, cadaMs = 200 } = {}) {
  const hasta = Date.now() + plazoMs;
  while (Date.now() < hasta) {
    if (await cond()) return true;
    await new Promise((r) => setTimeout(r, cadaMs));
  }
  return !!(await cond());
}
