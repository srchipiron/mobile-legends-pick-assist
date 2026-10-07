/**
 * El puente entre el lector de Termux y la app (3.25.0,
 * scripts/lector/servir.mjs): una captura de la pantalla del draft entra,
 * salen NOMBRES; solo para la app (y su copia local), nunca la imagen.
 */
import { mkdtempSync, mkdirSync, readdirSync, readFileSync, writeFileSync, existsSync, utimesSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, ok, eq, terminar } from '../arnes.mjs';
import { crearServidor, lectorEnHilos, leerCaptura, capturaAutomatica, origenPermitido, leerAprendido, leerResultados, plantillasDeSerie, podarCapturas, PUERTO, CAPTURAS_A_MIRAR, VIGILANCIA, RETENCION_CAPTURAS_MS, MAX_CAPTURAS } from '../../scripts/lector/servir.mjs';
import { guardarResultados } from '../../scripts/lector/resultado.mjs';
import { VERSION_APRENDIDO } from '../../scripts/lector/aprender.mjs';
import { carasGuardadas } from '../../scripts/lector/leer.mjs';
import { PUERTO_LECTOR, INTERVALO_FINAL_MS, DESDE_FINAL_MIN, HASTA_FINAL_MIN, MAX_FOTOGRAMAS } from '../../src/app/lector.js';
import { capturaCompletaPng, pantallaDeFinal, VERDAD } from '../fixtures/juego/captura.mjs';
import { leerPng } from '../../scripts/lector/png.mjs';
import { miniaturasDe, pngQueQuepa, reducir, cuantizar, fotogramaDe, diferencia, TOPE_BASE64, CAMBIO_MINIMO } from '../../scripts/lector/miniatura.mjs';

const caras = carasGuardadas();
const png = capturaCompletaPng();
const pngTabla = pantallaDeFinal();
const cab = { Origin: 'https://srchipiron.github.io' };
/** Espera (hasta `ms`) a que `cond` sea verdad. */
const hasta = async (cond, ms = 10000) => { const t0 = Date.now(); while (!(await cond()) && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 20)); return cond(); };

test('las lecturas en tres hilos dan exactamente lo mismo que en uno, y si un hilo falla se lee en uno solo (3.39.0)', async () => {
  const unaSola = leerCaptura(png, caras);
  // Sin avisos: si los hilos fallaran, el plan B (leer en uno solo) daría lo mismo y taparía el fallo.
  const avisosBuenos = [];
  const enHilos = lectorEnHilos({ caras, registrar: (l) => avisosBuenos.push(l) });
  try {
    for (const vez of [1, 2]) eq(JSON.stringify(await enHilos.leer(png)), JSON.stringify(unaSola), `la lectura ${vez} en hilos no es la de un hilo`);
    // Lo aprendido de la tablet llega a los hilos: unas posiciones de picks que no leen nada no cambian lo que la medida sí lee.
    const aprendido = { version: VERSION_APRENDIDO, picks: [[100, 100, 40], [100, 300, 40], [100, 500, 40], [100, 700, 40], [100, 900, 40]], caras: {}, capturas: 1 };
    eq(JSON.stringify(await enHilos.leer(png, aprendido)), JSON.stringify(leerCaptura(png, caras, aprendido)), 'con lo aprendido, los hilos y uno solo leen distinto');
    eq(avisosBuenos.join(' | '), '', 'los hilos fallaron y se leyó en uno solo');
  } finally { enHilos.cerrar(); }
  const avisos = [];
  const roto = lectorEnHilos({ caras, registrar: (l) => avisos.push(l), tarea: new URL('file:///no-existe/lectura-tarea.mjs') });
  try {
    eq(JSON.stringify(await roto.leer(png)), JSON.stringify(unaSola), 'con los hilos rotos no se lee en uno solo');
    ok(avisos.some((l) => /hilos de lectura fallaron/.test(l)), `no dice que los hilos fallaron: ${avisos}`);
  } finally { roto.cerrar(); }
});

async function conServidor(opciones, fn) {
  const servidor = crearServidor({ caras, ...opciones });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  try { return await fn(base); } finally { servidor.close(); }
}

