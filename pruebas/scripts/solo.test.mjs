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
import { acumularDraft, draftVacio, resumenPregunta, BANEOS_DE_OTRO_DRAFT, consejoSolo, crearSolo, leerAjustesSolo, ajustesEfectivos, datosDelSolo, partidaSolo, resumenSolo, decidirSolo, guionSolo, correccionDelDraft, IDS_POR_DRAFT, CAMBIOS_A_LA_VEZ, MINUTOS_PARA_OTRO_DRAFT, MOVIL_ACTIVO_MS, INTERVALOS_SOLO } from '../../scripts/lector/solo.mjs';
import { prepararDatos, recomendar } from '../../src/motor/draft.js';
import { crearServidor } from '../../scripts/lector/servir.mjs';
import { RAIZ } from '../arnes.mjs';
import { crearT } from '../../src/app/i18n/index.js';
import { guionTraducido } from '../../src/app/lector.js';

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

test('sin línea en la APK, la tablet lee con la que mandó la app; «Apagado» manda sobre ella (3.69.3)', () => {
  const sinNada = { activo: false, apagado: false, linea: null, rango: 'glory', idioma: 'es' };
  const movil = { linea: 'jungle', rango: 'mythic', idioma: 'en' };
  const a = ajustesEfectivos(sinNada, movil);
  ok(a.activo && a.linea === 'jungle' && a.rango === 'mythic' && a.idioma === 'en' && a.origen === 'movil', `sin línea en la APK no usa la del móvil: ${JSON.stringify(a)}`);
  eq(ajustesEfectivos({ ...sinNada, apagado: true }, movil).activo, false, '«Apagado» en la APK no manda');
  eq(ajustesEfectivos({ ...sinNada, apagado: true }, movil).origen, 'apagado');
  const apk = ajustesEfectivos({ activo: true, linea: 'mid', rango: 'glory', idioma: 'es' }, movil);
  ok(apk.linea === 'mid' && apk.origen === 'apk', 'la línea del móvil pisa la de la APK');
  eq(ajustesEfectivos(sinNada, { linea: '../x' }).activo, false, 'entra una línea rara del móvil');
  eq(ajustesEfectivos(sinNada, null).origen, 'sinLinea');
  const casa = mkdtempSync(join(tmpdir(), 'solo-apagado-'));
  writeFileSync(join(casa, 'solo.json'), JSON.stringify({ activo: false }));
  eq(leerAjustesSolo(join(casa, 'solo.json')).apagado, true, '«Apagado» no se distingue de no haber elegido nada');
  eq(leerAjustesSolo(join(casa, 'no-existe.json')).apagado, false, 'sin fichero cuenta como apagado');
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
  eq(solo.resumen().apartado, true, 'el resumen no dice que se aparta por el móvil');
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
  // Lo que cuenta en /estado (3.69.3).
  const r = solo.resumen();
  ok(r.activo && r.linea === 'roam' && r.lecturas >= 4 && r.ultima?.enPartida === true && r.apartado === false, `el resumen no cuenta lo que hace: ${JSON.stringify(r)}`);
  // Apagado, no lee.
  const apagado = crearSolo({ interno, ajustes: () => ({ activo: false }), datosPara: () => datos });
  const n = pedidas.length;
  await apagado.tic();
  eq(pedidas.length, n, 'apagado lee');
  // Un fallo de captura (no graba) espera y no rompe.
  const roto = crearSolo({ interno: { ...interno, leer: async () => ({ ok: false, estado: 502, error: 'captura' }) }, ajustes: () => ({ activo: true, linea: 'roam' }), datosPara: () => datos });
  eq(await roto.tic(), INTERVALOS_SOLO.error);
});

