/**
 * El servidor de la tablet por dentro (scripts/lector/servir.mjs): las
 * lecturas (en tres hilos = en uno), las capturas que guarda y poda, la cola
 * de aprendizaje, la vigilancia del final vista desde el servidor y lo que
 * la APK lee para la burbuja y las preguntas. Las puertas (Host, Origin,
 * código, quién) van en lector-seguridad.test.mjs.
 */
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
import { test, ok, eq, RAIZ } from '../ayuda.mjs';
import { PUERTO, LECTURAS_EN_PARTIDA } from '../../src/comun/contrato.js';
import { plantillasDeSerie, sanearPregunta, VISTAZO_MS } from '../../scripts/lector/servir.mjs';
import { lectorEnHilos, leerCaptura } from '../../scripts/lector/lectura.mjs';
import { podarCapturas, capturasAMirar, CAPTURAS_A_MIRAR, RETENCION_CAPTURAS_MS, MAX_CAPTURAS } from '../../scripts/lector/capturas.mjs';
import { leerAprendido } from '../../scripts/lector/aprendizaje.mjs';
import { VIGILANCIA } from '../../scripts/lector/vigilancia.mjs';
import { VERSION_APRENDIDO } from '../../scripts/lector/aprender.mjs';
import { carasGuardadas, vaciosAliadoGuardados } from '../../scripts/lector/leer.mjs';
import { leerPng, escribirPng } from '../../scripts/lector/png.mjs';
import { pngQueQuepa, reducir, cuantizar, fotogramaDe, diferencia, CAMBIO_MINIMO } from '../../scripts/lector/miniatura.mjs';
import { capturaCompleta, pantallaDeFinal, VERDAD } from '../fixtures/juego/captura.mjs';
import { arrancar, pedirApk, pedir, hasta } from '../fixtures/juego/lector.mjs';

const caras = carasGuardadas();
const img = capturaCompleta();
const png = escribirPng(img);
const tabla = leerPng(pantallaDeFinal());
const final = (f) => leerPng(pantallaDeFinal(f));
/** Una pantalla de juego de verdad (160 px), ampliada como una captura de la tablet. */
const deJuego = (f = 'juego-17.png', k = 5) => {
  const peq = leerPng(readFileSync(join(RAIZ, 'pruebas/fixtures/juego/pantallas', f)));
  const ancho = peq.ancho * k, alto = peq.alto * k, rgba = new Uint8Array(ancho * alto * 4);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) { const o = (Math.floor(y / k) * peq.ancho + Math.floor(x / k)) * 4; rgba.set(peq.rgba.subarray(o, o + 4), (y * ancho + x) * 4); }
  return { ancho, alto, rgba };
};
const abiertos = [];
after(() => Promise.all(abiertos.map((s) => s.cerrar())));
const servidor = async (opciones) => { const s = await arrancar(opciones); abiertos.push(s); return s; };
const sinAprender = { version: VERSION_APRENDIDO, picks: null, caras: {}, capturas: 1 };

test('las lecturas en tres hilos dan exactamente lo mismo que en uno, y si un hilo falla se lee en uno solo', async () => {
  const unaSola = leerCaptura(img, caras);
  const avisosBuenos = [];
  const enHilos = lectorEnHilos({ caras, registrar: (l) => avisosBuenos.push(l) });
  try {
    for (const vez of [1, 2]) eq(JSON.stringify(await enHilos.leer(img)), JSON.stringify(unaSola), `la lectura ${vez} en hilos no es la de un hilo`);
    const aprendido = { version: VERSION_APRENDIDO, picks: [[100, 100, 40], [100, 300, 40], [100, 500, 40], [100, 700, 40], [100, 900, 40]], caras: {}, capturas: 1 };
    eq(JSON.stringify(await enHilos.leer(img, aprendido)), JSON.stringify(leerCaptura(img, caras, aprendido)), 'con lo aprendido, los hilos y uno solo leen distinto');
    // Sin avisos: si los hilos fallaran, el plan B daría lo mismo y taparía el fallo.
    eq(avisosBuenos.join(' | '), '', 'los hilos fallaron y se leyó en uno solo');
  } finally { enHilos.cerrar(); }
  const avisos = [];
  const roto = lectorEnHilos({ caras, registrar: (l) => avisos.push(l), tarea: new URL('file:///no-existe/lectura-tarea.mjs') });
  try {
    eq(JSON.stringify(await roto.leer(img)), JSON.stringify(unaSola), 'con los hilos rotos no se lee en uno solo');
    ok(avisos.some((l) => /hilos de lectura fallaron/.test(l)), `no dice que los hilos fallaron: ${avisos}`);
  } finally { roto.cerrar(); }
});