test('las capturas se borran solas: las de hace más de unas horas y las que pasan del tope por tipo, y nada más (3.34.0)', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'lector-poda-'));
  const t0 = Date.parse('2026-10-02T10:00:00Z');
  const fecha = (ms) => new Date(ms).toISOString().replace(/[:.]/g, '-');
  const escribir = (nombre, hace) => { writeFileSync(join(carpeta, nombre), 'x'); utimesSync(join(carpeta, nombre), new Date(t0 - hace), new Date(t0 - hace)); };
  // Una vieja (con su json y su verdad), una reciente, un fotograma viejo y ficheros ajenos.
  const vieja = `lectura-${fecha(t0 - RETENCION_CAPTURAS_MS - 60000)}-1`, reciente = `lectura-${fecha(t0 - 60000)}-2`;
  for (const ext of ['png', 'json', 'verdad.json']) escribir(`${vieja}.${ext}`, RETENCION_CAPTURAS_MS + 60000);
  escribir(`${reciente}.png`, 60000);
  escribir(`fotograma-${fecha(t0 - RETENCION_CAPTURAS_MS - 1000)}.png`, RETENCION_CAPTURAS_MS + 1000);
  escribir('otra-cosa.png', RETENCION_CAPTURAS_MS * 10); escribir('aprendido.json', RETENCION_CAPTURAS_MS * 10);
  eq(podarCapturas(carpeta, { ahora: t0 }), 4, 'no borra justo las viejas (lectura con sus dos ficheros y el fotograma)');
  eq(readdirSync(carpeta).sort().join(), ['aprendido.json', 'otra-cosa.png', `${reciente}.png`].sort().join(), `borra lo que no debe o deja lo viejo: ${readdirSync(carpeta)}`);
  // El tope por tipo: con más lecturas de las que caben, se van las más viejas aunque sean de hace un minuto.
  for (let i = 0; i < MAX_CAPTURAS.lectura + 5; i++) escribir(`lectura-${fecha(t0 - 30000 + i * 10)}-${i + 3}.png`, 30000 - i * 10);
  podarCapturas(carpeta, { ahora: t0 });
  const lecturas = readdirSync(carpeta).filter((n) => n.startsWith('lectura-')).sort();
  eq(lecturas.length, MAX_CAPTURAS.lectura, `no respeta el tope de lecturas: ${lecturas.length}`);
  ok(!lecturas.includes(`${reciente}.png`) && lecturas[lecturas.length - 1].endsWith(`-${MAX_CAPTURAS.lectura + 7}.png`), 'con el tope no se van las más viejas');
  eq(readdirSync(carpeta).filter((n) => !n.startsWith('lectura-')).sort().join(), 'aprendido.json,otra-cosa.png', 'el tope toca ficheros ajenos');
  // Y el servidor poda al guardar cada captura.
  escribir(`fotograma-${fecha(t0 - RETENCION_CAPTURAS_MS * 2)}.png`, RETENCION_CAPTURAS_MS * 2);
  await conServidor({ capturar: () => png, carpeta }, async (base) => {
    await (await fetch(`${base}/leer`)).json();
    ok(!readdirSync(carpeta).some((n) => n.startsWith('fotograma-')), 'al guardar una lectura no borra el fotograma viejo');
    ok(readdirSync(carpeta).some((n) => /^lectura-.*\.png$/.test(n) && !lecturas.includes(n)), 'la lectura nueva no se guarda');
  });
});

test('el puerto del lector es el que pide la app', () => {
  eq(PUERTO, PUERTO_LECTOR, 'servir.mjs escucha en un puerto y la app llama a otro');
});

test('solo la app publicada y su copia local pueden pedir lecturas', () => {
  ok(origenPermitido('https://srchipiron.github.io'), 'la app publicada no puede pedir');
  ok(origenPermitido('http://127.0.0.1:5173') && origenPermitido('http://localhost:4173'), 'la copia local no puede pedir');
  for (const o of ['https://evil.example', 'http://192.168.1.20:8000', 'https://srchipiron.github.io.evil.example', 'null']) ok(!origenPermitido(o), `${o} puede pedir lecturas`);
});

test('una lectura devuelve los nombres de la captura, con la cabecera para la app', async () => {
  await conServidor({ capturar: () => png }, async (base) => {
    const r = await fetch(`${base}/leer`, { headers: { Origin: 'https://srchipiron.github.io' } });
    eq(r.status, 200, 'la lectura no responde 200');
    eq(r.headers.get('access-control-allow-origin'), 'https://srchipiron.github.io', 'sin la cabecera CORS la app no puede leer la respuesta');
    const l = await r.json();
    eq(l.tuyos.map((x) => x.nombre).join(), VERDAD.tuyos.join(), 'los baneos de tu equipo no salen');
    eq(l.suyos.map((x) => x.nombre).join(), VERDAD.suyos.join(), 'los baneos del enemigo no salen');
    eq(l.enemigos.map((x) => x.nombre ?? '?').join(), 'Clint,Khufra,?,?,?', 'los picks enemigos no salen');
    eq(l.aliados.map((x) => x.nombre ?? '?').join(), VERDAD.aliados.join(), `tu equipo no sale: ${l.aliados.map((x) => x.nombre)}`);
    ok(l.tuyoFila === VERDAD.tuyoFila && l.tuyo === VERDAD.tuyo, `tu fila no sale: ${l.tuyoFila} ${l.tuyo}`);
    ok(!JSON.stringify(l).includes('rgba') && JSON.stringify(l).length < 4000, 'la respuesta lleva la imagen o algo más que nombres');
  });
});

test('otra web no recibe nada, la comprobación previa se contesta y un fallo de captura se dice', async () => {
  await conServidor({ capturar: () => png }, async (base) => {
    const ajena = await fetch(`${base}/leer`, { headers: { Origin: 'https://evil.example' } });
    eq(ajena.status, 403, 'una web ajena recibe la lectura');
    eq(ajena.headers.get('access-control-allow-origin'), null, 'una web ajena recibe la cabecera CORS');
    const previa = await fetch(`${base}/leer`, { method: 'OPTIONS', headers: { Origin: 'https://srchipiron.github.io' } });
    eq(previa.status, 204, 'la comprobación previa no se contesta');
    eq(previa.headers.get('access-control-allow-private-network'), 'true', 'la comprobación previa de red privada no se contesta');
    const estado = await (await fetch(`${base}/estado`)).json();
    ok(estado.ok, '/estado no dice que está vivo');
  });
  await conServidor({ capturar: () => { throw new Error('adb: device offline'); } }, async (base) => {
    const r = await fetch(`${base}/leer`, { headers: { Origin: 'https://srchipiron.github.io' } });
    eq(r.status, 502, 'un fallo de captura no responde 502');
    eq((await r.json()).error, 'captura', 'un fallo de captura no se distingue');
  });
});