test('todo desde la tablet (3.70.0): al empezar la partida vigila el final y, con el resultado, apunta la partida una vez y pone el resumen', async () => {
  let t = 5_000_000;
  let respuesta = lectura({ tuyos: [N('Hirara'), N('Belerick')], suyos: [N('Eudora')], enemigos: [N('Clint'), N('Khufra'), V, V, V], aliados: [N('Gord'), N('Selena'), V, V, N('Rafaela')], tuyoFila: 4 });
  let final = null;
  const vigiladas = [], apuntadas = [], resumenes = [], maestrias = [];
  const interno = {
    leer: async () => ({ ok: true, lectura: respuesta }), delMovil: () => ({ leyo: null, consejo: null }), ponerConsejo: () => {},
    vigilar: (desde, cuerpo) => { vigiladas.push({ desde, cuerpo }); final = { desde, resultado: null }; },
    final: () => final, ponerResumen: (r) => resumenes.push(r),
  };
  const maestria = { Rafaela: { games: 400, winRate: 0.62 } };
  const solo = crearSolo({ interno, ajustes: () => ({ activo: true, linea: 'roam', rango: 'glory', idioma: 'es' }), datosPara: () => datos, ahora: () => t, apuntar: (p) => apuntadas.push(p), maestriaDe: () => { maestrias.push(1); return maestria; } });
  await solo.tic();
  ok(maestrias.length > 0, 'el consejo no usa tu maestría');
  eq(vigiladas.length, 0, 'vigila el final en pleno draft');
  respuesta = { partida: true, rapida: true };
  t += 5000; await solo.tic();
  t += 5000; await solo.tic();
  eq(vigiladas.length, 1, 'al empezar la partida no vigila el final');
  eq(vigiladas[0].desde, solo.estado().cerradoEn, 'vigila otro instante que el del cierre');
  t += 20000; await solo.tic();
  eq(apuntadas.length, 0, 'apunta sin resultado');
  final = { ...final, resultado: 'gane', resultadoEn: t, duracion: 14.2, inicioEstimado: false };
  t += 20000; await solo.tic();
  t += 20000; await solo.tic();
  eq(apuntadas.length, 1, 'no apunta, o apunta dos veces');
  const p = apuntadas[0];
  ok(p.pick === 'Rafaela' && p.gane === true && p.origen === 'lector' && p.fuente === 'tablet' && p.duracion === 14.2 && !p.supuesto, `la partida apuntada no cuadra: ${JSON.stringify(p)}`);
  ok(p.draft.enemigos.includes('Clint') && p.draft.aliados.includes('Gord') && !p.draft.aliados.includes('Rafaela') && p.bans.includes('Eudora'), `el draft de la partida no es el leído: ${JSON.stringify(p.draft)}`);
  ok(p.recomendados.length === 3 && typeof p.estimacion === 'number' && Number.isInteger(p.modelo), 'sin recomendados, estimación o modelo');
  eq(resumenes.length, 1, 'no pone el resumen en la notificación');
  ok(/^Ganada con Rafaela/.test(resumenes[0].titulo) && /tablet/.test(resumenes[0].texto), JSON.stringify(resumenes[0]));
  eq(solo.resumen().apuntadas, 1);
  // Con el móvil leyendo, la tablet no vigila ni apunta (lo hace la app).
  const otraVigilancia = [];
  const conMovil = crearSolo({ interno: { ...interno, delMovil: () => ({ leyo: t, consejo: null }), vigilar: (d) => otraVigilancia.push(d) }, ajustes: () => ({ activo: true, linea: 'roam' }), datosPara: () => datos, ahora: () => t, apuntar: () => {} });
  respuesta = { partida: true, rapida: true };
  await conMovil.tic(); await conMovil.tic();
  eq(otraVigilancia.length, 0, 'con el móvil leyendo, la tablet también vigila');
});

