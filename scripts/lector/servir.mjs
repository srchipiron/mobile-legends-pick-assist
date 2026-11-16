/**
 * El servidor del lector en la tablet (puerto `PUERTO` de contrato.js). La
 * tablet lleva el draft (protocolo 2): el móvil lo copia (`GET /draft`) y le
 * manda lo que tú tocas; la APK pinta la burbuja y pregunta lo que no supo.
 * La imagen nunca sale de la tablet: solo nombres de héroe.
 *
 * Las rutas son una TABLA (`manejadores`) con las mismas claves que `RUTAS`
 * de contrato.js; Host, Origin, código y quién (app o APK) se comprueban en
 * `atender`, un solo sitio. No toca la pantalla, no habla con Moonton y no
 * lanza programas.
 */
import { createServer } from 'node:http';
import { readFileSync, writeFileSync } from 'node:fs';
import { pbkdf2 } from 'node:crypto';
import { join } from 'node:path';
import { RUTAS, PROTOCOLO, RETO_VUELTAS, LECTURAS_EN_PARTIDA, NOMBRE_DE_HEROE, sanearAjustes, sanearCorreccion, sanearResultado, sanearRespuestaDraft } from '../../src/comun/contrato.js';
import { nombreClave } from '../../src/motor/nombres.js';
import { hostPermitido, origenPermitido, deLaApk, crearPortero, permitirReto, leerCuerpo, limpiarTexto, VARIABLE_ORIGEN_LOCAL } from './acceso.mjs';
import { podarCapturas, capturasAMirar, RETENCION_CAPTURAS_MS, MAX_CAPTURAS, ID_DE_LECTURA } from './capturas.mjs';
import { crearVigilancia, VIGILANCIA } from './vigilancia.mjs';
import { crearAprendizaje } from './aprendizaje.mjs';
import { lectorEnHilos, leerCaptura } from './lectura.mjs';
import { enPartida } from './partida.mjs';
import { leerPng, escribirPngRapido } from './png.mjs';
import { carasGuardadas } from './leer.mjs';
import { plantillasIniciales } from './resultado.mjs';


/** [D] La fase que dice el modo solo vale unas vueltas de draft (1,5 s) o de fuera (12 s). */
export const FASE_VALE_MS = 30000;
/** [P] Con la burbuja puesta y nadie capturando, un vistazo al minimapa como mucho cada esto. */
export const VISTAZO_MS = 10000;

/** [M] Las plantillas de VICTORIA/DERROTA: fijas, medidas en 31 tablas, con los nombres tapados. Nada se aprende en marcha. */
const tablaDeSerie = (f) => leerPng(readFileSync(new URL(f, import.meta.url)));
export const plantillasDeSerie = () => plantillasIniciales({
  victorias: ['tabla-victoria-1.png', 'tabla-victoria-2.png'].map(tablaDeSerie),
  derrotas: ['tabla-derrota-1.png', 'tabla-derrota-2.png'].map(tablaDeSerie),
});

const textoPlano = (x, tope) => (typeof x === 'string' && limpiarTexto(x) ? limpiarTexto(x).slice(0, tope) : null);
const nombreDeHeroe = (n) => (typeof n === 'string' && n.length <= 30 && NOMBRE_DE_HEROE.test(n) ? n : null);
/** El consejo de la burbuja: texto plano con tope (la APK lo pinta tal cual). */
export function sanearConsejo(c) {
  const titulo = textoPlano(c?.titulo, 80);
  return titulo ? { titulo, detalle: textoPlano(c?.detalle, 160) } : null;
}
/** El resumen de una partida (la notificación): texto plano, id con forma. */
export function sanearResumen(r) {
  const titulo = textoPlano(r?.titulo, 80), texto = textoPlano(r?.texto, 300);
  return titulo && texto && typeof r?.id === 'string' && /^[\w-]{1,60}$/.test(r.id) ? { id: r.id, titulo, texto } : null;
}
/** La pregunta «¿Cómo acabó?»: id con forma, el cierre del draft y el pick como texto. */
export function sanearPregunta(p) {
  if (!p || typeof p.id !== 'string' || !/^pregunta-\d{1,15}$/.test(p.id) || !Number.isFinite(p.desde) || !Number.isFinite(p.cuando)) return null;
  return { id: p.id, desde: p.desde, cuando: p.cuando, pick: nombreDeHeroe(p.pick) };
}
/**
 * Lo que la tablet sola no reconoció en un draft, para la tarjeta «Enseña al
 * lector» de la APK: nombres del catálogo, ids de captura con forma
 * (las `CAPTURAS_A_MIRAR` repartidas) y tus habituales. null sin forma.
 */
