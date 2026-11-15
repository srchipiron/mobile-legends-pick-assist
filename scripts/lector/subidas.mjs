/**
 * Lo que sale de la tablet a la base de datos de Javi (supabase/esquema.sql),
 * y siempre limpio: el parte de salud sin IPs ni secretos, los recortes de un
 * draft sin los nombres de los jugadores, las pantallas del final y el
 * comprobante con todo lo de debajo de la cabecera en negro. Y lo que vuelve:
 * los drafts que arreglaste, para aprender. Puro salvo la clave del lector.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomBytes } from 'node:crypto';
import { claveDeJugadorValida, crearClaveDeJugador } from '../../src/comun/basedatos.js';
import { leerPng, escribirPng } from './png.mjs';
import { limpiarTexto } from './acceso.mjs';
import { instanteDeCaptura, ID_DE_LECTURA } from './capturas.mjs';

/** [D] El parte: cada 15 min (el servidor admite uno cada 4), con sus últimas 60 líneas y 10 errores, en 12.000 bytes (el servidor, 16.000). */
export const PARTE_CADA_MS = 15 * 60 * 1000;
export const LINEAS_DEL_PARTE = 60;
export const ERRORES_DEL_PARTE = 10;
export const TOPE_PARTE_BYTES = 12000;
/** [D] Del registro solo se lee el final. */
export const FINAL_DEL_REGISTRO_BYTES = 256 * 1024;
/** [C] Las líneas del registro que son un error (la revisión de la tablet usa la misma). */
export const LINEA_DE_ERROR = /ERROR sin recoger|No se pudo|no se pudo|fallaron|SyntaxError|TypeError|ReferenceError|RangeError|ENOSPC/;
/** [C] Lo que admite `subir_recorte` (120.000) con margen. */
export const TOPE_RECORTE_BYTES = 118000;
/** [D] Aprender de lo arreglado: cada 6 h, con los recortes de 30 días, de capturas de las 3 h antes de su partida. */
export const ARREGLOS_CADA_MS = 6 * 60 * 60 * 1000;
export const DIAS_DE_RECORTES = 30;
export const HORAS_ANTES_DE_LA_PARTIDA = 3;
/** [M] La cabecera de la tabla (marcador y VICTORY/DEFEAT) son las filas 0–33 de 56; debajo van los nombres de los otros nueve. */
export const FRACCION_CABECERA = 34 / 56;

const b64 = (x) => typeof x === 'string' && x.length > 0 && /^[A-Za-z0-9+/=]+$/.test(x);
const cabe = (x) => Buffer.byteLength(JSON.stringify(x)) <= TOPE_RECORTE_BYTES;

/** Las líneas del registro limpias para salir: sin control, sin IP v4 ni v6 (`[ip]`), sin el código ni las claves (`[oculto]`), ≤300. */
export function lineasLimpias(texto, { secretos = [], max = LINEAS_DEL_PARTE, solo = null } = {}) {
  const tapar = secretos.filter((x) => typeof x === 'string' && x.length >= 8);
  return String(texto ?? '').split('\n').filter((l) => l.trim() && (!solo || solo.test(l))).slice(-max).map((l) => {
    let x = limpiarTexto(l).replace(/\b\d{1,3}(?:\.\d{1,3}){3}\b/g, '[ip]');
    // IPv6: comprimida (`::`) o entera (ocho grupos); una hora «12:52:10» no es ninguna de las dos.
    x = x.replace(/(?:[0-9a-f]{0,4}:){2,7}[0-9a-f]{0,4}/gi, (m) => (m.includes('::') || m.split(':').length === 8 ? '[ip]' : m));
    for (const sec of tapar) x = x.split(sec).join('[oculto]');
    return x.slice(0, 300);
  });
}

/** El parte de salud: `/estado`, el fallo de Node, los errores y el final del registro, limpios; cabe en el tope (y `recortado` si se pierde algo que no sea registro viejo). */
export function parteDeSalud({ estado, log = '', falloNodo = null, secretos = [], ahora = Date.now() }) {
  const parte = {
    v: 1, cuando: ahora, estado,
    ...(falloNodo ? { falloNodo: lineasLimpias(falloNodo, { secretos, max: 30 }).join('\n') } : {}),
    errores: lineasLimpias(log, { secretos, max: ERRORES_DEL_PARTE, solo: LINEA_DE_ERROR }),
    log: lineasLimpias(log, { secretos }),
  };
  const mide = () => Buffer.byteLength(JSON.stringify(parte));
  while (mide() > TOPE_PARTE_BYTES && parte.log.length) parte.log.shift();
  if (mide() > TOPE_PARTE_BYTES && parte.falloNodo) { parte.falloNodo = parte.falloNodo.slice(0, 2000); parte.recortado = true; }
  while (mide() > TOPE_PARTE_BYTES && parte.errores.length) { parte.errores.shift(); parte.recortado = true; }
  return parte;
}

