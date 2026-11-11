/**
 * Desvincular y volver a vincular la tablet (3.100.0, de la revisión de
 * botones): «Desvincular» dejaba «Leer solo» encendido sin tablet (el bucle
 * de lectura giraba en vacío y, al volver a vincular a mano, salía encendido
 * sin elegirlo), y el aviso de la tablet de antes («no acepta el código»)
 * seguía bajo «Leer del juego» con la nueva ya contestando bien.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar, abrirAjustes } from './navegador.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
const TABLET = { direccion: '192.168.68.116:47323', codigo: 'ABCDEFGH23' };
const leer = (pagina, clave) => pagina.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), clave);

try {
  await prueba('desvincular apaga «Leer solo» y el aviso de la tablet de antes no sobrevive a otra vinculación', async () => {
    let codigoMalo = true;
    const { contexto, pagina } = await paginaCon(navegador, url, {
      almacen: { 'roam-picker:lector-tablet': TABLET, 'roam-picker:linea': 'roam', 'roam-picker:lector-auto': true, 'roam-picker:draft': { enemies: [], allies: [], bans: [], fase: 'picks' } },
      antes: async (p) => {
        await p.route('http://192.168.68.116:47323/**', (ruta) => {
          const q = ruta.request();
          if (q.method() === 'OPTIONS') return ruta.fulfill({ status: 204, headers: CORS });
          if (new URL(q.url()).pathname === '/leer' && codigoMalo) return ruta.fulfill({ status: 401, headers: CORS, body: JSON.stringify({ error: 'codigo' }) });
          return ruta.fulfill({ status: 200, headers: CORS, body: JSON.stringify({ ok: true, enemigos: [], tuyos: [], suyos: [], aliados: [] }) });
        });
      },
    });
    try {
      // Con el código malo, la primera lectura sola deja el aviso.
      await pagina.locator('.lector-aviso').first().waitFor({ timeout: 30000 });
      ok(/código/i.test(await pagina.locator('.lector-aviso').first().innerText()), 'la prueba necesita el aviso del código');
      await abrirAjustes(pagina);
      await pagina.getByRole('button', { name: 'Desvincular la tablet' }).click();
      await pagina.waitForTimeout(300);
      eq(await leer(pagina, 'roam-picker:lector-tablet'), null);
      eq(await leer(pagina, 'roam-picker:lector-auto'), false, 'desvincular deja «Leer solo» encendido');
      // Otra vinculación a mano, con la tablet ya contestando bien: sin el aviso de antes y sin «Leer solo» puesto solo.
      codigoMalo = false;
      await pagina.getByPlaceholder('Dirección (192.168…)').fill('192.168.68.116');
      await pagina.getByPlaceholder('Código').fill('ZZZZZZZZ99');
      await pagina.getByRole('button', { name: 'Vincular' }).click();
      await pagina.waitForTimeout(500);
      eq(await pagina.locator('.lector-aviso').count(), 0, `el aviso de la tablet de antes sigue: ${await pagina.locator('.lector-aviso').allTextContents()}`);
      eq(await leer(pagina, 'roam-picker:lector-auto'), false, 'al vincular a mano «Leer solo» sale encendido sin elegirlo');
    } finally { await contexto.close(); }
  });
} finally {
  await navegador.close();
  await cerrar();
}

await terminar('interfaz/vincular');