test('la captura automática busca la tablet sola, la recuerda y la vuelve a buscar si deja de contestar', async () => {
  const puertos = [40000, 41111];
  let busquedas = 0, capturas = [];
  const encontrar = async () => ({ ip: '10.0.0.5', puerto: puertos[busquedas++], via: 'wifi' });
  const memoria = {}, recordadas = [];
  const capturar = (d) => { capturas.push(d); if (d === '10.0.0.5:40000' && capturas.length > 1) throw new Error('device offline'); return png; };
  const auto = capturaAutomatica({ memoria, recordar: (m) => recordadas.push({ ...m }), encontrar, capturar });
  ok(Buffer.isBuffer(await auto()), 'la primera captura no sale');
  eq(`${busquedas} ${capturas.join(' ')}`, '1 10.0.0.5:40000', 'no busca la tablet la primera vez o captura de otra');
  eq(`${memoria.ip}:${memoria.puerto}`, '10.0.0.5:40000', 'no recuerda la tablet encontrada');
  eq(recordadas.length, 1, 'no guarda la memoria');
  // El puerto ha cambiado: la captura falla, se busca otra vez y sale con la nueva.
  ok(Buffer.isBuffer(await auto()), 'tras cambiar el puerto no vuelve a salir');
  eq(`${busquedas} ${capturas.slice(1).join(' ')}`, '2 10.0.0.5:40000 10.0.0.5:41111', 'al fallar la captura no busca la tablet otra vez');
  eq(memoria.puerto, 41111, 'no recuerda el puerto nuevo');
  // Con la tablet fijada a mano no se busca nada, y un fallo es un fallo.
  const fija = capturaAutomatica({ fija: '10.0.0.9:1', encontrar: async () => { throw new Error('no debía buscar'); }, capturar: () => { throw new Error('device offline'); } });
  const e = await fija().catch((x) => x);
  eq(e.message, 'device offline', `con --tablet fija hace otra cosa: ${e.message}`);
  // Y la fijada que SÍ funciona se recuerda (una vez) para el siguiente arranque sin --tablet (3.33.1).
  const memoriaFija = { ip: '10.0.0.1', puerto: 5 }, recordadasFija = [];
  const fijaBuena = capturaAutomatica({ fija: '10.0.0.9:2', memoria: memoriaFija, recordar: (m) => recordadasFija.push({ ...m }), encontrar: async () => { throw new Error('no debía buscar'); }, capturar: () => png });
  await fijaBuena(); await fijaBuena();
  eq(`${memoriaFija.ip}:${memoriaFija.puerto} ${recordadasFija.length}`, '10.0.0.9:2 1', 'la tablet fijada que funciona no se recuerda (o se guarda en cada captura)');
  // `preparar()` la busca al arrancar y el primer toque no espera a nada.
  let buscadaAntes = 0;
  const caliente = capturaAutomatica({ encontrar: async () => { buscadaAntes += 1; return { ip: '10.0.0.5', puerto: 1, via: 'memoria' }; }, capturar: () => png });
  caliente.preparar();
  await caliente();
  eq(buscadaAntes, 1, `preparar() y el primer toque buscan ${buscadaAntes} veces (una sola búsqueda compartida)`);
});

