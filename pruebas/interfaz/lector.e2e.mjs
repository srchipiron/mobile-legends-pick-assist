/**
 * «Leer del juego» de punta a punta (3.25.0): la app de verdad, el lector de
 * verdad (scripts/lector/servir.mjs) en su puerto y una captura real de la
 * tablet de Javi en vez de adb. Mete los baneos y los picks enemigos, se
 * deshace de un toque, viaja con la partida apuntada y, si el lector no
 * está o no llega a la tablet, lo dice.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar } from './navegador.mjs';
import { crearServidor, PUERTO } from '../../scripts/lector/servir.mjs';
import { capturaCompletaPng, VERDAD } from '../fixtures/juego/captura.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const png = capturaCompletaPng();

let capturar = () => png;
// Las correcciones que la app devuelve al lector (3.27.0), con el aprendizaje de pega.
const correcciones = [];
const aprender = async ({ pares }) => { correcciones.push(pares); return { aprendido: { version: 1, picks: null, caras: {}, capturas: pares.length }, informe: [] }; };
const puente = crearServidor({ capturar: () => capturar(), carpeta: mkdtempSync(join(tmpdir(), 'lector-e2e-')), aprender, guardar: () => {} });
const abrirPuente = () => new Promise((r) => puente.listen(PUERTO, '127.0.0.1', r));
const cerrarPuente = () => new Promise((r) => { puente.closeAllConnections?.(); puente.close(r); });

const leer = (pagina, clave = 'roam-picker:draft') => pagina.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), clave);
const almacen = { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: [], allies: [], bans: [], enemyRoam: null, fase: 'baneos' } };
const boton = (pagina) => pagina.getByRole('button', { name: 'Leer del juego' });

await abrirPuente();

await prueba('«Leer del juego» mete los baneos y los picks enemigos de la tablet, y se deshace de un toque', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen });
  await boton(pagina).click();
  await pagina.locator('.aviso-deshacer').waitFor({ timeout: 15000 });
  const d = await leer(pagina);
  const baneosEsperados = [...new Set([...VERDAD.tuyos, ...VERDAD.suyos])];
  eq([...d.bans].sort().join(), [...baneosEsperados].sort().join(), 'los baneos no son los de la tablet (o Hirara, repetida, se quita)');
  eq(d.enemies.join(), VERDAD.enemigos.join(), 'los picks enemigos no son los de la tablet');
  eq(d.fase, 'picks', 'con enemigos leídos el draft no pasa a picks');
  ok(/9 baneos y 2 enemigos/.test(await pagina.locator('.aviso-deshacer').innerText()), `el aviso no dice lo leído: ${await pagina.locator('.aviso-deshacer').innerText()}`);
  await pagina.locator('.aviso-deshacer').getByRole('button', { name: 'Deshacer' }).click(); await pagina.waitForTimeout(300);
  const vuelta = await leer(pagina);
  eq(vuelta.bans.length + vuelta.enemies.length, 0, 'deshacer no devuelve el draft de antes de leer');
  eq(vuelta.fase, 'baneos', 'deshacer no vuelve a la fase de baneos');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await prueba('leer no quita nada ni repite: lo que ya había se queda, y una segunda lectura no añade lo mismo', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, {
    almacen: { ...almacen, 'roam-picker:draft': { enemies: ['Layla'], allies: ['Chou'], bans: ['Saber', 'Fanny'], enemyRoam: null, fase: 'picks' } },
  });
  await boton(pagina).click();
  await pagina.locator('.aviso-deshacer').waitFor({ timeout: 15000 });
  const d = await leer(pagina);
  ok(d.bans.includes('Fanny') && d.enemies.includes('Layla') && d.allies.join() === 'Chou', 'leer quita lo que ya había');
  eq(d.bans.filter((b) => b === 'Saber').length, 1, 'un baneo ya puesto sale dos veces');
  eq(d.bans.length, 10, `no llena los diez baneos sin pasarse: ${d.bans}`);
  await pagina.locator('.aviso-deshacer .x').click();
  await boton(pagina).click(); await pagina.waitForTimeout(4000);
  ok(/ya estaba en el draft/.test(await pagina.locator('.lector-aviso').innerText()), 'una segunda lectura igual no dice que ya estaba');
  eq(JSON.stringify((await leer(pagina)).enemies), JSON.stringify(d.enemies), 'una segunda lectura repite enemigos');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await prueba('lo leído viaja con la partida apuntada, para medir al lector', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, {
    almacen: { ...almacen, 'roam-picker:draft': { enemies: [], allies: ['Chou', 'Miya', 'Eudora', 'Lukas'], bans: [], enemyRoam: null, fase: 'baneos', miPick: 'Rafaela', miPickDesde: Date.now() - 11 * 60 * 1000 } },
  });
  await boton(pagina).click();
  await pagina.locator('.aviso-deshacer').waitFor({ timeout: 15000 });
  const d = await leer(pagina);
  ok(d.lectura?.ids?.length === 1 && /^lectura-/.test(d.lectura.ids[0]), `el draft no guarda el id de la captura: ${JSON.stringify(d.lectura)}`);
  await pagina.locator('.recordatorio .gane').click(); await pagina.waitForTimeout(600);
  const [partida] = await leer(pagina, 'roam-picker:partidas');
  ok(partida?.lector, 'la partida apuntada no lleva lo que leyó el lector');
  eq(partida.lector.enemigos.join(), VERDAD.enemigos.join(), 'la partida no lleva los enemigos leídos');
  ok(partida.lector.baneos.includes('Masha'), 'la partida no lleva los baneos leídos');
  ok(!partida.lector.ids, 'la partida lleva los ids de las capturas, que son del móvil');
  // Y las dudas: los tres huecos de picks vacíos («eligiendo») con su candidato.
  ok(partida.lector.dudas?.some((x) => /^e[3-5]$/.test(x.hueco) && x.candidato), `la partida no lleva las dudas del lector: ${JSON.stringify(partida.lector.dudas)}`);
  // Y el lector recibe la verdad para aprender: la captura de este draft con los enemigos finales.
  eq(correcciones.length, 1, `al apuntar, el lector recibe ${correcciones.length} correcciones`);
  eq(correcciones[0][0].id, d.lectura.ids[0], 'la corrección no nombra la captura de este draft');
  eq(correcciones[0][0].verdad.enemigos.join(), VERDAD.enemigos.join(), 'la corrección no lleva los enemigos finales');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await prueba('«Leer solo»: con el modo encendido la app lee sin tocar nada, lo dice debajo, y el interruptor se recuerda', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: { ...almacen, 'roam-picker:lector-auto': true } });
  // Sin tocar «Leer del juego»: en unos segundos el draft tiene lo de la tablet.
  let d = null;
  for (let i = 0; i < 60 && !d?.enemies?.length; i++) { await pagina.waitForTimeout(250); d = await leer(pagina); }
  eq(d?.enemies?.join(), VERDAD.enemigos.join(), `leyendo solo no mete los picks enemigos: ${JSON.stringify(d)}`);
  // Una lectura más que no añade nada (la siguiente, o un toque) no se lleva el «Deshacer» de la que sí añadió.
  eq(await pagina.locator('.aviso-deshacer').count(), 1, 'la lectura no deja «Deshacer»');
  await boton(pagina).click(); await pagina.waitForTimeout(2500);
  eq(await pagina.locator('.aviso-deshacer').count(), 1, 'una lectura sin nada nuevo se lleva el «Deshacer» de la anterior');
  eq(await pagina.locator('.lector-auto').getAttribute('aria-pressed'), 'true', 'el interruptor no está encendido');
  ok(/última lectura bien/.test(await pagina.locator('.lector-estado').innerText()), `no dice qué pasó con la última lectura: ${await pagina.locator('.lector-estado').innerText()}`);
  // Apagarlo se recuerda al recargar.
  await pagina.locator('.lector-auto').click(); await pagina.waitForTimeout(200);
  eq(await pagina.evaluate(() => localStorage.getItem('roam-picker:lector-auto')), 'false', 'apagarlo no se guarda');
  await pagina.reload({ waitUntil: 'networkidle' }); await pagina.waitForTimeout(400);
  eq(await pagina.locator('.lector-auto').getAttribute('aria-pressed'), 'false', 'el interruptor no se recuerda apagado');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await prueba('si el lector no llega a la tablet, o no está abierto, lo dice con lo que hay que hacer', async () => {
  capturar = () => { throw new Error('device offline'); };
  let { contexto, pagina } = await paginaCon(navegador, url, { almacen });
  try {
    await boton(pagina).click();
    await pagina.locator('.lector-aviso').waitFor({ timeout: 15000 });
    ok(/depuración inalámbrica/.test(await pagina.locator('.lector-aviso').innerText()), 'un fallo de captura no dice que mire la depuración inalámbrica');
    eq((await leer(pagina)).bans.length, 0, 'un fallo mete algo en el draft');
  } finally {
    await contexto.close();
    capturar = () => png;
    await cerrarPuente();
  }
  ({ contexto, pagina } = await paginaCon(navegador, url, { almacen }));
  await boton(pagina).click();
  await pagina.locator('.lector-aviso').waitFor({ timeout: 15000 });
  ok(/escribe: lector/.test(await pagina.locator('.lector-aviso').innerText()), 'sin lector abierto no dice cómo abrirlo (el mandato «lector»)');
  await contexto.close();
});

// Pase lo que pase arriba, el lector de prueba se cierra: abierto, el
// proceso no termina nunca y la corrida se queda colgada (pasó al mutar).
if (puente.listening) { puente.closeAllConnections?.(); await cerrarPuente(); }
await navegador.close();
await cerrar();
terminar('interfaz/lector');
