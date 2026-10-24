/**
 * Un solo aparato (3.66.0, scripts/lector/solo.mjs): Lector MLBB junta las
 * lecturas en un draft, decide con el motor de la app y pone el consejo de la
 * burbuja; se aparta si el móvil lee o manda el suyo, y en partida solo mira
 * el minimapa.
 */
import { test, ok, eq, terminar, leerJson } from '../arnes.mjs';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { acumularDraft, draftVacio, consejoSolo, crearSolo, leerAjustesSolo, datosDelSolo, CAMBIOS_A_LA_VEZ, MINUTOS_PARA_OTRO_DRAFT, MOVIL_ACTIVO_MS, INTERVALOS_SOLO } from '../../scripts/lector/solo.mjs';
import { prepararDatos, recomendar } from '../../src/motor/draft.js';
import { crearServidor } from '../../scripts/lector/servir.mjs';
import { RAIZ } from '../arnes.mjs';

const catalogo = leerJson('public/data/heroes.json');
const meta = leerJson('public/data/roam-meta.json');
const datos = prepararDatos({ catalogo, meta, rango: 'glory' });
const N = (n) => ({ nombre: n });
const V = { nombre: null };
const lectura = ({ tuyos = [], suyos = [], enemigos = [V, V, V, V, V], aliados = [V, V, V, V, V], tuyoFila = -1, partida = false } = {}) => ({ tuyos, suyos, enemigos, aliados, tuyoFila, partida });

test('el draft junta lo leído: baneos de los dos lados sin repetir, huecos por jugador y tu fila', () => {
  let d = acumularDraft(null, lectura({ tuyos: [N('Hirara'), V], suyos: [N('Hirara'), N('Belerick')] }), 1000);
  eq(d.baneos.join(), 'Hirara,Belerick');
  d = acumularDraft(d, lectura({ enemigos: [N('Clint'), V, V, V, V], aliados: [N('Gord'), V, V, V, N('Estes')], tuyoFila: 4 }), 2000);
  eq(d.enemigos[0], 'Clint'); eq(d.aliados[4], 'Estes'); eq(d.tuyoFila, 4);
  // Un «?» no borra lo leído; el héroe que el jugador solo miraba se cambia por el que coge.
  d = acumularDraft(d, lectura({ enemigos: [N('Khufra'), V, V, V, V] }), 3000);
  eq(d.enemigos[0], 'Khufra', 'el hueco no cambia al héroe que coge de verdad');
  eq(d.aliados[0], 'Gord', 'un «?» borra lo leído');
});

test('la fase de skins (muchos huecos cambiando a la vez) no toca ese equipo', () => {
  let d = acumularDraft(null, lectura({ enemigos: [N('Clint'), N('Khufra'), N('Layla'), N('Saber'), V] }), 1);
  d = acumularDraft(d, lectura({ enemigos: [N('Wanwan'), N('Wanwan'), N('Joy'), N('Joy'), V] }), 2);
  eq(d.enemigos.slice(0, 4).join(), 'Clint,Khufra,Layla,Saber', `más de ${CAMBIOS_A_LA_VEZ} cambios a la vez entran`);
});

test('la partida cierra el draft y uno nuevo empieza tras unos minutos, no con las pantallas del final', () => {
  let d = acumularDraft(null, lectura({ tuyos: [N('Hirara')], enemigos: [N('Clint'), V, V, V, V] }), 0);
  d = acumularDraft(d, lectura({ partida: true }), 10_000);
  ok(!d.cerrado, 'una sola lectura en partida cierra');
  d = acumularDraft(d, lectura({ partida: true }), 20_000);
  ok(d.cerrado, 'dos lecturas en partida no cierran el draft');
  d = acumularDraft(d, lectura({ tuyos: [N('Masha')] }), 30_000);
  ok(d.cerrado && d.baneos.join() === 'Hirara', 'una pantalla de nada más acabar abre otro draft');
  d = acumularDraft(d, lectura({ tuyos: [N('Masha')] }), 20_000 + MINUTOS_PARA_OTRO_DRAFT * 60000 + 1);
  ok(!d.cerrado && d.baneos.join() === 'Masha' && !d.enemigos.some(Boolean), `el draft siguiente no empieza de cero: ${JSON.stringify(d)}`);
  eq(acumularDraft(draftVacio(), lectura({ partida: true }), 1).enPartida, 1);
  ok(!acumularDraft(acumularDraft(draftVacio(), lectura({ partida: true }), 1), lectura({ partida: true }), 2).cerrado, 'sin draft leído, la partida cierra un draft vacío');
});

