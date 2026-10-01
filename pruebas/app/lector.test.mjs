/**
 * La parte de la app del botón «Leer del juego» (src/app/lector.js): qué
 * nombres mete y cómo dice cada fallo.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { pedirLectura, pedirFotograma, cuerpoDeFotogramas, tocaVigilarFinal, nombresDeLectura, corregirLectura, dudasDeLectura, tocaLeerSolo, INTERVALO_AUTO_MS, INTERVALO_AUTO_VACIO_MS, INTERVALO_FINAL_MS, DESDE_FINAL_MIN, HASTA_FINAL_MIN, TOPE_MENSAJE } from '../../src/app/lector.js';

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
  // Tu equipo (3.31.0): las otras cuatro filas son compañeros y la tuya (amarilla) es tu pick; sin saber cuál es la tuya, nadie.
  const filas = [{ nombre: 'Clint' }, { nombre: 'Hirara' }, { nombre: null, candidato: 'Saber' }, { nombre: 'X.Borg' }, { nombre: 'Clint' }];
  const con = nombresDeLectura({ aliados: filas, tuyoFila: 1 }, heroes);
  eq(con.aliados.join(), 'Clint,X Borg', `los compañeros salen ${con.aliados}`);
  eq(con.tuyo, 'Hirara', `tu pick sale ${con.tuyo}`);
  const sinFila = nombresDeLectura({ aliados: filas, tuyoFila: -1 }, heroes);
  ok(sinFila.aliados.length === 0 && sinFila.tuyo === null, 'sin saber qué fila es la tuya mete compañeros (uno de ellos serías tú)');
  const filaVacia = nombresDeLectura({ aliados: filas, tuyoFila: 2 }, heroes);
  ok(filaVacia.tuyo === null && filaVacia.aliados.join() === 'Clint,Hirara,X Borg', `con tu fila sin reconocer los otros no entran: ${filaVacia.aliados} / ${filaVacia.tuyo}`);
  ok(dudasDeLectura({ aliados: filas }).some((d) => d.hueco === 'a3' && d.candidato === 'Saber'), 'las dudas no cubren tu equipo (a1–a5)');
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

test('el final de la partida (temporal): cuándo se vigila, qué fotograma se pide y cómo se suben sin pasarse del mensaje', async () => {
  const t0 = 1_700_000_000_000, min = (m) => t0 + m * 60000;
  ok(!tocaVigilarFinal({ auto: true, completoDesde: t0, ahora: min(DESDE_FINAL_MIN - 1) }), 'vigila antes del minuto de empezar (una captura en una teamfight da un tirón)');
  ok(tocaVigilarFinal({ auto: true, completoDesde: t0, ahora: min(DESDE_FINAL_MIN) }), 'no vigila desde el minuto de empezar');
  ok(tocaVigilarFinal({ auto: true, completoDesde: t0, ahora: min(HASTA_FINAL_MIN) }), 'no vigila hasta el minuto de parar');
  ok(!tocaVigilarFinal({ auto: true, completoDesde: t0, ahora: min(HASTA_FINAL_MIN + 1) }), 'sigue vigilando pasado el tope');
  ok(!tocaVigilarFinal({ auto: false, completoDesde: t0, ahora: min(10) }), 'vigila con el modo apagado');
  ok(!tocaVigilarFinal({ auto: true, completoDesde: null, ahora: min(10) }), 'vigila sin draft completo');
  ok(!tocaVigilarFinal({ auto: true, visible: false, completoDesde: t0, ahora: min(10) }), 'vigila con la app escondida');
  ok(INTERVALO_FINAL_MS >= 20000 && DESDE_FINAL_MIN >= 5 && HASTA_FINAL_MIN > DESDE_FINAL_MIN, 'los plazos no son los de una partida (10–20 min) con capturas espaciadas');
  // La petición: con cambio trae las imágenes; sin cambio, solo que no cambió.
  const con = await pedirFotograma({ pedir: async (url) => { ok(/\/captura\?fotograma=1$/.test(url), `pide a ${url}`); return new Response(JSON.stringify({ id: 'fotograma-1', cambio: true, miniatura: 'AAA', tira: 'BBB' }), { status: 200 }); } });
  eq(`${con.cambio} ${con.id}`, 'true fotograma-1');
  eq((await pedirFotograma({ pedir: async () => new Response(JSON.stringify({ id: 'x', cambio: false }), { status: 200 }) })).cambio, false);
  const tipo = async (pedir) => { try { await pedirFotograma({ pedir, plazoMs: 1000 }); return 'ok'; } catch (e) { return e.tipo; } };
  eq(await tipo(() => Promise.reject(new TypeError('Failed to fetch'))), 'sinPuente');
  eq(await tipo(() => Promise.resolve(new Response(JSON.stringify({ error: 'tablet' }), { status: 502 }))), 'tablet');
  eq(await tipo(() => Promise.resolve(new Response(JSON.stringify({ id: 'x' }), { status: 200 }))), 'error', 'una respuesta sin «cambio» no es «error»');
  // La incidencia: resultado, minuto e imágenes; y con muchas, se corta antes de pasarse del mensaje.
  const fotos = Array.from({ length: 8 }, (_, i) => ({ id: `fotograma-${i}`, minuto: 8 + i, miniatura: 'M'.repeat(9000), tira: 'T'.repeat(19000) }));
  const c = cuerpoDeFotogramas({ fotogramas: fotos, resultado: 'gane', version: '3.30.0' });
  ok(/ganada/.test(c.titulo) && /8 pantallas/.test(c.titulo), `el título no dice el resultado y cuántas: ${c.titulo}`);
  ok(c.cuerpo.includes('fotograma-0') && c.cuerpo.includes('minuto 8') && c.cuerpo.length <= TOPE_MENSAJE, `el cuerpo se pasa o no lleva el primero: ${c.cuerpo.length}`);
  ok(c.comentario.includes('fotograma-0') && c.comentario.length <= TOPE_MENSAJE && !c.comentario.includes('fotograma-7'), `el comentario se pasa o no corta: ${c.comentario.length}`);
  ok(/sin apuntar/.test(cuerpoDeFotogramas({ fotogramas: fotos.slice(0, 1) }).titulo), 'sin resultado no lo dice');
});

await terminar('app/lector');
