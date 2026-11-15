/**
 * La seguridad del lector de la tablet, por FORMA y por comportamiento: no
 * lanza programas, no carga código por otra vía, solo habla con quien debe, y
 * su servidor (que escucha en la wifi) solo contesta a la app vinculada o a
 * la propia APK, ruta a ruta según `RUTAS` de contrato.js.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';
import { request } from 'node:http';
import { transformSync } from 'esbuild';
import { after } from 'node:test';
import { test, ok, eq, RAIZ } from '../ayuda.mjs';
import { RUTAS, PROTOCOLO } from '../../src/comun/contrato.js';
import { hostPermitido, origenPermitido, deLaApk, crearPortero, permitirReto, VARIABLE_ORIGEN_LOCAL, FALLOS_CODIGO, VENTANA_CODIGO_MS, RETOS_EN_TOTAL, RETOS_POR_MINUTO, CUERPO_MAXIMO } from '../../scripts/lector/acceso.mjs';
import { esInterno, codigoValido, capturaDeLaApk } from '../../scripts/lector/en-tablet.mjs';
import { DATOS_DE_LA_WEB } from '../../scripts/lector/datos.mjs';
import { pruebaDelReto } from '../../src/app/lector.js';
import { arrancar, pedir, pedirApk, CODIGO, APP } from '../fixtures/juego/lector.mjs';

const LECTOR = join(RAIZ, 'scripts/lector');
const ficherosDelLector = () => readdirSync(LECTOR, { recursive: true }).map(String);
/** Sin comentarios con un ANALIZADOR: un «//» dentro de una cadena escondía un import tras una expresión. */
const sinComentarios = (t) => transformSync(t, { loader: 'js', format: 'esm' }).code;
const IMPORTS = /(?:^|\n)\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g;

/** Todo lo que el lector ejecuta: su carpeta y lo que importa de fuera (motor, comun), sin comentarios. */
function grafoDelLector() {
  const cola = ficherosDelLector().filter((f) => /\.(c|m)?js$/.test(f)).map((f) => join(LECTOR, f));
  const vistos = new Map();
  while (cola.length) {
    const f = cola.pop();
    if (vistos.has(f)) continue;
    const texto = sinComentarios(readFileSync(f, 'utf8'));
    vistos.set(f, texto);
    for (const m of texto.matchAll(IMPORTS)) { const dep = m[1] ?? m[2]; if (dep.startsWith('.')) cola.push(join(f, '..', dep)); }
  }
  return vistos;
}

