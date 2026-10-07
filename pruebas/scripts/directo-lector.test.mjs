/**
 * Los consejos EN DIRECTO en el lector (3.44.0): reconocer que la tablet
 * está en partida por el minimapa (partida.mjs), decir cada aviso del guion
 * en su minuto de partida (servir.mjs, con la voz de pega), no decir los que
 * se quedaron atrás, medir la duración y decir el cierre de su tramo; y la
 * voz (voz.mjs) con el texto como DATO: por la entrada estándar, limpio.
 */
import { readFileSync, readdirSync, writeFileSync, mkdtempSync, chmodSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { leerPng, escribirPng } from '../../scripts/lector/png.mjs';
import { parecidoAPartida, enPartida, UMBRAL_PARTIDA, recorteMarcador } from '../../scripts/lector/partida.mjs';
import { limpiarTexto, TOPE_VOZ, hablarConTermux } from '../../scripts/lector/voz.mjs';
import { crearServidor, plantillasDeSerie, VIGILANCIA, RETRASO_MAXIMO_MIN, VOZ_POR_VENTANA } from '../../scripts/lector/servir.mjs';
import { tramoDeMinutos } from '../../src/motor/directo.js';
import { fundirFinal } from '../../src/app/lector.js';
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
  const registro = [];
  const servidor = crearServidor({ capturar: () => { capturas += 1; return cola.length ? cola.shift() : pantalla; }, ahora, hablar, vigilancia, enHilos: false, registrar: (l) => registro.push(l) });
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
    // Minuto 0,5 del draft: ya se mira la tablet (la partida puede empezar
    // a los 15 s del draft, 3.45.1), y el draft no cuenta como partida.
    desfase = 30000;
    ok(await hasta(() => capturas >= 1), 'no mira la tablet en el primer minuto tras el draft');
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
    ok(await hasta(async () => (await final()).saltados === 1, 2000), 'el aviso atrasado no cuenta como saltado');
    await new Promise((r) => setTimeout(r, 100));
    eq(dichos.length, 2, `dice un aviso que se quedó atrás: ${dichos}`);
    eq((await final()).dichos, 2, 'cuenta como dicho un aviso que no se dijo');
    ok(registro.some((l) => l.includes('sin decir (atrasado') && l.includes('Momento')), 'el aviso atrasado no deja línea en el registro');
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

/** Un lector con la tablet y el reloj en manos de la prueba (3.44.1). */
async function lectorDePrueba(opciones = {}) {
  const p = { pantalla: null, desfase: 0, dichos: [] };
  const ahora = () => Date.now() + p.desfase;
  const servidor = crearServidor({ capturar: () => p.pantalla, ahora, hablar: async (texto) => { p.dichos.push(texto); return null; }, vigilancia: { ...VIGILANCIA, intervaloMs: 15, intervaloInicioMs: 15 }, enHilos: false, ...opciones });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const cab = { Origin: 'https://srchipiron.github.io', 'Content-Type': 'application/json' };
  p.final = async () => (await fetch(`${base}/final`, { headers: cab })).json();
  p.vigilar = (cuerpo) => fetch(`${base}/vigilar`, { method: 'POST', headers: cab, body: JSON.stringify(cuerpo) });
  p.resultado = async (cuerpo) => (await fetch(`${base}/resultado`, { method: 'POST', headers: cab, body: JSON.stringify(cuerpo) })).status;
  p.hasta = async (cond, ms = 8000) => { const t0 = Date.now(); while (!(await cond()) && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15)); return cond(); };
  p.leer = async () => (await fetch(`${base}/leer`, { headers: cab })).json();
  p.cerrar = () => servidor.close();
  return p;
}
const CIERRES = ['c10', 'c12', 'c14', 'c16', 'c18', 'c20'];