test('las capturas se borran solas: las de hace más de unas horas y las que pasan del tope por tipo, y nada más', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'lector-poda-'));
  const t0 = Date.parse('2026-10-02T10:00:00Z');
  const fecha = (ms) => new Date(ms).toISOString().replace(/[:.]/g, '-');
  const escribir = (nombre, hace) => { writeFileSync(join(carpeta, nombre), 'x'); utimesSync(join(carpeta, nombre), new Date(t0 - hace), new Date(t0 - hace)); };
  const vieja = `lectura-${fecha(t0 - RETENCION_CAPTURAS_MS - 60000)}-1`, reciente = `lectura-${fecha(t0 - 60000)}-2`;
  for (const ext of ['png', 'json', 'verdad.json']) escribir(`${vieja}.${ext}`, RETENCION_CAPTURAS_MS + 60000);
  escribir(`${reciente}.png`, 60000);
  escribir(`fotograma-${fecha(t0 - RETENCION_CAPTURAS_MS - 1000)}.png`, RETENCION_CAPTURAS_MS + 1000);
  escribir('otra-cosa.png', RETENCION_CAPTURAS_MS * 10); escribir('aprendido.json', RETENCION_CAPTURAS_MS * 10);
  eq(podarCapturas(carpeta, { ahora: t0 }), 4, 'no borra justo las viejas (lectura con sus dos ficheros y el fotograma)');
  eq(readdirSync(carpeta).sort().join(), ['aprendido.json', 'otra-cosa.png', `${reciente}.png`].sort().join(), `borra lo que no debe o deja lo viejo: ${readdirSync(carpeta)}`);
  for (let i = 0; i < MAX_CAPTURAS.lectura + 5; i++) escribir(`lectura-${fecha(t0 - 30000 + i * 10)}-${i + 3}.png`, 30000 - i * 10);
  podarCapturas(carpeta, { ahora: t0 });
  const lecturas = readdirSync(carpeta).filter((n) => n.startsWith('lectura-')).sort();
  eq(lecturas.length, MAX_CAPTURAS.lectura, `no respeta el tope de lecturas: ${lecturas.length}`);
  ok(!lecturas.includes(`${reciente}.png`) && lecturas[lecturas.length - 1].endsWith(`-${MAX_CAPTURAS.lectura + 7}.png`), 'con el tope no se van las más viejas');
  eq(readdirSync(carpeta).filter((n) => !n.startsWith('lectura-')).sort().join(), 'aprendido.json,otra-cosa.png', 'el tope toca ficheros ajenos');
  // Y el servidor poda al guardar cada captura (los fotogramas viejos de una versión anterior también se van).
  escribir(`fotograma-${fecha(t0 - RETENCION_CAPTURAS_MS * 2)}.png`, RETENCION_CAPTURAS_MS * 2);
  const { interno } = await servidor({ carpeta });
  await interno.leer();
  await interno.guardando();
  ok(!readdirSync(carpeta).some((n) => n.startsWith('fotograma-')), 'al guardar una lectura no borra el fotograma viejo');
  ok(readdirSync(carpeta).some((n) => /^lectura-.*\.png$/.test(n) && !lecturas.includes(n)), 'la lectura nueva no se guarda');
});

test('el puerto de la tablet es el del contrato, y la APK y su QR usan el mismo', () => {
  const kotlin = readdirSync(join(RAIZ, 'android/app/src/main/java'), { recursive: true }).map(String).filter((f) => f.endsWith('.kt')).map((f) => readFileSync(join(RAIZ, 'android/app/src/main/java', f), 'utf8')).join('\n');
  const del = kotlin.match(/const val PUERTO = (\d+)/)?.[1];
  eq(Number(del), PUERTO, 'la APK habla con un puerto distinto del del contrato');
});

test('una lectura devuelve los nombres de la captura (nunca la imagen), y un fallo de captura se cuenta en /estado', async () => {
  const { interno } = await servidor();
  const r = await interno.leer();
  ok(r.ok, JSON.stringify(r));
  const l = r.lectura;
  eq(l.tuyos.map((x) => x.nombre).join(), VERDAD.tuyos.join(), 'los baneos de tu equipo no salen');
  eq(l.suyos.map((x) => x.nombre).join(), VERDAD.suyos.join(), 'los baneos del enemigo no salen');
  eq(l.enemigos.map((x) => x.nombre ?? '?').join(), 'Clint,Khufra,?,?,?', 'los picks enemigos no salen');
  eq(l.aliados.map((x) => x.nombre ?? '?').join(), VERDAD.aliados.join(), `tu equipo no sale: ${l.aliados.map((x) => x.nombre)}`);
  ok(l.tuyoFila === VERDAD.tuyoFila && l.tuyo === VERDAD.tuyo, `tu fila no sale: ${l.tuyoFila} ${l.tuyo}`);
  ok(!JSON.stringify(l).includes('rgba') && JSON.stringify(l).length < 4000, 'la lectura lleva la imagen o algo más que nombres');
  ok(!('formato' in l) && !('msCaptura' in l) && !('version' in l), `la lectura lleva campos que ya no existen: ${Object.keys(l)}`);
  const roto = await servidor({ capturar: async () => { throw new Error('la app del lector no contesta'); } });
  eq(JSON.stringify(await roto.interno.leer()), JSON.stringify({ ok: false, error: 'captura' }), 'un fallo de captura no se dice');
  const e = roto.interno.estado();
  ok(e.lector.fallosCaptura === 1 && /no contesta/.test(e.lector.ultimoFallo?.que), `/estado no cuenta el fallo: ${JSON.stringify(e.lector)}`);
});

test('sin grabar, el fallo de captura deja UNA línea por racha y otra al volver (4.0.4); /estado los cuenta todos', async () => {
  const lineas = [];
  let graba = false;
  const { interno } = await servidor({ registrar: (m) => lineas.push(m), capturar: async () => { if (!graba) throw new Error('La tablet no está grabando la pantalla'); return capturaCompleta(); } });
  for (let i = 0; i < 4; i++) await interno.leer({ soloPartida: true });
  const fallos = () => lineas.filter((l) => /No se pudo hacer la captura/.test(l)).length;
  eq(fallos(), 1, `cuatro fallos seguidos dejan ${fallos()} líneas`);
  eq(interno.estado().lector.fallosCaptura, 4, '/estado deja de contar los fallos repetidos');
  graba = true;
  await interno.leer({ soloPartida: true });
  ok(lineas.some((l) => /vuelve a funcionar/.test(l)), 'al volver a grabar no lo dice');
  await interno.leer({ soloPartida: true });
  eq(lineas.filter((l) => /vuelve a funcionar/.test(l)).length, 1, 'lo dice en cada captura buena');
  graba = false;
  await interno.leer({ soloPartida: true });
  eq(fallos(), 2, 'una racha nueva no deja su línea');
});