test('S1–S2: nadie en el lector lanza programas ni lleva un mandato de adb, ni hay guiones de shell', () => {
  const todos = ficherosDelLector();
  const ficheros = todos.filter((f) => /\.(c|m)?js$/.test(f));
  ok(ficheros.length >= 20, `la prueba no ve el lector: ${ficheros.length}`);
  const PROHIBIDOS = /['"`](input|shell|tap|swipe|keyevent|text|install|uninstall|push|am|pm|monkey|sendevent|root|reboot|exec-out|screencap|connect)['"`]/;
  for (const f of ficheros) {
    const texto = sinComentarios(readFileSync(join(LECTOR, f), 'utf8'));
    ok(!PROHIBIDOS.test(texto), `${f} lleva un mandato de adb: ${texto.match(PROHIBIDOS)?.[0]}`);
    ok(!/child_process|\bexecFile|\bspawn|\bexecSync|\bprocess\.binding|\badb\b/.test(texto), `${f} puede lanzar programas o habla de adb`);
  }
  for (const fuera of ['voz.mjs', 'tablet.mjs']) ok(!ficheros.includes(fuera), `vuelve a haber ${fuera}`);
  eq(todos.filter((g) => /\.sh$/.test(g)).length, 0, 'vuelve a haber un guion de shell en el lector');
});

test('S3–S5: cada fichero que ejecuta el lector solo importa los módulos de Node de su lista, y no hay otra vía de cargar código', () => {
  const vistos = grafoDelLector();
  const relativo = (f) => relative(RAIZ, f);
  ok([...vistos.keys()].some((f) => /src\/motor\/nombres\.js$/.test(f)) && [...vistos.keys()].some((f) => /src\/comun\/contrato\.js$/.test(f)), 'el recorrido no llega a lo que el lector importa de fuera de su carpeta');
  // [C] Los módulos de Node de cada fichero, con su porqué. Ninguno lanza programas.
  const DE_NODE = {
    'scripts/lector/acceso.mjs': ['node:crypto'], // comparar el código en tiempo constante
    'scripts/lector/servir.mjs': ['node:http', 'node:fs', 'node:crypto', 'node:path'], // el servidor, las capturas y el reto (PBKDF2)
    'scripts/lector/capturas.mjs': ['node:fs', 'node:path'], // podar SOLO sus capturas
    'scripts/lector/aprendizaje.mjs': ['node:fs', 'node:path', 'node:worker_threads'], // lo aprendido y su hilo
    'scripts/lector/lectura.mjs': ['node:worker_threads'], // los tres hilos de lectura
    'scripts/lector/en-tablet.mjs': ['node:fs', 'node:path', 'node:url'],
    'scripts/lector/datos.mjs': ['node:fs', 'node:path'],
    'scripts/lector/partidas.mjs': ['node:fs', 'node:path'],
    'scripts/lector/subidas.mjs': ['node:fs', 'node:path', 'node:crypto'], // la clave al azar del lector (Node 18 no trae crypto global)
    'scripts/lector/solo.mjs': ['node:fs'], // solo.json
    'scripts/lector/png.mjs': ['node:zlib'],
    'scripts/lector/leer.mjs': ['node:fs', 'node:path', 'node:url'],
    'scripts/lector/partida.mjs': ['node:fs'],
    'scripts/lector/sacar-caras.mjs': ['node:fs'],
    'scripts/lector/lectura-tarea.mjs': ['node:worker_threads'],
    'scripts/lector/aprender-tarea.mjs': ['node:worker_threads', 'node:fs'],
    'scripts/lector/recortes-tarea.mjs': ['node:worker_threads', 'node:fs'],
    'scripts/lector/arranque-apk.mjs': ['node:fs', 'node:path'], // fallo-nodo.txt
  };
  // [C] La ÚNICA carga dinámica: el arranque de la APK carga el lector DESPUÉS de poner los vigilantes, una vez.
  const CARGA_PERMITIDA = { 'scripts/lector/arranque-apk.mjs': 'import("./en-tablet.mjs")' };
  for (const [f, texto] of vistos) {
    const r = relativo(f);
    const deps = [...texto.matchAll(IMPORTS)].map((m) => m[1] ?? m[2]).filter((d) => !d.startsWith('.'));
    for (const d of deps) ok((DE_NODE[r] ?? []).includes(d), `${r} importa ${d}, que no tiene permitido`);
    const permitida = CARGA_PERMITIDA[r];
    if (permitida) eq(texto.split(permitida).length - 1, 1, `${r} no carga el lector con su única carga permitida`);
    const otraVia = (permitida ? texto.split(permitida).join('') : texto).match(/\bimport\s*\(|\brequire\s*\(|\bcreateRequire\b|\beval\s*\(|\bFunction\s*\(|\bprocess\s*\[|\bprocess\.(binding|dlopen|_linkedBinding)\b|\bgetBuiltinModule\b|\.constructor\b|\bconstructor\s*\(|\bReflect\b|\]\s*\(|\bglobalThis\s*\[|\beval\s*:\s*true|\bmodule\.constructor\b/);
    ok(!otraVia, `${r} puede cargar o ejecutar código por otra vía: ${otraVia?.[0]}`);
    for (const m of texto.matchAll(/new\s+Worker\s*\((.{0,80})/g)) ok(/^\s*(new URL\(\s*["'][\w-]+\.mjs["'],\s*import\.meta\.url\s*\)|tarea)\s*,/.test(m[1]), `${r} arranca un hilo con ${m[1].trim()}`);
    if (/new\s+Worker\s*\(\s*tarea\b/.test(texto)) ok(/\btarea\s*=\s*new URL\(\s*["'][\w-]+\.mjs["'],\s*import\.meta\.url\s*\)/.test(texto) && (texto.match(/\btarea\s*=/g) ?? []).length === 1, `${r} arranca un hilo con una \`tarea\` que puede venir de otro sitio`);
  }
});

test('S7: el lector de la APK solo llama a la red a su puerto interno, a la web fija de Pick Assist y a la base de datos saneada', () => {
  // fetch es global: la lista de imports no limita los destinos. Se mira CADA llamada del grafo que carga la APK.
  const PERMITIDAS = {
    'scripts/lector/en-tablet.mjs': { pedir: ['`${base}/captura`'] },
    'scripts/lector/datos.mjs': { fetch: ['...a'], pedir: ['url'] },
    'src/comun/basedatos.js': { fetch: ['`${config.url}/rest/v1/rpc/${funcion}`'] },
  };
  const cola = ['scripts/lector/arranque-apk.mjs']; const vistos = new Set(); const vistas = [];
  while (cola.length) {
    const f = cola.pop();
    if (vistos.has(f)) continue;
    vistos.add(f);
    const texto = sinComentarios(readFileSync(join(RAIZ, f), 'utf8'));
    for (const m of texto.matchAll(/(?:import|export)\b[^'"`;]*?\bfrom\s*['"](\.[^'"]+)['"]|\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g)) cola.push(relative(RAIZ, join(RAIZ, dirname(f), m[1] ?? m[2])));
    for (const m of texto.matchAll(/\b(fetch|pedir|request|connect|createConnection|WebSocket|XMLHttpRequest)\s*\(\s*([^,)]*)/g)) {
      vistas.push(`${f} ${m[1]}(${m[2].trim()})`);
      ok((PERMITIDAS[f]?.[m[1]] ?? []).includes(m[2].trim()), `${f} llama a ${m[1]}(${m[2].trim()}): una salida a la red que no está en la lista`);
    }
  }
  ok(vistos.has('scripts/lector/en-tablet.mjs') && vistas.length >= 4, `la prueba no ve las llamadas de siempre: ${vistas}`);
  ok(Object.values(DATOS_DE_LA_WEB).every((u) => u.startsWith('https://srchipiron.github.io/mobile-legends-pick-assist/')), 'la tablet baja datos de otro sitio');
  for (const u of ['http://127.0.0.1:5000']) ok(esInterno(u), `${u} no vale`);
  for (const u of ['http://192.168.1.2:5000', 'http://127.0.0.1.atacante.example:80', 'https://127.0.0.1:5000', 'http://localhost:5000', 'http://127.0.0.1:5000/x']) ok(!esInterno(u), `${u} vale como captura`);
  let lanzo = false;
  try { capturaDeLaApk('http://192.168.1.2:5000', 's'); } catch { lanzo = true; }
  ok(lanzo, 'la captura acepta venir de otro aparato');
  ok(codigoValido('AB12CD34') && !codigoValido('1234') && !codigoValido('AB12 CD34') && !codigoValido(undefined), 'el código acepta lo que no debe');
});

test('el portero: el bueno entra, uno malo no, y tras demasiados fallos ESE aparato no entra hasta que pasa la ventana; sin código no es un fallo', () => {
  let t = 0;
  const portero = crearPortero(CODIGO, { ahora: () => t });
  eq(portero(CODIGO), 'si');
  eq(portero('AB12CD34EX'), 'no');
  eq(portero(undefined), 'no');
  eq(portero(CODIGO.slice(0, 5)), 'no', 'un trozo del código entra');
  for (let i = 0; i < FALLOS_CODIGO; i++) portero('MALO' + i, '192.168.1.66');
  eq(portero(CODIGO, '192.168.1.66'), 'bloqueado', 'tras los fallos el bueno entra igual desde ese aparato (adivinarlo compensa)');
  eq(portero(CODIGO, '192.168.1.20'), 'si', 'los fallos de otro aparato dejan fuera al bueno');
  t += VENTANA_CODIGO_MS + 1;
  eq(portero(CODIGO, '192.168.1.66'), 'si', 'pasada la ventana el bueno sigue sin entrar');
  eq(crearPortero('')(''), 'no', 'sin código entra cualquiera');
  const sinCodigo = crearPortero(CODIGO, { ahora: () => t });
  for (let i = 0; i < FALLOS_CODIGO * 3; i++) { eq(sinCodigo(undefined, '192.168.1.20'), 'no'); eq(sinCodigo('', '192.168.1.20'), 'no'); }
  eq(sinCodigo(CODIGO, '192.168.1.20'), 'si', 'buscar la tablet sin código deja fuera al móvil');
});

test('Host: 127.0.0.1, localhost o una IP privada escrita tal cual; nunca un nombre (rebinding de DNS)', () => {
  for (const h of ['192.168.68.116:47323', '10.0.0.5', '172.16.0.9:47323', '127.0.0.1:47323', 'localhost:47323']) ok(hostPermitido(h), `${h} no vale`);
  for (const h of ['8.8.8.8:47323', 'tablet.local', '192.168.68.116.atacante.example', 'atacante.example', '172.32.0.1', undefined, '']) ok(!hostPermitido(h), `${h} vale`);
});

test('H5: el origen local (127.0.0.1/localhost) solo vale con la variable de las pruebas, que la APK nunca pone', () => {
  ok(origenPermitido(APP) && !origenPermitido('https://srchipiron.github.io.atacante.example') && !origenPermitido('null') && !origenPermitido(undefined), 'el origen de la app no se comprueba bien');
  for (const o of ['http://127.0.0.1:5173', 'http://localhost', 'http://localhost:4173']) {
    ok(!origenPermitido(o), `${o} vale sin la variable de las pruebas`);
    ok(origenPermitido(o, { local: true }), `${o} no vale ni con la variable de las pruebas`);
  }
  ok(!origenPermitido('http://127.0.0.1.atacante.example', { local: true }), 'un nombre que empieza por 127.0.0.1 pasa');
  const kotlin = readdirSync(join(RAIZ, 'android/app/src/main/java'), { recursive: true }).map(String).filter((f) => f.endsWith('.kt')).map((f) => readFileSync(join(RAIZ, 'android/app/src/main/java', f), 'utf8')).join('\n');
  ok(!kotlin.includes(VARIABLE_ORIGEN_LOCAL), 'la APK pone la variable del origen local');
  ok(!/origenLocal/.test(readFileSync(join(LECTOR, 'en-tablet.mjs'), 'utf8')), 'el arranque de la tablet abre el origen local');
});

const servidores = [];
after(() => Promise.all(servidores.map((s) => s.cerrar())));
const servidor = async (opciones) => { const s = await arrancar(opciones); servidores.push(s); return s; };

test('las rutas del servidor son EXACTAMENTE las de RUTAS (contrato.js), y cada una pasa por el portero', async () => {
  const { s, puerto } = await servidor();
  eq([...s.rutas].sort().join(), Object.keys(RUTAS).sort().join(), 'el servidor atiende otras rutas que las del contrato');
  for (const [ruta, quien] of Object.entries(RUTAS)) {
    const [metodo, camino] = ruta.split(' ');
    const r = await pedir(puerto, camino, { metodo, cuerpo: metodo === 'POST' ? {} : undefined, codigo: null, origen: quien === 'apk' ? null : APP });
    if (quien === 'cualquiera') ok(r.estado !== 401, `${ruta} pide el código`);
    else eq(r.estado, 401, `${ruta} contesta sin el código (${r.estado})`);
  }
});

test('S13: las rutas de la app exigen su Origin, las de la APK la exigen a ella (127.0.0.1 y sin Origin), y todas un Host de la casa y el origen de la app', async () => {
  const { puerto } = await servidor();
  for (const [ruta, quien] of Object.entries(RUTAS)) {
    const [metodo, camino] = ruta.split(' ');
    const cuerpo = metodo === 'POST' ? {} : undefined;
    eq((await pedir(puerto, camino, { metodo, cuerpo, host: 'atacante.example' })).estado, 403, `${ruta} contesta con un nombre como Host`);
    const ajena = await pedir(puerto, camino, { metodo, cuerpo, origen: 'https://atacante.example' });
    ok(ajena.estado === 403 && !ajena.cabeceras['access-control-allow-origin'], `${ruta} contesta a otra web`);
    eq((await pedir(puerto, camino, { metodo, cuerpo, origen: 'http://127.0.0.1:5173' })).estado, 403, `${ruta} acepta el origen local sin la variable de las pruebas (H5)`);
    if (quien === 'app') eq((await pedirApk(puerto, camino, { metodo, cuerpo })).estado, 403, `${ruta} es de la app y contesta sin Origin`);
    if (quien === 'apk') eq((await pedir(puerto, camino, { metodo, cuerpo })).estado, 403, `${ruta} es de la APK y contesta a un navegador`);
  }
  // Y la APK se reconoce por el socket: desde otro aparato, sin Origin, no lo es.
  ok(deLaApk({ headers: {}, socket: { remoteAddress: '127.0.0.1' } }) && deLaApk({ headers: {}, socket: { remoteAddress: '::ffff:127.0.0.1' } }), 'la propia APK no se reconoce');
  ok(!deLaApk({ headers: {}, socket: { remoteAddress: '192.168.1.20' } }) && !deLaApk({ headers: { origin: APP }, socket: { remoteAddress: '127.0.0.1' } }), 'otro aparato o un navegador pasan por la APK');
  // La comprobación previa deja pasar la cabecera del código y la red privada.
  const previa = await new Promise((r) => { const q = request({ host: '127.0.0.1', port: puerto, path: '/draft', method: 'OPTIONS', headers: { Host: `192.168.1.40:${puerto}`, Origin: APP } }, (res) => { res.resume(); r(res); }); q.end(); });
  ok(/X-Lector-Codigo/i.test(previa.headers['access-control-allow-headers'] ?? '') && previa.headers['access-control-allow-private-network'] === 'true', 'la comprobación previa no deja pasar el código');
});

test('H6/H7 y lo quitado: ni /leer, ni /final, ni /vigilar, ni /corregir, ni el consejo del móvil existen, y lo que va al móvil no lleva imágenes', async () => {
  const { puerto, interno } = await servidor();
  for (const ruta of ['GET /leer', 'GET /final', 'POST /vigilar', 'POST /corregir', 'POST /consejo', 'POST /voz', 'GET /captura', 'POST /aprendido', 'GET /recortes']) {
    const [metodo, camino] = ruta.split(' ');
    for (const origen of [APP, null]) eq((await pedir(puerto, camino, { metodo, cuerpo: metodo === 'POST' ? {} : undefined, origen })).estado, 404, `${ruta} existe (${origen ? 'app' : 'APK'})`);
  }
  interno.vigilar(Date.now());
  const r = await pedir(puerto, '/draft');
  eq(r.estado, 200, r.cuerpo);
  eq(r.json.protocolo, PROTOCOLO, 'GET /draft no dice el protocolo');
  ok(!/iVBOR|"miniatura"|"tira"|"fotogramas"|"picks"/.test(r.cuerpo), 'lo que va al móvil lleva imágenes');
  eq((await pedir(puerto, '/estado')).json.protocolo, PROTOCOLO, 'GET /estado no dice el protocolo');
});

test('S20: un cuerpo enorme o roto se contesta 400 sin tirar el servidor, y el reto tiene forma y tope', async () => {
  const { puerto } = await servidor();
  const enorme = await pedir(puerto, '/draft', { metodo: 'POST', cuerpo: JSON.stringify({ desde: 1, enemigos: ['x'.repeat(CUERPO_MAXIMO + 10)] }) }).catch((e) => ({ estado: e.code }));
  ok(enorme.estado === 400 || enorme.estado === 'ECONNRESET' || enorme.estado === 'EPIPE', `un cuerpo enorme no se corta: ${enorme.estado}`);
  eq((await pedir(puerto, '/draft', { metodo: 'POST', cuerpo: '{roto' })).estado, 400, 'un cuerpo roto no es 400');
  eq((await pedir(puerto, '/ajustes', { metodo: 'POST', cuerpo: { linea: '<script>' } })).estado, 400, 'unos ajustes sin forma pasan');
  eq((await pedir(puerto, '/estado')).estado, 200, 'el servidor no sigue vivo');
  const n = '0123456789abcdef0123456789abcdef';
  const r = await pedir(puerto, `/reto?n=${n}`, { codigo: null, origen: null });
  eq(r.estado, 200, r.cuerpo);
  eq(r.json.prueba, await pruebaDelReto(CODIGO, n), 'la prueba del lector no es la que calcula la app');
  ok(r.json.prueba !== await pruebaDelReto('OTROCODIGO9', n) && !r.cuerpo.includes(CODIGO), 'la prueba no depende del código, o lo lleva dentro');
  eq((await pedir(puerto, '/reto?n=xyz', { codigo: null, origen: null })).estado, 400, 'acepta un reto sin forma');
  let ultimo;
  for (let i = 0; i < RETOS_POR_MINUTO; i += 1) ultimo = await pedir(puerto, `/reto?n=${n}`, { codigo: null, origen: null });
  eq(ultimo.estado, 429, 'sin tope de retos por aparato');
  const retos = new Map();
  let atendidos = 0;
  for (let i = 0; i < 200; i += 1) if (permitirReto(retos, `fe80::${i}`, 1000)) atendidos += 1;
  eq(atendidos, RETOS_EN_TOTAL, 'con una dirección nueva en cada reto no hay tope total');
  ok(permitirReto(retos, 'fe80::nuevo', 1000 + 60000) && retos.size === 1, `pasado un minuto, el mapa no se poda: ${retos.size}`);
  for (let i = 0; i < RETOS_POR_MINUTO - 1; i += 1) permitirReto(retos, 'fe80::nuevo', 61000 + i);
  ok(!permitirReto(retos, 'fe80::nuevo', 61100), 'permitirReto no tiene tope por aparato');
});
