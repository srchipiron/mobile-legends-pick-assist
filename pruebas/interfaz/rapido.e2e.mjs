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

await prueba('las caras del selector de picks van en el orden del motor y NO se mueven al tocar', async () => {
  // El orden (3.17.0) sale de probablesDelBando al abrir la hoja o cambiar
  // de pestaña; mientras se toca se queda quieto (lo que se toca a
  // contrarreloj no cambia de sitio).
  const { contexto, pagina } = await paginaCon(navegador, url, {
    viewport: { width: 360, height: 740 },
    almacen: { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: ['Fanny', 'Layla'], allies: [], bans: [], enemyRoam: null, fase: 'picks' } },
  });
  const H = (n) => datos.porNombre.get(n);
  const nombres = () => pagina.locator('.hero-grid .grid-nombre').allTextContents();
  await pagina.locator('.side.enemy .slot.empty').first().click(); await pagina.waitForTimeout(300);
  const esperado = motor.probablesDelBando(datos, { equipo: [H('Fanny'), H('Layla')], linea: 'roam', bando: 'enemigos' }).map((x) => x.name);
  const visto = await nombres();
  eq(visto.slice(0, 20).join(','), esperado.slice(0, 20).join(','), 'las caras de Enemigos no van en el orden del motor');
  // Tocar la primera libre la marca en su sitio: el orden no cambia.
  const primera = pagina.locator('.hero-grid button:not([disabled])').first();
  await primera.click(); await pagina.waitForTimeout(250);
  eq((await nombres()).join(','), visto.join(','), 'tocar una cara reordena la rejilla (se toca a contrarreloj)');
  // Cambiar a tu equipo recalcula para tu equipo, sin tu línea.
  await pagina.locator('.sheet-bandos [role=tab]').nth(1).click(); await pagina.waitForTimeout(250);
  const aliados = motor.probablesDelBando(datos, { equipo: [], linea: 'roam', bando: 'aliados' }).map((x) => x.name);
  eq((await nombres()).slice(0, 20).join(','), aliados.slice(0, 20).join(','), 'las caras de Tu equipo no van en el orden del motor');
  await contexto.close();
});

await prueba('Intro no quita a quien ya está marcado, y tu pick fijado ni se mete de compañero ni se queda si lo baneas', async () => {
  // Cazado en la revisión de 3.21.0: con Alice metida, «al» + Intro buscando a
  // Alucard la QUITABA (tocar a un marcado lo quita), sin avisar.
  const { contexto, pagina } = await paginaCon(navegador, url, {
    viewport: { width: 360, height: 740 },
    almacen: { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: ['Alice'], allies: [], bans: [], enemyRoam: null, fase: 'picks', miPick: 'Rafaela', miPickDesde: Date.now() } },
  });
  await pagina.locator('.side.enemy .slot.empty').first().click(); await pagina.waitForTimeout(300);
  await pagina.locator('.sheet input').fill('al'); await pagina.waitForTimeout(150);
  await pagina.locator('.sheet input').press('Enter'); await pagina.waitForTimeout(200);
  const d = await leer(pagina);
  ok(d.enemies.includes('Alice'), `Intro ha quitado a Alice, que ya estaba: ${d.enemies}`);
  eq(d.enemies.length, 2, `Intro no ha metido al siguiente que casa con «al»: ${d.enemies}`);
  // En la pestaña de tu equipo, tu pick fijado no se puede tocar: eres tú.
  await pagina.locator('.sheet-bandos [role=tab]').nth(1).click(); await pagina.waitForTimeout(200);
  await pagina.locator('.sheet input').fill('Rafaela'); await pagina.waitForTimeout(150);
  ok(await cara(pagina, 'Rafaela').isDisabled(), 'tu pick fijado se puede meter de compañero');
  await pagina.locator('.sheet .close').first().click(); await pagina.waitForTimeout(300);
  await contexto.close();
  // Banearlo lo suelta, igual que meterlo de enemigo.
  const otra = await paginaCon(navegador, url, {
    viewport: { width: 360, height: 740 },
    almacen: { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: [], allies: [], bans: [], enemyRoam: null, fase: 'baneos', miPick: 'Rafaela', miPickDesde: Date.now() } },
  });
  await otra.pagina.locator('.side.bans .slot.empty').first().click(); await otra.pagina.waitForTimeout(300);
  await buscarYTocar(otra.pagina, 'Rafaela');
  const d2 = await leer(otra.pagina);
  ok(d2.bans.includes('Rafaela'), 'no se ha baneado');
  eq(d2.miPick ?? null, null, 'banear tu pick fijado no lo suelta: el hueco «Tú» lo seguiría enseñando');
  await otra.contexto.close();
});

await prueba('si el meta llega con la hoja de picks abierta, la rejilla se ordena al llegar', async () => {
  // Cazado en la revisión de 3.21.0: tocar un hueco al arrancar dejaba la
  // rejilla alfabética (todos con nota 0) hasta cerrar y reabrir la hoja.
  let soltar;
  const retenido = new Promise((r) => { soltar = r; });
  const { contexto, pagina } = await paginaCon(navegador, url, {
    viewport: { width: 360, height: 740 }, esperar: 'domcontentloaded',
    almacen: { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: [], allies: [], bans: [], enemyRoam: null, fase: 'picks' } },
    antes: (p) => p.route('**/data/roam-meta.json', async (ruta) => { await retenido; await ruta.continue(); }),
  });
  const hueco = pagina.locator('.side.enemy .slot.empty').first();
  await hueco.waitFor({ timeout: 5000 });
  await hueco.click(); await pagina.waitForTimeout(300);
  soltar();
  await pagina.waitForTimeout(1500);
  const nombres = await pagina.locator('.hero-grid .grid-nombre').allTextContents();
  const esperado = motor.probablesDelBando(datos, { equipo: [], linea: 'roam', bando: 'enemigos' }).map((x) => x.name);
  eq(nombres.slice(0, 12).join(','), esperado.slice(0, 12).join(','), 'con el meta ya llegado la rejilla sigue sin el orden del motor');
  await contexto.close();
});

await prueba('en un móvil táctil el selector NO saca el teclado (tapaba media rejilla); con ratón, el buscador sí coge el foco', async () => {
  const almacen = { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: [], allies: [], bans: [], enemyRoam: null, fase: 'picks' } };
  const enfocado = (pagina) => pagina.evaluate(() => ({ input: document.activeElement?.tagName === 'INPUT', enHoja: !!document.activeElement?.closest('.sheet') }));
  for (const tactil of [true, false]) {
    const { contexto, pagina, errores } = await paginaCon(navegador, url, { viewport: { width: 360, height: 740 }, almacen, tactil });
    const grueso = await pagina.evaluate(() => window.matchMedia('(pointer: coarse)').matches);
    eq(grueso, tactil, `el contexto ${tactil ? 'táctil' : 'de escritorio'} no emula el puntero que toca`);
    const hueco = pagina.locator('.side.enemy .slot.empty').first();
    if (tactil) await hueco.tap(); else await hueco.click();
    await pagina.waitForTimeout(400);
    const f = await enfocado(pagina);
    ok(f.enHoja, `${tactil ? 'táctil' : 'escritorio'}: el foco no está dentro de la hoja`);
    eq(f.input, !tactil, tactil ? 'en un móvil el buscador coge el foco y saca el teclado' : 'con ratón el buscador no coge el foco');
    ok(!errores.length, `errores de página: ${errores}`);
    await contexto.close();
  }
});

await terminar('interfaz/rapido');
await navegador.close();
await cerrar();
