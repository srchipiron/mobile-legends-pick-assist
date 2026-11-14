/**
 * El móvil frente a la tablet (src/app/lector.js, protocolo 2): con quién se
 * vincula, que sin tablet no sale ninguna petición, que cada petición lleva
 * el código y la red local, qué manda (corrección, resultado, ajustes) y qué
 * acepta de vuelta, la búsqueda con reto y lo que se enseña de la tablet.
 */
import { pbkdf2Sync } from 'node:crypto';
import { test, ok, eq } from '../ayuda.mjs';
import {
  sanearLectorTablet, lectorTabletDeEnlace, ponerLectorEnTablet, baseLector, pedirJson, pedirDraft, corregirDraft, mandarResultado,
  mandarAjustes, ajustesParaLaTablet, pedirClaveDeLaTablet, pedirEstadoLector, claveDeFallo, sinLlegarALaTablet, pruebaDelReto,
  buscarTabletEnLaRed, buscarTabletUnaVez, ENTRE_BUSQUEDAS_MS, lineasDelSistema, queApk, versionAnterior, pedirUltimaApk, DESCARGA_APK,
} from '../../src/app/lector.js';
import { PROTOCOLO, RETO_VUELTAS, TABLA_SEGUIDAS, SIN_BANEOS_AVISO, MAESTRIA_MAX } from '../../src/comun/contrato.js';

const TABLET = { direccion: '192.168.68.116', codigo: 'ABCDEFGH23' };
/** Un fetch de pega que apunta lo que se pide y contesta lo que se le diga. */
const falso = (contestar = () => ({ status: 200, cuerpo: {} })) => {
  const vistas = [];
  const pedir = async (url, op = {}) => {
    vistas.push({ url, op, cuerpo: op.body ? JSON.parse(op.body) : undefined });
    const r = await contestar(url, op);
    if (r instanceof Error) throw r;
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.cuerpo };
  };
  return { pedir, vistas };
};
const opciones = (pedir) => ({ pedir, base: 'http://192.168.68.116:47323', codigo: TABLET.codigo });

test('solo una IP privada escrita tal cual y un código con forma; el enlace del QR igual', () => {
  eq(JSON.stringify(sanearLectorTablet({ direccion: '192.168.68.116', codigo: 'abcde-fgh23' })), JSON.stringify({ direccion: '192.168.68.116:47323', codigo: 'ABCDEFGH23' }));
  eq(sanearLectorTablet({ direccion: '10.0.0.5:5000', codigo: 'ABCDEFGH' })?.direccion, '10.0.0.5:5000');
  for (const malo of [{ direccion: '8.8.8.8', codigo: 'ABCDEFGH' }, { direccion: 'atacante.example', codigo: 'ABCDEFGH' }, { direccion: '192.168.1.2:99999', codigo: 'ABCDEFGH' }, { direccion: '192.168.1.2', codigo: 'ABC' }, { direccion: '192.168.1.2', codigo: 'ABC<DEFGH' }, null, 'x']) {
    eq(sanearLectorTablet(malo), null, `acepta ${JSON.stringify(malo)}`);
  }
  eq(lectorTabletDeEnlace('#lector=192.168.68.116:47323&codigo=ABCDEFGH23')?.codigo, 'ABCDEFGH23');
  eq(lectorTabletDeEnlace('#otra=cosa'), null);
  eq(lectorTabletDeEnlace('#lector=evil.example:47323&codigo=ABCDEFGH23'), null, 'el enlace manda el código a cualquier sitio');
});

