/**
 * La vigilancia del final (scripts/lector/vigilancia.mjs): en partida o no
 * por el minimapa (partida.mjs), el inicio medido o estimado, la duración
 * hasta la tabla, la ráfaga al perder el minimapa y nunca hacia atrás. Con
 * la tablet y el reloj en manos de la prueba.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { after } from 'node:test';
import { test, ok, eq, RAIZ } from '../ayuda.mjs';
import { leerPng } from '../../scripts/lector/png.mjs';
import { parecidoAPartida, enPartida, UMBRAL_PARTIDA } from '../../scripts/lector/partida.mjs';
import { crearVigilancia, tocaCapturarFinal, VIGILANCIA } from '../../scripts/lector/vigilancia.mjs';
import { plantillasDeSerie } from '../../scripts/lector/servir.mjs';
import { capturaCompleta, pantallaDeFinal } from '../fixtures/juego/captura.mjs';
import { arrancar } from '../fixtures/juego/lector.mjs';

const CARPETA = join(RAIZ, 'pruebas/fixtures/juego/pantallas');
const pantallas = readdirSync(CARPETA).filter((f) => f.endsWith('.png')).map((f) => ({ f, img: leerPng(readFileSync(join(CARPETA, f))) }));
/** Una pantalla de 160 px ampliada (vecino más cercano), como si fuera una captura de la tablet. */
const ampliada = (img, k = 3) => {
  const ancho = img.ancho * k, alto = img.alto * k, rgba = new Uint8Array(ancho * alto * 4);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) rgba.set(img.rgba.subarray(((Math.floor(y / k) * img.ancho) + Math.floor(x / k)) * 4, ((Math.floor(y / k) * img.ancho) + Math.floor(x / k)) * 4 + 4), (y * ancho + x) * 4);
  return { ancho, alto, rgba };
};
const pantalla = (f, k = 3) => ampliada(pantallas.find((p) => p.f === f).img, k);
const JUEGO = pantalla('juego-17.png'), DRAFT = pantalla('fuera-0.png'), TABLA = leerPng(pantallaDeFinal());
const plantillas = plantillasDeSerie();

const abiertas = [];
after(() => { for (const v of abiertas) v.parar(); });
/** Una vigilancia con la pantalla y el reloj de la prueba (`p.desfase` suma al reloj real). */
function vigilanciaDePrueba(opciones = {}) {
  const p = { pantalla: DRAFT, desfase: 0, capturas: 0, registro: [], cola: [] };
  p.v = crearVigilancia({
    capturar: async () => { p.capturas += 1; return p.cola.length ? p.cola.shift() : p.pantalla; }, resultados: plantillas,
    ahora: () => Date.now() + p.desfase, registrar: (l) => p.registro.push(l), vigilancia: { ...VIGILANCIA, intervaloMs: 15, intervaloInicioMs: 15 }, ...opciones,
  });
  p.final = () => p.v.estado();
  p.hasta = async (cond, ms = 8000) => { const t0 = Date.now(); while (!cond() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 15)); return cond(); };
  abiertas.push(p.v);
  return p;
}

test('en partida o no, por el minimapa: las pantallas de juego que la plantilla no vio pasan, las de antes y después no', () => {
  const juego = pantallas.filter((p) => p.f.startsWith('juego-'));
  const fuera = pantallas.filter((p) => p.f.startsWith('fuera-'));
  ok(juego.length >= 8 && fuera.length >= 8, 'faltan pantallas de prueba');
  for (const p of juego) ok(enPartida(p.img), `${p.f} no se ve en partida (${parecidoAPartida(p.img).toFixed(3)})`);
  for (const p of fuera) ok(!enPartida(p.img), `${p.f} se ve en partida (${parecidoAPartida(p.img).toFixed(3)})`);
  ok(!enPartida(capturaCompleta()), 'la pantalla del draft se ve en partida');
  ok(!enPartida(TABLA), 'la tabla del final se ve en partida');
  const grande = ampliada(juego[0].img, 15);
  ok(Math.abs(parecidoAPartida(grande) - parecidoAPartida(juego[0].img)) < 0.05, `una captura grande no da lo mismo que su miniatura: ${parecidoAPartida(grande)} frente a ${parecidoAPartida(juego[0].img)}`);
  ok(UMBRAL_PARTIDA > 0.42 && UMBRAL_PARTIDA < 0.5, 'el umbral no está entre lo medido');
});

