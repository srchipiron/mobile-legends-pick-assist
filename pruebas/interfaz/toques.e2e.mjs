/**
 * Lo que pasa al TOCAR con «Leer solo» copiando el draft de la tablet a la
 * vez: cada cosa funcionaba sola y, juntas, una copia deshacía lo tocado. La
 * tablet es falsa (tablet-falsa.mjs, protocolo 2) y contesta al instante.
 */
import { servirDist, abrirNavegador, paginaCon, test, after, ok, eq, leerGuardado, esperarA } from './navegador.mjs';
import { tabletFalsa, draftTablet, TABLET } from './tablet-falsa.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
after(async () => {
  await navegador.close();
  await cerrar();
});

const DESDE = Date.now() - 120000;
const conTablet = (tablet, draft, extra = {}) => paginaCon(navegador, url, {
  almacen: { 'roam-picker:lector-tablet': TABLET, 'roam-picker:linea': 'roam', 'roam-picker:draft': draft, 'roam-picker:lector-auto': true },
  antes: (p) => tablet.enganchar(p), ...extra,
});
/** Espera a que la tablet conteste `n` copias más. */
const copias = async (tablet, n = 2) => { const desde = tablet.de('GET /draft').length; ok(await esperarA(() => tablet.de('GET /draft').length >= desde + n), 'deja de copiar'); };
const VACIO = { enemies: [], allies: [], bans: [], fase: 'picks' };

test('lo que quitas con la × (enemigo, baneo o compañero) no vuelve con la copia siguiente', async () => {
  const tablet = tabletFalsa({ draft: draftTablet({ desde: DESDE, baneos: ['Hirara', 'Fanny'], enemigos: ['Clint', 'Khufra', null, null, null], aliados: ['Miya', 'Gloo', null, null, null], tuyoFila: -1 }) });
  const { contexto, pagina } = await conTablet(tablet, VACIO);
  try {
    ok(await esperarA(async () => (await leerGuardado(pagina)).enemies.length === 2), 'no copia');
    await pagina.locator('.aviso-deshacer .x').click();
    await pagina.getByRole('button', { name: 'Quitar Clint' }).click();
    await pagina.getByRole('button', { name: 'Quitar Gloo' }).click();
    await pagina.locator('.bans-resumen').click();
    await pagina.getByRole('button', { name: 'Quitar Hirara' }).first().click();
    await copias(tablet, 3);
    const d = await leerGuardado(pagina);
    ok(!d.enemies.includes('Clint') && !d.allies.includes('Gloo') && !d.bans.includes('Hirara'), `algo quitado vuelve: ${JSON.stringify(d)}`);
  } finally { await contexto.close(); }
});

test('lo que deshaces de una copia no lo vuelve a meter la siguiente, y el «Deshacer» de una × caduca aunque se siga copiando', async () => {
  const tablet = tabletFalsa({ draft: draftTablet({ desde: DESDE, enemigos: ['Clint', null, null, null, null] }) });
  const { contexto, pagina } = await conTablet(tablet, { ...VACIO, enemies: ['Layla'] });
  try {
    await pagina.locator('.aviso-deshacer').waitFor({ timeout: 10000 });
    await pagina.locator('.aviso-deshacer').getByRole('button', { name: 'Deshacer' }).click();
    await copias(tablet, 3);
    eq((await leerGuardado(pagina)).enemies.join(), 'Layla', 'lo deshecho vuelve');
    await pagina.getByRole('button', { name: 'Quitar Layla' }).click();
    await pagina.locator('.aviso-deshacer').waitFor();
    // [P] DESHACER_MS es 6 s: con copias cada 2 s no se alarga.
    ok(await esperarA(async () => (await pagina.locator('.aviso-deshacer').count()) === 0, { plazoMs: 9000 }), 'el «Deshacer» no caduca mientras se copia');
  } finally { await contexto.close(); }
});

