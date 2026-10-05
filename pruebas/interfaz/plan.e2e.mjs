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
    eq(await pagina.locator('.sheet .plan-partida').count(), 1, 'la hoja no trae el plan');
    // El plan va ARRIBA de la build.
    const orden = await pagina.locator('.build-cuerpo').evaluate((c) => [...c.children].map((e) => e.className));
    ok(/plan-partida/.test(orden[0] ?? ''), `el plan no va el primero: ${orden.join(' | ')}`);
    const focus = pagina.locator('.plan-lista li[data-clave="partida.focus"]');
    eq(await focus.count(), 1, 'con tres enemigos no dice a quién hacer focus');
    const texto = await focus.textContent();
    ok(/Layla|Fanny/.test(texto) && !/Tigreal/.test(texto), `el focus no es un enemigo blando: ${texto}`);
    const titulo = await pagina.locator('.plan-partida .build-nucleo').first().textContent();
    ok(titulo.includes(nombre), `el plan no lleva el héroe de la tarjeta (${nombre}): ${titulo}`);
    // Cómo va a ir la partida (3.43.0): seis barras con su porcentaje y una frase.
    const tramos = await pagina.locator('.curva-tramo .curva-pct').allTextContents();
    eq(tramos.length, 6, `no salen las seis barras de la partida: ${tramos.join(' ')}`);
    ok(tramos.every((x) => /^\d{1,2}%$/.test(x.trim())), `un porcentaje de tramo raro: ${tramos.join(' ')}`);
    ok((await pagina.locator('.curva-resumen').textContent()).trim().length > 20, 'la partida no se resume en una frase');
    const etapas = await pagina.locator('.plan-etapa li').allTextContents();
    ok(etapas.every((x) => x.trim() && !/[{}]|etapa\.|partida\.|problema\./.test(x)), `una frase de etapa sin traducir: ${etapas.join(' | ')}`);
    await pagina.locator('.plan-copiar').click(); await pagina.waitForTimeout(200);
    const copiado = await pagina.evaluate(() => navigator.clipboard.readText());
    const equipo = await pagina.locator('.plan-equipo .plan-lista li').allTextContents();
    eq(copiado, equipo.join(' · '), 'lo copiado no es lo del equipo en una línea');
    eq((await pagina.locator('.plan-copiar').textContent()).trim(), 'Copiado');
    ok((await anchoDePagina(pagina)) <= ancho, `desborde horizontal (${await anchoDePagina(pagina)})`);
    // `.plan-partida`, no `.plan` (que desde 3.38.0 es el plan A·B·C de los
    // baneos): con la clase vieja esta comprobación no miraba nada.
    const fuera = await pagina.locator('.plan-partida *').evaluateAll((els, w) => els.filter((e) => e.getBoundingClientRect().right > w + 0.5).map((e) => e.className || e.tagName), ancho);
    ok(!fuera.length, `algo del plan se sale de la pantalla: ${fuera.join(', ')}`);
    ok((await pagina.locator('.plan-partida *').count()) > 10, 'la comprobación de desborde no mira el plan');
    ok(!errores.length, `errores de página: ${errores}`);
    await contexto.close();
  });
}

await terminar('interfaz/plan');
await navegador.close();
await cerrar();