test('el inicio se ve por el minimapa (una pantalla de juego suelta no cuenta) y al acabar se mide la duración', async () => {
  const p = vigilanciaDePrueba();
  const desde = Date.now();
  p.v.vigilar(desde);
  // Minuto 0,5 del draft: ya se mira la tablet (la partida puede empezar a los 15 s), y el draft no cuenta.
  p.desfase = 30000;
  ok(await p.hasta(() => p.capturas >= 1), 'no mira la tablet en el primer minuto tras el draft');
  p.desfase = 120000;
  await new Promise((r) => setTimeout(r, 80));
  eq(p.final().inicio, null, 'el draft cuenta como partida');
  p.cola.push(JUEGO);
  const antes = p.capturas;
  ok(await p.hasta(() => p.capturas >= antes + 3), 'no sigue capturando');
  eq(p.final().inicio, null, 'una sola pantalla de juego suelta arranca el reloj');
  p.pantalla = JUEGO;
  ok(await p.hasta(() => p.final().inicio != null), 'no ve empezar la partida');
  const inicio = p.final().inicio;
  ok(inicio <= Date.now() + p.desfase && inicio > desde, `el inicio no cae entre el draft y ahora: ${inicio}`);
  // El reloj suma el tiempo real: la duración se acota entre antes y después de poner la tabla.
  p.desfase = inicio - desde + 15 * 60000;
  const minutosReales = () => (Date.now() - desde) / 60000;
  const antesDeLaTabla = minutosReales();
  p.pantalla = TABLA;
  ok(await p.hasta(() => p.final().resultado === 'perdi'), 'no lee la tabla');
  const f = p.final();
  ok(f.duracion >= 15 + antesDeLaTabla - 0.05 && f.duracion <= 15 + minutosReales() + 0.05 && f.inicioEstimado === false, `la duración no es la de la partida: ${f.duracion}`);
  eq(f.activa, false, 'con el resultado leído sigue vigilando');
});

test('la ráfaga del final: cuándo toca capturar, al paso de siempre o deprisa mientras dura', () => {
  const v = VIGILANCIA, latido = Math.min(v.intervaloMs, v.intervaloInicioMs, v.rapidoMs);
  ok(v.rapidoMs <= 2000 && v.rafagaMs >= 60000, `la ráfaga no es rápida o no dura: ${v.rapidoMs} ms durante ${v.rafagaMs} ms`);
  const t = 1_000_000;
  ok(!tocaCapturarFinal({ ultimaFinal: t - 2000 }, t, v, latido), 'en partida captura cada 2 s');
  ok(tocaCapturarFinal({ ultimaFinal: t - v.intervaloMs + latido / 2 }, t, v, latido), 'un latido un pelo antes de los 10 s deja la captura para el siguiente');
  ok(tocaCapturarFinal({ ultimaFinal: t - v.rapidoMs, rafagaHasta: t + 1000 }, t, v, latido), 'en la ráfaga no captura deprisa');
  ok(!tocaCapturarFinal({ ultimaFinal: t - v.rapidoMs, rafagaHasta: t - 1 }, t, v, latido), 'la ráfaga no acaba');
});

test('la ráfaga empieza al dejar de verse el minimapa, no en partida', async () => {
  const p = vigilanciaDePrueba({ vigilancia: { ...VIGILANCIA, desdeMin: 0, intervaloMs: 15, intervaloInicioMs: 15, rapidoMs: 15 } });
  p.pantalla = JUEGO;
  p.v.vigilar(Date.now());
  ok(await p.hasta(() => p.capturas >= 3), 'no captura en partida');
  ok(!p.registro.some((l) => /Sin minimapa/.test(l)), 'en partida empieza la ráfaga');
  p.pantalla = DRAFT;
  const antes = p.capturas;
  ok(await p.hasta(() => p.capturas >= antes + 2), 'deja de capturar');
  ok(p.registro.some((l) => /Sin minimapa/.test(l)), 'sin minimapa no empieza la ráfaga');
});

