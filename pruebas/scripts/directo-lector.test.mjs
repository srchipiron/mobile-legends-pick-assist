/**
 * Los consejos EN DIRECTO en el lector (3.44.0): reconocer que la tablet
 * está en partida por el minimapa (partida.mjs), decir cada aviso del guion
 * en su minuto de partida (servir.mjs, con la voz de pega), no decir los que
 * se quedaron atrás, medir la duración y decir el cierre de su tramo; y la
 * voz (voz.mjs) con el texto como DATO: por la entrada estándar, limpio.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { leerPng, escribirPng } from '../../scripts/lector/png.mjs';
import { parecidoAPartida, enPartida, UMBRAL_PARTIDA, recorteMarcador } from '../../scripts/lector/partida.mjs';
import { limpiarTexto, TOPE_VOZ } from '../../scripts/lector/voz.mjs';
import { crearServidor, VIGILANCIA, RETRASO_MAXIMO_MIN } from '../../scripts/lector/servir.mjs';
import { tramoDeMinutos } from '../../src/motor/directo.js';
import { capturaCompletaPng, pantallaDeFinal } from '../fixtures/juego/captura.mjs';

const CARPETA = join(RAIZ, 'pruebas/fixtures/juego/pantallas');
const pantallas = readdirSync(CARPETA).filter((f) => f.endsWith('.png')).map((f) => ({ f, img: leerPng(readFileSync(join(CARPETA, f))) }));
/** Una pantalla de 160 px ampliada (vecino más cercano), como si fuera una captura de la tablet. */
const ampliada = (img, k = 3) => {
  const ancho = img.ancho * k, alto = img.alto * k, rgba = new Uint8Array(ancho * alto * 4);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) rgba.set(img.rgba.subarray(((Math.floor(y / k) * img.ancho) + Math.floor(x / k)) * 4, ((Math.floor(y / k) * img.ancho) + Math.floor(x / k)) * 4 + 4), (y * ancho + x) * 4);
  return { ancho, alto, rgba };
};

test('en partida o no, por el minimapa: las pantallas de juego que la plantilla no vio pasan, las de antes y después (draft, tabla, rango, MVP, estadísticas) no', () => {
  const juego = pantallas.filter((p) => p.f.startsWith('juego-'));
  const fuera = pantallas.filter((p) => p.f.startsWith('fuera-'));
  ok(juego.length >= 8 && fuera.length >= 8, 'faltan pantallas de prueba');
  for (const p of juego) ok(enPartida(p.img), `${p.f} no se ve en partida (${parecidoAPartida(p.img).toFixed(3)})`);
  for (const p of fuera) ok(!enPartida(p.img), `${p.f} se ve en partida (${parecidoAPartida(p.img).toFixed(3)})`);
  // La captura del draft entera (la de las pruebas del lector) tampoco.
  ok(!enPartida(leerPng(capturaCompletaPng())), 'la pantalla del draft se ve en partida');
  ok(!enPartida(leerPng(pantallaDeFinal())), 'la tabla del final se ve en partida');
  // Y una captura de tamaño de verdad se reduce igual que las pantallas de 160 px.
  const grande = ampliada(juego[0].img, 15);
  ok(Math.abs(parecidoAPartida(grande) - parecidoAPartida(juego[0].img)) < 0.05, `una captura grande no da lo mismo que su miniatura: ${parecidoAPartida(grande)} frente a ${parecidoAPartida(juego[0].img)}`);
  ok(UMBRAL_PARTIDA > 0.42 && UMBRAL_PARTIDA < 0.5, 'el umbral no está entre lo medido');
  ok(/^[A-Za-z0-9+/]+={0,2}$/.test(recorteMarcador(grande)), 'el recorte del marcador no es un PNG en base64');
});

test('la voz trata el texto como dato: sin caracteres de control, espacios juntos y con tope', () => {
  eq(limpiarTexto('hola\u0000\nmundo\u001b[2J  ya'), 'hola mundo [2J ya');
  eq(limpiarTexto('x'.repeat(TOPE_VOZ + 50)).length, TOPE_VOZ);
  eq(limpiarTexto(null), '');
});