test('el consejo sale del motor de la app: en baneos a quién banear, en picks tu nº1 y los dos siguientes', () => {
  const enBaneos = consejoSolo({ datos, draft: acumularDraft(null, lectura({ tuyos: [N('Hirara')] }), 1), linea: 'roam' });
  ok(/^Banea: .+ · .+ · .+$/.test(enBaneos?.titulo ?? ''), `en baneos no dice tres a banear: ${JSON.stringify(enBaneos)}`);
  ok(!/Hirara/.test(enBaneos.titulo), 'propone banear a uno ya baneado');
  ok(/^Fase de baneos · Tu nº1 ahora: /.test(enBaneos.detalle ?? ''), `en baneos no dice la fase o no recuerda tu nº1: ${enBaneos.detalle}`);
  const draft = acumularDraft(null, lectura({ tuyos: [N('Hirara')], enemigos: [N('Clint'), N('Khufra'), V, V, V] }), 1);
  const c = consejoSolo({ datos, draft, linea: 'roam' });
  // La MISMA decisión que la app con ese draft.
  const H = (n) => datos.heroes.find((h) => h.name === n);
  const rec = recomendar(datos, { linea: 'roam', enemigos: [H('Clint'), H('Khufra')], aliados: [], baneos: [H('Hirara')], conSimulacion: false });
  eq(c.titulo, `${rec.eleccion.heroe.name} ${Math.round(rec.eleccion.p * 100)}%`, 'el consejo de la tablet no es el de la app');
  ok(/^Fase de picks · Luego: .+ \d+% · .+ \d+%$/.test(c.detalle ?? ''), `no dice la fase o los dos siguientes: ${c.detalle}`);
  ok(/^Pick phase · Then: /.test(consejoSolo({ datos, draft, linea: 'roam', idioma: 'en' }).detalle), 'en inglés sale en español');
  eq(consejoSolo({ datos, draft, linea: 'pato' }), null, 'una línea que no existe da consejo');
  eq(consejoSolo({ datos: null, draft, linea: 'roam' }), null);
  eq(consejoSolo({ datos, draft: draftVacio(), linea: 'roam' }), null, 'sin nada leído da consejo');
  eq(consejoSolo({ datos, draft: { ...draft, cerrado: true }, linea: 'roam' }), null, 'en partida da consejo');
});

test('los ajustes de la APK: sin línea, apagado; nada raro entra', () => {
  const casa = mkdtempSync(join(tmpdir(), 'solo-'));
  const f = join(casa, 'solo.json');
  eq(leerAjustesSolo(f).activo, false, 'sin fichero está encendido');
  writeFileSync(f, JSON.stringify({ linea: 'mid', idioma: 'en', rango: 'mythic' }));
  const a = leerAjustesSolo(f);
  ok(a.activo && a.linea === 'mid' && a.idioma === 'en' && a.rango === 'mythic', JSON.stringify(a));
  writeFileSync(f, JSON.stringify({ linea: 'mid', activo: false }));
  eq(leerAjustesSolo(f).activo, false, 'apagado sigue encendido');
  writeFileSync(f, JSON.stringify({ linea: '../x', rango: '<script>' }));
  ok(!leerAjustesSolo(f).activo && leerAjustesSolo(f).rango === 'glory', 'entra una línea o un rango raro');
  writeFileSync(f, '{roto');
  eq(leerAjustesSolo(f).activo, false);
});

