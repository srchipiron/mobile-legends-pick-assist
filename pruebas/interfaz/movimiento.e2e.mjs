/**
 * Movimiento y tacto (3.22.0): las hojas suben con un muelle y se cierran
 * arrastrando el asa hacia abajo; las tarjetas se deslizan a su puesto nuevo
 * cuando cambia el orden; y el móvil vibra al marcar o quitar algo del
 * draft. Todo se apaga con «reducir movimiento» (la vibración, con su
 * interruptor), y nada de esto mueve lo que se toca a contrarreloj.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar } from './navegador.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();

const DRAFT = { enemies: ['Layla', 'Fanny', 'Tigreal'], allies: ['Chou'], bans: [], enemyRoam: null, fase: 'picks' };
const almacen = { 'roam-picker:linea': 'roam', 'roam-picker:draft': DRAFT };

// Apunta cada animación de tarjeta (Web Animations) y cada entrada de hoja
// (las transiciones CSS que arrancan al montarse), sin depender de cronometrar.
const espiar = async (pagina, { quieto = false } = {}) => {
  if (quieto) await pagina.emulateMedia({ reducedMotion: 'reduce' });
  await pagina.addInitScript(() => {
    window.__animadas = [];
    window.__entradas = [];
    window.__vibra = [];
    const original = window.Element.prototype.animate;
    window.Element.prototype.animate = function (fotogramas, opciones) {
      if (this.dataset?.heroe) window.__animadas.push({ heroe: this.dataset.heroe, fotogramas: JSON.stringify(fotogramas) });
      return original.call(this, fotogramas, opciones);
    };
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: (ms) => { window.__vibra.push(ms); return true; } });
    // Las transiciones de entrada de la hoja (las dispara `@starting-style`).
    document.addEventListener('transitionrun', (e) => {
      if (e.target.classList?.contains('sheet')) window.__entradas.push(e.propertyName);
    }, true);
  });
};
const orden = (pagina) => pagina.locator('.results > .pick').evaluateAll((els) => els.map((e) => e.dataset.heroe));
const abrirSelector = async (pagina) => { await pagina.locator('.side.enemy .slot.empty').first().click(); await pagina.waitForTimeout(400); };
const hojas = (pagina) => pagina.locator('[role=dialog]').count();
// Arrastra con el ratón (Playwright manda pointerdown/move/up como un dedo).
const arrastrar = async (pagina, x, y0, y1, pasos) => {
  await pagina.mouse.move(x, y0);
  await pagina.mouse.down();
  await pagina.mouse.move(x, y1, { steps: pasos });
  await pagina.mouse.up();
  await pagina.waitForTimeout(450);
};

await prueba('la hoja entra con un muelle y se cierra arrastrando el asa hacia abajo, no desde la rejilla', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen, antes: espiar });
  await abrirSelector(pagina);
  const entradas = await pagina.evaluate(() => window.__entradas);
  ok(entradas.includes('translate'), `la hoja no entra con transición de translate: ${JSON.stringify(entradas)}`);
  const asa = await pagina.locator('.sheet-asa').boundingBox();
  ok(asa && asa.height >= 20, `no hay asa donde cogerla: ${JSON.stringify(asa)}`);
  const x = asa.x + asa.width / 2;
  // Un arrastre corto y lento no cierra: vuelve a su sitio.
  await arrastrar(pagina, x, asa.y + 10, asa.y + 50, 20);
  eq(await hojas(pagina), 1, 'un arrastre de 40 px cierra la hoja');
  eq(await pagina.locator('.sheet').evaluate((e) => e.style.translate), '', 'la hoja se queda desplazada tras soltarla');
  // Desde la rejilla, ni con 250 px: ahí el dedo toca héroes o desplaza.
  const cara = await pagina.locator('.hero-grid button').nth(4).boundingBox();
  await arrastrar(pagina, cara.x + cara.width / 2, cara.y + 5, cara.y + 255, 10);
  eq(await hojas(pagina), 1, 'arrastrar desde la rejilla cierra la hoja');
  // Desde el asa, 200 px: se cierra, y la entrada del historial se retira
  // igual que con el botón (atrás no «vuelve» a una hoja cerrada).
  await arrastrar(pagina, x, asa.y + 10, asa.y + 210, 10);
  eq(await hojas(pagina), 0, 'arrastrar el asa 200 px no cierra la hoja');
  eq(await pagina.evaluate(() => window.history.state?.hoja ?? null), null, 'la hoja cerrada arrastrando deja su entrada en el historial');
  eq(errores.join(' | '), '', 'errores en la página');
  await contexto.close();
});

await prueba('las tarjetas que cambian de puesto se deslizan; las demás no se mueven', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen, antes: espiar });
  eq(await pagina.evaluate(() => window.__animadas.length), 0, 'las tarjetas se animan al cargar');
  const antes = await orden(pagina);
  await pagina.getByRole('button', { name: 'Quitar Fanny' }).click();
  await pagina.waitForTimeout(500);
  const despues = await orden(pagina);
  ok(antes.join() !== despues.join(), 'quitar a Fanny no cambia el orden: la prueba no mide nada');
  const animadas = await pagina.evaluate(() => window.__animadas);
  ok(animadas.length > 0, 'ninguna tarjeta se desliza al cambiar el orden');
  for (const a of animadas) {
    const cambio = antes.indexOf(a.heroe) !== despues.indexOf(a.heroe);
    ok(cambio, `${a.heroe} se anima sin cambiar de puesto`);
    ok(antes.includes(a.heroe) ? /translate/.test(a.fotogramas) : /opacity/.test(a.fotogramas), `${a.heroe}: animación inesperada ${a.fotogramas}`);
  }
  // Las que entran entre las ocho aparecen con un fundido.
  const nuevas = despues.filter((h) => !antes.includes(h));
  for (const h of nuevas) ok(animadas.some((a) => a.heroe === h), `${h} entra entre las ocho sin fundido`);
  eq(errores.join(' | '), '', 'errores en la página');
  await contexto.close();
});

await prueba('con «reducir movimiento» nada se anima', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen, antes: (p) => espiar(p, { quieto: true }) });
  const antes = await orden(pagina);
  await pagina.getByRole('button', { name: 'Quitar Fanny' }).click();
  await pagina.waitForTimeout(500);
  ok(antes.join() !== (await orden(pagina)).join(), 'el orden no cambia: la prueba no mide nada');
  eq(await pagina.evaluate(() => window.__animadas.length), 0, 'las tarjetas se animan con reducir movimiento');
  await abrirSelector(pagina);
  eq(await pagina.evaluate(() => window.__entradas).then((e) => e.join()), '', 'la hoja entra animada con reducir movimiento');
  eq(errores.join(' | '), '', 'errores en la página');
  await contexto.close();
});

await prueba('vibra al tocar el draft (no al cargarlo) y el interruptor lo apaga y se recuerda', async () => {
  // Un nombre que ya no existe: la limpieza al cargar cambia el draft sin toque.
  const { contexto, pagina, errores } = await paginaCon(navegador, url, {
    almacen: { ...almacen, 'roam-picker:draft': { ...DRAFT, enemies: [...DRAFT.enemies, 'Nadie Nunca'] } },
    antes: espiar,
  });
  eq(await pagina.evaluate(() => window.__vibra.length), 0, 'vibra sin que nadie toque (limpieza del draft al cargar)');
  await abrirSelector(pagina);
  await pagina.locator('.sheet input').fill('Kagura'); await pagina.waitForTimeout(150);
  await pagina.locator('.hero-grid button', { hasText: 'Kagura' }).first().click(); await pagina.waitForTimeout(150);
  await pagina.locator('.sheet .close').first().click(); await pagina.waitForTimeout(300);
  await pagina.getByRole('button', { name: 'Quitar Layla' }).click(); await pagina.waitForTimeout(200);
  eq(await pagina.evaluate(() => window.__vibra.join()), '10,10', 'no vibra una vez por toque (meter y quitar)');
  const interruptor = pagina.locator('.aviso-ajustes .tacto');
  eq(await interruptor.getAttribute('aria-pressed'), 'true', 'la vibración no viene encendida');
  await interruptor.click(); await pagina.waitForTimeout(150);
  eq(await pagina.evaluate(() => localStorage.getItem('roam-picker:tacto')), 'false', 'apagarla no se guarda');
  await pagina.getByRole('button', { name: 'Quitar Tigreal' }).click(); await pagina.waitForTimeout(200);
  eq(await pagina.evaluate(() => window.__vibra.length), 2, 'vibra con el interruptor apagado');
  await pagina.reload({ waitUntil: 'networkidle' }); await pagina.waitForTimeout(400);
  eq(await pagina.locator('.aviso-ajustes .tacto').getAttribute('aria-pressed'), 'false', 'el interruptor no se recuerda al recargar');
  await pagina.getByRole('button', { name: 'Quitar Kagura' }).click(); await pagina.waitForTimeout(200);
  eq(await pagina.evaluate(() => window.__vibra.length), 0, 'tras recargar con la vibración apagada, vibra');
  eq(errores.join(' | '), '', 'errores en la página');
  await contexto.close();
});

await navegador.close();
await cerrar();
terminar('interfaz/movimiento');