test('el pick que fijó la tablet y sueltas a mano no se vuelve a fijar solo; uno fijado a mano no lo pisa', async () => {
  const tablet = tabletFalsa({ draft: draftTablet({ desde: DESDE, enemigos: ['Clint', null, null, null, null], aliados: ['Miya', 'Estes', null, null, null], tuyoFila: 1 }) });
  const { contexto, pagina } = await conTablet(tablet, VACIO);
  try {
    ok(await esperarA(async () => (await leerGuardado(pagina)).miPick === 'Estes'), 'no fija tu fila');
    await pagina.getByRole('button', { name: 'Soltar a Estes' }).click();
    await copias(tablet);
    eq((await leerGuardado(pagina)).miPick, null, 'el pick soltado vuelve');
    await pagina.locator('.pick-nombre-boton').first().click();
    const mio = (await leerGuardado(pagina)).miPick;
    ok(mio && mio !== 'Estes', 'la prueba necesita otro pick');
    await copias(tablet);
    eq((await leerGuardado(pagina)).miPick, mio, 'la tablet pisa el pick fijado a mano');
  } finally { await contexto.close(); }
});

test('con el selector de baneos abierto no se copia: no se cierra ni se borra lo escrito', async () => {
  const tablet = tabletFalsa({ draft: draftTablet({ desde: DESDE, baneos: ['Hirara', 'Fanny'] }) });
  const { contexto, pagina } = await conTablet(tablet, { enemies: [], allies: [], bans: [], fase: 'baneos' });
  try {
    await pagina.getByRole('button', { name: 'Buscar héroe para banear' }).click();
    await pagina.locator('.sheet input').fill('Lan');
    const antes = tablet.de('GET /draft').length;
    await pagina.waitForTimeout(4500);
    eq(tablet.de('GET /draft').length, antes, 'copia con una hoja abierta');
    eq(await pagina.locator('.sheet input').inputValue(), 'Lan', 'se borra lo escrito');
    await pagina.locator('.sheet-head .close').click();
    ok(await esperarA(async () => (await leerGuardado(pagina)).bans.length === 2), 'al cerrar no vuelve a copiar');
  } finally { await contexto.close(); }
});

test('con tu pick fijado fuera del ranking de tu línea, la pregunta y lo apuntado son tu pick, no el nº1', async () => {
  const draft = { enemies: ['Layla', 'Fanny', 'Tigreal'], allies: ['Chou'], bans: [], fase: 'picks', miPick: 'Khufra', miPickDesde: Date.now() - 11 * 60 * 1000 };
  const { contexto, pagina } = await paginaCon(navegador, url, { almacen: { 'roam-picker:linea': 'exp', 'roam-picker:draft': draft } });
  try {
    ok(/Khufra/.test(await pagina.locator('.recordatorio p').innerText()), await pagina.locator('.recordatorio p').innerText());
    eq(await pagina.locator('.recordatorio').getByRole('button', { name: 'No la terminé' }).count(), 0, 'sin tablet se ofrece «No la terminé»');
    await pagina.locator('.recordatorio button.gane').click();
    await pagina.waitForTimeout(400);
    eq((await leerGuardado(pagina, 'roam-picker:partidas'))?.map((p) => p.pick).join(), 'Khufra', 'se apunta otro héroe que tu pick');
  } finally { await contexto.close(); }
});

test('cada cara se pide con la huella de su contenido, para que una rehecha no se quede en la caché', async () => {
  const { createHash } = await import('node:crypto');
  const { readFileSync } = await import('node:fs');
  const { contexto, pagina } = await paginaCon(navegador, url, { almacen: { 'roam-picker:linea': 'roam', 'roam-picker:draft': { enemies: ['Masha'], allies: [], bans: [], fase: 'picks' } } });
  try {
    const src = await pagina.locator('.side.enemy img').first().getAttribute('src');
    const id = src?.match(/heroes\/(\d+)\.jpg/)?.[1];
    ok(id, `la cara de Masha no se pide por id: ${src}`);
    const huella = createHash('md5').update(readFileSync(new URL(`../../public/heroes/${id}.jpg`, import.meta.url))).digest('hex').slice(0, 8);
    ok(src.endsWith(`?v=${huella}`), `la cara no lleva la huella de su contenido (${huella}): ${src}`);
  } finally { await contexto.close(); }
});