test('la pantalla de después de la partida (4.0.6): la primera sin minimapa se guarda ENTERA una vez, no cada fotograma de la ráfaga', async () => {
  const guardadas = [];
  const [f0, f1] = ['fuera-0.png', 'fuera-2.png'].map((f) => pantalla(f));
  const p = vigilanciaDePrueba({ vigilancia: { ...VIGILANCIA, desdeMin: 0, intervaloMs: 15, intervaloInicioMs: 15, rapidoMs: 15, rafagaMs: 60000, hastaMin: 600, partidaHastaMin: 600 }, guardarPantalla: (img, id) => guardadas.push({ img, id }) });
  const pasar = async (n = 3) => { const antes = p.capturas; await p.hasta(() => p.capturas >= antes + n); };
  p.pantalla = JUEGO;
  p.v.vigilar(Date.now());
  await pasar();
  eq(guardadas.length, 0, 'en partida guarda pantallas enteras');
  eq(p.final().pantalla, null);
  p.cola.push(f0);
  p.pantalla = f1;
  await pasar(4);
  eq(guardadas.length, 1, `guarda ${guardadas.length} pantallas enteras al salir de la partida (una)`);
  ok(guardadas[0].img === f0, 'la que guarda no es la primera sin minimapa (o no va entera)');
  const primera = p.final().fotogramas.find((f) => f.rafaga);
  ok(guardadas[0].id === primera?.id && p.final().pantalla === primera.id, `la guardada no es la primera de la ráfaga: ${guardadas[0].id} / ${primera?.id}`);
});

test('en partida, una captura por paso aunque el reloj lata más deprisa', async () => {
  const p = vigilanciaDePrueba({ vigilancia: { ...VIGILANCIA, desdeMin: 0, intervaloMs: 100000, intervaloInicioMs: 100000, rapidoMs: 15 } });
  p.pantalla = JUEGO;
  p.v.vigilar(Date.now());
  await new Promise((r) => setTimeout(r, 400));
  eq(p.capturas, 1, `captura a cada latido y no a cada paso: ${p.capturas}`);
});

test('las pantallas de la ráfaga no las saca el vestíbulo de después, y las de partida se marcan', async () => {
  const [f0, f1, f4, f5, f7] = ['fuera-0.png', 'fuera-2.png', 'fuera-4.png', 'fuera-5.png', 'fuera-7.png'].map((f) => pantalla(f));
  const p = vigilanciaDePrueba({ vigilancia: { ...VIGILANCIA, desdeMin: 0, intervaloMs: 15, intervaloInicioMs: 15, rapidoMs: 15, rafagaMs: 60000, maxFotogramas: 3, hastaMin: 600, partidaHastaMin: 600 } });
  const pasar = async (n = 3) => { const antes = p.capturas; await p.hasta(() => p.capturas >= antes + n); };
  p.pantalla = JUEGO;
  p.v.vigilar(Date.now());
  await pasar();
  for (const x of [f0, f1]) { p.pantalla = x; await pasar(); }
  const fotos = p.final().fotogramas;
  const enLaRafaga = fotos.filter((f) => f.rafaga).map((f) => f.id);
  ok(enLaRafaga.length === 2 && fotos.every((f) => f.rafaga || f.enPartida), `las del final no van marcadas: ${JSON.stringify(fotos.map((f) => [f.rafaga, !!f.enPartida]))}`);
  ok(fotos.every((f) => !('marcador' in f)), 'los fotogramas aún llevan el marcador');
  p.desfase = 120000;
  for (const x of [f4, f5, f7]) { p.pantalla = x; await pasar(); }
  const quedan = p.final().fotogramas;
  ok(enLaRafaga.every((id) => quedan.some((f) => f.id === id)), `el vestíbulo se lleva las del final: ${quedan.map((f) => `${f.id.slice(-12)}${f.rafaga ? '*' : ''}`).join(', ')}`);
});

