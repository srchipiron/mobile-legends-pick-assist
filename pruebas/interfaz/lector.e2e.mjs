/**
 * La tablet desde el móvil, de punta a punta (protocolo 2): la app de verdad
 * contra una Lector MLBB de mentira (tablet-falsa.mjs) en la IP de la tablet
 * de Javi. La app copia el draft que lleva la tablet, le corrige lo que tocas,
 * le da el resultado y tus ajustes, y recibe la partida que apunta ella.
 */
import { servirDist, abrirNavegador, paginaCon, test, after, ok, eq, abrirAjustes, leerGuardado, esperarA } from './navegador.mjs';
import { tabletFalsa, draftTablet, TABLET } from './tablet-falsa.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
after(async () => {
  await navegador.close();
  await cerrar();
});

const DRAFT = { enemies: [], allies: [], bans: [], enemyRoam: null, fase: 'baneos' };
const DESDE = Date.now() - 120000;
/** El draft de la tablet de casi todas las pruebas: baneos, dos rivales y tu fila (Estes, de roam) con dos compañeros. */
const LEIDO = () => draftTablet({ desde: DESDE, baneos: ['Hirara', 'Fanny', 'Lancelot'], enemigos: ['Clint', null, 'Khufra', null, null], aliados: ['Miya', 'Estes', null, 'Gloo', null], tuyoFila: 1 });
/** Una página con la tablet vinculada (y «Leer solo» si `auto`). */
async function conTablet(tablet, { auto = true, almacen = {}, antes = null, ...resto } = {}) {
  return paginaCon(navegador, url, {
    ...resto,
    almacen: { 'roam-picker:linea': 'roam', 'roam-picker:draft': DRAFT, 'roam-picker:lector-tablet': TABLET, 'roam-picker:lector-auto': auto, ...almacen },
    antes: async (p) => { await tablet.enganchar(p); await antes?.(p); },
  });
}
const boton = (p) => p.getByRole('button', { name: 'Leer del juego' });

test('«Leer del juego» copia el draft de la tablet con su código, y se deshace de un toque', async () => {
  const tablet = tabletFalsa({ draft: LEIDO() });
  const { contexto, pagina, errores } = await conTablet(tablet, { auto: false });
  try {
    eq(tablet.de('GET /draft').length, 0, 'sin «Leer solo» copia el draft solo');
    await boton(pagina).click();
    await pagina.locator('.aviso-deshacer').waitFor({ timeout: 10000 });
    const d = await leerGuardado(pagina);
    eq(d.bans.join(), 'Hirara,Fanny,Lancelot');
    eq(d.enemies.join(), 'Clint,Khufra');
    eq(d.allies.join(), 'Miya,Gloo', 'tu fila entra de compañero');
    eq(d.miPick, 'Estes', 'tu fila no queda como tu pick');
    ok(d.miPickLeido === true && d.desdeTablet === DESDE, 'el pick no queda como leído o el draft no recuerda de qué draft de la tablet es');
    eq(d.fase, 'picks');
    ok(/3 baneos, 2 enemigos y 2 compañeros/.test(await pagina.locator('.aviso-deshacer').innerText()), await pagina.locator('.aviso-deshacer').innerText());
    ok(tablet.pedidas.every((x) => x.codigo === TABLET.codigo), 'alguna petición va sin el código');
    eq(await pagina.locator('.slot.leido').count(), 5, 'lo puesto por la tablet no lleva el punto verde');
    await pagina.locator('.aviso-deshacer').getByRole('button', { name: 'Deshacer' }).click();
    await pagina.waitForTimeout(300);
    const vuelta = await leerGuardado(pagina);
    eq(vuelta.bans.length + vuelta.enemies.length + vuelta.allies.length, 0, 'deshacer no devuelve el draft de antes');
    eq(vuelta.miPick ?? null, null);
    eq(vuelta.fase, 'baneos');
    ok(!tablet.pedidas.some((x) => ['/leer', '/consejo', '/vigilar', '/final', '/corregir'].includes(x.ruta)), `pide rutas del protocolo viejo: ${tablet.pedidas.map((x) => x.ruta)}`);
    ok(!errores.length, errores.join());
  } finally { await contexto.close(); }
});

