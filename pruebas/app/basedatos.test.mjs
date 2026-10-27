import { test, ok, eq, terminar } from '../arnes.mjs';
import { supabaseFalso } from '../fixtures/supabase-falso.mjs';
import {
  sanearConfig, clavePublicable, crearClaveDeJugador, claveDeJugadorValida, paraLaComunidad, sanearEstadoComunidad,
  tocaSubirComunidad, llamar, subirPartidas, traerMisPartidas, borrarMisPartidas, bajarComunidad, POR_LOTE, queTraer,
} from '../../src/app/basedatos.js';

const URL = 'https://abcdefghijklmnopqrst.supabase.co';
const jwt = (carga) => `eyJhbGciOiJIUzI1NiJ9.${Buffer.from(JSON.stringify(carga)).toString('base64url')}.firma`;
const T0 = 1788000000000;
const partida = (i, extra = {}) => ({ t: T0 + i * 60000, pick: 'Rafaela', gane: i % 2 === 0, recomendados: ['Rafaela'], ...extra });

test('la configuración: solo un proyecto de Supabase y una clave que se puede publicar, nunca la secreta', () => {
  ok(sanearConfig({ url: URL, clave: 'sb_publishable_abcDEF123456' }), 'rechaza la publishable');
  ok(sanearConfig({ url: `${URL}/`, clave: jwt({ role: 'anon' }) }), 'rechaza la anon de siempre');
  eq(sanearConfig({ url: URL, clave: 'sb_secret_abcDEF123456' }), null, 'acepta la clave secreta');
  eq(sanearConfig({ url: URL, clave: jwt({ role: 'service_role' }) }), null, 'acepta la service_role');
  for (const url of ['http://abcdefghijklmnopqrst.supabase.co', 'https://abcdefghijklmnopqrst.supabase.co.malo.com', 'https://otra.com', `${URL}/rest/v1`, 'https://ABCDEFGHIJKLMNOPQRST.supabase.co']) {
    eq(sanearConfig({ url, clave: 'sb_publishable_abcDEF123456' }), null, `acepta ${url}`);
  }
  ok(!clavePublicable('a.b'), 'un JWT a medias');
});

test('la clave de jugador: al azar, con la forma que exige el servidor, distinta cada vez', () => {
  const a = crearClaveDeJugador(); const b = crearClaveDeJugador();
  ok(claveDeJugadorValida(a) && a.length === 43, a);
  ok(a !== b, 'dos claves iguales');
  ok(!claveDeJugadorValida('corta') && !claveDeJugadorValida(`${'a'.repeat(40)}!`), 'acepta una clave sin forma');
});

test('de cada partida viaja lo que sirve para medir: nada del lector ni campos que no conoce', () => {
  const p = paraLaComunidad({ ...partida(0), estimacion: 0.55, modelo: 3, draft: { enemigos: ['Ling'], aliados: [] }, origen: 'lector', lector: { ids: ['lectura-1'], dudas: [] }, token: 'github_pat_x', raro: 1 });
  eq(JSON.stringify(Object.keys(p).sort()), JSON.stringify(['draft', 'estimacion', 'gane', 'modelo', 'origen', 'pick', 'recomendados', 't']));
});

test('el estado guardado: sin clave válida no está activo', () => {
  eq(sanearEstadoComunidad({ activo: true, clave: 'corta' }).activo, false);
  const e = sanearEstadoComunidad({ activo: true, clave: 'k'.repeat(43), total: 3, config: { url: URL, clave: 'sb_secret_x1234567890' } });
  ok(e.activo && e.total === 3, 'pierde lo bueno');
  eq(e.config, null, 'guarda una configuración con la clave secreta');
});

