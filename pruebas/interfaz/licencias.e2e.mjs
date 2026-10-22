/**
 * Las claves de invitación (3.65.0), en un Chrome de verdad sobre la app
 * compilada, con `licencias.json` y la API de GitHub SIMULADOS: con clave
 * exigida, sin clave no se entra; el enlace con la clave deja entrar y se va
 * de la barra; una clave revocada no vale; y la administración (solo con el
 * token) crea la clave de administrador, publica solo la parte pública y da
 * claves que la app acepta.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar, abrirAjustes } from './navegador.mjs';
import { crearClaveDeAdministrador, firmarClave, comprobarClave, sanearLicencias } from '../../src/app/licencia.js';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const TOKEN = 'github_pat_PRUEBA_0123456789abcdefghij';
const LINEA = { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: ['Layla'], allies: [], bans: [], enemyRoam: null, fase: 'picks' } };
const admin = await crearClaveDeAdministrador();
const buena = await firmarClave({ nombre: 'Lucía', privada: admin.privada });
const { datos: deBuena } = await comprobarClave(buena, { publica: admin.publica });
const esperar = async (cond, ms = 9000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 200)); } return cond(); };

/** licencias.json de mentira (el service worker bloqueado: si no, sus peticiones no pasan por aquí). */
const conLicencias = (licencias) => (p) => p.route(`${url}licencias.json*`, (ruta) => ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(licencias) }));
const EXIGIDA = sanearLicencias({ publica: admin.publica, exigir: true });
const enLaPuerta = (pagina) => pagina.locator('main.puerta').count().then((n) => n === 1);
const enLaApp = (pagina) => pagina.locator('.app').count().then((n) => n > 0);

await prueba('con clave exigida y sin clave, se ve la puerta y no la app; una clave mala se dice y una buena deja entrar', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: LINEA, sinServiceWorker: true, antes: conLicencias(EXIGIDA) });
  ok(await esperar(() => enLaPuerta(pagina)), 'sin clave no sale la puerta');
  ok(!(await enLaApp(pagina)), 'sin clave se ve la app');
  await pagina.getByRole('textbox', { name: 'Tu clave o tu enlace' }).fill('hola');
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  ok(await esperar(async () => (await pagina.getByRole('alert').textContent().catch(() => '')).includes('no es una clave')), 'una clave mala no dice nada');
  // Pegar el ENLACE entero también vale.
  await pagina.getByRole('textbox', { name: 'Tu clave o tu enlace' }).fill(`https://srchipiron.github.io/mobile-legends-pick-assist/#clave=${buena}`);
  await pagina.getByRole('button', { name: 'Entrar' }).click();
  ok(await esperar(() => enLaApp(pagina)), 'con una clave buena no se entra');
  eq(await pagina.evaluate(() => JSON.parse(localStorage.getItem('roam-picker:clave'))), buena, 'la clave no se guarda');
  eq(errores.length, 0, `errores: ${errores.join(' | ')}`);
  await contexto.close();
});

await prueba('el enlace con la clave deja entrar, la guarda y se va de la barra de direcciones; una revocada no vale', async () => {
  const { contexto, pagina } = await paginaCon(navegador, `${url}#clave=${buena}`, { almacen: LINEA, sinServiceWorker: true, antes: conLicencias(EXIGIDA) });
  ok(await esperar(() => enLaApp(pagina)), 'con el enlace no se entra');
  ok(!(await pagina.evaluate(() => location.hash)).includes('clave'), 'la clave se queda en la barra (y en el historial)');
  await contexto.close();
  const revocada = sanearLicencias({ ...EXIGIDA, revocadas: [deBuena.id] });
  const otra = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:clave': buena }, sinServiceWorker: true, antes: conLicencias(revocada) });
  ok(await esperar(() => enLaPuerta(otra.pagina)), 'con la clave revocada se sigue entrando');
  ok(await esperar(async () => (await otra.pagina.getByRole('alert').textContent().catch(() => '')).includes('ya no vale')), 'no dice que la clave ya no vale');
  await otra.contexto.close();
});

await prueba('sin clave exigida la app está abierta, y la Administración solo sale con el token', async () => {
  const abierta = sanearLicencias({ publica: admin.publica });
  const { contexto, pagina } = await paginaCon(navegador, url, { almacen: LINEA, sinServiceWorker: true, antes: conLicencias(abierta) });
  ok(await enLaApp(pagina), 'sin exigir, la app no se ve');
  await abrirAjustes(pagina);
  eq(await pagina.getByRole('button', { name: 'Administración' }).count(), 0, 'cualquiera ve la administración');
  await contexto.close();
});

await prueba('con el token: crear la clave de administrador publica SOLO la pública, y las claves que da la app las acepta', async () => {
  const sinNada = sanearLicencias({});
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:envio': { token: TOKEN } }, sinServiceWorker: true, antes: conLicencias(sinNada) });
  const puestas = [];
  await contexto.route('https://api.github.com/**', async (ruta) => {
    const r = ruta.request();
    if (r.url().includes('/contents/')) {
      if (r.method() === 'PUT') puestas.push({ url: r.url(), auth: r.headers().authorization, cuerpo: JSON.parse(r.postData()) });
      await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sha: 'abc' }) });
    } else await ruta.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ number: 7, html_url: 'https://github.com/x/y/issues/7' }) });
  });
  await abrirAjustes(pagina);
  await pagina.getByRole('button', { name: 'Administración' }).click();
  await pagina.getByRole('button', { name: 'Crear mi clave de administrador' }).click();
  ok(await esperar(() => puestas.length === 1), `no publica licencias.json: ${await pagina.locator('.sheet-body').textContent()}`);
  ok(puestas[0].url.endsWith('/contents/public/licencias.json') && puestas[0].auth === `Bearer ${TOKEN}`, `publica a otro sitio: ${puestas[0].url}`);
  const publicado = JSON.parse(Buffer.from(puestas[0].cuerpo.content, 'base64').toString());
  ok(publicado.publica?.x && publicado.publica.d === undefined, 'publica la parte privada de la clave de administrador');
  ok(!JSON.stringify(puestas[0].cuerpo).includes(TOKEN), 'el token va dentro de lo publicado');
  await pagina.getByRole('textbox', { name: 'Nombre de la persona' }).fill('Lucía');
  await pagina.getByRole('button', { name: 'Crear clave' }).click();
  const enlace = await pagina.locator('textarea[readonly]').first().inputValue();
  ok(enlace.includes('#clave='), `no sale el enlace: ${enlace}`);
  const r = await comprobarClave(enlace.split('#clave=')[1], { publica: publicado.publica });
  ok(r.valida && r.datos.nombre === 'Lucía', `la clave dada no vale con la pública publicada: ${JSON.stringify(r)}`);
  // Revocar publica su id.
  await pagina.locator('.admin-lista').getByRole('button', { name: 'Quitar', exact: true }).click();
  ok(await esperar(() => puestas.length === 2), 'revocar no publica');
  eq(JSON.parse(Buffer.from(puestas[1].cuerpo.content, 'base64').toString()).revocadas[0], r.datos.id, 'revoca otra cosa');
  eq(errores.length, 0, `errores: ${errores.join(' | ')}`);
  await contexto.close();
});

await navegador.close();
await cerrar();
await terminar('interfaz/licencias');
