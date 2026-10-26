/**
 * El lector dentro de la tablet (3.61.0, scripts/lector/en-tablet.mjs): la
 * captura la da la APK por 127.0.0.1 con un secreto, y el lector escucha en
 * la wifi pero solo contesta con el código de vinculación, a la app, y con
 * una IP privada como `Host`.
 */
import { createServer, request } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { principal, vigilarErrores, lectorDeDatos, capturaDeLaApk, vozDeLaApk, esInterno, codigoValido, leerSaludDeLaApk, ajustesDeLaTablet, partidasDeLaTablet, subirLoDeLaTablet, leerComunidad, TOPE_PARTIDAS_TABLET, lineasLimpias, parteDeSalud, LINEAS_DEL_PARTE, claveDelLector, TOPE_PARTE_BYTES } from '../../scripts/lector/en-tablet.mjs';
import { supabaseFalso } from '../fixtures/supabase-falso.mjs';
import { claveDeJugadorValida } from '../../src/app/basedatos.js';
import { pruebaDelReto } from '../../src/app/lector.js';
import { writeFileSync } from 'node:fs';
import { crearPortero, hostPermitido, crearServidor, fundirAprendido, sanearCorreccion, deLaApk, FALLOS_CODIGO, VENTANA_CODIGO_MS, RETENCION_CAPTURAS_MS, CAPTURAS_A_MIRAR } from '../../scripts/lector/servir.mjs';
import { existsSync } from 'node:fs';
import { aprenderResultado, reconocerResultado, plantillasIniciales, ZONA_PALABRA } from '../../scripts/lector/resultado.mjs';
import { VERSION_APRENDIDO } from '../../scripts/lector/aprender.mjs';
import { readFileSync as leerFichero } from 'node:fs';
import { capturaCompletaPng, VERDAD } from '../fixtures/juego/captura.mjs';
import { leerPng } from '../../scripts/lector/png.mjs';

const png = capturaCompletaPng();
/** Lo que da la APK: la cabecera de 16 bytes de `screencap` (ancho, alto, RGBA_8888, espacio de color) y los píxeles. */
const crudo = (() => {
  const { ancho, alto, rgba } = leerPng(png);
  const cab = Buffer.alloc(16); cab.writeUInt32LE(ancho, 0); cab.writeUInt32LE(alto, 4); cab.writeUInt32LE(1, 8); cab.writeUInt32LE(0, 12);
  return Buffer.concat([cab, Buffer.from(rgba)]);
})();
const SECRETO = 'secreto-de-la-apk';
const CODIGO = 'AB12CD34EF';

/** La APK de pega: da la captura y la voz en 127.0.0.1, solo con el secreto. */
async function apkDePega() {
  const dichas = [];
  const s = createServer((req, res) => {
    if (req.headers['x-secreto'] !== SECRETO) { res.writeHead(403).end(); return; }
    if (req.url === '/captura') { res.writeHead(200, { 'Content-Type': 'application/octet-stream' }).end(crudo); return; }
    if (req.url === '/voz') { let b = ''; req.on('data', (t) => { b += t; }); req.on('end', () => { dichas.push(JSON.parse(b)); res.writeHead(200).end('{}'); }); return; }
    res.writeHead(404).end();
  });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return { base: `http://127.0.0.1:${s.address().port}`, dichas, cerrar: () => s.close() };
}

const pedir = (puerto, camino, { host = `192.168.68.116:${puerto}`, codigo = CODIGO, origen = 'https://srchipiron.github.io' } = {}) => new Promise((r, x) => {
  const headers = { Host: host, ...(origen ? { Origin: origen } : {}), ...(codigo ? { 'X-Lector-Codigo': codigo } : {}) };
  const q = request({ host: '127.0.0.1', port: puerto, path: camino, headers }, (res) => {
    let b = ''; res.on('data', (t) => { b += t; }); res.on('end', () => r({ estado: res.statusCode, cuerpo: b, cabeceras: res.headers }));
  });
  q.on('error', x); q.end();
});

test('la captura y la voz solo vienen de 127.0.0.1, y el código tiene que ser decente', () => {
  for (const u of ['http://127.0.0.1:5000']) ok(esInterno(u), `${u} no vale`);
  for (const u of ['http://192.168.1.2:5000', 'http://127.0.0.1.atacante.example:80', 'https://127.0.0.1:5000', 'http://localhost:5000', 'http://127.0.0.1:5000/x']) ok(!esInterno(u), `${u} vale`);
  let lanzo = false;
  try { capturaDeLaApk('http://192.168.1.2:5000', 's'); } catch { lanzo = true; }
  ok(lanzo, 'la captura acepta venir de otro aparato');
  ok(codigoValido('AB12CD34') && !codigoValido('1234') && !codigoValido('AB12 CD34') && !codigoValido(undefined), 'el código acepta lo que no debe');
});

test('el portero: el bueno entra, uno malo no, y tras demasiados fallos nadie hasta que pasa la ventana', () => {
  let t = 0;
  const portero = crearPortero(CODIGO, { ahora: () => t });
  eq(portero(CODIGO), 'si');
  eq(portero('AB12CD34EX'), 'no');
  eq(portero(undefined), 'no');
  eq(portero(CODIGO.slice(0, 5)), 'no', 'un trozo del código entra');
  for (let i = 0; i < FALLOS_CODIGO; i++) portero('MALO' + i, '192.168.1.66');
  eq(portero(CODIGO, '192.168.1.66'), 'bloqueado', 'tras los fallos el bueno entra igual desde ese aparato (adivinarlo compensa)');
  // Otro aparato (el móvil de Javi) sigue entrando: diez códigos malos de otro no lo dejan fuera.
  eq(portero(CODIGO, '192.168.1.20'), 'si', 'los fallos de otro aparato dejan fuera al bueno');
  t += VENTANA_CODIGO_MS + 1;
  eq(portero(CODIGO, '192.168.1.66'), 'si', 'pasada la ventana el bueno sigue sin entrar');
  eq(crearPortero('')(''), 'no', 'sin código entra cualquiera');
  // Preguntar SIN código no es adivinar (3.65.4): la app busca la tablet en la wifi tras un cambio de IP.
  const sinCodigo = crearPortero(CODIGO, { ahora: () => t });
  for (let i = 0; i < FALLOS_CODIGO * 3; i++) { eq(sinCodigo(undefined, '192.168.1.20'), 'no'); eq(sinCodigo('', '192.168.1.20'), 'no'); }
  eq(sinCodigo(CODIGO, '192.168.1.20'), 'si', 'buscar la tablet sin código deja fuera al móvil');
});

