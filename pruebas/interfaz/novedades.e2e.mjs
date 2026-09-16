/**
 * La versión del pie abre las novedades (el CHANGELOG compilado): la primera
 * entrada es la versión que se publica, resumida, y «ver todo» la despliega.
 * Tocar la versión NO abre el detalle del pie.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar, leerJson } from './navegador.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();

await prueba('la versión del pie abre las novedades y la primera es la que se publica', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: { 'roam-picker:linea': 'roam' } });
  await pagina.locator('.pie-version').click(); await pagina.waitForTimeout(300);
  eq(await pagina.locator('.sheet .changelog').count(), 1, 'no se abre la hoja de novedades');
  eq(await pagina.locator('.pie-detalle').count(), 0, 'tocar la versión abre también el detalle del pie');
  const { version } = leerJson('package.json');
  const primera = await pagina.locator('.changelog section').first().innerText();
  ok(primera.startsWith(`v${version}`), `la primera entrada no es la versión publicada (${version}): ${primera.slice(0, 40)}`);
  ok(/la que usas|current/.test(primera), 'la primera entrada no se marca como la que usas');
  const resumida = (await pagina.locator('.changelog section li').first().innerText()).length;
  await pagina.locator('.changelog-mas').first().click(); await pagina.waitForTimeout(200);
  const entera = (await pagina.locator('.changelog section li').first().innerText()).length;
  ok(entera >= resumida, '«ver todo» acorta la entrada');
  await pagina.locator('.sheet .close').click(); await pagina.waitForTimeout(200);
  eq(await pagina.locator('.sheet').count(), 0, 'no se cierra');
  ok(!errores.length, `errores: ${errores}`);
  await contexto.close();
});

await terminar('interfaz/novedades');
await navegador.close();
await cerrar();