test('un hueco sin reconocer dice en el registro a qué se quedó más cerca', async () => {
  const lineas = [];
  const { interno } = await servidor({ capturar: async () => capturaCompleta({ conPicks: false }), registrar: (m) => lineas.push(m) });
  await interno.leer();
  const linea = lineas.find((l) => /^Lectura 1/.test(l)) ?? '';
  ok(/enemigos \?\([A-Za-z.' -]+ 0\.\d\d\)/.test(linea), `el registro no dice el candidato y el parecido de un «?»: ${linea}`);
});

test('S19: una corrección no escribe fuera de la carpeta de capturas, ni con un id que sale de ella ni con uno que se alarga', async () => {
  const raiz = mkdtempSync(join(tmpdir(), 'lector-fuera-'));
  const carpeta = join(raiz, 'capturas');
  mkdirSync(carpeta);
  writeFileSync(join(raiz, 'lectura-fuera.png'), 'x');
  mkdirSync(join(carpeta, 'lectura-1'));
  let aprendio = false;
  const { interno } = await servidor({ carpeta, aprender: async () => { aprendio = true; return { aprendido: null, informe: [] }; } });
  const r = await interno.aprenderDe({ ids: ['../lectura-fuera', 'lectura-1/../../lectura-fuera', 'lectura-../../lectura-fuera'], enemigos: ['Clint'] });
  eq(r.aprendido, false, 'aprende de ids que no son capturas de la carpeta');
  eq(readdirSync(raiz).filter((f) => f.endsWith('.verdad.json')).join(), '', `escribe fuera de la carpeta de capturas: ${readdirSync(raiz)}`);
  ok(!aprendio, 'aprende de una captura de fuera de la carpeta');
});

test('una cola de aprendizaje: tres correcciones a la vez aprenden una tras otra, cada una sobre lo de la anterior', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'lector-cola-'));
  writeFileSync(join(carpeta, 'lectura-1.png'), png);
  let ahora = 0, maximo = 0;
  const guardados = [];
  const aprender = async ({ aprendido }) => {
    ahora += 1; maximo = Math.max(maximo, ahora);
    await new Promise((r) => setTimeout(r, 150));
    ahora -= 1;
    return { aprendido: { ...sinAprender, capturas: (aprendido?.capturas ?? 0) + 1 }, informe: [] };
  };
  const { interno } = await servidor({ carpeta, aprender, guardar: (a) => guardados.push(a.capturas) });
  const una = () => interno.aprenderDe({ ids: ['lectura-1'], enemigos: ['Clint'] });
  // Y lo arreglado del historial va por la MISMA cola.
  const arreglo = interno.aprenderDeArreglos([{ clave: 'a', verdad: { enemigos: ['Clint'], aliados: [] }, capturas: [{ id: 'lectura-2', picks: 'iVBO' }] }]);
  await Promise.all([una(), una(), una(), arreglo]);
  eq(maximo, 1, `aprenden ${maximo} tandas a la vez`);
  eq(guardados.join(), '1,2,3,4', `una tanda pisa a otra: ${guardados}`);
});

test('la poda no se lleva las capturas que se están aprendiendo (con la tablet leyendo cada 1,5 s)', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'lector-en-uso-'));
  const viejas = ['lectura-2026-10-28T19-04-37-286Z-807', 'lectura-2026-10-28T19-04-41-286Z-808'];
  for (const id of viejas) writeFileSync(join(carpeta, `${id}.png`), png);
  let soltar; const espera = new Promise((r) => { soltar = r; });
  const vistas = [];
  const aprender = async ({ pares, aprendido }) => {
    await espera;
    for (const p of pares) vistas.push(existsSync(p.png));
    return { aprendido: { ...sinAprender, capturas: (aprendido?.capturas ?? 0) + 1 }, informe: [] };
  };
  const { interno } = await servidor({ carpeta, aprender, maximos: { lectura: 2, fotograma: 2, resultado: 2 } });
  const corregida = interno.aprenderDe({ ids: viejas, enemigos: ['Clint'] });
  await new Promise((r) => setTimeout(r, 50));
  for (let i = 0; i < 4; i++) { await interno.leer(); await interno.guardando(); }
  ok(readdirSync(carpeta).filter((f) => /^lectura-.*\.png$/.test(f)).length >= 4, 'la prueba necesita capturas nuevas guardadas');
  soltar();
  ok((await corregida).aprendido, 'la corrección no aprende');
  await interno.leer(); await interno.guardando();
  ok(viejas.every((id) => !existsSync(join(carpeta, `${id}.png`))), 'acabado el aprendizaje, siguen protegidas para siempre');
  eq(JSON.stringify(vistas), JSON.stringify([true, true]), 'la poda se lleva una captura a mitad del aprendizaje');
});

test('un aprendizaje que falla al contestar «Enseña al lector» contesta 500, arregla la partida igual y el lector sigue vivo', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'lector-falla-'));
  writeFileSync(join(carpeta, 'lectura-1.png'), png);
  const arregladas = [];
  const { puerto, interno } = await servidor({ carpeta, aprender: async () => { throw new Error('el hilo de aprendizaje salió con 134'); }, alCorregir: (c) => arregladas.push(c) });
  interno.ponerCorreccion({ id: 'correccion-1', cuando: Date.now(), ids: ['lectura-1'], heroes: ['Clint', 'Khufra'], partida: 5, leidos: {} });
  const r = await pedirApk(puerto, '/correccion', { metodo: 'POST', cuerpo: { id: 'correccion-1', enemigos: ['Clint'] } });
  eq(r.estado, 500, 'un aprendizaje roto no contesta 500');
  eq(arregladas.length, 1, 'si aprender falla, la partida no se arregla');
  eq((await pedir(puerto, '/estado')).estado, 200, 'el lector no sigue contestando');
});

