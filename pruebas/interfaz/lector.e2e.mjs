/**
 * «Leer del juego» de punta a punta (3.25.0): la app de verdad, el lector de
 * verdad (scripts/lector/servir.mjs) en su puerto y una captura real de la
 * tablet de Javi en vez de adb. Mete los baneos y los picks enemigos, se
 * deshace de un toque, viaja con la partida apuntada y, si el lector no
 * está o no llega a la tablet, lo dice. Y el final (3.33.0): con el draft
 * completo el lector vigila por su cuenta y la partida se apunta sola.
 */
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar } from './navegador.mjs';
import { crearServidor, PUERTO, VIGILANCIA } from '../../scripts/lector/servir.mjs';
import { capturaCompletaPng, pantallaDeFinal, VERDAD } from '../fixtures/juego/captura.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const png = capturaCompletaPng();
// La otra columna de picks enemigos (1 de octubre de 2026): en los huecos de Clint y Khufra, Rafaela y Eudora.
const png2 = capturaCompletaPng({ columna: 2 });
const pngTabla = pantallaDeFinal();

let capturar = () => png;
// Las correcciones que la app devuelve al lector (3.27.0), con el aprendizaje de pega.
const correcciones = [];
const aprender = async ({ pares }) => { correcciones.push(pares); return { aprendido: { version: 1, picks: null, caras: {}, capturas: pares.length }, informe: [] }; };
// La vigilancia del final con los plazos encogidos (desde el minuto 0, una captura cada 200 ms): lo demás, como en producción.
const puente = crearServidor({ capturar: () => capturar(), carpeta: mkdtempSync(join(tmpdir(), 'lector-e2e-')), aprender, guardar: () => {}, guardarResultadosDe: () => {}, vigilancia: { ...VIGILANCIA, desdeMin: 0, intervaloMs: 200 } });
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
  // Tu equipo (3.31.0): las otras cuatro filas de compañeros y tu fila (nombre en amarillo) como pick fijado.
  // (El montaje junta dos capturas: Clint es pick enemigo en una y compañero en la otra, y un enemigo no entra de compañero.)
  const companeros = VERDAD.aliados.filter((n) => n !== VERDAD.tuyo && !VERDAD.enemigos.includes(n));
  eq(d.allies.join(), companeros.join(), `los compañeros no son los de la tablet (o entras tú): ${d.allies}`);
  eq(d.miPick, VERDAD.tuyo, `tu fila no queda fijada como tu pick: ${d.miPick}`);
  ok(d.miPickLeido === true && Number.isFinite(d.miPickDesde), 'el pick leído no se marca como leído con su instante');
  ok(/Estes/.test(await pagina.locator('.slot.yo').getAttribute('title')), 'el hueco «Tú» no enseña a Estes');
  eq(d.fase, 'picks', 'con enemigos leídos el draft no pasa a picks');
  ok(/9 baneos, 2 enemigos y 3 compañeros/.test(await pagina.locator('.aviso-deshacer').innerText()) && /Tú: Estes/.test(await pagina.locator('.aviso-deshacer').innerText()), `el aviso no dice lo leído: ${await pagina.locator('.aviso-deshacer').innerText()}`);
  await pagina.locator('.aviso-deshacer').getByRole('button', { name: 'Deshacer' }).click(); await pagina.waitForTimeout(300);
  const vuelta = await leer(pagina);
  eq(vuelta.bans.length + vuelta.enemies.length + vuelta.allies.length, 0, 'deshacer no devuelve el draft de antes de leer');
  eq(vuelta.miPick ?? null, null, 'deshacer no suelta el pick leído');
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
  ok(d.bans.includes('Fanny') && d.enemies.includes('Layla') && d.allies[0] === 'Chou', 'leer quita lo que ya había');
  eq(d.bans.filter((b) => b === 'Saber').length, 1, 'un baneo ya puesto sale dos veces');
  eq(d.bans.length, 10, `no llena los diez baneos sin pasarse: ${d.bans}`);
  await pagina.locator('.aviso-deshacer .x').click();
  await boton(pagina).click(); await pagina.waitForTimeout(4000);
  ok(/ya estaba en el draft/.test(await pagina.locator('.lector-aviso').innerText()), 'una segunda lectura igual no dice que ya estaba');
  eq(JSON.stringify((await leer(pagina)).enemies), JSON.stringify(d.enemies), 'una segunda lectura repite enemigos');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await prueba('el héroe que un jugador solo miraba se cambia por el que coge en ese hueco, y se deshace (3.37.0)', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen });
  await boton(pagina).click();
  await pagina.locator('.aviso-deshacer').waitFor({ timeout: 15000 });
  eq((await leer(pagina)).enemies.join(), 'Clint,Khufra', 'la primera lectura no mete a Clint y Khufra');
  // Los dos primeros jugadores enemigos cambian: Rafaela y Eudora en sus huecos.
  capturar = () => png2;
  try {
    await boton(pagina).click(); await pagina.waitForTimeout(4000);
    const d = await leer(pagina);
    // (Eudora está entre los baneos del montaje, que salen de otra captura:
    // no entra de enemiga, pero su hueco sí quita a Khufra.)
    // (Gloo, en el tercer hueco, sale leído desde 3.39.0: afinar el tamaño lo encuentra.)
    eq([...d.enemies].sort().join(), 'Aamon,Gloo,Lesley,Rafaela', `los que solo se miraban no se cambian por los de su hueco: ${d.enemies}`);
    ok(!d.lectura.enemigos.includes('Clint') && !d.lectura.enemigos.includes('Khufra'), `lo cambiado sigue contando como leído: ${d.lectura.enemigos}`);
    // Deshacer devuelve a Clint y Khufra.
    await pagina.locator('.aviso-deshacer').getByRole('button', { name: 'Deshacer' }).click(); await pagina.waitForTimeout(300);
    eq((await leer(pagina)).enemies.join(), 'Clint,Khufra', 'deshacer no devuelve el draft de antes del cambio');
  } finally {
    capturar = () => png;
  }
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
  // Un pick fijado A MANO no lo cambia la lectura, y con cuatro compañeros ya metidos no entra ninguno más.
  eq(d.miPick, 'Rafaela', `la lectura pisa el pick fijado a mano: ${d.miPick}`);
  eq(d.allies.join(), 'Chou,Miya,Eudora,Lukas', `la lectura toca los compañeros metidos a mano: ${d.allies}`);
  await pagina.locator('.recordatorio .gane').click(); await pagina.waitForTimeout(600);
  const [partida] = await leer(pagina, 'roam-picker:partidas');
  ok(partida?.lector, 'la partida apuntada no lleva lo que leyó el lector');
  eq(partida.lector.enemigos.join(), VERDAD.enemigos.join(), 'la partida no lleva los enemigos leídos');
  ok(partida.lector.aliados?.join() === VERDAD.aliados.filter((n) => n !== VERDAD.tuyo).join() && partida.lector.tuyo === VERDAD.tuyo, `la partida no lleva tu equipo leído: ${JSON.stringify(partida.lector)}`);
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
  // La primera lectura es la del lector de verdad; las siguientes, la MISMA
  // respuesta al instante: aquí el lector corre en este proceso de Node y una
  // lectura tarda 3–5 s, así que el aviso (DESHACER_MS, 6 s) caducaba solo
  // antes de acabar la segunda y la prueba no distinguía eso de «se lo llevó».
  let primera = null;
  const repetir = (p) => p.route(`http://127.0.0.1:${PUERTO}/leer*`, async (ruta) => {
    if (primera) return ruta.fulfill(primera);
    const r = await ruta.fetch();
    primera = { status: r.status(), headers: r.headers(), body: await r.text() };
    return ruta.fulfill(primera);
  });
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: { ...almacen, 'roam-picker:lector-auto': true }, antes: repetir });
  // Sin tocar «Leer del juego»: en unos segundos el draft tiene lo de la tablet.
  let d = null;
  for (let i = 0; i < 60 && !d?.enemies?.length; i++) { await pagina.waitForTimeout(250); d = await leer(pagina); }
  eq(d?.enemies?.join(), VERDAD.enemigos.join(), `leyendo solo no mete los picks enemigos: ${JSON.stringify(d)}`);
  // Una lectura más que no añade nada (la siguiente, o un toque) no se lleva el «Deshacer» de la que sí añadió.
  eq(await pagina.locator('.aviso-deshacer').count(), 1, 'la lectura no deja «Deshacer»');
  // Se mira DENTRO de la página en el instante en que acaba esa lectura.
  await pagina.evaluate(() => {
    window.__trasLeer = null;
    new window.MutationObserver((cambios) => {
      if (window.__trasLeer === null && cambios.some((c) => c.oldValue === 'true')) window.__trasLeer = document.querySelectorAll('.aviso-deshacer').length;
    }).observe(document.querySelector('button.lector'), { attributes: true, attributeFilter: ['aria-busy'], attributeOldValue: true });
  });
  await boton(pagina).click();
  await pagina.waitForFunction(() => window.__trasLeer !== null, null, { timeout: 30000 });
  eq(await pagina.evaluate(() => window.__trasLeer), 1, 'una lectura sin nada nuevo se lleva el «Deshacer» de la anterior');
  eq(await pagina.locator('.lector-auto').getAttribute('aria-pressed'), 'true', 'el interruptor no está encendido');
  ok(/última lectura bien/.test(await pagina.locator('.lector-estado').innerText()), `no dice qué pasó con la última lectura: ${await pagina.locator('.lector-estado').innerText()}`);
  // En picks el interruptor va en «Ajustes» (3.38.0: en la fila de botones
  // empujaba la nº1 48 px a 360) y lo que pasó se sigue diciendo fuera.
  eq(await pagina.locator('.tools .lector-auto').count(), 0, 'en picks el interruptor sigue en la fila de botones');
  // Apagarlo se recuerda al recargar.
  await pagina.locator('.more > summary').click();
  await pagina.locator('.lector-auto').click(); await pagina.waitForTimeout(200);
  eq(await pagina.evaluate(() => localStorage.getItem('roam-picker:lector-auto')), 'false', 'apagarlo no se guarda');
  await pagina.reload({ waitUntil: 'networkidle' }); await pagina.waitForTimeout(400);
  eq(await pagina.locator('.lector-auto').getAttribute('aria-pressed'), 'false', 'el interruptor no se recuerda apagado');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await prueba('con «Leer solo» y el draft completo, el lector vigila el final por su cuenta y la partida se apunta sola, con «Deshacer» (3.33.0)', async () => {
  // La tablet enseña la tabla de la derrota (incidencia #15); la app NO pide capturas: avisa y recoge.
  capturar = () => pngTabla;
  const completoDesde = Date.now() - 9 * 60 * 1000;
  // Con tu pick fijado FUERA del ranking de tu línea (Khufra jugando exp):
  // se apunta tu pick, no el nº1 de la línea (3.40.0).
  const draft = { enemies: ['Layla', 'Miya', 'Eudora', 'Nana', 'Zilong'], allies: ['Chou', 'Tigreal', 'Franco', 'Akai'], bans: [], enemyRoam: null, fase: 'picks', completoDesde, miPick: 'Khufra', miPickDesde: completoDesde };
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: { ...almacen, 'roam-picker:linea': 'exp', 'roam-picker:lector-auto': true, 'roam-picker:draft': draft } });
  // El lector recibe el aviso con el instante del draft completo y en los INTERVALO_FINAL_MS siguientes la app recoge el resultado.
  let partidas = [];
  for (let i = 0; i < 100 && !partidas.length; i++) { await pagina.waitForTimeout(250); partidas = (await leer(pagina, 'roam-picker:partidas')) ?? []; }
  eq(partidas.length, 1, 'la partida no se apunta sola con la tabla a la vista');
  const [p] = partidas;
  eq(p.pick, 'Khufra', 'la partida apuntada sola es la del nº1 de la línea, no tu pick fijado');
  ok(p.origen === 'lector' && p.gane === false && p.draft?.enemigos?.length === 5 && p.pick, `la partida apuntada sola no es la del draft, perdida y del lector: ${JSON.stringify({ origen: p.origen, gane: p.gane, pick: p.pick, enemigos: p.draft?.enemigos })}`);
  ok(Math.abs(p.t - Date.now()) < 60000, 'la partida no va fechada cuando el lector vio la tabla');
  const aviso = pagina.locator('.aviso-deshacer');
  ok(/apuntada sola/.test(await aviso.innerText()) && /[Pp]erdida/.test(await aviso.innerText()), `el aviso no dice que se apuntó sola y cómo: ${await aviso.innerText()}`);
  eq((await leer(pagina)).enemies.length, 0, 'el draft no se reinicia al apuntar');
  // Lo apuntado solo vuelve al lector como enseñanza (la tabla contestada «perdida» se suma a la de serie).
  let estado = null;
  for (let i = 0; i < 20 && estado?.resultados?.perdi !== 2; i++) { await pagina.waitForTimeout(250); estado = await (await fetch(`http://127.0.0.1:${PUERTO}/estado`)).json(); }
  eq(estado?.resultados?.perdi, 2, `el lector no aprende de la partida apuntada sola: ${JSON.stringify(estado?.resultados)}`);
  // «Deshacer» olvida la partida y devuelve el draft, y no se vuelve a apuntar sola.
  await aviso.getByRole('button', { name: 'Deshacer' }).click(); await pagina.waitForTimeout(500);
  eq(((await leer(pagina, 'roam-picker:partidas')) ?? []).length, 0, 'deshacer no olvida la partida');
  eq((await leer(pagina)).enemies.join(), draft.enemies.join(), 'deshacer no devuelve el draft');
  await pagina.waitForTimeout(1500);
  eq(((await leer(pagina, 'roam-picker:partidas')) ?? []).length, 0, 'tras deshacer se vuelve a apuntar sola');
  // Ni tras una recarga (la app se actualiza sola): la marca va en el draft (3.37.0).
  eq((await leer(pagina)).apuntadaSola, draft.completoDesde, 'lo deshecho no queda marcado en el draft');
  await pagina.reload({ waitUntil: 'networkidle' });
  await pagina.waitForTimeout(2500);
  eq(((await leer(pagina, 'roam-picker:partidas')) ?? []).length, 0, 'tras deshacer y recargar se vuelve a apuntar sola');
  ok(!errores.length, `errores de página: ${errores}`);
  capturar = () => png;
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