test('el QR de la tablet pregunta antes de vincular; vinculada, copia sola y le manda tus ajustes', async () => {
  const tablet = tabletFalsa({ draft: LEIDO() });
  const { contexto, pagina, errores } = await paginaCon(navegador, `${url}#lector=192.168.68.116:47323&codigo=ABCDEFGH23`, {
    almacen: { 'roam-picker:linea': 'roam', 'roam-picker:draft': DRAFT }, antes: (p) => tablet.enganchar(p),
  });
  try {
    await pagina.waitForTimeout(1500);
    eq(tablet.pedidas.length, 0, 'el enlace vincula y pide sin preguntar');
    eq(await leerGuardado(pagina, 'roam-picker:lector-tablet'), null, 'el enlace se guarda sin preguntar');
    eq(await pagina.evaluate(() => window.location.hash), '', 'el enlace con el código se queda en la barra');
    ok(/192\.168\.68\.116/.test(await pagina.locator('.aviso-deshacer').innerText()), 'no dice con qué tablet');
    await pagina.locator('.aviso-deshacer').getByRole('button', { name: 'Vincular' }).click();
    ok(await esperarA(async () => (await leerGuardado(pagina)).bans.length > 0), 'vinculada no copia sola el draft');
    eq(await leerGuardado(pagina, 'roam-picker:lector-auto'), true, 'vincular no enciende «Leer solo»');
    ok(await esperarA(() => tablet.de('POST /ajustes').length > 0), 'no manda tus ajustes');
    const a = tablet.de('POST /ajustes').at(-1).cuerpo;
    ok(a.linea === 'roam' && a.rango && a.idioma === 'es', `los ajustes no llevan tu línea, rango e idioma: ${JSON.stringify(a)}`);
    ok(tablet.pedidas.every((x) => x.codigo === TABLET.codigo || x.ruta === '/reto'), 'alguna petición va sin el código');
    await abrirAjustes(pagina);
    await pagina.getByRole('button', { name: 'Desvincular la tablet' }).click();
    eq(await leerGuardado(pagina, 'roam-picker:lector-tablet'), null);
    eq(await boton(pagina).count(), 0, 'desvinculada, sigue «Leer del juego»');
    const pedidas = tablet.pedidas.length;
    await pagina.waitForTimeout(3000);
    eq(tablet.pedidas.length, pedidas, 'desvinculada sigue pidiendo a la tablet');
    ok(!errores.length, errores.join());
  } finally { await contexto.close(); }
});

test('sin tablet vinculada no sale ninguna petición a la red de casa', async () => {
  const vistas = [];
  const { contexto, pagina } = await paginaCon(navegador, url, {
    almacen: { 'roam-picker:linea': 'roam', 'roam-picker:draft': { ...DRAFT, fase: 'picks' }, 'roam-picker:lector-auto': true },
    antes: (p) => p.context().route(/^http:\/\/(192\.168|10\.|172\.(1[6-9]|2\d|3[01])\.|127\.0\.0\.1:47323)/, (r) => { vistas.push(r.request().url()); return r.abort(); }),
  });
  try {
    await pagina.waitForTimeout(3000);
    await abrirAjustes(pagina);
    await pagina.getByRole('button', { name: 'Diagnóstico' }).click();
    await pagina.waitForTimeout(1500);
    eq(vistas.length, 0, `sin tablet salen peticiones: ${vistas.join(' ')}`);
    eq(await boton(pagina).count(), 0, 'sin tablet sale «Leer del juego»');
  } finally { await contexto.close(); }
});

