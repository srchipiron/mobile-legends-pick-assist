/**
 * El consejo para los compañeros en pantalla: solo con enemigos, plegado,
 * cuatro líneas (nunca la tuya), tres opciones por línea, el rival de la
 * línea, el motivo positivo delante, y tocar una opción la mete en tu equipo
 * y cierra esa línea.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar, anchoDePagina, elegirEnSelector } from './navegador.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();

for (const ancho of [390, 360]) {
  await prueba(`el consejo para los compañeros a ${ancho}px`, async () => {
    const { contexto, pagina, errores } = await paginaCon(navegador, url, {
      viewport: { width: ancho, height: 844 },
      almacen: { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: [], allies: [], bans: [], enemyRoam: null, fase: 'picks' } },
    });
    eq(await pagina.locator('.equipo').count(), 0, 'sin enemigos hay consejo para los compañeros');
    await pagina.locator('.side.enemy .slot.empty').first().click(); await pagina.waitForTimeout(250);
    await elegirEnSelector(pagina, 'Layla');
    // Desde 3.16.0 el selector de picks no se cierra solo: «Listo».
    await pagina.locator('.sheet .close').first().click(); await pagina.waitForTimeout(300);
    eq(await pagina.locator('.equipo').count(), 1, 'con una enemiga no aparece el bloque');
    ok(!(await pagina.locator('.equipo').evaluate((e) => e.open)), 'no viene plegado por defecto');
    await pagina.locator('.equipo > summary').click(); await pagina.waitForTimeout(300);
    const lineas = await pagina.locator('.equipo-nombre').allTextContents();
    ok(lineas.length === 4 && !lineas.some((l) => /roam/i.test(l)), `no son cuatro líneas sin roam: ${lineas.join(' | ')}`);
    ok(lineas.some((l) => /oro|gold/i.test(l) && /contra Layla/.test(l)), `la línea de oro no dice «contra Layla»: ${lineas.join(' | ')}`);
    eq(await pagina.locator('.equipo-chips .chip').count(), 12, 'no hay tres opciones por línea');
    ok(await pagina.locator('.equipo-motivo .reasons li').count() >= 1, 'ninguna línea explica el porqué del primero');
    // El motivo positivo va DELANTE en cada línea (si lo hay). No se exige que
    // lo haya: el 27 de septiembre de 2026 el mejor consejo de la primera
    // línea solo tenía motivos en contra («pierde contra Layla») y la prueba,
    // que pedía un positivo el primero, fallaba por el dato del día.
    const listas = await pagina.locator('.equipo-motivo .reasons').evaluateAll((ls) => ls.map((l) => [...l.querySelectorAll('li')].map((li) => !li.classList.contains('bad'))));
    ok(listas.every((l) => l.every((bueno, i) => !bueno || l.slice(0, i).every(Boolean))), `un motivo en contra va delante de uno a favor: ${JSON.stringify(listas)}`);
    ok((await anchoDePagina(pagina)) <= ancho, `desborde horizontal (${await anchoDePagina(pagina)})`);
    const nombre = (await pagina.locator('.equipo-chips .chip').first().textContent()).replace(/\d+%$/, '').trim();
    await pagina.locator('.equipo-chips .chip').first().click(); await pagina.waitForTimeout(400);
    eq(await pagina.locator('.side.ally .slot:not(.empty)').count(), 1, `tocar la opción no la mete en tu equipo (${nombre})`);
    eq((await pagina.locator('.equipo-nombre').allTextContents()).length, 3, 'la línea del compañero no se cierra');
    ok(!(await pagina.locator('.equipo-chips .chip').allTextContents()).some((t) => t.replace(/\d+%$/, '').trim() === nombre), 'el compañero ya elegido se vuelve a aconsejar');
    ok(!errores.length, `errores de página: ${errores}`);
    await contexto.close();
  });
}

await terminar('interfaz/equipo');
await navegador.close();
await cerrar();