test('la partida de la tablet: sin tu fila leída, el nº1 marcado como supuesto; sin resultado, nada', () => {
  const draft = acumularDraft(null, lectura({ tuyos: [N('Hirara')], enemigos: [N('Clint'), N('Khufra'), V, V, V] }), 1);
  const decision = decidirSolo({ datos, draft, linea: 'roam' });
  const p = partidaSolo({ decision, linea: 'roam', gane: false, t: 123, duracion: 200 });
  ok(p.supuesto && p.pick === decision.rec.eleccion.heroe.name && p.duracion === undefined, `sin tu fila no se marca supuesto, o entra una duración imposible: ${JSON.stringify(p)}`);
  eq(partidaSolo({ decision, linea: 'roam', gane: null, t: 1 }), null);
  ok(/^Lost with /.test(resumenSolo(p, 'en').titulo));
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

test('la voz sin el móvil (3.71.0): al empezar la partida, la tablet manda los MISMOS consejos en directo que mandaría la app, en tu idioma y callada si lo pediste', async () => {
  const pasos = async (ajustes) => {
    let t = 7_000_000;
    let respuesta = lectura({ tuyos: [N('Hirara')], suyos: [N('Eudora')], enemigos: [N('Clint'), N('Khufra'), V, V, V], aliados: [N('Gord'), N('Selena'), V, V, N('Rafaela')], tuyoFila: 4 });
    const vigiladas = [];
    const interno = { leer: async () => ({ ok: true, lectura: respuesta }), delMovil: () => ({}), ponerConsejo: () => {}, vigilar: (desde, cuerpo) => vigiladas.push(cuerpo), final: () => null, ponerResumen: () => {} };
    const solo = crearSolo({ interno, ajustes: () => ajustes, datosPara: () => datos, ahora: () => t, apuntar: () => {} });
    await solo.tic();
    respuesta = { partida: true, rapida: true };
    t += 5000; await solo.tic(); t += 5000; await solo.tic();
    return { cuerpo: vigiladas[0], draft: solo.estado() };
  };
  const es = await pasos({ activo: true, linea: 'roam', rango: 'glory', idioma: 'es' });
  ok(es.cuerpo?.guion?.length > 0 && es.cuerpo.cierres?.length > 0, `sin consejos en directo: ${JSON.stringify(es.cuerpo).slice(0, 200)}`);
  eq(es.cuerpo.callar, false, 'la voz va callada sin pedirlo');
  // Lo mismo que calcula la app con ese draft: el plan de tu pick, traducido con sus textos.
  const decision = decidirSolo({ datos, draft: es.draft, linea: 'roam' });
  const app = guionTraducido(decision.rec.partida, crearT('es'), 'es');
  eq(JSON.stringify(es.cuerpo.guion), JSON.stringify(app.guion), 'el guion de la tablet no es el de la app');
  eq(JSON.stringify(es.cuerpo.cierres), JSON.stringify(app.cierres));
  ok(es.cuerpo.guion.every((a) => !/^[a-z]+\.[a-zA-Z.]+$/.test(a.texto)), 'sale una clave sin traducir');
  const en = await pasos({ activo: true, linea: 'roam', rango: 'glory', idioma: 'en', callar: true });
  ok(en.cuerpo.idioma === 'en' && en.cuerpo.guion[0].texto !== es.cuerpo.guion[0].texto, 'en inglés dice lo mismo que en español');
  eq(en.cuerpo.callar, true, 'con la voz callada, la tablet habla');
  // Tu pick leído que el motor no tiene como «yo»: sin guion, como la app.
  eq(guionSolo({ rec: { eleccion: { heroe: { name: 'Otro' } }, partida: decision.rec.partida }, tuyo: { name: 'Rafaela' } }).guion.length, 0, 'habla con el plan de otro héroe');
  ok(guionSolo({ rec: { eleccion: { heroe: { name: 'Rafaela' } }, partida: decision.rec.partida }, tuyo: { name: 'Rafaela' } }).guion.length > 0, 'con tu pick, sin guion');
  eq(guionSolo(null).guion.length, 0);
});

test('callar la voz: en la APK o en la app del móvil (3.71.0)', () => {
  const casa = mkdtempSync(join(tmpdir(), 'solo-voz-'));
  const f = join(casa, 'solo.json');
  writeFileSync(f, JSON.stringify({ linea: 'roam' }));
  eq(leerAjustesSolo(f).voz, true, 'sin el campo, callada');
  writeFileSync(f, JSON.stringify({ linea: 'roam', voz: false }));
  eq(leerAjustesSolo(f).voz, false);
  eq(ajustesEfectivos(leerAjustesSolo(f), null).callar, true, 'callada en la APK, habla');
  writeFileSync(f, JSON.stringify({ linea: 'roam' }));
  eq(ajustesEfectivos(leerAjustesSolo(f), { linea: 'mid', vozCallada: true }).callar, true, 'callada en el móvil, habla');
  eq(ajustesEfectivos(leerAjustesSolo(f), { linea: 'mid' }).callar, false);
  eq(ajustesEfectivos(null, { linea: 'mid', vozCallada: true }).callar, true, 'con la línea del móvil, no respeta su voz callada');
});

test('enseñar al lector sin el móvil (3.71.0): lo que no reconoció se pregunta con las capturas del draft, sabe de qué partida es y la notificación lo dice', async () => {
  let t = 9_000_000;
  let n = 0;
  const conId = (l) => ({ ...l, id: `lectura-20261024-${String(n += 1).padStart(3, '0')}` });
  let respuesta = conId(lectura({ tuyos: [N('Hirara'), N('Belerick')], suyos: [N('Eudora')], enemigos: [N('Clint'), N('Khufra'), V, V, V], aliados: [N('Gord'), N('Selena'), V, V, N('Rafaela')], tuyoFila: 4 }));
  let final = null;
  const correcciones = [], resumenes = [];
  const interno = {
    leer: async () => ({ ok: true, lectura: respuesta }), delMovil: () => ({}), ponerConsejo: () => {},
    vigilar: (desde) => { final = { desde, resultado: null }; }, final: () => final, ponerResumen: (r) => resumenes.push(r),
    ponerCorreccion: (c) => correcciones.push(c),
  };
  const solo = crearSolo({ interno, ajustes: () => ({ activo: true, linea: 'roam', rango: 'glory', idioma: 'es' }), datosPara: () => datos, ahora: () => t, apuntar: () => {} });
  await solo.tic();
  t += 5000; respuesta = conId(respuesta); await solo.tic();
  eq(correcciones.length, 0, 'pregunta en pleno draft');
  // Las lecturas en partida no traen captura del draft: no cuentan.
  respuesta = { partida: true, rapida: true, id: 'lectura-de-la-partida' };
  t += 5000; await solo.tic(); t += 5000; await solo.tic();
  eq(correcciones.length, 1, 'al cerrarse el draft con «?» no lo pregunta');
  const c = correcciones[0];
  eq(JSON.stringify(c.ids), JSON.stringify(['lectura-20261024-001', 'lectura-20261024-002']), 'no son las capturas del draft');
  eq(c.faltan, 5, 'no cuenta los que faltan (tres enemigos y dos compañeros)');
  ok(c.leidos.enemigos[0] === 'Clint' && c.leidos.enemigos[2] === null && c.leidos.tuyoFila === 4 && c.leidos.baneos.includes('Eudora'), JSON.stringify(c.leidos));
  ok(c.heroes.length === datos.heroes.length && c.heroes.includes('Khufra'), 'sin la lista de héroes para elegir');
  ok(c.cuando === solo.estado().cerradoEn && !('partida' in c), 'la corrección sabe de una partida que aún no se apuntó');
  final = { ...final, resultado: 'perdi', resultadoEn: t + 1000, duracion: 12, inicioEstimado: false };
  t += 20000; await solo.tic();
  eq(correcciones.length, 2, 'al apuntar no le dice de qué partida es');
  eq(correcciones[1].partida, t - 19000);
  ok(/Toca para decirle al lector quién eran los 5/.test(resumenes[0]?.texto ?? ''), `la notificación no lo dice: ${resumenes[0]?.texto}`);
  // Un draft leído entero no pregunta nada; y sin capturas, tampoco.
  const entero = { ...draftVacio(), baneos: ['Hirara'], enemigos: ['Clint', 'Khufra', 'Atlas', 'Franco', 'Tigreal'], aliados: ['Gord', 'Selena', 'Layla', 'Zilong', 'Rafaela'], cerrado: true, cerradoEn: 1, ids: ['lectura-1'] };
  eq(correccionDelDraft(entero, datos), null, 'pregunta sin faltar nadie');
  eq(correccionDelDraft({ ...entero, enemigos: [null, 'Khufra', 'Atlas', 'Franco', 'Tigreal'], ids: [] }, datos), null, 'pregunta sin capturas de las que aprender');
  eq(correccionDelDraft({ ...entero, enemigos: [null, 'Khufra', 'Atlas', 'Franco', 'Tigreal'] }, datos)?.faltan, 1);
  // El draft recuerda como mucho IDS_POR_DRAFT capturas.
  let d = null;
  for (let i = 0; i < IDS_POR_DRAFT + 5; i += 1) d = acumularDraft(d, { ...lectura({ tuyos: [N('Hirara')] }), id: `lectura-${i}` }, i);
  ok(d.ids.length === IDS_POR_DRAFT && d.ids.at(-1) === `lectura-${IDS_POR_DRAFT + 4}`, 'sin tope o sin las últimas');
  ok(!acumularDraft(d, { ...lectura({ tuyos: [N('Hirara')] }), id: '../fuera' }, 99).ids.includes('../fuera'), 'entra un id sin forma');
});

test('la burbuja de la tablet sola dice el mejor de los tuyos si el nº1 no lo es (3.72.0)', () => {
  const draft = acumularDraft(null, lectura({ tuyos: [N('Hirara')], enemigos: [N('Clint'), N('Khufra'), V, V, V] }), 1);
  const sin = decidirSolo({ datos, draft, linea: 'roam' });
  const ultimo = sin.rec.ranking.at(-1).heroe.name;
  const c = consejoSolo({ datos, draft, linea: 'roam', maestria: { [ultimo]: { games: 3, winRate: 0.5 } } });
  ok(c?.detalle?.includes(`De los tuyos: ${ultimo}`), `no lo dice: ${c?.detalle}`);
  ok(!consejoSolo({ datos, draft, linea: 'roam' })?.detalle?.includes('De los tuyos'), 'lo dice sin maestría');
});

test('el draft siguiente se ve por sus baneos, no solo por el reloj (3.72.5): tras la partida, en cuanto hay baneos nuevos; y si alguien abandona el draft, en cuanto cambian los huecos de baneo', () => {
  const T = 1_000_000;
  // Un draft entero y cerrado por la partida.
  let d = acumularDraft(null, lectura({ tuyos: [N('Hirara'), N('Belerick'), N('Atlas'), V, V], suyos: [N('Eudora'), N('Saber'), V, V, V], enemigos: [N('Clint'), N('Khufra'), V, V, V] }), T);
  d = acumularDraft(d, { partida: true }, T + 1000); d = acumularDraft(d, { partida: true }, T + 2000);
  ok(d.cerrado, 'la partida no cierra el draft');
  // La pantalla de carga (los mismos héroes, sin baneos) no es otro draft.
  eq(acumularDraft(d, lectura({ enemigos: [N('Clint'), N('Khufra'), V, V, V] }), T + 30000).cerrado, true, 'la carga de la misma partida abre otro draft');
  // Un baneo nuevo solo (puede ser uno mal leído) tampoco.
  eq(acumularDraft(d, lectura({ tuyos: [N('Lolita'), V, V, V, V] }), T + 60000).cerrado, true, 'un solo baneo distinto abre otro draft');
  // Dos baneos que el de antes no tenía, al minuto: es otro draft, sin esperar los 3 minutos.
  const otro = acumularDraft(d, lectura({ tuyos: [N('Lolita'), N('Franco'), V, V, V] }), T + 60000);
  ok(!otro.cerrado && otro.baneos.includes('Lolita') && !otro.baneos.includes('Hirara') && !otro.enemigos.some(Boolean), `el draft nuevo no entra o se mezcla con el de antes: ${JSON.stringify(otro)}`);
  // Alguien abandona en pleno draft y empieza otro: dos huecos de baneo con otro héroe.
  let a = acumularDraft(null, lectura({ tuyos: [N('Hirara'), N('Belerick'), V, V, V], enemigos: [N('Clint'), V, V, V, V] }), T);
  eq(acumularDraft(a, lectura({ tuyos: [N('Lolita'), N('Belerick'), V, V, V] }), T + 30000).baneos.includes('Hirara'), true, 'un hueco de baneo mal leído tira el draft');
  a = acumularDraft(a, lectura({ tuyos: [N('Lolita'), N('Franco'), V, V, V] }), T + 30000);
  ok(!a.baneos.includes('Hirara') && !a.enemigos.some(Boolean) && a.baneos.includes('Franco'), `el draft tras un abandono se mezcla con el anterior: ${JSON.stringify(a)}`);
  eq(BANEOS_DE_OTRO_DRAFT, 2);
});

test('¿Cómo acabó? (3.72.5): sin reconocer el final, la tablet lo pregunta UNA vez y apunta con lo que contestes; «No la terminé» no apunta; y si empieza otro draft sin saberlo, también pregunta', async () => {
  const montar = () => {
    let t = 20_000_000, final = null, respuesta = null;
    let respuestaLista = lectura({ tuyos: [N('Hirara'), N('Belerick')], suyos: [N('Eudora')], enemigos: [N('Clint'), N('Khufra'), V, V, V], aliados: [N('Gord'), N('Selena'), V, V, N('Rafaela')], tuyoFila: 4 });
    const preguntas = [], apuntadas = [], resumenes = [];
    const interno = {
      leer: async () => ({ ok: true, lectura: respuestaLista }), delMovil: () => ({}), ponerConsejo: () => {},
      vigilar: (desde) => { final = { desde, activa: true, acabada: false, resultado: null, inicio: desde + 1000, duracion: null }; },
      final: () => final, ponerResumen: (r) => resumenes.push(r),
      ponerPregunta: (p) => preguntas.push(p), respuesta: () => { const r = respuesta; respuesta = null; return r; },
    };
    const solo = crearSolo({ interno, ajustes: () => ({ activo: true, linea: 'roam', rango: 'glory', idioma: 'es' }), datosPara: () => datos, ahora: () => t, apuntar: (p) => apuntadas.push(p) });
    return {
      solo, preguntas, apuntadas, resumenes,
      paso: async (ms = 5000) => { t += ms; await solo.tic(); },
      leer: (l) => { respuestaLista = l; }, fin: (f) => { final = { ...final, ...f }; }, contestar: (r) => { respuesta = { ...r, cuando: t }; }, desde: () => final?.desde,
    };
  };
  // La tabla del final sin palabra conocida (la victoria se aprende).
  const v = montar();
  await v.paso(); v.leer({ partida: true, rapida: true }); await v.paso(); await v.paso();
  v.fin({ acabada: true, activa: false, duracion: 13.5 });
  await v.paso(20000); await v.paso(20000);
  eq(v.preguntas.length, 1, 'con la tabla sin palabra no pregunta, o pregunta dos veces');
  ok(v.preguntas[0].id === `pregunta-${v.desde()}` && v.preguntas[0].pick === 'Rafaela', JSON.stringify(v.preguntas[0]));
  ok(v.resumenes.some((r) => r.id === `pregunta-${v.desde()}` && /Cómo acabó/.test(r.titulo)), 'la notificación no lo pregunta');
  eq(v.apuntadas.length, 0, 'apunta sin saber el resultado');
  v.contestar({ desde: v.desde(), gane: true });
  await v.paso(20000); await v.paso(20000);
  eq(v.apuntadas.length, 1, 'con tu respuesta no apunta, o apunta dos veces');
  ok(v.apuntadas[0].gane === true && v.apuntadas[0].pick === 'Rafaela' && v.apuntadas[0].duracion === 13.5, JSON.stringify(v.apuntadas[0]));
  // «No la terminé».
  const n = montar();
  await n.paso(); n.leer({ partida: true, rapida: true }); await n.paso(); await n.paso();
  n.fin({ acabada: true, activa: false });
  await n.paso(20000);
  n.contestar({ desde: n.desde(), gane: null });
  await n.paso(20000);
  eq(n.apuntadas.length, 0, '«No la terminé» apunta la partida');
  // Otro draft sin haber visto el final: se pregunta por la de antes.
  const o = montar();
  await o.paso(); o.leer({ partida: true, rapida: true }); await o.paso(); await o.paso();
  o.leer(lectura({ tuyos: [N('Lolita'), N('Franco'), V, V, V] }));
  await o.paso(60000);
  eq(o.preguntas.length, 1, 'empieza otro draft y no pregunta por la partida de antes');
  ok(!o.solo.estado().cerrado && o.solo.estado().baneos.includes('Lolita'), 'el draft siguiente no entra');
  // Con el resultado leído, ni se pregunta.
  const g = montar();
  await g.paso(); g.leer({ partida: true, rapida: true }); await g.paso(); await g.paso();
  g.fin({ acabada: true, activa: false, resultado: 'perdi', resultadoEn: 123 });
  await g.paso(20000);
  ok(g.preguntas.length === 0 && g.apuntadas.length === 1 && g.apuntadas[0].gane === false, 'con el resultado leído pregunta o no apunta');
  ok(/How did the game end/.test(resumenPregunta(1, null, 'en').titulo));
});

await terminar('scripts/solo');
