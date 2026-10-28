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
import { crearServidor, crearElectorDeCaptura, cargarLoAprendido, podarCapturas, sanearAjustes, PUERTO, VISTAZO_MS, ARREGLOS_POR_TANDA } from './servir.mjs';
import { limpiarTexto } from './voz.mjs';
import { leerCrudo, escribirPngRapido } from './png.mjs';
import { crearSolo, leerAjustesSolo, ajustesEfectivos, datosDelSolo } from './solo.mjs';
import { sanearConfig, claveDeJugadorValida, crearClaveDeJugador, subirPartidas, subirParte, subirRecorte, traerMisPartidas, bajarMisRecortes } from '../../src/app/basedatos.js';
import { maestriaEfectiva } from '../../src/motor/maestria.js';
import { tusNumeros, tuSemana } from '../../src/motor/habitos.js';

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
      sinResultado: Array.isArray(j?.sinResultado) ? j.sinResultado.filter((p) => p && Number.isFinite(p.t) && typeof p.pick === 'string' && p.gane === undefined) : [],
    };
  } catch { datos = { partidas: [], subidas: [], sinResultado: [] }; }
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
    /**
     * Las partidas de las que no se supo cómo acabaron (3.81.5): no reconoció
     * la tabla y no contestaste a tiempo. Antes se tiraban («se queda sin
     * apuntar»): el 27 de octubre de 2026, unas 20 en una tarde. Se guardan
     * con su draft, sin `gane`, no se suben y salen en «Mis partidas» para que
     * digas el resultado cuando quieras (`editar`).
     */
    guardarSinResultado(p) {
      if (!p || !Number.isFinite(p.t) || typeof p.pick !== 'string' || datos.partidas.some((x) => x.t === p.t) || datos.sinResultado.some((x) => x.t === p.t)) return false;
      const { gane, ...sin } = p;
      datos.sinResultado = [sin, ...datos.sinResultado].sort((a, b) => b.t - a.t).slice(0, TOPE_SIN_RESULTADO);
      escribir();
      return true;
    },
    sinResultado: () => datos.sinResultado,
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
    /**
     * Lo arreglado en el MÓVIL (3.76.0): si la copia de la base de datos se
     * arregló después que la de aquí y la de aquí ya está subida, manda la de
     * allí (con lo que solo sabe la tablet: de qué draft es y cómo se supo el
     * resultado). Cuántas se cambiaron.
     */
    alDiaCon(deLaBase) {
      const subidas = new Set(datos.subidas);
      const editadaDe = (p) => (Number.isFinite(p?.editada) ? p.editada : 0);
      let cambiadas = 0;
      datos.partidas = datos.partidas.map((p) => {
        const b = deLaBase.get(p.t);
        if (!b || !subidas.has(p.t) || editadaDe(b) <= editadaDe(p) || typeof b.pick !== 'string' || typeof b.gane !== 'boolean') return p;
        cambiadas += 1;
        return { ...b, ...(p.desde != null ? { desde: p.desde } : {}), ...(p.resultadoDe ? { resultadoDe: p.resultadoDe } : {}) };
      });
      if (cambiadas) escribir();
      return cambiadas;
    },
    /**
     * Lo que arreglas en «Mis partidas» de la APK (3.75.0): resultado, tu
     * pick, enemigos, compañeros y baneos, ya validados. Se vuelve a subir
     * (la base de datos la reemplaza por su instante). Si la partida solo
     * estaba en la base de datos, `base` es su copia y se trae. Con otro
     * pick, la estimación (de otro héroe) se quita. null si no existe.
     */
    editar(t, cambios, base = null) {
      let i = datos.partidas.findIndex((p) => p.t === t);
      // Una sin resultado pasa a ser partida en cuanto dices cómo acabó (3.81.5).
      const sin = i < 0 ? datos.sinResultado.find((p) => p.t === t) : null;
      if (sin) {
        if (typeof cambios.gane !== 'boolean') return null;
        datos.sinResultado = datos.sinResultado.filter((p) => p.t !== t);
        datos.partidas = [{ ...sin, gane: cambios.gane }, ...datos.partidas].sort((a, b) => b.t - a.t).slice(0, TOPE_PARTIDAS_TABLET);
        const hecho = this.editar(t, cambios);
        return hecho && { ...hecho, antes: sin };
      }
      if (i < 0) {
        if (!base || base.t !== t || typeof base.pick !== 'string' || typeof base.gane !== 'boolean') return null;
        datos.partidas = [base, ...datos.partidas].sort((a, b) => b.t - a.t).slice(0, TOPE_PARTIDAS_TABLET);
        i = datos.partidas.findIndex((p) => p.t === t);
        if (i < 0) return null;
      }
      const antes = datos.partidas[i];
      const { supuesto, estimacion, modelo, ...resto } = antes;
      const otro = cambios.pick && cambios.pick !== antes.pick;
      const nueva = {
        ...resto,
        ...(cambios.pick ? { pick: cambios.pick } : supuesto ? { supuesto } : {}),
        ...(otro ? {} : { ...(estimacion != null ? { estimacion } : {}), ...(modelo != null ? { modelo } : {}) }),
        ...(typeof cambios.gane === 'boolean' ? { gane: cambios.gane } : {}),
        ...(cambios.bans ? { bans: cambios.bans } : {}),
        draft: { ...(antes.draft ?? {}), ...(cambios.enemigos ? { enemigos: cambios.enemigos } : {}), ...(cambios.aliados ? { aliados: cambios.aliados } : {}) },
        editada: Date.now(),
      };
      datos.partidas[i] = nueva;
      datos.subidas = datos.subidas.filter((x) => x !== t);
      escribir();
      return { antes, nueva };
    },
  };
}

