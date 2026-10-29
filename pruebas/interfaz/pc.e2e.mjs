/**
 * El modo ordenador (3.87.0), en un Chrome de verdad: a 1.440 px lo de
 * «Ajustes» está a la vista (la barra) y en el móvil no sale; E, A y B
 * abren el selector de su bando, pero no escribiendo en un campo; y
 * `#capturas` abre la app SOLO en «Capturas», donde se pega la clave del
 * móvil, se traen tus partidas y salen sus caras más grandes que en el móvil.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar } from './navegador.mjs';
import { supabaseFalso } from '../fixtures/supabase-falso.mjs';
import { escribirPng } from '../../scripts/lector/png.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const PC = { width: 1440, height: 900 };
const SUPA = 'https://abcdefghijklmnopqrst.supabase.co';
const T = 1793222711480;
const CLAVE = 'J'.repeat(43);
const PICKS = { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: ['Layla'], allies: [], bans: [], enemyRoam: null, fase: 'picks' } };
const PARTIDA = { t: T, pick: 'Floryn', supuesto: true, gane: true, rango: 'glory', origen: 'lector', recomendados: ['Floryn'], draft: { linea: 'roam', enemigos: ['Clint', 'Khufra', 'Atlas', 'Franco'], aliados: ['Gord', 'Selena', 'Layla'] } };
const ancho = 140, alto = 283, rgba = new Uint8Array(ancho * alto * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 7) % 255));
const PNG = escribirPng({ ancho, alto, rgba }).toString('base64');
const leidos = { enemigos: ['Clint', 'Khufra', null, 'Atlas', 'Franco'], aliados: ['Gord', 'Selena', null, null, 'Layla'], tuyoFila: 3, baneos: [] };

const conBaseDeDatos = (s) => async (p) => {
  await p.route(`${url}comunidad.json*`, (ruta) => ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: SUPA, clave: s.clavePublica }) }));
  await p.route(`${SUPA}/**`, async (ruta) => {
    const r = ruta.request();
    if (r.method() === 'OPTIONS') { await ruta.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST' } }); return; }
    const m = r.url().match(/\/rest\/v1\/rpc\/(\w+)$/);
    const res = m ? s.atender(m[1], JSON.parse(r.postData() ?? '{}'), r.headers()) : { status: 404, cuerpo: {} };
    await ruta.fulfill({ status: res.status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(res.cuerpo) });
  });
};

await prueba('en el ordenador, lo de «Ajustes» a la vista; en el móvil, no', async () => {
  const s = supabaseFalso();
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { viewport: PC, almacen: PICKS, sinServiceWorker: true, antes: conBaseDeDatos(s) });
  const barra = pagina.locator('.barra-pc');
  ok(await barra.isVisible(), 'no sale la barra a 1.440 px');
  await barra.getByRole('button', { name: 'Capturas del lector' }).click();
  await pagina.locator('.revisar').waitFor();
  await pagina.keyboard.press('Escape');
  await pagina.locator('.revisar').waitFor({ state: 'detached' });
  await barra.getByRole('button', { name: 'Partidas' }).click();
  await pagina.getByRole('button', { name: 'Revisar con las capturas del lector' }).waitFor();
  await pagina.keyboard.press('Escape');
  await pagina.setViewportSize({ width: 390, height: 844 });
  await pagina.waitForTimeout(200);
  ok(!(await barra.isVisible()), 'la barra sale en el móvil y baja la nº1');
  eq(errores.length, 0, errores.join(' | '));
  await contexto.close();
});

await prueba('E, A y B abren su selector; escribiendo en un campo, no', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { viewport: PC, almacen: PICKS, sinServiceWorker: true });
  const activa = () => pagina.locator('.sheet-bandos [aria-selected="true"], .sheet-bandos .activo').first().textContent();
  await pagina.keyboard.press('e');
  await pagina.locator('.sheet-bandos').waitFor();
  ok(/Enemigos/.test(await activa()), 'E no abre los enemigos');
  // Dentro, escribir busca e Intro elige: «Ti» + Intro mete a Tigreal.
  await pagina.keyboard.type('Tigr');
  await pagina.keyboard.press('Enter');
  await pagina.keyboard.press('Escape');
  await pagina.locator('.sheet').waitFor({ state: 'detached' });
  const draft = await pagina.evaluate(() => JSON.parse(localStorage.getItem('roam-picker:draft')));
  ok(draft.enemies.includes('Tigreal'), `escribir e Intro no mete al enemigo: ${JSON.stringify(draft.enemies)}`);
  await pagina.keyboard.press('a');
  await pagina.locator('.sheet-bandos').waitFor();
  ok(/Tu equipo/.test(await activa()), 'A no abre tu equipo');
  await pagina.keyboard.press('Escape');
  await pagina.locator('.sheet').waitFor({ state: 'detached' });
  // Escribiendo en un campo fuera de una hoja (el código de la tablet, en Ajustes), las letras son letras.
  await pagina.locator('.more > summary').click();
  const codigo = pagina.getByLabel('Código', { exact: true }).first();
  await codigo.click();
  await pagina.keyboard.type('ABE');
  await pagina.waitForTimeout(200);
  eq(await pagina.locator('.sheet').count(), 0, 'escribir en el código de la tablet abre un selector');
  eq(await codigo.inputValue(), 'ABE', 'las letras no llegan al campo');
  await codigo.blur();
  // Con Control (copiar, pegar) no abre nada.
  await pagina.keyboard.press('Control+a');
  await pagina.waitForTimeout(200);
  eq(await pagina.locator('.sheet').count(), 0, 'Control+A abre un selector');
  eq(errores.length, 0, errores.join(' | '));
  await contexto.close();
});

await prueba('#capturas abre solo «Capturas»: pegas la clave, se traen tus partidas y salen sus caras en grande', async () => {
  const s = supabaseFalso();
  s.atender('subir_partidas', { clave: CLAVE, lote: [PARTIDA] }, { apikey: s.clavePublica });
  s.recortes.push({ clave: 'L'.repeat(43), recibido: Date.now() - 3600000, d: { v: 1, partida: T, faltan: 3, capturas: [{ id: 'lectura-2026-10-28T21-02-27-027Z-1517', picks: PNG }], leidos } });
  // Un ordenador nuevo: sin línea, sin partidas, sin clave.
  const { contexto, pagina, errores } = await paginaCon(navegador, `${url}#capturas`, { viewport: PC, sinServiceWorker: true, antes: conBaseDeDatos(s) });
  await pagina.locator('.revisar').waitFor();
  eq(await pagina.locator('.draft').count(), 0, 'detrás de «Capturas» está la app entera');
  ok((await pagina.locator('.revisar-enlace a').getAttribute('href')).endsWith('#capturas'), 'el enlace para el ordenador no lleva a «Capturas»');
  await pagina.getByLabel('Tu clave de jugador').fill(CLAVE);
  await pagina.getByRole('button', { name: 'Usar esta clave' }).click();
  await pagina.locator('.revisar-partida').first().waitFor();
  ok(/Traídas|traídas|partida/.test(await pagina.locator('.revisar [role=status]').first().textContent()), 'no dice que se trajeron');
  const pos = await pagina.locator('.revisar-cara').nth(7).evaluate((el) => window.getComputedStyle(el).backgroundPosition);
  eq(pos, '-133px -238px', 'las caras no salen a la escala del ordenador');
  await pagina.getByRole('button', { name: 'Ver la captura entera' }).click();
  ok(await pagina.locator('img.revisar-entera').isVisible(), 'no sale la captura entera');
  // Cerrar deja la app normal (aquí, elegir línea) y sin el #capturas.
  await pagina.getByRole('button', { name: 'Cerrar' }).click();
  await pagina.locator('.revisar').waitFor({ state: 'detached' });
  ok(!(await pagina.evaluate(() => window.location.hash)), 'el #capturas sigue: recargar te mete otra vez');
  eq(errores.length, 0, errores.join(' | '));
  await contexto.close();
});

await navegador.close();
cerrar();
await terminar('interfaz/pc');