test('lo que tocas manda: lo quitado no vuelve, lo metido a mano se queda y la tablet recibe la corrección de ESE draft', async () => {
  const tablet = tabletFalsa({ draft: LEIDO() });
  const { contexto, pagina } = await conTablet(tablet);
  try {
    ok(await esperarA(async () => (await leerGuardado(pagina)).enemies.length === 2), 'no copia el draft');
    await pagina.locator('.aviso-deshacer .x').click();
    await pagina.getByRole('button', { name: 'Quitar Clint' }).click();
    await pagina.locator('.side.enemy .slot.empty').first().click();
    await pagina.locator('.sheet input').fill('Layla');
    await pagina.locator('.hero-grid button', { hasText: 'Layla' }).first().click();
    await pagina.locator('.sheet-head .close').click();
    ok(await esperarA(() => tablet.de('POST /draft').length > 0), 'no le dice a la tablet lo corregido');
    const c = tablet.de('POST /draft').at(-1).cuerpo;
    eq(c.desde, DESDE, 'la corrección no es de ese draft');
    eq([...c.enemigos].sort().join(), 'Khufra,Layla', `la corrección no lleva lo quitado y lo metido: ${JSON.stringify(c)}`);
    eq(c.tuyo, 'Estes');
    ok(!c.aliados.includes('Estes'), 'tú vas entre tus compañeros');
    const copias = tablet.de('GET /draft').length;
    ok(await esperarA(() => tablet.de('GET /draft').length >= copias + 2), 'deja de copiar');
    const d = await leerGuardado(pagina);
    ok(!d.enemies.includes('Clint') && d.enemies.includes('Layla'), `lo quitado vuelve o lo metido se va: ${d.enemies}`);
    eq(await pagina.locator('.side.enemy .slot.leido').count(), 1, 'lo metido a mano lleva el punto de la tablet');
    // La tablet cambia en su hueco al que solo se miraba (Khufra → Rafaela): manda ella en lo que leyó.
    tablet.draft = { ...tablet.draft, enemigos: ['Clint', null, 'Rafaela', null, null] };
    ok(await esperarA(async () => (await leerGuardado(pagina)).enemies.includes('Rafaela')), 'no entra el que coge');
    const e = (await leerGuardado(pagina)).enemies;
    ok(!e.includes('Khufra') && e.includes('Layla') && !e.includes('Clint'), `no se cambia al que miraba, o se va lo tuyo: ${e}`);
  } finally { await contexto.close(); }
});

test('«Gané» con el draft de la tablet: no lo apunta el móvil, deshacer no manda nada y el resultado va a la tablet, que devuelve la partida con su t', async () => {
  const T = Date.now() - 30000;
  const completo = draftTablet({ desde: DESDE, baneos: ['Hirara', 'Fanny'], enemigos: ['Clint', 'Khufra', 'Layla', 'Miya', 'Zilong'], aliados: ['Chou', 'Estes', 'Franco', 'Akai', 'Saber'], tuyoFila: 1, cerrado: true, cerradoEn: DESDE + 1000 });
  const tablet = tabletFalsa({ draft: completo, apuntar: T });
  const almacen = { 'roam-picker:draft': { enemies: completo.enemigos, allies: ['Chou', 'Franco', 'Akai', 'Saber'], bans: completo.baneos, fase: 'picks', miPick: 'Estes', miPickLeido: true, miPickDesde: Date.now() - 11 * 60000, completoDesde: Date.now() - 11 * 60000, cerrado: true, desdeTablet: DESDE, lectura: { baneos: completo.baneos, enemigos: completo.enemigos, aliados: ['Chou', 'Franco', 'Akai', 'Saber'], tuyo: 'Estes' } } };
  const { contexto, pagina } = await conTablet(tablet, { almacen });
  try {
    await pagina.locator('.recordatorio').waitFor();
    ok(await pagina.locator('.recordatorio').getByRole('button', { name: 'No la terminé' }).count(), 'con el draft de la tablet no se ofrece «No la terminé»');
    await pagina.locator('.recordatorio .gane').click();
    eq((await leerGuardado(pagina)).enemies.length, 0, '«Gané» no vacía el draft');
    eq((await leerGuardado(pagina, 'roam-picker:partidas') ?? []).length, 0, 'el móvil apunta por su cuenta la partida de la tablet');
    await pagina.locator('.aviso-deshacer').getByRole('button', { name: 'Deshacer' }).click();
    await pagina.waitForTimeout(500);
    eq((await leerGuardado(pagina)).enemies.length, 5, 'deshacer no devuelve el draft');
    eq(tablet.de('POST /resultado').length, 0, 'deshecho, el resultado sale a la tablet');
    await pagina.locator('.recordatorio .gane').click();
    await pagina.locator('.aviso-deshacer .x').click();
    ok(await esperarA(() => tablet.de('POST /resultado').length === 1), 'cerrado el aviso, el resultado no sale');
    eq(JSON.stringify(tablet.de('POST /resultado')[0].cuerpo), JSON.stringify({ desde: DESDE, gane: true }));
    ok(await esperarA(async () => (await leerGuardado(pagina, 'roam-picker:partidas') ?? []).length === 1), 'la partida que apunta la tablet no llega');
    const [p] = await leerGuardado(pagina, 'roam-picker:partidas');
    ok(p.t === T && p.gane === true, `no se funde con el MISMO t: ${JSON.stringify(p)}`);
    const copias = tablet.de('GET /draft').length;
    ok(await esperarA(() => tablet.de('GET /draft').length >= copias + 2));
    eq((await leerGuardado(pagina, 'roam-picker:partidas')).length, 1, 'se duplica al volver a copiar');
    eq((await leerGuardado(pagina)).enemies.length, 0, 'el draft ya apuntado vuelve a entrar');
  } finally { await contexto.close(); }
});