/** Las partidas sin resultado que se guardan para contestarlas después (3.81.5): las de unos días de juego. */
export const TOPE_SIN_RESULTADO = 50;
/** Las partidas que enseña «Mis partidas» de la APK (3.75.0): las más nuevas. */
export const PARTIDAS_EN_LA_APK = 200;

/**
 * Lo que se puede cambiar de una partida desde la APK, saneado (3.75.0):
 * solo héroes del catálogo (en su grafía), sin repetir dentro del draft, y
 * como mucho cinco enemigos, cuatro compañeros y diez baneos. `{ t, cambios }`
 * o `{ error }`.
 */
export function sanearEdicion(cuerpo, nombres) {
  if (!cuerpo || !Number.isFinite(cuerpo.t)) return { error: 't' };
  const porClave = new Map(nombres.map((n) => [n.toLowerCase(), n]));
  const heroe = (x) => (typeof x === 'string' && x.trim() ? porClave.get(x.trim().toLowerCase()) ?? false : null);
  const lista = (l, max) => {
    if (l == null) return undefined;
    if (!Array.isArray(l) || l.length > max) return false;
    const h = l.map(heroe).filter((x) => x !== null);
    return h.includes(false) ? false : h;
  };
  const cambios = {};
  if (cuerpo.gane === true || cuerpo.gane === false) cambios.gane = cuerpo.gane;
  else if (cuerpo.gane !== undefined) return { error: 'gane' };
  if (cuerpo.pick !== undefined) { const p = heroe(cuerpo.pick); if (!p) return { error: 'pick' }; cambios.pick = p; }
  for (const [k, max] of [['enemigos', 5], ['aliados', 4], ['bans', 10]]) {
    const l = lista(cuerpo[k], max);
    if (l === false) return { error: k };
    if (l) cambios[k] = l;
  }
  const enDraft = [...(cambios.enemigos ?? []), ...(cambios.aliados ?? []), ...(cambios.pick ? [cambios.pick] : [])];
  if (new Set(enDraft).size !== enDraft.length) return { error: 'repetidos' };
  if (!Object.keys(cambios).length) return { error: 'nada' };
  return { t: cuerpo.t, cambios };
}

/**
 * Sube a la base de datos de partidas lo que la tablet apuntó y no subió
 * (3.70.0), con TU clave (la que manda la app si tienes «Guardar mis
 * partidas» puesto) o, sin ella, la del lector (3.74.6), y la dirección y la
 * clave pública de `comunidad.json`.
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
/**
 * «Tu semana» (3.79.0) para «Mis partidas», el mismo cálculo que en el móvil
 * (`tuSemana`), ya en el JSON que lee Partidas.kt; null sin partidas esta semana.
 */