test('el Host en la tablet: IP privada tal cual, nunca un nombre', () => {
  for (const h of ['192.168.68.116:47323', '10.0.0.5', '172.16.0.9:47323', '127.0.0.1:47323']) ok(hostPermitido(h, { red: true }), `${h} no vale`);
  for (const h of ['8.8.8.8:47323', 'tablet.local', '192.168.68.116.atacante.example', 'atacante.example', '172.32.0.1']) ok(!hostPermitido(h, { red: true }), `${h} vale`);
  ok(!hostPermitido('192.168.68.116:47323'), 'sin `red` (Termux) vale una IP de la wifi');
});

test('el lector en la tablet: lee con la captura de la APK y solo con el código, desde la app y con su IP', async () => {
  const apk = await apkDePega();
  const casa = mkdtempSync(join(tmpdir(), 'en-tablet-'));
  const servidor = await principal({ LECTOR_INTERNO: apk.base, LECTOR_SECRETO: SECRETO, LECTOR_CODIGO: CODIGO, LECTOR_CASA: casa, LECTOR_PUERTO: '0', LECTOR_ESCUCHA: '127.0.0.1', LECTOR_ULTIMA_SALIDA: 'Último cierre (hace 2 min): Android la cerró por falta de memoria' });
  const puerto = servidor.address().port;
  try {
    const leida = await pedir(puerto, '/leer');
    eq(leida.estado, 200, `con todo en regla no lee: ${leida.cuerpo}`);
    const l = JSON.parse(leida.cuerpo);
    eq(l.tuyos?.map((b) => b.nombre).join(), VERDAD.tuyos.join(), `no lee los baneos con la captura de la APK: ${leida.cuerpo.slice(0, 200)}`);
    // Y en PNG (las pantallas del final): comprimida aquí, se lee igual.
    const comprimida = await capturaDeLaApk(apk.base, SECRETO)();
    eq(JSON.stringify(leerPng(comprimida).ancho), '2400', 'la captura en PNG no sale de la crudo');
    eq(JSON.parse((await pedir(puerto, '/estado')).cuerpo).salida, 'Último cierre (hace 2 min): Android la cerró por falta de memoria', '/estado no dice por qué se cerró la app la última vez');
    eq((await pedir(puerto, '/estado', { codigo: null })).estado, 401, 'sin código contesta');
    eq((await pedir(puerto, '/estado', { codigo: 'OTRO12345' })).estado, 401, 'con otro código contesta');
    eq((await pedir(puerto, '/estado', { host: 'atacante.example' })).estado, 403, 'contesta con un nombre como Host');
    eq((await pedir(puerto, '/estado', { origen: 'https://atacante.example' })).estado, 403, 'contesta a otra web');
    // La comprobación previa deja pasar la cabecera del código.
    const previa = await new Promise((r) => { const q = request({ host: '127.0.0.1', port: puerto, path: '/leer', method: 'OPTIONS', headers: { Host: `192.168.68.116:${puerto}`, Origin: 'https://srchipiron.github.io' } }, (res) => { res.resume(); r(res); }); q.end(); });
    ok(/X-Lector-Codigo/i.test(previa.headers['access-control-allow-headers'] ?? ''), 'la comprobación previa no deja pasar el código');
  } finally { servidor.close(); apk.cerrar(); }
});

test('la voz va a la APK, limpia y en es|en; sin voz en la APK dice «falta»', async () => {
  const apk = await apkDePega();
  try {
    const hablar = vozDeLaApk(apk.base, SECRETO);
    eq(await hablar('Hola\u0007 mundo', 'fr'), null);
    eq(JSON.stringify(apk.dichas), JSON.stringify([{ texto: 'Hola mundo', idioma: 'es' }]), 'la voz no llega limpia');
    const sinVoz = vozDeLaApk(apk.base, SECRETO, { pedir: async () => ({ ok: false, status: 404 }) });
    eq(await sinVoz('hola'), 'falta');
    const caida = vozDeLaApk(apk.base, SECRETO, { pedir: async () => { throw new Error('x'); } });
    eq(await caida('hola'), 'otro');
    const captura = capturaDeLaApk(apk.base, 'otro-secreto');
    let fallo = null;
    try { await captura(); } catch (e) { fallo = e; }
    eq(fallo?.tipo, 'captura', 'sin el secreto la APK da la captura');
  } finally { apk.cerrar(); }
});

test('el consejo y el resumen que manda la app (3.62.0): solo la app los escribe, la APK los lee, y llegan como texto plano', async () => {
  const apk = await apkDePega();
  const casa = mkdtempSync(join(tmpdir(), 'en-tablet-consejo-'));
  const servidor = await principal({ LECTOR_INTERNO: apk.base, LECTOR_SECRETO: SECRETO, LECTOR_CODIGO: CODIGO, LECTOR_CASA: casa, LECTOR_PUERTO: '0', LECTOR_ESCUCHA: '127.0.0.1' });
  const puerto = servidor.address().port;
  const mandar = (cuerpo, { origen = 'https://srchipiron.github.io' } = {}) => new Promise((r, x) => {
    const q = request({ host: '127.0.0.1', port: puerto, path: '/consejo', method: 'POST', headers: { Host: `192.168.68.116:${puerto}`, 'X-Lector-Codigo': CODIGO, 'Content-Type': 'application/json', ...(origen ? { Origin: origen } : {}) } }, (res) => { res.resume(); res.on('end', () => r(res.statusCode)); });
    q.on('error', x); q.end(JSON.stringify(cuerpo));
  });
  // Lo que lee la APK: desde 127.0.0.1, sin Origin y con el código.
  const leerApk = async () => JSON.parse((await pedir(puerto, '/consejo', { host: `127.0.0.1:${puerto}`, origen: null })).cuerpo);
  try {
    eq(JSON.stringify(await leerApk()), JSON.stringify({ consejo: null, resumen: null, enPartida: false }));
    eq(await mandar({ consejo: { titulo: 'Khufra 54%\u0007', detalle: 'nº2 Atlas · nº3 Franco' } }), 200);
    eq(JSON.stringify((await leerApk()).consejo), JSON.stringify({ titulo: 'Khufra 54%', detalle: 'nº2 Atlas · nº3 Franco' }), 'el consejo no llega limpio');
    eq(await mandar({ consejo: { titulo: 'x' } }, { origen: null }), 403, 'sin la app se escribe el consejo');
    eq(await mandar({ resumen: { id: 'p-1', titulo: 'Ganada con Khufra', texto: 'Era tu nº1 (54%).' } }), 200);
    eq((await leerApk()).resumen?.id, 'p-1', 'el resumen no llega');
    await mandar({ resumen: { id: '../x', titulo: 'a', texto: 'b' } });
    eq((await leerApk()).resumen?.id, 'p-1', 'un resumen con un id raro pisa al bueno');
    eq((await leerApk()).consejo?.titulo, 'Khufra 54%', 'mandar solo el resumen borra el consejo');
    await mandar({ consejo: null });
    eq((await leerApk()).consejo, null, 'el consejo no se borra');
    eq((await pedir(puerto, '/consejo', { host: `127.0.0.1:${puerto}`, origen: null, codigo: null })).estado, 401, 'el consejo se lee sin el código');
  } finally { servidor.close(); apk.cerrar(); }
});