test('la tablet apunta sola la partida del draft que tienes delante: se funde, el draft se cierra y «Deshacer» la quita aquí', async () => {
  const T = Date.now() - 20000;
  const tablet = tabletFalsa({ draft: LEIDO() });
  const { contexto, pagina } = await conTablet(tablet);
  try {
    ok(await esperarA(async () => (await leerGuardado(pagina)).enemies.length === 2), 'no copia el draft');
    await pagina.locator('.aviso-deshacer .x').click();
    tablet.partida = { desde: DESDE, estado: 'apuntada', gane: false, registro: { t: T, pick: 'Estes', gane: false, recomendados: ['Estes'], rango: 'glory', origen: 'lector' } };
    ok(await esperarA(async () => (await leerGuardado(pagina, 'roam-picker:partidas') ?? []).length === 1), 'la partida de la tablet no llega');
    eq((await leerGuardado(pagina, 'roam-picker:partidas'))[0].t, T, 'no se funde con su t');
    eq((await leerGuardado(pagina)).fase, 'baneos', 'el draft no se cierra con la partida');
    ok(/apuntada sola: perdida/i.test(await pagina.locator('.aviso-deshacer').innerText()), await pagina.locator('.aviso-deshacer').innerText());
    await pagina.locator('.aviso-deshacer').getByRole('button', { name: 'Deshacer' }).click();
    await pagina.waitForTimeout(300);
    eq((await leerGuardado(pagina, 'roam-picker:partidas')).length, 0, '«Deshacer» no la quita');
    ok((await leerGuardado(pagina, 'roam-picker:olvidadas')).includes(T), 'quitada sin marca: volvería de la base de datos');
    eq((await leerGuardado(pagina)).enemies.length, 2, '«Deshacer» no devuelve el draft');
    const copias = tablet.de('GET /draft').length;
    ok(await esperarA(() => tablet.de('GET /draft').length >= copias + 2));
    eq((await leerGuardado(pagina, 'roam-picker:partidas')).length, 0, 'la deshecha vuelve con la copia siguiente');
  } finally { await contexto.close(); }
});

test('el draft de una partida que la tablet ya apuntó no entra: tu draft a mano sigue, sin aviso, y la partida se funde', async () => {
  const T = Date.now() - 20000;
  const tablet = tabletFalsa({ draft: LEIDO(), partida: { desde: DESDE, estado: 'apuntada', gane: true, registro: { t: T, pick: 'Estes', gane: true, recomendados: ['Estes'], rango: 'glory', origen: 'lector' } } });
  const { contexto, pagina } = await conTablet(tablet, { almacen: { 'roam-picker:draft': { ...DRAFT, enemies: ['Ling'], fase: 'picks' } } });
  try {
    ok(await esperarA(async () => (await leerGuardado(pagina, 'roam-picker:partidas') ?? []).length === 1), 'la partida de la tablet no llega');
    const copias = tablet.de('GET /draft').length;
    ok(await esperarA(() => tablet.de('GET /draft').length >= copias + 2));
    eq((await leerGuardado(pagina)).enemies.join(), 'Ling', 'el draft de una partida ya apuntada se mezcla con el tuyo');
    eq(await pagina.locator('.aviso-deshacer').count(), 0, 'sale un aviso por una partida que no tenías delante');
  } finally { await contexto.close(); }
});