test('ya en partida al empezar a mirar (draft completado tarde, lector reiniciado): el inicio sale ESTIMADO, la app no apunta la duración y no se dice un cierre que puede ser de otro tramo', async () => {
  const juegoPng = escribirPng(ampliada(pantallas.find((p) => p.f.startsWith('juego-')).img, 3));
  const p = await lectorDePrueba();
  try {
    const desde = Date.now();
    await p.vigilar({ desde, guion: [{ min: 0.25, texto: 'Empieza' }], cierres: CIERRES });
    // Desde la primera captura, minimapa: la partida empezó antes y no se sabe cuánto.
    p.pantalla = juegoPng;
    p.desfase = 2 * 60000;
    ok(await p.hasta(async () => (await p.final()).inicio != null), 'no da la partida por empezada');
    eq((await p.final()).inicioEstimado, true, 'un inicio que no se vio llegar sale como medido');
    p.desfase = 15 * 60000;
    p.pantalla = pantallaDeFinal();
    ok(await p.hasta(async () => (await p.final()).resultado === 'perdi'), 'no lee la tabla');
    const f = await p.final();
    ok(f.duracion > 0, 'no calcula la duración (aunque sea estimada)');
    eq(fundirFinal([], f, { completoDesde: desde }).duracion, null, 'la app apunta una duración con el inicio sin ver');
    await new Promise((r) => setTimeout(r, 100));
    ok(!p.dichos.some((d) => d.startsWith('c')), `dice un cierre con el inicio estimado: ${p.dichos}`);
  } finally { p.cerrar(); }
});

test('la partida empieza a los 30 s del draft (como el 6 de octubre de 2026): el inicio se ve llegar, sale MEDIDO y la app apunta la duración (3.45.1)', async () => {
  const juegoPng = escribirPng(ampliada(pantallas.find((p) => p.f.startsWith('juego-')).img, 3));
  const draftPng = escribirPng(ampliada(pantallas.find((p) => p.f === 'fuera-0.png').img, 3));
  const p = await lectorDePrueba();
  try {
    const desde = Date.now();
    // La app avisa a los pocos segundos de completar el draft: la tablet sigue en el draft.
    p.pantalla = draftPng;
    p.desfase = 10000;
    await p.vigilar({ desde, guion: [], cierres: CIERRES });
    await new Promise((r) => setTimeout(r, 80));
    // A los 30 s empieza la partida; a los 60 s ya se lleva medio minuto jugando.
    p.desfase = 30000;
    p.pantalla = juegoPng;
    ok(await p.hasta(async () => (await p.final()).inicio != null), 'no ve empezar la partida');
    const { inicio, inicioEstimado } = await p.final();
    eq(inicioEstimado, false, 'una partida que empieza antes del minuto 1 del draft sale con el inicio estimado');
    ok(inicio > desde && inicio < desde + 60000, `el inicio no cae en el primer minuto: ${(inicio - desde) / 1000} s`);
    p.desfase = inicio - desde + 14 * 60000;
    p.pantalla = pantallaDeFinal();
    ok(await p.hasta(async () => (await p.final()).resultado === 'perdi'), 'no lee la tabla');
    const f = await p.final();
    ok(Math.abs(f.duracion - 14) < 0.5, `la duración no es la de la partida: ${f.duracion}`);
    eq(fundirFinal([], f, { completoDesde: desde }).duracion, f.duracion, 'la app no apunta la duración');
    ok(await p.hasta(() => p.dichos.length >= 1), 'no dice el cierre');
    eq(p.dichos[0], CIERRES[tramoDeMinutos(f.duracion)]);
  } finally { p.cerrar(); }
});

test('el draft se cierra con la partida empezada (3.46.0): /leer dice si la tablet está en partida, y si las lecturas la vieron empezar el inicio sale MEDIDO aunque la vigilancia llegue tarde', async () => {
  const juegoPng = escribirPng(ampliada(pantallas.find((p) => p.f.startsWith('juego-')).img, 15));
  const p = await lectorDePrueba();
  try {
    const t0 = Date.now();
    p.pantalla = capturaCompletaPng();
    eq((await p.leer()).partida, false, 'el draft se lee como partida');
    // La partida empieza; dos lecturas la ven (la app cierra el draft) y avisa al lector.
    p.pantalla = juegoPng;
    p.desfase = 20000;
    eq((await p.leer()).partida, true, 'la partida no se lee como partida');
    // (La segunda, lejos: el inicio sale de la PRIMERA de dentro, no de la última.)
    p.desfase = 50000;
    eq((await p.leer()).partida, true);
    p.desfase = 55000;
    await p.vigilar({ desde: t0 + 55000, guion: [], cierres: CIERRES });
    const { inicio, inicioEstimado } = await p.final();
    eq(inicioEstimado, false, 'con las lecturas viendo empezar la partida, el inicio sale estimado');
    ok(Math.abs(inicio - (t0 + 10000)) < 5000, `el inicio no es el punto medio entre la última lectura fuera y la PRIMERA dentro: ${(inicio - t0) / 1000} s`);
    p.desfase = inicio - t0 + 14 * 60000;
    p.pantalla = pantallaDeFinal();
    ok(await p.hasta(async () => (await p.final()).resultado === 'perdi'), 'no lee la tabla');
    const f = await p.final();
    ok(Math.abs(f.duracion - 14) < 0.5, `la duración no es la de la partida: ${f.duracion}`);
    eq(fundirFinal([], f, { completoDesde: t0 + 55000 }).duracion, f.duracion, 'la app no apunta la duración');
  } finally { p.cerrar(); }
  // Sin una lectura FUERA antes (la app abierta ya en partida): no se sabe cuándo empezó.
  const q = await lectorDePrueba();
  try {
    const t0 = Date.now();
    q.pantalla = juegoPng;
    await q.leer(); q.desfase = 5000; await q.leer();
    q.desfase = 10000;
    await q.vigilar({ desde: t0 + 10000, guion: [], cierres: CIERRES });
    ok(await q.hasta(async () => (await q.final()).inicio != null), 'no da la partida por empezada');
    eq((await q.final()).inicioEstimado, true, 'sin ver la tablet fuera, el inicio sale medido');
  } finally { q.cerrar(); }
});

