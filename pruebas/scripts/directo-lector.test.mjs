/**
 * La vigilancia de la partida en el lector (3.44.0): reconocer que la tablet
 * está en partida por el minimapa (partida.mjs), medir la duración hasta la
 * tabla del final y la ráfaga de capturas al acabar. Los consejos en voz alta
 * que se probaban aquí se quitaron en 3.96.0.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { leerPng, escribirPng } from '../../scripts/lector/png.mjs';
import { parecidoAPartida, enPartida, UMBRAL_PARTIDA, recorteMarcador } from '../../scripts/lector/partida.mjs';
import { crearServidor, plantillasDeSerie, tocaCapturarFinal, VIGILANCIA } from '../../scripts/lector/servir.mjs';
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

test('el inicio se ve por el minimapa (una pantalla de juego suelta no cuenta) y al acabar se mide la duración; la app no manda ni se dice nada (3.96.0)', async () => {
  const juegoPng = escribirPng(ampliada(pantallas.find((p) => p.f.startsWith('juego-')).img, 3));
  const draftPng = escribirPng(ampliada(pantallas.find((p) => p.f === 'fuera-0.png').img, 3));
  const tablaPng = pantallaDeFinal();
  let pantalla = draftPng, desfase = 0;
  const ahora = () => Date.now() + desfase;
  const vigilancia = { ...VIGILANCIA, intervaloMs: 15, intervaloInicioMs: 15 };
  // `cola`: pantallas sueltas que salen antes que `pantalla` (una de juego entre dos del draft).
  let capturas = 0; const cola = [];
  const registro = [];
  const servidor = crearServidor({ capturar: () => { capturas += 1; return cola.length ? cola.shift() : pantalla; }, ahora, vigilancia, enHilos: false, registrar: (l) => registro.push(l) });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const cab = { Origin: 'https://srchipiron.github.io', 'Content-Type': 'application/json' };
  const hasta = async (cond, ms = 8000) => { const t0 = Date.now(); while (!(await cond()) && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15)); return cond(); };
  const final = async () => (await fetch(`${base}/final`, { headers: cab })).json();
  try {
    const desde = Date.now();
    // Una app vieja que aún mande un guion: se ignora, el lector ya no habla.
    const v = await (await fetch(`${base}/vigilar`, { method: 'POST', headers: cab, body: JSON.stringify({ desde, guion: [{ min: 0.25, texto: 'Empieza' }], cierres: ['c10'], callar: false }) })).json();
    ok(v.desde === desde && !('avisos' in v) && !('voz' in v) && !('callada' in v), `/vigilar sigue hablando de la voz: ${JSON.stringify(v)}`);
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
    // Acaba hacia el minuto 15 de partida: su duración.
    // El reloj del lector es `Date.now() + desfase`: el tiempo REAL que pasa
    // desde `desde` también cuenta como partida. Así que la duración se
    // comprueba entre lo que llevaba la prueba al poner la tabla y al leerla
    // (con 15 ± 0,5 fijo, una máquina lenta daba 15,6 y fallaba con el
    // código bien; pasó el 9 de octubre de 2026 con la 3.49.0).
    desfase = inicio - desde + 15 * 60000;
    const minutosReales = () => (Date.now() - desde) / 60000;
    const antesDeLaTabla = minutosReales();
    pantalla = tablaPng;
    ok(await hasta(async () => (await final()).resultado === 'perdi'), 'no lee la tabla');
    const f = await final();
    const despues = minutosReales();
    ok(f.duracion >= 15 + antesDeLaTabla - 0.05 && f.duracion <= 15 + despues + 0.05 && f.inicioEstimado === false,
      `la duración no es la de la partida: ${f.duracion} (entre ${(15 + antesDeLaTabla).toFixed(2)} y ${(15 + despues).toFixed(2)})`);
    ok(!registro.some((l) => /Minuto .* de partida|consejos en directo|«Empieza»/.test(l)), `el registro habla de consejos: ${registro.join(' | ')}`);
  } finally { servidor.close(); }
});

test('la ráfaga del final (3.89.2): cuándo toca capturar, al paso de siempre o deprisa mientras dura', () => {
  const v = VIGILANCIA, latido = Math.min(v.intervaloMs, v.intervaloInicioMs, v.rapidoMs);
  ok(v.rapidoMs <= 2000 && v.rafagaMs >= 60000, `la ráfaga no es rápida o no dura: ${v.rapidoMs} ms durante ${v.rafagaMs} ms`);
  const t = 1_000_000;
  // En partida: a los 10 s sí (con medio latido de margen), a los 2 s no.
  ok(!tocaCapturarFinal({ ultimaFinal: t - 2000 }, t, v, latido), 'en partida captura cada 2 s');
  ok(tocaCapturarFinal({ ultimaFinal: t - v.intervaloMs + latido / 2 }, t, v, latido), 'un latido un pelo antes de los 10 s deja la captura para el siguiente');
  // En la ráfaga: a los 2 s sí.
  ok(tocaCapturarFinal({ ultimaFinal: t - v.rapidoMs, rafagaHasta: t + 1000 }, t, v, latido), 'en la ráfaga no captura deprisa');
  // Pasada la ráfaga, al paso de siempre.
  ok(!tocaCapturarFinal({ ultimaFinal: t - v.rapidoMs, rafagaHasta: t - 1 }, t, v, latido), 'la ráfaga no acaba');
});

test('la ráfaga empieza al dejar de verse el minimapa, no en partida', async () => {
  const juegoPng = escribirPng(ampliada(pantallas.find((p) => p.f.startsWith('juego-')).img, 3));
  const fueraPng = escribirPng(ampliada(pantallas.find((p) => p.f === 'fuera-0.png').img, 3));
  let pantalla = juegoPng, capturas = 0;
  const registro = [];
  const vigilancia = { ...VIGILANCIA, desdeMin: 0, intervaloMs: 15, intervaloInicioMs: 15, rapidoMs: 15 };
  const servidor = crearServidor({ capturar: () => { capturas += 1; return pantalla; }, vigilancia, enHilos: false, registrar: (l) => registro.push(l) });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const cab = { Origin: 'https://srchipiron.github.io', 'Content-Type': 'application/json' };
  const hasta = async (cond, ms = 8000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15)); return cond(); };
  try {
    await fetch(`${base}/vigilar`, { method: 'POST', headers: cab, body: JSON.stringify({ desde: Date.now() }) });
    ok(await hasta(() => capturas >= 3), 'no captura en partida');
    ok(!registro.some((l) => /Sin minimapa/.test(l)), 'en partida empieza la ráfaga');
    pantalla = fueraPng;
    const antes = capturas;
    ok(await hasta(() => capturas >= antes + 2), 'deja de capturar');
    ok(registro.some((l) => /Sin minimapa/.test(l)), 'sin minimapa no empieza la ráfaga');
  } finally { servidor.close(); }
});

test('en partida, una captura por paso aunque el reloj lata más deprisa (3.89.2)', async () => {
  const juegoPng = escribirPng(ampliada(pantallas.find((p) => p.f.startsWith('juego-')).img, 3));
  let capturas = 0;
  // El reloj late cada 15 ms (la ráfaga) y el paso normal es de 100 s: en 400 ms, una sola captura.
  const servidor = crearServidor({ capturar: () => { capturas += 1; return juegoPng; }, vigilancia: { ...VIGILANCIA, desdeMin: 0, intervaloMs: 100000, intervaloInicioMs: 100000, rapidoMs: 15 }, enHilos: false });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  try {
    await fetch(`http://127.0.0.1:${servidor.address().port}/vigilar`, { method: 'POST', headers: { Origin: 'https://srchipiron.github.io', 'Content-Type': 'application/json' }, body: JSON.stringify({ desde: Date.now() }) });
    await new Promise((r) => setTimeout(r, 400));
    eq(capturas, 1, `captura a cada latido y no a cada paso: ${capturas}`);
  } finally { servidor.close(); }
});

test('las pantallas de la ráfaga no las saca el vestíbulo de después (3.90.3)', async () => {
  // El 4 de noviembre de 2026 la tabla no se vio, y las pantallas que subió la tablet eran del vestíbulo,
  // 20 minutos después: las del final se habían ido de las 8. Aquí, 3 sitios.
  const png = (f) => escribirPng(ampliada(pantallas.find((p) => p.f === f).img, 3));
  const [juego, f0, f1, f4, f5, f7] = ['juego-17.png', 'fuera-0.png', 'fuera-2.png', 'fuera-4.png', 'fuera-5.png', 'fuera-7.png'].map(png);
  let pantalla = juego, capturas = 0, desfase = 0;
  const servidor = crearServidor({ capturar: () => { capturas += 1; return pantalla; }, ahora: () => Date.now() + desfase, vigilancia: { ...VIGILANCIA, desdeMin: 0, intervaloMs: 15, intervaloInicioMs: 15, rapidoMs: 15, rafagaMs: 60000, maxFotogramas: 3, hastaMin: 600, partidaHastaMin: 600 }, enHilos: false });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const cab = { Origin: 'https://srchipiron.github.io', 'Content-Type': 'application/json' };
  const final = async () => (await fetch(`${base}/final`, { headers: cab })).json();
  const pasar = async (n = 3) => { const antes = capturas; const t0 = Date.now(); while (capturas < antes + n && Date.now() - t0 < 8000) await new Promise((r) => setTimeout(r, 15)); };
  try {
    await fetch(`${base}/vigilar`, { method: 'POST', headers: cab, body: JSON.stringify({ desde: Date.now() }) });
    await pasar();
    for (const p of [f0, f1]) { pantalla = p; await pasar(); }
    const enLaRafaga = (await final()).fotogramas.filter((f) => f.rafaga).map((f) => f.id);
    ok(enLaRafaga.length === 2 && (await final()).fotogramas.every((f) => f.rafaga || f.marcador), `las del final no van marcadas de la ráfaga: ${JSON.stringify((await final()).fotogramas.map((f) => [f.rafaga, !!f.marcador]))}`);
    // Pasada la ráfaga, el vestíbulo: no saca a ninguna de la ráfaga.
    desfase = 120000;
    for (const p of [f4, f5, f7]) { pantalla = p; await pasar(); }
    const quedan = (await final()).fotogramas;
    ok(enLaRafaga.every((id) => quedan.some((f) => f.id === id)), `el vestíbulo se lleva las del final: ${quedan.map((f) => `${f.id.slice(-12)}${f.rafaga ? '*' : ''}`).join(', ')}`);
  } finally { servidor.close(); }
});

/** Un lector con la tablet y el reloj en manos de la prueba (3.44.1). */
async function lectorDePrueba(opciones = {}) {
  const p = { pantalla: null, desfase: 0 };
  const ahora = () => Date.now() + p.desfase;
  const servidor = crearServidor({ capturar: () => p.pantalla, ahora, vigilancia: { ...VIGILANCIA, intervaloMs: 15, intervaloInicioMs: 15 }, enHilos: false, ...opciones });
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

test('ya en partida al empezar a mirar (draft completado tarde, lector reiniciado): el inicio sale ESTIMADO, la app no apunta la duración', async () => {
  const juegoPng = escribirPng(ampliada(pantallas.find((p) => p.f.startsWith('juego-')).img, 3));
  const p = await lectorDePrueba();
  try {
    const desde = Date.now();
    await p.vigilar({ desde });
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
    await p.vigilar({ desde });
    await new Promise((r) => setTimeout(r, 80));
    // A los 30 s empieza la partida; a los 60 s ya se lleva medio minuto jugando.
    p.desfase = 30000;
    p.pantalla = juegoPng;
    ok(await p.hasta(async () => (await p.final()).inicio != null), 'no ve empezar la partida');
    const { inicio, inicioEstimado } = await p.final();
    eq(inicioEstimado, false, 'una partida que empieza antes del minuto 1 del draft sale con el inicio estimado');
    ok(inicio > desde && inicio < desde + 60000, `el inicio no cae en el primer minuto: ${(inicio - desde) / 1000} s`);
    p.desfase = inicio - Date.now() + 14 * 60000;
    p.pantalla = pantallaDeFinal();
    ok(await p.hasta(async () => (await p.final()).resultado === 'perdi'), 'no lee la tabla');
    const f = await p.final();
    ok(Math.abs(f.duracion - 14) < 0.5, `la duración no es la de la partida: ${f.duracion}`);
    eq(fundirFinal([], f, { completoDesde: desde }).duracion, f.duracion, 'la app no apunta la duración');
  } finally { p.cerrar(); }
});

test('el draft se cierra con la partida empezada (3.46.0): /leer dice si la tablet está en partida, y si las lecturas la vieron empezar el inicio sale MEDIDO aunque la vigilancia llegue tarde', async () => {
  const juegoPng = escribirPng(ampliada(pantallas.find((p) => p.f.startsWith('juego-')).img, 15));
  const p = await lectorDePrueba();
  try {
    const t0 = Date.now();
    p.pantalla = capturaCompletaPng();
    // El reloj del lector suma el tiempo real (decodificar la captura entera
    // cuesta segundos con la máquina cargada): cada lectura se acota con su
    // antes y su después, no con un margen fijo.
    const fueraAntes = Date.now() + p.desfase;
    eq((await p.leer()).partida, false, 'el draft se lee como partida');
    const fueraDespues = Date.now() + p.desfase;
    // La partida empieza; dos lecturas la ven (la app cierra el draft) y avisa al lector.
    p.pantalla = juegoPng;
    p.desfase = 20000;
    const dentroAntes = Date.now() + p.desfase;
    eq((await p.leer()).partida, true, 'la partida no se lee como partida');
    const dentroDespues = Date.now() + p.desfase;
    // (La segunda, lejos: el inicio sale de la PRIMERA de dentro, no de la última.)
    p.desfase = 50000;
    eq((await p.leer()).partida, true);
    p.desfase = 55000;
    await p.vigilar({ desde: t0 + 55000 });
    const { inicio, inicioEstimado } = await p.final();
    eq(inicioEstimado, false, 'con las lecturas viendo empezar la partida, el inicio sale estimado');
    // La segunda lectura de dentro va 30 s después: si se cogiera ella, el inicio caería 15 s más tarde, fuera de la cota.
    ok(inicio >= (fueraAntes + dentroAntes) / 2 - 1 && inicio <= (fueraDespues + dentroDespues) / 2 + 1, `el inicio no es el punto medio entre la última lectura fuera y la PRIMERA dentro: ${(inicio - t0) / 1000} s`);
    p.desfase = inicio - Date.now() + 14 * 60000;
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
    await q.vigilar({ desde: t0 + 10000 });
    ok(await q.hasta(async () => (await q.final()).inicio != null), 'no da la partida por empezada');
    eq((await q.final()).inicioEstimado, true, 'sin ver la tablet fuera, el inicio sale medido');
  } finally { q.cerrar(); }
});

test('una partida de más de 23 minutos también se mide: con el inicio visto se vigila pasado el minuto 25 del draft, con su duración', async () => {
  const juegoPng = escribirPng(ampliada(pantallas.find((p) => p.f.startsWith('juego-')).img, 3));
  const draftPng = escribirPng(ampliada(pantallas.find((p) => p.f === 'fuera-0.png').img, 3));
  const p = await lectorDePrueba();
  try {
    const desde = Date.now();
    await p.vigilar({ desde });
    p.pantalla = draftPng;
    p.desfase = 2 * 60000;
    await new Promise((r) => setTimeout(r, 80));
    p.pantalla = juegoPng;
    ok(await p.hasta(async () => (await p.final()).inicio != null), 'no ve empezar la partida');
    const { inicio, inicioEstimado } = await p.final();
    eq(inicioEstimado, false);
    // Minuto 26 de PARTIDA (más de 27 del draft): sigue mirando y la tabla cuenta.
    p.desfase = inicio - Date.now() + 26 * 60000;
    await new Promise((r) => setTimeout(r, 80));
    ok((await p.final()).activa, 'deja de vigilar en el minuto 25 del draft con la partida en juego');
    p.pantalla = pantallaDeFinal();
    ok(await p.hasta(async () => (await p.final()).resultado === 'perdi'), 'no lee la tabla de una partida larga');
    const f = await p.final();
    ok(Math.abs(f.duracion - 26) < 0.5, `la duración no es la de la partida: ${f.duracion}`);
    eq(fundirFinal([], f, { completoDesde: desde }).duracion, f.duracion, 'la app no apunta la duración de una partida larga');
  } finally { p.cerrar(); }
});

test('con la partida apuntada en la app se deja de vigilar aunque la tabla no se viera (3.44.1); la tabla sin palabra conocida da la duración', async () => {
  const juegoPng = escribirPng(ampliada(pantallas.find((p) => p.f.startsWith('juego-')).img, 3));
  const draftPng = escribirPng(ampliada(pantallas.find((p) => p.f === 'fuera-0.png').img, 3));
  const p = await lectorDePrueba();
  try {
    const desde = Date.now();
    await p.vigilar({ desde });
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
    // Otro draft (otro instante) no se para por un resultado viejo.
    const otro = desde + 1;
    await p.vigilar({ desde: otro });
    await p.resultado({ ids: [], gane: true, desde });
    eq((await p.final()).activa, true, 'el resultado de una partida para la vigilancia de otra');
    // Y la tabla vista sin palabra conocida (la de victoria hasta aprenderla): su duración.
    const q = await lectorDePrueba({ resultados: { ...plantillasDeSerie(), perdi: [] } });
    try {
      // Su propio instante de draft, y la tabla al 12,05: el reloj suma el
      // tiempo real de la prueba, y con el 12,5 y el `desde` de arriba una
      // máquina lenta pasaba del 13 antes de ver la tabla (dijo «tarde»).
      const desdeQ = Date.now();
      await q.vigilar({ desde: desdeQ });
      q.pantalla = draftPng; q.desfase = 2 * 60000;
      await new Promise((r2) => setTimeout(r2, 80));
      q.pantalla = juegoPng;
      ok(await q.hasta(async () => (await q.final()).inicio != null), 'no ve empezar la partida');
      const i2 = (await q.final()).inicio;
      q.desfase = i2 - desdeQ + 12.05 * 60000;
      q.pantalla = pantallaDeFinal();
      ok(await q.hasta(async () => (await q.final()).duracion != null), 'una tabla sin palabra conocida no da la duración');
      eq((await q.final()).resultado, null, 'la prueba necesita una tabla SIN palabra conocida');
    } finally { q.cerrar(); }
  } finally { p.cerrar(); }
});

test('sin ver empezar la partida, el inicio se estima y se marca (la app no apunta esa duración)', async () => {
  let desfase = 0;
  const ahora = () => Date.now() + desfase;
  const servidor = crearServidor({ capturar: () => capturaCompletaPng(), ahora, vigilancia: { ...VIGILANCIA, intervaloMs: 15, intervaloInicioMs: 15 }, enHilos: false });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const cab = { Origin: 'https://srchipiron.github.io', 'Content-Type': 'application/json' };
  try {
    const desde = Date.now();
    await fetch(`${base}/vigilar`, { method: 'POST', headers: cab, body: JSON.stringify({ desde }) });
    desfase = VIGILANCIA.desdeMin * 60000 + 1000;
    const t0 = Date.now();
    let f;
    while (Date.now() - t0 < 8000) { f = await (await fetch(`${base}/final`, { headers: cab })).json(); if (f.inicio) break; await new Promise((r) => setTimeout(r, 20)); }
    ok(f.inicio === desde + VIGILANCIA.inicioEstimadoMin * 60000 && f.inicioEstimado === true, `el inicio no se estima y se marca: ${JSON.stringify({ inicio: f.inicio, est: f.inicioEstimado })}`);
  } finally { servidor.close(); }
});

test('SEGURIDAD: la ruta /voz ya no existe (3.96.0) y un cuerpo enorme en /vigilar se contesta', async () => {
  const servidor = crearServidor({ capturar: () => capturaCompletaPng(), vigilancia: { ...VIGILANCIA, intervaloMs: 15, intervaloInicioMs: 15 }, enHilos: false });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const cab = { Origin: 'https://srchipiron.github.io', 'Content-Type': 'application/json' };
  try {
    eq((await fetch(`${base}/voz`, { method: 'POST', headers: cab, body: '{"callar":true}' })).status, 404, '/voz sigue contestando');
    const r = await fetch(`${base}/vigilar`, { method: 'POST', headers: cab, body: JSON.stringify({ desde: Date.now(), x: 'x'.repeat(80000) }) }).then((x) => x.status).catch(() => 'cortado');
    ok(r === 400 || r === 'cortado', `un cuerpo enorme no se rechaza: ${r}`);
  } finally { servidor.close(); }
});

test('nunca hacia atrás (3.86.3): un /vigilar de un draft más viejo no quita la partida que ya se vigila', async () => {
  const registro = [];
  const p = await lectorDePrueba({ registrar: (l) => registro.push(l) });
  try {
    const viejo = Date.now() - 20 * 60000, nuevo = Date.now() - 2 * 60000;
    await p.vigilar({ desde: nuevo });
    eq((await p.final()).desde, nuevo);
    // El móvil, con su draft viejo abierto, vuelve a pedirlo (lo hace cada vez que /final no es el suyo).
    await p.vigilar({ desde: viejo });
    await p.vigilar({ desde: viejo });
    eq((await p.final()).desde, nuevo, 'un draft más viejo quita la partida que se vigila');
    eq(registro.filter((l) => /No vuelvo a vigilar/.test(l)).length, 1, 'no lo dice, o lo dice en cada petición');
    // Uno más nuevo sí entra.
    const otro = Date.now() - 30000;
    await p.vigilar({ desde: otro });
    eq((await p.final()).desde, otro, 'un draft más nuevo no entra');
  } finally { p.cerrar(); }
});

await terminar('scripts/directo-lector');