test('«Nuevo draft» no vuelve a copiar el draft que vació; el siguiente de la tablet sí entra', async () => {
  const tablet = tabletFalsa({ draft: LEIDO() });
  const { contexto, pagina } = await conTablet(tablet, { almacen: { 'roam-picker:draft': { ...DRAFT, fase: 'picks' } } });
  try {
    ok(await esperarA(async () => (await leerGuardado(pagina)).enemies.length === 2));
    await pagina.locator('.aviso-deshacer .x').click();
    await pagina.getByRole('button', { name: 'Nuevo draft' }).click();
    const copias = tablet.de('GET /draft').length;
    ok(await esperarA(() => tablet.de('GET /draft').length >= copias + 2));
    eq((await leerGuardado(pagina)).bans.length, 0, 'el draft vaciado vuelve a entrar');
    tablet.draft = draftTablet({ desde: DESDE + 300000, enemigos: ['Ling', null, null, null, null] });
    ok(await esperarA(async () => (await leerGuardado(pagina)).enemies.join() === 'Ling'), 'el draft siguiente no entra');
  } finally { await contexto.close(); }
});

test('una Lector MLBB vieja (sin GET /draft) se dice una vez y el móvil deja de pedir', async () => {
  const tablet = tabletFalsa({ draft: LEIDO() });
  tablet.viejo = true;
  const { contexto, pagina } = await conTablet(tablet, { almacen: { 'roam-picker:draft': { ...DRAFT, fase: 'picks' } } });
  try {
    await pagina.locator('.lector-aviso').waitFor({ timeout: 10000 });
    ok(/versión antigua/.test(await pagina.locator('.lector-aviso').innerText()), await pagina.locator('.lector-aviso').innerText());
    const pedidas = tablet.de('GET /draft').length;
    await pagina.waitForTimeout(5000);
    eq(tablet.de('GET /draft').length, pedidas, 'sigue pidiendo el draft a una tablet vieja');
    await abrirAjustes(pagina);
    ok(await esperarA(async () => /Se pone sola al dejar de leer/.test(await pagina.locator('.lector-tablet').innerText())), 'Ajustes no dice que está atrasada');
  } finally { await contexto.close(); }
});

test('cambiar de línea o de idioma se le dice a la tablet; tu fila de otra línea no se fija como tu pick', async () => {
  const tablet = tabletFalsa({ draft: draftTablet({ desde: DESDE, enemigos: ['Clint', null, null, null, null], aliados: ['Hayabusa', 'Miya', null, null, null], tuyoFila: 0 }) });
  const { contexto, pagina } = await conTablet(tablet);
  try {
    ok(await esperarA(async () => (await leerGuardado(pagina)).enemies.length === 1));
    eq((await leerGuardado(pagina)).miPick ?? null, null, 'Hayabusa (jungla) queda fijado en roam');
    ok(await esperarA(() => tablet.de('POST /ajustes').length > 0));
    await pagina.getByRole('button', { name: 'EN', exact: true }).first().click();
    ok(await esperarA(() => tablet.de('POST /ajustes').some((x) => x.cuerpo.idioma === 'en')), 'el idioma nuevo no llega a la tablet');
  } finally { await contexto.close(); }
});

test('sin «Leer solo» tus ajustes también llegan a la tablet, y otra vez al cambiarlos', async () => {
  const tablet = tabletFalsa({ draft: LEIDO() });
  const { contexto, pagina } = await conTablet(tablet, { auto: false });
  try {
    ok(await esperarA(() => tablet.de('POST /ajustes').length > 0), 'sin copiar, los ajustes no llegan');
    await pagina.getByRole('button', { name: 'EN', exact: true }).first().click();
    ok(await esperarA(() => tablet.de('POST /ajustes').some((x) => x.cuerpo.idioma === 'en')), 'el idioma nuevo no llega sin copiar');
    eq(tablet.de('GET /draft').length, 0, 'sin «Leer solo» copia');
  } finally { await contexto.close(); }
});

test('Ajustes dice qué Lector MLBB hay (atrasada con su enlace, al día sin él) y «El sistema»', async () => {
  for (const [ultima, atrasada] of [['4.1.0', true], ['4.0.0', false]]) {
    const tablet = tabletFalsa({ draft: null, estado: { solo: { activo: false } } });
    const { contexto, pagina } = await conTablet(tablet, {
      auto: false, almacen: { 'roam-picker:draft': { ...DRAFT, fase: 'picks' } },
      antes: (p) => p.context().route('https://api.github.com/**', (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ tag_name: `lector-v${ultima}` }) })),
    });
    try {
      await abrirAjustes(pagina);
      ok(await esperarA(async () => !/Mirando/.test(await pagina.locator('.lector-tablet').innerText())), 'se queda mirando');
      const texto = await pagina.locator('.lector-tablet').innerText();
      eq(/Descargar Lector MLBB/.test(texto), atrasada, `con la última ${ultima}: ${texto}`);
      ok(/El sistema/.test(texto) && /Sin móvil/.test(texto), `no dice «El sistema»: ${texto}`);
    } finally { await contexto.close(); }
  }
});