test('la verdad se guarda junto a cada captura, se aprende de las repartidas, y lo aprendido entra en la siguiente lectura sin tapar la geometría medida', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'lector-aprende-'));
  const tandas = [], guardadas = [];
  // Un aprendizaje de pega con huecos imposibles (fuera de la columna): la lectura siguiente los usa.
  const aprender = async ({ pares, aprendido }) => { tandas.push({ pares, aprendido }); return { aprendido: { version: VERSION_APRENDIDO, picks: [[100, 100, 40], [100, 300, 40], [100, 500, 40], [100, 700, 40], [100, 900, 40]], caras: {}, capturas: (aprendido?.capturas ?? 0) + pares.length }, informe: [{ id: pares[0].id, aprendidos: [{ nombre: 'Clint', hueco: 0, parecido: 0.9, pos: [1, 2, 3] }], sinEncontrar: [], yaLeidos: [], aliados: { aprendidos: ['Selena'], pendientes: [] } }] }; };
  const { interno } = await servidor({ carpeta, aprender, guardar: (a) => guardadas.push(a) });
  const ids = [];
  for (let i = 0; i < CAPTURAS_A_MIRAR + 2; i++) { ids.push((await interno.leer()).lectura.id); await interno.guardando(); }
  ok(ids.every((id) => /^lectura-/.test(id)) && new Set(ids).size === ids.length, `las lecturas no llevan id propio: ${ids}`);
  const r = await interno.aprenderDe({ ids: [...ids, 'lectura-que-no-existe', '../../etc'], enemigos: ['Clint', 'Khufra'], baneos: ['Hirara'], aliados: ['Saber', 'Layla', 7, 'X'.repeat(60)], tuyo: 'Estes' });
  ok(r.aprendido && r.aprendidos.join() === 'Clint,Selena', `la corrección no aprende (o no cuenta a tu equipo): ${JSON.stringify(r)}`);
  eq(readdirSync(carpeta).filter((f) => f.endsWith('.verdad.json')).length, ids.length, 'la verdad no se guarda junto a cada captura');
  const verdad = JSON.parse(readFileSync(join(carpeta, `${ids[0]}.verdad.json`), 'utf8'));
  eq(`${verdad.enemigos.join()}|${verdad.aliados.join()}|${verdad.tuyo}`, `Clint,Khufra|Saber,Layla,${'X'.repeat(40)}|Estes`, `la verdad guardada no es la que se dijo (solo nombres de 40 caracteres): ${JSON.stringify(verdad)}`);
  eq(tandas.length, 1, 'no aprende una vez por corrección');
  eq(tandas[0].pares.map((p) => p.id).join(), capturasAMirar(ids).join(), 'no mira las capturas repartidas por el draft');
  ok(tandas[0].pares.every((p) => p.verdad.baneos?.join() === 'Hirara' && p.verdad.tuyo === 'Estes'), 'la verdad que llega al aprendizaje no lleva los baneos o tu pick');
  eq(guardadas.length, 1, 'lo aprendido no se guarda en disco');
  const despues = (await interno.leer()).lectura;
  eq(despues.enemigos[0].nombre, 'Clint', `unos huecos aprendidos equivocados tapan la geometría medida: ${despues.enemigos.map((e) => e.nombre)}`);
  eq(interno.estado().aprendido.capturas, CAPTURAS_A_MIRAR, '/estado no dice de cuántas capturas ha aprendido');
  await interno.aprenderDe({ ids: ids.slice(0, 1), enemigos: ['Clint'] });
  eq(tandas[1].aprendido.capturas, CAPTURAS_A_MIRAR, 'la segunda tanda no parte de lo aprendido en la primera');
  // Lo aprendido con la versión 1 (sin guardas) se descarta; el icono del hueco vacío aprendido como héroe se purga.
  const f = join(carpeta, 'aprendido.json');
  writeFileSync(f, JSON.stringify({ version: 1, picks: [[100, 100, 40]], caras: {}, capturas: 3 }));
  eq(leerAprendido(f), null, 'lo aprendido sin guardas (versión 1) se sigue usando');
  writeFileSync(f, JSON.stringify({ version: VERSION_APRENDIDO, picks: null, caras: {}, capturas: 1, aliados: { Estes: [{ v: vaciosAliadoGuardados()[1] }] }, aliadosPendientes: { Gord: [{ v: vaciosAliadoGuardados()[0] }] } }));
  const leido = leerAprendido(f);
  ok(leido?.capturas === 1 && !Object.keys(leido.aliados).length && !Object.keys(leido.aliadosPendientes).length, `lo aprendido no se lee o conserva el icono del hueco vacío: ${JSON.stringify(leido)}`);
});

