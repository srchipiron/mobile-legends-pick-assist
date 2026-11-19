/**
 * El modo solo (scripts/lector/solo.mjs y acumular.mjs): la tablet junta las
 * lecturas en un draft, decide con el motor de la app, pone la burbuja,
 * vigila el final, pregunta y apunta. Conduce SIEMPRE que haya línea
 * (protocolo 2): el móvil la copia y le manda lo que tú tocas.
 */
import { test, ok, eq, leerJson, RAIZ } from '../ayuda.mjs';
import { mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
import { acumularDraft, draftVacio, BANEOS_DE_OTRO_DRAFT, faseDe, LECTURAS_PARA_FUERA, IDS_POR_DRAFT, SEPARACION_IDS_MS, conCaptura, MINUTOS_PARA_OTRO_DRAFT, PICKS_SIN_BANEOS, conCorreccion, registrarCorreccion } from '../../scripts/lector/acumular.mjs';
import { resumenPregunta, consejoSolo, crearSolo, leerAjustesSolo, ajustesEfectivos, datosDelSolo, partidaSolo, resumenSolo, decidirSolo, correccionDelDraft, tusHabituales, HABITUALES, MINUTOS_ENTRE_TABLAS, INTERVALOS_SOLO } from '../../scripts/lector/solo.mjs';
import { CAMBIOS_A_LA_VEZ, PREGUNTA_CADUCA_MS, sanearCorreccion, sanearDraftTablet, sanearPartidaTablet } from '../../src/comun/contrato.js';
import { prepararDatos, recomendar } from '../../src/motor/draft.js';
import { buildsDe, buildParaElDraft, objetosDe } from '../../src/motor/builds.js';
import { RETENCION_CAPTURAS_MS } from '../../scripts/lector/capturas.mjs';
import { leerPng } from '../../scripts/lector/png.mjs';
import { arrancar, pedirApk } from '../fixtures/juego/lector.mjs';

const catalogo = leerJson('public/data/heroes.json');
const meta = leerJson('public/data/roam-meta.json');
const datos = prepararDatos({ catalogo, meta, rango: 'glory' });
const abiertos = [];
after(() => Promise.all(abiertos.map((s) => s.cerrar())));
const N = (n) => ({ nombre: n });
const V = { nombre: null };
// Cada lectura de pega es de la pantalla del draft (3.83.0): lleva la fila de baneos (dos de ellos al final de la de ellos).
const FILA = [V, V, V, N('Valir'), N('Cici')];
const lectura = ({ tuyos = [], suyos = FILA, enemigos = [V, V, V, V, V], aliados = [V, V, V, V, V], tuyoFila = -1, partida = false } = {}) => ({ tuyos, suyos, enemigos, aliados, tuyoFila, partida });

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

test('tu fila la votan las lecturas del draft: la fase de skins no la mueve (3.100.0, el «Ling» del 10 de noviembre de 2026)', () => {
  // Doce lecturas del draft decían «tú Diggie» (fila 2); la fase de skins, casi todo «?», leyó el nombre amarillo en la 3.
  const equipo = [N('Carmilla'), N('Kagura'), N('Diggie'), N('Ling'), V];
  const enemigos = [N('Angela'), V, N('Chou'), N('Fredrinn'), V];
  let d = null;
  for (let i = 0; i < 6; i++) d = acumularDraft(d, lectura({ enemigos, aliados: equipo, tuyoFila: 2 }), 1000 + i);
  eq(d.tuyoFila, 2);
  for (let i = 0; i < 8; i++) d = acumularDraft(d, lectura({ enemigos, aliados: [V, V, N('Diggie'), V, V], tuyoFila: 3 }), 2000 + i);
  eq(d.tuyoFila, 2, 'una lectura descartada por la fase de skins mueve tu fila');
  // Las que sí pasan (como mucho dos huecos cambiados) votan, pero manda la mayoría.
  for (let i = 0; i < 3; i++) d = acumularDraft(d, lectura({ enemigos, aliados: [N('Carmilla'), N('Kagura'), N('Diggie'), V, V], tuyoFila: 3 }), 3000 + i);
  eq(d.tuyoFila, 2, 'tres lecturas sueltas pesan más que seis del draft');
  const dec = decidirSolo({ datos, draft: d, linea: 'roam' });
  eq(dec.tuyo?.name, 'Diggie', 'se apunta otro héroe como tu pick');
  ok(dec.aliados.some((h) => h.name === 'Ling') && !dec.aliados.some((h) => h.name === 'Diggie'), `tu héroe va como compañero: ${dec.aliados.map((h) => h.name)}`);
  // Con más votos de otra fila, manda esa (no se queda en la primera que se leyó).
  for (let i = 0; i < 7; i++) d = acumularDraft(d, lectura({ enemigos, aliados: equipo, tuyoFila: 3 }), 4000 + i);
  eq(d.tuyoFila, 3, 'la fila más votada no manda');
});

test('un héroe no se queda en dos huecos de su equipo: el recién leído gana', () => {
  let d = acumularDraft(null, lectura({ aliados: [N('Gord'), V, V, V, V], enemigos: [N('Clint'), V, V, V, V] }), 1);
  d = acumularDraft(d, lectura({ aliados: [V, N('Gord'), V, V, V], enemigos: [V, N('Clint'), V, V, V] }), 2);
  eq(d.aliados.filter((n) => n === 'Gord').length, 1, 'Gord se queda en dos huecos de tu equipo');
  eq(d.aliados[1], 'Gord', 'no gana la lectura nueva');
  eq(d.enemigos.join(), ',Clint,,,', 'un rival se queda en dos huecos');
  // La misma lectura lo ve en dos huecos: ninguno gana, y lo de antes se queda.
  d = acumularDraft(d, lectura({ aliados: [N('Selena'), V, N('Selena'), V, V] }), 3);
  eq(d.aliados.filter((n) => n === 'Selena').length, 0, 'un héroe visto en dos huecos a la vez entra');
  eq(d.aliados[1], 'Gord');
  // Otro distinto en otro hueco no quita a nadie.
  d = acumularDraft(d, lectura({ aliados: [N('Estes'), V, V, V, V] }), 4);
  eq(d.aliados.filter(Boolean).join(), 'Estes,Gord');
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
  ok(d.cerrado && d.baneos.join() === 'Hirara,Valir,Cici', 'una pantalla de nada más acabar abre otro draft');
  d = acumularDraft(d, lectura({ tuyos: [N('Masha')] }), 20_000 + MINUTOS_PARA_OTRO_DRAFT * 60000 + 1);
  ok(!d.cerrado && d.baneos.join() === 'Masha,Valir,Cici' && !d.enemigos.some(Boolean), `el draft siguiente no empieza de cero: ${JSON.stringify(d)}`);
  eq(acumularDraft(draftVacio(), lectura({ partida: true }), 1).enPartida, 1);
  ok(!acumularDraft(acumularDraft(draftVacio(), lectura({ partida: true }), 1), lectura({ partida: true }), 2).cerrado, 'sin draft leído, la partida cierra un draft vacío');
});

test('lo leído fuera de la pantalla del draft no abre otro (3.83.0): un «Gord» suelto con los baneos en «?» no tira la partida vigilada', () => {
  // El 27 de octubre de 2026 (parte de las 23:10): lecturas con los diez baneos en «?» y Gord o Sun en un hueco de rival.
  let d = acumularDraft(null, lectura({ tuyos: [N('Hirara'), N('Belerick'), V, V, V], enemigos: [N('Clint'), V, V, V, V] }), 0);
  d = acumularDraft(d, lectura({ partida: true }), 1000); d = acumularDraft(d, lectura({ partida: true }), 2000);
  ok(d.cerrado, 'la partida no cierra el draft');
  const suelta = lectura({ suyos: [], enemigos: [V, N('Sun'), V, V, N('Gord')] });
  const tarde = acumularDraft(d, suelta, 2000 + (MINUTOS_PARA_OTRO_DRAFT + 5) * 60000);
  ok(tarde.cerrado && tarde.cerradoEn === 1000 + 1000, `una pantalla sin fila de baneos abre otro draft: ${JSON.stringify(tarde)}`);
  // Ni empieza uno de cero, ni mancha el que va abierto con un baneo solo.
  eq(acumularDraft(draftVacio(), suelta, 5).enemigos.some(Boolean), false, 'sin baneos a la vista empieza un draft');
  eq(acumularDraft(draftVacio(), lectura({ tuyos: [N('Hirara')], suyos: [] }), 5).baneos.length, 0, 'un baneo suelto empieza un draft');
  // Con el draft abierto y su fila ya leída, un fotograma sin baneos (skins, una ventana) sigue sumando.
  const abierto = acumularDraft(null, lectura({ tuyos: [N('Hirara'), N('Belerick'), V, V, V] }), 0);
  eq(acumularDraft(abierto, lectura({ suyos: [], enemigos: [N('Clint'), V, V, V, V] }), 1000).enemigos[0], 'Clint', 'el draft abierto deja de sumar picks');
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

test('con tu héroe elegido, la burbuja dice su build para este draft (3.90.1): la misma que «Plan y objetos» de la app', () => {
  const draft = acumularDraft(null, lectura({ tuyos: [N('Hirara')], enemigos: [N('Clint'), N('Khufra'), N('Layla'), V, V], aliados: [V, V, V, V, N('Diggie')], tuyoFila: 4 }), 1);
  const c = consejoSolo({ datos, draft, linea: 'roam' });
  const H = (n) => datos.heroes.find((h) => h.name === n);
  // Diggie contra estos tres: la build que mejor encaja NO es la más usada (con los datos del 4 de noviembre de 2026).
  const lista = buildsDe(datos.crudo.builds, 'Diggie', 'roam');
  ok(lista.length > 1, 'la prueba necesita builds de Diggie en roam');
  const elegida = lista[buildParaElDraft(lista, datos.crudo.equipment, [H('Clint'), H('Khufra'), H('Layla')], 'roam', { builds: datos.crudo.builds }).indice];
  const nombres = objetosDe(datos.crudo.equipment, elegida).map((o) => o.nombre);
  eq(c?.titulo, `Diggie: ${nombres.slice(0, 3).join(' → ')}`, `la build no es la de la app para este draft: ${JSON.stringify(c)}`);
  ok(/^Fase de picks · Tu build/.test(c.detalle) && (!elegida.emblema || c.detalle.includes(elegida.emblema)), `el detalle no dice el resto: ${c.detalle}`);
  ok(/^Pick phase · Your build/.test(consejoSolo({ datos, draft, linea: 'roam', idioma: 'en' }).detalle), 'en inglés sale en español');
  // Sin tu fila leída, lo de siempre: tu nº1.
  const sinTuyo = consejoSolo({ datos, draft: { ...draft, tuyoFila: -1 }, linea: 'roam' });
  ok(/ \d+%$/.test(sinTuyo.titulo), `sin tu héroe no da tu nº1: ${sinTuyo.titulo}`);
  // Sin builds de ese héroe en esa línea, también.
  const sinBuilds = consejoSolo({ datos: { ...datos, crudo: { ...datos.crudo, builds: {} } }, draft, linea: 'roam' });
  ok(/ \d+%$/.test(sinBuilds.titulo), 'sin builds se queda sin consejo');
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

test('el bucle: decide y pone el consejo cuando cambia; conduce SIEMPRE con línea; en partida solo el minimapa; sin línea, ni lee ni deja burbuja', async () => {
  let t = 1_000_000;
  const puestos = [], pedidas = [], fases = [];
  let respuesta = lectura({ tuyos: [N('Hirara')], enemigos: [N('Clint'), V, V, V, V] });
  const interno = { leer: async (op) => { pedidas.push(op); return { ok: true, lectura: respuesta }; }, ponerConsejo: (c) => puestos.push(c), ponerFase: (f) => fases.push(f) };
  let ajustes = { activo: true, linea: 'roam', rango: 'glory', idioma: 'es', origen: 'movil' };
  const solo = crearSolo({ interno, ajustes: () => ajustes, datosPara: () => datos, ahora: () => t });
  eq(await solo.tic(), INTERVALOS_SOLO.draft);
  ok(INTERVALOS_SOLO.draft <= 2000, `en el draft se lee cada ${INTERVALOS_SOLO.draft} ms: el último pick se escapa`);
  eq(puestos.length, 1, 'no pone el consejo');
  eq(fases.at(-1), 'draft', 'la burbuja no sabe que hay un draft: ofrecería contestar encima de él');
  ok(pedidas[0]?.rapida === true, 'no pide la lectura rápida (en partida reconocería caras)');
  await solo.tic();
  eq(puestos.length, 1, 'repite el mismo consejo en cada vuelta');
  // Con la línea del MÓVIL también conduce ella (protocolo 2): nada la aparta.
  respuesta = lectura({ tuyos: [N('Hirara')], enemigos: [N('Clint'), N('Khufra'), V, V, V] });
  t += 1500;
  eq(await solo.tic(), INTERVALOS_SOLO.draft, 'con la línea del móvil no sigue leyendo');
  eq(puestos.length, 2, 'con otro draft no vuelve a decidir');
  ok(!('apartado' in solo.resumen()), 'el resumen aún habla de apartarse por el móvil');
  respuesta = { partida: true, rapida: true };
  await solo.tic();
  eq(await solo.tic(), INTERVALOS_SOLO.partida, 'en partida no espera más');
  ok(solo.estado().cerrado, 'la partida no cierra el draft');
  eq(fases.at(-1), 'partida', 'en partida la burbuja tocable no sabe que se juega');
  const r = solo.resumen();
  ok(r.activo && r.linea === 'roam' && r.origen === 'movil' && r.lecturas >= 4 && r.ultima?.enPartida === true, `el resumen no cuenta lo que hace: ${JSON.stringify(r)}`);
  eq(r.partidas, 1, 'el resumen no cuenta la partida que empezó');
  // Sin línea (o «Apagado»): no lee, sin fase y sin burbuja.
  ajustes = { activo: false };
  const n = pedidas.length;
  eq(await solo.tic(), INTERVALOS_SOLO.vacio);
  ok(pedidas.length === n && fases.at(-1) === null && puestos.at(-1) === null, `sin línea lee o deja la burbuja: ${JSON.stringify({ leidas: pedidas.length - n, fase: fases.at(-1), consejo: puestos.at(-1) })}`);
  const roto = crearSolo({ interno: { ...interno, leer: async () => ({ ok: false, error: 'captura' }) }, ajustes: () => ({ activo: true, linea: 'roam' }), datosPara: () => datos });
  eq(await roto.tic(), INTERVALOS_SOLO.error, 'un fallo de captura no espera');
});

test('el mismo héroe en dos huecos de baneo no abre un draft (3.89.1): la victoria fantasma del 2 de noviembre', () => {
  // 22:29 del 2 de noviembre de 2026: «Gord» en dos huecos de baneo y en un rival, en una pantalla que no era el draft.
  const fantasma = lectura({ tuyos: [N('Gord'), V, V, V, V], suyos: [N('Gord'), V, V, V, V], enemigos: [N('Gord'), V, V, V, V] });
  const d = acumularDraft(draftVacio(), fantasma, 5);
  eq(d.baneos.length, 0, `el mismo héroe en dos huecos de baneo abre un draft: ${JSON.stringify(d.baneos)}`);
  eq(d.enemigos.some(Boolean), false);
  // Dos distintos sí: es la pantalla del draft.
  ok(acumularDraft(draftVacio(), lectura({ tuyos: [N('Gord'), V], suyos: [N('Atlas'), V] }), 5).baneos.length === 2, 'dos baneos distintos no abren el draft');
  // Y los dos equipos baneando al mismo héroe sigue valiendo dentro de un draft ya abierto.
  const abierto = acumularDraft(draftVacio(), lectura({ tuyos: [N('Hirara'), N('Atlas')], suyos: [N('Hirara'), V] }), 5);
  eq(abierto.baneos.join(), 'Hirara,Atlas');
});

test('sin la fila de baneos, el draft se abre por los picks (3.101.1): la burbuja del 11 de noviembre en «esperando consejo»', async () => {
  // Desde las 16:00 UTC del 11 de noviembre de 2026 los diez baneos salían «?» (Gord 0,74–0,78) y los picks se leían en su sitio.
  const sinBaneos = [V, V, V, V, V];
  const sinFila = (enemigos, aliados = [V, V, V, V, V], tuyoFila = -1) => lectura({ tuyos: sinBaneos, suyos: sinBaneos, enemigos, aliados, tuyoFila });
  // La lectura 743 de ese día: tres rivales y tus compañeros, ningún baneo.
  const l743 = sinFila([V, N('Dyrroth'), N('Badang'), N('Lukas'), V], [N('Diggie'), N('Paquito'), N('Natalia'), V, V], 0);
  eq(PICKS_SIN_BANEOS, 4);
  let d = acumularDraft(draftVacio(), l743, 1000);
  ok(d.enemigos.includes('Dyrroth') && d.aliados.includes('Paquito') && d.porPicks, `cuatro héroes en los picks sin baneos no abren el draft: ${JSON.stringify(d)}`);
  // Abierto así, sigue sumando lo que se lea aunque sea poco (el último pick llega y se sigue viendo a Dyrroth): solo no abriría nada.
  const poco = sinFila([N('Fredrinn'), N('Dyrroth'), V, V, V]);
  const abre = (l) => acumularDraft(acumularDraft(draftVacio(), l, 5), poco, 10).enemigos.some(Boolean);
  eq(abre(poco), false, 'dos héroes sin baneos abren un draft');
  // Tres no: el 8 de noviembre, fuera de un draft, 8 de 854 lecturas leían tres (Carmilla, Zetian, Clint).
  eq(abre(sinFila([N('Carmilla'), N('Zetian'), V, V, N('Clint')])), false, 'tres héroes sin baneos abren un draft');
  // Ni el mismo héroe en los dos paneles (la pantalla oscura: «Gord» en todas partes) cuenta más de una vez.
  eq(abre(sinFila([N('Gord'), N('Gord'), V, V, V], [N('Gord'), N('Gord'), V, V, V])), false, 'Gord en cuatro huecos abre un draft');
  d = acumularDraft(d, poco, 2000);
  eq(d.enemigos[0], 'Fredrinn', 'el draft abierto por los picks deja de sumar');
  // Y lo recuerda en las lecturas siguientes, no solo en la de después.
  d = acumularDraft(d, sinFila([N('Fredrinn'), N('Dyrroth'), V, V, N('Yin')]), 3000);
  eq(d.enemigos[4], 'Yin', 'el draft abierto por los picks se olvida de que lo está');
  ok(d.ids.length === 0, 'guarda capturas para aprender sin saber si es la pantalla del draft');
  // Y en el bucle: hay consejo, la partida lo cierra y se cuenta como sin baneos.
  let t = 9_000_000;
  let respuesta = { ...l743, id: 'lectura-2026-11-11T21-40-00-000Z-743' };
  const consejos = [], registro = [];
  const interno = {
    leer: async () => ({ ok: true, lectura: respuesta }), ponerConsejo: (c) => consejos.push(c),
    vigilar: () => {}, final: () => null, ponerResumen: () => {},
  };
  const cabeceras = [], protegidas = [];
  interno.protegerLecturas = (ids) => protegidas.push(ids);
  const solo = crearSolo({ interno, ajustes: () => ({ activo: true, linea: 'roam', rango: 'glory', idioma: 'es' }), datosPara: () => datos, ahora: () => t, registrar: (l) => registro.push(l), alSinBaneos: (x) => cabeceras.push(x) });
  await solo.tic();
  ok(consejos.length === 1 && /Fase de picks/.test(consejos[0].detalle ?? ''), `sin baneos no hay consejo en la burbuja: ${JSON.stringify(consejos)}`);
  // La captura de los picks (4.0.1) no es para aprender, pero se guarda para la cabecera y no se poda mientras el draft está abierto.
  eq(JSON.stringify(protegidas.at(-1)), JSON.stringify([respuesta.id]), 'la captura de los picks de un draft sin fila se poda antes de cerrarse');
  const desde = solo.estado().desde;
  ok(Number.isFinite(desde), `el draft abierto por los picks no dice desde cuándo: ${desde}`);
  respuesta = { ...l743, id: 'lectura-2026-11-11T21-40-02-000Z-744' };
  t += 1500; await solo.tic();
  respuesta = { ...l743, id: 'lectura-2026-11-11T21-40-04-000Z-745' };
  t += 1500; await solo.tic();
  respuesta = { partida: true, rapida: true };
  t += 5000; await solo.tic();
  eq(cabeceras.length, 0, 'pide la cabecera antes de cerrarse el draft');
  t += 5000; await solo.tic();
  const r = solo.resumen();
  ok(r.partidas === 1 && r.sinBaneos === 1, `la partida sin baneos no se cuenta: ${JSON.stringify(r)}`);
  ok(registro.some((l) => /sin leer los baneos/.test(l)), 'no lo dice en el registro');
  // Al cerrarse sin la fila, la cabecera de sus primeras capturas de los picks: una vez, con su draft.
  eq(JSON.stringify(cabeceras), JSON.stringify([{ desde, ids: ['lectura-2026-11-11T21-40-00-000Z-743', 'lectura-2026-11-11T21-40-02-000Z-744'] }]), 'el draft sin baneos no pide su cabecera, o no la de sus picks');
  t += 20000; await solo.tic();
  eq(cabeceras.length, 1, 'pide la cabecera otra vez del mismo draft');
  // Con la fila leída no se pide ninguna: la fila se lee y no hay nada que medir.
  const conFila = [];
  let otra = { ...lectura({ tuyos: [N('Hirara'), N('Belerick')], enemigos: [N('Clint'), N('Khufra'), V, V, V], aliados: [N('Gord'), N('Selena'), V, V, V] }), id: 'lectura-2026-11-16T20-00-00-000Z-1' };
  const solo2 = crearSolo({ interno: { ...interno, leer: async () => ({ ok: true, lectura: otra }) }, ajustes: () => ({ activo: true, linea: 'roam', rango: 'glory', idioma: 'es' }), datosPara: () => datos, ahora: () => t, alSinBaneos: (x) => conFila.push(x) });
  await solo2.tic();
  otra = { partida: true, rapida: true };
  t += 5000; await solo2.tic(); t += 5000; await solo2.tic();
  ok(solo2.resumen().partidas === 1 && solo2.resumen().sinBaneos === 0, `el draft con la fila no se cierra o se cuenta sin baneos: ${JSON.stringify(solo2.resumen())}`);
  eq(conFila.length, 0, 'un draft con la fila de baneos leída pide la cabecera');
});

test('los baneos fantasma de la fila rota (3.101.3): un baneo suelto no entra, y un héroe elegido no puede estar baneado', () => {
  const nada = [V, V, V, V, V];
  // 14 de noviembre de 2026, 19:52: el draft se abrió por los picks y una lectura «leyó» a tu Minotaur en la fila de baneos.
  const picks = { enemigos: [N('Sun'), N('Fredrinn'), N('Karina'), N('Hanabi'), V], aliados: [N('Xavier'), N('Kadita'), N('Alucard'), V, N('Minotaur')], tuyoFila: 4 };
  let d = acumularDraft(draftVacio(), lectura({ tuyos: nada, suyos: nada, ...picks }), 1000);
  d = acumularDraft(d, lectura({ tuyos: [V, V, N('Minotaur'), V, V], suyos: nada, ...picks }), 2500);
  d = acumularDraft(d, lectura({ tuyos: nada, suyos: [N('Atlas'), V, V, V, V], ...picks }), 4000);
  eq(d.baneos.length, 0, `un baneo suelto entra en el draft: ${JSON.stringify(d.baneos)}`);
  // Ni el mismo héroe en dos huecos de la fila (la zona oscura: «Gord» en todas partes) cuenta como fila leída.
  eq(acumularDraft(d, lectura({ tuyos: [N('Gord'), V, V, V, V], suyos: [N('Gord'), V, V, V, V], ...picks }), 4500).baneos.length, 0, 'Gord en dos huecos de baneo entra como baneado');
  // Y los huecos de los fantasmas no se recuerdan: la fila de verdad en esos mismos huecos no es «otro draft».
  // (Esa lectura solo ve a Sun: si el draft se reiniciara, se perderían los otros tres rivales.)
  const conFila = acumularDraft(d, lectura({ tuyos: [V, V, N('Hirara'), V, V], suyos: [N('Belerick'), V, V, V, V], enemigos: [N('Sun'), V, V, V, V] }), 5000);
  ok(conFila.enemigos.includes('Fredrinn') && conFila.baneos.join() === 'Hirara,Belerick', `los huecos de los baneos fantasma tiran el draft: ${JSON.stringify(conFila)}`);
  const decision = decidirSolo({ datos, draft: d, linea: 'roam' });
  eq(decision.tuyo?.name, 'Minotaur');
  ok(decision.rec.ranking.some((r) => r.heroe.name === 'Minotaur') && decision.rec.ranking.some((r) => r.heroe.name === 'Atlas'), 'el consejo quita a Minotaur o a Atlas por un baneo fantasma');
  const p = partidaSolo({ decision, linea: 'roam', gane: true, t: 5 });
  ok(p.estimacion > 0 && !p.bans, `la partida se apunta sin la estimación de tu héroe o con baneos fantasma: ${JSON.stringify(p)}`);
  // 13 de noviembre, 22:30: una lectura con varios «baneos» que eran héroes elegidos (Atlas, Gord).
  let e = acumularDraft(draftVacio(), lectura({ tuyos: [N('Atlas'), N('Gord'), V, V, V], suyos: [N("Chang'e"), V, V, V, V],
    enemigos: [N('Fredrinn'), N('Zetian'), N('Atlas'), N('Yi Sun-shin'), V], aliados: [N('Lylia'), N('Gord'), V, V, V] }), 1000);
  const otra = decidirSolo({ datos, draft: e, linea: 'roam' });
  eq(otra.baneos.map((h) => h.name).join(), "Chang'e", 'un héroe elegido sigue contando como baneado');
  // Con la fila bien, el primer baneo aparece solo y entra en cuanto se lee junto a otro.
  e = acumularDraft(draftVacio(), lectura({ tuyos: [N('Hirara'), N('Belerick'), V, V, V], suyos: nada }), 1000);
  e = acumularDraft(e, lectura({ tuyos: nada, suyos: [N('Valir'), V, V, V, V] }), 2000);
  eq(e.baneos.join(), 'Hirara,Belerick', 'entra un baneo leído solo');
  e = acumularDraft(e, lectura({ tuyos: [N('Hirara'), N('Belerick'), V, V, V], suyos: [N('Valir'), V, V, V, V] }), 3000);
  eq(e.baneos.join(), 'Hirara,Belerick,Valir', 'un baneo de verdad se pierde');
});

test('la misma tabla del final no se apunta dos veces (3.89.1): otra a menos de MINUTOS_ENTRE_TABLAS es la misma partida', async () => {
  let t = 7_000_000;
  const draftLeido = (ban) => lectura({ tuyos: [N(ban), N('Belerick')], suyos: [N('Eudora')], enemigos: [N('Clint'), N('Khufra'), V, V, V], aliados: [N('Gord'), N('Selena'), V, V, N('Rafaela')], tuyoFila: 4 });
  let respuesta = draftLeido('Hirara');
  let final = null;
  const apuntadas = [], registro = [];
  const interno = {
    leer: async () => ({ ok: true, lectura: respuesta }), ponerConsejo: () => {},
    vigilar: (desde) => { final = { desde, resultado: null }; }, final: () => final, ponerResumen: () => {},
  };
  const solo = crearSolo({ interno, ajustes: () => ({ activo: true, linea: 'roam', rango: 'glory', idioma: 'es' }), datosPara: () => datos, ahora: () => t, apuntar: (p) => apuntadas.push(p), registrar: (l) => registro.push(l) });
  const jugar = async (ban, minutosHastaLaTabla) => {
    respuesta = draftLeido(ban); await solo.tic();
    respuesta = { partida: true, rapida: true };
    t += 5000; await solo.tic(); t += 5000; await solo.tic();
    final = { ...final, resultado: 'gane', resultadoEn: final.desde + minutosHastaLaTabla * 60000, inicioEstimado: true, acabada: true };
    t += 20000; await solo.tic();
    t = Math.max(t, final.resultadoEn) + (MINUTOS_PARA_OTRO_DRAFT + 1) * 60000;
  };
  await jugar('Hirara', 12);
  eq(apuntadas.length, 1, 'la primera no se apunta');
  const primera = apuntadas[0].t;
  // Un draft «nuevo» y su tabla a los pocos minutos de la anterior: es la misma pantalla del final.
  await jugar('Atlas', 0.5);
  ok(final.resultadoEn - primera < MINUTOS_ENTRE_TABLAS * 60000, 'la prueba no pone la tabla cerca');
  eq(apuntadas.length, 1, `la misma tabla se apunta otra vez: ${JSON.stringify(apuntadas.map((p) => p.t))}`);
  ok(registro.some((l) => /es la misma partida/.test(l)), 'no lo dice en el registro');
  // Una partida de verdad después, sí.
  // A 12 minutos del draft (la tabla, a unos 16 de la anterior): lo más corto entre dos partidas de Javi en la base de datos.
  await jugar('Lukas', 12);
  ok(apuntadas.length < 2 || apuntadas[1].t - apuntadas[0].t < 25 * 60000, 'la prueba deja demasiado hueco');
  eq(apuntadas.length, 2, 'la partida siguiente, de verdad, no se apunta');
});

test('todo desde la tablet (3.70.0): al empezar la partida vigila el final y, con el resultado, apunta la partida una vez y pone el resumen', async () => {
  let t = 5_000_000;
  let respuesta = lectura({ tuyos: [N('Hirara'), N('Belerick')], suyos: [N('Eudora')], enemigos: [N('Clint'), N('Khufra'), V, V, V], aliados: [N('Gord'), N('Selena'), V, V, N('Rafaela')], tuyoFila: 4 });
  let final = null;
  const vigiladas = [], apuntadas = [], resumenes = [], maestrias = [];
  const interno = {
    leer: async () => ({ ok: true, lectura: respuesta }), ponerConsejo: () => {},
    vigilar: (desde, cuerpo) => { vigiladas.push({ desde, cuerpo }); final = { desde, resultado: null }; },
    final: () => final, ponerResumen: (r) => resumenes.push(r),
  };
  const maestria = { Rafaela: { games: 400, winRate: 0.62 } };
  let recortesPedidos = 0;
  const comprobantes = [];
  const solo = crearSolo({ interno, ajustes: () => ({ activo: true, linea: 'roam', rango: 'glory', idioma: 'es' }), datosPara: () => datos, ahora: () => t, apuntar: (p) => apuntadas.push(p), maestriaDe: () => { maestrias.push(1); return maestria; }, alSinLeer: () => { recortesPedidos += 1; }, alApuntarTabla: (c) => comprobantes.push(c) });
  await solo.tic();
  eq(maestrias.length, 0, 'el consejo usa tu maestría: el motor ya no la recibe (solo sirve para tus habituales)');
  eq(vigiladas.length, 0, 'vigila el final en pleno draft');
  respuesta = { partida: true, rapida: true };
  t += 5000; await solo.tic();
  t += 5000; await solo.tic();
  eq(vigiladas.length, 1, 'al empezar la partida no vigila el final');
  eq(vigiladas[0].desde, solo.estado().cerradoEn, 'vigila otro instante que el del cierre');
  ok(maestrias.length > 0, 'al cerrar el draft no mira tus habituales');
  t += 20000; await solo.tic();
  eq(apuntadas.length, 0, 'apunta sin resultado');
  const tabla = { id: 'fotograma-tabla', tira: 'AAAA', resultadoParecido: 0.98 };
  final = { ...final, resultado: 'gane', resultadoEn: t, resultadoId: tabla.id, fotogramas: [{ id: 'fotograma-antes', tira: 'BBBB' }, tabla], duracion: 14.2, inicioEstimado: false };
  t += 20000; await solo.tic();
  t += 20000; await solo.tic();
  eq(apuntadas.length, 1, 'no apunta, o apunta dos veces');
  const p = apuntadas[0];
  // El comprobante (3.101.0): una vez, con el instante de la partida apuntada y la pantalla de ESA tabla.
  eq(comprobantes.length, 1, 'no pide el comprobante, o lo pide dos veces');
  ok(comprobantes[0].t === p.t && comprobantes[0].gane === true && comprobantes[0].fotograma === tabla, `el comprobante no es el de la partida: ${JSON.stringify(comprobantes[0])}`);
  ok(p.pick === 'Rafaela' && p.gane === true && p.origen === 'lector' && p.fuente === 'tablet' && p.duracion === 14.2 && !p.supuesto, `la partida apuntada no cuadra: ${JSON.stringify(p)}`);
  ok(p.draft.enemigos.includes('Clint') && p.draft.aliados.includes('Gord') && !p.draft.aliados.includes('Rafaela') && p.bans.includes('Eudora'), `el draft de la partida no es el leído: ${JSON.stringify(p.draft)}`);
  ok(p.recomendados.length === 3 && typeof p.estimacion === 'number' && Number.isInteger(p.modelo), 'sin recomendados, estimación o modelo');
  eq(resumenes.length, 1, 'no pone el resumen en la notificación');
  ok(/^Ganada con Rafaela/.test(resumenes[0].titulo) && /tablet/.test(resumenes[0].texto), JSON.stringify(resumenes[0]));
  eq(solo.resumen().apuntadas, 1);
  eq(solo.resumen().partidas, 1, 'una partida cuenta dos veces, o ninguna (3.83.2)');
  eq(recortesPedidos, 0, 'pide recortes de un draft sin capturas');
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
  const juego = leerPng(readFileSync(join(RAIZ, 'pruebas/fixtures/juego/pantallas/juego-17.png')));
  const s = await arrancar({ capturar: async () => juego });
  abiertos.push(s);
  const r = await s.interno.leer({ rapida: true });
  ok(r.ok && r.lectura.partida === true && r.lectura.rapida === true, `en partida no sale la lectura rápida: ${JSON.stringify(r).slice(0, 200)}`);
  ok(!('tuyos' in r.lectura) && !('enemigos' in r.lectura), 'en partida reconoce caras (puede meter lag al juego)');
  const entera = await s.interno.leer({});
  ok(entera.ok && Array.isArray(entera.lectura.tuyos), 'sin «rápida» no hace la lectura entera');
});

test('sin voz (3.96.0): al empezar la partida, la tablet solo pide vigilar el final, sin guion ni «callar»', async () => {
  let t = 7_000_000;
  let respuesta = lectura({ tuyos: [N('Hirara')], suyos: [N('Eudora')], enemigos: [N('Clint'), N('Khufra'), V, V, V], aliados: [N('Gord'), N('Selena'), V, V, N('Rafaela')], tuyoFila: 4 });
  const vigiladas = [];
  const interno = { leer: async () => ({ ok: true, lectura: respuesta }), ponerConsejo: () => {}, vigilar: (...args) => vigiladas.push(args), final: () => null, ponerResumen: () => {} };
  const solo = crearSolo({ interno, ajustes: () => ({ activo: true, linea: 'roam', rango: 'glory', idioma: 'es' }), datosPara: () => datos, ahora: () => t, apuntar: () => {} });
  await solo.tic();
  respuesta = { partida: true, rapida: true };
  t += 5000; await solo.tic(); t += 5000; await solo.tic();
  eq(vigiladas.length, 1, 'no pide vigilar al empezar la partida');
  eq(vigiladas[0].length, 1, `manda algo más que el instante: ${JSON.stringify(vigiladas[0]).slice(0, 200)}`);
  // Un solo.json viejo con «voz: false» se lee igual y no deja rastro de voz.
  const casa = mkdtempSync(join(tmpdir(), 'solo-voz-'));
  const f = join(casa, 'solo.json');
  writeFileSync(f, JSON.stringify({ linea: 'roam', voz: false }));
  const a = ajustesEfectivos(leerAjustesSolo(f), { linea: 'mid', vozCallada: true });
  ok(a.activo && a.linea === 'roam' && !('voz' in a) && !('callar' in a), `quedan ajustes de voz: ${JSON.stringify(a)}`);
});

test('enseñar al lector sin el móvil (3.71.0): lo que no reconoció se guarda con las capturas del draft y sabe de qué partida es; la notificación no lo pide (3.89.0)', async () => {
  let t = 9_000_000;
  let n = 0;
  const conId = (l) => ({ ...l, id: `lectura-20261024-${String(n += 1).padStart(3, '0')}` });
  let respuesta = conId(lectura({ tuyos: [N('Hirara'), N('Belerick')], suyos: [N('Eudora')], enemigos: [N('Clint'), N('Khufra'), V, V, V], aliados: [N('Gord'), N('Selena'), V, V, N('Rafaela')], tuyoFila: 4 }));
  let final = null;
  const correcciones = [], resumenes = [];
  const interno = {
    leer: async () => ({ ok: true, lectura: respuesta }), ponerConsejo: () => {},
    vigilar: (desde) => { final = { desde, resultado: null }; }, final: () => final, ponerResumen: (r) => resumenes.push(r),
    ponerCorreccion: (c) => correcciones.push(c),
    protegerLecturas: (ids) => protegidas.push(ids),
  };
  const protegidas = [];
  const sinLeer = [];
  const solo = crearSolo({ interno, ajustes: () => ({ activo: true, linea: 'roam', rango: 'glory', idioma: 'es' }), datosPara: () => datos, ahora: () => t, apuntar: () => {}, alSinLeer: (x) => sinLeer.push(x) });
  await solo.tic();
  t += 5000; respuesta = conId(respuesta); await solo.tic();
  eq(correcciones.length, 0, 'pregunta en pleno draft');
  // Las capturas del draft abierto se protegen de la poda (3.81.4).
  eq(JSON.stringify(protegidas.at(-1)), JSON.stringify(['lectura-20261024-001', 'lectura-20261024-002']), 'no protege las capturas del draft abierto');
  // Las lecturas en partida no traen captura del draft: no cuentan.
  respuesta = { partida: true, rapida: true, id: 'lectura-de-la-partida' };
  t += 5000; await solo.tic(); t += 5000; await solo.tic();
  eq(correcciones.length, 1, 'al cerrarse el draft con «?» no lo pregunta');
  eq(JSON.stringify(protegidas.at(-1)), '[]', 'cerrado el draft, sigue protegiendo sus capturas (las de la corrección las guarda ella)');
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
  // 3.81.0: con alguien sin leer, sus capturas van a medir el lector, con la partida para cruzarla con su draft bueno.
  eq(sinLeer.length, 1, 'al apuntar un draft con «?» no pide sus recortes');
  ok(sinLeer[0].partida === t - 19000 && sinLeer[0].faltan === 5 && sinLeer[0].ids.length === 2 && sinLeer[0].leidos.enemigos[0] === 'Clint', JSON.stringify(sinLeer[0]));
  eq(sinLeer[0].cuando, solo.estado().cerradoEn ?? sinLeer[0].cuando);
  // 3.89.0: la notificación ya no te pide que se lo digas (juegas una detrás de otra); se revisa luego en «Capturas».
  ok(resumenes[0] && !/Toca para decirle|no reconoció/.test(resumenes[0].texto), `la notificación pide corregir: ${resumenes[0]?.texto}`);
  // Un draft leído entero no pregunta nada; y sin capturas, tampoco.
  const entero = { ...draftVacio(), baneos: ['Hirara'], enemigos: ['Clint', 'Khufra', 'Atlas', 'Franco', 'Tigreal'], aliados: ['Gord', 'Selena', 'Layla', 'Zilong', 'Rafaela'], cerrado: true, cerradoEn: 1, ids: ['lectura-1'] };
  eq(correccionDelDraft(entero, datos), null, 'pregunta sin faltar nadie');
  eq(correccionDelDraft({ ...entero, enemigos: [null, 'Khufra', 'Atlas', 'Franco', 'Tigreal'], ids: [] }, datos), null, 'pregunta sin capturas de las que aprender');
  eq(correccionDelDraft({ ...entero, enemigos: [null, 'Khufra', 'Atlas', 'Franco', 'Tigreal'] }, datos)?.faltan, 1);
  // El draft recuerda como mucho IDS_POR_DRAFT capturas, espaciadas (3.81.4): una lectura cada 1,5 s durante 3 minutos.
  const idDe = (ms) => `lectura-${new Date(Date.UTC(2026, 9, 27, 22, 20) + ms).toISOString().replace(/[:.]/g, '-')}-1`;
  const enElDraft = lectura({ tuyos: [N('Hirara'), N('Belerick')] });
  let d = null;
  for (let ms = 0; ms <= 180000; ms += 1500) d = acumularDraft(d, { ...enElDraft, id: idDe(ms) }, ms);
  ok(d.ids.length === IDS_POR_DRAFT && d.ids.at(-1) === idDe(180000), `sin tope o sin la última: ${d.ids.length}`);
  const instante = (id) => Date.parse(id.slice(8, 32).replace(/T(\d\d)-(\d\d)-(\d\d)-/, 'T$1:$2:$3.'));
  const huecos = d.ids.slice(0, -1).map((id, i) => instante(d.ids[i + 1]) - instante(id));
  ok(huecos.slice(0, -1).every((h) => h >= SEPARACION_IDS_MS), `capturas pegadas: ${huecos}`);
  ok(instante(d.ids.at(-1)) - instante(d.ids[0]) >= 70000, 'las capturas no llegan a la fase de picks: son los últimos segundos');
  // La pantalla de carga (sin la fila de baneos: «Gord 0,77» en los diez huecos) no entra.
  const carga = acumularDraft(d, { ...lectura({ tuyos: [N('Wanwan')], suyos: [] }), id: idDe(181500) }, 181500);
  eq(carga.ids.at(-1), idDe(180000), 'entra una captura que no es la pantalla del draft');
  ok(!acumularDraft(d, { ...enElDraft, id: '../fuera' }, 99).ids.includes('../fuera'), 'entra un id sin forma');
  eq(JSON.stringify(conCaptura([], 'lectura-x')), '["lectura-x"]');
});

test('la tablet vigila SU partida al cerrar el draft, aunque hubiera otra vigilancia en marcha (ya no hay otro que conduzca)', async () => {
  let t = 30_000_000, respuesta = lectura({ enemigos: [N('Yi Sun-shin'), V, V, V, N('Fredrinn')], aliados: [N('Wanwan'), V, V, V, V], tuyoFila: -1 });
  let final = { desde: t - 60000, activa: true, acabada: false, resultado: null };
  const vigiladas = [];
  const interno = { leer: async () => ({ ok: true, lectura: respuesta }), ponerConsejo: () => {}, vigilar: (desde) => { vigiladas.push(desde); final = { desde, activa: true }; }, final: () => final };
  const solo = crearSolo({ interno, ajustes: () => ({ activo: true, linea: 'roam', rango: 'glory', idioma: 'es' }), datosPara: () => datos, ahora: () => t, apuntar: () => {} });
  await solo.tic();
  respuesta = { partida: true, rapida: true };
  t += 5000; await solo.tic(); t += 5000; await solo.tic();
  ok(solo.estado().cerrado, 'la prueba necesita un draft cerrado');
  eq(JSON.stringify(vigiladas), JSON.stringify([solo.estado().cerradoEn]), 'al cerrar su draft no vigila su partida');
});

test('la fase de la burbuja tocable (3.86.1): «fuera» solo tras lecturas seguidas sin nadie; al empezar el draft, con un baneo leído, ya no', async () => {
  const cerrado = { ...draftVacio(), baneos: ['Hirara', 'Eudora'], enemigos: ['Clint', null, null, null, null], cerrado: true, cerradoEn: 1 };
  const nada = lectura({ suyos: [V, V, V, V, V] });
  const unBaneo = lectura({ tuyos: [N('Hirara')], suyos: [V, V, V, V, V] });
  eq(faseDe(cerrado, { partida: true }, 5), 'partida');
  eq(faseDe(cerrado, nada, LECTURAS_PARA_FUERA - 1), 'draft', 'una sola lectura vacía ya da «fuera»');
  eq(faseDe(cerrado, nada, LECTURAS_PARA_FUERA), 'fuera');
  eq(faseDe({ ...cerrado, cerrado: false }, nada, 9), 'draft', 'con un draft abierto da «fuera»');
  // El bucle: tras la partida, dos lecturas sin nadie dan «fuera»; el primer baneo del draft siguiente (aún sin abrirlo) la quita.
  let t = 7_000_000, respuesta = lectura({ enemigos: [N('Clint'), V, V, V, V] });
  const fases = [];
  const interno = { leer: async () => ({ ok: true, lectura: respuesta }), ponerConsejo: () => {}, vigilar: () => {}, final: () => null, ponerFase: (f) => fases.push(f) };
  const solo = crearSolo({ interno, ajustes: () => ({ activo: true, linea: 'roam', rango: 'glory', idioma: 'es' }), datosPara: () => datos, ahora: () => t });
  await solo.tic();
  respuesta = { partida: true, rapida: true };
  t += 5000; await solo.tic(); t += 5000; await solo.tic();
  respuesta = nada;
  t += 20000; await solo.tic();
  eq(fases.at(-1), 'draft', 'la primera lectura tras la partida ya da «fuera»');
  t += 20000; await solo.tic();
  eq(fases.at(-1), 'fuera', 'tras la partida, sin nadie en dos lecturas, no da «fuera»');
  respuesta = unBaneo;
  t += 20000; await solo.tic();
  eq(fases.at(-1), 'draft', 'con el primer baneo del draft siguiente sigue «fuera»: el botón tapa los baneos');
  // Una captura fallida no deja la fase de antes.
  interno.leer = async () => ({ ok: false, error: 'captura' });
  await solo.tic();
  eq(fases.at(-1), null, 'sin captura queda la fase vieja');
});

test('tu héroe con un toque (3.85.0): si no se leyó tu fila, la corrección trae tus habituales de la línea, sin los que ya salen en el draft', async () => {
  const maestria = { minotaur: { games: 120, winRate: 0.6 }, floryn: { games: 80, winRate: 0.55 }, rafaela: { games: 40, winRate: 0.5 }, diggie: { games: 30, winRate: 0.5 }, estes: { games: 20, winRate: 0.5 }, angela: { games: 10, winRate: 0.5 }, mathilda: { games: 5, winRate: 0.5 }, layla: { games: 500, winRate: 0.5 } };
  const h = tusHabituales(datos, 'roam', maestria, ['Floryn', null]);
  eq(h[0], 'Minotaur', `no van por partidas: ${h}`);
  ok(!h.includes('Floryn'), 'ofrece uno que ya sale en el draft');
  ok(!h.includes('Layla'), 'ofrece uno que no es de tu línea');
  eq(h.length, HABITUALES, 'no caben o sobran');
  eq(tusHabituales(datos, 'roam', null).length, 0, 'sin maestría se inventa habituales');
  const draft = { ...draftVacio(), baneos: ['Hirara'], enemigos: ['Clint', 'Khufra', 'Atlas', 'Franco', 'Tigreal'], aliados: ['Gord', 'Selena', 'Layla', 'Zilong', null], tuyoFila: 4, cerrado: true, cerradoEn: 1, ids: ['lectura-1'] };
  eq(JSON.stringify(correccionDelDraft(draft, datos, { tuyos: ['Minotaur', 'Nadie'] }).tuyos), JSON.stringify(['Minotaur']), 'sin tu fila no los trae, o trae uno que no existe');
  ok(!('tuyos' in correccionDelDraft({ ...draft, aliados: ['Gord', 'Selena', 'Layla', null, 'Rafaela'] }, datos, { tuyos: ['Minotaur'] })), 'con tu héroe leído los ofrece igual');
  // De punta a punta: el modo solo los saca de tu maestría al cerrar el draft.
  let t = 5_000_000, n = 0;
  const conId = (l) => ({ ...l, id: `lectura-20261029-${String(n += 1).padStart(3, '0')}` });
  let respuesta = conId(lectura({ tuyos: [N('Hirara'), N('Belerick')], enemigos: [N('Clint'), N('Khufra'), V, V, V], aliados: [N('Gord'), N('Selena'), V, V, V], tuyoFila: 4 }));
  const correcciones = [];
  const interno = { leer: async () => ({ ok: true, lectura: respuesta }), ponerConsejo: () => {}, vigilar: () => {}, final: () => null, ponerCorreccion: (c) => correcciones.push(c) };
  const solo = crearSolo({ interno, ajustes: () => ({ activo: true, linea: 'roam', rango: 'glory', idioma: 'es' }), datosPara: () => datos, ahora: () => t, maestriaDe: () => maestria });
  await solo.tic();
  respuesta = { partida: true, rapida: true };
  t += 5000; await solo.tic(); t += 5000; await solo.tic();
  eq(correcciones[0]?.tuyos?.[0], 'Minotaur', `la corrección del modo solo no trae tus habituales: ${JSON.stringify(correcciones[0]?.tuyos)}`);
});

test('la burbuja no dice «de los tuyos» y el motor no recibe tu maestría: el mejor de TODOS, juegues o no', () => {
  const draft = acumularDraft(null, lectura({ tuyos: [N('Hirara')], enemigos: [N('Clint'), N('Khufra'), V, V, V] }), 1);
  const sin = decidirSolo({ datos, draft, linea: 'roam' });
  const ultimo = sin.rec.ranking.at(-1).heroe.name;
  const c = consejoSolo({ datos, draft, linea: 'roam', maestria: { [ultimo]: { games: 300, winRate: 0.5 } } });
  ok(c?.titulo && !/De los tuyos|Yours/.test(c.detalle ?? ''), `la burbuja sigue proponiendo uno de los que juegas: ${c?.detalle}`);
  eq(c.titulo, consejoSolo({ datos, draft, linea: 'roam' }).titulo, 'lo que juegas cambia el nº1 de la burbuja');
  ok(!('deLosTuyos' in sin.rec) || sin.rec.deLosTuyos == null, 'el motor sigue dando «de los tuyos»');
});

test('el draft siguiente se ve por sus baneos, no solo por el reloj (3.72.5): tras la partida, en cuanto hay baneos nuevos; y si alguien abandona el draft, en cuanto cambian los huecos de baneo', () => {
  const T = 1_000_000;
  // Un draft entero y cerrado por la partida.
  let d = acumularDraft(null, lectura({ tuyos: [N('Hirara'), N('Belerick'), N('Atlas'), V, V], suyos: [N('Eudora'), N('Saber'), V, V, V], enemigos: [N('Clint'), N('Khufra'), V, V, V] }), T);
  d = acumularDraft(d, { partida: true }, T + 1000); d = acumularDraft(d, { partida: true }, T + 2000);
  ok(d.cerrado, 'la partida no cierra el draft');
  // La pantalla de carga (los mismos héroes, sin baneos) no es otro draft.
  eq(acumularDraft(d, lectura({ suyos: [], enemigos: [N('Clint'), N('Khufra'), V, V, V] }), T + 30000).cerrado, true, 'la carga de la misma partida abre otro draft');
  // Un baneo nuevo solo (puede ser uno mal leído) tampoco.
  eq(acumularDraft(d, lectura({ tuyos: [N('Lolita'), V, V, V, V], suyos: [N('Eudora'), N('Saber'), V, V, V] }), T + 60000).cerrado, true, 'un solo baneo distinto abre otro draft');
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
      leer: async () => ({ ok: true, lectura: respuestaLista }), ponerConsejo: () => {},
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
  ok(v.apuntadas[0].desde === v.desde() && v.apuntadas[0].resultadoDe === 'pregunta', `la partida no dice de qué draft es ni que el resultado se preguntó (3.75.0): ${JSON.stringify(v.apuntadas[0])}`);
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
  eq(g.apuntadas[0].resultadoDe, 'tabla', 'el resultado leído no se marca como leído de la tabla');
  ok(/How did the game end/.test(resumenPregunta(1, null, 'en').titulo));
});

test('lo que se perdía sin el móvil (3.74.3): la pregunta pisada o caducada se dice, la respuesta tardía no cambia la hora de la partida, y la corrección contestada antes de apuntar se aplica', async () => {
  const montar = ({ contestadaAntes = null } = {}) => {
    let t = 20_000_000, final = null, respuesta = null, contestada = contestadaAntes;
    // Con id de captura: lo que no reconoce se pregunta en la tarjeta «Enseña al lector».
    let lista = { ...lectura({ tuyos: [N('Hirara'), N('Belerick')], suyos: [N('Eudora')], enemigos: [N('Clint'), N('Khufra'), V, V, V], aliados: [N('Gord'), N('Selena'), V, V, N('Rafaela')], tuyoFila: 4 }), id: 'lectura-1' };
    const preguntas = [], apuntadas = [], registro = [], corregidas = [], correcciones = [], sinLeer = [], sinResultado = [], finales = [];
    const interno = {
      leer: async () => ({ ok: true, lectura: lista }), ponerConsejo: () => {},
      vigilar: (desde) => { final = { desde, activa: true, acabada: false, resultado: null, inicio: desde + 1000, duracion: null }; },
      final: () => final, ponerResumen: () => {}, ponerCorreccion: (c) => correcciones.push(c),
      ponerPregunta: (p) => preguntas.push(p), respuesta: () => { const r = respuesta; respuesta = null; return r; },
      correccionContestada: () => { const c = typeof contestada === 'function' ? contestada(final) : contestada; contestada = null; return c; },
    };
    const solo = crearSolo({ interno, ajustes: () => ({ activo: true, linea: 'roam', rango: 'glory', idioma: 'es' }), datosPara: () => datos, ahora: () => t, apuntar: (p) => apuntadas.push(p), registrar: (m) => registro.push(m), alCorregir: (c) => corregidas.push(c), alSinLeer: (c) => sinLeer.push(c), guardarSinResultado: (p) => { sinResultado.push(p); return true; }, alFinalSinLeer: (f) => finales.push(f) });
    return {
      preguntas, apuntadas, registro, corregidas, correcciones, sinLeer, sinResultado, finales,
      paso: async (ms = 5000) => { t += ms; await solo.tic(); }, saltar: (ms) => { t += ms; },
      leer: (l) => { lista = l; }, fin: (f) => { final = { ...final, ...f }; }, contestar: (r) => { respuesta = { ...r, cuando: t }; }, desde: () => final?.desde,
    };
  };
  const jugar = async (m) => { await m.paso(); m.leer({ partida: true, rapida: true }); await m.paso(); await m.paso(); };
  eq(PREGUNTA_CADUCA_MS, RETENCION_CAPTURAS_MS, 'la pregunta caduca a otra hora que en la APK');
  // Contestas dos horas después: la partida va con la hora en que acabó, no con la de contestar.
  const tarde = montar();
  await jugar(tarde);
  tarde.fin({ acabada: true, activa: false, duracion: 13.5 });
  await tarde.paso(20000);
  tarde.saltar(2 * 3600000);
  tarde.contestar({ desde: tarde.desde(), gane: true });
  await tarde.paso(1000);
  eq(tarde.apuntadas.length, 1);
  eq(tarde.apuntadas[0].t, tarde.desde() + 1000 + 13.5 * 60000, 'la partida va con la hora de contestar');
  // Sin duración ni final: la del draft.
  const sinNada = montar();
  await jugar(sinNada);
  sinNada.fin({ acabada: true, activa: false });
  await sinNada.paso(20000);
  sinNada.saltar(3600000);
  sinNada.contestar({ desde: sinNada.desde(), gane: false });
  await sinNada.paso(1000);
  eq(sinNada.apuntadas[0]?.t, sinNada.desde(), 'sin duración, la partida no va con la hora del draft');
  // Dos partidas sin contestar: la segunda pregunta pisa a la primera, y se dice.
  const dos = montar();
  await jugar(dos);
  dos.fin({ acabada: true, activa: false });
  await dos.paso(20000);
  dos.leer(lectura({ tuyos: [N('Lolita'), N('Franco')], suyos: [N('Valir'), V] }));
  await dos.paso(60000);
  dos.leer(lectura({ tuyos: [N('Lolita'), N('Franco')], suyos: [N('Valir')], enemigos: [N('Clint'), N('Khufra'), V, V, V], aliados: [N('Gord'), N('Selena'), V, V, N('Rafaela')], tuyoFila: 4 }));
  await jugar(dos);
  dos.fin({ acabada: true, activa: false });
  await dos.paso(20000);
  eq(dos.preguntas.length, 2, JSON.stringify(dos.preguntas.map((p) => p.id)));
  // Desde 3.81.5 no se pierde: se guarda sin resultado, con su draft, para decirlo después en «Mis partidas».
  ok(dos.registro.some((l) => /queda en «Mis partidas» sin resultado/.test(l)), `la partida pisada se pierde sin decirlo: ${dos.registro.slice(-3).join(' | ')}`);
  const pisada = dos.sinResultado[0];
  ok(dos.sinResultado.length === 1 && pisada.gane === undefined && pisada.pick && pisada.draft?.enemigos?.includes('Clint') && Number.isFinite(pisada.desde) && Number.isFinite(pisada.t), `la partida pisada no se guarda sin resultado: ${JSON.stringify(dos.sinResultado)}`);
  eq(dos.apuntadas.length, 0, 'la pisada se apunta con un resultado inventado');
  // Al preguntar, las pantallas del final de ESA partida van a ver por qué no se reconoció (3.81.5).
  dos.fin({ fotogramas: [{ id: 'fotograma-1', miniatura: 'x' }] });
  const caso = montar();
  await jugar(caso);
  // Con el inicio y la duración vistos: su instante es el final, no el del draft.
  caso.fin({ acabada: true, activa: false, inicio: caso.desde() + 60000, duracion: 14, fotogramas: [{ id: 'fotograma-2026-10-27T22-32-00-000Z', miniatura: 'iVBORw0KGgo=' }], pantalla: 'fotograma-2026-10-27T22-31-58-000Z' });
  await caso.paso(20000);
  ok(caso.finales.length === 1 && caso.finales[0].desde === caso.desde() && caso.finales[0].fotogramas.length === 1 && caso.finales[0].motivo, `al preguntar no manda las pantallas del final: ${JSON.stringify(caso.finales)}`);
  // Y la pantalla entera de después de la partida (4.0.6), para subirla en grande.
  eq(caso.finales[0].pantalla, 'fotograma-2026-10-27T22-31-58-000Z', 'al preguntar no manda la pantalla de después de la partida');
  // Con el resultado leído de la tabla no sube nada del final: ni las pantallas ni la grande.
  const leida = montar();
  await jugar(leida);
  leida.fin({ acabada: true, activa: false, resultado: 'gane', resultadoEn: leida.desde() + 900000, inicio: leida.desde() + 60000, duracion: 14, fotogramas: [{ id: 'fotograma-2026-10-27T22-32-00-000Z', miniatura: 'iVBORw0KGgo=' }], pantalla: 'fotograma-2026-10-27T22-31-58-000Z' });
  await leida.paso(20000);
  ok(leida.apuntadas.length === 1 && leida.finales.length === 0, `con el resultado leído sube las pantallas del final: ${JSON.stringify(leida.finales.map((f) => f.pantalla))}`);
  // Con la partida sin resultado (3.89.4), para contestarla en «Capturas» del móvil: su draft, sin resultado inventado.
  const conPartida = caso.finales[0].partida;
  eq(conPartida.t, caso.desde() + 60000 + 14 * 60000, 'la partida del recorte no va con el instante del final');
  ok(conPartida && conPartida.pick && conPartida.draft?.enemigos?.includes('Clint') && !('gane' in conPartida) && Number.isFinite(conPartida.t) && conPartida.origen === 'lector', `las pantallas del final van sin la partida, o con un resultado: ${JSON.stringify(conPartida)}`);
  // El mismo instante en el recorte y en la guardada sin resultado (3.90.2): el móvil la apunta con el del
  // recorte y la tablet la da por contestada solo si coincide. Calculado al caducar, con el final de otro draft, era otro.
  caso.fin({ acabada: true, activa: false, desde: caso.desde() + 3600000, resultadoEn: caso.desde() + 4000000 });
  await caso.paso(PREGUNTA_CADUCA_MS + 1000);
  eq(caso.sinResultado[0]?.t, conPartida.t, 'la partida del recorte y la guardada sin resultado llevan instantes distintos');
  // Contestada en la tablet cuando ya hay otro draft vigilado (3.90.2): con el instante de al preguntar, el que
  // lleva la guardada en el móvil; recalculado, era la hora del draft y la partida salía dos veces.
  const luego = montar();
  await jugar(luego);
  const desdeLuego = luego.desde();
  luego.fin({ acabada: true, activa: false, inicio: desdeLuego + 60000, duracion: 14 });
  await luego.paso(20000);
  luego.fin({ desde: desdeLuego + 3600000, activa: true, acabada: false, inicio: null, duracion: null });
  luego.contestar({ desde: desdeLuego, gane: true });
  await luego.paso(1000);
  eq(luego.apuntadas[0]?.t, desdeLuego + 60000 + 14 * 60000, 'la contestada con otro draft en marcha cambia de instante');
  // La pregunta caduca sin contestar: se dice.
  const caduca = montar();
  await jugar(caduca);
  caduca.fin({ acabada: true, activa: false });
  await caduca.paso(20000);
  eq(caduca.preguntas.length, 1);
  await caduca.paso(PREGUNTA_CADUCA_MS + 1000);
  ok(caduca.registro.some((l) => /a tiempo/.test(l)), 'la pregunta caduca en silencio');
  eq(caduca.sinResultado.length, 1, 'la caducada no se guarda sin resultado');
  caduca.contestar({ desde: caduca.desde(), gane: true });
  await caduca.paso(1000);
  eq(caduca.apuntadas.length, 0, 'apunta con una respuesta a una pregunta que ya no está');
  // La corrección contestada antes de apuntar: se aplica a la partida al apuntarla, y la tarjeta no vuelve.
  const contestada = { enemigos: ['Clint', 'Khufra', 'Layla', 'Atlas', 'Franco'], aliados: ['Gord', 'Selena', 'Miya', 'Lancelot'], tuyo: 'Rafaela' };
  const antes = montar({ contestadaAntes: (f) => ({ cuando: f.desde, ...contestada }) });
  await jugar(antes);
  const tarjetas = antes.correcciones.length;
  eq(tarjetas, 1, 'el draft con huecos sin reconocer no pone la tarjeta');
  antes.fin({ acabada: true, activa: false, resultado: 'perdi', resultadoEn: 30_000_000 });
  await antes.paso(20000);
  eq(antes.apuntadas.length, 1);
  eq(JSON.stringify(antes.corregidas), JSON.stringify([{ partida: 30_000_000, ...contestada }]), 'la corrección contestada antes no se aplica a la partida');
  eq(antes.correcciones.length, tarjetas, 'la tarjeta ya contestada vuelve a salir');
  // Y sus capturas van igual a medir el lector (3.81.0): la partida ya trae el draft bueno.
  ok(antes.sinLeer.length === 1 && antes.sinLeer[0].partida === 30_000_000, `contestada antes, no pide los recortes: ${JSON.stringify(antes.sinLeer)}`);
  // Una contestada de OTRO draft no se aplica.
  const otra = montar({ contestadaAntes: { cuando: 1, ...contestada } });
  await jugar(otra);
  otra.fin({ acabada: true, activa: false, resultado: 'gane', resultadoEn: 30_000_000 });
  await otra.paso(20000);
  eq(otra.corregidas.length, 0, 'aplica la corrección de otra partida');
});

test('/estado cuenta las lecturas (todas del modo solo) y las consultas del móvil; la corrección contestada en la APK antes de apuntar se guarda una vez', async () => {
  const t = 1_000_000;
  const s = await arrancar({ capturar: async () => { throw new Error('sin captura'); }, ahora: () => t });
  abiertos.push(s);
  await s.interno.leer({ rapida: true });
  const e = s.interno.estado();
  ok(e.lector.lecturas === 1 && !('lecturasSolo' in e.lector) && e.movil.consultas === 0, `no cuenta bien las lecturas o el móvil: ${JSON.stringify({ lector: e.lector, movil: e.movil })}`);
  s.interno.ponerCorreccion({ id: 'correccion-5', cuando: t, ids: ['lectura-1'], heroes: ['Clint', 'Khufra', 'Layla', 'Gord'], leidos: { enemigos: ['Clint'] } });
  const r = await pedirApk(s.puerto, '/correccion', { metodo: 'POST', cuerpo: { id: 'correccion-5', enemigos: ['Clint', 'Khufra', 'Layla'], aliados: ['Gord'] } });
  eq(r.estado, 200, `POST /correccion: ${r.estado} ${r.cuerpo}`);
  const c = s.interno.correccionContestada();
  ok(c && c.cuando === t && c.enemigos.length === 3 && c.aliados[0] === 'Gord', `no se guarda la contestada: ${JSON.stringify(c)}`);
  eq(s.interno.correccionContestada(), null, 'se recoge dos veces');
});

test('el resumen de la partida dice cómo va la sesión y, en racha mala, cómo te va tras perder, con tus partidas (3.77.0)', async () => {
  const partida = { t: 5, pick: 'Rafaela', gane: false, recomendados: ['Rafaela'] };
  const sesion = { n: 4, ganadas: 1 };
  const peor = { racha: { gane: false, n: 3 }, sesion, trasPerder: { wr: 0.38, n: 40, wrResto: 0.6, nResto: 60, seVe: true, dif: -0.22 } };
  const r1 = resumenSolo(partida, 'es', peor).texto;
  ok(/Hoy: 1 ganadas, 3 perdidas/.test(r1) && /3 derrotas seguidas: tras perder ganas un 38% \(si no, un 60%\)\. Quizá toca un descanso/.test(r1), r1);
  const igual = { ...peor, trasPerder: { ...peor.trasPerder, seVe: false } };
  ok(/perder no empeora la siguiente/.test(resumenSolo(partida, 'es', igual).texto) && !/descanso/.test(resumenSolo(partida, 'es', igual).texto), 'afirma lo que no se distingue');
  const unaSola = { ...peor, racha: { gane: false, n: 1 } };
  ok(!/derrotas seguidas/.test(resumenSolo(partida, 'es', unaSola).texto), 'habla de racha con una sola derrota');
  ok(!/Hoy/.test(resumenSolo(partida, 'es', { ...peor, sesion: { n: 1, ganadas: 0 } }).texto), 'dice la sesión con una partida');
  ok(/A break might help/.test(resumenSolo(partida, 'en', peor).texto));
  eq(resumenSolo(partida, 'es').texto, resumenSolo(partida, 'es', null).texto, 'sin números, cambia el resumen de siempre');
  // El modo solo lo pide al apuntar.
  let t = 20_000_000, final = null;
  const resumenes = [];
  const lista = lectura({ tuyos: [N('Hirara'), N('Belerick')], suyos: [N('Eudora')], enemigos: [N('Clint'), N('Khufra'), V, V, V], aliados: [N('Gord'), N('Selena'), V, V, N('Rafaela')], tuyoFila: 4 });
  let leida = lista;
  const interno = { leer: async () => ({ ok: true, lectura: leida }), ponerConsejo: () => {}, vigilar: (desde) => { final = { desde, activa: true }; }, final: () => final, ponerResumen: (r) => resumenes.push(r) };
  const solo = crearSolo({ interno, ajustes: () => ({ activo: true, linea: 'roam', rango: 'glory', idioma: 'es' }), datosPara: () => datos, ahora: () => t, apuntar: () => {}, numerosDe: () => peor });
  const paso = async () => { t += 5000; await solo.tic(); };
  await paso(); leida = { partida: true, rapida: true }; await paso(); await paso();
  final = { ...final, resultado: 'perdi', resultadoEn: t, activa: false };
  await paso();
  ok(resumenes.some((r) => /Quizá toca un descanso/.test(r.texto ?? '')), `el modo solo no pasa tus números al resumen: ${JSON.stringify(resumenes.map((r) => r.texto))}`);
});

// ── Protocolo 2: la tablet lleva el draft; el móvil lo copia y le manda lo que tú tocas ──

/** Un modo solo con un servidor de pega, para seguir un draft de punta a punta. */
function conductor({ conIds = true } = {}) {
  let t = 50_000_000, n = 0, final = null, respuesta = null;
  const reg = { consejos: [], apuntadas: [], aprendidas: [], arregladas: [], cambiadas: [], terminadas: [], preguntas: [], correcciones: [], sinResultado: [] };
  const conId = (l) => (conIds ? { ...l, id: `lectura-2026-11-14T20-00-${String(n += 1).padStart(2, '0')}-000Z-${n}` } : l);
  let leida = conId(lectura({ tuyos: [N('Hirara'), N('Belerick')], suyos: [N('Eudora')], enemigos: [N('Clint'), N('Joy'), V, V, V], aliados: [N('Gord'), N('Selena'), V, V, N('Rafaela')], tuyoFila: 4 }));
  const guardadas = new Map();
  const interno = {
    leer: async () => ({ ok: true, lectura: leida }), ponerConsejo: (c) => reg.consejos.push(c), ponerFase: () => {}, ponerResumen: () => {},
    vigilar: (desde) => { final = { desde, activa: true, acabada: false, resultado: null, inicio: desde + 1000, duracion: null, fotogramas: [] }; },
    final: () => final, terminarVigilancia: (d) => reg.terminadas.push(d), ponerCorreccion: (c) => reg.correcciones.push(c),
    ponerPregunta: (p) => reg.preguntas.push(p), respuesta: () => { const r = respuesta; respuesta = null; return r; },
    aprenderDe: async (v) => { reg.aprendidas.push(v); return { aprendido: true }; },
  };
  const solo = crearSolo({
    interno, ajustes: () => ({ activo: true, linea: 'roam', rango: 'glory', idioma: 'es' }), datosPara: () => datos, ahora: () => t,
    apuntar: (p) => { reg.apuntadas.push(p); guardadas.set(p.t, p); },
    partidaGuardada: (tt) => guardadas.get(tt) ?? null,
    alCorregir: (c) => { reg.arregladas.push(c); const p = guardadas.get(c.partida); if (p) guardadas.set(c.partida, { ...p, pick: c.tuyo ?? p.pick, draft: { ...p.draft, enemigos: c.enemigos, aliados: c.aliados } }); },
    alCambiarResultado: (tt, gane) => { reg.cambiadas.push([tt, gane]); const p = guardadas.get(tt) ?? reg.sinResultado.find((x) => x.t === tt); if (!p) return null; const nueva = { ...p, gane }; guardadas.set(tt, nueva); return nueva; },
    guardarSinResultado: (p) => { reg.sinResultado.push(p); return true; },
  });
  return {
    solo, reg, paso: async (ms = 1500) => { t += ms; await solo.tic(); }, ahora: () => t,
    leer: (l) => { leida = conId(l); }, fin: (f) => { final = { ...final, ...f }; }, contestar: (r) => { respuesta = r; },
    cerrar: async () => { leida = { partida: true, rapida: true }; t += 5000; await solo.tic(); t += 5000; await solo.tic(); },
  };
}

test('la corrección del móvil manda sobre lo leído: lo que quitas no vuelve, lo que añades ocupa un hueco, tu héroe va en tu fila, y lo leído después sigue entrando', () => {
  let d = acumularDraft(null, lectura({ tuyos: [N('Hirara'), N('Belerick')], enemigos: [N('Clint'), N('Joy'), V, V, V], aliados: [N('Gord'), V, V, V, N('Rafaela')], tuyoFila: 4 }), 1000);
  const c = registrarCorreccion(d, sanearCorreccion({ desde: d.desde, enemigos: ['Clint', 'Khufra'], aliados: ['Gord'], tuyo: 'Rafaela', baneos: ['Hirara'] }));
  ok(c.rechazados.enemigos.join() === 'Joy' && c.rechazados.baneos.join() === 'Belerick,Valir,Cici' && !c.rechazados.aliados.length, `no apunta lo que quitaste: ${JSON.stringify(c.rechazados)}`);
  let v = conCorreccion(d, c);
  ok(v.enemigos.join() === 'Clint,Khufra,,,' && v.baneos.join() === 'Hirara' && v.aliados[4] === 'Rafaela' && v.corregido, `la corrección no manda: ${JSON.stringify(v)}`);
  // Lo leído después: Joy (quitado) no vuelve; Layla (nuevo) entra; la corrección sigue con el draft.
  d = acumularDraft({ ...d, correccion: c }, lectura({ tuyos: [N('Hirara'), N('Belerick')], enemigos: [N('Clint'), N('Joy'), N('Layla'), V, V] }), 2000);
  ok(d.correccion === c, 'acumular más lecturas pierde la corrección');
  v = conCorreccion(d);
  eq(v.enemigos.join(), 'Clint,Khufra,Layla,,', 'lo quitado vuelve o lo leído después no entra');
  // Sin tu fila leída, tu héroe ocupa un hueco libre y esa es tu fila.
  const sinFila = acumularDraft(null, lectura({ tuyos: [N('Hirara'), N('Belerick')], aliados: [N('Gord'), N('Selena'), V, V, V] }), 1);
  const v2 = conCorreccion(sinFila, registrarCorreccion(sinFila, sanearCorreccion({ desde: sinFila.desde, enemigos: [], aliados: ['Gord', 'Selena'], tuyo: 'Rafaela' })));
  ok(v2.tuyoFila >= 0 && v2.aliados[v2.tuyoFila] === 'Rafaela' && v2.aliados.filter(Boolean).length === 3, `tu héroe no va en tu fila: ${JSON.stringify(v2)}`);
  // Leído en tu equipo y corregido como rival: cambia de lado.
  const mal = acumularDraft(null, lectura({ tuyos: [N('Hirara'), N('Belerick')], aliados: [N('Clint'), V, V, V, V] }), 1);
  const v3 = conCorreccion(mal, registrarCorreccion(mal, sanearCorreccion({ desde: mal.desde, enemigos: ['Clint'], aliados: [] })));
  ok(!v3.aliados.includes('Clint') && v3.enemigos.includes('Clint'), `un héroe corregido de lado sigue en los dos: ${JSON.stringify(v3)}`);
  // Sin tu héroe en la corrección, tu fila leída se queda.
  const tuya = conCorreccion(d, registrarCorreccion(d, sanearCorreccion({ desde: d.desde, enemigos: ['Clint'], aliados: ['Gord'] })));
  eq(tuya.aliados[4], 'Rafaela', 'una corrección sin tu héroe te quita de tu fila');
  // Y el motor decide con lo corregido.
  const dec = decidirSolo({ datos, draft: v, linea: 'roam' });
  ok(dec.enemigos.some((h) => h.name === 'Khufra') && !dec.enemigos.some((h) => h.name === 'Joy') && dec.tuyo?.name === 'Rafaela', `el motor no decide con lo corregido: ${dec.enemigos.map((h) => h.name)}`);
  eq(conCorreccion(d, null), d, 'sin corrección no devuelve el mismo draft');
});

test('GET /draft: el draft abierto (o el último cerrado) con su identidad y los nombres del catálogo, y la partida del último cerrado con su registro al apuntarse', async () => {
  const { solo, paso, cerrar, fin, leer, ahora } = conductor();
  const vacio = solo.paraElMovil();
  ok(vacio.draft === null && vacio.partida === null, `sin draft dice algo: ${JSON.stringify(vacio)}`);
  await paso();
  const desde = ahora();
  let v = solo.paraElMovil();
  ok(v.draft.desde === desde && v.draft.cambiado === desde && !v.draft.cerrado && v.draft.cerradoEn === null && v.draft.linea === 'roam', `el draft no lleva su identidad: ${JSON.stringify(v.draft)}`);
  ok(v.draft.enemigos.join() === 'Clint,Joy,,,' && v.draft.tuyoFila === 4 && v.draft.tuyo === 'Rafaela' && v.draft.baneos.join() === 'Hirara,Belerick,Eudora' && v.draft.porPicks && !v.draft.corregido && v.partida === null, JSON.stringify(v));
  // La forma es EXACTAMENTE la del contrato: sanearla no cambia nada.
  eq(JSON.stringify(sanearDraftTablet(v.draft)), JSON.stringify(v.draft), 'el draft de la tablet no tiene la forma del contrato');
  await paso();
  eq(solo.paraElMovil().draft.desde, desde, 'otra lectura del mismo draft le cambia la identidad');
  await cerrar();
  v = solo.paraElMovil();
  ok(v.draft.cerrado && Number.isFinite(v.draft.cerradoEn) && v.draft.desde === desde, 'cerrado, no lo dice');
  eq(JSON.stringify(v.partida), JSON.stringify({ desde, estado: 'vigilando', gane: null, registro: null }), 'la partida del draft cerrado no se vigila');
  fin({ resultado: 'gane', resultadoEn: ahora() + 600000, acabada: true, activa: false, duracion: 12, inicioEstimado: false });
  await paso(20000);
  v = solo.paraElMovil();
  ok(v.partida.estado === 'apuntada' && v.partida.gane === true && Number.isFinite(v.partida.registro?.t) && v.partida.registro.pick === 'Rafaela', `apuntada, no lo dice: ${JSON.stringify(v.partida)}`);
  ok(!('desde' in v.partida.registro) && !('resultadoDe' in v.partida.registro), 'el registro lleva lo que solo sabe la tablet');
  eq(JSON.stringify(sanearPartidaTablet(v.partida)), JSON.stringify(v.partida), 'la partida de la tablet no tiene la forma del contrato');
  // Empieza otro draft: el draft es el nuevo y la partida sigue siendo la del último cerrado.
  leer(lectura({ tuyos: [N('Lolita'), N('Franco')], enemigos: [N('Layla'), V, V, V, V] }));
  await paso(4 * 60000);
  v = solo.paraElMovil();
  ok(v.draft.desde > desde && !v.draft.cerrado && v.partida?.desde === desde && v.partida.estado === 'apuntada', `con otro draft se pierde la partida del anterior: ${JSON.stringify({ d: v.draft.desde, p: v.partida })}`);
});

test('POST /draft: tu corrección manda en la burbuja y en la partida que se apunta; la tablet aprende de ella una vez y solo con el draft cerrado; de otro draft, no', async () => {
  const { solo, reg, paso, cerrar, fin, ahora } = conductor();
  await paso();
  const desde = solo.paraElMovil().draft.desde;
  eq(solo.corregir(sanearCorreccion({ desde: desde + 1, enemigos: ['Clint'] })), false, 'acepta la corrección de otro draft');
  ok(solo.corregir(sanearCorreccion({ desde, enemigos: ['Clint', 'Khufra'], aliados: ['Gord', 'Selena'], tuyo: 'Rafaela', baneos: ['Hirara', 'Belerick', 'Eudora'] })), 'no acepta la corrección del draft abierto');
  eq(solo.paraElMovil().draft.corregido, true, 'el draft no dice que está corregido');
  // Lo leído que quitaste es una cara mal leída: cuenta una vez por draft (4.0.5).
  eq(solo.resumen().quitados.Joy, 1, `no cuenta a Joy como quitado: ${JSON.stringify(solo.resumen().quitados)}`);
  ok(!('Clint' in solo.resumen().quitados), 'cuenta como quitado a uno que dejaste');
  await paso();
  const H = (nombre) => datos.heroes.find((h) => h.name === nombre);
  const rec = recomendar(datos, { linea: 'roam', enemigos: [H('Clint'), H('Khufra')], aliados: [H('Gord'), H('Selena')], baneos: [H('Hirara'), H('Belerick'), H('Eudora')], miPick: H('Rafaela'), conSimulacion: false });
  ok(reg.consejos.length >= 2, 'con la corrección no vuelve a decidir la burbuja');
  const ultimo = reg.consejos.at(-1);
  ok(!JSON.stringify(ultimo).includes('Joy'), `la burbuja sigue con lo quitado: ${JSON.stringify(ultimo)}`);
  ok(rec && ultimo, 'la prueba necesita la decisión del motor');
  eq(reg.aprendidas.length, 0, 'aprende de un draft que aún está abierto');
  await cerrar();
  eq(reg.aprendidas.length, 1, 'al cerrarse el draft corregido no aprende');
  const verdad = reg.aprendidas[0];
  ok(verdad.enemigos.join() === 'Clint,Khufra' && verdad.tuyo === 'Rafaela' && verdad.ids.length >= 2 && verdad.ids.every((id) => /^lectura-/.test(id)), `aprende con otra verdad o sin las capturas del draft: ${JSON.stringify(verdad)}`);
  ok(solo.corregir(sanearCorreccion({ desde, enemigos: ['Clint', 'Khufra'], aliados: ['Gord', 'Selena'], tuyo: 'Rafaela', baneos: ['Hirara', 'Belerick', 'Eudora'] })), 'la misma corrección tras cerrar se rechaza');
  eq(reg.aprendidas.length, 1, 'la misma corrección se aprende dos veces');
  eq(solo.resumen().quitados.Joy, 1, 'la misma cara quitada dos veces en el mismo draft cuenta dos');
  // Se apunta con lo corregido: Khufra, y tu pick sin «supuesto».
  fin({ resultado: 'perdi', resultadoEn: ahora() + 700000, acabada: true, activa: false, duracion: 13, inicioEstimado: false });
  await paso(20000);
  const p = reg.apuntadas[0];
  ok(p && p.draft.enemigos.includes('Khufra') && !p.draft.enemigos.includes('Joy') && p.pick === 'Rafaela' && !p.supuesto, `la partida no se apunta con lo corregido: ${JSON.stringify(p?.draft)}`);
  // Corregida DESPUÉS de apuntar: se arregla la apuntada (y su registro) y se aprende de lo nuevo.
  ok(solo.corregir(sanearCorreccion({ desde, enemigos: ['Clint', 'Khufra', 'Layla'], aliados: ['Gord', 'Selena'], tuyo: 'Rafaela' })));
  ok(reg.arregladas.length === 1 && reg.arregladas[0].partida === p.t && reg.arregladas[0].enemigos.includes('Layla'), `la partida apuntada no se arregla: ${JSON.stringify(reg.arregladas)}`);
  ok(solo.paraElMovil().partida.registro.draft.enemigos.includes('Layla'), 'el registro que ve el móvil no lleva el arreglo');
  eq(reg.aprendidas.length, 2, 'una corrección distinta no se aprende');
});

test('POST /draft quita la tarjeta «Enseña al lector» de ese draft: ya está corregido', async () => {
  const { solo, reg, paso, cerrar, leer } = conductor();
  leer(lectura({ tuyos: [N('Hirara'), N('Belerick')], enemigos: [N('Clint'), V, V, V, V], aliados: [N('Gord'), V, V, V, N('Rafaela')], tuyoFila: 4 }));
  await paso();
  await cerrar();
  ok(reg.correcciones.length === 1 && reg.correcciones[0]?.faltan > 0, 'la prueba necesita la tarjeta puesta');
  ok(solo.corregir(sanearCorreccion({ desde: solo.paraElMovil().draft.desde, enemigos: ['Clint', 'Khufra'], aliados: ['Gord'], tuyo: 'Rafaela' })));
  eq(reg.correcciones.at(-1), null, 'la tarjeta de un draft corregido en el móvil sigue en la APK');
});

test('POST /resultado: apunta ESA partida con ese resultado y deja de vigilarla y de preguntar; «no la terminé» no apunta; una apuntada se arregla; otra partida, no', async () => {
  const a = conductor();
  await a.paso(); await a.cerrar();
  const desde = a.solo.paraElMovil().draft.desde;
  eq(a.solo.resultado({ desde: desde + 1, gane: true }), false, 'acepta el resultado de otra partida');
  ok(a.solo.resultado({ desde, gane: true }), 'no acepta el resultado de la partida vigilada');
  ok(a.reg.apuntadas.length === 1 && a.reg.apuntadas[0].gane === true && a.reg.apuntadas[0].resultadoDe === 'pregunta', `no apunta con lo que dijiste: ${JSON.stringify(a.reg.apuntadas)}`);
  eq(a.reg.terminadas.join(), String(a.solo.estado().cerradoEn), 'no deja de vigilar esa partida');
  ok(a.solo.resultado({ desde, gane: true }) && a.reg.apuntadas.length === 1, 'el mismo resultado otra vez apunta otra partida');
  ok(a.solo.resultado({ desde, gane: false }), 'no deja cambiar el resultado de una apuntada');
  ok(a.reg.cambiadas.length === 1 && a.reg.cambiadas[0][1] === false && a.solo.paraElMovil().partida.gane === false && a.solo.paraElMovil().partida.registro.gane === false, `el cambio no llega a la partida: ${JSON.stringify(a.solo.paraElMovil().partida)}`);
  eq(a.solo.resultado({ desde, gane: null }), false, '«no la terminé» borra una partida apuntada');
  // Preguntada en la APK y contestada en el móvil: «no la terminé».
  const b = conductor();
  await b.paso(); await b.cerrar();
  b.fin({ acabada: true, activa: false });
  await b.paso(20000);
  ok(b.reg.preguntas.length === 1, 'la prueba necesita la pregunta puesta');
  ok(b.solo.resultado({ desde: b.solo.paraElMovil().draft.desde, gane: null }));
  ok(b.reg.apuntadas.length === 0 && b.reg.preguntas.at(-1) === null && b.solo.paraElMovil().partida.estado === 'sinResultado', `«no la terminé» apunta o deja la pregunta: ${JSON.stringify(b.solo.paraElMovil().partida)}`);
  // Guardada sin resultado (nadie contestó a tiempo): el móvil la contesta y se apunta.
  const c = conductor();
  await c.paso(); await c.cerrar();
  c.fin({ acabada: true, activa: false });
  await c.paso(20000);
  await c.paso(PREGUNTA_CADUCA_MS + 1000);
  ok(c.reg.sinResultado.length === 1 && c.solo.paraElMovil().partida.estado === 'sinResultado', 'la prueba necesita la partida guardada sin resultado');
  ok(c.solo.resultado({ desde: c.solo.paraElMovil().partida.desde, gane: true }));
  ok(c.reg.cambiadas.length === 1 && c.solo.paraElMovil().partida.estado === 'apuntada' && c.solo.paraElMovil().partida.gane === true, `la guardada sin resultado no se apunta con lo del móvil: ${JSON.stringify(c.solo.paraElMovil().partida)}`);
});

test('un baneo leído que quitas también cuenta como cara mal leída (4.0.5)', async () => {
  const { solo, paso } = conductor();
  await paso();
  const d = solo.paraElMovil().draft;
  ok(d.baneos.length >= 1, `la prueba necesita baneos leídos: ${JSON.stringify(d.baneos)}`);
  const [quitado, ...resto] = d.baneos;
  ok(solo.corregir(sanearCorreccion({ desde: d.desde, enemigos: d.enemigos.filter(Boolean), aliados: d.aliados.filter((n, i) => n && i !== d.tuyoFila), tuyo: d.tuyo, baneos: resto })), 'no acepta la corrección');
  eq(solo.resumen().quitados[quitado], 1, `el baneo quitado no cuenta: ${JSON.stringify(solo.resumen().quitados)}`);
  eq(Object.keys(solo.resumen().quitados).length, 1, `cuenta como quitado lo que dejaste: ${JSON.stringify(solo.resumen().quitados)}`);
});