/**
 * Los recortes de un draft que dejó a alguien sin leer (para medir el lector):
 * las diez caras de una o dos capturas, sin nombres de jugadores, lo leído y
 * el instante de su partida. Si no caben las dos, la última. null si nada.
 */
export function recorteParaSubir({ correccion, recortes, version = null }) {
  const nombres = (l) => (Array.isArray(l) ? l.slice(0, 10).map((n) => (typeof n === 'string' ? n.slice(0, 40) : null)) : []);
  const hueco = (l) => ({ nombre: typeof l?.nombre === 'string' ? l.nombre.slice(0, 40) : null, candidato: typeof l?.candidato === 'string' ? l.candidato.slice(0, 40) : null, parecido: Number.isFinite(l?.parecido) ? l.parecido : 0 });
  const capturas = (Array.isArray(recortes) ? recortes : [])
    .filter((r) => typeof r?.id === 'string' && ID_DE_LECTURA.test(r.id) && b64(r.picks))
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
  while (!cabe(recorte) && recorte.capturas.length > 1) recorte.capturas.shift();
  return cabe(recorte) ? recorte : null;
}

/** La partida sin resultado que va con las pantallas del final, con forma fija (lo que `apuntar` sabe guardar, sin `gane`). */
export function partidaSinResultado(p) {
  if (!p || typeof p !== 'object' || !Number.isFinite(p.t) || typeof p.pick !== 'string' || !p.pick || p.pick.length > 40) return null;
  const nombres = (l, n) => (Array.isArray(l) ? l.filter((x) => typeof x === 'string' && x && x.length <= 40).slice(0, n) : []);
  return {
    t: p.t, pick: p.pick, origen: 'lector',
    ...(p.supuesto === true ? { supuesto: true } : {}),
    ...(typeof p.rango === 'string' && p.rango.length <= 20 ? { rango: p.rango } : {}),
    recomendados: nombres(p.recomendados, 3),
    ...(typeof p.estimacion === 'number' && p.estimacion > 0 && p.estimacion < 1 ? { estimacion: p.estimacion, ...(Number.isInteger(p.modelo) ? { modelo: p.modelo } : {}) } : {}),
    ...(nombres(p.bans, 10).length ? { bans: nombres(p.bans, 10) } : {}),
    draft: { linea: typeof p.draft?.linea === 'string' && p.draft.linea.length <= 10 ? p.draft.linea : null, enemigos: nombres(p.draft?.enemigos, 5), aliados: nombres(p.draft?.aliados, 4) },
    ...(Number.isFinite(p.duracion) && p.duracion >= 3 && p.duracion <= 90 ? { duracion: p.duracion } : {}),
  };
}

/** La franja del final con todo lo de debajo de la cabecera en negro (los nombres de los otros nueve jugadores). null si no se puede. */
export function franjaSinNombres(base64) {
  try {
    const img = leerPng(Buffer.from(base64, 'base64'));
    const desde = Math.ceil(img.alto * FRACCION_CABECERA);
    const rgba = Uint8Array.from(img.rgba);
    for (let i = desde * img.ancho * 4; i < rgba.length; i += 4) { rgba[i] = 0; rgba[i + 1] = 0; rgba[i + 2] = 0; rgba[i + 3] = 255; }
    return Buffer.from(escribirPng({ ancho: img.ancho, alto: img.alto, rgba })).toString('base64');
  } catch { return null; }
}

/** El comprobante de una partida apuntada por la tabla: la franja de ESA tabla sin nombres, su `t` y lo leído. Sin `partida` (no es un draft). */
export function comprobanteParaSubir({ t, gane, fotograma, version = null }) {
  if (!Number.isFinite(t) || typeof gane !== 'boolean' || typeof fotograma?.id !== 'string' || !/^fotograma-[\w-]+$/.test(fotograma.id) || !b64(fotograma.tira)) return null;
  const tira = franjaSinNombres(fotograma.tira);
  if (!tira) return null;
  const recorte = { v: 1, tipo: 'resultado', version: typeof version === 'string' ? version : null, t, gane, parecido: Number.isFinite(fotograma.resultadoParecido) ? fotograma.resultadoParecido : null, capturas: [{ id: fotograma.id, tira }] };
  return cabe(recorte) ? recorte : null;
}

