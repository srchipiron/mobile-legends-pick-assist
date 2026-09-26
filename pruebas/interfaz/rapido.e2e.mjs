/**
 * Meter el draft deprisa (3.16.0): a Javi se le echaba encima la partida
 * abriendo, buscando y cerrando el selector por cada héroe. Ahora el de
 * picks es UNA hoja para los dos equipos, con pestañas, que no se cierra al
 * tocar; y el de baneos enseña primero tu línea, que es lo único que cambia
 * la recomendación (medido sobre sus 42 drafts: los baneos de otras líneas
 * no cambian el nº1 en ninguno).
 */
import { readFile } from 'node:fs/promises';
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar } from './navegador.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const leerJson = async (f) => JSON.parse(await readFile(new URL(`../../dist/data/${f}`, import.meta.url), 'utf8'));
const motor = await import('../../src/motor/draft.js');
const datos = motor.prepararDatos({ catalogo: await leerJson('heroes.json'), meta: await leerJson('roam-meta.json'), rango: 'glory' });
const leer = (pagina) => pagina.evaluate(() => JSON.parse(localStorage.getItem('roam-picker:draft') ?? 'null'));
const cara = (pagina, nombre) => pagina.locator('.hero-grid button', { hasText: nombre }).first();
const buscarYTocar = async (pagina, nombre) => {
  await pagina.locator('.sheet input').fill(nombre); await pagina.waitForTimeout(120);
  await cara(pagina, nombre).click(); await pagina.waitForTimeout(150);
};

await prueba('los picks de los dos equipos se meten en UNA hoja que no se cierra, con pestañas y quitando con otro toque', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, {
    viewport: { width: 360, height: 740 },
    almacen: { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: [], allies: [], bans: ['Hirara'], enemyRoam: null, fase: 'picks' } },
  });
  await pagina.locator('.side.enemy .slot.empty').first().click(); await pagina.waitForTimeout(300);
  const pestanas = pagina.locator('.sheet-bandos [role=tab]');
  eq(await pestanas.count(), 2, 'no hay pestañas de equipo');
  eq(await pagina.locator('.sheet-bandos [aria-selected=true]').innerText().then((x) => /Enemigos/.test(x)), true, 'abierta desde un enemigo, no empieza en Enemigos');
  await buscarYTocar(pagina, 'Layla');
  eq(await pagina.locator('[role=dialog]').count(), 1, 'la hoja se cierra al elegir (vuelta al abrir-buscar-cerrar por héroe)');
  for (const n of ['Fanny', 'Tigreal']) await buscarYTocar(pagina, n);
  eq((await leer(pagina)).enemies.join(','), 'Layla,Fanny,Tigreal', 'no se guardan los tres enemigos');
  ok(/3\/5/.test(await pestanas.nth(0).innerText()), `la pestaña no cuenta 3/5: ${await pestanas.nth(0).innerText()}`);
  // El baneado no se puede tocar.
  await pagina.locator('.sheet input').fill('Hirara'); await pagina.waitForTimeout(120);
  ok(await cara(pagina, 'Hirara').isDisabled(), 'un baneado se puede meter de enemigo');
  // A tu equipo, sin cerrar: los enemigos quedan bloqueados ahí.
  await pestanas.nth(1).click(); await pagina.waitForTimeout(200);
  eq(await pagina.locator('[role=dialog]').count(), 1, 'cambiar de pestaña cierra la hoja');
  await pagina.locator('.sheet input').fill('Layla'); await pagina.waitForTimeout(120);
  ok(await cara(pagina, 'Layla').isDisabled(), 'una enemiga se puede meter en tu equipo');
  for (const n of ['Chou', 'Miya']) await buscarYTocar(pagina, n);
  // Otro toque la quita.
  await buscarYTocar(pagina, 'Miya');
  const d = await leer(pagina);
  eq(d.allies.join(','), 'Chou', `tocar otra vez no quita al compañero: ${d.allies}`);
  eq(d.enemies.length, 3, 'tocar en tu equipo cambia los enemigos');
  // El tope: con cinco enemigos, los demás no se pueden tocar.
  await pestanas.nth(0).click(); await pagina.waitForTimeout(200);
  for (const n of ['Kagura', 'Balmond']) await buscarYTocar(pagina, n);
  await pagina.locator('.sheet input').fill('Eudora'); await pagina.waitForTimeout(120);
  ok(await cara(pagina, 'Eudora').isDisabled(), 'con cinco enemigos se puede meter un sexto');
  // «Listo» cierra, y el draft está en los huecos.
  await pagina.locator('.sheet .close').first().click(); await pagina.waitForTimeout(300);
  eq(await pagina.locator('[role=dialog]').count(), 0, '«Listo» no cierra la hoja');
  eq(await pagina.locator('.side.enemy .slot:not(.empty)').count(), 5, 'no hay cinco enemigos en pantalla');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await prueba('el selector de baneos enseña tu línea primero, «Todos» los enseña todos y buscando sale cualquiera', async () => {
  const pool = motor.poolDe(datos, 'roam').map((h) => h.name);
  const { contexto, pagina } = await paginaCon(navegador, url, {
    viewport: { width: 360, height: 740 },
    almacen: { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: [], allies: [], bans: [], enemyRoam: null, fase: 'baneos' } },
  });
  await pagina.locator('.side.bans .slot.empty').first().click(); await pagina.waitForTimeout(300);
  const nombres = async () => pagina.locator('.hero-grid .grid-nombre').allTextContents();
  const deLinea = await nombres();
  eq(deLinea.length, pool.length, `con «Tu línea» salen ${deLinea.length} y tu línea tiene ${pool.length}`);
  ok(deLinea.every((n) => pool.includes(n)), 'con «Tu línea» sale alguien de otra línea');
  await pagina.locator('.sheet-filtro button', { hasText: 'Todos' }).click(); await pagina.waitForTimeout(200);
  eq((await nombres()).length, datos.heroes.length, '«Todos» no enseña a todos');
  await pagina.locator('.sheet-filtro button', { hasText: 'Tu línea' }).click(); await pagina.waitForTimeout(200);
  const fuera = datos.heroes.find((h) => !pool.includes(h.name));
  await pagina.locator('.sheet input').fill(fuera.name); await pagina.waitForTimeout(150);
  ok((await nombres()).includes(fuera.name), `buscando no sale ${fuera.name}, que no es de tu línea`);
  await contexto.close();
});

await terminar('interfaz/rapido');
await navegador.close();
await cerrar();
