/**
 * La parte de la app del botón «Leer del juego» (src/app/lector.js): qué
 * nombres mete y cómo dice cada fallo.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { pedirLectura, pedirCaptura, cuerpoDePantalla, nombresDeLectura, corregirLectura, dudasDeLectura, tocaLeerSolo, INTERVALO_AUTO_MS, INTERVALO_AUTO_VACIO_MS } from '../../src/app/lector.js';

const heroes = ['Hirara', 'X Borg', 'Clint', 'Khufra', 'Saber'].map((name) => ({ name }));

test('mete los nombres reconocidos con la grafía del catálogo, sin repetir y sin los «?»', () => {
  const n = nombresDeLectura({
    tuyos: [{ nombre: 'Hirara' }, { nombre: null, candidato: 'Saber' }],
    suyos: [{ nombre: 'X.Borg' }, { nombre: 'Hirara' }, { nombre: 'Nadie Nunca' }],
    enemigos: [{ nombre: 'Clint' }, { nombre: null }],
  }, heroes);
  eq(n.baneos.join(), 'Hirara,X Borg', `los baneos salen ${n.baneos}`);
  eq(n.enemigos.join(), 'Clint', `los enemigos salen ${n.enemigos}`);
  eq(nombresDeLectura(null, heroes).baneos.length, 0, 'una lectura vacía mete algo');
});

test('cada fallo del lector tiene su tipo', async () => {
  const tipo = async (pedir, plazoMs = 1000) => { try { await pedirLectura({ pedir, plazoMs }); return 'ok'; } catch (e) { return e.tipo; } };
  eq(await tipo(() => Promise.reject(new TypeError('Failed to fetch'))), 'sinPuente', 'sin lector abierto no dice «sinPuente»');
  eq(await tipo((_, { signal }) => new Promise((_, no) => signal.addEventListener('abort', () => no(new Error('abort')))), 20), 'plazo', 'sin respuesta no dice «plazo»');
  eq(await tipo(() => Promise.resolve(new Response(JSON.stringify({ error: 'captura' }), { status: 502 }))), 'captura', 'un fallo de captura no dice «captura»');
  eq(await tipo(() => Promise.resolve(new Response(JSON.stringify({ error: 'tablet' }), { status: 502 }))), 'tablet', 'sin tablet en la wifi no dice «tablet»');
  eq(await tipo(() => Promise.resolve(new Response(JSON.stringify({ error: 'emparejar' }), { status: 502 }))), 'emparejar', 'sin emparejar no dice «emparejar»');
  eq(await tipo(() => Promise.resolve(new Response(JSON.stringify({ error: 'otro' }), { status: 502 }))), 'error', 'un fallo desconocido no dice «error»');
  eq(await tipo(() => Promise.resolve(new Response('no es json', { status: 200 }))), 'error', 'una respuesta rota no dice «error»');
  const bien = await pedirLectura({ pedir: () => Promise.resolve(new Response(JSON.stringify({ tuyos: [], suyos: [], enemigos: [{ nombre: 'Clint' }] }))) });
  ok(bien.enemigos[0].nombre === 'Clint', 'una lectura buena no se devuelve');
});

test('la corrección devuelve al lector los ids de sus capturas con lo que había de verdad, y no molesta si no hay lector', async () => {
  const pedidas = [];
  const pedir = async (url, opciones) => { pedidas.push({ url, opciones }); return new Response(JSON.stringify({ aprendido: true }), { status: 200 }); };
  const r = await corregirLectura({ ids: ['lectura-1', 'lectura-2'], enemigos: ['Clint', 'Khufra'], baneos: ['Hirara'], pedir });
  ok(r?.aprendido, 'no devuelve lo que contesta el lector');
  eq(pedidas.length, 1, 'no manda la corrección');
  ok(/\/corregir$/.test(pedidas[0].url) && pedidas[0].opciones.method === 'POST', 'no es un POST a /corregir');
  const cuerpo = JSON.parse(pedidas[0].opciones.body);
  eq(`${cuerpo.ids.join()}|${cuerpo.enemigos.join()}|${cuerpo.baneos.join()}`, 'lectura-1,lectura-2|Clint,Khufra|Hirara', `el cuerpo no lleva ids, enemigos y baneos: ${pedidas[0].opciones.body}`);
  // Sin ids (no se leyó nada) o sin enemigos no hay nada que cruzar: ni una petición.
  await corregirLectura({ ids: [], enemigos: ['Clint'], pedir });
  await corregirLectura({ ids: ['lectura-1'], enemigos: [], pedir });
  eq(pedidas.length, 1, 'manda correcciones sin ids o sin enemigos');
  // Sin lector no lanza.
  eq(await corregirLectura({ ids: ['lectura-1'], enemigos: ['Clint'], pedir: () => Promise.reject(new TypeError('Failed to fetch')) }), null, 'sin lector lanza o devuelve algo');
});

test('leyendo solo: cuándo toca y cuándo no, y las dudas compactas de una lectura', () => {
  ok(tocaLeerSolo({ auto: true }), 'con el modo encendido y nada en contra no lee');
  ok(!tocaLeerSolo({ auto: false }), 'con el modo apagado lee');
  ok(!tocaLeerSolo({ auto: true, visible: false }), 'con la app escondida lee (gasta capturas sin nadie mirando)');
  ok(!tocaLeerSolo({ auto: true, hoja: 'enemigos' }), 'con una hoja abierta lee (se está tocando a mano)');
  ok(!tocaLeerSolo({ auto: true, completo: true }), 'con el draft completo sigue leyendo durante la partida');
  ok(!tocaLeerSolo({ auto: true, leyendo: true }), 'lee mientras otra lectura está en marcha');
  ok(INTERVALO_AUTO_MS >= 4000 && INTERVALO_AUTO_VACIO_MS > INTERVALO_AUTO_MS, 'los intervalos no respetan lo que tarda una lectura (4–6 s) ni van más despacio con el draft vacío');
  const dudas = dudasDeLectura({
    tuyos: [{ nombre: 'Hirara', candidato: 'Hirara', parecido: 0.95 }, { nombre: null, candidato: 'Belerick', parecido: 0.713 }],
    suyos: [{ nombre: null, candidato: null, parecido: 0 }],
    enemigos: [{ nombre: null, candidato: 'Clint', parecido: 0.6 }, { nombre: 'Khufra', candidato: 'Khufra', parecido: 0.9 }],
  });
  eq(JSON.stringify(dudas), JSON.stringify([{ hueco: 't2', candidato: 'Belerick', parecido: 0.71 }, { hueco: 'e1', candidato: 'Clint', parecido: 0.6 }]), `las dudas no son las esperadas: ${JSON.stringify(dudas)}`);
  eq(dudasDeLectura(null).length, 0, 'una lectura vacía da dudas');
});

test('la pantalla de resultado (temporal): se pide al lector y va como texto en una incidencia que cabe', async () => {
  const captura = { id: 'resultado-1', ancho: 2400, alto: 1504, miniatura: 'A'.repeat(6000), tira: 'B'.repeat(11000) };
  const c = await pedirCaptura({ pedir: async (url) => { ok(/\/captura$/.test(url), `pide a ${url}`); return new Response(JSON.stringify(captura), { status: 200 }); } });
  eq(c.id, 'resultado-1', 'no devuelve la captura');
  const tipo = async (pedir) => { try { await pedirCaptura({ pedir, plazoMs: 1000 }); return 'ok'; } catch (e) { return e.tipo; } };
  eq(await tipo(() => Promise.reject(new TypeError('Failed to fetch'))), 'sinPuente');
  eq(await tipo(() => Promise.resolve(new Response(JSON.stringify({ error: 'tablet' }), { status: 502 }))), 'tablet');
  eq(await tipo(() => Promise.resolve(new Response(JSON.stringify({ id: 'x' }), { status: 200 }))), 'error', 'una respuesta sin imágenes no es «error»');
  const p = cuerpoDePantalla({ resultado: 'gane', captura, version: '3.29.0' });
  ok(/ganada/.test(p.titulo) && /ganada/.test(p.cuerpo) && p.cuerpo.includes(captura.miniatura) && p.comentario.includes(captura.tira), 'el cuerpo no lleva el resultado y las imágenes');
  ok(/perdida/.test(cuerpoDePantalla({ resultado: 'perdi', captura }).titulo), 'una perdida no se distingue');
  ok(p.cuerpo.length < 65536 && p.comentario.length < 65536, 'no cabe en una incidencia');
});

await terminar('app/lector');