test('sin tablet vinculada no sale ninguna petición; con ella, cada una lleva el código y declara la red local', async () => {
  const { pedir, vistas } = falso();
  ponerLectorEnTablet(null);
  eq(baseLector(), null);
  eq((await pedirJson('/draft', { pedir }).catch((e) => e)).tipo, 'sinPuente', 'sin tablet no falla como «no la encuentro»');
  eq(await corregirDraft({ desde: 5, enemigos: ['Ling'] }, { pedir }), false);
  eq(await mandarResultado({ desde: 5, gane: true }, { pedir }), false);
  eq(await mandarAjustes({ linea: 'roam' }, { pedir }), false);
  eq(await pedirClaveDeLaTablet({ pedir }), null);
  eq((await pedirEstadoLector({ pedir })).ok, false);
  eq(vistas.length, 0, `sin tablet vinculada salen peticiones: ${vistas.map((v) => v.url)}`);
  ponerLectorEnTablet(TABLET);
  try {
    eq(baseLector(), 'http://192.168.68.116:47323');
    await pedirJson('/estado', { pedir });
    eq(vistas[0].url, 'http://192.168.68.116:47323/estado');
    eq(vistas[0].op.headers['X-Lector-Codigo'], 'ABCDEFGH23', 'sin el código');
    eq(vistas[0].op.targetAddressSpace, 'local', 'no declara la red local');
    eq(vistas[0].op.cache, 'no-store');
  } finally { ponerLectorEnTablet(null); }
});

test('cada fallo con su tipo: no llega, plazo, código, bloqueado y la APK del protocolo viejo', async () => {
  for (const [status, tipo] of [[401, 'codigo'], [429, 'bloqueado'], [404, 'antigua'], [500, 'error']]) {
    eq((await pedirDraft(opciones(falso(() => ({ status, cuerpo: {} })).pedir)).catch((e) => e)).tipo, tipo, `un ${status}`);
  }
  eq((await pedirDraft(opciones(falso(() => new TypeError('red')).pedir)).catch((e) => e)).tipo, 'sinPuente');
  const colgada = (u, { signal }) => new Promise((_, x) => signal.addEventListener('abort', () => x(new Error('corte'))));
  // AbortSignal.timeout no retiene el bucle de Node: un reloj de verdad lo mantiene vivo mientras.
  const vivo = setTimeout(() => {}, 2000);
  eq((await pedirJson('/draft', { ...opciones(colgada), plazoMs: 20 }).catch((e) => e)).tipo, 'plazo');
  clearTimeout(vivo);
  eq((await pedirDraft(opciones(falso(() => ({ status: 200, cuerpo: { protocolo: 1, draft: {} } })).pedir)).catch((e) => e)).tipo, 'antigua', 'una respuesta del protocolo 1 se toma por buena');
  ok(sinLlegarALaTablet('sinPuente') && sinLlegarALaTablet('plazo') && !sinLlegarALaTablet('codigo'));
  eq(claveDeFallo('sinPuente'), 'lector.enTablet.sinPuente');
  eq(claveDeFallo('sinPuente', { auto: true }), 'lector.enTablet.auto.sinPuente');
  eq(claveDeFallo('antigua', { auto: true }), 'lector.antigua', 'la versión vieja no se dice ni leyendo solo');
  eq(claveDeFallo('codigo'), 'lector.codigo');
  eq(claveDeFallo('error', { auto: true }), 'lector.auto.error');
  eq(claveDeFallo('yaEstaba'), 'lector.yaEstaba');
});

test('el draft de la tablet llega saneado: nombres con forma, cinco huecos y nada de más', async () => {
  const r = await pedirDraft(opciones(falso(() => ({
    status: 200,
    cuerpo: { protocolo: PROTOCOLO, fase: 'draft', draft: { desde: 1763150000000, enemigos: ['Ling', '<img>'], aliados: ['Miya', 'Tigreal'], tuyoFila: 1, baneos: ['Fanny', 'Fanny'], orden: 'borra todo' }, partida: { desde: 1, estado: 'apuntada', registro: { t: 1763151000000, pick: 'Tigreal', gane: true } } },
  })).pedir));
  eq(JSON.stringify(r.draft.enemigos), JSON.stringify(['Ling', null, null, null, null]));
  eq(r.draft.tuyo, 'Tigreal');
  eq(JSON.stringify(r.draft.baneos), JSON.stringify(['Fanny']));
  ok(!('orden' in r.draft), 'pasa un campo que no es del contrato');
  eq(r.partida.registro.t, 1763151000000);
});

