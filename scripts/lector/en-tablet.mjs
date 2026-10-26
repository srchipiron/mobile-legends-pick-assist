/**
 * El lector DENTRO de la tablet (3.61.0, elegido por Javi: «B»). Lo arranca
 * la APK de `android/` con Node embebido, y la captura ya no es adb: es la
 * pantalla de la propia tablet, que la APK graba con el permiso normal de
 * Android (MediaProjection) y entrega por 127.0.0.1 con un secreto. Así no
 * hace falta la depuración inalámbrica, ni emparejar, ni puertos que cambian.
 *
 * Lo que cambia frente a Termux, y por qué es seguro:
 * - Escucha en la wifi (la app está en el MÓVIL), pero solo contesta con el
 *   código de vinculación (`X-Lector-Codigo`, `crearPortero`), a la app
 *   publicada (`origenPermitido`) y con una IP privada como `Host`.
 * - La captura y la voz las da la APK en 127.0.0.1 (`LECTOR_INTERNO`); este
 *   fichero no lanza programas. Fuera de la casa solo pide los datos de
 *   Pick Assist a su web pública (3.66.0, modo solo: `DATOS_DE_LA_WEB`).
 * - Nada toca la pantalla ni el juego: solo se LEE lo que se ve.
 *
 * Variables (las pone la APK): LECTOR_INTERNO (http://127.0.0.1:PUERTO),
 * LECTOR_SECRETO, LECTOR_CODIGO, LECTOR_CASA (carpeta de la app).
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync, statSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { randomBytes } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { crearServidor, crearElectorDeCaptura, cargarLoAprendido, podarCapturas, sanearAjustes, PUERTO, VISTAZO_MS } from './servir.mjs';
import { limpiarTexto } from './voz.mjs';
import { leerCrudo, escribirPngRapido } from './png.mjs';
import { crearSolo, leerAjustesSolo, ajustesEfectivos, datosDelSolo } from './solo.mjs';
import { sanearConfig, claveDeJugadorValida, crearClaveDeJugador, subirPartidas, subirParte } from '../../src/app/basedatos.js';
import { maestriaEfectiva } from '../../src/motor/maestria.js';

/** Solo 127.0.0.1: la APK es la única que da la captura. */
export const esInterno = (u) => typeof u === 'string' && /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(u);

/** Un código de vinculación decente: 8 o más letras o cifras. */
export const codigoValido = (c) => typeof c === 'string' && /^[A-Za-z0-9]{8,64}$/.test(c);

/**
 * La captura de la APK, siempre en crudo (la cabecera de 16 bytes de
 * `screencap` + RGBA: así la APK no comprime nada) y con su secreto. Lo que
 * el servidor pide en PNG (las pantallas del final) se comprime aquí.
 */
export function capturaDeLaApk(base, secreto, { pedir = fetch } = {}) {
  if (!esInterno(base)) throw new Error('la captura solo puede venir de 127.0.0.1');
  return async ({ crudo = false } = {}) => {
    let r;
    try { r = await pedir(`${base}/captura`, { headers: { 'X-Secreto': secreto }, signal: AbortSignal.timeout(15000) }); } catch (e) { throw Object.assign(new Error(`la app del lector no contesta (${e.message})`), { tipo: 'captura' }); }
    if (!r.ok) throw Object.assign(new Error(r.status === 409 ? 'La tablet no está grabando la pantalla: abre la app del lector y toca «Empezar».' : `captura ${r.status}`), { tipo: 'captura' });
    const buf = Buffer.from(await r.arrayBuffer());
    return crudo ? buf : escribirPngRapido(leerCrudo(buf));
  };
}

/** La voz de la APK (TextToSpeech de Android): null si sonó, «falta» si no hay voz. */
export function vozDeLaApk(base, secreto, { pedir = fetch } = {}) {
  if (!esInterno(base)) throw new Error('la voz solo puede ir a 127.0.0.1');
  return async (texto, idioma = 'es') => {
    const limpio = limpiarTexto(texto);
    if (!limpio) return null;
    try {
      const r = await pedir(`${base}/voz`, { method: 'POST', headers: { 'X-Secreto': secreto, 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: limpio, idioma: idioma === 'en' ? 'en' : 'es' }), signal: AbortSignal.timeout(60000) });
      return r.ok ? null : r.status === 404 ? 'falta' : 'otro';
    } catch { return 'otro'; }
  };
}