test('un hueco sin reconocer dice en Termux a qué se quedó más cerca', async () => {
  const lineas = [];
  await conServidor({ capturar: () => capturaCompletaPng({ conPicks: false }), registrar: (m) => lineas.push(m) }, async (base) => {
    await fetch(`${base}/leer`, { headers: { Origin: 'https://srchipiron.github.io' } });
  });
  const linea = lineas.find((l) => /^Lectura 1/.test(l)) ?? '';
  ok(/enemigos \?\([A-Za-z.' -]+ 0\.\d\d\)/.test(linea), `la línea de Termux no dice el candidato y el parecido de un «?»: ${linea}`);
});

test('una corrección no escribe fuera de la carpeta de capturas, ni con un id que sale de ella ni con uno que se alarga (3.43.1)', async () => {
  // La carpeta va DENTRO de otra, y fuera hay un PNG con nombre de captura:
  // sin el ^ de la expresión, «../lectura-fuera» le escribía la verdad al
  // lado; sin el $, «lectura-1/../../lectura-fuera» también.
  const raiz = mkdtempSync(join(tmpdir(), 'lector-fuera-'));
  const carpeta = join(raiz, 'capturas');
  mkdirSync(carpeta);
  writeFileSync(join(raiz, 'lectura-fuera.png'), 'x');
  mkdirSync(join(carpeta, 'lectura-1'));
  let aprendio = false;
  await conServidor({ capturar: () => png, carpeta, aprender: async () => { aprendio = true; return { aprendido: null, informe: [] }; }, guardar: () => {} }, async (base) => {
    const r = await fetch(`${base}/corregir`, { method: 'POST', headers: { Origin: 'https://srchipiron.github.io', 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ['../lectura-fuera', 'lectura-1/../../lectura-fuera', 'lectura-../../lectura-fuera'], enemigos: ['Clint'] }) });
    eq(r.status, 200, 'la corrección con ids malos no contesta');
  });
  eq(readdirSync(raiz).filter((f) => f.endsWith('.verdad.json')).join(), '', `escribe fuera de la carpeta de capturas: ${readdirSync(raiz)}`);
  ok(!aprendio, 'aprende de una captura de fuera de la carpeta');
});

test('la app distingue «no veo la tablet» y «falta emparejar» de un fallo de captura', async () => {
  for (const tipo of ['tablet', 'emparejar']) {
    await conServidor({ capturar: async () => { throw Object.assign(new Error(tipo), { tipo }); } }, async (base) => {
      const r = await fetch(`${base}/leer`, { headers: { Origin: 'https://srchipiron.github.io' } });
      eq(`${r.status} ${(await r.json()).error}`, `502 ${tipo}`, `un fallo «${tipo}» no llega a la app como tal`);
    });
  }
});

test('una corrección de la app guarda la verdad junto a la captura, aprende de las últimas y lo aprendido entra en la siguiente lectura sin tapar la geometría medida', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'lector-aprende-'));
  const tandas = [], guardadas = [];
  // El aprendizaje de pega: devuelve unos huecos imposibles (fuera de la columna), para ver que la lectura siguiente los usa.
  const aprender = async ({ pares, aprendido }) => { tandas.push({ pares, aprendido }); return { aprendido: { version: VERSION_APRENDIDO, picks: [[100, 100, 40], [100, 300, 40], [100, 500, 40], [100, 700, 40], [100, 900, 40]], caras: {}, capturas: (aprendido?.capturas ?? 0) + pares.length }, informe: [{ id: pares[0].id, aprendidos: [{ nombre: 'Clint', hueco: 0, parecido: 0.9, pos: [1, 2, 3] }], sinEncontrar: [], yaLeidos: [] }] }; };
  await conServidor({ capturar: () => png, carpeta, aprender, guardar: (a) => guardadas.push(a) }, async (base) => {
    const cab = { Origin: 'https://srchipiron.github.io' };
    const ids = [];
    for (let i = 0; i < CAPTURAS_A_MIRAR + 2; i++) { const l = await (await fetch(`${base}/leer`, { headers: cab })).json(); ids.push(l.id); }
    ok(ids.every((id) => /^lectura-/.test(id)) && new Set(ids).size === ids.length, `las lecturas no llevan id propio: ${ids}`);
    eq((await (await fetch(`${base}/leer`, { headers: cab })).json()).enemigos[0].nombre, 'Clint', 'antes de aprender no lee a Clint');
    // Sin origen (no es la app) no se escribe nada.
    const ajena = await fetch(`${base}/corregir`, { method: 'POST', body: JSON.stringify({ ids, enemigos: ['Clint'] }) });
    eq(ajena.status, 403, 'una corrección sin origen se acepta');
    const r = await (await fetch(`${base}/corregir`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [...ids, 'lectura-que-no-existe', '../../etc'], enemigos: ['Clint', 'Khufra'], baneos: ['Hirara'] }) })).json();
    ok(r.aprendido && r.aprendidos.join() === 'Clint', `la corrección no aprende: ${JSON.stringify(r)}`);
    const ficheros = readdirSync(carpeta);
    eq(ficheros.filter((f) => f.endsWith('.verdad.json')).length, ids.length, `la verdad no se guarda junto a cada captura: ${ficheros}`);
    const verdad = JSON.parse(readFileSync(join(carpeta, `${ids[0]}.verdad.json`), 'utf8'));
    eq(verdad.enemigos.join(), 'Clint,Khufra', 'la verdad guardada no lleva los enemigos');
    eq(tandas.length, 1, 'no aprende una vez por corrección');
    eq(tandas[0].pares.length, CAPTURAS_A_MIRAR, `mira ${tandas[0].pares.length} capturas y no las ${CAPTURAS_A_MIRAR} últimas`);
    eq(tandas[0].pares.map((p) => p.id).join(), ids.slice(-CAPTURAS_A_MIRAR).join(), 'no mira las ÚLTIMAS capturas');
    ok(tandas[0].pares.every((p) => p.verdad.baneos?.join() === 'Hirara'), 'la verdad que llega al aprendizaje no lleva los baneos (sin ellos no se distingue la pantalla del draft)');
    eq(guardadas.length, 1, 'lo aprendido no se guarda en disco');
    // Con unos huecos aprendidos de pega (fuera de la columna) la lectura siguiente sigue viendo a Clint: la geometría medida manda (3.30.1).
    const despues = await (await fetch(`${base}/leer`, { headers: cab })).json();
    eq(despues.enemigos[0].nombre, 'Clint', `unos huecos aprendidos equivocados tapan la geometría medida: ${despues.enemigos.map((e) => e.nombre)}`);
    const estado = await (await fetch(`${base}/estado`)).json();
    eq(estado.aprendido.capturas, CAPTURAS_A_MIRAR, '/estado no dice de cuántas capturas ha aprendido');
    // La segunda corrección acumula sobre lo aprendido.
    await fetch(`${base}/corregir`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: ids.slice(0, 1), enemigos: ['Clint'] }) });
    eq(tandas[1].aprendido.capturas, CAPTURAS_A_MIRAR, 'la segunda tanda no parte de lo aprendido en la primera');
  });
  // Lo aprendido con la versión 1 (3.27.0–3.30.0, sin guardas) se descarta al arrancar; lo de la versión actual se lee.
  const f = join(carpeta, 'aprendido.json');
  writeFileSync(f, JSON.stringify({ version: 1, picks: [[100, 100, 40]], caras: {}, capturas: 3 }));
  eq(leerAprendido(f), null, 'lo aprendido sin guardas (versión 1) se sigue usando');
  writeFileSync(f, JSON.stringify({ version: VERSION_APRENDIDO, picks: null, caras: {}, capturas: 1 }));
  eq(leerAprendido(f)?.capturas, 1, 'lo aprendido de la versión actual no se lee');
});