export function semanaParaLaApk(partidas, ahora = Date.now()) {
  const s = tuSemana(partidas, { ahora });
  if (!s.n) return null;
  return {
    n: s.n, ganadas: s.ganadas, wr: s.wr,
    anterior: s.anterior ? { n: s.anterior.n, wr: s.anterior.wr, dif: s.anterior.dif, seVe: !!s.anterior.seVe } : null,
    funcionan: s.funcionan, cuestan: s.cuestan, numeroUno: s.numeroUno,
  };
}

/** Lo que admite `subir_recorte` (120 KB): cada captura recortada son unos 45 mil caracteres. */
export const TOPE_RECORTE_BYTES = 118000;
/**
 * Lo que se sube de un draft con héroes sin reconocer (3.81.0): las diez
 * caras de una o dos capturas (sin nombres de jugadores: `recortes.mjs`) y lo
 * leído hueco a hueco, con el instante de la partida para cruzarlo con su
 * draft bueno. Solo nombres de héroes, números e imágenes de caras: ni la
 * clave, ni la IP, ni el código. null si no hay nada que subir.
 */
export function recorteParaSubir({ correccion, recortes, version = null }) {
  const nombres = (l) => (Array.isArray(l) ? l.slice(0, 10).map((n) => (typeof n === 'string' ? n.slice(0, 40) : null)) : []);
  const hueco = (l) => ({ nombre: typeof l?.nombre === 'string' ? l.nombre.slice(0, 40) : null, candidato: typeof l?.candidato === 'string' ? l.candidato.slice(0, 40) : null, parecido: Number.isFinite(l?.parecido) ? l.parecido : 0 });
  const capturas = (Array.isArray(recortes) ? recortes : [])
    .filter((r) => typeof r?.id === 'string' && /^lectura-[\w-]+$/.test(r.id) && typeof r.picks === 'string' && /^[A-Za-z0-9+/=]+$/.test(r.picks))
    .slice(0, 2)
    .map((r) => ({ id: r.id, picks: r.picks, enemigos: (r.enemigos ?? []).slice(0, 5).map(hueco), aliados: (r.aliados ?? []).slice(0, 5).map(hueco), tuyoFila: Number.isInteger(r.tuyoFila) ? r.tuyoFila : -1 }));
  if (!capturas.length || !Number.isFinite(correccion?.partida)) return null;
  const l = correccion.leidos ?? {};
  const recorte = {
    v: 1, version: typeof version === 'string' ? version : null, partida: correccion.partida, desde: Number.isFinite(correccion.cuando) ? correccion.cuando : null,
    faltan: Number.isInteger(correccion.faltan) ? correccion.faltan : null,
    leidos: { enemigos: nombres(l.enemigos), aliados: nombres(l.aliados), tuyoFila: Number.isInteger(l.tuyoFila) ? l.tuyoFila : -1, baneos: nombres(l.baneos) },
    capturas,
  };
  // Si las dos no caben, va la primera (la que más leía).
  while (Buffer.byteLength(JSON.stringify(recorte)) > TOPE_RECORTE_BYTES && recorte.capturas.length > 1) recorte.capturas.pop();
  return Buffer.byteLength(JSON.stringify(recorte)) > TOPE_RECORTE_BYTES ? null : recorte;
}

/** Cada cuánto mira la tablet lo que arreglaste en el historial (3.83.0), y cuántos días de recortes. */
export const ARREGLOS_CADA_MS = 6 * 60 * 60 * 1000;
export const DIAS_DE_RECORTES = 30;
/** Las capturas de un draft son de antes de apuntar su partida, y de no mucho antes (3.83.0). */
export const HORAS_ANTES_DE_LA_PARTIDA = 3;

/** El instante de una captura por su nombre (`lectura-2026-10-27T22-20-00-000Z-1`), o NaN. */
const instanteDeCaptura = (id) => Date.parse(String(id).slice(8, 32).replace(/T(\d\d)-(\d\d)-(\d\d)-(\d+)Z$/, 'T$1:$2:$3.$4Z'));

