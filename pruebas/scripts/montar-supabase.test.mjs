import { test, ok, eq, terminar } from '../arnes.mjs';
import { montar, API } from '../../scripts/montar-supabase.mjs';
import { supabaseFalso } from '../fixtures/supabase-falso.mjs';

const TOKEN = 'token-de-prueba-que-no-es-de-supabase';
const REF = 'abcdefghijklmnopqrst';
const PUBLICA = 'sb_publishable_prueba1234567890';
const anonJwt = `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'anon' })).toString('base64url')}.firma`;

/** La API de gestión de mentira, más el proyecto (las funciones del esquema) en su dirección. */
function gestionFalsa({ proyectos = [], claves = null, arranques = 2, slugObligatorio = false, eco = false } = {}) {
  const vistas = [];
  const proyecto = supabaseFalso({ clavePublica: PUBLICA });
  let estado = 0;
  const lista = [...proyectos];
  const responder = (cuerpo, status = 200) => new Response(JSON.stringify(cuerpo), { status, headers: { 'Content-Type': 'application/json' } });
  async function fetch(url, o = {}) {
    vistas.push({ url: String(url), metodo: o.method, cabeceras: o.headers ?? {}, cuerpo: o.body ?? '' });
    if (String(url).startsWith(`https://${REF}.supabase.co/`)) return proyecto.fetch(url, o);
    if (!String(url).startsWith(API)) return responder({ message: 'no' }, 404);
    if (o.headers?.Authorization !== `Bearer ${TOKEN}`) return responder({ message: `Unauthorized ${o.headers?.Authorization}` }, 401);
    const ruta = String(url).slice(API.length);
    if (ruta === '/v1/projects' && o.method === 'GET') return responder(lista);
    if (ruta === '/v1/organizations') return responder([{ id: 'org1', slug: 'mi-org', name: 'Javi' }]);
    if (ruta === '/v1/projects' && o.method === 'POST') {
      const b = JSON.parse(o.body);
      if (eco) return responder({ message: `cuota llena para ${o.headers.Authorization}` }, 400);
      if (slugObligatorio && !b.organization_slug) return responder({ message: 'organization_slug is required' }, 400);
      ok(b.db_pass?.length >= 24, 'la contraseña de la base de datos es corta');
      const p = { id: REF, ref: REF, name: b.name, region: b.region, status: 'COMING_UP' };
      lista.push(p);
      return responder(p, 201);
    }
    if (ruta === `/v1/projects/${REF}`) { estado += 1; return responder({ id: REF, status: estado > arranques ? 'ACTIVE_HEALTHY' : 'COMING_UP' }); }
    if (ruta === `/v1/projects/${REF}/database/query`) return responder([]);
    if (ruta === `/v1/projects/${REF}/api-keys?reveal=false`) {
      return responder(claves ?? [
        { name: 'service_role', type: 'legacy', api_key: `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.x` },
        { name: 'secret', type: 'secret', api_key: 'sb_secret_abcd••••••••' },
        { name: 'anon', type: 'legacy', api_key: anonJwt },
        { name: 'default', type: 'publishable', api_key: PUBLICA },
      ]);
    }
    return responder({ message: `no conozco ${ruta}` }, 404);
  }
  return { fetch, vistas, lista };
}

const sinEspera = () => Promise.resolve();

test('crea el proyecto, espera a que arranque, pega el esquema y se queda con la clave PUBLICABLE', async () => {
  const g = gestionFalsa();
  const r = await montar({ token: TOKEN, fetch: g.fetch, esperar: sinEspera, esquema: 'select 1' });
  eq(r.creado, true);
  eq(JSON.stringify(r.config), JSON.stringify({ url: `https://${REF}.supabase.co`, clave: PUBLICA }));
  const sql = g.vistas.find((v) => v.url.endsWith('/database/query'));
  eq(JSON.parse(sql.cuerpo).query, 'select 1', 'no pega el esquema');
  ok(g.vistas.filter((v) => v.url.endsWith(`/v1/projects/${REF}`)).length >= 3, 'no espera a que arranque');
  ok(g.vistas.findIndex((v) => v.url.endsWith('/database/query')) > g.vistas.findIndex((v) => v.url.endsWith(`/v1/projects/${REF}`)), 'pega el esquema antes de que arranque');
});

