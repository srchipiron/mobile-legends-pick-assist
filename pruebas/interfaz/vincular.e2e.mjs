/**
 * Desvincular y volver a vincular la tablet: desvincular apaga «Leer solo»
 * (si no, giraba en vacío y al volver a vincular a mano salía encendido sin
 * elegirlo) y el aviso de la tablet de antes («no acepta el código») no
 * sobrevive a otra vinculación.
 */
import { servirDist, abrirNavegador, paginaCon, test, after, ok, eq, abrirAjustes, leerGuardado } from './navegador.mjs';
import { tabletFalsa, TABLET } from './tablet-falsa.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
after(async () => {
  await navegador.close();
  await cerrar();
});

test('desvincular apaga «Leer solo» y el aviso de la tablet de antes no sobrevive a otra vinculación', async () => {
  const tablet = tabletFalsa({ codigo: 'OTROCODIGO9' });
  const { contexto, pagina } = await paginaCon(navegador, url, {
    almacen: { 'roam-picker:lector-tablet': TABLET, 'roam-picker:linea': 'roam', 'roam-picker:lector-auto': true, 'roam-picker:draft': { enemies: [], allies: [], bans: [], fase: 'picks' } },
    antes: (p) => tablet.enganchar(p),
  });
  try {
    await pagina.locator('.lector-aviso').first().waitFor({ timeout: 15000 });
    ok(/código/i.test(await pagina.locator('.lector-aviso').first().innerText()), 'la prueba necesita el aviso del código');
    await abrirAjustes(pagina);
    await pagina.getByRole('button', { name: 'Desvincular la tablet' }).click();
    await pagina.waitForTimeout(300);
    eq(await leerGuardado(pagina, 'roam-picker:lector-tablet'), null);
    eq(await leerGuardado(pagina, 'roam-picker:lector-auto'), false, 'desvincular deja «Leer solo» encendido');
    await pagina.getByPlaceholder('Dirección (192.168…)').fill('192.168.68.116');
    await pagina.getByPlaceholder('Código').fill('OTROCODIGO9');
    await pagina.getByRole('button', { name: 'Vincular' }).click();
    await pagina.waitForTimeout(500);
    eq(await pagina.locator('.lector-aviso').count(), 0, `el aviso de la tablet de antes sigue: ${await pagina.locator('.lector-aviso').allTextContents()}`);
    eq(await leerGuardado(pagina, 'roam-picker:lector-auto'), false, 'al vincular a mano «Leer solo» sale encendido sin elegirlo');
  } finally { await contexto.close(); }
});