test('ya en partida al empezar a mirar: el inicio sale ESTIMADO (y la partida no se apunta con esa duración)', async () => {
  const p = vigilanciaDePrueba();
  p.v.vigilar(Date.now());
  p.pantalla = JUEGO;
  p.desfase = 2 * 60000;
  ok(await p.hasta(() => p.final().inicio != null), 'no da la partida por empezada');
  eq(p.final().inicioEstimado, true, 'un inicio que no se vio llegar sale como medido');
  p.desfase = 15 * 60000;
  p.pantalla = TABLA;
  ok(await p.hasta(() => p.final().resultado === 'perdi'), 'no lee la tabla');
  ok(p.final().duracion > 0 && p.final().inicioEstimado, 'no calcula la duración (aunque sea estimada) o pierde la marca');
});

test('la partida empieza a los 30 s del draft: el inicio se ve llegar, sale MEDIDO, y su duración', async () => {
  const p = vigilanciaDePrueba();
  const desde = Date.now();
  p.desfase = 10000;
  p.v.vigilar(desde);
  await new Promise((r) => setTimeout(r, 80));
  p.desfase = 30000;
  p.pantalla = JUEGO;
  ok(await p.hasta(() => p.final().inicio != null), 'no ve empezar la partida');
  const { inicio, inicioEstimado } = p.final();
  eq(inicioEstimado, false, 'una partida que empieza antes del minuto 1 del draft sale con el inicio estimado');
  ok(inicio > desde && inicio < desde + 60000, `el inicio no cae en el primer minuto: ${(inicio - desde) / 1000} s`);
  p.desfase = inicio - Date.now() + 14 * 60000;
  p.pantalla = TABLA;
  ok(await p.hasta(() => p.final().resultado === 'perdi'), 'no lee la tabla');
  ok(Math.abs(p.final().duracion - 14) < 0.5, `la duración no es la de la partida: ${p.final().duracion}`);
});

const servidores = [];
after(() => Promise.all(servidores.map((s) => s.cerrar())));

test('el draft se cierra con la partida empezada: si las lecturas del draft la vieron empezar, el inicio sale MEDIDO aunque la vigilancia llegue tarde', async () => {
  const juego = pantalla('juego-17.png', 15);
  const reloj = { desfase: 0, img: capturaCompleta() };
  const ahora = () => Date.now() + reloj.desfase;
  const s = await arrancar({ capturar: async () => reloj.img, ahora, vigilancia: { ...VIGILANCIA, intervaloMs: 15, intervaloInicioMs: 15 } });
  servidores.push(s);
  const t0 = Date.now();
  const fueraAntes = ahora();
  eq((await s.interno.leer()).lectura.partida, false, 'el draft se lee como partida');
  const fueraDespues = ahora();
  reloj.img = juego; reloj.desfase = 20000;
  const dentroAntes = ahora();
  eq((await s.interno.leer({ rapida: true })).lectura.partida, true, 'la partida no se lee como partida');
  const dentroDespues = ahora();
  // La segunda, lejos: el inicio sale de la PRIMERA de dentro, no de la última.
  reloj.desfase = 50000;
  eq((await s.interno.leer({ rapida: true })).lectura.partida, true);
  reloj.desfase = 55000;
  s.interno.vigilar(t0 + 55000);
  const { inicio, inicioEstimado } = s.interno.final();
  eq(inicioEstimado, false, 'con las lecturas viendo empezar la partida, el inicio sale estimado');
  ok(inicio >= (fueraAntes + dentroAntes) / 2 - 1 && inicio <= (fueraDespues + dentroDespues) / 2 + 1, `el inicio no es el punto medio entre la última lectura fuera y la PRIMERA dentro: ${(inicio - t0) / 1000} s`);
  // Sin una lectura FUERA antes: no se sabe cuándo empezó.
  const otro = { img: juego };
  const q = await arrancar({ capturar: async () => otro.img, vigilancia: { ...VIGILANCIA, intervaloMs: 15, intervaloInicioMs: 15 } });
  servidores.push(q);
  await q.interno.leer({ rapida: true }); await q.interno.leer({ rapida: true });
  q.interno.vigilar(Date.now());
  const desde = Date.now();
  while (q.interno.final().inicio == null && Date.now() - desde < 8000) await new Promise((r) => setTimeout(r, 15));
  eq(q.interno.final().inicioEstimado, true, 'sin ver la tablet fuera, el inicio sale medido');
});