/**
 * Las pantallas del final de una partida que no se reconoció: la primera y la
 * última de la ráfaga; sin ráfaga, las dos primeras fuera de la partida tras
 * la última en partida (o las dos últimas fuera). Miniatura y franja sin
 * nombres, con la partida sin resultado. null si no hay ninguna.
 */
export function finalParaSubir({ desde, motivo = '', fotogramas = [], version = null, partida = null }) {
  const validas = (Array.isArray(fotogramas) ? fotogramas : []).filter((f) => typeof f?.id === 'string' && /^fotograma-[\w-]+$/.test(f.id) && b64(f.miniatura));
  const ultimaEnPartida = validas.map((f) => !!f.enPartida).lastIndexOf(true);
  const fuera = validas.filter((f, i) => !f.enPartida && i > ultimaEnPartida);
  const rafaga = validas.filter((f) => f.rafaga === true && !f.enPartida);
  const elegidas = rafaga.length ? [...new Set([rafaga[0], rafaga[rafaga.length - 1]])]
    : (fuera.length ? fuera.slice(0, 2) : validas.filter((f) => !f.enPartida).slice(-2));
  if (!elegidas.length || !Number.isFinite(desde)) return null;
  const sinResultado = partidaSinResultado(partida);
  const recorte = {
    v: 1, tipo: 'final', version: typeof version === 'string' ? version : null, desde, motivo: String(motivo).slice(0, 80),
    ...(sinResultado ? { partida: sinResultado } : {}),
    capturas: elegidas.map((f) => {
      const tira = b64(f.tira) ? franjaSinNombres(f.tira) : null;
      return { id: f.id, minuto: Number.isFinite(f.minuto) ? f.minuto : null, miniatura: f.miniatura, ...(tira ? { tira } : {}), tabla: !!f.tabla, ...(f.rafaga === true ? { rafaga: true } : {}), parecido: Number.isFinite(f.resultadoParecido) ? f.resultadoParecido : null };
    }),
  };
  while (!cabe(recorte) && recorte.capturas.length > 1) recorte.capturas.pop();
  return cabe(recorte) ? recorte : null;
}

/**
 * Los drafts que arreglaste en el historial, para aprender: el recorte de un
 * draft cuya partida tiene HOY el draft entero (5 + 4 del catálogo) lo
 * completó una persona; lo que la tablet leyó sola nunca es la verdad. Tu
 * pick solo si no es el nº1 supuesto. `hechos` (`t:ids`) no se repiten.
 */
export function draftsArreglados({ recortes = [], partidas = [], nombres = [], hechos = [] } = {}) {
  const delCatalogo = new Map(nombres.map((n) => [String(n).toLowerCase(), n]));
  const bien = (l) => (Array.isArray(l) ? l.map((n) => (typeof n === 'string' ? delCatalogo.get(n.toLowerCase()) : null)) : []);
  const porT = new Map((Array.isArray(partidas) ? partidas : []).filter((p) => Number.isFinite(p?.t) && p.draft).map((p) => [p.t, p]));
  const ya = new Set(hechos);
  const salida = [];
  for (const fila of Array.isArray(recortes) ? recortes : []) {
    const d = fila?.d ?? fila;
    if (!d || typeof d !== 'object' || d.tipo === 'final' || d.tipo === 'resultado' || !Array.isArray(d.capturas)) continue;
    const p = porT.get(d.partida);
    if (!p) continue;
    const enemigos = bien(p.draft.enemigos), aliados = bien(p.draft.aliados);
    if (enemigos.length !== 5 || aliados.length !== 4 || [...enemigos, ...aliados].some((n) => !n)) continue;
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

/** La clave del LECTOR (no la tuya): al azar la primera vez, en `clave-lector.txt`. Con ella suben los partes y los recortes. null sin disco. */
export function claveDelLector(casa, { azar = (n) => new Uint8Array(randomBytes(n)) } = {}) {
  const fichero = join(casa, 'clave-lector.txt');
  try { const c = readFileSync(fichero, 'utf8').trim(); if (claveDeJugadorValida(c)) return c; } catch { /* la primera vez */ }
  const c = crearClaveDeJugador(azar);
  try { writeFileSync(fichero, c); return c; } catch { return null; }
}
