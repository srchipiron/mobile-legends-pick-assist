/**
 * El plan de partida (3.36.0) en pantalla: se abre desde «Plan y objetos»
 * de cualquier tarjeta, arriba de la build; con enemigos dice a quién hacer
 * focus (uno de los enemigos que no es tanque), lo tuyo lleva el nombre del
 * héroe de la tarjeta, «Copiar para el chat» copia lo del equipo en una
 * línea, y nada se sale de la pantalla a 320 px. No exige frases concretas
 * más allá del focus: el resto depende del dato del día.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar, anchoDePagina } from './navegador.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();

for (const ancho of [390, 320]) {
  await prueba(`el plan de partida a ${ancho}px`, async () => {
    const { contexto, pagina, errores } = await paginaCon(navegador, url, {
      viewport: { width: ancho, height: 760 },
      almacen: { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: ['Layla', 'Fanny', 'Tigreal'], allies: ['Miya'], bans: [], enemyRoam: null, fase: 'picks' } },
    });
    await contexto.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: new URL(url).origin });
    const nombre = (await pagina.locator('.pick .pick-nombre-boton, .pick .pick-name').first().textContent()).trim();
    await pagina.locator('.pick-build').first().click(); await pagina.waitForTimeout(400);
    eq(await pagina.locator('.sheet .plan').count(), 1, 'la hoja no trae el plan');
    // El plan va ARRIBA de la build.
    const orden = await pagina.locator('.build-cuerpo').evaluate((c) => [...c.children].map((e) => e.className));
    ok(/plan/.test(orden[0] ?? ''), `el plan no va el primero: ${orden.join(' | ')}`);
    const focus = pagina.locator('.plan-lista li[data-clave="partida.focus"]');
    eq(await focus.count(), 1, 'con tres enemigos no dice a quién hacer focus');
    const texto = await focus.textContent();
    ok(/Layla|Fanny/.test(texto) && !/Tigreal/.test(texto), `el focus no es un enemigo blando: ${texto}`);
    const sub = await pagina.locator('.plan-sub').allTextContents();
    ok(sub.some((s) => s.includes(nombre)), `lo tuyo no lleva el héroe de la tarjeta (${nombre}): ${sub.join(' | ')}`);
    await pagina.locator('.plan-copiar').click(); await pagina.waitForTimeout(200);
    const copiado = await pagina.evaluate(() => navigator.clipboard.readText());
    const equipo = await pagina.locator('.plan-bloque').first().locator('.plan-lista li').allTextContents();
    eq(copiado, equipo.join(' · '), 'lo copiado no es lo del equipo en una línea');
    eq((await pagina.locator('.plan-copiar').textContent()).trim(), 'Copiado');
    ok((await anchoDePagina(pagina)) <= ancho, `desborde horizontal (${await anchoDePagina(pagina)})`);
    const fuera = await pagina.locator('.plan *').evaluateAll((els, w) => els.filter((e) => e.getBoundingClientRect().right > w + 0.5).map((e) => e.className || e.tagName), ancho);
    ok(!fuera.length, `algo del plan se sale de la pantalla: ${fuera.join(', ')}`);
    ok(!errores.length, `errores de página: ${errores}`);
    await contexto.close();
  });
}

await terminar('interfaz/plan');
await navegador.close();
await cerrar();