test('una partida de más de 23 minutos también se mide: con el inicio visto se vigila pasado el minuto 25 del draft, con su duración y su cierre', async () => {
  const juegoPng = escribirPng(ampliada(pantallas.find((p) => p.f.startsWith('juego-')).img, 3));
  const draftPng = escribirPng(ampliada(pantallas.find((p) => p.f === 'fuera-0.png').img, 3));
  const p = await lectorDePrueba();
  try {
    const desde = Date.now();
    await p.vigilar({ desde, guion: [], cierres: CIERRES });
    p.pantalla = draftPng;
    p.desfase = 2 * 60000;
    await new Promise((r) => setTimeout(r, 80));
    p.pantalla = juegoPng;
    ok(await p.hasta(async () => (await p.final()).inicio != null), 'no ve empezar la partida');
    const { inicio, inicioEstimado } = await p.final();
    eq(inicioEstimado, false);
    // Minuto 26 de PARTIDA (más de 27 del draft): sigue mirando y la tabla cuenta.
    p.desfase = inicio - desde + 26 * 60000;
    await new Promise((r) => setTimeout(r, 80));
    ok((await p.final()).activa, 'deja de vigilar en el minuto 25 del draft con la partida en juego');
    p.pantalla = pantallaDeFinal();
    ok(await p.hasta(async () => (await p.final()).resultado === 'perdi'), 'no lee la tabla de una partida larga');
    const f = await p.final();
    ok(Math.abs(f.duracion - 26) < 0.5, `la duración no es la de la partida: ${f.duracion}`);
    eq(fundirFinal([], f, { completoDesde: desde }).duracion, f.duracion, 'la app no apunta la duración de una partida larga');
    ok(await p.hasta(() => p.dichos.length >= 1), 'no dice el cierre');
    eq(p.dichos[0], CIERRES[5]);
  } finally { p.cerrar(); }
});