test('la línea que manda la app vale para leer sola, también tras reiniciar sin el móvil; «Apagado» en la APK manda (3.69.3)', () => {
  const casa = mkdtempSync(join(tmpdir(), 'en-tablet-ajustes-'));
  let delMovil = null;
  const interno = { ajustesDelMovil: () => delMovil };
  eq(ajustesDeLaTablet(casa, interno)().origen, 'sinLinea');
  delMovil = { linea: 'jungle', rango: 'glory', idioma: 'es' };
  const a = ajustesDeLaTablet(casa, interno)();
  ok(a.activo && a.linea === 'jungle' && a.origen === 'movil', `no lee con la línea del móvil: ${JSON.stringify(a)}`);
  // Reiniciada, sin el móvil: la línea guardada.
  delMovil = null;
  const tras = ajustesDeLaTablet(casa, interno)();
  ok(tras.activo && tras.linea === 'jungle', `tras reiniciar se olvida de la línea: ${JSON.stringify(tras)}`);
  writeFileSync(join(casa, 'solo.json'), JSON.stringify({ activo: false }));
  eq(ajustesDeLaTablet(casa, interno)().activo, false, '«Apagado» en la APK no manda');
  writeFileSync(join(casa, 'solo.json'), JSON.stringify({ linea: 'mid' }));
  eq(ajustesDeLaTablet(casa, interno)().linea, 'mid', 'la línea del móvil pisa la de la APK');
  writeFileSync(join(casa, 'solo-movil.json'), '{"linea":"../x"}');
  writeFileSync(join(casa, 'solo.json'), '{}');
  eq(ajustesDeLaTablet(casa, interno)().activo, false, 'una línea guardada sin forma vale');
});

test('las partidas de la tablet (3.70.0): se guardan sin repetir y con tope, y se suben una vez con tu clave', async () => {
  const casa = mkdtempSync(join(tmpdir(), 'en-tablet-partidas-'));
  const partidas = partidasDeLaTablet(casa);
  const p = (t, extra = {}) => ({ t, pick: 'Rafaela', gane: true, recomendados: ['Rafaela'], origen: 'lector', fuente: 'tablet', ...extra });
  ok(partidas.apuntar(p(1788000000000)) && !partidas.apuntar(p(1788000000000)), 'apunta dos veces la misma partida');
  partidas.apuntar(p(1788000060000, { gane: false }));
  eq(partidasDeLaTablet(casa).todas().length, 2, 'las partidas no sobreviven a un reinicio');
  const s = supabaseFalso();
  const config = { url: 'https://abcdefghijklmnopqrst.supabase.co', clave: s.clavePublica };
  const clave = 'J'.repeat(43);
  eq((await subirLoDeLaTablet({ partidas, clave: null, config, fetch: s.fetch })).subidas, 0, 'sube sin tu clave');
  eq((await subirLoDeLaTablet({ partidas, clave, config: { url: 'https://otra.com', clave: s.clavePublica }, fetch: s.fetch })).subidas, 0, 'sube a una dirección que no es la base de datos');
  eq(s.llamadas.length, 0);
  const r = await subirLoDeLaTablet({ partidas, clave, config, fetch: s.fetch });
  eq(r.subidas, 2, JSON.stringify(r));
  eq(s.jugadores.get(clave).partidas.size, 2);
  eq((await subirLoDeLaTablet({ partidas, clave, config, fetch: s.fetch })).subidas, 0, 'sube otra vez lo ya subido');
  partidas.apuntar(p(1788000120000));
  eq((await subirLoDeLaTablet({ partidas, clave, config, fetch: s.fetch })).subidas, 1, 'no sube la nueva');
  eq(partidasDeLaTablet(casa).pendientes().length, 0, 'lo subido no se recuerda tras un reinicio');
  // Sin red, nada se marca: se reintenta.
  partidas.apuntar(p(1788000180000));
  const sinRed = await subirLoDeLaTablet({ partidas, clave, config, fetch: async () => { throw new TypeError('sin red'); } });
  eq(sinRed.error, 'red'); eq(partidas.pendientes().length, 1, 'un fallo marca la partida como subida');
  // El tope.
  for (let i = 0; i < TOPE_PARTIDAS_TABLET + 5; i += 1) partidas.apuntar(p(1789000000000 + i));
  eq(partidas.todas().length, TOPE_PARTIDAS_TABLET, 'sin tope');
  // La configuración que bajó la tablet, con forma o nada.
  writeFileSync(join(casa, 'comunidad.json'), JSON.stringify({ url: 'https://abcdefghijklmnopqrst.supabase.co', clave: 'sb_secret_aaaaaaaaaaaaaa' }));
  eq(leerComunidad([casa]), null, 'acepta una configuración con la clave secreta');
});

test('el reto de la búsqueda (3.70.0): la tablet demuestra que conoce el código sin que viaje, con la misma cuenta que la app, y con tope', async () => {
  const servidor = crearServidor({ capturar: async () => { throw new Error('no'); }, codigo: CODIGO, enHilos: false });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const puerto = servidor.address().port;
  try {
    const n = '0123456789abcdef0123456789abcdef';
    const r = await pedir(puerto, `/reto?n=${n}`, { codigo: null, origen: null });
    eq(r.estado, 200, r.cuerpo);
    const { prueba } = JSON.parse(r.cuerpo);
    eq(prueba, await pruebaDelReto(CODIGO, n), 'la prueba del lector no es la que calcula la app');
    ok(prueba !== await pruebaDelReto('OTROCODIGO9', n) && !r.cuerpo.includes(CODIGO), 'la prueba no depende del código, o lo lleva dentro');
    eq((await pedir(puerto, '/reto?n=xyz', { codigo: null, origen: null })).estado, 400, 'acepta un reto sin forma');
    let ultimo;
    for (let i = 0; i < 6; i += 1) ultimo = await pedir(puerto, `/reto?n=${n}`, { codigo: null, origen: null });
    eq(ultimo.estado, 429, 'sin tope de retos por aparato (se podría ahogar a la tablet)');
    eq((await pedir(puerto, '/estado', { codigo: null, origen: null })).estado, 401, 'el reto abre la puerta sin código');
  } finally { servidor.close(); }
});