export function sanearCorreccionDeLaTablet(c) {
  if (!c || typeof c.id !== 'string' || !/^correccion-\d{1,15}$/.test(c.id) || !Number.isFinite(c.cuando)) return null;
  const ids = capturasAMirar((Array.isArray(c.ids) ? c.ids : []).filter((id) => typeof id === 'string' && ID_DE_LECTURA.test(id)));
  const heroes = (Array.isArray(c.heroes) ? c.heroes : []).map(nombreDeHeroe).filter(Boolean).slice(0, 400);
  if (!ids.length || !heroes.length) return null;
  const huecos = (l) => [0, 1, 2, 3, 4].map((i) => (Array.isArray(l) ? nombreDeHeroe(l[i]) : null));
  const l = c.leidos ?? {};
  return {
    id: c.id, cuando: c.cuando, ids, heroes,
    leidos: { enemigos: huecos(l.enemigos), aliados: huecos(l.aliados), tuyoFila: Number.isInteger(l.tuyoFila) && l.tuyoFila >= 0 && l.tuyoFila < 5 ? l.tuyoFila : -1, baneos: (Array.isArray(l.baneos) ? l.baneos : []).map(nombreDeHeroe).filter(Boolean).slice(0, 10) },
    ...(Number.isFinite(c.partida) ? { partida: c.partida } : {}),
    ...(Array.isArray(c.tuyos) ? { tuyos: c.tuyos.map(nombreDeHeroe).filter((n) => n && heroes.includes(n)).slice(0, 6) } : {}),
  };
}

/**
 * El servidor. `capturar()` da la imagen ya decodificada; `codigo` es el de
 * vinculación (obligatorio); `conductor()` da el modo solo (el que lleva el
 * draft: `paraElMovil`, `corregir`, `resultado`). Lo que usa el modo solo en
 * el mismo proceso va en `servidor.interno`.
 */
