/**
 * La subida automática de partidas (3.10.0), en un Chrome de verdad sobre
 * la app compilada y con la API de GitHub SIMULADA: con token, apuntar una
 * partida la sube sola a la misma incidencia; el botón de enviar sube por
 * la API en vez de abrir el navegador; un token rechazado se dice y no se
 * machaca la API; y el token no aparece ni en el código de perfil ni en el
 * diagnóstico.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar, abrirAjustes } from './navegador.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const TOKEN = 'github_pat_PRUEBA_0123456789abcdefghij';
// La fila de herramientas (.more) solo está en la fase de picks: se siembra un draft con un enemigo.
const LINEA = { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: ['Layla'], allies: [], bans: [], enemyRoam: null, fase: 'picks' } };
const PARTIDAS = [
  { t: 1700000000000, pick: 'Tigreal', gane: true, rango: 'glory', recomendados: ['Tigreal', 'Atlas', 'Khufra'], draft: { linea: 'roam', enemigos: ['Layla', 'Fanny'], aliados: ['Chou'] } },
  { t: 1700003600000, pick: 'Atlas', gane: false, rango: 'glory', recomendados: ['Tigreal', 'Atlas', 'Khufra'] },
];
const leer = (pagina, clave) => pagina.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), clave);
const esperar = async (cond, ms = 9000) => { const fin = Date.now() + ms; while (Date.now() < fin) { if (await cond()) return true; await new Promise((r) => setTimeout(r, 200)); } return cond(); };

/** La API de GitHub de mentira: apunta cada petición y responde lo que se le diga. */
async function simularApi(contexto, { estado = 201, numero = 7 } = {}) {
  const peticiones = [];
  await contexto.route('https://api.github.com/**', async (ruta) => {
    const r = ruta.request();
    peticiones.push({ metodo: r.method(), url: r.url(), cabeceras: r.headers(), cuerpo: r.postData() ?? '' });
    await ruta.fulfill({ status: estado, contentType: 'application/json', body: JSON.stringify({ number: numero, html_url: `https://github.com/x/y/issues/${numero}` }) });
  });
  return peticiones;
}

const abrirPartidas = async (pagina) => {
  await abrirAjustes(pagina);
  await pagina.getByRole('button', { name: 'Partidas', exact: true }).click(); await pagina.waitForTimeout(400);
};