test('si la tablet no contesta, Ajustes lo dice con qué hacer y «Volver a mirar» lo intenta otra vez', async () => {
  const tablet = tabletFalsa({ draft: null });
  tablet.caida = true;
  const { contexto, pagina } = await conTablet(tablet, { auto: false, almacen: { 'roam-picker:draft': { ...DRAFT, fase: 'picks' } } });
  try {
    await abrirAjustes(pagina);
    const volver = pagina.getByRole('button', { name: 'Volver a mirar' });
    await volver.waitFor({ timeout: 30000 });
    const texto = await pagina.locator('.lector-tablet').innerText();
    ok(/no contesta en 192\.168\.68\.116/.test(texto) && /Lector MLBB/.test(texto), `no dice qué pasa ni qué hacer: ${texto}`);
    tablet.caida = false;
    await volver.click();
    ok(await esperarA(async () => /Lector MLBB 4\.0\.0/.test(await pagina.locator('.lector-tablet').innerText())), '«Volver a mirar» no vuelve a preguntar');
  } finally { await contexto.close(); }
});

test('si la tablet cambió de IP la encuentra en la wifi con el reto, y un impostor no recibe el código', async () => {
  const tablet = tabletFalsa({ draft: null });
  tablet.caida = true;
  const nueva = tabletFalsa({ direccion: '192.168.68.112:47323', draft: null });
  const impostor = { codigos: [] };
  const { contexto, pagina } = await conTablet(tablet, {
    auto: false, almacen: { 'roam-picker:draft': { ...DRAFT, fase: 'picks' } },
    antes: async (p) => {
      // Playwright prueba las rutas de la última a la primera: el «nadie contesta» va primero.
      await p.context().route(/^http:\/\/192\.168\.68\.\d+:47323\//, (r) => r.abort('connectionrefused'));
      await nueva.enganchar(p);
      // Un impostor en la .66: contesta como Lector MLBB y dice «ok» a cualquier código.
      await p.context().route('http://192.168.68.66:47323/**', (r) => {
        const q = r.request();
        const cab = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Allow-Headers': '*', 'Content-Type': 'application/json' };
        if (q.method() === 'OPTIONS') return r.fulfill({ status: 204, headers: cab });
        const codigo = q.headers()['x-lector-codigo'];
        if (codigo) impostor.codigos.push(codigo);
        if (new URL(q.url()).pathname === '/reto') return r.fulfill({ status: 200, headers: cab, body: JSON.stringify({ prueba: 'a'.repeat(64) }) });
        return r.fulfill({ status: codigo ? 200 : 401, headers: cab, body: JSON.stringify(codigo ? { ok: true } : { error: 'codigo' }) });
      });
    },
  });
  try {
    ok(await esperarA(async () => JSON.parse(await pagina.evaluate(() => localStorage.getItem('roam-picker:lector-tablet'))).direccion === '192.168.68.112:47323', { plazoMs: 30000 }), 'no encuentra la tablet en su IP nueva');
    eq(impostor.codigos.length, 0, `el impostor recibe el código: ${impostor.codigos}`);
    ok(nueva.de('GET /reto').length > 0, 'da el código sin reto');
  } finally { await contexto.close(); }
});

/** La tablet aplica la corrección que le llega: su draft pasa a ser el corregido (como `conCorreccion`). */
function aplicaCorrecciones(tablet) {
  let n = 0;
  const reloj = setInterval(() => {
    const l = tablet.de('POST /draft');
    for (; n < l.length; n++) {
      const c = l[n].cuerpo;
      if (c.desde !== tablet.draft.desde) continue;
      const cinco = (a) => Array.from({ length: 5 }, (_, i) => a[i] ?? null);
      tablet.draft = { ...tablet.draft, enemigos: cinco(c.enemigos), aliados: cinco([...(c.tuyo ? [c.tuyo] : []), ...c.aliados]), tuyoFila: c.tuyo ? 0 : -1, tuyo: c.tuyo, baneos: c.baneos };
    }
  }, 50);
  return () => clearInterval(reloj);
}

test('«Deshacer» tras quitar un héroe leído se le manda a la tablet: la siguiente copia no lo vuelve a quitar (revisión 4.0)', async () => {
  const tablet = tabletFalsa({ draft: LEIDO() });
  const parar = aplicaCorrecciones(tablet);
  const { contexto, pagina, errores } = await conTablet(tablet, { auto: false });
  try {
    await boton(pagina).click();
    await esperarA(async () => (await leerGuardado(pagina)).enemies.length === 2);
    await pagina.getByRole('button', { name: 'Quitar Khufra' }).click();
    await esperarA(() => tablet.draft.enemigos.filter(Boolean).join() === 'Clint');
    await pagina.locator('.aviso-deshacer').getByRole('button', { name: 'Deshacer' }).click();
    await esperarA(() => tablet.draft.enemigos.filter(Boolean).length === 2, { plazoMs: 5000 });
    eq(tablet.draft.enemigos.filter(Boolean).sort().join(), 'Clint,Khufra', 'el «Deshacer» no llega a la tablet');
    await boton(pagina).click();
    await pagina.waitForTimeout(800);
    eq((await leerGuardado(pagina)).enemies.sort().join(), 'Clint,Khufra', 'la siguiente copia vuelve a quitar lo que deshiciste');
    ok(!errores.length, errores.join());
  } finally { parar(); await contexto.close(); }
});

test('una copia con la partida del draft viejo y un draft nuevo de la tablet deja el nuevo a la vista (revisión 4.0)', async () => {
  const tablet = tabletFalsa({ draft: LEIDO() });
  const { contexto, pagina, errores } = await conTablet(tablet, { auto: false });
  try {
    await boton(pagina).click();
    await esperarA(async () => (await leerGuardado(pagina)).desdeTablet === DESDE);
    const nuevo = draftTablet({ desde: DESDE + 600000, baneos: ['Lancelot'], enemigos: ['Chou', 'Saber', null, null, null], aliados: [null, 'Estes', null, null, null], tuyoFila: 1 });
    tablet.draft = nuevo;
    tablet.partida = { desde: DESDE, estado: 'apuntada', gane: true, registro: { t: Date.now() - 1000, pick: 'Estes', gane: true, recomendados: [], rango: 'glory', origen: 'lector' } };
    await boton(pagina).click();
    ok(await esperarA(async () => (await leerGuardado(pagina, 'roam-picker:partidas'))?.length === 1), 'la partida apuntada por la tablet no entra');
    await pagina.waitForTimeout(500);
    eq((await leerGuardado(pagina)).ignorarTabletHasta, DESDE, 'el draft viejo podría volver a copiarse');
    const d = await leerGuardado(pagina);
    eq(d.enemies.join(), 'Chou,Saber', 'la partida del draft viejo se lleva por delante el draft nuevo');
    eq(d.desdeTablet, nuevo.desde);
    ok(!errores.length, errores.join());
  } finally { await contexto.close(); }
});

test('una copia que vuelve con una hoja ya abierta no cambia el draft bajo el dedo (revisión 4.0)', async () => {
  const vacioT = draftTablet({ desde: DESDE, baneos: [], enemigos: [null, null, null, null, null], aliados: [null, null, null, null, null], tuyoFila: -1 });
  const tablet = tabletFalsa({ draft: vacioT });
  const { contexto, pagina, errores } = await conTablet(tablet, { auto: true, almacen: { 'roam-picker:draft': { enemies: ['Chou'], allies: [], bans: [], enemyRoam: null, fase: 'picks' } } });
  try {
    await esperarA(() => tablet.de('GET /draft').length >= 1);
    tablet.draft = { ...vacioT, enemigos: ['Clint', null, null, null, null] };
    let soltar;
    tablet.retener = new Promise((r) => { soltar = r; });
    const antes = tablet.de('GET /draft').length;
    await esperarA(() => tablet.de('GET /draft').length > antes, { plazoMs: 5000 });
    await pagina.getByRole('button', { name: 'Añadir' }).first().click();
    await pagina.locator('.sheet').waitFor();
    soltar(); tablet.retener = null;
    await pagina.waitForTimeout(800);
    ok(await pagina.locator('.sheet').count() > 0, 'la hoja se cerró');
    eq((await leerGuardado(pagina)).enemies.join(), 'Chou', 'la copia en vuelo cambió el draft con la hoja abierta');
    ok(!errores.length, errores.join());
  } finally { await contexto.close(); }
});
