/**
 * El enlace a una incidencia de GitHub ya rellena (src/app/github.js): el
 * repositorio sale de la dirección de Pages y el cuerpo va codificado.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { repositorioDe, urlDeIncidencia, TOPE_URL, subirIncidencia, comentarIncidencia, escribirFichero, leerFichero, tokenPlausible, API_GITHUB } from '../../src/app/github.js';

test('el repositorio se deduce de la dirección de Pages', () => {
  const pages = repositorioDe({ hostname: 'srchipiron.github.io', pathname: '/mobile-legends-pick-assist/' });
  eq(pages.duenno, 'srchipiron'); eq(pages.repo, 'mobile-legends-pick-assist');
  const local = repositorioDe({ hostname: 'localhost', pathname: '/' });
  eq(local.duenno, 'localhost'); eq(local.repo, 'mlbb-roam-picker');
});

test('la dirección lleva título, etiquetas y cuerpo codificados', () => {
  const url = new URL(urlDeIncidencia({ titulo: 'Partidas: 3 · hoy', etiquetas: ['partidas'], cuerpo: 'a\n```\nMLPA1.x.y\n```' }, { hostname: 'srchipiron.github.io', pathname: '/mobile-legends-pick-assist/' }));
  eq(url.origin + url.pathname, 'https://github.com/srchipiron/mobile-legends-pick-assist/issues/new');
  eq(url.searchParams.get('title'), 'Partidas: 3 · hoy');
  eq(url.searchParams.get('labels'), 'partidas');
  ok(url.searchParams.get('body').includes('MLPA1.x.y'), 'el cuerpo no lleva el código');
  ok(TOPE_URL > 2000 && TOPE_URL < 8200, `un tope de ${TOPE_URL} no es el de los navegadores`);
});

/** Un fetch de mentira que apunta lo pedido y responde lo que se le diga. */
function fetchFalso(respuestas) {
  const pedidas = [];
  const fetch = async (url, opciones) => {
    pedidas.push({ url, ...opciones });
    const r = respuestas.shift();
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.datos ?? {} };
  };
  return { fetch, pedidas };
}
const PAGES = { hostname: 'srchipiron.github.io', pathname: '/mobile-legends-pick-assist/' };
const TOKEN = 'github_pat_PRUEBA_0123456789abcdefghij';

test('subir por la API: la primera vez abre la incidencia con etiqueta, las siguientes editan la misma; el token solo va en la cabecera y solo a api.github.com', async () => {
  const { fetch, pedidas } = fetchFalso([{ status: 201, datos: { number: 12, html_url: 'https://github.com/x/y/issues/12' } }, { status: 200, datos: { number: 12, html_url: 'https://github.com/x/y/issues/12' } }]);
  const r1 = await subirIncidencia({ titulo: 'Partidas', cuerpo: 'a\n```\nMLPA1.x.y\n```', etiquetas: ['partidas'] }, TOKEN, { location: PAGES, fetch });
  eq(r1.error, undefined, `falla al crear: ${r1.error}`);
  eq(r1.numero, 12); eq(r1.editada, false);
  eq(pedidas[0].method, 'POST');
  eq(pedidas[0].url, `${API_GITHUB}/repos/srchipiron/mobile-legends-pick-assist/issues`);
  const cuerpo1 = JSON.parse(pedidas[0].body);
  eq(cuerpo1.title, 'Partidas'); ok(cuerpo1.body.includes('MLPA1.x.y'), 'el cuerpo no lleva el código'); eq(cuerpo1.labels[0], 'partidas');
  eq(pedidas[0].headers.Authorization, `Bearer ${TOKEN}`);
  ok(!pedidas[0].url.includes(TOKEN) && !pedidas[0].body.includes(TOKEN), 'el token viaja fuera de la cabecera');
  const r2 = await subirIncidencia({ numero: 12, titulo: 'Partidas 2', cuerpo: 'b' }, TOKEN, { location: PAGES, fetch });
  eq(r2.numero, 12); eq(r2.editada, true);
  eq(pedidas[1].method, 'PATCH');
  eq(pedidas[1].url, `${API_GITHUB}/repos/srchipiron/mobile-legends-pick-assist/issues/12`);
  ok(!('labels' in JSON.parse(pedidas[1].body)), 'al editar se tocan las etiquetas');
  ok(pedidas.every((p) => p.url.startsWith(`${API_GITHUB}/`)), 'una petición sale a otro sitio');
});

