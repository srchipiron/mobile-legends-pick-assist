/**
 * El lector dentro de la tablet (3.61.0, scripts/lector/en-tablet.mjs): la
 * captura la da la APK por 127.0.0.1 con un secreto, y el lector escucha en
 * la wifi pero solo contesta con el código de vinculación, a la app, y con
 * una IP privada como `Host`.
 */
import { createServer, request } from 'node:http';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, ok, eq, terminar } from '../arnes.mjs';
import { principal, capturaDeLaApk, vozDeLaApk, esInterno, codigoValido, leerSaludDeLaApk } from '../../scripts/lector/en-tablet.mjs';
import { writeFileSync } from 'node:fs';
import { crearPortero, hostPermitido, FALLOS_CODIGO, VENTANA_CODIGO_MS } from '../../scripts/lector/servir.mjs';
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
    eq(JSON.stringify(await leerApk()), JSON.stringify({ consejo: null, resumen: null }));
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

test('la salud de la tablet (3.63.0): /estado cuenta lecturas y fallos, y lo que la APK escribe, solo con campos conocidos', async () => {
  const casa = mkdtempSync(join(tmpdir(), 'en-tablet-salud-'));
  writeFileSync(join(casa, 'salud.json'), JSON.stringify({ apk: '3.63.0', grabando: true, memoriaLibreMB: 1500.7, memoriaBaja: false, raro: '<script>', burbuja: 'sí' }));
  eq(JSON.stringify(leerSaludDeLaApk(join(casa, 'salud.json'))), JSON.stringify({ apk: '3.63.0', memoriaLibreMB: 1501, grabando: true, memoriaBaja: false }), 'la salud de la APK pasa campos que no conoce o con otro tipo');
  eq(leerSaludDeLaApk(join(casa, 'no-existe.json')), null);
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

await terminar('scripts/en-tablet');
