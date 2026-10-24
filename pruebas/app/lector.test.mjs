/**
 * La parte de la app del botón «Leer del juego» (src/app/lector.js): qué
 * nombres mete y cómo dice cada fallo.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { buscarTabletEnLaRed, parteDeLaTablet, queApk, versionAnterior, pedirUltimaApk, DESCARGA_APK, mandarALaTablet, consejoParaLaTablet, resumenParaLaTablet, pedirEstadoLector, sanearLectorTablet, lectorTabletDeEnlace, ponerLectorEnTablet, baseLector, pedirAlLector, claveDeFallo, URL_LECTOR } from '../../src/app/lector.js';
import { pedirLectura, pedirFinal, avisarVigilancia, fundirFinal, guionTraducido, ensenarResultado, cuerpoDeFotogramas, cuerpoDePicks, callarVoz, recorteValido, faltoAlguien, tocaVigilarFinal, nombresDeLectura, cambiosDeHueco, fueraDeLosPicks, CAMBIOS_A_LA_VEZ, corregirLectura, dudasDeLectura, dudasQueQuedan, PLAZO_LECTOR_MS, PLAZO_CORREGIR_MS, tocaLeerSolo, tuyoDeTuLinea, LEER_TU_PICK_MS, INTERVALO_AUTO_MS, INTERVALO_AUTO_VACIO_MS, INTERVALO_FINAL_MS, DESDE_FINAL_MIN, HASTA_FINAL_MIN, MAX_FOTOGRAMAS, TOPE_MENSAJE } from '../../src/app/lector.js';

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

test('por hueco: el héroe que un jugador solo miraba se cambia por el que coge, y un «?» no quita nada (3.37.0)', () => {
  // Los huecos salen de la lectura en su orden, con null en los «?» y en tu fila.
  const filas = [{ nombre: 'Clint' }, { nombre: 'Hirara' }, { nombre: null, candidato: 'Saber' }, { nombre: 'X.Borg' }, { nombre: 'Khufra' }];
  const n = nombresDeLectura({ enemigos: [{ nombre: 'Clint' }, { nombre: null }, { nombre: 'X.Borg' }], aliados: filas, tuyoFila: 1 }, heroes);
  eq(JSON.stringify(n.huecos), JSON.stringify({ enemigos: ['Clint', null, 'X Borg'], aliados: ['Clint', null, null, 'X Borg', 'Khufra'] }));
  eq(JSON.stringify(nombresDeLectura({ aliados: filas, tuyoFila: -1 }, heroes).huecos.aliados), '[]', 'sin tu fila no hay huecos de compañeros');
  // El hueco 2 enseñaba a Joy y ahora a Selena: Joy sale.
  const a = cambiosDeHueco(['Clint', 'Joy', null], ['Clint', 'Selena', null]);
  eq(a.quitar.join(), 'Joy');
  eq(JSON.stringify(a.huecos), JSON.stringify(['Clint', 'Selena', null]));
  // Un «?» (skins, o no reconocido) no quita a nadie y conserva lo de antes.
  const b = cambiosDeHueco(['Clint', 'Joy'], [null, null]);
  eq(b.quitar.length, 0);
  eq(JSON.stringify(b.huecos), JSON.stringify(['Clint', 'Joy']));
  // Si el de antes sale en otro hueco de esta lectura (se reordenó), se queda.
  eq(cambiosDeHueco(['Joy', 'Clint'], ['Clint', 'Joy']).quitar.length, 0);
  // Sin lectura anterior no hay nada que quitar.
  eq(cambiosDeHueco([], ['Clint']).quitar.length, 0);
});

test('si cambian a la vez más huecos de los que pueden estar eligiendo, la lectura ya no es la fase de picks (3.54.0)', () => {
  eq(CAMBIOS_A_LA_VEZ, 2, 'en el draft eligen como mucho dos de un equipo a la vez');
  const antes = ['Dyrroth', "Chang'e", 'Hanabi', 'Yi Sun-shin', 'Gloo'];
  // Los dos que eligen a la vez cambian: sigue siendo la fase de picks.
  ok(!fueraDeLosPicks(antes, ['Joy', 'Wanwan', 'Hanabi', 'Yi Sun-shin', 'Gloo']), 'dos cambios a la vez no son la fase de picks');
  // Tres (o los cinco al pasar a las skins, incidencia #73): ya no.
  ok(fueraDeLosPicks(antes, ['Joy', 'Wanwan', 'Esmeralda', 'Yi Sun-shin', 'Gloo']), 'tres cambios a la vez siguen contando como picks');
  ok(fueraDeLosPicks(antes, [null, null, null, null, null]), 'los cinco a «?» (skins, una ventana encima) siguen contando como picks');
  ok(fueraDeLosPicks(antes, [null, 'Wanwan', null, 'Yi Sun-shin', 'Gloo']), 'un «?» no cuenta como cambio');
  // Lo que antes era «?» y ahora se lee no es un cambio: los picks van llegando.
  ok(!fueraDeLosPicks([null, null, null, 'Ixia', 'Lukas'], ['Masha', 'Luo Yi', 'Minsitthar', 'Ixia', 'Lukas']), 'los huecos que se llenan cuentan como cambios');
  ok(!fueraDeLosPicks(antes, []), 'sin huecos en esta lectura (tu fila sin saber) dice que no son picks');
  ok(!fueraDeLosPicks([], antes), 'sin lectura anterior dice que no son picks');
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
  // Y tu equipo y tu pick (3.58.0), para que aprenda las caras de tus compañeros.
  await corregirLectura({ ids: ['lectura-1'], enemigos: ['Clint'], aliados: ['Saber', 'Hirara'], tuyo: 'Khufra', pedir });
  const conEquipo = JSON.parse(pedidas[1].opciones.body);
  eq(`${conEquipo.aliados.join()}|${conEquipo.tuyo}`, 'Saber,Hirara|Khufra', `la corrección no lleva tu equipo: ${pedidas[1].opciones.body}`);
  pedidas.length = 1;
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
  // Completo pero sin TU pick (eliges el último, 3.44.1): se sigue leyendo tu fila un rato, y nada más.
  const t0 = 1_000_000;
  ok(tocaLeerSolo({ auto: true, completo: true, completoDesde: t0, ahora: t0 + 10000 }), 'con el draft completo antes de tu pick deja de leer tu fila');
  ok(!tocaLeerSolo({ auto: true, completo: true, completoDesde: t0, ahora: t0 + LEER_TU_PICK_MS }), 'sin tu pick sigue leyendo durante la partida');
  ok(!tocaLeerSolo({ auto: true, completo: true, completoDesde: t0, ahora: t0 + 10000, miPick: 'Clint' }), 'con tu pick ya fijado sigue leyendo el draft completo');
  ok(!tocaLeerSolo({ auto: true, completo: true, ahora: t0 }), 'sin saber desde cuándo está completo lee');
  // Cerrado por la partida (3.46.0): ya se está jugando, no hay fila tuya que leer.
  ok(!tocaLeerSolo({ auto: true, completo: true, cerrado: true, completoDesde: t0, ahora: t0 + 10000 }), 'con el draft cerrado por la partida sigue leyendo tu fila');
  ok(LEER_TU_PICK_MS <= 3 * 60000, 'el plazo de leer tu fila se mete en la partida');
  ok(INTERVALO_AUTO_MS >= 4000 && INTERVALO_AUTO_VACIO_MS > INTERVALO_AUTO_MS, 'los intervalos no respetan lo que tarda una lectura (4–6 s) ni van más despacio con el draft vacío');
  const dudas = dudasDeLectura({
    tuyos: [{ nombre: 'Hirara', candidato: 'Hirara', parecido: 0.95 }, { nombre: null, candidato: 'Belerick', parecido: 0.713 }],
    suyos: [{ nombre: null, candidato: null, parecido: 0 }],
    enemigos: [{ nombre: null, candidato: 'Clint', parecido: 0.6 }, { nombre: 'Khufra', candidato: 'Khufra', parecido: 0.9 }],
  });
  eq(JSON.stringify(dudas), JSON.stringify([{ hueco: 't2', candidato: 'Belerick', parecido: 0.71 }, { hueco: 'e1', candidato: 'Clint', parecido: 0.6 }]), `las dudas no son las esperadas: ${JSON.stringify(dudas)}`);
  eq(dudasDeLectura(null).length, 0, 'una lectura vacía da dudas');
  // Las que se quedan (3.40.0): una pantalla sin nadie reconocido no tapa las del draft; sin previas, valen.
  const previas = [{ hueco: 's1', candidato: 'Saber', parecido: 0.7 }];
  const otras = [{ hueco: 'e1', candidato: 'Joy', parecido: 0.55 }];
  eq(dudasQueQuedan(previas, otras, false), previas, 'una pantalla sin nadie reconocido tapa las dudas del draft');
  eq(dudasQueQuedan(previas, otras, true), otras, 'una lectura que reconoce a alguien no pone sus dudas');
  eq(dudasQueQuedan(null, otras, false), otras, 'sin dudas previas no se guardan las de ninguna lectura');
  eq(dudasQueQuedan(previas, null, true), previas, 'una lectura sin dudas borra las de antes');
});

test('el final de la partida: cuándo se pregunta al lector, cómo se le avisa, qué se recoge y cómo se sube sin pasarse del mensaje', async () => {
  const t0 = 1_700_000_000_000;
  ok(tocaVigilarFinal({ auto: true, completoDesde: t0 }), 'con el modo encendido y el draft completo no pregunta');
  ok(!tocaVigilarFinal({ auto: false, completoDesde: t0 }), 'pregunta con el modo apagado');
  ok(!tocaVigilarFinal({ auto: true, completoDesde: null }), 'pregunta sin draft completo');
  ok(!tocaVigilarFinal({ auto: true, visible: false, completoDesde: t0 }), 'pregunta con la app escondida');
  ok(INTERVALO_FINAL_MS >= 5000 && INTERVALO_FINAL_MS <= 15000 && DESDE_FINAL_MIN >= 5 && HASTA_FINAL_MIN > DESDE_FINAL_MIN, 'los plazos no son los de una partida (10–20 min) con capturas cada pocos segundos (la tabla de resultado dura poco en pantalla)');
  // El aviso: POST /vigilar con el instante del draft completo; devuelve lo vigilado, y sin lector (o sin instante) null, sin lanzar.
  const avisos = [];
  const a = await avisarVigilancia({ desde: t0, pedir: async (url, o) => { avisos.push({ url, o }); return new Response(JSON.stringify({ desde: t0, activa: true, resultado: null, fotogramas: [] }), { status: 200 }); } });
  ok(a?.desde === t0 && /\/vigilar$/.test(avisos[0].url) && avisos[0].o.method === 'POST' && JSON.parse(avisos[0].o.body).desde === t0, `el aviso no llega como debe: ${JSON.stringify(avisos)}`);
  eq(await avisarVigilancia({ desde: t0, pedir: async () => { throw new Error('sin lector'); } }), null, 'sin lector lanza');
  eq(await avisarVigilancia({ desde: null, pedir: async () => { throw new Error('no debía pedir'); } }), null, 'sin instante pide igual');
  // Lo vigilado: GET /final, tal cual; una respuesta sin fotogramas es «error».
  const con = await pedirFinal({ pedir: async (url) => { ok(/\/final$/.test(url), `pide a ${url}`); return new Response(JSON.stringify({ desde: t0, activa: false, resultado: 'gane', resultadoId: 'fotograma-2', resultadoEn: t0 + 900000, fotogramas: [{ id: 'fotograma-2', minuto: 15, miniatura: 'A', tira: 'B', tabla: true, resultado: 'gane' }] }), { status: 200 }); } });
  eq(`${con.desde} ${con.resultado} ${con.fotogramas.length}`, `${t0} gane 1`, 'lo vigilado no llega tal cual');
  // Fundir: solo lo de ESTE draft, sin repetir ids, sin pasar del tope, y el resultado con su instante.
  const final = { desde: t0, resultado: 'gane', resultadoEn: t0 + 900000, fotogramas: Array.from({ length: MAX_FOTOGRAMAS + 2 }, (_, i) => ({ id: `fotograma-${i}`, minuto: 8 + i, miniatura: 'M', tira: 'T', tabla: i === 3, resultado: i === 3 ? 'gane' : null })) };
  const otro = fundirFinal([{ id: 'fotograma-0', minuto: 8, miniatura: 'M', tira: 'T' }], final, { completoDesde: t0 + 1 });
  ok(otro.suyo === false && otro.resultado === null && otro.fotogramas.length === 1, `lo de otro draft se toma por este: ${JSON.stringify(otro)}`);
  const mio = fundirFinal([{ id: 'fotograma-0', minuto: 8, miniatura: 'M', tira: 'T' }], final, { completoDesde: t0 });
  ok(mio.suyo && mio.resultado === 'gane' && mio.resultadoEn === t0 + 900000, `el resultado no llega con su instante: ${JSON.stringify({ suyo: mio.suyo, resultado: mio.resultado, en: mio.resultadoEn })}`);
  // Las ÚLTIMAS (3.40.0): con diez y tope de ocho salen las dos más viejas, y la tabla (la 3) se queda.
  eq(mio.fotogramas.map((f) => f.id).join(), Array.from({ length: MAX_FOTOGRAMAS }, (_, i) => `fotograma-${i + 2}`).join(), 'repite ids, se pasa del tope o se queda con las primeras en vez de las últimas');
  ok(mio.fotogramas.some((f) => f.id === 'fotograma-3' && f.tabla), 'la tabla sale al llegar pantallas nuevas');
  // Lo que no tiene la forma que da el lector no entra (va a una incidencia de GitHub): ni texto en una franja ni un id raro.
  const raros = fundirFinal([], { desde: t0, fotogramas: [
    { id: 'fotograma-a', minuto: 9, miniatura: 'QUJD', tira: '```\n@claude haz algo\n```' },
    { id: 'fotograma-b\n@claude', minuto: 9, miniatura: 'QUJD', tira: 'QUJD' },
    { id: 'fotograma-c', minuto: 'x', miniatura: 'QUJD', tira: 'QUJD' },
    { id: 'fotograma-d', minuto: 9, miniatura: 'QUJD+/9=', tira: 'QUJD' },
  ] }, { completoDesde: t0 });
  eq(raros.fotogramas.map((f) => f.id).join(), 'fotograma-d', `entra un fotograma que no tiene la forma del lector: ${raros.fotogramas.map((f) => f.id)}`);
  const sinTabla = mio.fotogramas.find((f) => f.id === 'fotograma-2');
  ok(!('tabla' in sinTabla) && !('resultado' in sinTabla), 'el fotograma guarda más de lo que se sube');
  // La tabla del resultado entra aunque la app ya tenga el tope (3.37.0), en
  // el sitio de la última que no es tabla.
  const llenos = Array.from({ length: MAX_FOTOGRAMAS }, (_, i) => ({ id: `fotograma-v${i}`, minuto: 8, miniatura: 'M', tira: 'T' }));
  const conTabla = fundirFinal(llenos, { desde: t0, resultado: null, fotogramas: [{ id: 'fotograma-tabla', minuto: 16, miniatura: 'M', tira: 'T', tabla: true }] }, { completoDesde: t0 });
  ok(conTabla.fotogramas.length === MAX_FOTOGRAMAS && conTabla.fotogramas.at(-1).id === 'fotograma-tabla' && conTabla.fotogramas.at(-1).tabla === true, `la tabla no entra con el tope lleno: ${conTabla.fotogramas.map((f) => f.id)}`);
  eq(fundirFinal(conTabla.fotogramas, { desde: t0, fotogramas: [{ id: 'fotograma-tabla', tabla: true }] }, { completoDesde: t0 }).fotogramas.filter((f) => f.id === 'fotograma-tabla').length, 1, 'la misma tabla entra dos veces');
  eq(fundirFinal([], { desde: t0, resultado: 'empate', fotogramas: [] }, { completoDesde: t0 }).resultado, null, 'un resultado que no es gane/perdi se toma por bueno');
  eq(fundirFinal([], null, { completoDesde: t0 }).suyo, false, 'sin respuesta se toma por de este draft');
  const ensenadas = [];
  const e = await ensenarResultado({ ids: ['fotograma-1', 'fotograma-2'], gane: true, pedir: async (url, o) => { ensenadas.push({ url, o }); return new Response(JSON.stringify({ aprendidos: 1 }), { status: 200 }); } });
  ok(e?.aprendidos === 1 && /\/resultado$/.test(ensenadas[0].url) && ensenadas[0].o.method === 'POST' && JSON.parse(ensenadas[0].o.body).gane === true && JSON.parse(ensenadas[0].o.body).ids.length === 2, `el resultado no se enseña al lector: ${JSON.stringify(ensenadas)}`);
  eq(await ensenarResultado({ ids: [], gane: true, pedir: async () => { throw new Error('no debía pedir'); } }), null, 'sin fotogramas pide igual');
  // Con el draft (3.44.1) se avisa aunque no haya fotogramas: el lector deja de hablar de esa partida.
  const conDesde = [];
  await ensenarResultado({ ids: [], gane: false, desde: 77, pedir: async (url, o) => { conDesde.push(JSON.parse(o.body)); return new Response('{}', { status: 200 }); } });
  ok(conDesde.length === 1 && conDesde[0].desde === 77 && conDesde[0].gane === false, `apuntar sin fotogramas no avisa al lector con el draft: ${JSON.stringify(conDesde)}`);
  eq(await ensenarResultado({ ids: ['fotograma-1'], gane: false, pedir: async () => { throw new Error('sin lector'); } }), null, 'sin lector lanza');
  const tipo = async (pedir) => { try { await pedirFinal({ pedir, plazoMs: 1000 }); return 'ok'; } catch (e) { return e.tipo; } };
  eq(await tipo(() => Promise.reject(new TypeError('Failed to fetch'))), 'sinPuente');
  eq(await tipo(() => Promise.resolve(new Response(JSON.stringify({ error: 'origen no permitido' }), { status: 403 }))), 'error');
  eq(await tipo(() => Promise.resolve(new Response(JSON.stringify({ desde: null }), { status: 200 }))), 'error', 'una respuesta sin fotogramas no es «error»');
  // La incidencia: resultado, minuto e imágenes; y con muchas, se corta antes de pasarse del mensaje.
  const fotos = Array.from({ length: 8 }, (_, i) => ({ id: `fotograma-${i}`, minuto: 8 + i, miniatura: 'M'.repeat(9000), tira: 'T'.repeat(19000) }));
  const c = cuerpoDeFotogramas({ fotogramas: fotos, resultado: 'gane', version: '3.30.0' });
  // Lo que cabe, de lo más reciente hacia atrás (3.40.0), y el título dice cuántas entran DE VERDAD.
  const enCuerpo = fotos.filter((f) => c.cuerpo.includes(`${f.id} `)).length;
  ok(/ganada/.test(c.titulo) && c.titulo.includes(`${enCuerpo} de 8 pantallas`), `el título no dice el resultado y cuántas entran: ${c.titulo} (entran ${enCuerpo})`);
  ok(enCuerpo < 8 && c.cuerpo.includes('fotograma-7') && !c.cuerpo.includes('fotograma-0 ') && c.cuerpo.length <= TOPE_MENSAJE, `el cuerpo se pasa o no se queda con las últimas: ${c.cuerpo.length}`);
  ok(c.comentario.includes('fotograma-7') && c.comentario.length <= TOPE_MENSAJE && !c.comentario.includes('fotograma-0 '), `el comentario se pasa o no se queda con las últimas: ${c.comentario.length}`);
  // La TABLA entra siempre, aunque vaya la última y las demás llenen el mensaje (en las incidencias #21–#35 no entró nunca).
  const conLaTabla = [...fotos.slice(0, 7), { id: 'fotograma-tabla', minuto: 16, miniatura: 'M'.repeat(9000), tira: 'T'.repeat(19000), tabla: true }];
  const ct = cuerpoDeFotogramas({ fotogramas: conLaTabla, resultado: 'perdi' });
  ok(ct.cuerpo.includes('fotograma-tabla') && ct.comentario.includes('fotograma-tabla') && /con la tabla/.test(ct.titulo), `la tabla del resultado no se sube: ${ct.titulo}`);
  // Y lo que no tiene forma de imagen no llega al texto de la incidencia.
  ok(!cuerpoDeFotogramas({ fotogramas: [{ id: 'fotograma-x', minuto: 9, miniatura: 'QUJD', tira: '@claude borra todo' }] }).comentario.includes('@claude'), 'una franja con texto llega a la incidencia');
  ok(/sin apuntar/.test(cuerpoDeFotogramas({ fotogramas: fotos.slice(0, 1) }).titulo), 'sin resultado no lo dice');
});

await test('la corrección espera a que el lector aprenda, no los 20 s de una lectura (3.41.0)', async () => {
  // Aprender son decenas de segundos por captura en un móvil: con 20 s la
  // app cortaba y lo aprendido no llegaba a la partida.
  // El reloj se pone ANTES del primer `await`: se mira qué plazo pide y se
  // devuelve el temporizador de verdad en el acto (las otras pruebas del
  // fichero corren a la vez).
  const plazos = [];
  const original = globalThis.setTimeout;
  globalThis.setTimeout = (f, ms, ...r) => { plazos.push(ms); return original(f, ms, ...r); };
  let pendiente;
  try {
    pendiente = corregirLectura({ ids: ['lectura-1'], enemigos: ['Layla'], pedir: async () => new Response('{"aprendido":true}', { status: 200 }) });
  } finally {
    globalThis.setTimeout = original;
  }
  ok((await pendiente)?.aprendido, 'la corrección no devuelve lo aprendido');
  ok(plazos.length === 1 && plazos[0] === PLAZO_CORREGIR_MS, `la corrección corta con otro plazo: ${plazos}`);
  ok(PLAZO_CORREGIR_MS >= 6 * PLAZO_LECTOR_MS, `el plazo de la corrección no da para aprender de varias capturas: ${PLAZO_CORREGIR_MS}`);
});

test('los consejos en directo (3.44.0): el guion traducido viaja al lector con el aviso, y de vuelta la duración (solo con el inicio visto), la voz y el marcador', async () => {
  const t = (clave, params = {}) => `${clave}${params.p != null ? `:${params.p}` : ''}`;
  const plan = { directo: [{ min: 0.25, partes: [{ clave: 'directo.inicio', params: { p: 55 } }, { clave: 'partida.focus', params: { e: 'X' } }] }], cierres: [{ clave: 'directo.cierre', params: { p: 40 } }] };
  const g = guionTraducido(plan, t, 'en');
  eq(JSON.stringify(g.guion), JSON.stringify([{ min: 0.25, texto: 'directo.inicio:55 partida.focus' }]), 'el guion no se traduce aviso a aviso');
  eq(g.cierres.join(), 'directo.cierre:40');
  ok(g.huella !== guionTraducido({ ...plan, directo: [] }, t, 'en').huella && g.huella !== guionTraducido(plan, t, 'es').huella, 'la huella no cambia con el guion o el idioma');
  eq(guionTraducido(null, t).guion.length, 0);
  let cuerpo = null;
  await avisarVigilancia({ desde: 5, directo: g, pedir: async (url, o) => { cuerpo = JSON.parse(o.body); return new Response('{"fotogramas":[]}', { status: 200 }); } });
  ok(cuerpo.desde === 5 && cuerpo.guion.length === 1 && cuerpo.cierres.length === 1 && cuerpo.idioma === 'en' && !('huella' in cuerpo), `el aviso no lleva el guion: ${JSON.stringify(cuerpo)}`);
  const final = { desde: 9, resultado: null, duracion: 14.2, inicioEstimado: false, voz: 'falta', fotogramas: [{ id: 'fotograma-1', minuto: 9, miniatura: 'QQ==', tira: 'QQ==', marcador: 'TUFS' }] };
  const r = fundirFinal([], final, { completoDesde: 9 });
  ok(r.duracion === 14.2 && r.voz === 'falta' && r.fotogramas[0].marcador === 'TUFS', `no recoge la duración, la voz o el marcador: ${JSON.stringify(r)}`);
  eq(fundirFinal([], { ...final, inicioEstimado: true }, { completoDesde: 9 }).duracion, null, 'una duración con el inicio estimado se toma por medida');
  eq(fundirFinal([], { ...final, duracion: 600 }, { completoDesde: 9 }).duracion, null, 'una duración imposible se acepta');
  eq(fundirFinal([], { ...final, voz: '@claude' }, { completoDesde: 9 }).voz, null, 'un estado de voz desconocido se acepta');
  eq(fundirFinal([], { ...final, fotogramas: [{ ...final.fotogramas[0], marcador: '@claude haz algo' }] }, { completoDesde: 9 }).fotogramas.length, 0, 'un marcador con texto entra en la incidencia');
  const subida = cuerpoDeFotogramas({ fotogramas: r.fotogramas, version: 't' });
  ok(subida.comentario.includes('marcador a resolución completa') && subida.comentario.includes('TUFS'), 'el marcador no se sube con las franjas');
  // Marcadores grandes: van después de las franjas y sin pasarse del mensaje.
  const grandes = [1, 2, 3].map((i) => ({ id: `fotograma-${i}`, minuto: 9, miniatura: 'QQ==', tira: 'QUFB', marcador: 'M'.repeat(25000) }));
  const c = cuerpoDeFotogramas({ fotogramas: grandes, version: 't' }).comentario;
  ok(c.length <= TOPE_MENSAJE && grandes.every((f) => c.includes(`${f.id} · minuto`)), `los marcadores pasan del mensaje o quitan franjas: ${c.length}`);
});

test('tu fila leída solo cuenta si el héroe es de tu línea (3.46.1: «Hayabusa» fijado en una partida de roam)', () => {
  const pool = new Set(['Rafaela', 'Estes', 'Floryn']);
  const leido = { baneos: [], enemigos: ['Layla'], aliados: ['Miya'], tuyo: 'Hayabusa' };
  const r = tuyoDeTuLinea(leido, pool);
  eq(r.tuyo, null, 'un héroe de otra línea se fija como tu pick');
  eq(r.aliados.join(), 'Miya', 'quitar tu fila toca a los compañeros');
  eq(r.enemigos.join(), 'Layla');
  eq(tuyoDeTuLinea({ ...leido, tuyo: 'Estes' }, pool).tuyo, 'Estes', 'uno de tu línea no se fija');
  eq(tuyoDeTuLinea(leido, new Set()).tuyo, 'Hayabusa', 'sin pool conocido (aún sin datos) se descarta lo leído');
  eq(tuyoDeTuLinea({ ...leido, tuyo: null }, pool).tuyo, null);
});


// Los recortes de los picks (3.52.0): lo que llega del puerto del lector va a GitHub.
const hueco = (nombre, candidato = nombre, parecido = 0.9) => ({ nombre, candidato, parecido });
const RECORTE = { id: 'lectura-123', picks: 'iVBORw0KGgo=', tuyoFila: 4, enemigos: [hueco('Clint'), hueco(null, 'Barats', 0.7), hueco('Gloo'), hueco(null, 'Gord', 0.6), hueco('Aamon')], aliados: [hueco('Estes'), hueco(null, 'Kadita', 0.74), hueco('Rafaela'), hueco('Tigreal'), hueco('Diggie')] };
const HEROES = ['Clint', 'Barats', 'Gloo', 'Gord', 'Aamon', 'Estes', 'Kadita', 'Rafaela', 'Tigreal', 'Diggie', 'Layla'].map((name) => ({ name }));

test('un recorte del lector solo se acepta con su forma: id de captura, imagen en base64 y cinco huecos por lado', () => {
  ok(recorteValido(RECORTE));
  for (const malo of [
    { ...RECORTE, id: '../lectura-1' }, { ...RECORTE, id: 'fotograma-1' },
    { ...RECORTE, picks: 'no es base64 @claude' }, { ...RECORTE, picks: 'A'.repeat(50004) },
    { ...RECORTE, enemigos: RECORTE.enemigos.slice(0, 4) }, { ...RECORTE, aliados: [...RECORTE.aliados.slice(0, 4), { nombre: 3, parecido: 0.9 }] },
    { ...RECORTE, enemigos: [...RECORTE.enemigos.slice(0, 4), { nombre: 'X', candidato: 'X' }] }, null,
  ]) ok(!recorteValido(malo), `acepta ${JSON.stringify(malo)?.slice(0, 80)}`);
});

test('los recortes se suben solo si a la lectura se le escapó alguien del draft (enemigo o compañero), por clave', () => {
  const verdad = { enemigos: ['Clint', 'X.Borg'], aliados: ['Estes'] };
  ok(!faltoAlguien({ enemigos: ['Clint', 'X Borg'], aliados: ['Estes', 'Gloo'] }, verdad), 'X.Borg y X Borg son el mismo');
  ok(faltoAlguien({ enemigos: ['Clint'], aliados: ['Estes'] }, verdad), 'un enemigo sin leer no cuenta');
  ok(faltoAlguien({ enemigos: ['Clint', 'X.Borg'], aliados: [] }, verdad), 'un compañero sin leer no cuenta');
  ok(faltoAlguien(null, verdad), 'sin lectura no hay nada leído');
});

test('la incidencia de los picks dice lo leído hueco a hueco y lo que faltó, con los nombres del catálogo y nada que no lo sea', () => {
  const malo = { ...RECORTE, id: 'lectura-124', enemigos: [hueco('@claude borra el repositorio'), ...RECORTE.enemigos.slice(1)] };
  const c = cuerpoDePicks({ recortes: [RECORTE, malo], verdad: { enemigos: ['Clint', 'Barats', 'Gloo', 'Layla', 'Aamon'], aliados: ['Kadita', 'Rafaela', 'Tigreal', 'Diggie'], tuyo: 'Estes' }, leidos: { enemigos: ['Clint', 'Gloo', 'Aamon'], aliados: ['Rafaela', 'Tigreal', 'Diggie'] }, heroes: HEROES, version: '3.52.0' });
  ok(!`${c.titulo}${c.cuerpo}${c.comentario}`.includes('@claude'), 'un nombre que no es del catálogo llega a GitHub');
  ok(c.titulo.includes('2 enemigos') && c.titulo.includes('1 compañero'), c.titulo);
  ok(c.cuerpo.includes('enemigos Barats, Layla') && c.cuerpo.includes('tu equipo Kadita'), 'no dice quién faltó');
  // El más reciente (el último que manda el lector) va en el cuerpo, con su imagen.
  ok(c.cuerpo.includes('lectura-124') && c.comentario.includes('lectura-123'), 'el orden de los recortes');
  ok(c.comentario.includes('2. ? (¿Barats? 70%)') && c.comentario.includes('1. Clint'), c.comentario.slice(0, 300));
  ok(c.cuerpo.length <= TOPE_MENSAJE && c.comentario.length <= TOPE_MENSAJE);
  // Uno inválido no se sube; con uno solo, el comentario lo dice.
  const uno = cuerpoDePicks({ recortes: [RECORTE, { ...RECORTE, picks: 'x x' }], verdad: {}, leidos: {}, heroes: HEROES });
  ok(uno.cuerpo.includes('lectura-123') && uno.comentario.includes('Solo había una'), 'cuenta un recorte inválido');
});

test('«Voz»: callarVoz pide /voz con sí o no y nunca lanza; el aviso de vigilancia lleva el mismo callar (3.53.0)', async () => {
  const pedidas = [];
  const pedir = async (url, op) => { pedidas.push([url, JSON.parse(op.body)]); return { ok: true, json: async () => ({ callada: true }) }; };
  eq((await callarVoz({ callar: true, pedir }))?.callada, true);
  eq(pedidas[0][0].endsWith('/voz'), true); eq(pedidas[0][1].callar, true);
  eq(await callarVoz({ callar: 'sí', pedir }), null, 'pide con un callar que no es sí o no');
  eq(pedidas.length, 1);
  eq(await callarVoz({ callar: false, pedir: async () => { throw new Error('sin lector'); } }), null, 'sin lector lanza');
  await avisarVigilancia({ desde: 123, callar: true, pedir: async (url, op) => { pedidas.push([url, JSON.parse(op.body)]); return { ok: true, json: async () => ({ fotogramas: [] }) }; } });
  eq(pedidas[1][1].callar, true, 'el aviso de vigilancia no lleva callar');
  await avisarVigilancia({ desde: 123, pedir: async (url, op) => { pedidas.push([url, JSON.parse(op.body)]); return { ok: true, json: async () => ({ fotogramas: [] }) }; } });
  ok(!('callar' in pedidas[2][1]), 'sin saber de la voz, el aviso la cambia');
});

test('el lector en la tablet (3.61.0): solo IP privada y código decente; el enlace del QR; las peticiones llevan el código', async () => {
  eq(JSON.stringify(sanearLectorTablet({ direccion: '192.168.68.116', codigo: 'abcde-fgh23' })), JSON.stringify({ direccion: '192.168.68.116:47323', codigo: 'ABCDEFGH23' }));
  eq(sanearLectorTablet({ direccion: '10.0.0.5:5000', codigo: 'ABCDEFGH' })?.direccion, '10.0.0.5:5000');
  for (const malo of [{ direccion: '8.8.8.8', codigo: 'ABCDEFGH' }, { direccion: 'atacante.example', codigo: 'ABCDEFGH' }, { direccion: '192.168.1.2:99999', codigo: 'ABCDEFGH' }, { direccion: '192.168.1.2', codigo: 'ABC' }, { direccion: '192.168.1.2', codigo: 'ABC<DEFGH' }, null, 'x']) {
    eq(sanearLectorTablet(malo), null, `acepta ${JSON.stringify(malo)}`);
  }
  eq(lectorTabletDeEnlace('#lector=192.168.68.116:47323&codigo=ABCDEFGH23')?.codigo, 'ABCDEFGH23');
  eq(lectorTabletDeEnlace('#otra=cosa'), null);
  eq(lectorTabletDeEnlace('#lector=evil.example:47323&codigo=ABCDEFGH23'), null, 'el enlace manda el código a cualquier sitio');
  const vistas = [];
  const fetchDeVerdad = globalThis.fetch;
  globalThis.fetch = async (url, op) => { vistas.push({ url, op }); return { ok: true, status: 200, json: async () => ({ enemigos: [] }) }; };
  try {
    ponerLectorEnTablet({ direccion: '192.168.68.116', codigo: 'ABCDEFGH23' });
    eq(baseLector(), 'http://192.168.68.116:47323');
    await pedirLectura();
    eq(vistas[0].url, 'http://192.168.68.116:47323/leer', 'la lectura no va a la tablet');
    eq(vistas[0].op.headers['X-Lector-Codigo'], 'ABCDEFGH23', 'la lectura no lleva el código');
    eq(vistas[0].op.targetAddressSpace, 'local', 'no declara que va a la red local');
    eq(claveDeFallo('sinPuente'), 'lector.enTablet.sinPuente');
    eq(claveDeFallo('captura', { auto: true }), 'lector.enTablet.auto.captura');
    ponerLectorEnTablet(null);
    eq(baseLector(), URL_LECTOR);
    await pedirAlLector(`${URL_LECTOR}/estado`, { cache: 'no-store' });
    eq(JSON.stringify(vistas[1].op), JSON.stringify({ cache: 'no-store' }), 'con el de Termux manda el código o la red local');
    eq(claveDeFallo('sinPuente'), 'lector.sinPuente');
    eq(claveDeFallo('emparejar', { auto: true }), 'lector.auto.tablet');
  } finally { globalThis.fetch = fetchDeVerdad; ponerLectorEnTablet(null); }
  // 401 es el código y 429 el bloqueo, con su aviso.
  for (const [estado, tipo] of [[401, 'codigo'], [429, 'bloqueado']]) {
    const e = await pedirLectura({ pedir: async () => ({ ok: false, status: estado, json: async () => ({}) }) }).catch((x) => x);
    eq(e.tipo, tipo, `un ${estado} no se distingue`);
    eq(claveDeFallo(e.tipo), `lector.${tipo}`);
  }
});

test('el estado del lector para el Diagnóstico: contesta, no está, o no acepta el código; nunca lanza (3.61.4)', async () => {
  const bien = await pedirEstadoLector({ pedir: async () => ({ ok: true, status: 200, json: async () => ({ ok: true, aprendido: { capturas: 3, caras: 1, aliados: 0 } }) }) });
  eq(JSON.stringify(bien), JSON.stringify({ ok: true, aprendido: { capturas: 3, caras: 1, aliados: 0 }, resultados: null, salida: null, lector: null, tablet: null }));
  eq((await pedirEstadoLector({ pedir: async () => { throw new Error('red'); } })).tipo, 'sinPuente');
  eq((await pedirEstadoLector({ pedir: async () => ({ ok: false, status: 401, json: async () => ({}) }) })).tipo, 'codigo');
  eq((await pedirEstadoLector({ plazoMs: 20, pedir: (u, { signal }) => new Promise((_, x) => signal.addEventListener('abort', () => x(new Error('corte')))) })).tipo, 'plazo');
});

test('lo que se manda a la tablet (3.62.0): tu pick con los dos siguientes, el resumen de la partida, y nada sin lector en la tablet', async () => {
  const t = (k, p = {}) => `${k}${Object.keys(p).length ? JSON.stringify(p) : ''}`;
  const H = (name, p) => ({ heroe: { name }, p });
  const ranking = [H('Atlas', 0.55), H('Khufra', 0.54), H('Franco', 0.52)];
  const c = consejoParaLaTablet({ eleccion: ranking[1], ranking }, t);
  eq(c.titulo, 'Khufra 54%', 'la burbuja no dice tu pick fijado');
  ok(/Atlas 55%.*Franco 52%/.test(c.detalle), `los siguientes no salen por orden: ${c.detalle}`);
  eq(consejoParaLaTablet({ eleccion: null, ranking }, t), null);
  // En baneos (3.65.5): a quién banear, y tu nº1 de recordatorio.
  const enBaneos = consejoParaLaTablet({ eleccion: ranking[0], ranking, fase: 'baneos', baneos: [{ heroe: { name: 'Hirara' } }, { heroe: { name: 'Belerick' } }, { heroe: { name: 'Eudora' } }, { heroe: { name: 'Saber' } }] }, t);
  ok(/banea/.test(enBaneos.titulo) && /Hirara · Belerick · Eudora/.test(enBaneos.titulo) && !/Saber/.test(enBaneos.titulo), `en baneos la burbuja no dice a quién banear: ${JSON.stringify(enBaneos)}`);
  ok(/tuNumeroUno/.test(enBaneos.detalle) && /Atlas/.test(enBaneos.detalle), 'en baneos no recuerda tu nº1');
  eq(consejoParaLaTablet({ eleccion: ranking[1], ranking, fase: 'baneos', baneos: [] }, t).titulo, 'Khufra 54%', 'sin baneos sugeridos (ya están los diez), se calla');
  eq(consejoParaLaTablet({ eleccion: ranking[1], ranking, fase: 'picks', baneos: [{ heroe: { name: 'Hirara' } }] }, t).titulo, 'Khufra 54%', 'en picks dice a quién banear');
  const r = resumenParaLaTablet({ t: 7, pick: 'Khufra', gane: true, recomendados: ['Khufra'], estimacion: 0.54, ultimas: [{ gane: true }, { gane: false }] }, t);
  eq(r.id, 'partida-7');
  ok(/ganada/.test(r.titulo) && /eraPrimero/.test(r.texto) && /"p":54/.test(r.texto) && /"g":1/.test(r.texto), `el resumen no cuenta lo que pasó: ${JSON.stringify(r)}`);
  ok(/otroPrimero.*Atlas/.test(resumenParaLaTablet({ t: 8, pick: 'Khufra', gane: false, recomendados: ['Atlas'] }, t).texto), 'no dice cuál era el nº1');
  let pedidas = 0;
  const pedir = async () => { pedidas += 1; return { ok: true }; };
  ponerLectorEnTablet(null);
  eq(await mandarALaTablet({ consejo: c }, { pedir }), false);
  eq(pedidas, 0, 'con el de Termux manda cosas para una tablet que no hay');
  ponerLectorEnTablet({ direccion: '192.168.68.116', codigo: 'ABCDEFGH23' });
  try { eq(await mandarALaTablet({ consejo: c }, { pedir }), true); } finally { ponerLectorEnTablet(null); }
});

test('el parte de la tablet (3.63.0): dice lo que va mal, todo bien si nada, y nunca el código ni la IP', () => {
  const sano = { ok: true, aprendido: { capturas: 9, caras: 2, aliados: 1 }, salida: null, lector: { minutos: 30, lecturas: 40, fallosCaptura: 1, memoriaMB: 200 }, tablet: { apk: '3.63.0', modelo: 'X NP06J', android: 34, grabando: true, burbuja: true, esquina: 'abajo', bateriaLibre: true, memoriaLibreMB: 1500, memoriaBaja: false, memoriaAppMB: 300, cuando: 1000 } };
  const bien = parteDeLaTablet(sano, { version: '3.63.0', ahora: 2000 });
  ok(/Todo bien/.test(bien.texto) && !bien.avisos.length, `con todo sano avisa: ${bien.texto}`);
  ok(/40 lecturas/.test(bien.texto) && /NP06J/.test(bien.texto), 'el parte no cuenta lo que hay');
  const mal = parteDeLaTablet({ ...sano, salida: 'Último cierre (hace 3 min): Android la cerró por falta de memoria · usaba 900 MB', lector: { ...sano.lector, fallosCaptura: 20 }, tablet: { ...sano.tablet, grabando: false, bateriaLibre: false, memoriaBaja: true } }, { version: '3.63.0', ahora: 2000 });
  eq(mal.avisos.length, 5, `no avisa de todo lo que va mal: ${mal.avisos}`);
  ok(mal.huella !== bien.huella, 'con avisos la huella no cambia (no subiría en el acto)');
  const conBurbuja = (burbujaEstado) => parteDeLaTablet({ ...sano, tablet: { ...sano.tablet, burbujaEstado } }, { version: '3.63.0', ahora: 2000 });
  for (const e of ['no llega al lector: IOException', 'Android no deja pintarla: BadToken', 'el lector no contesta']) ok(conBurbuja(e).avisos.some((a) => a.includes(e)), `la burbuja que no sale (${e}) no avisa (3.68.1)`);
  for (const e of ['enseñando', 'esperando consejo', 'parada']) eq(conBurbuja(e).avisos.length, 0, `la burbuja sana (${e}) avisa`);
  ok(conBurbuja('enseñando').texto.includes('abajo, enseñando'), 'el parte no dice cómo va la burbuja');
  eq(parteDeLaTablet({ ...sano, salida: 'Último cierre (hace 1 min): se actualizó' }, { version: '3.63.0', ahora: 2000 }).avisos.length, 0, 'actualizarse cuenta como un fallo');
  ok(parteDeLaTablet({ ...sano, tablet: { ...sano.tablet, cuando: 0 } }, { ahora: 10 * 60000 }).avisos.some((a) => /señales/.test(a)), 'no avisa de una app que dejó de escribir su salud');
  eq(parteDeLaTablet({ ok: false, tipo: 'sinPuente' }), null);
  ok(!/192\.168/.test(parteDeLaTablet({ ...sano, lector: { ...sano.lector, ultimoFallo: { que: 'no contesta 192.168.68.116:47323' } } }).texto), 'una IP dentro de un error llega al parte');
  ok(!/192\.168|ABCDEFGH/.test(JSON.stringify(mal)), 'el parte lleva la IP o el código');
});

test('el parte no dice «Todo bien» sin datos de la tablet (3.65.2): una Lector MLBB vieja o atrasada se dice', () => {
  // Lo que contestó el 22 de octubre: una APK anterior a 3.63.0, sin bloques `lector` ni `tablet`.
  const vieja = { ok: true, aprendido: { capturas: 9, caras: 0, aliados: 0 }, salida: 'Último cierre (hace 0 min): se actualizó · stop es.srchipiron.lector due to installPackageLI', lector: null, tablet: null };
  const p = parteDeLaTablet(vieja, { version: '3.65.2' });
  ok(!/Todo bien/.test(p.texto), `con una APK vieja dice «Todo bien»: ${p.texto}`);
  ok(p.avisos.some((a) => /anterior a 3\.63\.0/.test(a)), `no dice que la APK es vieja: ${p.avisos}`);
  ok(!/Último cierre: Último cierre/.test(p.texto), `«Último cierre» sale dos veces: ${p.texto}`);
  const sana = { ok: true, aprendido: {}, lector: { minutos: 5, lecturas: 1, fallosCaptura: 0 }, tablet: { apk: '3.62.0', grabando: true, bateriaLibre: true, cuando: 1000 } };
  ok(parteDeLaTablet(sana, { version: '3.65.2', ahora: 2000, ultimaApk: '3.64.1' }).avisos.some((a) => /3\.62\.0.*3\.64\.1/.test(a)), 'no dice que la APK está atrasada');
  eq(parteDeLaTablet({ ...sana, tablet: { ...sana.tablet, apk: '3.64.1' } }, { version: '3.65.2', ahora: 2000, ultimaApk: '3.64.1' }).avisos.length, 0, 'una APK al día da aviso');
  eq(parteDeLaTablet(sana, { version: '3.65.2', ahora: 2000 }).avisos.length, 0, 'sin saber la última, avisa de atrasada');
});

test('queApk y versionAnterior: qué Lector MLBB contesta', () => {
  eq(queApk({ ok: true, lector: null }).estado, 'antigua');
  eq(queApk({ ok: false, tipo: 'plazo' }).estado, 'sinRespuesta', 'sin respuesta de la tablet no se dice');
  eq(queApk({ ok: false, tipo: 'plazo' }).tipo, 'plazo');
  eq(queApk({ ok: true, lector: {}, tablet: { apk: '3.63.0' } }, '3.64.1').estado, 'atrasada');
  eq(queApk({ ok: true, lector: {}, tablet: { apk: '3.64.1' } }, '3.64.1').estado, 'alDia');
  eq(queApk({ ok: true, lector: {}, tablet: { apk: '3.64.2' } }, '3.64.1').estado, 'alDia', 'una más nueva que la publicada no está atrasada');
  eq(queApk({ ok: true, lector: {}, tablet: null }, '3.64.1').estado, 'nose');
  ok(versionAnterior('3.9.9', '3.10.0') && versionAnterior('3.64.0', '3.64.1') && !versionAnterior('3.64.1', '3.64.1') && !versionAnterior('4.0.0', '3.99.99'), 'compara como texto, no como número');
  ok(!versionAnterior('?', '3.64.1') && !versionAnterior('3.64.1', null), 'una versión rara cuenta como anterior');
  ok(DESCARGA_APK.startsWith('https://github.com/srchipiron/mobile-legends-pick-assist/releases/'), DESCARGA_APK);
});

test('pedirUltimaApk: la etiqueta lector-vX.Y.Z de la última publicada, sin token, y null ante cualquier cosa rara', async () => {
  const pedidas = [];
  const con = (respuesta) => async (url, op) => { pedidas.push({ url, op }); if (respuesta instanceof Error) throw respuesta; return { ok: respuesta.status === 200, json: async () => respuesta.datos }; };
  eq(await pedirUltimaApk({ pedir: con({ status: 200, datos: { tag_name: 'lector-v3.64.1' } }) }), '3.64.1');
  ok(pedidas[0].url === 'https://api.github.com/repos/srchipiron/mobile-legends-pick-assist/releases/latest', pedidas[0].url);
  ok(!JSON.stringify(pedidas[0].op.headers).includes('Authorization'), 'pregunta con token');
  eq(await pedirUltimaApk({ pedir: con({ status: 200, datos: { tag_name: 'v9.9.9<script>' } }) }), null);
  eq(await pedirUltimaApk({ pedir: con({ status: 403, datos: {} }) }), null);
  eq(await pedirUltimaApk({ pedir: con(new Error('sin red')) }), null);
});

test('buscarTabletEnLaRed: encuentra la tablet en otra IP de la wifi y solo le manda el código a quien contesta como Lector MLBB (3.65.4)', async () => {
  const conCodigo = [];
  const pedir = async (url, op) => {
    const ip = new URL(url).hostname;
    const codigo = op?.headers?.['X-Lector-Codigo'];
    if (codigo) conCodigo.push(ip);
    const resp = (status, cuerpo) => ({ status, ok: status === 200, json: async () => cuerpo });
    if (ip === '192.168.68.112') return codigo === 'ABCDEFGH23' ? resp(200, { ok: true }) : resp(401, { error: 'codigo' });
    if (ip === '192.168.68.50') return resp(401, { error: 'codigo' }); // otro lector, con otro código
    if (ip === '192.168.68.1') return resp(200, { ok: true }); // el router contesta 200 a cualquier cosa
    if (ip === '192.168.68.7') return resp(404, { error: 'no' });
    throw new Error('nadie');
  };
  const r = await buscarTabletEnLaRed({ direccion: '192.168.68.116:47323', codigo: 'ABCDEFGH23' }, { pedir, plazoMs: 50 });
  eq(r?.direccion, '192.168.68.112:47323', `no la encuentra: ${JSON.stringify(r)}`);
  eq(r.codigo, 'ABCDEFGH23');
  eq(conCodigo.sort().join(), '192.168.68.112,192.168.68.50', `el código va a quien no contestó como Lector MLBB: ${conCodigo}`);
  eq(await buscarTabletEnLaRed({ direccion: '192.168.68.116:47323', codigo: 'ABCDEFGH23' }, { pedir: async () => { throw new Error('nadie'); }, plazoMs: 50 }), null);
  eq(await buscarTabletEnLaRed({ direccion: '8.8.8.8:47323', codigo: 'ABCDEFGH23' }, { pedir }), null, 'busca fuera de la red de casa');
});

await terminar('app/lector');