test('cuándo sube: activo, con configuración, con algo nuevo, y no machaca tras un fallo', () => {
  const e = sanearEstadoComunidad({ activo: true, clave: 'k'.repeat(43) });
  const config = { url: URL, clave: 'sb_publishable_abcDEF123456' };
  ok(tocaSubirComunidad(e, 'h1', { ahora: 1, partidas: 1, config }));
  ok(!tocaSubirComunidad({ ...e, activo: false }, 'h1', { ahora: 1, partidas: 1, config }), 'sube apagado');
  ok(!tocaSubirComunidad(e, 'h1', { ahora: 1, partidas: 1, config: null }), 'sube sin configuración');
  ok(!tocaSubirComunidad({ ...e, huella: 'h1' }, 'h1', { ahora: 1, partidas: 1, config }), 'sube lo mismo dos veces');
  ok(!tocaSubirComunidad({ ...e, error: 'red', huellaIntentada: 'h1', intento: 1000 }, 'h1', { ahora: 2000, partidas: 1, config }), 'reintenta en el acto');
  ok(tocaSubirComunidad({ ...e, error: 'red', huellaIntentada: 'h1', intento: 1000 }, 'h1', { ahora: 1000 + 10 * 60 * 1000, partidas: 1, config }), 'no reintenta nunca');
});

test('subir: la primera vez todas en lotes de 200, después solo las recientes; lo quitado se borra allí', async () => {
  const s = supabaseFalso();
  const config = { url: URL, clave: s.clavePublica };
  const clave = crearClaveDeJugador();
  const partidas = Array.from({ length: 450 }, (_, i) => partida(i));
  const r = await subirPartidas({ config, clave, partidas, referencia: { winRate: 0.51, partidas: 900 } }, { fetch: s.fetch });
  eq(r.total, 450, JSON.stringify(r));
  eq(s.llamadas.length, 3, 'no va en lotes de 200');
  ok(s.llamadas.every((l) => l.args.lote.length <= POR_LOTE), 'un lote de más de 200');
  eq(s.llamadas[0].args.lote[0].t, partidas[449].t, 'no empieza por la más nueva');
  const r2 = await subirPartidas({ config, clave, partidas: partidas.slice(0, 449), olvidadas: [partidas[449].t], completo: true }, { fetch: s.fetch });
  eq(s.llamadas.length, 4, 'después vuelve a subirlas todas');
  eq(r2.total, 449, 'la quitada sigue allí');
  const mias = await traerMisPartidas({ config, clave }, { fetch: s.fetch });
  eq(mias.partidas.length, 449);
  eq(s.jugadores.get(clave).referencia.winRate, 0.51, 'no sube el winrate de siempre');
});

test('las cabeceras: la publishable va como apikey sin Authorization; la anon de siempre, con ella', async () => {
  const vistas = [];
  const f = async (url, o) => { vistas.push({ url, ...o }); return new Response('true', { status: 200 }); };
  await llamar({ url: URL, clave: 'sb_publishable_abcDEF123456' }, 'borrar_mis_partidas', { clave: 'k'.repeat(43) }, { fetch: f });
  await llamar({ url: URL, clave: jwt({ role: 'anon' }) }, 'borrar_mis_partidas', { clave: 'k'.repeat(43) }, { fetch: f });
  eq(vistas[0].url, `${URL}/rest/v1/rpc/borrar_mis_partidas`);
  eq(vistas[0].headers.apikey, 'sb_publishable_abcDEF123456');
  eq(vistas[0].headers.Authorization, undefined, 'la publishable va como Bearer');
  ok(vistas[1].headers.Authorization?.startsWith('Bearer '), 'la anon va sin Bearer');
  eq((await llamar({ url: 'https://otra.com', clave: 'sb_publishable_abcDEF123456' }, 'x', {}, { fetch: f })).error, 'config', 'llama a una dirección que no es de Supabase');
  eq(vistas.length, 2);
});

test('los errores del servidor llegan con su nombre; sin red, «red»; nunca lanza', async () => {
  const s = supabaseFalso();
  const config = { url: URL, clave: s.clavePublica };
  eq((await subirPartidas({ config, clave: 'corta', partidas: [partida(1)] }, { fetch: s.fetch })).error, 'clave');
  eq((await subirPartidas({ config: { ...config, clave: 'sb_publishable_otraotraotra' }, clave: 'k'.repeat(43), partidas: [partida(1)] }, { fetch: s.fetch })).error, 'permiso');
  const sinRed = async () => { throw new TypeError('Failed to fetch'); };
  eq((await traerMisPartidas({ config, clave: 'k'.repeat(43) }, { fetch: sinRed })).error, 'red');
  const raro = async () => new Response('<html>', { status: 502 });
  eq((await borrarMisPartidas({ config, clave: 'k'.repeat(43) }, { fetch: raro })).error, 'otro');
});