test('el token solo va a api.supabase.com, en la cabecera; al proyecto va la clave publicable', async () => {
  const g = gestionFalsa();
  await montar({ token: TOKEN, fetch: g.fetch, esperar: sinEspera, esquema: 'select 1' });
  for (const v of g.vistas) {
    const lleva = JSON.stringify(v).includes(TOKEN);
    if (v.url.startsWith(API)) ok(lleva && v.cabeceras.Authorization === `Bearer ${TOKEN}` && !v.cuerpo.includes(TOKEN) && !v.url.includes(TOKEN), `el token va fuera de la cabecera: ${v.url}`);
    else ok(!lleva, `el token viaja a ${v.url}`);
  }
  const rpc = g.vistas.find((v) => v.url.includes('/rest/v1/rpc/'));
  eq(rpc.cabeceras.apikey, PUBLICA, 'la comprobación no usa la clave publicable');
});

test('no crea dos: con el proyecto ya hecho, lo usa; y si la API pide el slug de la organización, lo manda', async () => {
  const g = gestionFalsa({ proyectos: [{ id: REF, name: 'pick-assist', status: 'ACTIVE_HEALTHY' }], arranques: 0 });
  const r = await montar({ token: TOKEN, fetch: g.fetch, esperar: sinEspera, esquema: 'select 1' });
  eq(r.creado, false);
  eq(g.vistas.filter((v) => v.metodo === 'POST' && v.url === `${API}/v1/projects`).length, 0, 'crea otro proyecto');
  const g2 = gestionFalsa({ slugObligatorio: true });
  eq((await montar({ token: TOKEN, fetch: g2.fetch, esperar: sinEspera, esquema: 'select 1' })).creado, true, 'no prueba con el slug');
});

test('sin clave publicable no sigue, nunca con la secreta; y un error no enseña el token', async () => {
  const g = gestionFalsa({ claves: [{ name: 'service_role', api_key: `eyJ.${Buffer.from(JSON.stringify({ role: 'service_role' })).toString('base64url')}.x` }, { type: 'secret', api_key: 'sb_secret_abcdefghijklmnop' }] });
  let error = null;
  try { await montar({ token: TOKEN, fetch: g.fetch, esperar: sinEspera, esquema: 'select 1' }); } catch (e) { error = e.message; }
  ok(error && /publicable/.test(error), `sigue sin clave publicable: ${error}`);
  let malo = null;
  try { await montar({ token: 'otro-token-de-prueba-que-no-vale', fetch: g.fetch, esperar: sinEspera, esquema: 'select 1' }); } catch (e) { malo = e.message; }
  ok(malo && /token/.test(malo) && !malo.includes('otro-token'), `el error enseña el token o no dice qué pasa: ${malo}`);
  // Una API que devuelve el token dentro de su mensaje de error: no sale por pantalla.
  let eco = null;
  try { await montar({ token: TOKEN, fetch: gestionFalsa({ eco: true }).fetch, esperar: sinEspera, esquema: 'select 1' }); } catch (e) { eco = e.message; }
  ok(eco && /cuota llena/.test(eco) && !eco.includes(TOKEN), `el error enseña el token: ${eco}`);
  let sinToken = null;
  try { await montar({ token: '', fetch: g.fetch }); } catch (e) { sinToken = e.message; }
  ok(/SUPABASE_ACCESS_TOKEN/.test(sinToken), 'sin token no dice cuál falta');
});

test('con solo la anon de siempre (proyecto viejo), usa esa', async () => {
  const g = gestionFalsa({ claves: [{ name: 'anon', api_key: anonJwt }] });
  // El proyecto de pega solo acepta PUBLICA: la comprobación final falla, pero la elegida es la anon.
  let error = null;
  try { await montar({ token: TOKEN, fetch: g.fetch, esperar: sinEspera, esquema: 'select 1' }); } catch (e) { error = e.message; }
  ok(/no contestan con la clave publicable \(permiso 401\)/.test(error), `no comprueba con la clave elegida: ${error}`);
  eq(g.vistas.filter((v) => v.url.includes('/rest/v1/rpc/'))[0].cabeceras.apikey, anonJwt);
});

await terminar('scripts/montar-supabase');