test('la salud de la tablet (3.63.0): /estado cuenta lecturas y fallos, y lo que la APK escribe, solo con campos conocidos', async () => {
  const casa = mkdtempSync(join(tmpdir(), 'en-tablet-salud-'));
  writeFileSync(join(casa, 'salud.json'), JSON.stringify({ apk: '3.63.0', grabando: true, memoriaLibreMB: 1500.7, memoriaBaja: false, raro: '<script>', burbuja: 'sí' }));
  eq(JSON.stringify(leerSaludDeLaApk(join(casa, 'salud.json'))), JSON.stringify({ apk: '3.63.0', memoriaLibreMB: 1501, grabando: true, memoriaBaja: false }), 'la salud de la APK pasa campos que no conoce o con otro tipo');
  eq(leerSaludDeLaApk(join(casa, 'no-existe.json')), null);
  writeFileSync(join(casa, 'burbuja.json'), JSON.stringify({ burbujaEstado: 'no llega al lector: IOException' }));
  eq(leerSaludDeLaApk(join(casa, 'burbuja.json'))?.burbujaEstado, 'no llega al lector: IOException', 'el estado de la burbuja (3.68.1) no llega al parte');
  const apk = await apkDePega();
  const servidor = await principal({ LECTOR_INTERNO: apk.base, LECTOR_SECRETO: SECRETO, LECTOR_CODIGO: CODIGO, LECTOR_CASA: casa, LECTOR_PUERTO: '0', LECTOR_ESCUCHA: '127.0.0.1' });
  const puerto = servidor.address().port;
  try {
    await pedir(puerto, '/leer');
    const e = JSON.parse((await pedir(puerto, '/estado')).cuerpo);
    eq(e.lector?.lecturas, 1, `/estado no cuenta las lecturas: ${JSON.stringify(e.lector)}`);
    ok(Number.isFinite(e.lector?.memoriaMB) && e.lector.memoriaMB > 0, 'no dice la memoria del lector');
    eq(e.tablet?.apk, '3.63.0', 'no lleva lo que escribió la APK');
  } finally { servidor.close(); apk.cerrar(); }
});

test('lo aprendido en Termux pasa a la tablet (3.64.1): con sus plantillas, la tablet reconoce el final que antes no', async () => {
  // La tabla de serie es una derrota; una «victoria» de pega: la misma tabla con la palabra cambiada.
  const derrota = leerPng(leerFichero(new URL('../../scripts/lector/tabla-derrota.png', import.meta.url)));
  const victoria = { ...derrota, rgba: Uint8Array.from(derrota.rgba) };
  // ZONA_PALABRA es [x0, x1, y0, y1] en fracciones de la franja.
  const [x0, x1] = ZONA_PALABRA.slice(0, 2).map((f) => Math.round(f * victoria.ancho));
  const [y0, y1] = ZONA_PALABRA.slice(2).map((f) => Math.round(f * victoria.alto));
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) { const k = (y * victoria.ancho + x) * 4; const v = ((x >> 2) + (y >> 1)) % 2 ? 230 : 20; victoria.rgba[k] = v; victoria.rgba[k + 1] = 255 - v; victoria.rgba[k + 2] = v; }
  const deSerie = plantillasIniciales(derrota);
  eq(reconocerResultado(victoria, deSerie).resultado, null, `la prueba no prueba nada: la tablet de serie ya reconoce la victoria (${JSON.stringify(reconocerResultado(victoria, deSerie))})`);
  const enTermux = aprenderResultado(victoria, true, deSerie, { id: 'v1' }).resultados;
  eq(reconocerResultado(victoria, enTermux).resultado, 'gane', 'Termux no aprendió la victoria (la prueba no prueba nada)');
  const termux = crearServidor({ capturar: () => { throw new Error('no'); }, enHilos: false, aprendido: { version: VERSION_APRENDIDO, capturas: 648, caras: {}, picks: null }, resultados: enTermux, guardar: () => {}, guardarResultadosDe: () => {} });
  let guardados = null;
  const tablet = crearServidor({ capturar: () => { throw new Error('no'); }, enHilos: false, codigo: CODIGO, guardar: () => {}, guardarResultadosDe: (r) => { guardados = r; } });
  await Promise.all([termux, tablet].map((s) => new Promise((r) => s.listen(0, '127.0.0.1', r))));
  try {
    const app = { Origin: 'https://srchipiron.github.io' };
    const datos = await (await fetch(`http://127.0.0.1:${termux.address().port}/aprendido`, { headers: app })).json();
    eq(datos.aprendido?.capturas, 648, 'Termux no da lo aprendido');
    eq((await fetch(`http://127.0.0.1:${termux.address().port}/aprendido`)).status, 403, 'lo aprendido sale sin la app');
    const r = await fetch(`http://127.0.0.1:${tablet.address().port}/aprendido`, { method: 'POST', headers: { ...app, 'X-Lector-Codigo': CODIGO, 'Content-Type': 'application/json' }, body: JSON.stringify(datos) });
    const dicho = await r.json();
    eq(`${r.status} ${dicho.capturas} ${dicho.gane}`, '200 648 1', `la tablet no recibe lo aprendido: ${JSON.stringify(dicho)}`);
    eq(reconocerResultado(victoria, guardados).resultado, 'gane', 'con lo de Termux la tablet sigue sin reconocer la victoria');
    eq(reconocerResultado(derrota, guardados).resultado, 'perdi', 'al fundir se pierde la derrota');
  } finally { termux.close(); tablet.close(); }
  // Y quien haya visto más capturas manda en las caras: la tablet no pierde lo suyo por uno con menos.
  const conMas = fundirAprendido({ aprendido: { version: VERSION_APRENDIDO, capturas: 900 }, resultados: deSerie }, { aprendido: { version: VERSION_APRENDIDO, capturas: 10 } });
  eq(conMas.aprendido.capturas, 900, 'lo aprendido con menos capturas pisa a lo de la tablet');
  eq(fundirAprendido({ aprendido: null, resultados: deSerie }, { aprendido: { version: 1, capturas: 5 } }), null, 'acepta lo aprendido de otra versión');
});