test('las imágenes pequeñas del final: solo cuentan cuando la pantalla cambia, con paleta, a 160 y 320 px', () => {
  const negra = { ancho: 2400, alto: 1504, rgba: new Uint8Array(2400 * 1504 * 4).fill(0) };
  for (let k = 3; k < negra.rgba.length; k += 4) negra.rgba[k] = 255;
  const clara = { ancho: 2400, alto: 1504, rgba: new Uint8Array(2400 * 1504 * 4).fill(200) };
  const f1 = fotogramaDe(negra, null);
  ok(f1.cambio && f1.miniatura && f1.tira, 'el primer fotograma no trae imágenes');
  const f2 = fotogramaDe(negra, f1.pequena);
  ok(!f2.cambio && !f2.miniatura, 'la misma pantalla cuenta como cambio');
  const f3 = fotogramaDe(clara, f2.pequena);
  ok(f3.cambio && leerPng(Buffer.from(f3.miniatura, 'base64')).ancho === 160 && leerPng(Buffer.from(f3.tira, 'base64')).ancho === 320, 'otra pantalla no trae las dos imágenes a 160 y 320 px');
  ok(diferencia(f1.pequena, f1.pequena) === 0 && diferencia(f1.pequena, f3.pequena) > CAMBIO_MINIMO && diferencia(f1.pequena, null) === 255, 'la diferencia no mide lo que debe');
  const ancho = 2400, alto = 1504, rgba = new Uint8Array(ancho * alto * 4);
  let s = 11; for (let i = 0; i < rgba.length; i += 4) { s = (s * 1103515245 + 12345) >>> 0; rgba[i] = (s >>> 24) ^ (i % 251); rgba[i + 1] = ((i / 4 / ancho) * 0.17) & 255; rgba[i + 2] = (s >>> 8) & 255; rgba[i + 3] = 255; }
  const corto = pngQueQuepa({ ancho, alto, rgba }, { ancho: 320, tope: 2500 });
  ok(corto.length <= 2500 && leerPng(Buffer.from(corto, 'base64')).ancho < 320, `con un tope de 2.500 no reduce: ${corto.length} caracteres`);
  const g = { ancho: 4, alto: 2, rgba: new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]) };
  const r = reducir(g, { ancho: 2 });
  eq(`${r.ancho}x${r.alto} ${r.rgba[0]} ${r.rgba[4]}`, '2x1 127 0', `reducir no promedia: ${Array.from(r.rgba)}`);
  eq(cuantizar({ ancho: 1, alto: 1, rgba: new Uint8Array([100, 100, 100, 255]) }).rgba[0], 102, 'cuantizar no lleva 100 al nivel 2 de 6 (102)');
});

test('la vigilancia vista desde el servidor: captura sola del minuto de empezar al de parar, el resultado con su fotograma e instante, y nada sin vigilar', async () => {
  const rapida = { ...VIGILANCIA, desdeMin: 0, intervaloMs: 15 };
  let capturas = 0, cual = img;
  const capturar = async () => { capturas += 1; return cual; };
  const carpeta = mkdtempSync(join(tmpdir(), 'lector-final-'));
  const primero = await servidor({ capturar, carpeta, vigilancia: rapida });
  const { interno } = primero;
  await new Promise((r) => setTimeout(r, 80));
  eq(capturas, 0, 'captura sin un draft cerrado');
  const vacio = interno.final();
  ok(vacio.desde === null && vacio.activa === false && vacio.fotogramas.length === 0, `sin vigilar, el final no está vacío: ${JSON.stringify(vacio)}`);
  const desde = Date.now() - 60000;
  const v = interno.vigilar(desde);
  ok(v.desde === desde && v.activa === true && v.fotogramas.length === 0 && v.resultado === null, `vigilar no arranca: ${JSON.stringify(v)}`);
  ok(await hasta(() => capturas >= 2), 'no captura por su cuenta');
  let f = interno.final();
  ok(f.fotogramas.length === 1 && /^fotograma-/.test(f.fotogramas[0].id) && f.fotogramas[0].miniatura && f.fotogramas[0].tira && f.fotogramas[0].tabla === false && f.fotogramas[0].resultado === null && f.fotogramas[0].minuto === 1, `la misma pantalla cuenta más de una vez o el fotograma no lleva lo suyo: ${JSON.stringify(f.fotogramas.map((x) => ({ ...x, miniatura: x.miniatura?.length, tira: x.tira?.length })))}`);
  eq(readdirSync(carpeta).filter((n) => n.startsWith('fotograma-')).length, 0, 'guarda en disco pantallas del final que nadie lee');
  cual = tabla;
  ok(await hasta(() => interno.final().resultado === 'perdi'), 'la tabla de la derrota no da el resultado');
  f = interno.final();
  ok(f.fotogramas.length === 2 && f.fotogramas[1].tabla === true && f.resultadoId === f.fotogramas[1].id && Number.isFinite(f.resultadoEn) && f.resultadoEn >= desde, 'el resultado no va con su fotograma e instante');
  eq(interno.vigilar(desde).fotogramas.length, 2, 'repetir el mismo draft borra lo vigilado');
  const nuevo = interno.vigilar(desde + 1000);
  ok(nuevo.desde === desde + 1000 && nuevo.fotogramas.length === 0 && nuevo.resultado === null, 'otro draft no empieza de cero');
  // Antes del minuto de empezar no captura; pasado el de parar, se para.
  await primero.cerrar();
  capturas = 0;
  const tarde = await servidor({ capturar, vigilancia: { ...rapida, desdeMin: 30, inicioDesdeMin: 30 } });
  tarde.interno.vigilar(Date.now());
  await new Promise((r) => setTimeout(r, 120));
  eq(capturas, 0, 'captura antes del minuto de empezar (una captura en una teamfight da un tirón)');
  const tope = await servidor({ capturar, vigilancia: rapida });
  ok(tope.interno.vigilar(Date.now() - (rapida.hastaMin + 1) * 60000).activa === false, 'sigue vigilando pasado el tope');
  tope.interno.vigilar(Date.now() - rapida.hastaMin * 60000 + 150);
  ok(await hasta(() => tope.interno.final().activa === false), 'al llegar al tope no se para');
  await tope.cerrar();
  const n = capturas;
  await new Promise((r) => setTimeout(r, 100));
  eq(capturas, n, 'parada (y con el servidor cerrado), sigue capturando');
});