/**
 * Lo que arreglaste en el historial, para aprender (3.83.0). Un recorte
 * (subido porque el draft dejó a alguien sin leer) cuya partida tiene hoy el
 * draft ENTERO (cinco rivales y cuatro compañeros) es un draft que completó
 * una persona: la tablet sola no lo habría dejado así. Lo que la tablet leyó
 * por su cuenta NUNCA es la verdad (aprender de sus propias lecturas está
 * descartado). Solo nombres del catálogo; tu pick solo si no es el nº1
 * supuesto. `hechos`: claves ya aprendidas (`t:id`), que no se repiten.
 * Devuelve `[{ clave, partida, capturas, verdad }]`.
 */
export function draftsArreglados({ recortes = [], partidas = [], nombres = [], hechos = [] } = {}) {
  const delCatalogo = new Map(nombres.map((n) => [String(n).toLowerCase(), n]));
  const bien = (l) => (Array.isArray(l) ? l.map((n) => (typeof n === 'string' ? delCatalogo.get(n.toLowerCase()) : null)) : []);
  const porT = new Map((Array.isArray(partidas) ? partidas : []).filter((p) => Number.isFinite(p?.t) && p.draft).map((p) => [p.t, p]));
  const ya = new Set(hechos);
  const salida = [];
  for (const fila of Array.isArray(recortes) ? recortes : []) {
    const d = fila?.d ?? fila;
    if (!d || typeof d !== 'object' || d.tipo === 'final' || !Array.isArray(d.capturas)) continue;
    const p = porT.get(d.partida);
    if (!p) continue;
    const enemigos = bien(p.draft.enemigos), aliados = bien(p.draft.aliados);
    if (enemigos.length !== 5 || aliados.length !== 4 || [...enemigos, ...aliados].some((n) => !n)) continue;
    // Capturas con nombre corto y de las horas antes de esa partida: una de otro momento no es de ese draft.
    const capturas = d.capturas.filter((c) => typeof c?.id === 'string' && /^lectura-[\w-]{1,80}$/.test(c.id) && typeof c.picks === 'string'
      && instanteDeCaptura(c.id) <= p.t + 5 * 60000 && instanteDeCaptura(c.id) >= p.t - HORAS_ANTES_DE_LA_PARTIDA * 3600000);
    const clave = `${p.t}:${capturas.map((c) => c.id).join(',')}`;
    if (!capturas.length || ya.has(clave)) continue;
    const tuyo = p.supuesto ? null : bien([p.pick])[0] ?? null;
    salida.push({ clave, partida: p.t, capturas, verdad: { enemigos, aliados, tuyo } });
    ya.add(clave);
  }
  return salida;
}

/**
 * Las pantallas del final de una partida cuyo resultado no se reconoció
 * (3.81.5), para ver qué pinta la tablet ahí: las dos primeras sin marcador
 * (fuera de partida) después de la última con él, que es donde sale
 * VICTORIA/DERROTA; si no hay ninguna con marcador, las dos últimas sin él.
 * La miniatura (160 px) y la franja de arriba (320 px), donde los nombres de
 * los jugadores no se leen. Va a la tabla de los recortes con `tipo: 'final'`.
 * null si no hay nada que subir.
 */
export function finalParaSubir({ desde, motivo = '', fotogramas = [], version = null }) {
  const b64 = (x) => typeof x === 'string' && x.length > 0 && /^[A-Za-z0-9+/=]+$/.test(x);
  const validas = (Array.isArray(fotogramas) ? fotogramas : []).filter((f) => typeof f?.id === 'string' && /^fotograma-[\w-]+$/.test(f.id) && b64(f.miniatura));
  const ultimaEnPartida = validas.map((f) => !!f.marcador).lastIndexOf(true);
  const fuera = validas.filter((f, i) => !f.marcador && i > ultimaEnPartida);
  const elegidas = (fuera.length ? fuera.slice(0, 2) : validas.filter((f) => !f.marcador).slice(-2));
  if (!elegidas.length || !Number.isFinite(desde)) return null;
  const recorte = {
    v: 1, tipo: 'final', version: typeof version === 'string' ? version : null, desde, motivo: String(motivo).slice(0, 80),
    capturas: elegidas.map((f) => ({ id: f.id, minuto: Number.isFinite(f.minuto) ? f.minuto : null, miniatura: f.miniatura, ...(b64(f.tira) ? { tira: f.tira } : {}), tabla: !!f.tabla, parecido: Number.isFinite(f.resultadoParecido) ? f.resultadoParecido : null })),
  };
  while (Buffer.byteLength(JSON.stringify(recorte)) > TOPE_RECORTE_BYTES && recorte.capturas.length > 1) recorte.capturas.pop();
  return Buffer.byteLength(JSON.stringify(recorte)) > TOPE_RECORTE_BYTES ? null : recorte;
}