/**
 * Lo que la APK escribe de la tablet (`salud.json`): solo los campos
 * conocidos, con su tipo. Un fichero roto o ausente es null.
 */
export function leerSaludDeLaApk(fichero) {
  try {
    const j = JSON.parse(readFileSync(fichero, 'utf8'));
    const salida = {};
    for (const k of ['apk', 'modelo', 'esquina', 'burbujaEstado']) if (typeof j[k] === 'string') salida[k] = j[k].slice(0, 60);
    for (const k of ['android', 'memoriaLibreMB', 'memoriaAppMB', 'cuando']) if (Number.isFinite(j[k])) salida[k] = Math.round(j[k]);
    for (const k of ['grabando', 'burbuja', 'bateriaLibre', 'memoriaBaja']) if (typeof j[k] === 'boolean') salida[k] = j[k];
    return Object.keys(salida).length ? salida : null;
  } catch { return null; }
}

/**
 * Los datos del modo solo (3.66.0): los mismos ficheros que sirve Pick Assist,
 * de su web pública, cada `REFRESCAR_DATOS_MS`. Solo GET a estas
 * direcciones fijas: nada de la cuenta ni del juego. `comunidad` (3.70.0)
 * es la dirección y la clave PÚBLICA de la base de datos de partidas.
 */
export const DATOS_DE_LA_WEB = {
  catalogo: 'https://srchipiron.github.io/mobile-legends-pick-assist/data/heroes.json',
  meta: 'https://srchipiron.github.io/mobile-legends-pick-assist/data/roam-meta.json',
  comunidad: 'https://srchipiron.github.io/mobile-legends-pick-assist/comunidad.json',
};
/** Decisión de producto: el bot trae datos dos veces al día. */
export const REFRESCAR_DATOS_MS = 6 * 60 * 60 * 1000;
const FICHEROS = { catalogo: 'heroes.json', meta: 'roam-meta.json', comunidad: 'comunidad.json' };
/** ¿Tiene forma de lo que sirve la app? (unos ficheros a medias o una página de error no se guardan) */
export const datosValidos = (que, j) => {
  if (que === 'comunidad') return !!j && typeof j === 'object' && !Array.isArray(j);
  return que === 'catalogo' ? Array.isArray(j?.heroes) && j.heroes.length >= 50 : Array.isArray(j?.heroes) && j.heroes.length >= 50 && !!j.stats;
};

/**
 * Lee los datos de la casa (los bajados) o los que trae la APK dentro
 * (copiados al compilar): así decide desde el primer arranque, sin red. Con
 * caché por fecha de modificación.
 *
 * El meta, el MÁS NUEVO de los que haya (por `generatedAt`), no el primero
 * que aparezca (3.73.1): con los bajados delante siempre, si la descarga
 * dejaba de funcionar y una APK nueva traía datos más frescos, la tablet
 * seguía decidiendo con los viejos sin decirlo. El catálogo va con el meta
 * elegido (de su misma carpeta si allí hay uno válido). `de` dice de dónde
 * salieron, para /estado.
 */
export function lectorDeDatos(carpetas) {
  const cache = {};
  const leer = (c, que) => {
    const f = join(c, FICHEROS[que]);
    try {
      const m = statSync(f).mtimeMs;
      if (cache[f]?.m === m) return cache[f].j;
      const j = JSON.parse(readFileSync(f, 'utf8'));
      if (!datosValidos(que, j)) return null;
      cache[f] = { m, j };
      return j;
    } catch { return null; }
  };
  const fecha = (j) => { const t = Date.parse(j?.generatedAt ?? ''); return Number.isFinite(t) ? t : -Infinity; };
  return () => {
    let meta = null, deMeta = null;
    carpetas.forEach((c, i) => { const j = leer(c, 'meta'); if (j && (!meta || fecha(j) > fecha(meta))) { meta = j; deMeta = i; } });
    const orden = deMeta == null ? carpetas : [carpetas[deMeta], ...carpetas.filter((_, i) => i !== deMeta)];
    let catalogo = null;
    for (const c of orden) { catalogo = leer(c, 'catalogo'); if (catalogo) break; }
    return { catalogo, meta, de: deMeta };
  };
}

