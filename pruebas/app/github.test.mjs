/**
 * El enlace a una incidencia de GitHub ya rellena (src/app/github.js): el
 * repositorio sale de la dirección de Pages y el cuerpo va codificado.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { repositorioDe, urlDeIncidencia, TOPE_URL, subirIncidencia, tokenPlausible, API_GITHUB } from '../../src/app/github.js';

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

await terminar('app/github');
