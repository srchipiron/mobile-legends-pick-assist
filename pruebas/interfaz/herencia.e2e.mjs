/**
 * Lo que Javi tiene guardado en su móvil con 3.102.0 abre en 4.0 sin perder
 * nada: el draft (con lo leído por el lector viejo), la maestría, las
 * partidas, las quitadas, lo comprobado, los ajustes, la tablet vinculada, el
 * token, la base de datos y las licencias. Se carga, se usa y se recarga, y
 * cada clave sigue diciendo lo mismo (`voz-callada`, reservada, ni se toca).
 */
import { servirDist, abrirNavegador, paginaCon, test, after, ok, eq, abrirAjustes } from './navegador.mjs';
import { tabletFalsa, TABLET } from './tablet-falsa.mjs';

const { url, cerrar } = await servirDist();
const navegador = await abrirNavegador();
after(async () => {
  await navegador.close();
  await cerrar();
});

const AHORA = Date.now();
const H = 3600000;
const SUPA = { url: 'https://abcdefghijklmnopqrst.supabase.co', clave: 'sb_publishable_abcdefghijklmnopqrstuv' };
const CLAVE_JUGADOR = 'J'.repeat(43);
/** Lo que guardaba 3.102.0, con cada forma que podía tener. */
const GUARDADO_3102 = {
  'roam-picker:linea': 'roam',
  'roam-picker:rank': 'glory',
  'roam-picker:idioma': 'es',
  'roam-picker:tacto': false,
  'roam-picker:lector-auto': true,
  'roam-picker:lector-tablet': TABLET,
  'roam-picker:voz-callada': true,
  'roam-picker:draft': {
    enemies: ['Clint', 'Khufra', 'Layla'], allies: ['Miya', 'Gloo'], bans: ['Hirara', 'Fanny'], enemyRoam: 'Khufra', fase: 'picks',
    miPick: 'Estes', miPickDesde: AHORA - 2 * 60000, miPickLeido: true, completoDesde: null,
    lectura: { baneos: ['Hirara', 'Fanny'], enemigos: ['Clint', 'Khufra'], aliados: ['Miya'], tuyo: 'Estes', ids: ['lectura-2026-11-14T20-00-00-1'], dudas: [{ hueco: 'e3', candidato: 'Gord', parecido: 0.74 }], ms: [1500], msCaptura: [900], formatos: ['crudo'] },
  },
  'roam-picker:mastery': { Estes: { games: 120, winRate: 0.58, desde: AHORA - 30 * 24 * H }, Rafaela: { games: 40, winRate: 0.51, desde: AHORA - 30 * 24 * H } },
  'roam-picker:partidas': [
    { t: AHORA - 5 * H, pick: 'Estes', recomendados: ['Estes', 'Rafaela', 'Diggie'], gane: true, rango: 'glory', estimacion: 0.552, modelo: 5, origen: 'lector', bans: ['Hirara'], draft: { linea: 'roam', enemigos: ['Clint', 'Layla'], aliados: ['Miya'], rival: 'Khufra' }, lector: { baneos: ['Hirara'], enemigos: ['Clint'] }, duracion: 14.2, fases: [0.5, 0.51, 0.52, 0.53, 0.54, 0.55] },
    { t: AHORA - 26 * H, pick: 'Rafaela', recomendados: ['Estes'], gane: false, rango: 'glory', supuesto: true, origen: 'lector', editada: AHORA - 20 * H },
    { t: AHORA - 400 * 24 * H, pick: 'Diggie', recomendados: [], gane: true, rango: 'glory', previa: true },
  ],
  'roam-picker:olvidadas': [AHORA - 50 * H, AHORA - 60 * H],
  'roam-picker:comprobadas': [{ t: AHORA - 5 * H, bien: true, que: null, cuando: AHORA - 4 * H }],
  'roam-picker:envio': { token: 'github_pat_1234567890abcdefghij' },
  'roam-picker:clave': null,
  'roam-picker:licencias': { version: 1, publica: null, exigir: false, revocadas: [] },
  'roam-picker:version-vista': '3.102.0',
  'roam-picker:comunidad': { activo: true, clave: CLAVE_JUGADOR, huella: '3.abc', cuando: AHORA - H, total: 3, error: null, intento: null, huellaIntentada: null, completo: true, config: SUPA },
};

test('lo guardado por 3.102.0 abre en 4.0, se usa y tras recargar sigue entero', async () => {
  const tablet = tabletFalsa({ draft: null });
  const { contexto, pagina, errores } = await paginaCon(navegador, url, {
    almacen: GUARDADO_3102, sinServiceWorker: true,
    antes: async (p) => {
      await tablet.enganchar(p);
      await p.route(`${url}comunidad.json*`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(SUPA) }));
      await p.route(`${url}licencias.json*`, (r) => r.fulfill({ status: 404, body: '' }));
      await p.route(`${SUPA.url}/**`, (r) => r.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
      await p.route('https://api.github.com/**', (r) => r.fulfill({ status: 404, contentType: 'application/json', body: '{}' }));
    },
  });
  try {
    // Lo que se ve: el draft, tu pick, la tablet vinculada y tus partidas.
    eq((await pagina.locator('.side.enemy .slot-name').allInnerTexts()).join(), 'Clint,Khufra,Layla', 'el draft guardado no sale');
    ok(/Estes/.test(await pagina.locator('.slot.yo').getAttribute('title')), 'tu pick guardado no sale');
    eq(await pagina.locator('.side.enemy .slot.marked').count(), 1, 'el rival marcado no sale');
    await abrirAjustes(pagina);
    ok(/Vinculado con la tablet en 192\.168\.68\.116/.test(await pagina.locator('.lector-tablet').innerText()), 'la tablet vinculada se pierde');
    await pagina.locator('.more .tools .reset').nth(1).click();
    eq(await pagina.locator('.partida').count(), 3, 'faltan partidas');
    await pagina.locator('.sheet-head .close').click();
    await pagina.waitForTimeout(400);
    // Usarla un poco (marcar y desmarcar el rival) y recargar.
    await pagina.getByRole('button', { name: 'Marcar a Clint como tu rival' }).click();
    await pagina.getByRole('button', { name: 'Marcar a Khufra como tu rival' }).click();
    await pagina.waitForTimeout(500);
    await pagina.reload({ waitUntil: 'networkidle' });
    await pagina.waitForTimeout(800);
    const ahora = await pagina.evaluate((claves) => Object.fromEntries(claves.map((k) => [k, JSON.parse(localStorage.getItem(k) ?? 'null')])), Object.keys(GUARDADO_3102));
    for (const [clave, valor] of Object.entries(GUARDADO_3102)) {
      // La base de datos sube sola con la huella de 4.0 (huella, cuándo y total cambian): lo tuyo, igual.
      if (clave === 'roam-picker:comunidad') {
        const c = ahora[clave];
        ok(c.activo === true && c.clave === CLAVE_JUGADOR && JSON.stringify(c.config) === JSON.stringify(SUPA), `la base de datos se pierde: ${JSON.stringify(c)}`);
        continue;
      }
      eq(JSON.stringify(ahora[clave]), JSON.stringify(valor), `${clave} cambia o se pierde al pasar a 4.0`);
    }
    ok(!errores.length, errores.join());
  } finally { await contexto.close(); }
});