/**
 * Los ajustes del modo solo (3.69.3): los de la APK (`solo.json`) y, si no
 * eligió línea, la última que mandó la app del móvil. Esa se guarda en
 * `solo-movil.json` para que valga también tras reiniciar la tablet sin el
 * móvil delante. Lo de disco se lee con forma o no se usa.
 */
export function ajustesDeLaTablet(casa, interno) {
  const fichero = join(casa, 'solo-movil.json');
  const conCuando = (j) => { const a = sanearAjustes(j); return a ? { ...a, cuando: Number.isFinite(j?.cuando) ? j.cuando : 0 } : null; };
  let guardado;
  try { guardado = conCuando(JSON.parse(readFileSync(fichero, 'utf8'))); } catch { guardado = null; }
  const delMovil = () => {
    const m = interno.ajustesDelMovil();
    if (m && JSON.stringify(m) !== JSON.stringify(guardado)) {
      guardado = m;
      try { writeFileSync(fichero, JSON.stringify(guardado)); } catch { /* sin disco, vale lo de memoria */ }
    }
    return m ?? guardado;
  };
  const ajustes = () => ajustesEfectivos(leerAjustesSolo(join(casa, 'solo.json')), delMovil());
  // Lo último del móvil (3.70.0): tu maestría, tu clave de la base de datos y cuándo llegaron.
  ajustes.delMovil = delMovil;
  return ajustes;
}

/** Partidas que guarda la tablet (3.70.0): las más nuevas. Decisión de producto, el tope de la app. */
export const TOPE_PARTIDAS_TABLET = 500;

/**
 * Las partidas que apunta la tablet sola (3.70.0), en `partidas.json` de la
 * casa: `{ partidas, subidas }` (los instantes ya subidos a la base de
 * datos). Se escribe a un temporal y luego encima.
 */
export function partidasDeLaTablet(casa) {
  const fichero = join(casa, 'partidas.json');
  let datos;
  try {
    const j = JSON.parse(readFileSync(fichero, 'utf8'));
    datos = {
      partidas: Array.isArray(j?.partidas) ? j.partidas.filter((p) => p && Number.isFinite(p.t) && typeof p.pick === 'string' && typeof p.gane === 'boolean') : [],
      subidas: Array.isArray(j?.subidas) ? j.subidas.filter(Number.isFinite) : [],
    };
  } catch { datos = { partidas: [], subidas: [] }; }
  const escribir = () => {
    try { writeFileSync(`${fichero}.tmp`, JSON.stringify(datos)); renameSync(`${fichero}.tmp`, fichero); } catch { /* sin disco: quedan en memoria */ }
  };
  return {
    apuntar(p) {
      if (!p || !Number.isFinite(p.t) || datos.partidas.some((x) => x.t === p.t)) return false;
      datos.partidas = [p, ...datos.partidas].sort((a, b) => b.t - a.t).slice(0, TOPE_PARTIDAS_TABLET);
      escribir();
      return true;
    },
    todas: () => datos.partidas,
    pendientes: () => { const s = new Set(datos.subidas); return datos.partidas.filter((p) => !s.has(p.t)); },
    marcarSubidas(ts) {
      const vivas = new Set(datos.partidas.map((p) => p.t));
      datos.subidas = [...new Set([...datos.subidas, ...ts])].filter((t) => vivas.has(t));
      escribir();
    },
    /**
     * Lo que dijiste en la APK de quién era quién (3.71.0): arregla el draft de
     * esa partida y la vuelve a subir. Si tu pick era otro, la estimación (que
     * era la de otro héroe) se quita, como al cambiar de héroe en la app.
     */
    corregir(t, { enemigos = [], aliados = [], tuyo = null } = {}) {
      const i = datos.partidas.findIndex((p) => p.t === t);
      if (i < 0) return false;
      const { supuesto, estimacion, modelo, ...resto } = datos.partidas[i];
      const otro = !!tuyo && tuyo !== resto.pick;
      datos.partidas[i] = {
        ...resto,
        ...(tuyo ? { pick: tuyo } : supuesto ? { supuesto } : {}),
        ...(otro ? {} : { ...(estimacion != null ? { estimacion } : {}), ...(modelo != null ? { modelo } : {}) }),
        draft: { ...resto.draft, enemigos: enemigos.slice(0, 5), aliados: aliados.slice(0, 4) },
      };
      datos.subidas = datos.subidas.filter((x) => x !== t);
      escribir();
      return true;
    },
  };
}