test('la tabla del resultado entra aunque ya haya pantallas de sobra, también la de VICTORIA sin plantilla', async () => {
  const pantallas = [final('finales/estadisticas.png'), img, tabla];
  let i = 0;
  const { interno } = await servidor({ capturar: async () => pantallas[Math.min(i++, pantallas.length - 1)], resultados: { ...plantillasDeSerie(), perdi: [] }, vigilancia: { ...VIGILANCIA, desdeMin: 0, intervaloMs: 15, maxFotogramas: 2 } });
  interno.vigilar(Date.now() - 60000);
  ok(await hasta(() => interno.final().fotogramas.some((f) => f.tabla)), 'la tabla sin plantilla no entra con el tope lleno');
  const f = interno.final();
  ok(f.fotogramas.length === 2 && f.fotogramas[1].tabla === true && f.fotogramas[1].resultado === null, `no sustituye a la última pantalla que no es tabla: ${JSON.stringify(f.fotogramas.map((x) => [x.id, x.tabla]))}`);
});

test('la vigilancia se queda con las ÚLTIMAS pantallas, no con las primeras de la partida', async () => {
  const A = img, B = final('finales/estadisticas.png'), rango = final('finales/rango-victoria.png');
  const secuencia = [B, A, B, A, B, A, rango];
  let i = 0;
  const { interno } = await servidor({ capturar: async () => secuencia[Math.min(i++, secuencia.length - 1)], vigilancia: { ...VIGILANCIA, desdeMin: 0, intervaloMs: 15, maxFotogramas: 4 } });
  interno.vigilar(Date.now() - 60000);
  ok(await hasta(() => i > secuencia.length + 2, 60000), 'no llega a capturar la pantalla de rango');
  const esperadas = [A, B, A, rango].map((p) => fotogramaDe(p).miniatura);
  ok(await hasta(() => interno.final().fotogramas.at(-1)?.miniatura === esperadas[3], 60000), 'la pantalla del final (rango) no está entre las que se guardan');
  const f = interno.final();
  eq(f.fotogramas.length, 4, 'no se respeta el tope de pantallas');
  ok(f.fotogramas.every((x, k) => x.miniatura === esperadas[k]), 'no se guardan las cuatro ÚLTIMAS pantallas en orden');
});

test('una captura que llega tarde no entra en el final de OTRO draft', async () => {
  let soltar;
  const pendiente = new Promise((r) => { soltar = r; });
  let llamadas = 0;
  const { interno } = await servidor({ capturar: () => { llamadas += 1; return llamadas === 1 ? pendiente : new Promise(() => {}); }, vigilancia: { ...VIGILANCIA, desdeMin: 0, intervaloMs: 15 } });
  interno.vigilar(Date.now() - 60000);
  ok(await hasta(() => llamadas === 1), 'no empieza a capturar');
  const nuevo = Date.now();
  interno.vigilar(nuevo);
  soltar(img);
  await new Promise((r) => setTimeout(r, 1500));
  const f = interno.final();
  ok(f.desde === nuevo && f.fotogramas.length === 0, `la captura del draft anterior entra en el nuevo: ${JSON.stringify({ desde: f.desde === nuevo, n: f.fotogramas.length })}`);
});

test('el final: la tabla con «DEFEAT» da el resultado y deja de capturar; contestar en la APK no cambia las plantillas (fijas)', async () => {
  let cual = img;
  const { puerto, interno } = await servidor({ capturar: async () => cual, vigilancia: { ...VIGILANCIA, desdeMin: 0, intervaloMs: 15 } });
  const desde = Date.now();
  interno.vigilar(desde);
  ok(await hasta(() => interno.final().fotogramas.length >= 1), 'no llega el primer fotograma');
  const [f2] = interno.final().fotogramas;
  ok(f2.tabla === false && f2.resultado === null && interno.final().activa, 'la pantalla del draft pasa por tabla o da resultado');
  cual = tabla;
  ok(await hasta(() => interno.final().fotogramas.length >= 2), 'no llega el fotograma de la tabla');
  const f1 = interno.final().fotogramas[1];
  ok(f1.tabla === true && f1.resultado === 'perdi' && f1.resultadoParecido >= 0.85, 'la tabla de la derrota no viene con su resultado');
  cual = capturaCompleta({ columna: 2 });
  await new Promise((r) => setTimeout(r, 400));
  const fin = interno.final();
  ok(!fin.activa && fin.fotogramas.length === 2 && fin.resultado === 'perdi', 'con el resultado leído sigue capturando');
  // Contestar lo contrario en la APK no toca las plantillas: la tabla siguiente se sigue leyendo como derrota.
  interno.ponerPregunta({ id: `pregunta-${desde}`, desde, cuando: Date.now(), pick: 'Rafaela' });
  eq((await pedirApk(puerto, '/pregunta', { metodo: 'POST', cuerpo: { id: `pregunta-${desde}`, gane: true } })).estado, 200);
  const e = (await pedir(puerto, '/estado')).json;
  ok(e.resultados?.perdi === 2 && e.resultados?.gane === 2, `/estado no dice las plantillas de serie: ${JSON.stringify(e.resultados)}`);
  interno.vigilar(Date.now() + 1);
  cual = tabla;
  ok(await hasta(() => interno.final().fotogramas.some((f) => f.tabla)), 'no llega la tabla de la partida siguiente');
  eq(interno.final().resultado, 'perdi', 'tras contestar «Gané» sobre una derrota, la derrota siguiente se lee como victoria');
});