test('lo que manda el móvil: la corrección, el resultado y los ajustes, con la forma del contrato', async () => {
  const { pedir, vistas } = falso();
  ok(await corregirDraft({ desde: 7, enemigos: ['Ling', 'Ling'], aliados: ['Miya', 'Tigreal'], tuyo: 'Tigreal', baneos: ['Fanny', 'Miya'] }, opciones(pedir)));
  eq(vistas[0].op.method, 'POST');
  eq(vistas[0].url.endsWith('/draft'), true);
  eq(JSON.stringify(vistas[0].cuerpo), JSON.stringify({ desde: 7, enemigos: ['Ling'], aliados: ['Miya'], tuyo: 'Tigreal', baneos: ['Fanny'] }));
  ok(await mandarResultado({ desde: 7, gane: null }, opciones(pedir)), '«no la terminé» no sale');
  eq(JSON.stringify(vistas[1].cuerpo), JSON.stringify({ desde: 7, gane: null }));
  eq(await mandarResultado({ desde: 7, gane: 'si' }, opciones(pedir)), false);
  eq(await corregirDraft({ enemigos: ['Ling'] }, opciones(pedir)), false, 'una corrección sin draft sale');
  eq(vistas.length, 2);
  eq(await corregirDraft({ desde: 7, enemigos: ['Ling'] }, opciones(falso(() => ({ status: 409, cuerpo: {} })).pedir)), false, 'un 409 cuenta como tomado');
});

test('los ajustes para la tablet: tus MAESTRIA_MAX héroes más jugados con el winrate redondeado, y la clave solo si la usas', () => {
  const maestria = Object.fromEntries(Array.from({ length: MAESTRIA_MAX + 20 }, (_, i) => [`Heroe ${i}`, { games: i + 1, winRate: 0.512345 }]));
  const a = ajustesParaLaTablet({ linea: 'roam', rango: 'glory', idioma: 'es', maestria, clave: null });
  eq(Object.keys(a.maestria).length, MAESTRIA_MAX, 'pasa del tope');
  ok(Object.values(a.maestria).every((m) => m.games > 20 && m.winRate === 0.512), 'no son los más jugados o el winrate no va redondeado');
  ok(!('clave' in a), 'manda clave sin usar la base de datos');
  eq(ajustesParaLaTablet({ linea: 'roam', rango: 'glory', idioma: 'en', clave: 'K'.repeat(43) }).clave, 'K'.repeat(43));
  eq(ajustesParaLaTablet({ linea: null, rango: 'glory', idioma: 'es' }), null, 'sin línea hay ajustes');
});

test('la clave de la tablet y su estado: solo con forma, y nunca lanzan', async () => {
  eq(await pedirClaveDeLaTablet(opciones(falso(() => ({ status: 200, cuerpo: { clave: 'K'.repeat(43) } })).pedir)), 'K'.repeat(43));
  eq(await pedirClaveDeLaTablet(opciones(falso(() => ({ status: 200, cuerpo: { clave: 'corta' } })).pedir)), null);
  eq(await pedirClaveDeLaTablet(opciones(falso(() => new TypeError('red')).pedir)), null);
  const e = await pedirEstadoLector(opciones(falso(() => ({ status: 200, cuerpo: { ok: true, protocolo: 2, lector: { minutos: 3 }, salida: 'x'.repeat(900), tablet: [1] } })).pedir));
  ok(e.ok && e.protocolo === 2 && e.lector.minutos === 3 && e.tablet === null && e.salida.length === 500, JSON.stringify(e).slice(0, 200));
  eq((await pedirEstadoLector(opciones(falso(() => ({ status: 401, cuerpo: {} })).pedir))).tipo, 'codigo');
});

test('el reto: la misma cuenta que la tablet con node:crypto', async () => {
  const n = '0123456789abcdef0123456789abcdef';
  eq(await pruebaDelReto('ABCDEFGH23', n), pbkdf2Sync('ABCDEFGH23', `lector-reto:${n}`, RETO_VUELTAS, 32, 'sha256').toString('hex'));
});