/**
 * Sube a la base de datos de partidas lo que la tablet apuntó y no subió
 * (3.70.0), con TU clave (la que manda la app si tienes «Guardar mis
 * partidas» puesto) y la dirección y la clave pública de `comunidad.json`.
 * Sin clave o sin configuración, no sube nada. Nunca lanza.
 */
export async function subirLoDeLaTablet({ partidas, clave, config, fetch = globalThis.fetch }) {
  const conf = sanearConfig(config);
  const pendientes = partidas.pendientes();
  if (!conf || !claveDeJugadorValida(clave) || !pendientes.length) return { subidas: 0 };
  const r = await subirPartidas({ config: conf, clave, partidas: pendientes, completo: false }, { fetch });
  if (r.error) return r;
  partidas.marcarSubidas(pendientes.map((p) => p.t));
  return { subidas: pendientes.length, total: r.total };
}

/** Cada cuánto sube la tablet su parte de salud (3.74.0): decisión de producto, el tope del servidor es uno cada 4 minutos. */
export const PARTE_CADA_MS = 15 * 60 * 1000;
/** Las líneas del registro que van en cada parte, y su largo máximo. */
export const LINEAS_DEL_PARTE = 60;
/**
 * Tope del parte entero, en bytes (3.74.2): el servidor rechaza más de
 * 16.000 (`subir_parte`), y con un fallo de Node largo el parte pasaba de
 * 19.000 y no llegaba justo cuando había algo que ver. Margen para el estado.
 */
export const TOPE_PARTE_BYTES = 12000;
/** Las líneas del registro que son un error: van aparte en el parte para que no se salgan de las últimas 60. La revisión usa la misma. */
export const LINEA_DE_ERROR = /ERROR sin recoger|No se pudo|no se pudo|fallaron|SyntaxError|TypeError|ReferenceError|RangeError|ENOSPC/;
/** Los errores que van aparte en cada parte, los más recientes. */
export const ERRORES_DEL_PARTE = 10;

/**
 * Las últimas líneas del registro, limpias para salir de la tablet (3.74.0):
 * sin direcciones IP, sin el código de vinculación ni tu clave, sin
 * caracteres de control, y cortas. Lo demás del registro son nombres de
 * héroe, tiempos y contadores.
 */
export function lineasLimpias(texto, { secretos = [], max = LINEAS_DEL_PARTE, solo = null } = {}) {
  const tapar = secretos.filter((x) => typeof x === 'string' && x.length >= 8);
  return String(texto ?? '').split('\n').filter((l) => l.trim() && (!solo || solo.test(l))).slice(-max).map((l) => {
    // Sin caracteres de control (limpiarTexto, el de la voz) y sin IP.
    let x = limpiarTexto(l).replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '[ip]');
    for (const sec of tapar) x = x.split(sec).join('[oculto]');
    return x.slice(0, 300);
  });
}

/**
 * El parte de salud de la tablet (3.74.0): lo que dice /estado, el fallo de
 * Node de la última vez si lo hubo, los últimos errores del registro (de
 * todo él: con una lectura cada 5 s, 60 líneas son 5 minutos y el parte
 * sale cada 15) y sus últimas líneas, limpias. Cabe siempre en
 * `TOPE_PARTE_BYTES`: si no, quita primero líneas del registro y luego
 * acorta el fallo, y lo dice en `recortado`. Lo sube `subirParte`.
 */
