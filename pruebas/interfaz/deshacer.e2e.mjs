/**
 * «Deshacer» (3.23.0): «Nuevo draft» va al lado de «Apuntar partida» y la ×
 * quita con un toque; un toque en falso a mitad de partida se llevaba el
 * draft entero sin vuelta atrás. Ahora queda un aviso con «Deshacer» que
 * devuelve el draft TAL CUAL (orden, rival marcado, pick fijado, fase), que
 * caduca solo y que se anula en cuanto cambias otra cosa.
 */
import { servirDist, abrirNavegador, paginaCon, prueba, ok, eq, terminar } from './navegador.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();

const DRAFT = {
  enemies: ['Layla', 'Fanny', 'Tigreal'], allies: ['Chou'], bans: ['Hirara'],
  enemyRoam: 'Fanny', fase: 'picks', miPick: 'Khufra', miPickDesde: Date.now(),
};
const almacen = { 'roam-picker:linea': 'roam', 'roam-picker:draft': DRAFT };
const leer = (pagina) => pagina.evaluate(() => JSON.parse(localStorage.getItem('roam-picker:draft') ?? 'null'));
const aviso = (pagina) => pagina.locator('.aviso-deshacer');
const clave = (d) => JSON.stringify([d.enemies, d.allies, d.bans, d.enemyRoam, d.fase, d.miPick]);

await prueba('«Nuevo draft» deja un «Deshacer» que devuelve el draft entero', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen });
  const antes = await leer(pagina);
  eq(clave(antes), clave(DRAFT), 'el draft sembrado no es el que se lee');
  await pagina.getByRole('button', { name: 'Nuevo draft' }).click(); await pagina.waitForTimeout(300);
  const vacio = await leer(pagina);
  eq(vacio.enemies.length + vacio.allies.length + vacio.bans.length, 0, '«Nuevo draft» no vacía el draft');
  eq(vacio.fase, 'baneos', '«Nuevo draft» no vuelve a baneos');
  ok(/vaciado/.test(await aviso(pagina).innerText()), 'no sale el aviso de «Draft vaciado»');
  await aviso(pagina).getByRole('button', { name: 'Deshacer' }).click(); await pagina.waitForTimeout(300);
  eq(clave(await leer(pagina)), clave(DRAFT), '«Deshacer» no devuelve el draft tal cual');
  eq(await aviso(pagina).count(), 0, 'el aviso sigue tras deshacer');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await prueba('la × deja un «Deshacer» que devuelve al héroe a su sitio y el rival marcado; el segundo quitado manda', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen });
  await pagina.getByRole('button', { name: 'Quitar Fanny' }).click(); await pagina.waitForTimeout(250);
  let d = await leer(pagina);
  eq(d.enemies.join(), 'Layla,Tigreal', 'la × no quita a Fanny');
  eq(d.enemyRoam, null, 'quitar al rival marcado no lo desmarca');
  ok(/Fanny/.test(await aviso(pagina).innerText()), 'el aviso no dice a quién quitó');
  await aviso(pagina).getByRole('button', { name: 'Deshacer' }).click(); await pagina.waitForTimeout(250);
  d = await leer(pagina);
  eq(d.enemies.join(), 'Layla,Fanny,Tigreal', 'Fanny no vuelve a su sitio');
  eq(d.enemyRoam, 'Fanny', 'el rival marcado no vuelve');
  // Dos quitados seguidos: deshacer devuelve solo el último.
  await pagina.getByRole('button', { name: 'Quitar Fanny' }).click(); await pagina.waitForTimeout(200);
  await pagina.getByRole('button', { name: 'Quitar Layla' }).click(); await pagina.waitForTimeout(200);
  ok(/Layla/.test(await aviso(pagina).innerText()), 'el aviso no es el del último quitado');
  await aviso(pagina).getByRole('button', { name: 'Deshacer' }).click(); await pagina.waitForTimeout(250);
  eq((await leer(pagina)).enemies.join(), 'Layla,Tigreal', 'deshacer no devuelve solo al último');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await prueba('el «Deshacer» se anula al cambiar otra cosa y caduca solo', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, { almacen });
  await pagina.getByRole('button', { name: 'Nuevo draft' }).click(); await pagina.waitForTimeout(300);
  eq(await aviso(pagina).count(), 1, 'no sale el aviso');
  // Otro cambio (pasar a los picks): deshacer ya se llevaría lo nuevo por delante.
  await pagina.locator('.reset.primario').click(); await pagina.waitForTimeout(300);
  eq(await aviso(pagina).count(), 0, 'el aviso sigue después de otro cambio del draft');
  // Caduca: a los seis segundos se va solo.
  await pagina.evaluate((d) => localStorage.setItem('roam-picker:draft', JSON.stringify(d)), DRAFT);
  await pagina.reload({ waitUntil: 'networkidle' }); await pagina.waitForTimeout(400);
  await pagina.getByRole('button', { name: 'Quitar Tigreal' }).click(); await pagina.waitForTimeout(200);
  eq(await aviso(pagina).count(), 1, 'no sale el aviso tras la ×');
  await pagina.waitForTimeout(6500);
  eq(await aviso(pagina).count(), 0, 'el aviso no caduca');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await prueba('vaciar un draft que ya está vacío no ofrece deshacer (no hay nada que devolver)', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, {
    almacen: { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: [], allies: [], bans: [], fase: 'picks' } },
  });
  await pagina.getByRole('button', { name: 'Nuevo draft' }).click(); await pagina.waitForTimeout(300);
  eq((await leer(pagina)).fase, 'baneos', '«Nuevo draft» con el draft vacío no vuelve a baneos');
  eq(await aviso(pagina).count(), 0, 'vaciar un draft vacío ofrece deshacer');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await prueba('apuntar la partida vacía el draft SIN «Deshacer» (la partida ya está guardada)', async () => {
  const { contexto, pagina, errores } = await paginaCon(navegador, url, {
    almacen: { ...almacen, 'roam-picker:draft': { ...DRAFT, miPickDesde: Date.now() - 11 * 60 * 1000 } },
  });
  await pagina.locator('.recordatorio .gane').click(); await pagina.waitForTimeout(300);
  eq((await leer(pagina)).enemies.length, 0, '«Gané» no vacía el draft');
  eq(await aviso(pagina).count(), 0, 'apuntar la partida ofrece deshacer');
  ok(!errores.length, `errores de página: ${errores}`);
  await contexto.close();
});

await navegador.close();
await cerrar();
terminar('interfaz/deshacer');