test('buscar la tablet en la wifi: solo le da el código a quien resuelve el reto, y una búsqueda cada 2 minutos', async () => {
  const conCodigo = [];
  const pedir = async (url, op) => {
    const u = new URL(url);
    const ip = u.hostname;
    const codigo = op?.headers?.['X-Lector-Codigo'];
    if (codigo) conCodigo.push(ip);
    const resp = (status, cuerpo) => ({ status, ok: status === 200, json: async () => cuerpo });
    if (u.pathname === '/reto') {
      const n = u.searchParams.get('n');
      if (ip === '192.168.68.112') return resp(200, { prueba: await pruebaDelReto('ABCDEFGH23', n) });
      if (ip === '192.168.68.50') return resp(200, { prueba: await pruebaDelReto('OTROCODIGO9', n) });
      if (ip === '192.168.68.66') return resp(200, { prueba: 'a'.repeat(64) });
      return resp(404, {});
    }
    if (ip === '192.168.68.112') return codigo === 'ABCDEFGH23' ? resp(200, { ok: true }) : resp(401, { error: 'codigo' });
    if (ip === '192.168.68.50') return resp(401, { error: 'codigo' });
    // Un impostor: contesta como Lector MLBB y dice «ok» a cualquier código para quedárselo.
    if (ip === '192.168.68.66') return codigo ? resp(200, { ok: true }) : resp(401, { error: 'codigo' });
    if (ip === '192.168.68.1') return resp(200, { ok: true });
    throw new Error('nadie');
  };
  const r = await buscarTabletEnLaRed({ direccion: '192.168.68.116:47323', codigo: 'ABCDEFGH23' }, { pedir, plazoMs: 50 });
  eq(r?.direccion, '192.168.68.112:47323', `no la encuentra: ${JSON.stringify(r)}`);
  eq(conCodigo.sort().join(), '192.168.68.112', `el código va a quien no demostró conocerlo: ${conCodigo}`);
  eq(await buscarTabletEnLaRed({ direccion: '8.8.8.8:47323', codigo: 'ABCDEFGH23' }, { pedir }), null, 'busca fuera de la red de casa');
  let busquedas = 0;
  const contar = async () => { busquedas += 1; throw new Error('nadie'); };
  const ahora = Date.now() + 10 * ENTRE_BUSQUEDAS_MS;
  await buscarTabletUnaVez({ direccion: '192.168.68.116:47323', codigo: 'ABCDEFGH23' }, { ahora, pedir: contar, plazoMs: 5 });
  const antes = busquedas;
  eq(await buscarTabletUnaVez({ direccion: '192.168.68.116:47323', codigo: 'ABCDEFGH23' }, { ahora: ahora + 1000, pedir: contar }), null);
  eq(busquedas, antes, 'busca otra vez antes de los 2 minutos');
});

test('qué Lector MLBB contesta: vieja, atrasada (también sin el protocolo 2), al día o no contesta', () => {
  eq(queApk({ ok: true, lector: null }).estado, 'antigua');
  eq(queApk({ ok: false, tipo: 'plazo' }).estado, 'sinRespuesta');
  eq(queApk({ ok: true, protocolo: 2, lector: {}, tablet: { apk: '3.63.0' } }, '3.64.1').estado, 'atrasada');
  eq(queApk({ ok: true, protocolo: 2, lector: {}, tablet: { apk: '4.0.0' } }, '4.0.0').estado, 'alDia');
  eq(queApk({ ok: true, protocolo: null, lector: {}, tablet: { apk: '3.102.0' } }, '3.102.0').estado, 'atrasada', 'una APK sin el protocolo 2 sale al día');
  eq(queApk({ ok: true, protocolo: 2, lector: {}, tablet: null }, '4.0.0').estado, 'nose');
  ok(versionAnterior('3.9.9', '3.10.0') && !versionAnterior('3.64.1', '3.64.1') && !versionAnterior('4.0.0', '3.99.99'), 'compara como texto');
  ok(!versionAnterior('?', '3.64.1') && !versionAnterior('3.64.1', null));
  ok(DESCARGA_APK.startsWith('https://github.com/srchipiron/mobile-legends-pick-assist/releases/'), DESCARGA_APK);
});