test('mientras se vigila el final de una partida empezada, ni burbuja ni botón «¿Cómo acabó?»: la grabación los cogía encima de la tabla', async () => {
  const juego = deJuego();
  let pantalla = img, salto = 0;
  const { puerto, interno } = await servidor({ capturar: async () => pantalla, ahora: () => Date.now() + salto, vigilancia: { ...VIGILANCIA, desdeMin: 1, intervaloMs: 15, intervaloInicioMs: 15, rapidoMs: 15 } });
  const consejo = async () => (await pedirApk(puerto, '/consejo')).json;
  interno.ponerConsejo({ titulo: 'Rafaela 55%', detalle: 'x' });
  const desde = Date.now();
  interno.ponerPregunta({ id: `pregunta-${desde - 1}`, desde: desde - 1, cuando: Date.now(), pick: 'Rafaela' });
  interno.vigilar(desde);
  const antes = await consejo();
  ok(antes.consejo?.titulo === 'Rafaela 55%' && antes.pendiente?.pregunta === true, `antes de empezar la partida se esconden: ${JSON.stringify(antes)}`);
  pantalla = juego;
  ok(await hasta(() => interno.final().inicio != null), 'no ve empezar la partida');
  pantalla = img;
  salto = 61000;
  await new Promise((r) => setTimeout(r, 150));
  const alFinal = await consejo();
  ok(interno.final().activa, 'la prueba necesita la vigilancia en marcha');
  ok(alFinal.consejo === null && alFinal.pendiente?.pregunta === false, `vigilando el final, la burbuja o el botón salen: ${JSON.stringify({ consejo: alFinal.consejo, pendiente: alFinal.pendiente })}`);
  pantalla = tabla;
  ok(await hasta(() => !interno.final().activa), 'con la tabla no deja de vigilar');
  const despues = await consejo();
  ok(despues.consejo?.titulo === 'Rafaela 55%' && despues.pendiente?.pregunta === true, `acabada la vigilancia no vuelven: ${JSON.stringify(despues)}`);
});

test('en partida la burbuja se quita: sin consejo tras dos capturas con el minimapa, y vuelve con la primera que no lo tiene', async () => {
  const juego = deJuego();
  let pantalla = img;
  const { puerto, interno } = await servidor({ capturar: async () => pantalla });
  const consejo = async () => (await pedirApk(puerto, '/consejo')).json;
  interno.ponerConsejo({ titulo: 'Rafaela 55%', detalle: 'Fase de picks' });
  await interno.leer();
  eq((await consejo()).consejo?.titulo, 'Rafaela 55%', 'en el draft no da el consejo');
  pantalla = juego;
  for (let i = 1; i < LECTURAS_EN_PARTIDA; i += 1) await interno.leer({ rapida: true });
  eq((await consejo()).consejo?.titulo, 'Rafaela 55%', 'con una sola captura de partida ya la quita (un falso minimapa la haría parpadear)');
  await interno.leer({ rapida: true });
  const enJuego = await consejo();
  ok(enJuego.consejo === null && enJuego.enPartida === true && enJuego.fase === 'partida', `en partida sigue dando el consejo, o no dice por qué: ${JSON.stringify(enJuego)}`);
  pantalla = tabla;
  await interno.leer();
  const despues = await consejo();
  ok(despues.consejo?.titulo === 'Rafaela 55%' && despues.enPartida === false, 'acabada la partida no vuelve el consejo');
});

test('el vistazo al minimapa: con burbuja y nadie capturando quita la burbuja en partida; sin burbuja o con capturas recientes, no captura; y los ajustes del móvil se guardan con su hora', async () => {
  const juego = deJuego('juego-27.png');
  let reloj = 1_000_000, capturas = 0, pantalla = juego;
  const { puerto, interno } = await servidor({ ahora: () => reloj, capturar: async () => { capturas += 1; return pantalla; } });
  eq(await interno.mirarPartida(), null, 'sin burbuja que quitar, captura igual');
  eq(capturas, 0);
  interno.ponerConsejo({ titulo: 'Rafaela 55%' });
  eq((await pedir(puerto, '/ajustes', { metodo: 'POST', cuerpo: { linea: 'roam', rango: 'mythic', idioma: 'en' } })).estado, 200);
  const aj = interno.ajustesDelMovil();
  ok(aj?.linea === 'roam' && aj.rango === 'mythic' && aj.idioma === 'en' && aj.cuando === reloj, `no se queda con los ajustes del móvil: ${JSON.stringify(aj)}`);
  for (let i = 0; i < LECTURAS_EN_PARTIDA; i += 1) {
    ok((await interno.mirarPartida())?.lectura?.partida === true, 'el vistazo no ve la partida');
    eq(await interno.mirarPartida(), null, 'dos vistazos seguidos: captura sin esperar');
    reloj += VISTAZO_MS;
  }
  eq(capturas, LECTURAS_EN_PARTIDA);
  eq((await pedirApk(puerto, '/consejo')).json.consejo, null, 'con los vistazos en partida, la burbuja sigue');
  const lector = interno.estado().lector;
  ok(lector.vistazos === LECTURAS_EN_PARTIDA && lector.lecturas === 0, `un vistazo cuenta como lectura: ${JSON.stringify(lector)}`);
  pantalla = img;
  const fuera = await interno.mirarPartida();
  ok(fuera?.lectura?.partida === false && !('enemigos' in fuera.lectura), 'el vistazo reconoce caras (gasta lo de una lectura entera)');
  eq((await pedirApk(puerto, '/consejo')).json.consejo?.titulo, 'Rafaela 55%', 'fuera de partida el vistazo no devuelve la burbuja');
  eq((await pedir(puerto, '/ajustes', { metodo: 'POST', cuerpo: { linea: '../x' } })).estado, 400, 'unos ajustes sin forma se aceptan');
  eq(interno.ajustesDelMovil()?.linea, 'roam', 'unos ajustes sin forma pisan los buenos');
});

