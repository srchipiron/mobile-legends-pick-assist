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
const otro = await crearClaveDeAdministrador();
const buena = await firmarClave({ nombre: 'Lucía', privada: admin.privada });
const { datos: deBuena } = await comprobarClave(buena, { publica: admin.publica });
const esperar = async (cond, ms = 9000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 200)); } return cond(); };

/** licencias.json de mentira (el service worker bloqueado: si no, sus peticiones no pasan por aquí). */
const conLicencias = (licencias, retraso = 0) => (p) => p.route(`${url}licencias.json*`, async (ruta) => { if (retraso) await new Promise((r) => setTimeout(r, retraso)); await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(licencias) }); });
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

/** El repositorio de mentira: GET da lo que hay AHORA, PUT lo cambia (la API de verdad hace eso). */
async function simularRepositorio(contexto, inicial) {
  const repo = { texto: inicial === null ? null : JSON.stringify(inicial), puestas: [] };
  await contexto.route('https://api.github.com/**', async (ruta) => {
    const r = ruta.request();
    if (!r.url().includes('/contents/')) { await ruta.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ number: 7, html_url: 'https://github.com/x/y/issues/7' }) }); return; }
    if (r.method() === 'PUT') {
      const cuerpo = JSON.parse(r.postData());
      repo.texto = Buffer.from(cuerpo.content, 'base64').toString('utf8');
      repo.puestas.push({ url: r.url(), auth: r.headers().authorization, cuerpo, json: JSON.parse(repo.texto) });
      await ruta.fulfill({ status: 200, contentType: 'application/json', body: '{}' });
    } else if (repo.texto === null) await ruta.fulfill({ status: 404, contentType: 'application/json', body: '{}' });
    else await ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ sha: `s${repo.puestas.length}`, content: Buffer.from(repo.texto).toString('base64') }) });
  });
  return repo;
}
const CON_TOKEN = { ...LINEA, 'roam-picker:envio': { token: TOKEN } };
const abrirAdministracion = async (pagina) => {
  await abrirAjustes(pagina);
  await pagina.getByRole('button', { name: 'Administración' }).click();
  await pagina.waitForTimeout(300);
};

await prueba('con el token: crear la clave de administrador publica SOLO la pública, y las claves que da la app las acepta', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: CON_TOKEN, sinServiceWorker: true, antes: conLicencias(sanearLicencias({})) });
  const repo = await simularRepositorio(contexto, sanearLicencias({}));
  const puestas = repo.puestas;
  await abrirAdministracion(pagina);
  await pagina.getByRole('button', { name: 'Crear mi clave de administrador' }).click();
  ok(await esperar(() => puestas.length === 1), `no publica licencias.json: ${await pagina.locator('.sheet-body').textContent()}`);
  ok(puestas[0].url.endsWith('/contents/public/licencias.json') && puestas[0].auth === `Bearer ${TOKEN}`, `publica a otro sitio: ${puestas[0].url}`);
  const publicado = puestas[0].json;
  ok(publicado.publica?.x && publicado.publica.d === undefined, 'publica la parte privada de la clave de administrador');
  ok(!JSON.stringify(puestas[0].cuerpo).includes(TOKEN), 'el token va dentro de lo publicado');
  await pagina.getByRole('textbox', { name: 'Nombre de la persona' }).fill('Lucía');
  await pagina.getByRole('button', { name: 'Crear clave' }).click();
  const enlace = await pagina.locator('textarea[readonly]').first().inputValue();
  ok(enlace.includes('#clave='), `no sale el enlace: ${enlace}`);
  const r = await comprobarClave(enlace.split('#clave=')[1], { publica: publicado.publica });
  ok(r.valida && r.datos.nombre === 'Lucía', `la clave dada no vale con la pública publicada: ${JSON.stringify(r)}`);
  // Exigir y LUEGO revocar: lo segundo no puede deshacer lo primero.
  await pagina.getByRole('button', { name: 'Pedir clave para entrar' }).click();
  ok(await esperar(() => puestas.length === 2), 'exigir no publica');
  await pagina.locator('.admin-lista').getByRole('button', { name: 'Quitar', exact: true }).click();
  ok(await esperar(() => puestas.length === 3), 'revocar no publica');
  eq(puestas[2].json.revocadas[0], r.datos.id, 'revoca otra cosa');
  eq(puestas[2].json.exigir, true, 'revocar deshace «pedir clave»');
  eq(puestas[2].json.publica.x, publicado.publica.x, 'revocar cambia la clave pública');
  eq(errores.length, 0, `errores: ${errores.join(' | ')}`);
  await contexto.close();
});