test('las imágenes reducidas: dos PNG pequeños con paleta que caben en una incidencia; y /captura ya no existe', async () => {
  const colores = (img) => new Set(Array.from({ length: img.ancho * img.alto }, (_, i) => img.rgba.subarray(i * 4, i * 4 + 3).join())).size;
  // Una pantalla «de foto» (ruido con degradado): el peor caso para comprimir.
  const ancho = 2400, alto = 1504, rgba = new Uint8Array(ancho * alto * 4);
  let s = 11; for (let i = 0; i < rgba.length; i += 4) { s = (s * 1103515245 + 12345) >>> 0; rgba[i] = (s >>> 24) ^ (i % 251); rgba[i + 1] = ((i / 4 / ancho) * 0.17) & 255; rgba[i + 2] = (s >>> 8) & 255; rgba[i + 3] = 255; }
  const m = miniaturasDe({ ancho, alto, rgba });
  for (const [nombre, b64, anchoMax] of [['miniatura', m.miniatura, 320], ['tira', m.tira, 640]]) {
    ok(b64.length <= TOPE_BASE64, `${nombre} no cabe: ${b64.length} caracteres`);
    const img = leerPng(Buffer.from(b64, 'base64'));
    ok(img.ancho <= anchoMax && img.ancho >= 40, `${nombre} mide ${img.ancho} px de ancho`);
    ok(colores(img) <= 256, `${nombre} tiene más de 256 colores`);
  }
  ok(leerPng(Buffer.from(m.tira, 'base64')).alto < leerPng(Buffer.from(m.miniatura, 'base64')).alto, 'la tira no es la franja de arriba (a 640 px entera sería el doble de alta que la miniatura)');
  // Si no cabe en el tope, se reduce el ancho a la mitad hasta que quepa.
  const corto = pngQueQuepa({ ancho, alto, rgba }, { ancho: 320, tope: 2500 });
  ok(corto.length <= 2500 && leerPng(Buffer.from(corto, 'base64')).ancho < 320, `con un tope de 2.500 no reduce: ${corto.length} caracteres`);
  // Reducir promedia (un cuadro blanco sobre negro sale gris en la mitad) y cuantizar deja 6 niveles de rojo.
  const g = { ancho: 4, alto: 2, rgba: new Uint8Array([255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255, 255, 255, 255, 255, 0, 0, 0, 255, 0, 0, 0, 255, 0, 0, 0, 255]) };
  const r = reducir(g, { ancho: 2 });
  eq(`${r.ancho}x${r.alto} ${r.rgba[0]} ${r.rgba[4]}`, '2x1 127 0', `reducir no promedia: ${Array.from(r.rgba)}`);
  const q = cuantizar({ ancho: 1, alto: 1, rgba: new Uint8Array([100, 100, 100, 255]) });
  eq(q.rgba[0], 102, `cuantizar no lleva 100 al nivel 2 de 6 (102): ${q.rgba[0]}`);
  // La ruta `/captura` ya no existe (3.40.0): daba una pantalla de la tablet a quien pusiera la cabecera `Origin`.
  let capturas = 0;
  await conServidor({ capturar: () => { capturas += 1; return png; } }, async (base) => {
    eq((await fetch(`${base}/captura`, { headers: { Origin: 'https://srchipiron.github.io' } })).status, 404, '/captura sigue dando una pantalla de la tablet');
    eq(capturas, 0, 'pedir /captura hace una captura de la tablet');
  });
});

test('el lector solo contesta a peticiones dirigidas a 127.0.0.1 o localhost (contra DNS rebinding, 3.40.0)', async () => {
  const { request } = await import('node:http');
  const pedirCon = (puerto, host, camino = '/estado') => new Promise((r, x) => {
    const q = request({ host: '127.0.0.1', port: puerto, path: camino, headers: { Host: host } }, (res) => { res.resume(); r(res.statusCode); });
    q.on('error', x); q.end();
  });
  let capturas = 0;
  await conServidor({ capturar: () => { capturas += 1; return png; } }, async (base) => {
    const puerto = new URL(base).port;
    eq(await pedirCon(puerto, `127.0.0.1:${puerto}`), 200, 'con Host 127.0.0.1 no contesta');
    eq(await pedirCon(puerto, `localhost:${puerto}`), 200, 'con Host localhost no contesta');
    eq(await pedirCon(puerto, 'atacante.example'), 403, 'contesta a una web con otro dominio que apunta a 127.0.0.1');
    eq(await pedirCon(puerto, 'atacante.example', '/leer'), 403, '/leer contesta con otro Host');
    // Un dominio que EMPIEZA o ACABA como uno local sigue siendo del atacante.
    for (const h of ['localhost.atacante.example', '127.0.0.1.atacante.example', 'x127.0.0.1', 'malolocalhost:47323']) {
      eq(await pedirCon(puerto, h), 403, `contesta con Host ${h}`);
    }
    eq(capturas, 0, 'con otro Host se hace la captura igualmente');
  });
});

