/**
 * La parte de la app del botón «Leer del juego» (src/app/lector.js): qué
 * nombres mete y cómo dice cada fallo.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { pedirLectura, pedirFinal, avisarVigilancia, fundirFinal, guionTraducido, ensenarResultado, cuerpoDeFotogramas, tocaVigilarFinal, nombresDeLectura, cambiosDeHueco, corregirLectura, dudasDeLectura, dudasQueQuedan, PLAZO_LECTOR_MS, PLAZO_CORREGIR_MS, tocaLeerSolo, tuyoDeTuLinea, LEER_TU_PICK_MS, INTERVALO_AUTO_MS, INTERVALO_AUTO_VACIO_MS, INTERVALO_FINAL_MS, DESDE_FINAL_MIN, HASTA_FINAL_MIN, MAX_FOTOGRAMAS, TOPE_MENSAJE } from '../../src/app/lector.js';

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

await terminar('app/lector');