test('subir por la API: la incidencia borrada abre otra; 401 es token, 403/404 al crear es permiso, y sin red no revienta', async () => {
  const a = fetchFalso([{ status: 404 }, { status: 201, datos: { number: 13 } }]);
  const r = await subirIncidencia({ numero: 12, titulo: 't', cuerpo: 'c', etiquetas: ['partidas'] }, TOKEN, { location: PAGES, fetch: a.fetch });
  eq(r.numero, 13); eq(r.editada, false); eq(a.pedidas.length, 2); eq(a.pedidas[1].method, 'POST');
  const b = fetchFalso([{ status: 401 }]);
  eq((await subirIncidencia({ titulo: 't', cuerpo: 'c' }, TOKEN, { location: PAGES, fetch: b.fetch })).error, 'token');
  const c = fetchFalso([{ status: 404 }]);
  eq((await subirIncidencia({ titulo: 't', cuerpo: 'c' }, TOKEN, { location: PAGES, fetch: c.fetch })).error, 'permiso', 'un 404 al CREAR no es «incidencia perdida», es el token sin acceso');
  const d = fetchFalso([{ status: 403 }]);
  eq((await subirIncidencia({ numero: 5, titulo: 't', cuerpo: 'c' }, TOKEN, { location: PAGES, fetch: d.fetch })).error, 'permiso');
  const e = fetchFalso([new TypeError('Failed to fetch')]);
  eq((await subirIncidencia({ titulo: 't', cuerpo: 'c' }, TOKEN, { location: PAGES, fetch: e.fetch })).error, 'red');
  const f = fetchFalso([{ status: 500 }]);
  eq((await subirIncidencia({ titulo: 't', cuerpo: 'c' }, TOKEN, { location: PAGES, fetch: f.fetch })).error, 'otro');
  ok(tokenPlausible(TOKEN) && !tokenPlausible('') && !tokenPlausible('corto') && !tokenPlausible('con espacio dentro 0123456789'), 'la forma del token no se comprueba');
});

test('un comentario en una incidencia va por POST a /comments con el token solo en la cabecera', async () => {
  const { fetch, pedidas } = fetchFalso([{ status: 201, datos: { html_url: 'https://github.com/x/y/issues/12#c1' } }, { status: 401 }]);
  const r = await comentarIncidencia({ numero: 12, cuerpo: 'hola' }, TOKEN, { location: PAGES, fetch });
  eq(r.url, 'https://github.com/x/y/issues/12#c1', `no devuelve la dirección del comentario: ${JSON.stringify(r)}`);
  eq(`${pedidas[0].method} ${pedidas[0].url}`, `POST ${API_GITHUB}/repos/srchipiron/mobile-legends-pick-assist/issues/12/comments`);
  eq(JSON.parse(pedidas[0].body).body, 'hola');
  ok(!pedidas[0].url.includes(TOKEN) && !pedidas[0].body.includes(TOKEN) && pedidas[0].headers.Authorization === `Bearer ${TOKEN}`, 'el token viaja fuera de la cabecera');
  eq((await comentarIncidencia({ numero: 12, cuerpo: 'x' }, TOKEN, { location: PAGES, fetch })).error, 'token', 'un 401 no es «token»');
});