export function crearServidor({
  capturar, codigo, conductor = () => null, carpeta = null, caras = carasGuardadas(), registrar = () => {},
  aprendido = null, aprender, recortar, guardar, resultados = null, vigilancia: vigilanciaPedida = VIGILANCIA,
  ahora = () => Date.now(), maximos = MAX_CAPTURAS, enHilos = true, origenLocal = process.env[VARIABLE_ORIGEN_LOCAL] === '1',
  estadoExtra = null, alCorregir = null, historial = null, claveDeLaTablet = null,
}) {
  if (typeof codigo !== 'string' || !codigo) throw new Error('el servidor del lector necesita el código de vinculación');
  const portero = crearPortero(codigo, { ahora });
  const retos = new Map();
  const plantillas = resultados ?? plantillasDeSerie();
  const arranque = ahora();
  const salud = { lecturas: 0, vistazos: 0, fallosCaptura: 0, ultimoFallo: null };
  const movil = { consultas: 0, ultima: null };
  let consejoActual = null, resumenActual = null, ajustesDelMovil = null;
  let fase = null, faseEn = 0;
  let correccion = null, correccionContestada = null, pregunta = null, respuesta = null;
  let delDraft = [], n = 0;
  const guardandose = new Set();
  /** Capturas seguidas con minimapa (de las lecturas, los vistazos y la vigilancia): con `LECTURAS_EN_PARTIDA` la burbuja se esconde. */
  let seguidasEnPartida = 0, ultimaMirada = null;
  const anotarPartida = (si) => { seguidasEnPartida = si ? seguidasEnPartida + 1 : 0; ultimaMirada = ahora(); };
  const escondida = () => seguidasEnPartida >= LECTURAS_EN_PARTIDA;
  const faseVigente = () => (escondida() ? 'partida' : fase && ahora() - faseEn <= FASE_VALE_MS ? fase : null);
  const vigente = (x) => (x && ahora() - x.cuando <= RETENCION_CAPTURAS_MS ? x : null);

  const aprendizaje = crearAprendizaje({ carpeta, aprendido, registrar, ...(aprender ? { aprender } : {}), ...(recortar ? { recortar } : {}), ...(guardar ? { guardar } : {}) });
  const vigilancia = crearVigilancia({ capturar, resultados: plantillas, ahora, registrar, vigilancia: vigilanciaPedida, alMirar: anotarPartida });
  const lector = enHilos ? lectorEnHilos({ caras, registrar }) : null;
  const podar = () => { if (carpeta) podarCapturas(carpeta, { ahora: ahora(), maximos, proteger: new Set([...(vigente(correccion)?.ids ?? []), ...delDraft, ...aprendizaje.enUso()]) }); };

  /** Una lectura de la pantalla. Con `rapida`, en partida no reconoce caras; `soloPartida` es un vistazo al minimapa. */
  async function hacerLectura({ rapida = false, soloPartida = false } = {}) {
    const t0 = Date.now(), tLeida = ahora();
    if (soloPartida) salud.vistazos += 1; else salud.lecturas += 1;
    let img;
    try { img = await capturar(); } catch (e) {
      const que = String(e?.message).split('\n')[0];
      registrar(`No se pudo hacer la captura: ${que}`);
      salud.fallosCaptura += 1;
      salud.ultimoFallo = { cuando: ahora(), que: que.slice(0, 160) };
      return { ok: false, error: 'captura' };
    }
    try {
      const partida = enPartida(img);
      anotarPartida(partida);
      vigilancia.anotarLectura(tLeida, partida);
      if (soloPartida || (rapida && partida)) return { ok: true, lectura: { partida, rapida: true } };
      n += 1;
      const id = `lectura-${new Date().toISOString().replace(/[:.]/g, '-')}-${n}`;
      const leido = lector ? await lector.leer(img, aprendizaje.aprendido()) : leerCaptura(img, caras, aprendizaje.aprendido());
      const lectura = { id, ...leido, partida, ms: Date.now() - t0 };
      if (carpeta) {
        writeFileSync(join(carpeta, `${id}.json`), JSON.stringify(lectura, null, 1));
        // [M] Comprimir la captura fuera del hilo principal: la siguiente lectura no espera.
        const guardado = escribirPngRapido(img).then((b) => { writeFileSync(join(carpeta, `${id}.png`), b); podar(); })
          .catch((e) => registrar(`No se pudo guardar la captura ${id}: ${e.message}`)).finally(() => guardandose.delete(guardado));
        guardandose.add(guardado);
      }
      const nombres = (l) => l.map((x) => x.nombre ?? (x.candidato ? `?(${x.candidato} ${x.parecido.toFixed(2)})` : '?')).join(', ');
      registrar(`Lectura ${n} (${lectura.ms} ms): baneos ${nombres([...lectura.tuyos, ...lectura.suyos])} · enemigos ${nombres(lectura.enemigos)} · tu equipo ${nombres(lectura.aliados)} · tú ${lectura.tuyo ?? (lectura.tuyoFila >= 0 ? '?' : 'sin fila amarilla')}`);
      return { ok: true, lectura };
    } catch (e) {
      registrar(`La captura no se pudo leer: ${e.message}`);
      return { ok: false, error: 'formato' };
    }
  }

  const estado = () => {
    const a = aprendizaje.aprendido();
    return {
      ok: true, protocolo: PROTOCOLO,
      aprendido: { capturas: a?.capturas ?? 0, caras: Object.keys(a?.caras ?? {}).length, aliados: Object.keys(a?.aliados ?? {}).length, picks: !!a?.picks },
      resultados: { gane: plantillas.gane.length, perdi: plantillas.perdi.length, tablas: plantillas.tablas.length },
      lector: { minutos: Math.round((ahora() - arranque) / 60000), ...salud, memoriaMB: Math.round(process.memoryUsage().rss / 1e6) },
      movil: { consultas: movil.consultas, haceS: movil.ultima == null ? null : Math.round((ahora() - movil.ultima) / 1000) },
      pendiente: { correccion: !!vigente(correccion), pregunta: !!vigente(pregunta), vigilando: vigilancia.estado().activa },
      ...(typeof estadoExtra === 'function' ? estadoExtra() : estadoExtra ?? {}),
    };
  };

  /** La APK contesta «Enseña al lector»: héroes del catálogo, sin repetir; arregla la partida apuntada y aprende de las capturas de ese draft. */
  async function contestarCorreccion(cuerpo, c) {
    if (cuerpo.descartar === true) { correccion = null; registrar('Corrección descartada en la tablet.'); return [200, { ok: true }]; }
    const porClave = new Map(c.heroes.map((h) => [nombreClave(h), h]));
    const lista = (l) => (Array.isArray(l) ? l : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => porClave.get(nombreClave(x)));
    const enemigos = lista(cuerpo.enemigos), aliados = lista(cuerpo.aliados);
    const tuyo = typeof cuerpo.tuyo === 'string' && cuerpo.tuyo.trim() ? porClave.get(nombreClave(cuerpo.tuyo)) : null;
    const todos = [...enemigos, ...aliados, ...(tuyo !== null ? [tuyo] : [])];
    if (todos.some((x) => !x) || enemigos.length > 5 || aliados.length > 4 || new Set(todos).size !== todos.length || !enemigos.length) return [400, { error: 'héroes' }];
    correccion = null;
    if (!Number.isFinite(c.partida)) correccionContestada = { cuando: c.cuando, enemigos, aliados, tuyo };
    // La partida se arregla aunque aprender falle: lo que dices es la verdad igual.
    try { alCorregir?.({ partida: c.partida ?? null, enemigos, aliados, tuyo }); } catch (e) { registrar(`No se pudo arreglar la partida apuntada: ${e.message}`); }
    return [200, await aprendizaje.corregir({ ids: c.ids, enemigos, baneos: c.leidos.baneos, aliados, tuyo })];
  }

  /** Las rutas: mismas claves que `RUTAS` (contrato.js). Cada una devuelve [estado, cuerpo]. */
  const manejadores = {
    'GET /reto': (req) => new Promise((resolver) => {
      const reto = new URL(req.url, 'http://127.0.0.1').searchParams.get('n') ?? '';
      if (!/^[0-9a-f]{32}$/.test(reto)) return resolver([400, { error: 'reto' }]);
      if (!permitirReto(retos, req.socket.remoteAddress ?? '', ahora())) return resolver([429, { error: 'bloqueado' }]);
      pbkdf2(codigo, `lector-reto:${reto}`, RETO_VUELTAS, 32, 'sha256', (e, clave) => resolver(e ? [500, { error: 'reto' }] : [200, { prueba: clave.toString('hex') }]));
    }),
    'GET /estado': () => [200, estado()],
    'GET /clave': () => { const clave = claveDeLaTablet?.() ?? null; return clave ? [200, { clave }] : [404, { error: 'sin clave' }]; },
    'GET /draft': () => {
      movil.consultas += 1; movil.ultima = ahora();
      const vista = conductor()?.paraElMovil?.() ?? {};
      return [200, sanearRespuestaDraft({ protocolo: PROTOCOLO, fase: faseVigente(), draft: vista.draft ?? null, partida: vista.partida ?? null })];
    },
    'POST /draft': (req, cuerpo) => {
      const c = sanearCorreccion(cuerpo);
      if (!c) return [400, { error: 'correccion' }];
      movil.ultima = ahora();
      return conductor()?.corregir?.(c) ? [200, { ok: true }] : [409, { error: 'ese draft ya no está en la tablet' }];
    },
    'POST /ajustes': (req, cuerpo) => {
      const a = sanearAjustes(cuerpo);
      if (!a) return [400, { error: 'ajustes' }];
      // `cuando`: lo que la tablet apunte DESPUÉS no está en esa maestría.
      ajustesDelMovil = { ...a, cuando: ahora() };
      return [200, { ok: true }];
    },
    'POST /resultado': (req, cuerpo) => {
      const r = sanearResultado(cuerpo);
      if (!r) return [400, { error: 'resultado' }];
      return conductor()?.resultado?.(r) ? [200, { ok: true }] : [409, { error: 'esa partida ya no está en la tablet' }];
    },
    'GET /consejo': () => {
      const alFinal = vigilancia.alFinal();
      return [200, { consejo: escondida() || alFinal ? null : consejoActual, resumen: resumenActual, enPartida: escondida(), fase: faseVigente(), pendiente: { pregunta: !!vigente(pregunta) && !alFinal } }];
    },
    'GET /correccion': () => {
      const c = vigente(correccion);
      return [200, { correccion: c ? { id: c.id, cuando: c.cuando, leidos: c.leidos, heroes: c.heroes, tuyos: c.tuyos ?? [] } : null }];
    },
    'POST /correccion': async (req, cuerpo, antes) => {
      // Otra vez tras leer el cuerpo: entretanto pudo contestarla otra petición o llegar otra.
      const c = vigente(correccion);
      if (!c || c !== antes.correccion || cuerpo?.id !== c.id) return [409, { error: 'ya no hay esa corrección' }];
      return contestarCorreccion(cuerpo, c);
    },
    'GET /pregunta': () => { const p = vigente(pregunta); return [200, { pregunta: p ? { id: p.id, pick: p.pick } : null }]; },
    'POST /pregunta': (req, cuerpo, antes) => {
      const p = vigente(pregunta);
      if (!p || p !== antes.pregunta || cuerpo?.id !== p.id) return [409, { error: 'ya no hay esa pregunta' }];
      if (!(cuerpo.gane === true || cuerpo.gane === false || cuerpo.gane === null)) return [400, { error: 'gane' }];
      pregunta = null;
      respuesta = { id: p.id, desde: p.desde, gane: cuerpo.gane, cuando: ahora() };
      if (typeof cuerpo.gane === 'boolean') vigilancia.terminar(p.desde);
      registrar(`Contestado en la tablet: ${cuerpo.gane === null ? 'la partida no contó' : cuerpo.gane ? 'ganada' : 'perdida'}.`);
      return [200, { ok: true }];
    },
    'GET /partidas': async () => (historial ? [200, await historial.listar()] : [404, { error: 'no existe' }]),
    'POST /partida': (req, cuerpo) => {
      if (!historial) return [404, { error: 'no existe' }];
      const r = historial.editar(cuerpo);
      return [r.ok ? 200 : r.estado ?? 400, r];
    },
  };

  /** Cada petición, por las mismas puertas, en este orden. */
  async function atender(req, res) {
    const cabeceras = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
    const responder = (estadoHttp, cuerpo) => { if (!res.headersSent) res.writeHead(estadoHttp, cabeceras).end(JSON.stringify(cuerpo)); };
    // [C] Solo peticiones dirigidas a ESTE aparato: con otro `Host` es una web que apunta su dominio aquí (rebinding de DNS).
    if (!hostPermitido(req.headers.host)) return responder(403, { error: 'host no permitido' });
    const origen = req.headers.origin;
    if (origen) {
      if (!origenPermitido(origen, { local: origenLocal })) return responder(403, { error: 'origen no permitido' });
      cabeceras['Access-Control-Allow-Origin'] = origen;
    }
    if (req.method === 'OPTIONS') {
      res.writeHead(204, { ...cabeceras, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type, X-Lector-Codigo', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Max-Age': '600' }).end();
      return undefined;
    }
    let camino;
    try { camino = new URL(req.url, 'http://127.0.0.1').pathname; } catch { return responder(400, { error: 'ruta' }); }
    const ruta = `${req.method} ${camino}`;
    const quien = Object.hasOwn(RUTAS, ruta) ? RUTAS[ruta] : null;
    const manejar = Object.hasOwn(manejadores, ruta) ? manejadores[ruta] : null;
    if (!quien || !manejar) return responder(404, { error: 'no existe' });
    if (quien !== 'cualquiera') {
      const r = portero(req.headers['x-lector-codigo'], req.socket.remoteAddress ?? '');
      if (r !== 'si') return responder(r === 'bloqueado' ? 429 : 401, { error: r === 'bloqueado' ? 'bloqueado' : 'codigo' });
    }
    if (quien === 'app' && !origen) return responder(403, { error: 'solo la app' });
    if (quien === 'apk' && !deLaApk(req)) return responder(403, { error: 'solo la tablet' });
    const antes = { correccion: vigente(correccion), pregunta: vigente(pregunta) };
    const cuerpo = req.method === 'POST' ? await leerCuerpo(req) : null;
    if (req.method === 'POST' && (!cuerpo || typeof cuerpo !== 'object')) return responder(400, { error: 'cuerpo' });
    try {
      // La respuesta DESPUÉS del resultado: con la cabecera enviada antes del `await`, un fallo tiraba el proceso.
      const [estadoHttp, salida] = await manejar(req, cuerpo, antes);
      return responder(estadoHttp, salida);
    } catch (e) {
      registrar(`${ruta} falló: ${String(e?.message).split('\n')[0]}`);
      return responder(500, { error: 'interno' });
    }
  }

  const servidor = createServer((req, res) => { atender(req, res).catch(() => {}); });
  // [M] Más que el ritmo de la app (2 s): con 5 s chocaba con ella y daba ECONNRESET.
  servidor.keepAliveTimeout = 65000;
  /** Las rutas que atiende (la prueba las compara con `RUTAS`). */
  servidor.rutas = Object.keys(manejadores);
  servidor.interno = {
    leer: (opciones) => hacerLectura(opciones),
    ponerConsejo: (c) => { consejoActual = sanearConsejo(c); },
    ponerResumen: (r) => { resumenActual = sanearResumen(r) ?? resumenActual; },
    ponerFase: (f) => { if (f === null || f === 'draft' || f === 'fuera' || f === 'partida') { fase = f; faseEn = ahora(); } },
    /** Las capturas del draft abierto: la poda no se las lleva (a 1,5 s por lectura, las 40 del tope son un minuto). */
    protegerLecturas: (ids) => { delDraft = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && ID_DE_LECTURA.test(id)).slice(-40); },
    ajustesDelMovil: () => ajustesDelMovil,
    vigilar: (desde) => vigilancia.vigilar(desde),
    final: () => vigilancia.estado(),
    terminarVigilancia: (desde) => vigilancia.terminar(desde),
    ponerCorreccion: (c) => { correccion = c ? sanearCorreccionDeLaTablet(c) : null; },
    correccion: () => vigente(correccion),
    /** La corrección contestada en la APK antes de apuntar su partida: se recoge una vez. */
    correccionContestada: () => { const c = correccionContestada; correccionContestada = null; return vigente(c); },
    ponerPregunta: (p) => { pregunta = p ? sanearPregunta(p) : null; },
    respuesta: () => { const r = respuesta; respuesta = null; return r; },
    aprenderDe: (verdad) => aprendizaje.corregir(verdad),
    recortesDe: (ids) => aprendizaje.recortesDe(ids),
    cabeceraDe: (ids) => aprendizaje.cabeceraDe(ids),
    aprenderDeArreglos: (drafts) => aprendizaje.aprenderDeArreglos(drafts),
    estado,
    /** Un vistazo al minimapa si la burbuja tiene algo que enseñar y nadie ha capturado en `VISTAZO_MS`. null si no tocaba. */
    mirarPartida: async () => {
      if (!consejoActual || (ultimaMirada != null && ahora() - ultimaMirada < VISTAZO_MS)) return null;
      return hacerLectura({ soloPartida: true });
    },
    /** Las capturas que aún se están comprimiendo (para las pruebas). */
    guardando: () => Promise.all([...guardandose]),
  };
  servidor.on('close', () => { vigilancia.parar(); lector?.cerrar(); });
  return servidor;
}
