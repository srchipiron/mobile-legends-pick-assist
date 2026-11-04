/**
 * Revisar con las capturas del lector (3.86.0), en un Chrome de verdad con
 * el Supabase de pega: desde «Tus partidas» se abre la hoja, salen las diez
 * caras del draft que la tablet no leyó entero con lo leído en cada hueco, y
 * guardar arregla la partida (tu pick sin «supuesto», los dos equipos, con
 * la hora del arreglo para que llegue a la tablet). Un recorte con una
 * imagen que no es un PNG no sale.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar, abrirAjustes } from './navegador.mjs';
import { supabaseFalso } from '../fixtures/supabase-falso.mjs';
import { escribirPng } from '../../scripts/lector/png.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const SUPA = 'https://abcdefghijklmnopqrst.supabase.co';
const T = 1793222711480;
const LINEA = { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: ['Layla'], allies: [], bans: [], enemyRoam: null, fase: 'picks' } };
const PARTIDA = { t: T, pick: 'Floryn', supuesto: true, gane: true, rango: 'glory', origen: 'lector', recomendados: ['Floryn', 'Rafaela', 'Diggie'], draft: { linea: 'roam', enemigos: ['Clint', 'Khufra', 'Atlas', 'Franco'], aliados: ['Gord', 'Selena', 'Layla'] } };
// La composición de diez caras a un tercio, como la sube la tablet (140×283), de colores lisos.
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
const leer = (pagina, clave) => pagina.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), clave);

await prueba('las caras de cada hueco con lo leído; guardar arregla la partida y quita el «supuesto»', async () => {
  const s = supabaseFalso();
  s.recortes.push({ clave: 'L'.repeat(43), recibido: Date.now() - 3600000, d: { v: 1, partida: T, faltan: 3, capturas: [{ id: 'lectura-2026-10-28T21-02-27-027Z-1517', picks: PNG }], leidos } });
  // Otro con una «imagen» que no es un PNG, de una partida tuya: no sale.
  s.recortes.push({ clave: 'M'.repeat(43), recibido: Date.now() - 1000, d: { v: 1, partida: T + 1, capturas: [{ id: 'lectura-x', picks: 'PHN2ZyBvbmxvYWQ9YWxlcnQoMSk+' }], leidos } });
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { viewport: { width: 1280, height: 900 }, almacen: { ...LINEA, 'roam-picker:partidas': [PARTIDA, { ...PARTIDA, t: T + 1 }, { ...PARTIDA, t: T - 9e6, pick: 'Minotaur', supuesto: false }] }, sinServiceWorker: true, antes: conBaseDeDatos(s) });
  await abrirAjustes(pagina);
  await pagina.locator('.more').getByRole('button', { name: 'Partidas', exact: true }).click();
  await pagina.getByRole('button', { name: 'Revisar con las capturas del lector' }).click();
  await pagina.locator('.revisar-partida').first().waitFor();
  eq(await pagina.locator('.revisar-partida').count(), 1, 'sale el recorte sin PNG, o no sale el bueno');
  eq(await pagina.locator('.revisar-cara').count(), 10, 'no salen las diez caras');
  const fondo = await pagina.locator('.revisar-cara').nth(7).evaluate((el) => ({ img: window.getComputedStyle(el).backgroundImage.slice(0, 40), pos: window.getComputedStyle(el).backgroundPosition }));
  ok(fondo.img.startsWith('url("data:image/png;base64,iVBOR'), `la cara no es la captura: ${fondo.img}`);
  eq(fondo.pos, '-133px -238px', 'la cara del tercer enemigo no está en su sitio (a 1.280 px, la escala del ordenador)');
  eq(await pagina.getByLabel('Enemigos 1', { exact: true }).inputValue(), 'Clint', 'lo leído no está en su hueco');
  eq(await pagina.getByLabel('Tu equipo 4', { exact: true }).inputValue(), '', 'tu fila sale con el pick supuesto');
  ok(await pagina.locator('.revisar-hueco.tuyo').count() === 1, 'no se marca tu fila');
  // Sin tu héroe no se guarda.
  await pagina.getByRole('button', { name: 'Guardar' }).click();
  ok(/Falta tu héroe/.test(await pagina.locator('.revisar-partida .nota').textContent()), 'guarda sin tu héroe');
  // Tu hueco vacío trae tus más jugados (3.87.3): un toque lo rellena (aquí, Floryn es supuesto y no sale).
  const tuyos = pagina.getByRole('group', { name: 'Tus más jugados' });
  eq((await tuyos.getByRole('button').allTextContents()).join(), 'Minotaur', 'no salen tus más jugados, o sale un pick supuesto');
  await tuyos.getByRole('button', { name: 'Minotaur' }).click();
  eq(await pagina.getByLabel('Tu equipo 4', { exact: true }).inputValue(), 'Minotaur', 'el botón no rellena tu hueco');
  ok(!(await tuyos.count()), 'los botones siguen con tu hueco ya relleno');
  await pagina.getByLabel('Enemigos 3', { exact: true }).fill('Zilong');
  await pagina.getByLabel('Tu equipo 3', { exact: true }).fill('Rafaela');
  await pagina.getByRole('button', { name: 'Guardar' }).click();
  await pagina.waitForTimeout(300);
  // Arreglada deja de estar pendiente y sale de la lista: el «Guardada» va arriba y se ve (3.87.1).
  ok(await pagina.locator('.revisar-guardada').isVisible(), 'guardar no dice nada: la partida se va y su aviso con ella');
  const p = (await leer(pagina, 'roam-picker:partidas')).find((x) => x.t === T);
  eq(p.pick, 'Minotaur', 'tu pick no se guarda');
  ok(!p.supuesto, 'sigue como pick supuesto');
  eq(JSON.stringify(p.draft.enemigos), JSON.stringify(['Clint', 'Khufra', 'Zilong', 'Atlas', 'Franco']), 'los enemigos no se guardan');
  eq(JSON.stringify([...p.draft.aliados].sort()), JSON.stringify(['Gord', 'Layla', 'Rafaela', 'Selena']), 'los compañeros no se guardan');
  ok(Number.isFinite(p.editada), 'sin la hora del arreglo no llega a la tablet');
  eq(errores.length, 0, errores.join(' | '));
  await contexto.close();
});

await prueba('en el móvil, sin escribir (3.89.0): tocar la cara abre caras para elegir, y elegir salta al siguiente hueco vacío', async () => {
  const s = supabaseFalso();
  s.recortes.push({ clave: 'L'.repeat(43), recibido: Date.now() - 3600000, d: { v: 1, partida: T, faltan: 3, capturas: [{ id: 'lectura-2026-10-28T21-02-27-027Z-1517', picks: PNG }], leidos } });
  // Tus partidas de antes: juegas con alguien que lleva Tigreal (tu compañero de siempre) y tú con Minotaur.
  const antes = [1, 2, 3].map((k) => ({ ...PARTIDA, t: T - k * 9e6, pick: 'Minotaur', supuesto: false, draft: { ...PARTIDA.draft, aliados: ['Tigreal', 'Gord', 'Selena', 'Layla'] } }));
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { viewport: { width: 390, height: 844 }, almacen: { ...LINEA, 'roam-picker:partidas': [PARTIDA, ...antes] }, sinServiceWorker: true, antes: conBaseDeDatos(s) });
  await abrirAjustes(pagina);
  await pagina.locator('.more').getByRole('button', { name: 'Partidas', exact: true }).click();
  await pagina.getByRole('button', { name: 'Revisar con las capturas del lector' }).click();
  await pagina.locator('.revisar-partida').first().waitFor();
  // El tercer rival no se leyó: su cara es un botón y abre caras, sin teclado.
  await pagina.getByRole('button', { name: 'Captura de Enemigos 3', exact: true }).click();
  const elegir = pagina.locator('.revisar-elegir');
  await elegir.waitFor();
  ok(await elegir.locator('.hero-grid button').count() >= 12, 'no salen caras para elegir');
  ok(!(await elegir.locator('.hero-grid button').allTextContents()).some((n) => ['Clint', 'Khufra', 'Atlas', 'Franco', 'Gord'].includes(n.trim())), 'sale uno que ya está en el draft');
  await elegir.getByRole('searchbox').fill('zil');
  await elegir.getByRole('button', { name: 'Zilong' }).click();
  eq(await pagina.getByLabel('Enemigos 3', { exact: true }).inputValue(), 'Zilong', 'la cara elegida no va a su hueco');
  // Salta solo al siguiente vacío: el tercero de tu equipo, con tu compañero de siempre delante.
  eq(await pagina.locator('.revisar-elegir').count(), 1, 'quedan dos selectores abiertos, o ninguno');
  eq(await pagina.getByRole('button', { name: 'Captura de Tu equipo 3', exact: true }).getAttribute('aria-expanded'), 'true', 'no salta al siguiente hueco vacío');
  eq((await pagina.locator('.revisar-elegir .hero-grid button').first().textContent()).trim(), 'Tigreal', 'tu compañero de siempre no va el primero');
  await pagina.locator('.revisar-elegir .hero-grid button').first().click();
  eq(await pagina.getByLabel('Tu equipo 3', { exact: true }).inputValue(), 'Tigreal');
  // Y luego tu fila, con tus héroes delante.
  eq((await pagina.locator('.revisar-elegir .hero-grid button').first().textContent()).trim(), 'Minotaur', 'en tu fila no van tus héroes delante');
  await pagina.locator('.revisar-elegir .hero-grid button').first().click();
  eq(await pagina.locator('.revisar-elegir').count(), 0, 'con todo relleno sigue abierto');
  const ancho = await pagina.evaluate(() => document.querySelector('.revisar').scrollWidth - document.querySelector('.revisar').clientWidth);
  ok(ancho <= 1, `se sale del ancho del móvil (${ancho} px)`);
  await pagina.getByRole('button', { name: 'Guardar' }).click();
  await pagina.waitForTimeout(300);
  const p = (await leer(pagina, 'roam-picker:partidas')).find((x) => x.t === T);
  eq(p.pick, 'Minotaur', 'tu pick elegido con un toque no se guarda');
  eq(JSON.stringify(p.draft.enemigos), JSON.stringify(['Clint', 'Khufra', 'Zilong', 'Atlas', 'Franco']));
  ok(p.draft.aliados.includes('Tigreal'), 'el compañero elegido no se guarda');
  eq(errores.length, 0, errores.join(' | '));
  await contexto.close();
});

await prueba('las partidas sin resultado (3.89.4): sus pantallas del final y Gané/Perdí con un toque, solo las de tu lector', async () => {
  const s = supabaseFalso();
  const T2 = T + 3 * 3600000;
  const fin = (clave, t) => ({ clave, recibido: Date.now() - 1000, d: { v: 1, tipo: 'final', desde: t - 900000, motivo: 'vi la tabla del final pero no la reconozco', capturas: [{ id: 'fotograma-1', miniatura: PNG }], partida: { t, pick: 'Floryn', origen: 'lector', supuesto: true, recomendados: ['Floryn', 'Rafaela', 'Diggie'], draft: { linea: 'roam', enemigos: ['Clint', 'Khufra'], aliados: ['Gord'] }, bans: ['Atlas'] } } });
  s.recortes.push({ clave: 'L'.repeat(43), recibido: Date.now() - 3600000, d: { v: 1, partida: T, faltan: 3, capturas: [{ id: 'lectura-2026-10-28T21-02-27-027Z-1517', picks: PNG }], leidos } });
  s.recortes.push(fin('L'.repeat(43), T2));
  // Otra de otro lector (cualquiera con la clave pública puede subirla): no sale.
  s.recortes.push(fin('M'.repeat(43), T2 + 3600000));
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { viewport: { width: 390, height: 844 }, almacen: { ...LINEA, 'roam-picker:partidas': [PARTIDA] }, sinServiceWorker: true, antes: conBaseDeDatos(s) });
  await abrirAjustes(pagina);
  await pagina.locator('.more').getByRole('button', { name: 'Partidas', exact: true }).click();
  await pagina.getByRole('button', { name: 'Revisar con las capturas del lector' }).click();
  const seccion = pagina.locator('.revisar-sin-resultado');
  await seccion.waitFor();
  eq(await seccion.locator('.revisar-fin').count(), 1, 'sale la de otro lector, o no sale la tuya');
  ok(/Floryn/.test(await seccion.textContent()), 'no dice con quién jugaste');
  eq(await seccion.locator('img').count(), 1, 'no enseña la pantalla del final');
  await seccion.getByRole('button', { name: 'Perdí' }).click();
  await seccion.waitFor({ state: 'detached' });
  const p = (await leer(pagina, 'roam-picker:partidas')).find((x) => x.t === T2);
  ok(p && p.gane === false && p.pick === 'Floryn' && p.origen === 'lector' && p.supuesto === true && p.draft.enemigos.join() === 'Clint,Khufra' && p.bans.join() === 'Atlas', `la partida no se apunta con su draft y el resultado: ${JSON.stringify(p)}`);
  eq(errores.length, 0, errores.join(' | '));
  await contexto.close();
});

await prueba('sin base de datos el botón no sale', async () => {
  const { contexto, pagina } = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:partidas': [PARTIDA] }, sinServiceWorker: true, antes: async (p) => p.route(`${url}comunidad.json*`, (r) => r.fulfill({ status: 404, body: '' })) });
  await abrirAjustes(pagina);
  await pagina.getByRole('button', { name: 'Partidas', exact: true }).click();
  await pagina.waitForTimeout(300);
  eq(await pagina.getByRole('button', { name: 'Revisar con las capturas del lector' }).count(), 0);
  await contexto.close();
});

await navegador.close();
cerrar();
await terminar('interfaz/revisar');