export function parteDeSalud({ estado, log = '', falloNodo = null, secretos = [], ahora = Date.now() }) {
  const parte = {
    v: 1, cuando: ahora,
    estado,
    ...(falloNodo ? { falloNodo: lineasLimpias(falloNodo, { secretos, max: 30 }).join('\n') } : {}),
    errores: lineasLimpias(log, { secretos, max: ERRORES_DEL_PARTE, solo: LINEA_DE_ERROR }),
    log: lineasLimpias(log, { secretos }),
  };
  const mide = () => Buffer.byteLength(JSON.stringify(parte));
  while (mide() > TOPE_PARTE_BYTES && parte.log.length) { parte.log.shift(); parte.recortado = true; }
  if (mide() > TOPE_PARTE_BYTES && parte.falloNodo) { parte.falloNodo = parte.falloNodo.slice(0, 2000); parte.recortado = true; }
  while (mide() > TOPE_PARTE_BYTES && parte.errores.length) { parte.errores.shift(); parte.recortado = true; }
  return parte;
}

/** Lo último del registro: basta con el final para el parte, y un registro de meses no se lee entero cada 15 minutos. */
export const FINAL_DEL_REGISTRO_BYTES = 256 * 1024;

/**
 * La clave con la que la tablet sube sus PARTES (3.74.1): la suya, creada al
 * azar la primera vez y guardada en `clave-lector.txt`. No es tu clave de
 * jugador: con ella no se ven ni se tocan tus partidas, y así los partes
 * llegan aunque el móvil no haya mandado nunca la tuya (la base de datos
 * tenía 0 jugadores el 26 de octubre de 2026: sin esto, la revisión no veía
 * nada). Sin disco, null: no se sube.
 */
export function claveDelLector(casa, { azar = (n) => new Uint8Array(randomBytes(n)) } = {}) {
  const fichero = join(casa, 'clave-lector.txt');
  try { const c = readFileSync(fichero, 'utf8').trim(); if (claveDeJugadorValida(c)) return c; } catch { /* la primera vez */ }
  const c = crearClaveDeJugador(azar);
  try { writeFileSync(fichero, c); return c; } catch { return null; }
}

/** La configuración de la base de datos que bajó la tablet (o la que trae la APK). */
export function leerComunidad(carpetas) {
  for (const c of carpetas) {
    try { const j = sanearConfig(JSON.parse(readFileSync(join(c, FICHEROS.comunidad), 'utf8'))); if (j) return j; } catch { /* la siguiente */ }
  }
  return null;
}

/** Baja los datos de la web a `carpeta` (a un temporal y luego encima). Nunca lanza; dice cuántos ficheros guardó. */
export async function bajarDatos(carpeta, { pedir = (...a) => fetch(...a), plazoMs = 60000 } = {}) {
  mkdirSync(carpeta, { recursive: true });
  let guardados = 0;
  for (const [que, url] of Object.entries(DATOS_DE_LA_WEB)) {
    try {
      const r = await pedir(url, { signal: AbortSignal.timeout(plazoMs) });
      if (!r.ok) continue;
      const texto = await r.text();
      if (!datosValidos(que, JSON.parse(texto))) continue;
      const f = join(carpeta, FICHEROS[que]);
      writeFileSync(`${f}.tmp`, texto);
      renameSync(`${f}.tmp`, f);
      guardados += 1;
    } catch { /* sin red: se queda lo que había */ }
  }
  return guardados;
}