test('la vigilancia del final (3.33.0): mismos plazos que la app, y el lector captura por su cuenta del minuto de empezar al de parar', async () => {
  eq(`${VIGILANCIA.desdeMin} ${VIGILANCIA.hastaMin} ${VIGILANCIA.intervaloMs} ${VIGILANCIA.maxFotogramas}`, `${DESDE_FINAL_MIN} ${HASTA_FINAL_MIN} ${INTERVALO_FINAL_MS} ${MAX_FOTOGRAMAS}`, 'el lector y la app no vigilan con los mismos números');
  const rapida = { ...VIGILANCIA, desdeMin: 0, intervaloMs: 15 };
  let capturas = 0, cual = png;
  const capturar = () => { capturas += 1; return cual; };
  const carpeta = mkdtempSync(join(tmpdir(), 'lector-final-'));
  await conServidor({ capturar, carpeta, vigilancia: rapida }, async (base) => {
    // Sin avisar, no vigila nada; sin origen no se acepta el aviso; y un instante absurdo tampoco.
    await new Promise((r) => setTimeout(r, 80));
    eq(capturas, 0, 'captura sin que la app avise');
    eq((await fetch(`${base}/vigilar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desde: Date.now() }) })).status, 403, 'un aviso sin origen se acepta');
    eq((await fetch(`${base}/final`)).status, 403, 'lo vigilado se da sin origen');
    eq((await fetch(`${base}/vigilar`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ desde: 'ayer' }) })).status, 400, 'un instante que no es número se acepta');
    eq((await fetch(`${base}/vigilar`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ desde: Date.now() + 3600000 }) })).status, 400, 'un instante futuro se acepta');
    const vacio = await (await fetch(`${base}/final`, { headers: cab })).json();
    ok(vacio.desde === null && vacio.activa === false && vacio.fotogramas.length === 0, `sin aviso /final no está vacío: ${JSON.stringify(vacio)}`);
    // El aviso: desde entonces captura sola, y se queda con las pantallas que cambian.
    const desde = Date.now() - 60000;
    const v = await (await fetch(`${base}/vigilar`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ desde }) })).json();
    ok(v.desde === desde && v.activa === true && v.fotogramas.length === 0 && v.resultado === null, `el aviso no arranca la vigilancia: ${JSON.stringify(v)}`);
    // Cada captura se decodifica entera (~1 s aquí): dos seguidas prueban que el bucle sigue solo.
    ok(await hasta(() => capturas >= 2), 'el lector no captura por su cuenta tras el aviso');
    let f = await (await fetch(`${base}/final`, { headers: cab })).json();
    ok(f.fotogramas.length === 1 && /^fotograma-/.test(f.fotogramas[0].id) && f.fotogramas[0].miniatura && f.fotogramas[0].tira && f.fotogramas[0].tabla === false && f.fotogramas[0].resultado === null && f.fotogramas[0].minuto === 1, `la misma pantalla cuenta más de una vez o el fotograma no lleva lo suyo: ${JSON.stringify(f.fotogramas.map((x) => ({ ...x, miniatura: x.miniatura?.length, tira: x.tira?.length })))}`);
    ok(existsSync(join(carpeta, `${f.fotogramas[0].id}.png`)), 'la captura entera no se guarda en la carpeta');
    // La tabla de resultado: segundo fotograma, con el resultado y cuándo se vio.
    cual = pngTabla;
    ok(await hasta(async () => (await (await fetch(`${base}/final`, { headers: cab })).json()).resultado === 'perdi'), 'la tabla de la derrota no da el resultado');
    f = await (await fetch(`${base}/final`, { headers: cab })).json();
    ok(f.fotogramas.length === 2 && f.fotogramas[1].tabla === true && f.fotogramas[1].resultado === 'perdi' && f.resultadoId === f.fotogramas[1].id && Number.isFinite(f.resultadoEn) && f.resultadoEn >= desde, `el resultado no va con su fotograma e instante: ${JSON.stringify({ ...f, fotogramas: f.fotogramas.map((x) => x.id) })}`);
    // El mismo aviso otra vez (la app vuelve a la vista) no reinicia nada; otro draft, sí.
    const otra = await (await fetch(`${base}/vigilar`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ desde }) })).json();
    eq(otra.fotogramas.length, 2, 'repetir el aviso del mismo draft borra lo vigilado');
    const nuevo = await (await fetch(`${base}/vigilar`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ desde: desde + 1000 }) })).json();
    ok(nuevo.desde === desde + 1000 && nuevo.fotogramas.length === 0 && nuevo.resultado === null, 'otro draft no empieza de cero');
  });
  // Antes del minuto de empezar no captura, y pasado el de parar se para (y cerrar el servidor también).
  // (La búsqueda del inicio de la partida captura desde el minuto 0 a propósito, 3.45.1: aquí se aparta.)
  capturas = 0;
  await conServidor({ capturar, vigilancia: { ...rapida, desdeMin: 30, inicioDesdeMin: 30 } }, async (base) => {
    await fetch(`${base}/vigilar`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ desde: Date.now() }) });
    await new Promise((r) => setTimeout(r, 120));
    eq(capturas, 0, 'captura antes del minuto de empezar (una captura en una teamfight da un tirón)');
  });
  await conServidor({ capturar, vigilancia: rapida }, async (base) => {
    const tarde = await (await fetch(`${base}/vigilar`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ desde: Date.now() - (rapida.hastaMin + 1) * 60000 }) })).json();
    await new Promise((r) => setTimeout(r, 120));
    ok(tarde.activa === false && capturas === 0, `sigue vigilando pasado el tope: activa ${tarde.activa}, ${capturas} capturas`);
    const desde = Date.now() - rapida.hastaMin * 60000 + 150;
    await fetch(`${base}/vigilar`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ desde }) });
    ok(await hasta(async () => (await (await fetch(`${base}/final`, { headers: cab })).json()).activa === false), 'al llegar al tope no se para');
    const n = capturas;
    await new Promise((r) => setTimeout(r, 100));
    eq(capturas, n, 'parada, sigue capturando');
  });
  const n = capturas;
  await new Promise((r) => setTimeout(r, 100));
  eq(capturas, n, 'con el servidor cerrado sigue capturando');
});

test('los fotogramas del final de partida: solo cuentan cuando la pantalla cambia', async () => {
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
});

test('la tabla del resultado entra aunque ya haya pantallas de sobra, también la de VICTORIA sin plantilla, y no se poda (3.37.0)', async () => {
  // Dos pantallas de partida llenan el tope; luego la tabla. Sin plantillas
  // (como la victoria de serie) la palabra no se reconoce, pero es la tabla.
  // (Pantallas que el lector ve distintas entre sí: la de estadísticas, la del draft y la tabla.)
  const pantallas = [pantallaDeFinal('finales/estadisticas.png'), png, pngTabla];
  let i = 0;
  const capturar = () => pantallas[Math.min(i++, pantallas.length - 1)];
  const carpeta = mkdtempSync(join(tmpdir(), 'lector-tabla-'));
  // La cabecera de tabla se conoce (la de serie) pero no hay plantilla de ninguna palabra: «tabla» sin resultado, como una victoria.
  await conServidor({ capturar, carpeta, resultados: { ...plantillasDeSerie(), perdi: [] }, maximos: { ...MAX_CAPTURAS, fotograma: 0 }, vigilancia: { ...VIGILANCIA, desdeMin: 0, intervaloMs: 15, maxFotogramas: 2 } }, async (base) => {
    await fetch(`${base}/vigilar`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ desde: Date.now() - 60000 }) });
    ok(await hasta(async () => (await (await fetch(`${base}/final`, { headers: cab })).json()).fotogramas.some((f) => f.tabla)), 'la tabla sin plantilla no entra con el tope lleno');
    const f = await (await fetch(`${base}/final`, { headers: cab })).json();
    ok(f.fotogramas.length === 2 && f.fotogramas[1].tabla === true && f.fotogramas[1].resultado === null, `no sustituye a la última pantalla que no es tabla: ${JSON.stringify(f.fotogramas.map((x) => [x.id, x.tabla]))}`);
    // Con el tope de capturas a cero, lo que /final enseña sigue en la carpeta (la del draft, no).
    ok(f.fotogramas.every((x) => existsSync(join(carpeta, `${x.id}.png`))), 'se podan las capturas que la vigilancia aún enseña');
    eq(readdirSync(carpeta).filter((n) => n.startsWith('fotograma-')).length, 2, `la poda no quita la pantalla que ya no se enseña: ${readdirSync(carpeta)}`);
  });
});

test('la vigilancia se queda con las ÚLTIMAS pantallas, no con las primeras de la partida (3.40.0)', async () => {
  // Seis pantallas «de juego» alternando (todas cambian respecto a la
  // anterior) y después la de rango. Con tope 4 tienen que quedar las
  // CUATRO ÚLTIMAS, en orden: sacar la más nueva en vez de la más vieja
  // guardaba las tres primeras más la última (lo cazó la mutación).
  const A = png, B = pantallaDeFinal('finales/estadisticas.png');
  const rango = pantallaDeFinal('finales/rango-victoria.png');
  const secuencia = [B, A, B, A, B, A, rango];
  let i = 0;
  const capturar = () => secuencia[Math.min(i++, secuencia.length - 1)];
  await conServidor({ capturar, vigilancia: { ...VIGILANCIA, desdeMin: 0, intervaloMs: 15, maxFotogramas: 4 } }, async (base) => {
    await fetch(`${base}/vigilar`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ desde: Date.now() - 60000 }) });
    ok(await hasta(() => i > secuencia.length + 2), 'no llega a capturar la pantalla de rango');
    const mini = (p) => fotogramaDe(leerPng(p)).miniatura;
    const esperadas = [A, B, A, rango].map(mini);
    // Lo capturado se procesa después: se espera a que llegue la última.
    let f = null;
    ok(await hasta(async () => { f = await (await fetch(`${base}/final`, { headers: cab })).json(); return f.fotogramas.at(-1)?.miniatura === esperadas[3]; }), 'la pantalla del final (rango) no está entre las que se guardan');
    eq(f.fotogramas.length, 4, 'no se respeta el tope de pantallas');
    ok(f.fotogramas.every((x, k) => x.miniatura === esperadas[k]), 'no se guardan las cuatro ÚLTIMAS pantallas en orden (hasta 3.39.0 las cuatro primeras: la del final no entraba)');
  });
});

test('una captura que llega tarde no entra en el final de OTRO draft (3.37.0)', async () => {
  // La primera captura tarda (la tablet se estaba buscando); mientras, la app avisa de un draft nuevo.
  let soltar;
  const pendiente = new Promise((r) => { soltar = r; });
  let llamadas = 0;
  const capturar = () => { llamadas += 1; return llamadas === 1 ? pendiente : new Promise(() => {}); };
  await conServidor({ capturar, vigilancia: { ...VIGILANCIA, desdeMin: 0, intervaloMs: 15 } }, async (base) => {
    const vigilar = (desde) => fetch(`${base}/vigilar`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ desde }) });
    await vigilar(Date.now() - 60000);
    ok(await hasta(() => llamadas === 1), 'no empieza a capturar');
    const nuevo = Date.now();
    await vigilar(nuevo);
    soltar(png);
    await new Promise((r) => setTimeout(r, 1500));
    const f = await (await fetch(`${base}/final`, { headers: cab })).json();
    ok(f.desde === nuevo && f.fotogramas.length === 0, `la captura del draft anterior entra en el nuevo: ${JSON.stringify({ desde: f.desde === nuevo, n: f.fotogramas.length })}`);
  });
});

test('el final de partida: la tabla con «DEFEAT» viene con el resultado, lo contestado se aprende, y sin origen nada (3.32.0)', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'lector-resultado-'));
  const guardados = [];
  let cual = png;
  await conServidor({ capturar: () => cual, carpeta, guardarResultadosDe: (r) => guardados.push(r), vigilancia: { ...VIGILANCIA, desdeMin: 0, intervaloMs: 15 } }, async (base) => {
    const leerFinal = async () => (await fetch(`${base}/final`, { headers: cab })).json();
    await fetch(`${base}/vigilar`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ desde: Date.now() }) });
    // Una pantalla que no es la tabla (la del draft): entra, pero ni tabla ni resultado.
    ok(await hasta(async () => (await leerFinal()).fotogramas.length >= 1), 'no llega el primer fotograma');
    const [f2] = (await leerFinal()).fotogramas;
    ok(f2.tabla === false && f2.resultado === null, `la pantalla del draft pasa por tabla o da resultado: ${JSON.stringify({ tabla: f2.tabla, resultado: f2.resultado })}`);
    ok((await leerFinal()).activa, 'sin resultado deja de vigilar');
    cual = pngTabla;
    ok(await hasta(async () => (await leerFinal()).fotogramas.length >= 2), 'no llega el fotograma de la tabla');
    const f1 = (await leerFinal()).fotogramas[1];
    ok(f1.tabla === true && f1.resultado === 'perdi' && f1.resultadoParecido >= 0.85, `la tabla de la derrota no viene con su resultado: ${JSON.stringify({ tabla: f1.tabla, resultado: f1.resultado, p: f1.resultadoParecido })}`);
    // Con el resultado leído deja de capturar (3.38.0): la partida ha acabado.
    cual = capturaCompletaPng({ columna: 2 });
    await new Promise((r) => setTimeout(r, 400));
    const fin = await leerFinal();
    ok(!fin.activa && fin.fotogramas.length === 2 && fin.resultado === 'perdi', `con el resultado leído sigue capturando: ${JSON.stringify({ activa: fin.activa, n: fin.fotogramas.length })}`);
    // Lo contestado se aprende de los fotogramas de la partida (solo de la tabla) y se guarda; sin origen, 403.
    const sin = await fetch(`${base}/resultado`, { method: 'POST', body: JSON.stringify({ ids: [f1.id], gane: false }) });
    eq(sin.status, 403, 'un resultado sin origen se acepta');
    const r = await (await fetch(`${base}/resultado`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [f1.id, f2.id, '../x', 'fotograma-no-existe'], gane: false }) })).json();
    ok(r.aprendidos === 1 && r.perdi === 2 && r.tablas === 2 && guardados.length === 1, `no aprende de la tabla (y solo de ella): ${JSON.stringify(r)} guardados ${guardados.length}`);
    const estado = await (await fetch(`${base}/estado`)).json();
    ok(estado.resultados?.perdi === 2 && estado.resultados?.gane === 0, `/estado no dice las plantillas de resultado: ${JSON.stringify(estado.resultados)}`);
    // Contestar lo contrario sobre la misma tabla quita las plantillas de derrota que se le parecen y enseña la victoria.
    const c = await (await fetch(`${base}/resultado`, { method: 'POST', headers: { ...cab, 'Content-Type': 'application/json' }, body: JSON.stringify({ ids: [f1.id], gane: true }) })).json();
    ok(c.aprendidos === 1 && c.contradichas === 2 && c.perdi === 0 && c.gane === 1, `una contestación contraria no corrige: ${JSON.stringify(c)}`);
  });
  // Lo aprendido se lee del disco con la versión actual y se descarta si está roto.
  const fichero = join(carpeta, 'resultados.json');
  writeFileSync(fichero, JSON.stringify({ version: 999 }));
  eq(leerResultados(fichero), null, 'unos resultados de otra versión se usan');
  writeFileSync(fichero, JSON.stringify(guardarResultados(plantillasDeSerie())));
  eq(leerResultados(fichero)?.perdi.length, 1, 'los resultados guardados no se leen');
});

await terminar('scripts/puente-lector');