await prueba('el administrador ve lo que hay en el REPOSITORIO aunque Pages siga con lo de antes, y cada cambio parte de ahí', async () => {
  // Pages, viejo: abierta. El repositorio: ya exige y tiene una revocada.
  const enRepo = sanearLicencias({ publica: admin.publica, exigir: true, revocadas: ['viejaaa1'] });
  const { contexto, pagina, errores } = await paginaCon(navegador, url, {
    almacen: { ...CON_TOKEN, 'roam-picker:admin': admin }, sinServiceWorker: true, // Pages contesta DESPUÉS que la API: lo viejo no puede pisar lo leído del repositorio.
    antes: conLicencias(sanearLicencias({ publica: admin.publica }), 1500),
  });
  const repo = await simularRepositorio(contexto, enRepo);
  await pagina.reload({ waitUntil: 'networkidle' });
  await abrirAdministracion(pagina);
  ok(await esperar(async () => (await pagina.locator('.sheet-body').textContent()).includes('Sí: quien no tenga')), 'enseña lo de Pages (abierta) y no lo del repositorio');
  await pagina.getByRole('button', { name: 'Abrir la app a todos' }).click();
  ok(await esperar(() => repo.puestas.length === 1), 'no publica');
  eq(repo.puestas[0].json.exigir, false);
  eq(repo.puestas[0].json.revocadas[0], 'viejaaa1', 'abrir la app pierde las revocadas del repositorio');
  eq(errores.length, 0, `errores: ${errores.join(' | ')}`);
  await contexto.close();
});

await prueba('crear otra clave de administrador cuando ya hay una publicada pide confirmación y, sin ella, no pisa nada', async () => {
  const enRepo = sanearLicencias({ publica: otro.publica });
  const { contexto, pagina } = await paginaCon(navegador, url, { almacen: CON_TOKEN, sinServiceWorker: true, antes: conLicencias(enRepo) });
  const repo = await simularRepositorio(contexto, enRepo);
  let preguntado = false;
  pagina.on('dialog', (d) => { preguntado = true; d.dismiss(); });
  await abrirAdministracion(pagina);
  await pagina.getByRole('button', { name: 'Crear mi clave de administrador' }).click();
  ok(await esperar(async () => (await pagina.locator('.sheet-body').textContent()).includes('Ya hay una clave de administrador publicada')), 'no dice que ya hay una');
  ok(preguntado, 'no pregunta antes de pisar la clave publicada');
  eq(repo.puestas.length, 0, 'pisa la clave publicada sin confirmar');
  await contexto.close();
});

await prueba('si una copia vieja dejó el repositorio sin pública, el administrador la vuelve a poner (lo que pasó en 3.65.0)', async () => {
  const { contexto, pagina } = await paginaCon(navegador, url, { almacen: { ...CON_TOKEN, 'roam-picker:admin': admin }, sinServiceWorker: true, antes: conLicencias(sanearLicencias({})) });
  const repo = await simularRepositorio(contexto, sanearLicencias({}));
  await pagina.reload({ waitUntil: 'networkidle' });
  await abrirAdministracion(pagina);
  ok((await pagina.locator('.sheet-body').textContent()).includes('no está publicada'), 'no avisa de que falta la pública');
  await pagina.getByRole('button', { name: 'Pedir clave para entrar' }).click();
  ok(await esperar(() => repo.puestas.length === 1), 'no publica');
  eq(repo.puestas[0].json.publica?.x, admin.publica.x, 'exigir sin pública no la vuelve a poner');
  eq(repo.puestas[0].json.exigir, true, 'sin pública, «pedir clave» no se queda');
  await contexto.close();
});

await navegador.close();
await cerrar();
await terminar('interfaz/licencias');