test('un solo aparato (3.66.0): con la línea elegida en la APK, la tablet lee, decide y pone ella sola el consejo de la burbuja', async () => {
  const casa = mkdtempSync(join(tmpdir(), 'en-tablet-solo-'));
  writeFileSync(join(casa, 'solo.json'), JSON.stringify({ linea: 'roam' }));
  const apk = await apkDePega();
  const servidor = await principal({ LECTOR_INTERNO: apk.base, LECTOR_SECRETO: SECRETO, LECTOR_CODIGO: CODIGO, LECTOR_CASA: casa, LECTOR_PUERTO: '0', LECTOR_ESCUCHA: '127.0.0.1' });
  const puerto = servidor.address().port;
  try {
    await servidor.solo.tic();
    const { consejo } = JSON.parse((await pedir(puerto, '/consejo', { origen: null })).cuerpo);
    // La captura de la prueba es la fase de picks con Clint y Khufra de enemigos: el consejo es un pick de roam con porcentaje.
    ok(/^[A-Z][\w .'-]+ \d+%$/.test(consejo?.titulo ?? ''), `la tablet no pone su consejo: ${JSON.stringify(consejo)}`);
    ok(/^Fase de picks · Luego: /.test(consejo?.detalle ?? ''), `sin la fase o sin los dos siguientes: ${JSON.stringify(consejo)}`);
    const d = servidor.solo.estado();
    ok(d.enemigos.includes('Clint') && d.enemigos.includes('Khufra') && d.baneos.length >= 8, `el draft acumulado no es el de la captura: ${JSON.stringify(d)}`);
    // El móvil lee: la tablet se aparta.
    await pedir(puerto, '/leer');
    const lecturasAntes = JSON.parse((await pedir(puerto, '/estado')).cuerpo).lector.lecturas;
    await servidor.solo.tic();
    eq(JSON.parse((await pedir(puerto, '/estado')).cuerpo).lector.lecturas, lecturasAntes, 'con el móvil leyendo, la tablet lee también');
  } finally { servidor.close(); apk.cerrar(); }
});

/** Un POST como lo hace la APK (o, con `origen`, un navegador). */
const mandarA = (puerto, camino, cuerpo, { origen = null, codigo = CODIGO } = {}) => new Promise((r, x) => {
  const q = request({ host: '127.0.0.1', port: puerto, path: camino, method: 'POST', headers: { Host: `127.0.0.1:${puerto}`, 'Content-Type': 'application/json', ...(codigo ? { 'X-Lector-Codigo': codigo } : {}), ...(origen ? { Origin: origen } : {}) } }, (res) => {
    let b = ''; res.on('data', (t) => { b += t; }); res.on('end', () => r({ estado: res.statusCode, cuerpo: b }));
  });
  q.on('error', x); q.end(JSON.stringify(cuerpo));
});

test('enseñar al lector desde la tablet (3.71.0): solo la APK lo lee y lo contesta, con héroes del catálogo, y el lector aprende de las capturas de ese draft', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'en-tablet-correccion-'));
  for (const id of ['lectura-a', 'lectura-b']) writeFileSync(join(carpeta, `${id}.png`), 'x');
  let t = 1_790_000_000_000;
  const aprendidas = [], corregidas = [];
  const servidor = crearServidor({
    capturar: async () => { throw new Error('no'); }, codigo: CODIGO, enHilos: false, carpeta, ahora: () => t, guardar: () => {},
    aprender: async ({ pares }) => { aprendidas.push(pares); return { aprendido: { version: VERSION_APRENDIDO, picks: null, caras: {}, capturas: pares.length }, informe: [] }; },
    alCorregir: (c) => corregidas.push(c),
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const puerto = servidor.address().port;
  const leerApk = async (op = {}) => pedir(puerto, '/correccion', { host: `127.0.0.1:${puerto}`, origen: null, ...op });
  const heroes = ['Atlas', 'Clint', 'Franco', 'Gord', 'Khufra', 'Rafaela', 'Selena', 'Tigreal'];
  const pendiente = { id: `correccion-${t}`, cuando: t, ids: ['lectura-a', 'lectura-b', '../../etc'], heroes, partida: t + 60000, leidos: { enemigos: ['Clint', 'Khufra', null, null, null], aliados: ['Gord', null, null, null, 'Rafaela'], tuyoFila: 4, baneos: ['Hirara', 'Eudora'] } };
  try {
    eq(JSON.parse((await leerApk()).cuerpo).correccion, null);
    servidor.interno.ponerCorreccion(pendiente);
    const c = JSON.parse((await leerApk()).cuerpo).correccion;
    ok(c?.id === pendiente.id && c.heroes.length === heroes.length && c.leidos.enemigos[1] === 'Khufra' && !('ids' in c), `la APK no la ve, o ve las rutas de las capturas: ${JSON.stringify(c)}`);
    eq((await leerApk({ origen: 'https://srchipiron.github.io' })).estado, 403, 'un navegador (con Origin) lee la corrección');
    eq((await leerApk({ codigo: null })).estado, 401, 'se lee sin el código');
    const bueno = { id: pendiente.id, enemigos: ['Clint', 'Khufra', 'atlas', 'Franco', 'Tigreal'], aliados: ['Gord', 'Selena'], tuyo: 'Rafaela' };
    eq((await mandarA(puerto, '/correccion', bueno, { origen: 'https://srchipiron.github.io' })).estado, 403, 'un navegador contesta la corrección');
    eq((await mandarA(puerto, '/correccion', { ...bueno, enemigos: ['Clint', 'Nadie'] })).estado, 400, 'acepta un héroe que no existe');
    eq((await mandarA(puerto, '/correccion', { ...bueno, aliados: ['Clint'] })).estado, 400, 'acepta el mismo héroe en los dos equipos');
    eq((await mandarA(puerto, '/correccion', { ...bueno, enemigos: [] })).estado, 400, 'acepta una corrección sin enemigos');
    eq((await mandarA(puerto, '/correccion', { ...bueno, id: 'correccion-1' })).estado, 409, 'contesta otra corrección');
    eq(aprendidas.length, 0, 'aprende de una respuesta rechazada');
    const r = await mandarA(puerto, '/correccion', bueno);
    eq(r.estado, 200, r.cuerpo);
    ok(JSON.parse(r.cuerpo).aprendido === true, 'no dice qué aprendió');
    eq(aprendidas.length, 1);
    const pares = aprendidas[0];
    eq(JSON.stringify(pares.map((p) => p.id)), JSON.stringify(['lectura-a', 'lectura-b']), 'no aprende de las capturas del draft, o de una ruta fuera');
    const v = pares[0].verdad;
    ok(v.enemigos.includes('Atlas') && v.enemigos.length === 5 && v.tuyo === 'Rafaela' && v.aliados.length === 2 && v.baneos.includes('Eudora'), `la verdad no es la respuesta: ${JSON.stringify(v)}`);
    ok(existsSync(join(carpeta, 'lectura-a.verdad.json')), 'la verdad no se guarda junto a la captura');
    eq(JSON.stringify(corregidas), JSON.stringify([{ partida: t + 60000, enemigos: ['Clint', 'Khufra', 'Atlas', 'Franco', 'Tigreal'], aliados: ['Gord', 'Selena'], tuyo: 'Rafaela' }]), 'la partida apuntada no se arregla');
    eq(JSON.parse((await leerApk()).cuerpo).correccion, null, 'la corrección contestada se pregunta otra vez');
    // «Ahora no» la quita; y pasadas las horas de las capturas, ya no se pregunta.
    servidor.interno.ponerCorreccion(pendiente);
    eq((await mandarA(puerto, '/correccion', { id: pendiente.id, descartar: true })).estado, 200);
    eq(JSON.parse((await leerApk()).cuerpo).correccion, null, '«Ahora no» no la quita');
    eq(aprendidas.length, 1, '«Ahora no» aprende');
    // Llega otra corrección mientras se lee la respuesta a la vieja: la nueva no se pierde.
    servidor.interno.ponerCorreccion(pendiente);
    const lenta = new Promise((r, x) => {
      const q = request({ host: '127.0.0.1', port: puerto, path: '/correccion', method: 'POST', headers: { Host: `127.0.0.1:${puerto}`, 'Content-Type': 'application/json', 'X-Lector-Codigo': CODIGO } }, (res) => { res.resume(); res.on('end', () => r(res.statusCode)); });
      q.on('error', x);
      q.write(JSON.stringify(bueno).slice(0, 10));
      setTimeout(() => { servidor.interno.ponerCorreccion({ ...pendiente, id: `correccion-${t + 1}`, cuando: t + 1 }); q.end(JSON.stringify(bueno).slice(10)); }, 200);
    });
    eq(await lenta, 409, 'contesta la vieja aunque ya hay otra');
    eq(JSON.parse((await leerApk()).cuerpo).correccion?.id, `correccion-${t + 1}`, 'la corrección nueva se pierde');
    eq(aprendidas.length, 1, 'aprende con la respuesta a la vieja');
    servidor.interno.ponerCorreccion(pendiente);
    t += RETENCION_CAPTURAS_MS + 1;
    eq(JSON.parse((await leerApk()).cuerpo).correccion, null, 'pregunta por capturas que ya se borraron');
  } finally { servidor.close(); }
  // Solo la tablet: 127.0.0.1 y sin Origin.
  const req = (dir, origin) => ({ headers: origin ? { origin } : {}, socket: { remoteAddress: dir } });
  ok(deLaApk(req('127.0.0.1')) && deLaApk(req('::ffff:127.0.0.1')), 'la APK no entra');
  ok(!deLaApk(req('192.168.68.110')), 'entra un aparato de la wifi');
  ok(!deLaApk(req('127.0.0.1', 'http://127.0.0.1:8080')), 'entra una página del navegador de la tablet');
  // Con forma o nada.
  eq(sanearCorreccion({ ...pendiente, id: '../x' }), null);
  eq(sanearCorreccion({ ...pendiente, ids: ['../../etc'] }), null, 'sin capturas válidas, se pregunta igual');
  ok(sanearCorreccion({ ...pendiente, ids: Array.from({ length: 30 }, (_, i) => `lectura-${i}`) }).ids.length === CAPTURAS_A_MIRAR, 'sin tope de capturas');
  eq(sanearCorreccion({ ...pendiente, heroes: ['<script>'] }), null, 'entra un nombre de héroe con cualquier cosa');
});

test('la corrección protege sus capturas de la limpieza mientras se puede contestar (3.71.0)', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'en-tablet-poda-'));
  for (const id of ['lectura-2026-10-24T20-00-00-000Z-1', 'lectura-2026-10-24T20-00-05-000Z-2', 'lectura-2026-10-24T20-00-10-000Z-3']) writeFileSync(join(carpeta, `${id}.png`), 'x');
  const servidor = crearServidor({ capturar: async () => png, enHilos: false, carpeta, maximos: { lectura: 1, fotograma: 1, resultado: 1 }, guardar: () => {}, guardarResultadosDe: () => {} });
  try {
    servidor.interno.ponerCorreccion({ id: `correccion-${Date.now()}`, cuando: Date.now(), ids: ['lectura-2026-10-24T20-00-00-000Z-1', 'lectura-2026-10-24T20-00-05-000Z-2'], heroes: ['Atlas'], leidos: {} });
    const r = await servidor.interno.leer({});
    ok(r.ok, JSON.stringify(r).slice(0, 200));
    // La captura nueva se escribe aparte (y entonces se limpia): se espera a que esté.
    for (let i = 0; i < 100 && !existsSync(join(carpeta, `${r.lectura.id}.png`)); i += 1) await new Promise((x) => setTimeout(x, 50));
    ok(existsSync(join(carpeta, 'lectura-2026-10-24T20-00-00-000Z-1.png')) && existsSync(join(carpeta, 'lectura-2026-10-24T20-00-05-000Z-2.png')), 'se borran las capturas de las que iba a aprender');
    ok(!existsSync(join(carpeta, 'lectura-2026-10-24T20-00-10-000Z-3.png')), 'la limpieza no borra lo que sobra');
  } finally { servidor.close(); }
});