test('bajar la comunidad: todas las páginas, sin repetir, con las referencias; y dice si se quedó a medias', async () => {
  const s = supabaseFalso();
  const config = { url: URL, clave: s.clavePublica };
  for (let k = 0; k < 3; k += 1) {
    await subirPartidas({ config, clave: `${'abc'[k]}`.repeat(40), partidas: Array.from({ length: 700 }, (_, i) => partida(i)), referencia: { winRate: 0.5, partidas: 100 } }, { fetch: s.fetch });
  }
  const r = await bajarComunidad(config, { fetch: s.fetch });
  eq(r.filas.length, 2100);
  eq(new Set(r.filas.map((f) => `${f.j}.${f.t}`)).size, 2100, 'repite filas entre páginas');
  eq(Object.keys(r.referencias).length, 3);
  eq(r.incompleto, false);
  const corta = await bajarComunidad(config, { fetch: s.fetch, maxPaginas: 1 });
  eq(corta.filas.length, 1000); eq(corta.incompleto, true, 'se calla que faltan');
  ok(!JSON.stringify(r).includes('a'.repeat(40)), 'lo de todos lleva la clave de alguien');
  const hostil = async () => new Response(JSON.stringify({ filas: [], referencias: JSON.parse('{"__proto__": {"x": 1}, "7": {"winRate": 0.5}}'), mas: false }), { status: 200 });
  const h = await bajarComunidad(config, { fetch: hostil });
  eq(Object.keys(h.referencias).join(), '7', 'deja pasar una referencia que no es de un jugador');
  eq(({}).x, undefined, 'una «__proto__» del servidor toca los objetos');
});

test('qué se trae de la base de datos (3.76.0): lo que falta, sin lo quitado, y lo arreglado allí después que aquí', () => {
  const aqui = { partidas: [{ t: 1, pick: 'A', gane: true }, { t: 2, pick: 'B', gane: true, editada: 500 }, { t: 3, pick: 'C', gane: true, editada: 900 }], olvidadas: [4] };
  const remotas = [
    { t: 1, pick: 'A', gane: false, editada: 100 }, // arreglada allí, aquí sin arreglar: viene
    { t: 2, pick: 'B', gane: false, editada: 400 }, // arreglada allí ANTES que aquí: no
    { t: 3, pick: 'C', gane: true, editada: 900 }, // igual: no
    { t: 4, pick: 'D', gane: true }, // quitada aquí: no
    { t: 5, pick: 'E', gane: true }, // nueva: viene
    { t: 'x', pick: 'F', gane: true },
  ];
  eq(JSON.stringify(queTraer(remotas, aqui).map((p) => p.t)), '[1,5]');
  ok(paraLaComunidad({ t: 1, pick: 'A', gane: true, editada: 7 }).editada === 7, 'la hora del arreglo no sube a la base de datos');
  ok(paraLaComunidad({ t: 1, pick: 'A', gane: true, supuesto: true }).supuesto === true, 'la marca de pick supuesto no sube (3.81.2)');
  // El Supabase de pega hace lo mismo que el esquema: lo arreglado no lo pisa una copia vieja.
  const s = supabaseFalso();
  const c = { apikey: s.clavePublica }, clave = 'Z'.repeat(40);
  s.atender('subir_partidas', { clave, lote: [{ t: 9, pick: 'A', gane: false, editada: 50 }] }, c);
  s.atender('subir_partidas', { clave, lote: [{ t: 9, pick: 'A', gane: true }] }, c);
  eq(s.jugadores.get(clave).partidas.get(9).gane, false, 'el falso deja pisar lo arreglado');
});

await terminar('app/basedatos');