export async function principal(env = process.env) {
  const registrar = (m) => console.log(m);
  const base = env.LECTOR_INTERNO, secreto = env.LECTOR_SECRETO, codigo = env.LECTOR_CODIGO;
  if (!esInterno(base) || !secreto || !codigoValido(codigo)) throw new Error('faltan LECTOR_INTERNO, LECTOR_SECRETO o un LECTOR_CODIGO válido');
  const carpeta = join(env.LECTOR_CASA || '.', 'capturas');
  mkdirSync(carpeta, { recursive: true });
  podarCapturas(carpeta);
  // El modo solo, para /estado (3.69.3): se crea después del servidor.
  let soloRef = null;
  // Arreglar la partida apuntada con tu corrección (3.71.0): las partidas se crean después.
  let alCorregirRef = null;
  // Lo que la APK enseña de cómo va la tablet (3.73.1): de cuándo son sus datos y si sus partidas suben.
  let estadoTablet = () => ({});
  const servidor = crearServidor({
    alCorregir: (c) => alCorregirRef?.(c),
    capturar: capturaDeLaApk(base, secreto), hablar: vozDeLaApk(base, secreto), codigo,
    // Por qué se cerró la app la última vez (3.61.5, lo dice Android): el Diagnóstico del móvil lo enseña.
    // Y lo que la APK sabe de la tablet (3.63.0: versión, si graba, permisos, memoria), que escribe cada pocos segundos.
    estadoExtra: () => ({ salida: String(env.LECTOR_ULTIMA_SALIDA ?? '').slice(0, 500) || null, tablet: leerSaludDeLaApk(join(env.LECTOR_CASA || '.', 'salud.json')), ...(soloRef ? { solo: soloRef.resumen() } : {}), ...estadoTablet() }),
    elector: crearElectorDeCaptura(), carpeta, registrar, ...cargarLoAprendido(registrar),
  });
  const puerto = Number(env.LECTOR_PUERTO ?? PUERTO);
  await new Promise((r) => servidor.listen(puerto, env.LECTOR_ESCUCHA ?? '0.0.0.0', r));
  registrar(`Lector en la tablet esperando en el puerto ${servidor.address().port}.`);
  // Un solo aparato (3.66.0): con la línea elegida en la APK, el lector
  // decide y pinta el consejo él solo cuando el móvil no está leyendo.
  const casa = env.LECTOR_CASA || '.';
  const bajados = join(casa, 'datos');
  const aqui = dirname(fileURLToPath(import.meta.url));
  const leerDatos = lectorDeDatos([bajados, join(aqui, '..', '..', 'datos'), join(aqui, '..', '..', 'public', 'data')]);
  const ajustes = ajustesDeLaTablet(casa, servidor.interno);
  // Todo desde la tablet (3.70.0): apunta la partida sola, decide con tu
  // maestría (la del móvil más lo que la tablet apuntó después) y sube lo
  // apuntado a la base de datos con tu clave.
  const partidas = partidasDeLaTablet(casa);
  // Una subida a la vez: apuntar y el reloj de 10 minutos pueden coincidir.
  let subiendo = null;
  // Cómo fue la última subida (3.73.1): sin tu clave no sube nada, y antes no se decía.
  let ultimaSubida = { cuando: null, error: null };
  const subir = () => {
    if (subiendo) return subiendo;
    const clave = ajustes.delMovil()?.clave;
    const config = leerComunidad([bajados, join(aqui, '..', '..', 'datos')]);
    subiendo = subirLoDeLaTablet({ partidas, clave, config })
      .then((r) => {
        const error = r.error ?? (!partidas.pendientes().length ? null : !claveDeJugadorValida(clave) ? 'sinClave' : !config ? 'sinBaseDeDatos' : null);
        if (error && error !== ultimaSubida.error) registrar(`Sin móvil: ${partidas.pendientes().length} partidas sin subir (${error === 'sinClave' ? 'falta tu clave: abre Pick Assist en el móvil con «Guardar mis partidas» y la tablet vinculada una vez' : error}).`);
        ultimaSubida = { cuando: Date.now(), error };
        if (r.subidas) registrar(`Sin móvil: ${r.subidas} partidas subidas a la base de datos.`);
      })
      .catch(() => {})
      .finally(() => { subiendo = null; });
    return subiendo;
  };
  estadoTablet = () => {
    const d = leerDatos();
    return {
      datos: { fecha: d.meta?.generatedAt ?? null, de: d.de === 0 ? 'web' : d.de == null ? null : 'apk' },
      partidas: { apuntadas: partidas.todas().length, sinSubir: partidas.pendientes().length, clave: claveDeJugadorValida(ajustes.delMovil()?.clave), error: ultimaSubida.error },
    };
  };
  const solo = crearSolo({
    interno: servidor.interno, ajustes, datosPara: datosDelSolo(leerDatos), registrar,
    apuntar: (p) => { if (partidas.apuntar(p)) subir(); },
    maestriaDe: () => { const m = ajustes.delMovil(); return maestriaEfectiva(m?.maestria ?? {}, partidas.todas().filter((p) => p.t > (m?.cuando ?? 0))); },
  });
  alCorregirRef = ({ partida, enemigos, aliados, tuyo }) => {
    if (Number.isFinite(partida) && partidas.corregir(partida, { enemigos, aliados, tuyo })) { registrar('Sin móvil: la partida apuntada lleva ya los héroes que dijiste.'); subir(); }
  };
  // El parte de salud (3.74.0): para que la revisión automática vea cómo va la tablet sin que nadie copie nada.
  const subirSuParte = async () => {
    const clave = claveDelLector(casa);
    const config = leerComunidad([bajados, join(aqui, '..', '..', 'datos')]);
    if (!claveDeJugadorValida(clave) || !config) return;
    const leer = (f) => { try { return readFileSync(join(casa, f), 'utf8'); } catch { return null; } };
    const parte = parteDeSalud({ estado: servidor.interno.estado(), log: (leer('lector.log') ?? '').slice(-FINAL_DEL_REGISTRO_BYTES), falloNodo: leer('fallo-nodo.txt'), secretos: [codigo, clave, ajustes.delMovil()?.clave] });
    const r = await subirParte({ config, clave, parte });
    if (r.error && r.error !== 'pronto') registrar(`El parte de salud no se pudo subir (${r.error}).`);
  };
  const cadaParte = setInterval(() => { subirSuParte().catch(() => {}); }, PARTE_CADA_MS);
  const primerParte = setTimeout(() => { subirSuParte().catch(() => {}); }, 2 * 60 * 1000);
  servidor.on('close', () => { clearInterval(cadaParte); clearTimeout(primerParte); });
  servidor.subirParte = subirSuParte;
  const cadaSubida = setInterval(subir, 10 * 60 * 1000);
  // Lo que quedó sin subir de otra vez, al poco de arrancar (no a los 10 minutos).
  const primeraSubida = setTimeout(subir, 30000);
  servidor.on('close', () => { clearInterval(cadaSubida); clearTimeout(primeraSubida); });
  servidor.partidas = partidas;
  soloRef = solo;
  // El vistazo al minimapa (3.69.3): con la burbuja puesta y nadie capturando,
  // mira si estás en partida para quitarla. `mirarPartida` decide si toca.
  const vistazo = setInterval(() => { servidor.interno.mirarPartida().catch(() => {}); }, VISTAZO_MS);
  servidor.on('close', () => clearInterval(vistazo));
  if (env.LECTOR_SIN_SOLO !== '1') {
    solo.arrancar();
    const refrescar = async () => { const n = await bajarDatos(bajados); if (n) registrar(`Sin móvil: datos de Pick Assist al día (${n} ficheros).`); };
    const primero = setTimeout(refrescar, existsSync(join(bajados, FICHEROS.meta)) ? REFRESCAR_DATOS_MS : 30000);
    const cada = setInterval(refrescar, REFRESCAR_DATOS_MS);
    servidor.on('close', () => { solo.parar(); clearTimeout(primero); clearInterval(cada); });
  }
  servidor.solo = solo;
  return servidor;
}