test('con la partida acabada no se dice nada más: ni tras ver la tabla, ni tras apuntarla en la app aunque la tabla no se viera (3.44.1)', async () => {
  const juegoPng = escribirPng(ampliada(pantallas.find((p) => p.f.startsWith('juego-')).img, 3));
  const draftPng = escribirPng(ampliada(pantallas.find((p) => p.f === 'fuera-0.png').img, 3));
  const p = await lectorDePrueba();
  try {
    const desde = Date.now();
    await p.vigilar({ desde, guion: [{ min: 13, texto: 'tarde' }], cierres: CIERRES });
    p.pantalla = draftPng; p.desfase = 2 * 60000;
    await new Promise((r) => setTimeout(r, 80));
    p.pantalla = juegoPng;
    ok(await p.hasta(async () => (await p.final()).inicio != null), 'no ve empezar la partida');
    const { inicio } = await p.final();
    // Acaba en el minuto 12 y Javi la apunta en la app sin que el lector viera la tabla.
    p.desfase = inicio - desde + 12 * 60000;
    p.pantalla = draftPng;
    const r = await p.resultado({ ids: [], gane: true, desde });
    ok(r === 200 || r === 400, `el aviso de partida apuntada no se contesta: ${r}`);
    eq((await p.final()).activa, false, 'apuntada en la app, el lector sigue vigilando esa partida');
    p.desfase = inicio - desde + 13.5 * 60000;
    await new Promise((r2) => setTimeout(r2, 150));
    eq(p.dichos.length, 0, `habla de una partida ya apuntada: ${p.dichos}`);
    // Otro draft (otro instante) no se para por un resultado viejo.
    const otro = desde + 1;
    await p.vigilar({ desde: otro, guion: [] });
    await p.resultado({ ids: [], gane: true, desde });
    eq((await p.final()).activa, true, 'el resultado de una partida para la vigilancia de otra');
    // Y la tabla vista sin palabra conocida (la de victoria hasta aprenderla): duración y cierre, y después nada.
    const q = await lectorDePrueba({ resultados: { ...plantillasDeSerie(), perdi: [] } });
    try {
      await q.vigilar({ desde, guion: [{ min: 13, texto: 'tarde' }], cierres: CIERRES });
      q.pantalla = draftPng; q.desfase = 2 * 60000;
      await new Promise((r2) => setTimeout(r2, 80));
      q.pantalla = juegoPng;
      ok(await q.hasta(async () => (await q.final()).inicio != null), 'no ve empezar la partida');
      const i2 = (await q.final()).inicio;
      q.desfase = i2 - desde + 12.5 * 60000;
      q.pantalla = pantallaDeFinal();
      ok(await q.hasta(async () => (await q.final()).duracion != null), 'una tabla sin palabra conocida no da la duración');
      eq((await q.final()).resultado, null, 'la prueba necesita una tabla SIN palabra conocida');
      ok(await q.hasta(() => q.dichos.length >= 1), 'no dice el cierre');
      q.pantalla = draftPng;
      q.desfase = i2 - desde + 13.5 * 60000;
      await new Promise((r2) => setTimeout(r2, 150));
      eq(q.dichos.join(), CIERRES[1], `tras la tabla sigue con los consejos de la partida: ${q.dichos}`);
    } finally { q.cerrar(); }
  } finally { p.cerrar(); }
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
    ok(f.inicio === desde + VIGILANCIA.inicioEstimadoMin * 60000 && f.inicioEstimado === true, `el inicio no se estima y se marca: ${JSON.stringify({ inicio: f.inicio, est: f.inicioEstimado })}`);
    // El aviso del minuto 6,5 se dice (va al minuto 7 del inicio estimado) y la voz contesta que falta Termux:API.
    while (Date.now() - t0 < 8000 && f.voz !== 'falta') { f = await (await fetch(`${base}/final`, { headers: cab })).json(); await new Promise((r) => setTimeout(r, 20)); }
    eq(f.voz, 'falta', 'sin Termux:API /final no lo dice');
  } finally { servidor.close(); }
});

test('SEGURIDAD: con un termux-tts-speak de pega, los argumentos son siempre «-l es» o «-l en» y el texto llega por la entrada estándar, limpio, sea cual sea lo que mande la app', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'voz-'));
  const registro = join(dir, 'llamadas');
  writeFileSync(join(dir, 'termux-tts-speak'), `#!/bin/sh\nprintf '%s|' "$@" >> '${registro}'\nprintf '#' >> '${registro}'\ncat >> '${registro}'\nprintf '\\n' >> '${registro}'\n`);
  chmodSync(join(dir, 'termux-tts-speak'), 0o755);
  const antes = process.env.PATH;
  process.env.PATH = `${dir}:${antes}`;
  try {
    const malos = [['--help', 'es'], ['-e com.evil -l x', '-e'], ['$(id); `id`', 'es;id>/tmp/x'], ['hola\u001b[2Jx', ['es']], ['ok', 'en']];
    for (const [texto, idioma] of malos) eq(await hablarConTermux(texto, idioma), null, `la voz falla con ${JSON.stringify([texto, idioma])}`);
    const lineas = readFileSync(registro, 'utf8').trim().split('\n');
    eq(lineas.length, malos.length, 'no se llamó una vez por aviso');
    lineas.forEach((l, i) => {
      const [args, entrada] = l.split('#');
      eq(args, i === malos.length - 1 ? '-l|en|' : '-l|es|', `argumentos distintos de «-l es/en»: ${args}`);
      eq(entrada, limpiarTexto(malos[i][0]), 'el texto no llega limpio por la entrada estándar');
    });
    eq(await hablarConTermux('', 'es'), null, 'un texto vacío falla');
  } finally { process.env.PATH = antes; }
});