export function parteDeSalud({ estado, log = '', falloNodo = null, secretos = [], ahora = Date.now() }) {
  const parte = {
    v: 1, cuando: ahora,
    estado,
    ...(falloNodo ? { falloNodo: lineasLimpias(falloNodo, { secretos, max: 30 }).join('\n') } : {}),
    errores: lineasLimpias(log, { secretos, max: ERRORES_DEL_PARTE, solo: LINEA_DE_ERROR }),
    log: lineasLimpias(log, { secretos }),
  };
  const mide = () => Buffer.byteLength(JSON.stringify(parte));
  // Quitar líneas viejas del registro es lo normal (van largas); `recortado` solo si se pierde el fallo o errores (3.74.5).
  while (mide() > TOPE_PARTE_BYTES && parte.log.length) parte.log.shift();
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

// `pedirBaseDeDatos`: el fetch de la base de datos, inyectable (3.74.6: las pruebas a la vez no pueden cambiar el global).
export async function principal(env = process.env, { pedirBaseDeDatos = globalThis.fetch } = {}) {
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
  // «Mis partidas» de la APK (3.75.0): las partidas se crean después.
  let historialRef = null;
  // La clave con la que sube (3.76.0), para dársela al móvil vinculado.
  let claveRef = null;
  // Lo que la APK enseña de cómo va la tablet (3.73.1): de cuándo son sus datos y si sus partidas suben.
  let estadoTablet = () => ({});
  const servidor = crearServidor({
    alCorregir: (c) => alCorregirRef?.(c),
    historial: { listar: () => historialRef?.listar() ?? { partidas: [] }, editar: (c) => historialRef?.editar(c) ?? { ok: false, estado: 503 } },
    claveDeLaTablet: () => claveRef?.() ?? null,
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
  const claveConLaQueSube = () => { const tuya = ajustes.delMovil()?.clave; return claveDeJugadorValida(tuya) ? tuya : claveDelLector(casa); };
  const subir = () => {
    if (subiendo) return subiendo;
    // Con tu clave si el móvil la mandó; si no, con la del lector (3.74.6, decidido por Javi: «la 2»):
    // así cuentan para medir el modelo, aunque no salgan en Pick Assist del móvil.
    const clave = claveConLaQueSube();
    const config = leerComunidad([bajados, join(aqui, '..', '..', 'datos')]);
    subiendo = subirLoDeLaTablet({ partidas, clave, config, fetch: pedirBaseDeDatos })
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
      partidas: { apuntadas: partidas.todas().length, sinSubir: partidas.pendientes().length, porTabla: partidas.todas().filter((p) => p.resultadoDe === 'tabla').length, porPregunta: partidas.todas().filter((p) => p.resultadoDe === 'pregunta').length, sinResultado: partidas.sinResultado().length, clave: claveDeJugadorValida(claveConLaQueSube()), deQuien: claveDeJugadorValida(ajustes.delMovil()?.clave) ? 'tuya' : 'lector', error: ultimaSubida.error },
    };
  };
  const solo = crearSolo({
    interno: servidor.interno, ajustes, datosPara: datosDelSolo(leerDatos), registrar,
    apuntar: (p) => { if (partidas.apuntar(p)) subir(); },
    alCorregir: (c) => alCorregirRef?.(c),
    numerosDe: () => tusNumeros(partidas.todas()),
    guardarSinResultado: (p) => partidas.guardarSinResultado(p),
    alFinalSinLeer: (f) => { subirFinalDe(f).catch((e) => registrar(`Subir las pantallas del final: no se pudo (${e.message}).`)); },
    alSinLeer: (c) => { subirRecortesDe(c).catch((e) => registrar(`Subir los recortes del draft: no se pudo (${e.message}).`)); },
    maestriaDe: () => { const m = ajustes.delMovil(); return maestriaEfectiva(m?.maestria ?? {}, partidas.todas().filter((p) => p.t > (m?.cuando ?? 0))); },
  });
  alCorregirRef = ({ partida, enemigos, aliados, tuyo }) => {
    if (Number.isFinite(partida) && partidas.corregir(partida, { enemigos, aliados, tuyo })) { registrar('Sin móvil: la partida apuntada lleva ya los héroes que dijiste.'); subir(); }
  };
  // Los recortes de un draft con héroes sin reconocer (3.81.0), con la clave del lector como los partes: para medir el lector.
  // Cada salida deja su línea (3.81.2) y la devuelve: sin ella, «no llegan recortes» no tenía dónde mirarse.
  // Las de fallo dicen «no se pudo», que es lo que `LINEA_DE_ERROR` lleva a los errores del parte.
  const subirRecortesDe = async (correccion) => {
    const decir = (m) => { registrar(m); return m; };
    const clave = claveDelLector(casa);
    const config = leerComunidad([bajados, join(aqui, '..', '..', 'datos')]);
    if (!claveDeJugadorValida(clave) || !config) return decir(`Subir los recortes del draft: no se pudo (${config ? 'sin clave del lector' : 'sin comunidad.json'}).`);
    const recortes = await servidor.interno.recortesDe(correccion?.ids);
    const recorte = recorteParaSubir({ correccion, recortes, version: servidor.interno.estado()?.version });
    if (!recorte) return decir(`Subir los recortes del draft: no se pudo (${recortes.length ? 'no caben o sin la partida' : 'ninguna captura del draft se pudo recortar'}).`);
    const r = await subirRecorte({ config, clave, recorte }, { fetch: pedirBaseDeDatos });
    return decir(r.error ? `Subir los recortes del draft: no se pudo (${r.error}).` : `Recortes del draft subidos para medir el lector (${recorte.capturas.length} capturas, ${recorte.faltan} sin reconocer).`);
  };
  servidor.subirRecortesDe = subirRecortesDe;
  // Las pantallas del final sin reconocer (3.81.5), por el mismo camino y con la misma clave que los recortes.
  const subirFinalDe = async (f) => {
    const decir = (m) => { registrar(m); return m; };
    const clave = claveDelLector(casa);
    const config = leerComunidad([bajados, join(aqui, '..', '..', 'datos')]);
    if (!claveDeJugadorValida(clave) || !config) return decir(`Subir las pantallas del final: no se pudo (${config ? 'sin clave del lector' : 'sin comunidad.json'}).`);
    const recorte = finalParaSubir({ ...f, version: servidor.interno.estado()?.version });
    if (!recorte) return decir('Subir las pantallas del final: no se pudo (ninguna pantalla fuera de la partida).');
    const r = await subirRecorte({ config, clave, recorte }, { fetch: pedirBaseDeDatos });
    return decir(r.error ? `Subir las pantallas del final: no se pudo (${r.error}).` : `Pantallas del final subidas para ver por qué no se reconoció (${recorte.capturas.length}).`);
  };
  servidor.subirFinalDe = subirFinalDe;
  // Aprender de lo que arreglas en el historial (3.83.0): los recortes de los
  // drafts que no leyó enteros, con la verdad que pusiste (en el móvil o en la
  // tablet). Lo ya aprendido queda en `arreglos.json` y no se repite.
  const aprenderDeLoArreglado = async () => {
    const decir = (m) => { registrar(m); return m; };
    const config = leerComunidad([bajados, join(aqui, '..', '..', 'datos')]);
    const clave = claveConLaQueSube();
    if (!config || !claveDeJugadorValida(clave)) return decir(`Aprender de lo arreglado: no se pudo (${config ? 'sin clave' : 'sin comunidad.json'}).`);
    // Solo los recortes de ESTA tablet (subidos con la clave del lector): los de todos los demás, no.
    const [r, m] = await Promise.all([bajarMisRecortes(config, { clave: claveDelLector(casa), horas: DIAS_DE_RECORTES * 24, fetch: pedirBaseDeDatos }), traerMisPartidas({ config, clave }, { fetch: pedirBaseDeDatos })]);
    if (r.error || m.error) return decir(`Aprender de lo arreglado: no se pudo (${r.error ?? m.error}).`);
    const fichero = join(casa, 'arreglos.json');
    let hechos = [];
    try { const j = JSON.parse(readFileSync(fichero, 'utf8')); if (Array.isArray(j?.hechos)) hechos = j.hechos.filter((x) => typeof x === 'string'); } catch { /* primera vez */ }
    const nombres = (leerDatos().catalogo?.heroes ?? []).map((h) => h.name).filter(Boolean);
    const drafts = draftsArreglados({ recortes: r.recortes, partidas: m.partidas, nombres, hechos });
    if (!drafts.length) return null;
    const tanda = drafts.slice(0, ARREGLOS_POR_TANDA);
    const hecho = await servidor.interno.aprenderDeArreglos(tanda);
    try { writeFileSync(`${fichero}.tmp`, JSON.stringify({ hechos: [...hechos, ...tanda.map((d) => d.clave)].slice(-500) })); renameSync(`${fichero}.tmp`, fichero); } catch { /* sin disco: se repetirá */ }
    return decir(`Aprendido de ${hecho.mirados} drafts que arreglaste${hecho.aprendidos.length ? `: ${[...new Set(hecho.aprendidos)].join(', ')}` : ' (nada nuevo que no supiera)'}.`);
  };
  servidor.aprenderDeLoArreglado = aprenderDeLoArreglado;
  const cadaArreglo = setInterval(() => { aprenderDeLoArreglado().catch((e) => registrar(`Aprender de lo arreglado: no se pudo (${e.message}).`)); }, ARREGLOS_CADA_MS);
  const primerArreglo = setTimeout(() => { aprenderDeLoArreglado().catch((e) => registrar(`Aprender de lo arreglado: no se pudo (${e.message}).`)); }, 5 * 60 * 1000);
  servidor.on('close', () => { clearInterval(cadaArreglo); clearTimeout(primerArreglo); });
  // El parte de salud (3.74.0): para que la revisión automática vea cómo va la tablet sin que nadie copie nada.
  const subirSuParte = async () => {
    const clave = claveDelLector(casa);
    const config = leerComunidad([bajados, join(aqui, '..', '..', 'datos')]);
    if (!claveDeJugadorValida(clave) || !config) return;
    const leer = (f) => { try { return readFileSync(join(casa, f), 'utf8'); } catch { return null; } };
    const parte = parteDeSalud({ estado: servidor.interno.estado(), log: (leer('lector.log') ?? '').slice(-FINAL_DEL_REGISTRO_BYTES), falloNodo: leer('fallo-nodo.txt'), secretos: [codigo, clave, ajustes.delMovil()?.clave] });
    const r = await subirParte({ config, clave, parte }, { fetch: pedirBaseDeDatos });
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
  // «Mis partidas» de la APK (3.75.0): lo que dice la base de datos, con lo que
  // la tablet aún no subió por encima, y arreglarlas desde ahí.
  let deLaBase = new Map();
  const listarPartidas = async () => {
    const config = leerComunidad([bajados, join(aqui, '..', '..', 'datos')]);
    const clave = claveConLaQueSube();
    const r = config && claveDeJugadorValida(clave) ? await traerMisPartidas({ config, clave }, { fetch: pedirBaseDeDatos }).catch(() => ({ error: 'red' })) : { error: 'sinBaseDeDatos' };
    if (!r.error) {
      deLaBase = new Map(r.partidas.filter((p) => Number.isFinite(p?.t)).map((p) => [p.t, p]));
      // Lo arreglado en el móvil llega también a lo que guarda la tablet (decide con ello: maestría).
      const n = partidas.alDiaCon(deLaBase);
      if (n) registrar(`${n} partidas arregladas en el móvil, al día en la tablet.`);
    }
    const sinSubir = new Set(partidas.pendientes().map((p) => p.t));
    // `supuesto` (el nº1 apuntado sin tu fila leída) no viajaba a la base de
    // datos hasta 3.81.2: con la copia de allí de una subida de antes, «Tu
    // semana» lo contaba como «cogiste el nº1». Lo pone la copia de la tablet
    // mientras el pick siga siendo el mismo.
    const locales = new Map(partidas.todas().map((p) => [p.t, p]));
    const todas = new Map([...deLaBase].map(([t, b]) => [t, locales.get(t)?.supuesto && locales.get(t).pick === b.pick ? { ...b, supuesto: true } : b]));
    for (const p of partidas.todas()) if (sinSubir.has(p.t) || !todas.has(p.t)) todas.set(p.t, { ...p, sinSubir: sinSubir.has(p.t) });
    // Las sin resultado (3.81.5) van en la lista, para decir cómo acabaron; no en los números (no tienen resultado).
    const lista = [...partidas.sinResultado().map((p) => ({ ...p, sinResultado: true })), ...todas.values()].sort((a, b) => b.t - a.t).slice(0, PARTIDAS_EN_LA_APK).map((p) => ({
      t: p.t, pick: p.pick, ...(typeof p.gane === 'boolean' ? { gane: p.gane } : {}), ...(p.sinResultado ? { sinResultado: true } : {}), ...(p.supuesto ? { supuesto: true } : {}), ...(p.sinSubir ? { sinSubir: true } : {}),
      enemigos: p.draft?.enemigos ?? [], aliados: p.draft?.aliados ?? [], bans: p.bans ?? [], linea: p.draft?.linea ?? null,
      ...(Number.isFinite(p.duracion) ? { duracion: p.duracion } : {}), ...(p.resultadoDe ? { resultadoDe: p.resultadoDe } : {}), ...(p.editada ? { editada: true } : {}),
    }));
    // «Tus números» (3.77.0), con TODAS (no solo las 200 que se enseñan): racha, hoy, tras perder y tus héroes.
    const n = tusNumeros([...todas.values()]);
    const numeros = n.n ? {
      n: n.n, wr: n.wr, racha: n.racha, sesion: n.sesion,
      trasPerder: n.trasPerder ? { wr: n.trasPerder.wr, n: n.trasPerder.n, wrResto: n.trasPerder.wrResto, nResto: n.trasPerder.nResto, seVe: !!n.trasPerder.seVe, dif: n.trasPerder.dif } : null,
      heroes: n.heroes.filter((h) => h.lado).slice(0, 6).map((h) => ({ heroe: h.heroe, wr: h.wr, n: h.n, lado: h.lado })),
    } : null;
    return { de: r.error ? 'tablet' : 'base', error: r.error ?? null, numeros, semana: semanaParaLaApk([...todas.values()]), partidas: lista, heroes: (leerDatos().catalogo?.heroes ?? []).map((h) => h.name).filter(Boolean).sort() };
  };
  const editarPartida = (cuerpo) => {
    const nombres = (leerDatos().catalogo?.heroes ?? []).map((h) => h.name).filter(Boolean);
    const e = sanearEdicion(cuerpo, nombres);
    if (e.error) return { ok: false, estado: 400, error: e.error };
    const hecho = partidas.editar(e.t, e.cambios, deLaBase.get(e.t) ?? null);
    if (!hecho) return { ok: false, estado: 404, error: 'no existe' };
    // Si arreglaste el resultado y quedan las pantallas del final, se aprende la tabla buena.
    const aprendidos = typeof e.cambios.gane === 'boolean' && e.cambios.gane !== hecho.antes.gane ? servidor.interno.aprenderResultadoDe(hecho.antes.desde, e.cambios.gane) : 0;
    registrar(`Partida arreglada en la tablet (${Object.keys(e.cambios).join(', ')})${aprendidos ? '; aprendida la tabla del final' : ''}.`);
    subir();
    return { ok: true, aprendidos };
  };
  historialRef = { listar: listarPartidas, editar: editarPartida };
  claveRef = () => { const c = claveConLaQueSube(); return claveDeJugadorValida(c) ? c : null; };
  servidor.partidas = partidas;
  servidor.subirPartidas = subir;
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