/**
 * Un error que nadie recoge NO cierra la app (3.72.2). En la APK, cuando
 * Node sale, sale el proceso entero: la app se cerraba sola (Android:
 * «se cerró ella misma», código 1) y lo único que quedaba era ese número.
 * Hoy se apunta con su detalle en `fallo-nodo.txt` (la app lo enseña arriba,
 * con «Copiar») y en el registro, y el lector sigue. Si ni siquiera arranca,
 * Node se queda vivo sin hacer nada para que la app no se cierre y lo diga.
 */
export function vigilarErrores({ casa = '.', registrar = (m) => console.log(m), proceso = process } = {}) {
  const apuntar = (tipo, e) => {
    const texto = `${tipo}: ${e?.stack ?? e}`.slice(0, 4000);
    registrar(`ERROR sin recoger (${tipo}); el lector sigue. ${texto}`);
    try { writeFileSync(join(casa, 'fallo-nodo.txt'), `${new Date().toISOString()} ${texto}`); } catch { /* sin disco: queda en el registro */ }
  };
  proceso.on('uncaughtException', (e) => apuntar('excepción', e));
  proceso.on('unhandledRejection', (e) => apuntar('promesa', e));
  return apuntar;
}

if (process.env.LECTOR_INTERNO && process.argv[1]?.endsWith('en-tablet.mjs')) {
  const apuntar = vigilarErrores({ casa: process.env.LECTOR_CASA || '.' });
  try { await principal(); } catch (e) {
    apuntar('al arrancar', e);
    // Sin nada pendiente, Node acabaría y con él la app: se queda esperando.
    setInterval(() => {}, 1 << 30);
  }
}
