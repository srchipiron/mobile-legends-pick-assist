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
import { fileURLToPath } from 'node:url';
import { crearServidor, crearElectorDeCaptura, cargarLoAprendido, podarCapturas, sanearAjustes, PUERTO, VISTAZO_MS } from './servir.mjs';
import { limpiarTexto } from './voz.mjs';
import { leerCrudo, escribirPngRapido } from './png.mjs';
import { crearSolo, leerAjustesSolo, ajustesEfectivos, datosDelSolo } from './solo.mjs';
import { sanearConfig, claveDeJugadorValida, subirPartidas } from '../../src/app/basedatos.js';
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
 * Lee los datos de la casa (los bajados) o, si no hay, los que trae la APK
 * dentro (copiados al compilar): así decide desde el primer arranque, sin
 * red. Con caché por fecha de modificación.
 */
export function lectorDeDatos(carpetas) {
  const cache = {};
  const uno = (que) => {
    for (const c of carpetas) {
      const f = join(c, FICHEROS[que]);
      try {
        const m = statSync(f).mtimeMs;
        if (cache[que]?.f === f && cache[que].m === m) return cache[que].j;
        const j = JSON.parse(readFileSync(f, 'utf8'));
        if (!datosValidos(que, j)) continue;
        cache[que] = { f, m, j };
        return j;
      } catch { /* el siguiente */ }
    }
    return null;
  };
  return () => ({ catalogo: uno('catalogo'), meta: uno('meta') });
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
  const servidor = crearServidor({
    capturar: capturaDeLaApk(base, secreto), hablar: vozDeLaApk(base, secreto), codigo,
    // Por qué se cerró la app la última vez (3.61.5, lo dice Android): el Diagnóstico del móvil lo enseña.
    // Y lo que la APK sabe de la tablet (3.63.0: versión, si graba, permisos, memoria), que escribe cada pocos segundos.
    estadoExtra: () => ({ salida: String(env.LECTOR_ULTIMA_SALIDA ?? '').slice(0, 500) || null, tablet: leerSaludDeLaApk(join(env.LECTOR_CASA || '.', 'salud.json')), ...(soloRef ? { solo: soloRef.resumen() } : {}) }),
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
  const subir = () => subirLoDeLaTablet({ partidas, clave: ajustes.delMovil()?.clave, config: leerComunidad([bajados, join(aqui, '..', '..', 'datos')]) })
    .then((r) => { if (r.subidas) registrar(`Sin móvil: ${r.subidas} partidas subidas a la base de datos.`); else if (r.error) registrar(`Sin móvil: no se pudieron subir las partidas (${r.error}).`); })
    .catch(() => {});
  const solo = crearSolo({
    interno: servidor.interno, ajustes, datosPara: datosDelSolo(leerDatos), registrar,
    apuntar: (p) => { if (partidas.apuntar(p)) subir(); },
    maestriaDe: () => { const m = ajustes.delMovil(); return maestriaEfectiva(m?.maestria ?? {}, partidas.todas().filter((p) => p.t > (m?.cuando ?? 0))); },
  });
  const cadaSubida = setInterval(subir, 10 * 60 * 1000);
  servidor.on('close', () => clearInterval(cadaSubida));
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

if (process.env.LECTOR_INTERNO && process.argv[1]?.endsWith('en-tablet.mjs')) await principal();
