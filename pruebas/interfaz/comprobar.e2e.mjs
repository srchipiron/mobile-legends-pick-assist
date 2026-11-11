/**
 * Comprobar la tablet (3.101.0), en un Chrome de verdad con la base de datos
 * simulada: el numerito en Ajustes, las tres partidas de la semana con su
 * comprobante (la pantalla del final que leyó), y lo que hace cada botón.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar, abrirAjustes } from './navegador.mjs';
import { supabaseFalso } from '../fixtures/supabase-falso.mjs';
import { escribirPng } from '../../scripts/lector/png.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const SUPA = 'https://abcdefghijklmnopqrst.supabase.co';
const CLAVE = 'K'.repeat(43);
const LINEA = { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: ['Layla'], allies: [], bans: [], enemyRoam: null, fase: 'picks' } };
const TIRA = escribirPng({ ancho: 320, alto: 56, rgba: new Uint8Array(320 * 56 * 4).map((_, i) => (i % 4 === 3 ? 255 : (i * 13) % 255)) }).toString('base64');
const leer = (pagina, clave) => pagina.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), clave);
const conBaseDeDatos = (s) => async (p) => {
  await p.route(`${url}comunidad.json*`, (ruta) => ruta.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ url: SUPA, clave: s.clavePublica }) }));
  await p.route(`${SUPA}/**`, async (ruta) => {
    const r = ruta.request();
    if (r.method() === 'OPTIONS') { await ruta.fulfill({ status: 204, headers: { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*', 'Access-Control-Allow-Methods': 'POST' } }); return; }
    const m = r.url().match(/\/rest\/v1\/rpc\/(\w+)$/);
    const res = m ? s.atender(m[1], JSON.parse(r.postData() ?? '{}'), r.headers()) : { status: 404, cuerpo: {} };
    await ruta.fulfill({ status: res.status, contentType: 'application/json', headers: { 'Access-Control-Allow-Origin': '*' }, body: JSON.stringify(res.cuerpo) });
  });
};

try {
  await prueba('tres partidas de la tablet a la semana, con la pantalla que leyó, y cada botón hace lo que dice', async () => {
    const ahora = Date.now();
    const partidas = Array.from({ length: 5 }, (_, i) => ({ t: ahora - (i + 1) * 6 * 3600000, pick: 'Diggie', gane: i % 2 === 0, rango: 'glory', origen: 'lector', recomendados: ['Diggie', 'Estes', 'Floryn'], draft: { linea: 'roam', enemigos: ['Layla'], aliados: [] } }));
    const s = supabaseFalso();
    for (const p of partidas) s.recortes.push({ clave: CLAVE, recibido: ahora - 1000, d: { v: 1, tipo: 'resultado', t: p.t, gane: p.gane, parecido: 0.98, capturas: [{ id: 'fotograma-x', tira: TIRA }] } });
    const comunidad = { activo: true, clave: CLAVE, completo: true, config: { url: SUPA, clave: s.clavePublica } };
    const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:partidas': partidas, 'roam-picker:comunidad': comunidad }, sinServiceWorker: true, antes: conBaseDeDatos(s) });
    try {
      eq((await pagina.locator('.more summary .por-comprobar').innerText()).trim(), '3', 'Ajustes no dice cuántas hay por comprobar');
      await abrirAjustes(pagina);
      await pagina.locator('.more .tools .reset').nth(1).click(); await pagina.waitForTimeout(400);
      const tarjeta = pagina.locator('.comprobar');
      eq(await tarjeta.locator('.comprobar-partida').count(), 3, 'no pide tres partidas');
      await tarjeta.locator('.partida-comprobante').first().waitFor({ timeout: 10000 });
      eq(await tarjeta.locator('.partida-comprobante').count(), 3, 'las partidas a comprobar no enseñan la pantalla que leyó la tablet');
      ok(await pagina.locator('.partida + .partida-comprobante').count() >= 5, 'la lista no enseña el comprobante de cada partida');
      // Todo bien: se apunta como acierto y sale de la lista.
      const primera = Number((await leer(pagina, 'roam-picker:partidas')).length);
      await tarjeta.locator('.comprobar-partida').first().getByRole('button', { name: 'Todo bien' }).click(); await pagina.waitForTimeout(200);
      let hechas = await leer(pagina, 'roam-picker:comprobadas');
      ok(hechas.length === 1 && hechas[0].bien === true, `«Todo bien» no se apunta: ${JSON.stringify(hechas)}`);
      eq(await tarjeta.locator('.comprobar-partida').count(), 2);
      ok(/acertó 1 de 1/.test(await tarjeta.innerText()), 'no dice cuánto acierta');
      // El resultado no: se da la vuelta a la partida (con su hora de arreglo) y se apunta el fallo.
      const t2 = hechas.length && (await pagina.locator('.comprobar-partida').first().innerText());
      await tarjeta.locator('.comprobar-partida').first().getByRole('button', { name: 'El resultado no' }).click(); await pagina.waitForTimeout(200);
      hechas = await leer(pagina, 'roam-picker:comprobadas');
      const fallada = (await leer(pagina, 'roam-picker:partidas')).find((p) => p.t === hechas[0].t);
      const antes = partidas.find((p) => p.t === hechas[0].t);
      ok(hechas[0].bien === false && hechas[0].que === 'resultado' && fallada.gane === !antes.gane && Number.isFinite(fallada.editada), `«El resultado no» no da la vuelta a la partida: ${JSON.stringify({ hechas, fallada, t2 })}`);
      ok(/acertó 1 de 2/.test(await tarjeta.innerText()) && await tarjeta.locator('.frase.ojo').count() === 1, 'con un fallo no lo dice en rojo');
      // Mi héroe no: se elige el héroe y se apunta el fallo de héroe.
      await tarjeta.locator('.comprobar-partida').first().getByRole('button', { name: 'Mi héroe no' }).click();
      await tarjeta.locator('.partida-cambiar').getByRole('button', { name: 'Estes', exact: true }).click(); await pagina.waitForTimeout(200);
      hechas = await leer(pagina, 'roam-picker:comprobadas');
      const cambiada = (await leer(pagina, 'roam-picker:partidas')).find((p) => p.t === hechas[0].t);
      ok(hechas.length === 3 && hechas[0].que === 'heroe' && cambiada.pick === 'Estes', `«Mi héroe no» no cambia el héroe: ${JSON.stringify({ hechas, cambiada })}`);
      eq(await tarjeta.locator('.comprobar-partida').count(), 0, 'hechas las tres, sigue pidiendo');
      eq((await leer(pagina, 'roam-picker:partidas')).length, primera, 'comprobar quita o añade partidas');
      ok(!errores.length, `errores de página: ${errores}`);
    } finally { await contexto.close(); }
  });

  await prueba('sin partidas de la tablet esta semana no sale nada (ni el numerito)', async () => {
    const vieja = { t: Date.now() - 20 * 86400000, pick: 'Diggie', gane: true, rango: 'glory', origen: 'lector', recomendados: ['Diggie'] };
    const aMano = { t: Date.now() - 3600000, pick: 'Estes', gane: true, rango: 'glory', recomendados: ['Estes'] };
    const { contexto, pagina } = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:partidas': [vieja, aMano] } });
    try {
      eq(await pagina.locator('.por-comprobar').count(), 0, 'sale el numerito sin nada que comprobar');
      await abrirAjustes(pagina);
      await pagina.locator('.more .tools .reset').nth(1).click(); await pagina.waitForTimeout(400);
      eq(await pagina.locator('.comprobar').count(), 0, 'sale la tarjeta sin nada que comprobar');
    } finally { await contexto.close(); }
  });
} finally {
  await navegador.close();
  await cerrar();
}

await terminar('interfaz/comprobar');