await prueba('con token, lo que hay sin subir se sube solo a los pocos segundos, y apuntar otra partida edita la misma incidencia', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, {
    almacen: { ...LINEA, 'roam-picker:partidas': PARTIDAS, 'roam-picker:envio': { token: TOKEN } },
  });
  const peticiones = await simularApi(contexto);
  ok(await esperar(() => peticiones.length >= 1), 'con token y partidas sin subir, no sube nada');
  const p1 = peticiones[0];
  eq(p1.metodo, 'POST', 'la primera subida no abre la incidencia');
  ok(/^https:\/\/api\.github\.com\/repos\/[^/]+\/[^/]+\/issues$/.test(p1.url), `la primera subida no va a /repos/…/issues: ${p1.url}`);
  eq(p1.cabeceras.authorization, `Bearer ${TOKEN}`, 'el token no va en la cabecera Authorization');
  const cuerpo1 = JSON.parse(p1.cuerpo);
  ok(/MLPA1\.[A-Za-z0-9_-]+\.[a-z0-9]+/.test(cuerpo1.body), 'el cuerpo no lleva el código de perfil');
  ok(!p1.cuerpo.includes(TOKEN) && !p1.url.includes(TOKEN), 'el token viaja fuera de la cabecera');
  eq(cuerpo1.labels?.[0], 'partidas', 'la incidencia no lleva la etiqueta del bot');
  ok(await esperar(async () => (await leer(pagina, 'roam-picker:envio'))?.incidencia === 7), 'no se guarda la incidencia abierta');
  const guardado = await leer(pagina, 'roam-picker:envio');
  ok(typeof guardado.huella === 'string' && guardado.huella.startsWith('2.') && guardado.error == null, `lo guardado tras subir no cuadra: ${JSON.stringify(guardado)}`);
  // Sin cambios, no vuelve a subir.
  await pagina.waitForTimeout(4000);
  eq(peticiones.length, 1, 'vuelve a subir sin que cambie nada');
  // Una partida más (del historial del juego, desde la hoja) → PATCH a la misma incidencia.
  await abrirPartidas(pagina);
  ok((await pagina.locator('.envio-auto').innerText()).includes('Última subida'), 'la hoja no dice cuándo fue la última subida');
  await pagina.getByRole('button', { name: 'Añadir partidas de tu historial del juego' }).click(); await pagina.waitForTimeout(200);
  await pagina.locator('.hero-grid.corto button').first().click();
  await pagina.getByRole('button', { name: 'Gané', exact: true }).click(); await pagina.waitForTimeout(200);
  ok(await esperar(() => peticiones.length >= 2), 'apuntar una partida no la sube');
  eq(peticiones[1].metodo, 'PATCH', 'la segunda subida no edita la incidencia');
  ok(peticiones[1].url.endsWith('/issues/7'), `la segunda subida no va a la incidencia guardada: ${peticiones[1].url}`);
  ok(!('labels' in JSON.parse(peticiones[1].cuerpo)), 'al editar se reenvían las etiquetas');
  ok(await esperar(async () => (await leer(pagina, 'roam-picker:envio'))?.huella?.startsWith('3.')), 'la huella no avanza con la partida nueva');
  // El botón de enviar, con token, sube por la API (no abre el navegador).
  await pagina.evaluate(() => { window.__abiertas = 0; window.open = () => { window.__abiertas += 1; return null; }; });
  await pagina.getByRole('button', { name: 'Enviar mis partidas al proyecto' }).click();
  ok(await esperar(() => peticiones.length >= 3), 'el botón no sube por la API');
  eq(await pagina.evaluate(() => window.__abiertas), 0, 'con token, el botón sigue abriendo el navegador');
  ok(await esperar(async () => /incidencia #7/.test(await pagina.locator('.sheet-body').innerText())), 'el botón no dice a qué incidencia ha subido');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await prueba('un token rechazado se dice en la hoja, no se reintenta en bucle, y desactivar la subida lo quita del almacén', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, {
    almacen: { ...LINEA, 'roam-picker:partidas': PARTIDAS, 'roam-picker:envio': { token: TOKEN, incidencia: 7 } },
  });
  const peticiones = await simularApi(contexto, { estado: 401 });
  ok(await esperar(() => peticiones.length >= 1), 'no lo intenta');
  await pagina.waitForTimeout(4500);
  eq(peticiones.length, 1, 'machaca la API tras un 401');
  ok(await esperar(async () => (await leer(pagina, 'roam-picker:envio'))?.error === 'token'), 'el fallo no queda guardado');
  await abrirPartidas(pagina);
  ok((await pagina.locator('.envio-auto').innerText()).includes('no acepta el token'), 'la hoja no dice que el token no vale');
  await pagina.getByRole('button', { name: 'Desactivar la subida automática' }).click(); await pagina.waitForTimeout(300);
  const tras = await leer(pagina, 'roam-picker:envio');
  eq(tras.token, null, 'el token sigue guardado tras desactivar');
  eq(tras.incidencia, 7, 'desactivar pierde la incidencia (al reactivar abriría otra)');
  ok(await pagina.locator('.envio-auto input[type="password"]').count() === 1, 'sin token no sale el campo para pegar uno');
  // Activar con uno nuevo: el campo acepta y el estado vuelve a «activo».
  await pagina.locator('.envio-auto input[type="password"]').fill('github_pat_OTRO_0123456789abcdefghij');
  await pagina.getByRole('button', { name: 'Activar la subida automática' }).click(); await pagina.waitForTimeout(300);
  eq((await leer(pagina, 'roam-picker:envio')).token, 'github_pat_OTRO_0123456789abcdefghij', 'activar no guarda el token');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await prueba('el token no sale ni en el código de perfil ni en el diagnóstico', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, {
    almacen: { ...LINEA, 'roam-picker:partidas': PARTIDAS, 'roam-picker:envio': { token: TOKEN, incidencia: 7, huella: 'x' } },
  });
  await simularApi(contexto);
  await abrirAjustes(pagina);
  await pagina.getByRole('button', { name: 'Tu perfil', exact: true }).click(); await pagina.waitForTimeout(800);
  const codigo = await pagina.locator('textarea.codigo').first().inputValue();
  ok(codigo.startsWith('MLPA1.'), 'no hay código de perfil');
  const perfil = await pagina.evaluate(async (c) => {
    const partes = c.split('.'); const b = partes[1];
    const bin = Uint8Array.from(globalThis.atob(b.slice(1).replace(/-/g, '+').replace(/_/g, '/')), (ch) => ch.charCodeAt(0));
    const texto = b[0] === 'z' ? await new Response(new Blob([bin]).stream().pipeThrough(new DecompressionStream('gzip'))).text() : new TextDecoder().decode(bin);
    return texto;
  }, codigo);
  ok(!perfil.includes(TOKEN) && !perfil.includes('github_pat'), 'el código de perfil lleva el token dentro');
  await pagina.getByRole('button', { name: 'Cerrar' }).first().click(); await pagina.waitForTimeout(300);
  await abrirAjustes(pagina);
  await pagina.getByRole('button', { name: 'Diagnóstico' }).click(); await pagina.waitForTimeout(2500);
  const informe = await pagina.locator('#selftest-texto').innerText();
  ok(informe.length > 200 && !informe.includes(TOKEN), 'el diagnóstico lleva el token');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await terminar('interfaz/envio');
await navegador.close();
await cerrar();