test('¿Cómo acabó?: la APK lee y contesta la pregunta (un navegador no), la respuesta deja de vigilar y el modo solo la recoge una vez', async () => {
  const { puerto, interno } = await servidor({ capturar: async () => tabla, resultados: { ...plantillasDeSerie(), perdi: [] }, vigilancia: { ...VIGILANCIA, desdeMin: 0, intervaloMs: 15 } });
  const apk = async (camino, cuerpo, { navegador = false } = {}) => (navegador ? pedir : pedirApk)(puerto, camino, cuerpo ? { metodo: 'POST', cuerpo } : {});
  const desde = Date.now();
  interno.vigilar(desde);
  ok(await hasta(() => interno.final().acabada), 'la tabla sin palabra conocida no da la partida por acabada');
  eq(interno.final().resultado, null, 'la prueba necesita una tabla SIN palabra conocida');
  eq((await apk('/pregunta')).json.pregunta, null);
  interno.ponerPregunta({ id: `pregunta-${desde}`, desde, cuando: Date.now(), pick: 'Rafaela' });
  eq(JSON.stringify((await apk('/pregunta')).json.pregunta), JSON.stringify({ id: `pregunta-${desde}`, pick: 'Rafaela' }), 'la APK no ve la pregunta');
  eq((await apk('/consejo')).json.pendiente?.pregunta, false, 'vigilando el final, la burbuja ofrece la pregunta encima de la tabla');
  eq((await apk('/pregunta', null, { navegador: true })).estado, 403, 'un navegador lee la pregunta');
  eq((await apk('/pregunta', { id: `pregunta-${desde}`, gane: true }, { navegador: true })).estado, 403, 'un navegador contesta la pregunta');
  eq((await apk('/pregunta', { id: 'pregunta-1', gane: true })).estado, 409, 'contesta otra pregunta');
  eq((await apk('/pregunta', { id: `pregunta-${desde}`, gane: 'si' })).estado, 400, 'acepta un resultado sin forma');
  eq(interno.respuesta(), null, 'una respuesta rechazada llega al modo solo');
  eq((await apk('/pregunta', { id: `pregunta-${desde}`, gane: false })).estado, 200);
  ok(!interno.final().activa, 'contestada, sigue vigilando');
  const respuesta = interno.respuesta();
  ok(respuesta?.desde === desde && respuesta.gane === false, `el modo solo no recibe la respuesta: ${JSON.stringify(respuesta)}`);
  eq(interno.respuesta(), null, 'la respuesta se recoge dos veces');
  eq((await apk('/pregunta')).json.pregunta, null, 'contestada, se sigue preguntando');
  const plantillas = interno.estado().resultados;
  ok(plantillas.gane === 2 && plantillas.perdi === 0, `contestar cambia las plantillas: ${JSON.stringify(plantillas)}`);
  interno.ponerPregunta({ id: `pregunta-${desde + 1}`, desde: desde + 1, cuando: Date.now(), pick: null });
  eq((await apk('/pregunta', { id: `pregunta-${desde + 1}`, gane: null })).estado, 200);
  eq(interno.respuesta()?.gane, null, '«No la terminé» no llega al modo solo');
  eq(sanearPregunta({ id: '../x', desde, cuando: desde }), null);
  eq(sanearPregunta({ id: `pregunta-${desde}`, desde, cuando: desde, pick: '<b>' }).pick, null, 'entra un pick con cualquier cosa');
});

test('las capturas que se miran de un draft: repartidas, con la primera y la última, en su orden y sin repetir', () => {
  const ids = Array.from({ length: 20 }, (_, i) => `lectura-2026-11-04T19-46-${String(i * 3).padStart(2, '0')}-000Z-${300 + i}`);
  const r = capturasAMirar([...ids].reverse());
  eq(r.length, CAPTURAS_A_MIRAR);
  ok(r[0] === ids[0] && r.at(-1) === ids.at(-1), 'no mira la primera y la última');
  ok(r.every((id, i) => i === 0 || id > r[i - 1]), `no van en su orden: ${r}`);
  ok(r.every((id, i) => i === 0 || ids.indexOf(id) - ids.indexOf(r[i - 1]) <= 3), `amontonadas: ${r.map((id) => ids.indexOf(id))}`);
  eq(capturasAMirar(ids.slice(0, 5)).join(), ids.slice(0, 5).join(), 'con pocas no van todas');
  eq(capturasAMirar([ids[1], ids[1], ids[0]]).join(), `${ids[0]},${ids[1]}`, 'repite una');
  eq(capturasAMirar(undefined).length, 0);
});

test('los recortes del draft miran las capturas repartidas, no las últimas', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'lector-recortes-'));
  const ids = Array.from({ length: 12 }, (_, i) => `lectura-2026-11-04T19-46-${String(i * 4).padStart(2, '0')}-000Z-${400 + i}`);
  for (const id of ids) writeFileSync(join(carpeta, `${id}.png`), 'x');
  const pedidas = [];
  const { interno } = await servidor({ carpeta, recortar: async ({ capturas }) => { pedidas.push(capturas.map((c) => c.id)); return []; } });
  await interno.recortesDe(ids);
  eq((pedidas[0] ?? []).join(), capturasAMirar(ids).join(), `recorta las últimas del draft: ${pedidas[0]}`);
});