test('el guion se dice en su minuto de PARTIDA (inicio visto por el minimapa), lo que se quedó atrás no, y al acabar la duración y el cierre de su tramo', async () => {
  const juegoPng = escribirPng(ampliada(pantallas.find((p) => p.f.startsWith('juego-')).img, 3));
  const draftPng = escribirPng(ampliada(pantallas.find((p) => p.f === 'fuera-0.png').img, 3));
  const tablaPng = pantallaDeFinal();
  let pantalla = draftPng, desfase = 0;
  const ahora = () => Date.now() + desfase;
  const dichos = [];
  const hablar = async (texto, idioma) => { dichos.push(`${idioma}:${texto}`); return null; };
  const vigilancia = { ...VIGILANCIA, intervaloMs: 15, intervaloInicioMs: 15 };
  // `cola`: pantallas sueltas que salen antes que `pantalla` (una de juego entre dos del draft).
  let capturas = 0; const cola = [];
  const servidor = crearServidor({ capturar: () => { capturas += 1; return cola.length ? cola.shift() : pantalla; }, ahora, hablar, vigilancia, enHilos: false });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const cab = { Origin: 'https://srchipiron.github.io', 'Content-Type': 'application/json' };
  const hasta = async (cond, ms = 8000) => { const t0 = Date.now(); while (!(await cond()) && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15)); return cond(); };
  const final = async () => (await fetch(`${base}/final`, { headers: cab })).json();
  try {
    const desde = Date.now();
    const guion = [{ min: 0.25, texto: 'Empieza' }, { min: 5, texto: 'Peleas' }, { min: 9, texto: 'Momento' }, { min: -1, texto: 'malo' }, { min: 99, texto: 'malo' }, { min: 3, texto: 42 }];
    const cierres = ['c10', 'c12', 'c14', 'c16', 'c18', 'c20'];
    const v = await (await fetch(`${base}/vigilar`, { method: 'POST', headers: cab, body: JSON.stringify({ desde, guion, cierres, idioma: 'en' }) })).json();
    eq(v.avisos, 3, `no filtra los avisos sin forma: ${v.avisos}`);
    // Minuto 0,5 del draft: aún no se mira la tablet.
    desfase = 30000;
    await new Promise((r) => setTimeout(r, 80));
    eq(capturas, 0, 'mira la tablet antes del minuto 1 (decisión de Javi: desde el 1)');
    // Minuto 2: en el draft (sin minimapa), nada; UNA pantalla de juego suelta
    // entre dos del draft tampoco; luego en partida: dos capturas y empieza.
    desfase = 120000;
    await new Promise((r) => setTimeout(r, 80));
    eq((await final()).inicio, null, 'el draft cuenta como partida');
    cola.push(juegoPng);
    const antes = capturas;
    ok(await hasta(() => capturas >= antes + 3), 'no sigue capturando');
    eq((await final()).inicio, null, 'una sola pantalla de juego suelta arranca el reloj');
    pantalla = juegoPng;
    ok(await hasta(async () => (await final()).inicio != null), 'no ve empezar la partida');
    const inicio = (await final()).inicio;
    ok(inicio <= ahora() && inicio > desde, `el inicio no cae entre el draft y ahora: ${inicio}`);
    // El primer aviso a los 15 s de partida, en el idioma de la app.
    desfase += 20000;
    ok(await hasta(() => dichos.length >= 1), 'no dice el inicio');
    eq(dichos[0], 'en:Empieza', 'el primer aviso no es el del inicio o no va en su idioma');
    // Minuto 5 de partida: el segundo.
    desfase = inicio - desde + 5.1 * 60000;
    ok(await hasta(() => dichos.length >= 2), 'no dice el aviso del minuto 5');
    eq(dichos[1], 'en:Peleas');
    // Saltamos al minuto 12: el del 9 se quedó atrás más de RETRASO_MAXIMO_MIN y no se dice.
    desfase = inicio - desde + (9 + RETRASO_MAXIMO_MIN + 1) * 60000;
    await hasta(async () => (await final()).dichos === 3, 2000);
    await new Promise((r) => setTimeout(r, 100));
    eq(dichos.length, 2, `dice un aviso que se quedó atrás: ${dichos}`);
    // Acaba hacia el minuto 15 de partida: duración y el cierre de su tramo.
    desfase = inicio - desde + 15 * 60000;
    pantalla = tablaPng;
    ok(await hasta(async () => (await final()).resultado === 'perdi'), 'no lee la tabla');
    const f = await final();
    ok(Math.abs(f.duracion - 15) < 0.5 && f.inicioEstimado === false, `la duración no es la de la partida: ${f.duracion}`);
    ok(await hasta(() => dichos.length >= 3), 'no dice el cierre');
    eq(dichos[2], `en:${cierres[tramoDeMinutos(f.duracion)]}`, 'el cierre no es el de su tramo');
    eq(f.voz, 'ok', 'no dice que la voz va bien');
  } finally { servidor.close(); }
});

test('sin ver empezar la partida, el inicio se estima y se marca (la app no apunta esa duración); sin Termux:API, la voz lo dice', async () => {
  let desfase = 0;
  const ahora = () => Date.now() + desfase;
  const hablar = async () => 'falta';
  const servidor = crearServidor({ capturar: () => capturaCompletaPng(), ahora, hablar, vigilancia: { ...VIGILANCIA, intervaloMs: 15, intervaloInicioMs: 15 }, enHilos: false });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const cab = { Origin: 'https://srchipiron.github.io', 'Content-Type': 'application/json' };
  try {
    const desde = Date.now();
    await fetch(`${base}/vigilar`, { method: 'POST', headers: cab, body: JSON.stringify({ desde, guion: [{ min: 6.5, texto: 'Aguantad' }], idioma: 'xx' }) });
    desfase = VIGILANCIA.desdeMin * 60000 + 1000;
    const t0 = Date.now();
    let f;
    while (Date.now() - t0 < 8000) { f = await (await fetch(`${base}/final`, { headers: cab })).json(); if (f.inicio) break; await new Promise((r) => setTimeout(r, 20)); }
    ok(f.inicio === desde + VIGILANCIA.inicioDesdeMin * 60000 && f.inicioEstimado === true, `el inicio no se estima y se marca: ${JSON.stringify({ inicio: f.inicio, est: f.inicioEstimado })}`);
    // El aviso del minuto 6,5 se dice (va al minuto 7 del inicio estimado) y la voz contesta que falta Termux:API.
    while (Date.now() - t0 < 8000 && f.voz !== 'falta') { f = await (await fetch(`${base}/final`, { headers: cab })).json(); await new Promise((r) => setTimeout(r, 20)); }
    eq(f.voz, 'falta', 'sin Termux:API /final no lo dice');
  } finally { servidor.close(); }
});

await terminar('scripts/directo-lector');