test('SEGURIDAD: repetir /vigilar no deja al móvil hablando sin fin (revisión de seguridad de 3.44.0: 30 avisos dejaban 600 en cola)', async () => {
  let desfase = 0;
  const ahora = () => Date.now() + desfase;
  const dichos = [];
  const hablar = async (texto) => { dichos.push(texto); return null; };
  const servidor = crearServidor({ capturar: () => capturaCompletaPng(), ahora, hablar, vigilancia: { ...VIGILANCIA, intervaloMs: 15, intervaloInicioMs: 15 }, enHilos: false });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const cab = { Origin: 'https://srchipiron.github.io', 'Content-Type': 'application/json' };
  try {
    // Drafts «completados» hace 9 minutos (inicio estimado ya), con 20 avisos que tocan todos, una y otra vez.
    const guion = Array.from({ length: 20 }, (_, i) => ({ min: 7 + i * 0.01, texto: `engaño ${i}` }));
    for (let i = 0; i < 30; i++) {
      await fetch(`${base}/vigilar`, { method: 'POST', headers: cab, body: JSON.stringify({ desde: Date.now() - 9 * 60000 - i, guion }) });
      await new Promise((r) => setTimeout(r, 40));
    }
    // Y el mismo draft con el guion reenviado (avisos justo por delante del minuto de ahora).
    const desde = Date.now() - 9 * 60000 - 99;
    for (let i = 0; i < 5; i++) {
      await fetch(`${base}/vigilar`, { method: 'POST', headers: cab, body: JSON.stringify({ desde, guion: guion.map((a) => ({ ...a, min: 8 + i * 0.001 })) }) });
      await new Promise((r) => setTimeout(r, 40));
    }
    await new Promise((r) => setTimeout(r, 300));
    ok(dichos.length <= VOZ_POR_VENTANA, `en unos segundos dice ${dichos.length} avisos (tope ${VOZ_POR_VENTANA} por ventana)`);
    // Pasada la ventana vuelve a poder hablar, pero lo de un draft que ya no es el vigilado no se dice.
    const n = dichos.length;
    desfase = 3 * 60000 + 1000;
    await new Promise((r) => setTimeout(r, 300));
    ok(dichos.length - n <= VOZ_POR_VENTANA, `tras la ventana dice ${dichos.length - n}`);
    // Y un cuerpo enorme se contesta (no se queda colgado).
    const r = await fetch(`${base}/vigilar`, { method: 'POST', headers: cab, body: JSON.stringify({ desde: Date.now(), guion: [{ min: 1, texto: 'x'.repeat(80000) }] }) }).then((x) => x.status).catch(() => 'cortado');
    ok(r === 400 || r === 'cortado', `un cuerpo enorme no se rechaza: ${r}`);
  } finally { servidor.close(); }
});

test('SEGURIDAD: lo que quedaba en la cola de voz de un draft que ya no es el vigilado no se dice', async () => {
  const dichos = [];
  // Una voz que no acaba hasta que la prueba la suelta: los avisos se quedan
  // en cola sin depender de lo rápido que sea el aparato (en el runner de
  // GitHub, con plazos fijos, la segunda petición llegaba tarde).
  let soltar = null;
  const hablar = (texto) => new Promise((r) => { dichos.push(texto); soltar = () => r(null); });
  const pantallaChica = escribirPng(ampliada(pantallas.find((p) => p.f === 'fuera-0.png').img, 1));
  const servidor = crearServidor({ capturar: () => pantallaChica, hablar, vigilancia: { ...VIGILANCIA, intervaloMs: 15, intervaloInicioMs: 15 }, enHilos: false });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const cab = { Origin: 'https://srchipiron.github.io', 'Content-Type': 'application/json' };
  const hasta = async (cond, ms = 8000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15)); return cond(); };
  try {
    await fetch(`${base}/vigilar`, { method: 'POST', headers: cab, body: JSON.stringify({ desde: Date.now() - 9 * 60000, guion: [7.5, 7.6, 7.7].map((min, i) => ({ min, texto: `viejo ${i}` })) }) });
    ok(await hasta(() => dichos.length === 1), 'no empieza a decir el primer aviso');
    // Con el primero sonando (y los otros dos en cola), llega otro draft.
    await fetch(`${base}/vigilar`, { method: 'POST', headers: cab, body: JSON.stringify({ desde: Date.now() - 1000, guion: [] }) });
    soltar();
    await new Promise((r) => setTimeout(r, 300));
    soltar?.();
    await new Promise((r) => setTimeout(r, 300));
    eq(dichos.join(), 'viejo 0', 'dice lo que quedaba en cola de un draft que ya no es el vigilado');
  } finally { soltar?.(); servidor.close(); }
});

await terminar('scripts/directo-lector');
