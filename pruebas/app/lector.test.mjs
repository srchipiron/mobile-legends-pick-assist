/**
 * La parte de la app del botón «Leer del juego» (src/app/lector.js): qué
 * nombres mete y cómo dice cada fallo.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { pedirLectura, nombresDeLectura, corregirLectura } from '../../src/app/lector.js';

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

await terminar('app/lector');