test('las partidas de la tablet se arreglan con tu corrección y se vuelven a subir (3.71.0)', () => {
  const casa = mkdtempSync(join(tmpdir(), 'en-tablet-arreglar-'));
  const partidas = partidasDeLaTablet(casa);
  partidas.apuntar({ t: 1, pick: 'Rafaela', gane: true, supuesto: true, estimacion: 0.55, modelo: 3, draft: { linea: 'roam', enemigos: ['Clint'], aliados: [] } });
  partidas.apuntar({ t: 2, pick: 'Atlas', gane: false, estimacion: 0.5, modelo: 3, draft: { linea: 'roam', enemigos: [], aliados: [] } });
  partidas.marcarSubidas([1, 2]);
  ok(partidas.corregir(1, { enemigos: ['Clint', 'Khufra'], aliados: ['Gord'], tuyo: 'Rafaela' }), 'no arregla');
  const p1 = partidasDeLaTablet(casa).todas().find((p) => p.t === 1);
  ok(!p1.supuesto && p1.estimacion === 0.55 && p1.draft.enemigos.length === 2 && p1.draft.aliados[0] === 'Gord' && p1.draft.linea === 'roam', `con tu pick confirmado: ${JSON.stringify(p1)}`);
  partidas.corregir(2, { enemigos: ['Clint'], aliados: [], tuyo: 'Franco' });
  const p2 = partidas.todas().find((p) => p.t === 2);
  ok(p2.pick === 'Franco' && p2.estimacion === undefined && p2.modelo === undefined, `con otro pick se queda la estimación de otro héroe: ${JSON.stringify(p2)}`);
  eq(JSON.stringify(partidas.pendientes().map((p) => p.t).sort()), '[1,2]', 'lo arreglado no se vuelve a subir');
  eq(partidas.corregir(99, { enemigos: ['Clint'] }), false);
});

