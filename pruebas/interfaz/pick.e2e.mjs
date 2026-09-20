/**
 * Tu pick fijado (3.5.0), en un Chrome de verdad sobre la app compilada:
 * tocar el nombre de una tarjeta lo fija (y el hueco «Tú» de tu equipo lo
 * enseña), sobrevive a una recarga, el análisis habla de él, diez minutos
 * después la app pregunta cómo fue y apuntar guarda el draft entero. Y las
 * dos ayudas que no tocan el motor: el filtro «mis héroes» y el plan A·B·C
 * de la fase de baneos.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar } from './navegador.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
const LINEA = { 'roam-picker:linea': 'roam' };
const PICKS = { enemies: ['Layla', 'Fanny'], allies: ['Chou'], bans: ['Hirara'], enemyRoam: null, fase: 'picks' };
const leer = (pagina, clave) => pagina.evaluate((k) => JSON.parse(localStorage.getItem(k) ?? 'null'), clave);
// El nombre tal cual (el CSS lo pinta en mayúsculas): cada tarjeta lo lleva en `data-heroe`.
const nombreDe = (tarjeta) => tarjeta.getAttribute('data-heroe');

await prueba('tocar el nombre de la tarjeta nº2 la fija como tu pick, y todo lo demás habla de ella', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:draft': PICKS } });
  eq(await pagina.locator('.side.ally .slot.empty.yo').count(), 1, 'tu equipo no tiene el hueco «Tú»');
  ok(/1\/5/.test(await pagina.locator('.side.ally .side-label').innerText()), 'tu equipo no cuenta 1/5 (Chou, sin ti)');
  const segunda = pagina.locator('.pick').nth(1);
  const nombre = await nombreDe(segunda);
  await segunda.locator('.pick-nombre-boton').click(); await pagina.waitForTimeout(400);
  eq(await pagina.locator('.pick.elegido').count(), 1, 'la tarjeta tocada no queda marcada como tu pick (o hay más de una)');
  eq(await nombreDe(pagina.locator('.pick.elegido')), nombre, 'la tarjeta marcada no es la tocada');
  ok(await pagina.locator('.side.ally .slot.yo .slot-cara').count() === 1 && (await pagina.locator('.side.ally .slot.yo').getAttribute('title')).includes(nombre), 'el hueco «Tú» no enseña tu pick');
  ok(/2\/5/.test(await pagina.locator('.side.ally .side-label').innerText()), 'tu equipo no cuenta 2/5 contigo');
  ok((await pagina.locator('.estimacion-nota').innerText()).includes(nombre), 'la estimación no habla de tu pick');
  // Su tarjeta sube la primera, con su puesto real (2).
  ok((await nombreDe(pagina.locator('.pick').first())) === nombre && (await pagina.locator('.pick').first().locator('.rank').innerText()).trim() === '2', 'la tarjeta de tu pick no sube la primera con su puesto real');
  // Guardado con su instante, y sobrevive a una recarga.
  const guardado = await leer(pagina, 'roam-picker:draft');
  ok(guardado.miPick === nombre && typeof guardado.miPickDesde === 'number', `el draft guardado no lleva tu pick: ${JSON.stringify(guardado)}`);
  await pagina.reload({ waitUntil: 'networkidle' }); await pagina.waitForTimeout(500);
  eq(await nombreDe(pagina.locator('.pick.elegido')), nombre, 'tu pick no sobrevive a una recarga');
  // Y sin la pregunta todavía: acaba de fijarse.
  eq(await pagina.locator('.recordatorio').count(), 0, 'pregunta cómo fue nada más fijar el pick');
  // Segundo toque: lo suelta.
  await pagina.locator('.pick.elegido .pick-nombre-boton').click(); await pagina.waitForTimeout(300);
  eq(await pagina.locator('.pick.elegido').count(), 0, 'el segundo toque no suelta el pick');
  eq(await pagina.locator('.side.ally .slot.empty.yo').count(), 1, 'el hueco «Tú» no vuelve a estar vacío');
  // El hueco «Tú» abre tu pool en el orden del ranking: el primero es el nº1.
  const primero = await nombreDe(pagina.locator('.pick').first());
  await pagina.locator('.side.ally .slot.empty.yo').click(); await pagina.waitForTimeout(300);
  eq((await pagina.locator('.sheet .hero-grid button').first().innerText()).trim(), primero, 'el selector de tu pick no empieza por el nº1');
  await pagina.locator('.sheet .hero-grid button').first().click(); await pagina.waitForTimeout(400);
  eq(await pagina.locator('.sheet').count(), 0, 'el selector de tu pick no se cierra al elegir');
  eq(await nombreDe(pagina.locator('.pick.elegido')), primero, 'elegir en el selector no fija el pick');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await prueba('diez minutos después de fijar el pick, al volver, la app pregunta cómo fue y apuntar guarda el draft', async () => {
  const hace11min = Date.now() - 11 * 60 * 1000;
  const { contexto, pagina, errores } = await paginaCon(navegador, url, {
    almacen: { ...LINEA, 'roam-picker:draft': { ...PICKS, miPick: 'Tigreal', miPickDesde: hace11min } },
  });
  const aviso = pagina.locator('.recordatorio');
  eq(await aviso.count(), 1, 'no pregunta cómo fue');
  ok((await aviso.innerText()).includes('Tigreal'), 'la pregunta no nombra tu pick');
  // «Más tarde» la quita y la vuelve a programar.
  await aviso.getByRole('button', { name: 'Más tarde' }).click(); await pagina.waitForTimeout(300);
  eq(await pagina.locator('.recordatorio').count(), 0, '«Más tarde» no quita la pregunta');
  ok((await leer(pagina, 'roam-picker:draft')).miPickDesde > hace11min + 60 * 1000, '«Más tarde» no vuelve a programar la pregunta');
  // Con la hora de antes otra vez, Gané apunta la partida entera y vuelve a baneos.
  await pagina.evaluate((t) => { const d = JSON.parse(localStorage.getItem('roam-picker:draft')); d.miPickDesde = t; localStorage.setItem('roam-picker:draft', JSON.stringify(d)); }, hace11min);
  await pagina.reload({ waitUntil: 'networkidle' }); await pagina.waitForTimeout(500);
  await pagina.locator('.recordatorio .gane').click(); await pagina.waitForTimeout(500);
  const partidas = await leer(pagina, 'roam-picker:partidas');
  eq(partidas?.length, 1, 'Gané no apunta la partida');
  const p = partidas[0];
  ok(p.pick === 'Tigreal' && p.gane === true && typeof p.estimacion === 'number', `la partida apuntada no es la de tu pick: ${JSON.stringify(p)}`);
  ok(p.draft && p.draft.linea === 'roam' && JSON.stringify(p.draft.enemigos) === '["Layla","Fanny"]' && JSON.stringify(p.draft.aliados) === '["Chou"]', `la partida no guarda el draft: ${JSON.stringify(p.draft)}`);
  eq(await pagina.locator('h1').textContent(), 'Fase de baneos', 'tras apuntar no vuelve a la fase de baneos');
  eq((await leer(pagina, 'roam-picker:draft')).miPick, null, 'el pick fijado sobrevive al nuevo draft');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await prueba('«Mis héroes» filtra el ranking a los que llevas y dice quién sería el nº1 fuera', async () => {
  // Dos roamers con maestría, elegidos para que el nº1 real no sea uno de ellos.
  const { contexto, pagina, errores } = await paginaCon(navegador, url, {
    almacen: { ...LINEA, 'roam-picker:draft': PICKS, 'roam-picker:mastery': { Franco: { games: 200, winRate: 0.5 }, Minotaur: { games: 100, winRate: 0.5 } } },
  });
  const nombres = async () => Promise.all((await pagina.locator('.pick').all()).map(nombreDe));
  const todos = await nombres();
  ok(todos.length >= 5, `el ranking sin filtro trae ${todos.length} tarjetas`);
  const filtro = pagina.locator('.filtro');
  eq(await filtro.count(), 1, 'no hay filtro «mis héroes» con maestría guardada');
  ok(/2/.test(await filtro.innerText()), 'el filtro no cuenta los dos héroes');
  await filtro.click(); await pagina.waitForTimeout(300);
  const mios = await nombres();
  eq(JSON.stringify([...mios].sort()), JSON.stringify(['Franco', 'Minotaur']), `con el filtro no salen solo los tuyos: ${mios}`);
  if (!['Franco', 'Minotaur'].includes(todos[0])) ok((await pagina.locator('.fuera-de-mios').innerText()).includes(todos[0]), 'no dice quién sería el nº1 fuera de tus héroes');
  await filtro.click(); await pagina.waitForTimeout(300);
  eq((await nombres()).length, todos.length, 'quitar el filtro no devuelve el ranking entero');
  // Sin maestría no hay filtro.
  await contexto.close();
  const sin = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:draft': PICKS } });
  eq(await sin.pagina.locator('.filtro').count(), 0, 'hay filtro sin maestría');
  ok(!errores.length && !sin.errores.length, `errores de página: ${errores} ${sin.errores}`);
  await sin.contexto.close();
});

await prueba('la fase de baneos enseña tu plan A · B · C con su tasa de ban, y apuntar preselecciona tu pick', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:draft': { enemies: [], allies: [], bans: [], enemyRoam: null, fase: 'baneos' } } });
  eq(await pagina.locator('.plan .chip').count(), 3, 'el plan no trae tres héroes');
  ok(/^A · /.test((await pagina.locator('.plan .chip').first().innerText()).trim()), 'el primero del plan no es el A');
  ok(/% ban/.test(await pagina.locator('.plan').innerText()), 'el plan no enseña la tasa de ban');
  await contexto.close();

  const con = await paginaCon(navegador, url, { almacen: { ...LINEA, 'roam-picker:draft': { ...PICKS, miPick: 'Tigreal', miPickDesde: Date.now() } } });
  await con.pagina.getByRole('button', { name: 'Apuntar partida' }).click(); await con.pagina.waitForTimeout(300);
  eq((await con.pagina.locator('.sheet .hero-grid button.elegido').innerText()).split('\n')[0].trim(), 'Tigreal', 'apuntar no preselecciona tu pick');
  eq(await con.pagina.locator('.sheet .otro-heroe').count(), 1, 'no se puede apuntar con un héroe de otra línea');
  await con.pagina.locator('.sheet .otro-heroe').click(); await con.pagina.waitForTimeout(200);
  ok((await con.pagina.locator('.sheet .hero-grid button').count()) > 100, 'tras «otro héroe» no salen todos');
  ok(!errores.length && !con.errores.length, `errores de página: ${errores} ${con.errores}`);
  await con.contexto.close();
});

await terminar('interfaz/pick');
await navegador.close();
await cerrar();