test('una partida de más de 23 minutos también se mide: con el inicio visto se vigila pasado el minuto 25 del draft', async () => {
  const p = vigilanciaDePrueba();
  const desde = Date.now();
  p.v.vigilar(desde);
  p.desfase = 2 * 60000;
  await new Promise((r) => setTimeout(r, 80));
  p.pantalla = JUEGO;
  ok(await p.hasta(() => p.final().inicio != null), 'no ve empezar la partida');
  const { inicio, inicioEstimado } = p.final();
  eq(inicioEstimado, false);
  p.desfase = inicio - Date.now() + 26 * 60000;
  await new Promise((r) => setTimeout(r, 80));
  ok(p.final().activa, 'deja de vigilar en el minuto 25 del draft con la partida en juego');
  p.pantalla = TABLA;
  ok(await p.hasta(() => p.final().resultado === 'perdi'), 'no lee la tabla de una partida larga');
  ok(Math.abs(p.final().duracion - 26) < 0.5, `la duración no es la de la partida: ${p.final().duracion}`);
});

test('con la partida apuntada (contestada) se deja de vigilar aunque la tabla no se viera; otro draft no se para; la tabla sin palabra conocida da la duración', async () => {
  const p = vigilanciaDePrueba();
  const desde = Date.now();
  p.v.vigilar(desde);
  p.desfase = 2 * 60000;
  await new Promise((r) => setTimeout(r, 80));
  p.pantalla = JUEGO;
  ok(await p.hasta(() => p.final().inicio != null), 'no ve empezar la partida');
  ok(p.v.terminar(desde) && p.final().activa === false && p.final().acabada, 'apuntada, sigue vigilando esa partida');
  const otro = desde + 1;
  p.v.vigilar(otro);
  ok(!p.v.terminar(desde) && p.final().activa === true, 'el resultado de una partida para la vigilancia de otra');
  const q = vigilanciaDePrueba({ resultados: { ...plantillas, perdi: [] } });
  const desdeQ = Date.now();
  q.v.vigilar(desdeQ);
  q.desfase = 2 * 60000;
  await new Promise((r) => setTimeout(r, 80));
  q.pantalla = JUEGO;
  ok(await q.hasta(() => q.final().inicio != null), 'no ve empezar la partida');
  q.desfase = q.final().inicio - desdeQ + 12.05 * 60000;
  q.pantalla = TABLA;
  ok(await q.hasta(() => q.final().duracion != null), 'una tabla sin palabra conocida no da la duración');
  ok(q.final().resultado === null && q.final().acabada, 'la prueba necesita una tabla SIN palabra conocida, que acaba la partida');
});

test('sin ver empezar la partida, el inicio se estima y se marca', async () => {
  const p = vigilanciaDePrueba();
  p.pantalla = capturaCompleta();
  const desde = Date.now();
  p.v.vigilar(desde);
  p.desfase = VIGILANCIA.desdeMin * 60000 + 1000;
  ok(await p.hasta(() => p.final().inicio != null), 'no estima el inicio');
  const f = p.final();
  ok(f.inicio === desde + VIGILANCIA.inicioEstimadoMin * 60000 && f.inicioEstimado === true, `el inicio no se estima y se marca: ${JSON.stringify({ inicio: f.inicio, est: f.inicioEstimado })}`);
});

test('nunca hacia atrás: un draft más viejo no quita la partida que ya se vigila (y se dice una vez)', () => {
  const p = vigilanciaDePrueba();
  const viejo = Date.now() - 20 * 60000, nuevo = Date.now() - 2 * 60000;
  p.v.vigilar(nuevo);
  eq(p.final().desde, nuevo);
  p.v.vigilar(viejo);
  p.v.vigilar(viejo);
  eq(p.final().desde, nuevo, 'un draft más viejo quita la partida que se vigila');
  eq(p.registro.filter((l) => /No vuelvo a vigilar/.test(l)).length, 1, 'no lo dice, o lo dice en cada petición');
  const otro = Date.now() - 30000;
  p.v.vigilar(otro);
  eq(p.final().desde, otro, 'un draft más nuevo no entra');
});