test('un error que nadie recoge no tira el lector (3.72.2): se apunta en fallo-nodo.txt con su detalle y el proceso sigue', () => {
  const casa = mkdtempSync(join(tmpdir(), 'en-tablet-errores-'));
  const oyentes = {}; const dichas = [];
  const proceso = { on: (ev, f) => { oyentes[ev] = f; } };
  vigilarErrores({ casa, registrar: (m) => dichas.push(m), proceso });
  ok(oyentes.uncaughtException && oyentes.unhandledRejection, 'no escucha las excepciones o las promesas sin recoger');
  oyentes.unhandledRejection(new TypeError('Cannot read properties of null (reading \'picks\')'));
  const f = leerFichero(join(casa, 'fallo-nodo.txt'), 'utf8');
  ok(/promesa: TypeError: Cannot read properties of null/.test(f) && /at /.test(f), `no apunta el error con su pila: ${f.slice(0, 200)}`);
  ok(dichas.some((m) => /ERROR sin recoger/.test(m)), 'no lo dice en el registro');
  oyentes.uncaughtException(new Error('otra'));
  ok(/excepción: Error: otra/.test(leerFichero(join(casa, 'fallo-nodo.txt'), 'utf8')), 'no apunta la excepción');
});

test('el lector de la APK arranca con Node 18 vigilando sus errores, y un fallo al arrancar no lo cierra (3.72.2)', () => {
  const fuente = leerFichero(join(dirname(fileURLToPath(import.meta.url)), '../../scripts/lector/en-tablet.mjs'), 'utf8');
  const arranque = fuente.slice(fuente.lastIndexOf("if (process.env.LECTOR_INTERNO"));
  ok(/vigilarErrores\(/.test(arranque) && /try \{ await principal\(\); \} catch/.test(arranque) && /setInterval\(/.test(arranque), 'el arranque de la APK no vigila sus errores, o un fallo al arrancar deja salir a Node (y cierra la app)');
});

test('el modo solo de la tablet lleva cómo arreglar la partida con tu corrección (3.74.3): sin eso, la contestada antes de apuntar se perdía', () => {
  const fuente = leerFichero(join(dirname(fileURLToPath(import.meta.url)), '../../scripts/lector/en-tablet.mjs'), 'utf8');
  const llamada = fuente.slice(fuente.indexOf('const solo = crearSolo({'), fuente.indexOf('});', fuente.indexOf('const solo = crearSolo({')));
  ok(/alCorregir: \(c\) => alCorregirRef\?\.\(c\)/.test(llamada), 'crearSolo no recibe alCorregir en en-tablet.mjs');
});

test('los datos con los que decide la tablet: los MÁS NUEVOS que tenga, no los primeros que encuentre (3.73.1)', () => {
  const real = JSON.parse(leerFichero(join(RAIZ, 'public/data/roam-meta.json'), 'utf8'));
  const cat = leerFichero(join(RAIZ, 'public/data/heroes.json'), 'utf8');
  const carpeta = (fecha) => {
    const c = mkdtempSync(join(tmpdir(), 'en-tablet-datos-'));
    writeFileSync(join(c, 'roam-meta.json'), JSON.stringify({ ...real, generatedAt: fecha }));
    writeFileSync(join(c, 'heroes.json'), cat);
    return c;
  };
  const bajados = carpeta('2026-10-01T00:00:00Z'), deLaApk = carpeta('2026-10-20T00:00:00Z');
  const leer = lectorDeDatos([bajados, deLaApk]);
  const d = leer();
  ok(d.meta.generatedAt === '2026-10-20T00:00:00Z' && d.de === 1, `decide con los bajados aunque los de la APK sean más nuevos: ${d.meta.generatedAt}`);
  ok(d.catalogo?.heroes?.length > 100, 'sin catálogo');
  writeFileSync(join(bajados, 'roam-meta.json'), JSON.stringify({ ...real, generatedAt: '2026-10-25T00:00:00Z' }));
  const e = leer();
  ok(e.meta.generatedAt === '2026-10-25T00:00:00Z' && e.de === 0, 'con los bajados más nuevos no los usa');
  writeFileSync(join(bajados, 'roam-meta.json'), '{"roto":');
  eq(leer().meta.generatedAt, '2026-10-20T00:00:00Z', 'un fichero roto deja sin datos');
});

test('/estado dice de cuándo son los datos y si tus partidas suben (3.73.1): sin tu clave, cuántas se quedan en la tablet', async () => {
  const casa = mkdtempSync(join(tmpdir(), 'en-tablet-cuenta-'));
  const apk = await apkDePega();
  const servidor = await principal({ LECTOR_INTERNO: apk.base, LECTOR_SECRETO: SECRETO, LECTOR_CODIGO: CODIGO, LECTOR_CASA: casa, LECTOR_PUERTO: '0', LECTOR_ESCUCHA: '127.0.0.1', LECTOR_SIN_SOLO: '1' });
  const puerto = servidor.address().port;
  try {
    servidor.partidas.apuntar({ t: 1788000000000, pick: 'Rafaela', gane: true });
    const e = JSON.parse((await pedir(puerto, '/estado', { host: `127.0.0.1:${puerto}`, origen: null })).cuerpo);
    // Sin nada bajado (LECTOR_SIN_SOLO no baja), decide con los que trae la APK, y lo dice.
    ok(typeof e.datos?.fecha === 'string' && e.datos.de === 'apk', `/estado no dice de cuándo son los datos ni de dónde: ${JSON.stringify(e.datos)}`);
    eq(JSON.stringify(e.partidas), JSON.stringify({ apuntadas: 1, sinSubir: 1, clave: false, error: null }), 'no dice que la partida se queda sin subir por falta de clave');
  } finally { servidor.close(); apk.cerrar(); }
});

test('el parte de salud (3.74.0): sin IPs, sin el código ni tu clave, sin caracteres de control y con tope', () => {
  const clave = 'K'.repeat(43);
  const log = [...Array.from({ length: LINEAS_DEL_PARTE + 20 }, (_, i) => `línea ${i}`), `Móvil 192.168.1.37 con código ${CODIGO} y clave ${clave}\u0007`, 'x'.repeat(900)].join('\n');
  const l = lineasLimpias(log, { secretos: [CODIGO, clave] });
  eq(l.length, LINEAS_DEL_PARTE, 'no corta el registro');
  ok(l[0] === 'línea 22', `no se queda con las ÚLTIMAS líneas: ${l[0]}`);
  const junto = l.join('\n');
  ok(!junto.includes('192.168') && junto.includes('[ip]'), `sale la IP: ${junto.slice(-400)}`);
  ok(!junto.includes(CODIGO) && !junto.includes(clave) && junto.includes('[oculto]'), 'sale el código o la clave');
  ok(![...junto.replace(/\n/g, '')].some((c) => c.charCodeAt(0) < 32), 'sale un carácter de control');
  ok(l.every((x) => x.length <= 300), 'una línea sin cortar');
  const p = parteDeSalud({ estado: { tablet: { apk: '3.74.0' } }, log, falloNodo: `Error en ${CODIGO}\n10.0.0.5`, secretos: [CODIGO, clave], ahora: 5 });
  eq(p.v, 1); eq(p.cuando, 5); eq(p.estado.tablet.apk, '3.74.0');
  ok(!p.falloNodo.includes(CODIGO) && !p.falloNodo.includes('10.0.0.5'), `el fallo de Node sale sin limpiar: ${p.falloNodo}`);
  ok(!('falloNodo' in parteDeSalud({ estado: {}, log: '' })), 'sin fallo, falloNodo viaja igual');
  ok(JSON.stringify(p).length < 16000, 'el parte no cabe en lo que acepta el servidor');
});

test('el parte cabe siempre en lo que acepta el servidor, también con un fallo de Node largo, y los errores no se pierden (3.74.2)', async () => {
  const s = supabaseFalso();
  const config = { url: 'https://abcdefghijklmnopqrst.supabase.co', clave: s.clavePublica };
  const { subirParte } = await import('../../src/app/basedatos.js');
  const largo = (i) => `Lectura ${i} (1300 ms, captura sin comprimir 283): ${'baneos Hirara, Marcel, Masha, Belerick, Eudora · '.repeat(8)}`;
  const log = Array.from({ length: 200 }, (_, i) => (i === 50 ? 'ERROR sin recoger: TypeError: x' : largo(i))).join('\n');
  const falloNodo = Array.from({ length: 40 }, (_, i) => `    at algo${i} (${'x'.repeat(280)})`).join('\n');
  const p = parteDeSalud({ estado: { tablet: { apk: '3.74.2' }, lector: { lecturas: 1 } }, log, falloNodo, ahora: 1 });
  ok(Buffer.byteLength(JSON.stringify(p)) <= TOPE_PARTE_BYTES, `el parte mide ${Buffer.byteLength(JSON.stringify(p))}`);
  ok(p.falloNodo && p.log.length > 0, 'se queda sin fallo o sin registro');
  const soloLog = parteDeSalud({ estado: {}, log, ahora: 1 });
  ok(Buffer.byteLength(JSON.stringify(soloLog)) <= TOPE_PARTE_BYTES && !soloLog.recortado, 'dice recortado por quitar líneas viejas del registro (lo normal)');
  ok(p.errores.some((l) => /TypeError/.test(l)), 'el error de la línea 50 de 200 no va en el parte');
  eq((await subirParte({ config, clave: 'Q'.repeat(43), parte: p }, { fetch: s.fetch })).error, undefined, 'el servidor lo rechaza');
  ok(!parteDeSalud({ estado: {}, log: 'hola' }).recortado, 'dice recortado sin recortar');
  // Diez errores largos y el fallo entero no caben juntos: se acorta el fallo, no se pierden los errores.
  const errores = Array.from({ length: 12 }, (_, i) => `No se pudo leer ${i}: ${'y'.repeat(290)}`).join('\n');
  const q = parteDeSalud({ estado: { tablet: { burbujaEstado: 'z'.repeat(1500) } }, log: errores, falloNodo, ahora: 1 });
  ok(Buffer.byteLength(JSON.stringify(q)) <= TOPE_PARTE_BYTES && q.errores.length === 10 && q.falloNodo.length <= 2000 && q.recortado, `con errores largos: ${Buffer.byteLength(JSON.stringify(q))} bytes, ${q.errores.length} errores`);
});

test('la tablet sube su parte con SU clave, aunque el móvil no haya mandado la tuya, y sin secretos (3.74.1)', async () => {
  const casa = mkdtempSync(join(tmpdir(), 'en-tablet-parte-'));
  const tuya = 'P'.repeat(43);
  const s = supabaseFalso();
  const { mkdirSync } = await import('node:fs');
  mkdirSync(join(casa, 'datos'), { recursive: true });
  writeFileSync(join(casa, 'datos', 'comunidad.json'), JSON.stringify({ url: 'https://abcdefghijklmnopqrst.supabase.co', clave: s.clavePublica }));
  writeFileSync(join(casa, 'lector.log'), `Lector en 192.168.1.9 con ${CODIGO} y ${tuya}\nTodo bien\n`);
  const apk = await apkDePega();
  const original = globalThis.fetch;
  globalThis.fetch = (url, o) => (String(url).startsWith('https://abcdefghijklmnopqrst.supabase.co/') ? s.fetch(url, o) : original(url, o));
  const arrancar = () => principal({ LECTOR_INTERNO: apk.base, LECTOR_SECRETO: SECRETO, LECTOR_CODIGO: CODIGO, LECTOR_CASA: casa, LECTOR_PUERTO: '0', LECTOR_ESCUCHA: '127.0.0.1', LECTOR_SIN_SOLO: '1' });
  const servidor = await arrancar();
  try {
    await servidor.subirParte();
    eq(s.partes.length, 1, 'sin tu clave de jugador no sube el parte');
    const delLector = s.partes[0].clave;
    ok(claveDeJugadorValida(delLector) && delLector !== tuya, 'el parte no va con una clave propia del lector');
    eq(claveDelLector(casa), delLector, 'la clave del lector no se guarda');
    const parte = s.partes[0];
    ok(parte.d.log.some((l) => l === 'Todo bien'), 'el parte no lleva el registro');
    ok(parte.d.estado && 'pendiente' in parte.d.estado && 'partidas' in parte.d.estado, `el parte no lleva el estado: ${Object.keys(parte.d.estado ?? {})}`);
    // Con tu clave puesta, el parte sigue con la del lector (el mismo lector en la revisión) y tu clave no sale.
    writeFileSync(join(casa, 'solo-movil.json'), JSON.stringify({ linea: 'roam', clave: tuya }));
    const conClave = await arrancar();
    try {
      s.partes.length = 0;
      await conClave.subirParte();
      eq(s.partes.length, 1); eq(s.partes[0].clave, delLector, 'cambia de clave al tener la tuya: la revisión lo vería como otro lector');
      const texto = JSON.stringify(s.partes[0].d);
      for (const secreto of [CODIGO, SECRETO, tuya, delLector, '192.168.1.9']) ok(!texto.includes(secreto), `el parte lleva un secreto: ${secreto.slice(0, 6)}…`);
      eq(s.jugadores.size, 0, 'subir un parte toca tus partidas');
    } finally { conClave.close(); }
  } finally { globalThis.fetch = original; servidor.close(); apk.cerrar(); }
});

test('la clave del lector: al azar, con la forma del servidor, y la misma tras reiniciar', () => {
  const a = mkdtempSync(join(tmpdir(), 'clave-lector-')), b = mkdtempSync(join(tmpdir(), 'clave-lector-'));
  const ka = claveDelLector(a);
  ok(claveDeJugadorValida(ka), ka);
  eq(claveDelLector(a), ka, 'cambia tras reiniciar');
  ok(claveDelLector(b) !== ka, 'dos tablets con la misma clave');
  writeFileSync(join(a, 'clave-lector.txt'), 'rota');
  ok(claveDeJugadorValida(claveDelLector(a)), 'una clave rota en disco se usa');
});

await terminar('scripts/en-tablet');
