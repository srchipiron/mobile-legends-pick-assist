/**
 * El token de GitHub en un Chrome de verdad sobre la app compilada y con la
 * API SIMULADA. Hasta 3.97.0 subía tus partidas a una incidencia; desde
 * 3.98.0 es solo de administración: nada va a incidencias, y el token no
 * aparece ni en el código de perfil ni en el diagnóstico.
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

await prueba('con token y partidas, nada va a una incidencia (3.98.0); el token se presenta como de administración y quitarlo lo borra del almacén', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:partidas': PARTIDAS, 'roam-picker:envio': { token: TOKEN, incidencia: 7, huella: 'x' } } });
  const peticiones = await simularApi(contexto);
  await abrirPartidas(pagina);
  await pagina.waitForTimeout(5000);
  eq(peticiones.filter((p) => /\/issues/.test(p.url)).length, 0, `la app sube a incidencias: ${peticiones.map((p) => `${p.metodo} ${p.url}`)}`);
  eq(await pagina.getByRole('button', { name: 'Enviar mis partidas al proyecto' }).count(), 0, 'sigue «Enviar mis partidas al proyecto»');
  ok(/administración/.test(await pagina.locator('.envio-auto').innerText()), 'el token no se presenta como de administración');
  await pagina.getByRole('button', { name: 'Quitar el token' }).click(); await pagina.waitForTimeout(300);
  eq((await leer(pagina, 'roam-picker:envio'))?.token ?? null, null, 'quitar el token no lo borra del almacén');
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