test('la última APK publicada: lector-vX.Y.Z de GitHub, sin token, y null ante cualquier cosa rara', async () => {
  const { pedir, vistas } = falso(() => ({ status: 200, cuerpo: { tag_name: 'lector-v4.0.0' } }));
  eq(await pedirUltimaApk({ pedir }), '4.0.0');
  eq(vistas[0].url, 'https://api.github.com/repos/srchipiron/mobile-legends-pick-assist/releases/latest');
  ok(!JSON.stringify(vistas[0].op.headers).includes('Authorization'), 'pregunta con token');
  eq(await pedirUltimaApk({ pedir: falso(() => ({ status: 200, cuerpo: { tag_name: 'v9.9.9<script>' } })).pedir }), null);
  eq(await pedirUltimaApk({ pedir: falso(() => new Error('sin red')).pedir }), null);
});

test('«El sistema»: lo que dice la tablet, en rojo lo que hay que arreglar, con los umbrales del contrato', () => {
  const ahora = Date.parse('2026-10-26T12:00:00Z');
  const bien = lineasDelSistema({ ok: true, tablet: { grabando: true }, solo: { activo: true, linea: 'roam' }, lector: { lecturas: 0, lecturasSolo: 50, fallosCaptura: 1, minutos: 30 }, partidas: { apuntadas: 6, sinSubir: 0, porTabla: 4, porPregunta: 2 }, datos: { fecha: '2026-10-26T00:00:00Z' } }, { ahora });
  eq(JSON.stringify(bien.map((l) => l.clave)), JSON.stringify(['sistema.grabando', 'sistema.solo', 'sistema.lecturas', 'sistema.partidas', 'sistema.resultados', 'sistema.datos']));
  ok(bien.every((l) => !l.mal), JSON.stringify(bien));
  eq(bien.find((l) => l.clave === 'sistema.datos').params.h, 12);
  const mal = lineasDelSistema({ ok: true, tablet: { grabando: false }, solo: { activo: false }, lector: { lecturas: 20, fallosCaptura: 10, minutos: 5 }, partidas: { apuntadas: 3, sinSubir: 2, error: 'red', sinResultado: 2 }, datos: { fecha: '2026-10-20T00:00:00Z' } }, { ahora });
  eq(JSON.stringify(mal.filter((l) => l.mal).map((l) => l.clave)), JSON.stringify(['sistema.sinGrabar', 'sistema.soloApagado', 'sistema.lecturas', 'sistema.partidasSinSubir', 'sistema.sinResultado', 'sistema.datos']));
  const iguales = (n, gane) => lineasDelSistema({ ok: true, partidas: { apuntadas: 20, porTabla: 20, ultimasTabla: { n, gane } } }, { ahora }).filter((l) => l.mal).map((l) => l.clave);
  eq(JSON.stringify(iguales(TABLA_SEGUIDAS, TABLA_SEGUIDAS)), JSON.stringify(['sistema.todasVictoria']));
  eq(JSON.stringify(iguales(TABLA_SEGUIDAS, 0)), JSON.stringify(['sistema.todasDerrota']));
  eq(iguales(TABLA_SEGUIDAS, 7).length + iguales(TABLA_SEGUIDAS - 1, TABLA_SEGUIDAS - 1).length, 0);
  const jugadas = (partidas, apuntadas) => lineasDelSistema({ ok: true, solo: { activo: true, linea: 'roam', partidas, apuntadas } }).find((l) => l.clave === 'sistema.jugadas');
  ok(jugadas(3, 0)?.mal && !jugadas(2, 0).mal && jugadas(0, 0) === undefined);
  const sinBaneos = (n) => lineasDelSistema({ ok: true, solo: { activo: true, sinBaneos: n } }).find((l) => l.clave === 'sistema.sinBaneos');
  ok(sinBaneos(SIN_BANEOS_AVISO)?.mal && sinBaneos(SIN_BANEOS_AVISO - 1) === undefined);
  eq(lineasDelSistema({ ok: false }).length + lineasDelSistema({ ok: true }).length, 0);
});