test('escribirFichero (3.65.0): solo public/*.json, lee el sha y lo manda al escribir en main; el token solo en la cabecera y solo a api.github.com', async () => {
  for (const ruta of ['src/app/App.jsx', '.github/workflows/deploy.yml', 'public/../package.json', 'public/sub/x.json', 'public/licencias.js']) {
    const { fetch, pedidas } = fetchFalso([]);
    eq((await escribirFichero({ ruta, contenido: 'x', mensaje: 'm' }, TOKEN, { location: PAGES, fetch })).error, 'ruta', `deja escribir ${ruta}`);
    eq(pedidas.length, 0, `con ${ruta} llega a pedir algo`);
  }
  const { fetch, pedidas } = fetchFalso([{ status: 200, datos: { sha: 'abc123' } }, { status: 200, datos: {} }]);
  const contenido = '{ "exigir": true, "nombre": "Ñandú" }\n';
  eq((await escribirFichero({ ruta: 'public/licencias.json', contenido, mensaje: 'Licencias' }, TOKEN, { location: PAGES, fetch })).ok, true);
  eq(pedidas.length, 2);
  eq(pedidas[0].method, 'GET'); eq(pedidas[1].method, 'PUT');
  for (const p of pedidas) {
    ok(p.url.startsWith(`${API_GITHUB}/repos/srchipiron/mobile-legends-pick-assist/contents/public/licencias.json`), `pide a otro sitio: ${p.url}`);
    ok(!p.url.includes(TOKEN) && !(p.body ?? '').includes(TOKEN) && p.headers.Authorization === `Bearer ${TOKEN}`, 'el token viaja fuera de la cabecera');
  }
  const cuerpo = JSON.parse(pedidas[1].body);
  eq(cuerpo.sha, 'abc123', 'sin el sha GitHub rechaza la escritura');
  eq(cuerpo.branch, 'main');
  eq(Buffer.from(cuerpo.content, 'base64').toString('utf8'), contenido, 'el contenido no llega tal cual (UTF-8)');
  // Fichero nuevo: sin sha. Y los errores con nombre.
  const nuevo = fetchFalso([{ status: 404 }, { status: 201, datos: {} }]);
  eq((await escribirFichero({ ruta: 'public/licencias.json', contenido: '{}', mensaje: 'm' }, TOKEN, { location: PAGES, fetch: nuevo.fetch })).ok, true);
  eq(JSON.parse(nuevo.pedidas[1].body).sha, undefined);
  eq((await escribirFichero({ ruta: 'public/licencias.json', contenido: '{}', mensaje: 'm' }, TOKEN, { location: PAGES, fetch: fetchFalso([{ status: 403 }]).fetch })).error, 'permiso');
  eq((await escribirFichero({ ruta: 'public/licencias.json', contenido: '{}', mensaje: 'm' }, TOKEN, { location: PAGES, fetch: fetchFalso([{ status: 200, datos: { sha: 's' } }, { status: 403 }]).fetch })).error, 'permiso');
  eq((await escribirFichero({ ruta: 'public/licencias.json', contenido: '{}', mensaje: 'm' }, TOKEN, { location: PAGES, fetch: fetchFalso([new Error('sin red')]).fetch })).error, 'red');
});

test('leerFichero y escribirFichero con función (3.65.1): el cambio parte de lo que hay AHORA en el repositorio', async () => {
  const b64 = (t) => Buffer.from(t).toString('base64').replace(/(.{20})/g, '$1\n');
  const ahora = '{ "exigir": true, "nombre": "Ñandú" }';
  const l = fetchFalso([{ status: 200, datos: { sha: 's1', content: b64(ahora) } }]);
  const leido = await leerFichero({ ruta: 'public/licencias.json' }, TOKEN, { location: PAGES, fetch: l.fetch });
  eq(leido.contenido, ahora, 'no decodifica lo del repositorio (base64 con saltos, UTF-8)');
  eq(leido.sha, 's1');
  eq((await leerFichero({ ruta: 'src/x.json' }, TOKEN, { location: PAGES, fetch: fetchFalso([]).fetch })).error, 'ruta');
  eq((await leerFichero({ ruta: 'public/licencias.json' }, TOKEN, { location: PAGES, fetch: fetchFalso([{ status: 404 }]).fetch })).contenido, null);
  const { fetch, pedidas } = fetchFalso([{ status: 200, datos: { sha: 's1', content: b64(ahora) } }, { status: 200, datos: {} }]);
  let visto;
  const r = await escribirFichero({ ruta: 'public/licencias.json', contenido: (a) => { visto = a; return a.replace('true', 'false'); }, mensaje: 'm' }, TOKEN, { location: PAGES, fetch });
  eq(visto, ahora, 'la función no recibe lo que hay en el repositorio');
  eq(Buffer.from(JSON.parse(pedidas[1].body).content, 'base64').toString('utf8'), ahora.replace('true', 'false'));
  eq(r.contenido, ahora.replace('true', 'false'));
  const pisar = fetchFalso([{ status: 200, datos: { sha: 's1', content: b64(ahora) } }]);
  eq((await escribirFichero({ ruta: 'public/licencias.json', contenido: () => { throw new Error('yaHay'); }, mensaje: 'm' }, TOKEN, { location: PAGES, fetch: pisar.fetch })).error, 'yaHay');
  eq(pisar.pedidas.length, 1, 'escribe aunque la función se niegue');
});

await terminar('app/github');