test('el bucle: decide y pone el consejo; se aparta si el móvil lee o manda el suyo; en partida solo el minimapa', async () => {
  let t = 1_000_000;
  const puestos = [], pedidas = [];
  let respuesta = lectura({ tuyos: [N('Hirara')], enemigos: [N('Clint'), V, V, V, V] });
  let movil = { leyo: null, consejo: null };
  const interno = { leer: async (op) => { pedidas.push(op); return { ok: true, lectura: respuesta }; }, delMovil: () => movil, ponerConsejo: (c) => puestos.push(c) };
  const solo = crearSolo({ interno, ajustes: () => ({ activo: true, linea: 'roam', rango: 'glory', idioma: 'es' }), datosPara: () => datos, ahora: () => t });
  eq(await solo.tic(), INTERVALOS_SOLO.draft);
  eq(puestos.length, 1, 'no pone el consejo');
  ok(pedidas[0]?.rapida === true, 'no pide la lectura rápida (en partida reconocería caras)');
  await solo.tic();
  eq(puestos.length, 1, 'repite el mismo consejo en cada vuelta');
  // El móvil acaba de leer: la tablet no lee ni pisa nada.
  movil = { leyo: t - 1000, consejo: null };
  const antes = pedidas.length;
  eq(await solo.tic(), INTERVALOS_SOLO.vacio);
  eq(pedidas.length, antes, 'lee con el móvil leyendo (dos lecturas a la vez)');
  movil = { leyo: null, consejo: t - 1000 };
  respuesta = lectura({ tuyos: [N('Hirara')], enemigos: [N('Clint'), N('Khufra'), V, V, V] });
  await solo.tic();
  eq(puestos.length, 1, 'pisa el consejo del móvil');
  // Pasado el minuto del móvil, vuelve.
  t += MOVIL_ACTIVO_MS + 1;
  await solo.tic();
  eq(puestos.length, 2, 'sin el móvil no vuelve a decidir');
  // En partida: cierra y espera más.
  respuesta = { partida: true, rapida: true };
  await solo.tic();
  eq(await solo.tic(), INTERVALOS_SOLO.partida, 'en partida no espera más');
  ok(solo.estado().cerrado, 'la partida no cierra el draft');
  // Apagado, no lee.
  const apagado = crearSolo({ interno, ajustes: () => ({ activo: false }), datosPara: () => datos });
  const n = pedidas.length;
  await apagado.tic();
  eq(pedidas.length, n, 'apagado lee');
  // Un fallo de captura (no graba) espera y no rompe.
  const roto = crearSolo({ interno: { ...interno, leer: async () => ({ ok: false, estado: 502, error: 'captura' }) }, ajustes: () => ({ activo: true, linea: 'roam' }), datosPara: () => datos });
  eq(await roto.tic(), INTERVALOS_SOLO.error);
});

test('los datos se preparan una vez por fichero y rango', () => {
  const f = { catalogo, meta };
  const para = datosDelSolo(() => f);
  const a = para('glory'); const b = para('glory');
  ok(a === b, 'prepara los datos en cada vuelta');
  ok(para('mythic') !== a, 'cambiar de rango no prepara otros');
  eq(datosDelSolo(() => ({ catalogo: null }))('glory'), null);
});

test('la lectura rápida: en partida solo el minimapa, sin reconocer caras; fuera de partida, la lectura entera', async () => {
  const juego = readFileSync(join(RAIZ, 'pruebas/fixtures/juego/pantallas/juego-17.png'));
  const servidor = crearServidor({ capturar: async () => juego, enHilos: false, guardar: () => {}, guardarResultadosDe: () => {} });
  try {
    const r = await servidor.interno.leer({ rapida: true });
    ok(r.ok && r.lectura.partida === true && r.lectura.rapida === true, `en partida no sale la lectura rápida: ${JSON.stringify(r).slice(0, 200)}`);
    ok(!('tuyos' in r.lectura) && !('enemigos' in r.lectura), 'en partida reconoce caras (puede meter lag al juego)');
    const entera = await servidor.interno.leer({});
    ok(entera.ok && Array.isArray(entera.lectura.tuyos), 'sin «rápida» no hace la lectura entera');
  } finally { servidor.close(); }
});

await terminar('scripts/solo');
