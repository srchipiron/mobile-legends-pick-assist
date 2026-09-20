/**
 * Las hojas y lo que se toca a contrarreloj: atrás y Escape cierran la hoja
 * sin salir de la app, el foco entra y vuelve, Intro elige el prefijo, la
 * fila de maestría no salta al escribir, los chips de baneo no se mueven,
 * los plurales, el nº1 en la primera pantalla, el pie con teclado y la
 * limpieza de nombres fantasma. Cada una nació de un fallo real (CLAUDE.md).
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar } from './navegador.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const LINEA = { 'roam-picker:linea': 'roam' };
const PICKS = { enemies: ['Layla', 'Fanny', 'Pharsa'], allies: ['Chou'], bans: ['Hirara'], enemyRoam: null, fase: 'picks' };
const con = (draft, extra = {}, viewport) => paginaCon(navegador, url, { viewport, almacen: { ...LINEA, 'roam-picker:draft': draft, ...extra } });

await prueba('con Ajustes abierto a 360x640 la lista sigue viéndose', async () => {
  const { contexto, pagina, errores } = await con(PICKS, {}, { width: 360, height: 640 });
  await pagina.locator('.more summary').click(); await pagina.waitForTimeout(300);
  const alto = await pagina.locator('.results').evaluate((e) => e.getBoundingClientRect().height);
  const scroll = await pagina.evaluate(() => document.scrollingElement.scrollHeight);
  ok(alto > 300 && scroll > 640, `con Ajustes abierto los resultados miden ${Math.round(alto)} px y la página mide ${scroll}`);
  ok(!errores.length, `errores: ${errores}`);
  await contexto.close();
});

await prueba('atrás y Escape cierran la hoja sin salir de la app, y cerrar por botón retira la entrada de historial', async () => {
  const { contexto, pagina } = await con(PICKS);
  await pagina.locator('.side.enemy .slot.empty').first().click(); await pagina.waitForTimeout(300);
  eq(await pagina.locator('[role=dialog]').count(), 1, 'no se abre el selector');
  await pagina.goBack(); await pagina.waitForTimeout(300);
  ok(await pagina.locator('[role=dialog]').count() === 0 && pagina.url().startsWith(url), 'atrás no cierra el selector o sale de la app');
  await pagina.locator('.more summary').click(); await pagina.waitForTimeout(200);
  await pagina.locator('.more .tools .reset').nth(1).click(); await pagina.waitForTimeout(300);
  eq(await pagina.locator('[role=dialog]').count(), 1, 'no se abre Partidas');
  await pagina.keyboard.press('Escape'); await pagina.waitForTimeout(300);
  eq(await pagina.locator('[role=dialog]').count(), 0, 'Escape no cierra Partidas');
  await pagina.locator('.more .tools .reset').nth(0).click(); await pagina.waitForTimeout(300);
  await pagina.locator('[role=dialog] .close').first().click(); await pagina.waitForTimeout(300);
  eq(await pagina.locator('[role=dialog]').count(), 0, 'el botón no cierra Maestría');
  ok(await pagina.evaluate(() => history.state?.hoja == null), 'al cerrar por botón no se retira la entrada de historial');
  await contexto.close();
});

await prueba('Intro elige el prefijo y la fila de maestría no salta al escribir', async () => {
  const { contexto, pagina } = await con(PICKS, { 'roam-picker:mastery': { Khufra: { games: 40, winRate: 0.6 } } });
  // El primer hueco de tu equipo es «Tú» (tu pick, solo tu pool): el de un compañero es el siguiente.
  await pagina.locator('.side.ally .slot.empty:not(.yo)').first().click(); await pagina.waitForTimeout(300);
  await pagina.locator('.sheet input').fill('la'); await pagina.waitForTimeout(150);
  const primero = (await pagina.locator('.hero-grid button').first().textContent()).trim();
  ok(/^La/.test(primero), `con «la» el primero no empieza por La: ${primero}`);
  await pagina.locator('.sheet .close').click(); await pagina.waitForTimeout(200);
  await pagina.locator('.more summary').click(); await pagina.waitForTimeout(200);
  await pagina.locator('.more .tools .reset').nth(0).click(); await pagina.waitForTimeout(300);
  const fila = pagina.locator('.mastery-row').nth(3);
  const nombre = (await fila.locator('span').first().textContent()).trim();
  const y0 = await fila.evaluate((e) => e.getBoundingClientRect().top);
  await fila.locator('input').first().fill('4'); await pagina.waitForTimeout(200);
  const y1 = await pagina.locator('.mastery-row', { hasText: nombre }).first().evaluate((e) => e.getBoundingClientRect().top);
  ok(Math.abs(y0 - y1) < 2, `la fila de ${nombre} salta al escribir (${Math.round(y0)} → ${Math.round(y1)})`);
  await contexto.close();
});

await prueba('los chips del siguiente baneo no se mueven: el tocado se queda tachado y el nuevo entra al final', async () => {
  const { contexto, pagina } = await con({ enemies: [], allies: [], bans: [], enemyRoam: null, fase: 'baneos' });
  const chips = pagina.locator('.proximos .chip');
  const antes = await chips.allTextContents();
  eq(antes.length, 8, 'no hay ocho baneos probables');
  const pcts = (await pagina.locator('.proximos .chip-pct').allTextContents()).map((t) => parseInt(t, 10));
  ok(pcts.every((p, i) => i === 0 || p <= pcts[i - 1]), `no van ordenados por tasa de ban: ${pcts.join(' ')}`);
  await chips.first().click(); await pagina.waitForTimeout(300);
  const despues = await chips.allTextContents();
  ok(despues[0] === antes[0] && await chips.first().evaluate((e) => e.classList.contains('elegido')), 'el chip tocado no sigue el primero, tachado');
  ok(despues.length === antes.length + 1 && !antes.includes(despues.at(-1)), `no entra un candidato nuevo al final (${despues.length} chips)`);
  ok(/1\/10/.test(await pagina.locator('.brand .freshness').innerText()), 'no cuenta 1/10');
  await chips.first().click(); await pagina.waitForTimeout(300);
  ok(/0\/10/.test(await pagina.locator('.brand .freshness').innerText()) && !(await chips.first().evaluate((e) => e.classList.contains('elegido'))), 'el segundo toque no lo quita');
  // Dentro del selector, los mismos probables (diez), estables y con tope.
  await pagina.locator('.side.bans .slot.empty').first().click(); await pagina.waitForTimeout(400);
  const sugeridos = pagina.locator('.sheet-sugeridos .chip');
  const a = await sugeridos.allTextContents();
  eq(a.length, 10, `no hay diez chips sugeridos en la hoja (${a.length})`);
  await sugeridos.first().click(); await pagina.waitForTimeout(300);
  const d = await sugeridos.allTextContents();
  ok(d[0] === a[0] && await sugeridos.first().getAttribute('aria-pressed') === 'true', 'en la hoja el tocado no se queda el primero, marcado');
  ok(d.length === a.length + 1 && !a.includes(d.at(-1)), `en la hoja el siguiente no entra al final (${d.length})`);
  ok(await pagina.locator('.sheet').evaluate((e) => e.contains(document.activeElement)), 'el foco no está dentro de la hoja');
  for (let i = 1; i < 10; i++) { await sugeridos.nth(i).click(); await pagina.waitForTimeout(80); }
  eq(await pagina.locator('.sheet-sugeridos .chip[aria-pressed=true]').count(), 10, 'no hay diez marcados');
  const libres = await pagina.locator('.sheet-sugeridos .chip:not([aria-pressed=true])').count();
  const deshabilitados = await pagina.locator('.sheet-sugeridos .chip:not([aria-pressed=true]):disabled').count();
  eq(libres, deshabilitados, `los sin marcar no están deshabilitados con el tope lleno (${deshabilitados}/${libres})`);
  await pagina.locator('.sheet .close').first().click(); await pagina.waitForTimeout(300);
  eq(await pagina.locator('.side.bans .slot:not(.empty)').count(), 10, 'no hay diez baneos en el draft');
  // Con los diez marcados no queda candidato que enseñar: solo los tachados, que se tocan para quitarlos.
  eq(await pagina.locator('.proximos .chip:not(.elegido)').count(), 0, 'con diez baneos siguen saliendo candidatos sin marcar');
  ok(await pagina.evaluate(() => document.activeElement?.closest('.side.bans') != null || document.activeElement === document.body), 'al cerrar el foco no vuelve al hueco que la abrió');
  await contexto.close();
});

await prueba('plurales, sin frases crudas, la probabilidad en la tarjeta y el consejo después del nº1', async () => {
  const { contexto, pagina } = await con({ enemies: ['Layla'], allies: ['Chou', 'Miya', 'Kagura'], bans: [], enemyRoam: null, fase: 'picks' });
  // La tier de mlbb.gg en la tarjeta: una letra al lado del winrate, nunca una
  // clave cruda. Con los datos publicados (3.3.0) la traen los 133 heroes.
  await pagina.locator('.pick .pick-tier').first().waitFor({ timeout: 5000 });
  const tier = await pagina.locator('.pick .pick-tier').first().innerText();
  ok(/^(SS|S|A|B|C|D) en mlbb\.gg$/.test(tier), `la tier de la tarjeta sale rara: «${tier}»`);
  const txt = await pagina.locator('.results').innerText();
  ok(!/1 líneas/i.test(txt) && /1 línea abierta/i.test(txt), 'con una línea abierta no dice «1 línea abierta»');
  const an = await pagina.locator('.analisis').innerText().catch(() => '');
  ok(!/^(tu equipo no tiene|te falta|no hay primera)/mi.test(an), `frase cruda de necesidad en el análisis: ${an.replace(/\n/g, ' | ').slice(0, 160)}`);
  eq(await pagina.locator('.estimacion').count(), 0, 'hay un bloque aparte de estimación: la probabilidad va en la tarjeta');
  const pct = await pagina.locator('.pick .pick-score').first().textContent();
  ok(/^\d{2}%$/.test(pct.trim()), `la tarjeta no enseña la probabilidad en %: ${pct}`);
  ok(await pagina.locator('.equipo').count() === 1 && await pagina.locator('.pick').first().evaluate((e) => e.nextElementSibling?.classList.contains('equipo')), 'el consejo para los compañeros no va justo después del nº1');
  await contexto.close();
});

await prueba('el botón Cerrar del diagnóstico cabe en 360px aunque haya botón de compartir', async () => {
  const contexto = await navegador.newContext({ viewport: { width: 360, height: 640 }, locale: 'es-ES' });
  const pagina = await contexto.newPage();
  await pagina.addInitScript(() => { navigator.share = async () => {}; localStorage.setItem('roam-picker:linea', JSON.stringify('roam')); localStorage.setItem('roam-picker:draft', JSON.stringify({ enemies: ['Layla'], allies: [], bans: [], enemyRoam: null, fase: 'picks' })); });
  await pagina.goto(url, { waitUntil: 'networkidle' }); await pagina.waitForTimeout(600);
  await pagina.locator('.more summary').click(); await pagina.waitForTimeout(200);
  await pagina.getByRole('button', { name: 'Diagnóstico' }).click(); await pagina.waitForTimeout(2000);
  const derecha = await pagina.locator('[role=dialog] .close', { hasText: 'Cerrar' }).evaluate((e) => e.getBoundingClientRect().right);
  ok(derecha <= 360, `Cerrar del diagnóstico fuera de la pantalla (right=${Math.round(derecha)})`);
  await contexto.close();
});

await prueba('un nombre guardado que ya no existe se limpia, y el rival fantasma se desmarca', async () => {
  const { contexto, pagina, errores } = await con({ enemies: ['Layla', 'NoExiste', 'Fanny'], allies: ['Chou', 'Fantasma'], bans: ['Hirara', 'Nadie'], enemyRoam: 'NoExiste', fase: 'picks' });
  await pagina.waitForTimeout(800);
  const d = await pagina.evaluate(() => JSON.parse(localStorage.getItem('roam-picker:draft')));
  ok(d.enemies.length === 2 && d.allies.length === 1 && d.bans.length === 1, `los nombres que no resuelven siguen en el draft (${d.enemies.length}/${d.allies.length}/${d.bans.length})`);
  ok(d.enemyRoam == null, 'el rival marcado que ya no está sigue marcado');
  eq(await pagina.locator('.side.enemy .slot.empty').count(), 3, 'no quedan tres huecos enemigos');
  ok(!errores.length, `errores: ${errores}`);
  await contexto.close();
});

await prueba('la hoja Meta enseña la tier list por línea, con la tuya primero, y se cierra con Escape', async () => {
  const { contexto, pagina, errores } = await con(PICKS);
  await pagina.locator('.more summary').click(); await pagina.waitForTimeout(200);
  // El botón Meta va el ÚLTIMO de la fila a propósito: los de antes se abren por posición.
  await pagina.locator('.more .tools .reset').last().click(); await pagina.waitForTimeout(400);
  eq(await pagina.locator('[role=dialog]').count(), 1, 'no se abre la hoja Meta');
  const titulos = await pagina.locator('[role=dialog] .meta-titulo').allInnerTexts();
  eq(titulos.length, 5, `no salen las cinco líneas: ${titulos.join(' · ')}`);
  // innerText devuelve lo que se VE, y el CSS lo pone en mayúsculas.
  eq(titulos[0].toLowerCase(), 'roam', `tu línea no va la primera: ${titulos[0]}`);
  const filas = await pagina.locator('[role=dialog] .meta-fila').count();
  ok(filas >= 5 * 5, `salen ${filas} filas en total: la lista viene vacía`);
  // El nº1 de tu línea es el que más winrate tiene DE VERDAD en los datos
  // servidos: la hoja ordena por el mismo término que las tarjetas.
  const primero = await pagina.locator('[role=dialog] .meta-fila.top .meta-nombre').first().innerText();
  const wr = await pagina.locator('[role=dialog] .meta-fila.top .meta-wr').first().innerText();
  ok(primero.length > 1 && /^\d{2}\.\d%$/.test(wr), `el nº1 sale raro: «${primero}» «${wr}»`);
  // Nada en crudo ni en otro idioma.
  const texto = await pagina.locator('[role=dialog]').innerText();
  ok(!/meta\.[a-z]/.test(texto), 'sale una clave de texto cruda');
  await pagina.keyboard.press('Escape'); await pagina.waitForTimeout(300);
  eq(await pagina.locator('[role=dialog]').count(), 0, 'Escape no cierra Meta');
  ok(!errores.length, `errores: ${errores}`);
  await contexto.close();
});

await prueba('el pie se abre con teclado, la cabecera dice la línea y el foco vuelve al botón que abrió la hoja', async () => {
  const { contexto, pagina } = await con(PICKS);
  const pie = pagina.locator('footer.pie');
  ok(await pie.getAttribute('role') === 'button' && await pie.getAttribute('aria-expanded') === 'false', 'el pie no es un botón cerrado');
  await pie.focus(); await pagina.keyboard.press('Enter'); await pagina.waitForTimeout(200);
  eq(await pie.getAttribute('aria-expanded'), 'true', 'Enter no abre el pie');
  const html = (await pagina.content()).replace(/<script[\s\S]*?<\/script>/g, '');
  ok(!/\bMD\b|\bPD\b/.test(html), '«MD»/«PD» a pelo en español');
  eq((await pagina.locator('h1').first().textContent()).trim(), 'Roam', 'la cabecera no dice la línea');
  await pagina.locator('.more summary').click(); await pagina.waitForTimeout(200);
  const boton = pagina.locator('.more .tools .reset').nth(0);
  await boton.focus(); await pagina.keyboard.press('Enter'); await pagina.waitForTimeout(300);
  ok(await pagina.locator('[role=dialog]').count() === 1 && await pagina.locator('[role=dialog]').evaluate((e) => e.contains(document.activeElement)), 'Maestría no se abre con teclado con el foco dentro');
  await pagina.locator('[role=dialog] .close').first().click(); await pagina.waitForTimeout(300);
  ok(await boton.evaluate((e) => e === document.activeElement), 'al cerrar, el foco no vuelve al botón que abrió la hoja');
  await contexto.close();
});

await terminar('interfaz/hojas');
await navegador.close();
await cerrar();
