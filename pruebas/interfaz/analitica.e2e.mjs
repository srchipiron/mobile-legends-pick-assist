/**
 * El análisis de tus partidas (3.88.0) en un Chrome de verdad: se abre desde
 * «Ajustes» en el móvil, desde la barra en el ordenador y con `#analisis`
 * solo; las cifras son las de tus partidas, la evolución pinta una barra por
 * semana con partidas, cada héroe y cada compañero lleva su intervalo, y
 * «mejor que tu media» sale solo donde el intervalo la deja fuera.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar } from './navegador.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const DIA = 24 * 60 * 60 * 1000;
const AHORA = Date.now();
const LINEA = { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: ['Layla'], allies: [], bans: [], enemyRoam: null, fase: 'picks' } };

// 40 partidas en 5 semanas (la de hace 3 sin ninguna): con Gord a tu lado
// ganas 10 de 10 (sin él, 10 de 30: la media es el 50%).
function partidas() {
  const lista = [];
  const dias = [1, 2, 3, 4, 5, 6, 8, 9, 10, 11, 12, 13, 15, 16, 17, 18, 19, 20, 29, 30, 31, 32, 33, 34, 36, 37, 38, 39, 40, 41];
  for (let i = 0; i < 40; i++) {
    const conGord = i < 10;
    const d = dias[i % dias.length] + (i >= dias.length ? 0.3 : 0);
    lista.push({
      t: AHORA - d * DIA, pick: i % 2 ? 'Floryn' : 'Rafaela', gane: conGord ? true : i % 3 === 0, rango: 'glory',
      recomendados: ['Floryn', 'Rafaela', 'Diggie'],
      draft: { linea: 'roam', aliados: conGord ? ['Gord', 'Layla'] : ['Selena', 'Layla'], enemigos: ['Clint', 'Khufra'] },
    });
  }
  return lista;
}

await prueba('en el móvil, desde Ajustes: cifras, una barra por semana con partidas, héroes y compañeros con su intervalo', async () => {
  const lista = partidas();
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:partidas': lista }, sinServiceWorker: true });
  await pagina.locator('.more summary').click();
  await pagina.locator('.more').getByRole('button', { name: 'Análisis', exact: true }).click();
  await pagina.locator('.analitica').waitFor();
  const cifras = await pagina.locator('.ana-cifra strong').allTextContents();
  eq(cifras[0], '40', 'las partidas no son las tuyas');
  const ganadas = lista.filter((p) => p.gane).length;
  eq(cifras[1], `${Math.round((ganadas / 40) * 100)}%`, 'el winrate no es el tuyo');
  // Semanas con partidas: las de hace 0, 1, 2, 4 y 5 (la 3 vacía).
  eq(await pagina.locator('.ana-barra').count(), 5, 'no hay una barra por semana con partidas');
  ok(await pagina.locator('.ana-vacia').count() >= 1, 'una semana sin partidas no deja hueco');
  ok(/\d+% \(\d+ de \d+\)/.test(await pagina.locator('.ana-barra title').first().textContent()), 'la barra no dice su número al pasar por encima');
  // Tus héroes: Floryn y Rafaela, 20 cada uno, con su intervalo.
  const heroes = pagina.getByRole('region', { name: 'Con qué héroe juegas mejor' });
  eq(await heroes.locator('.ana-fila').count(), 2, 'no salen tus dos héroes');
  eq(await heroes.locator('.ana-fila img').count(), 2, 'los héroes salen sin su cara');
  ok(await heroes.locator('.ana-intervalo').first().getAttribute('aria-label').then((s) => /entre el \d+% y el \d+%/.test(s)), 'un héroe sin intervalo');
  // Con Gord ganas 10 de 10 y tu media es el 50%: es el único «mejor que tu media».
  const con = pagina.getByRole('region', { name: 'Compañeros con los que ganas' });
  eq((await con.locator('.ana-nombre').first().textContent()).trim(), 'Gord', 'el mejor compañero no es Gord');
  ok(await con.locator('.ana-fila.mejor').count() === 1, 'Gord 10 de 10 no sale como mejor que tu media, o sale otro');
  ok(/10 de 10/.test(await con.locator('.ana-fila').first().textContent()), 'Gord no lleva 10 de 10');
  // Nada se sale del ancho del móvil.
  const ancho = await pagina.evaluate(() => document.querySelector('.analitica').scrollWidth - document.querySelector('.analitica').clientWidth);
  ok(ancho <= 1, `el análisis se sale del ancho del móvil (${ancho} px)`);
  eq(errores.length, 0, errores.join(' | '));
  await contexto.close();
});

await prueba('en el ordenador: desde la barra y con #analisis solo', async () => {
  const lista = partidas();
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { viewport: { width: 1440, height: 900 }, almacen: { ...LINEA, 'roam-picker:partidas': lista }, sinServiceWorker: true });
  await pagina.locator('.barra-pc').getByRole('button', { name: 'Análisis' }).click();
  await pagina.locator('.analitica').waitFor();
  await pagina.keyboard.press('Escape');
  await pagina.locator('.analitica').waitFor({ state: 'detached' });
  await contexto.close();
  const solo = await paginaCon(navegador, `${url}#analisis`, { viewport: { width: 1440, height: 900 }, almacen: { ...LINEA, 'roam-picker:partidas': lista }, sinServiceWorker: true });
  await solo.pagina.locator('.analitica').waitFor();
  eq(await solo.pagina.locator('.draft').count(), 0, 'detrás del análisis está la app entera');
  ok(!(await solo.pagina.evaluate(() => window.location.hash)), 'el #analisis se queda en la dirección');
  await solo.pagina.getByRole('button', { name: 'Cerrar' }).click();
  await solo.pagina.locator('.analitica').waitFor({ state: 'detached' });
  ok(await solo.pagina.locator('.draft').count() === 1, 'cerrar no deja la app normal');
  eq(errores.length + solo.errores.length, 0, [...errores, ...solo.errores].join(' | '));
  await solo.contexto.close();
});

await prueba('sin partidas lo dice, y «Tus partidas» lleva al análisis', async () => {
  const { contexto, pagina } = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:partidas': partidas().slice(0, 3) }, sinServiceWorker: true });
  await pagina.locator('.more summary').click();
  await pagina.locator('.more').getByRole('button', { name: 'Partidas', exact: true }).click();
  await pagina.getByRole('button', { name: 'Ver el análisis de tus partidas' }).click();
  await pagina.locator('.analitica').waitFor();
  eq(await pagina.locator('.ana-cifra strong').first().textContent(), '3');
  ok(/Ningún héroe llega/.test(await pagina.locator('.analitica').textContent()), 'con 3 partidas enseña héroes sin el mínimo');
  await contexto.close();
});

await navegador.close();
cerrar();
await terminar('interfaz/analitica');
