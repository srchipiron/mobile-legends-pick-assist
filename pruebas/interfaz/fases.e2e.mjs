/**
 * Las dos fases del draft (baneos y picks), en un Chrome de verdad sobre la
 * app compilada: el selector multi-toque de baneos, la tira de baneos, el
 * draft que sobrevive a una recarga con su fase, y un draft guardado antes
 * de que existiera la fase.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar, anchoDePagina, elegirEnSelector } from './navegador.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const LINEA = { 'roam-picker:linea': 'roam' };

for (const ancho of [390, 360]) {
  await prueba(`fase de baneos y fase de picks a ${ancho}px`, async () => {
    const { contexto, pagina, errores } = await paginaCon(navegador, url, { viewport: { width: ancho, height: 844 } });
    await pagina.locator('.linea').first().click(); await pagina.waitForTimeout(400);
    eq(await pagina.locator('h1').textContent(), 'Fase de baneos', 'no arranca en la fase de baneos');
    ok(/Sin baneos/.test(await pagina.locator('.reset.primario').textContent()), 'sin baneos el botón no dice «Sin baneos · ir a los picks»');
    eq(await pagina.locator('.side.enemy').count(), 0, 'en la fase de baneos hay huecos de enemigos');
    ok((await anchoDePagina(pagina)) <= ancho, `desborde horizontal en baneos (${await anchoDePagina(pagina)})`);
    await pagina.getByRole('button', { name: 'Buscar héroe para banear' }).click(); await pagina.waitForTimeout(300);
    for (const n of ['Fanny', 'Ling']) await elegirEnSelector(pagina, n);
    eq(await pagina.locator('.sheet').count(), 1, 'el selector de baneos se cerró tras dos toques');
    await pagina.locator('.sheet .close').click(); await pagina.waitForTimeout(300);
    ok(/Baneos 2\/10/.test(await pagina.locator('.brand .freshness').textContent()), 'no cuenta 2/10 baneados');
    ok(/Ir a los picks/.test(await pagina.locator('.reset.primario').textContent()), 'con baneos el botón no dice «Ir a los picks»');
    await pagina.locator('.reset.primario').click(); await pagina.waitForTimeout(400);
    eq(await pagina.locator('.side.enemy').count(), 1, 'tras el botón no se ve la fase de picks');
    ok(/Baneos 2\/10/.test(await pagina.locator('.bans-resumen').textContent()), 'la tira de baneos no dice 2/10');
    eq(await pagina.locator('.bans-resumen .cara-ban').count(), 2, 'la tira no enseña las dos caras');
    eq((await pagina.locator('.more summary').textContent()).trim(), 'Ajustes', 'el desplegable no se llama «Ajustes»');
    eq(await pagina.locator('.more .side.bans').count(), 0, 'los baneos siguen dentro de Ajustes');
    ok((await anchoDePagina(pagina)) <= ancho, `desborde horizontal en picks (${await anchoDePagina(pagina)})`);
    // Un baneado no se puede elegir como enemigo.
    await pagina.locator('.side.enemy .slot.empty').first().click(); await pagina.waitForTimeout(300);
    await pagina.locator('.sheet input').fill('Fanny'); await pagina.waitForTimeout(150);
    ok(await pagina.locator('.hero-grid button', { hasText: 'Fanny' }).first().isDisabled(), 'Fanny baneada se puede coger como enemiga');
    await elegirEnSelector(pagina, 'Layla');
    eq(await pagina.locator('.side.enemy .slot:not(.empty)').count(), 1, 'no se añade una enemiga en la fase de picks');
    // Recargar: sigue en picks con todo.
    await pagina.reload({ waitUntil: 'networkidle' }); await pagina.waitForTimeout(500);
    ok(await pagina.locator('.side.enemy .slot:not(.empty)').count() === 1 && /2\/10/.test(await pagina.locator('.bans-resumen').textContent()), 'tras recargar no sigue en picks con baneos y enemiga');
    const guardado = await pagina.evaluate(() => JSON.parse(localStorage.getItem('roam-picker:draft')));
    ok(guardado.fase === 'picks' && guardado.bans.length === 2 && guardado.enemies[0] === 'Layla', `el draft guardado no lleva la fase y los nombres: ${JSON.stringify(guardado)}`);
    // Volver a baneos desde la tira, y de vuelta sin perder nada.
    await pagina.locator('.bans-resumen').click(); await pagina.waitForTimeout(300);
    ok((await pagina.locator('h1').textContent()) === 'Fase de baneos' && /2\/10/.test(await pagina.locator('.brand .freshness').textContent()), 'la tira no vuelve a la fase de baneos con los baneos');
    await pagina.locator('.reset.primario').click(); await pagina.waitForTimeout(300);
    eq(await pagina.locator('.side.enemy .slot:not(.empty)').count(), 1, 'volver a picks pierde la enemiga');
    await pagina.getByRole('button', { name: 'Nuevo draft' }).click(); await pagina.waitForTimeout(300);
    ok((await pagina.locator('h1').textContent()) === 'Fase de baneos' && /0\/10/.test(await pagina.locator('.brand .freshness').textContent()), '«Nuevo draft» no vuelve a la fase de baneos vacía');
    ok(!errores.length, `errores de página: ${errores}`);
    await contexto.close();
  });
}

await prueba('un draft guardado antes de que existiera la fase, con picks, arranca en picks', async () => {
  const { contexto, pagina } = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:draft': { enemies: ['Layla'], allies: [], bans: ['Fanny'], enemyRoam: null } } });
  ok(await pagina.locator('.side.enemy .slot:not(.empty)').count() === 1 && /1\/10/.test(await pagina.locator('.bans-resumen').textContent()), 'un draft viejo con picks no arranca en picks con su baneo');
  await contexto.close();
});

await prueba('apuntar una partida guarda los baneos y vuelve a la fase de baneos; el diagnóstico los cuenta', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:draft': { enemies: ['Layla'], allies: [], bans: ['Fanny', 'Ling'], enemyRoam: null, fase: 'picks' } } });
  await pagina.getByRole('button', { name: 'Apuntar partida' }).click(); await pagina.waitForTimeout(300);
  await pagina.locator('.sheet .hero-grid button').first().click(); await pagina.waitForTimeout(150);
  await pagina.locator('.sheet .resultado button').last().click(); await pagina.waitForTimeout(500);
  const partidas = await pagina.evaluate(() => JSON.parse(localStorage.getItem('roam-picker:partidas')));
  ok(partidas.length === 1 && JSON.stringify(partidas[0].bans) === '["Fanny","Ling"]' && partidas[0].gane === true && typeof partidas[0].estimacion === 'number', `la partida apuntada no guarda baneos, resultado y estimación: ${JSON.stringify(partidas[0])}`);
  eq(await pagina.locator('h1').textContent(), 'Fase de baneos', 'tras apuntar no vuelve a la fase de baneos');
  await pagina.locator('.reset.primario').click(); await pagina.waitForTimeout(300);
  await pagina.locator('.more summary').click(); await pagina.waitForTimeout(200);
  await pagina.getByRole('button', { name: 'Diagnóstico' }).click(); await pagina.waitForTimeout(2000);
  const texto = await pagina.locator('.sheet pre').first().innerText();
  ok(/Partidas con baneos apuntados: 1 de 1/.test(texto), 'el diagnóstico no cuenta la partida con baneos');
  ok(/Todo correcto|Sin fallos/.test(texto.split('\n')[2] ?? ''), `el diagnóstico del móvil sale con fallos: ${texto.split('\n').filter((l) => l.startsWith('[FALLO]')).join(' | ')}`);
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await terminar('interfaz/fases');
await navegador.close();
await cerrar();
