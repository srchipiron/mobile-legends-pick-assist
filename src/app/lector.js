/**
 * El móvil habla con Lector MLBB (la APK de la tablet) por el protocolo 2
 * (src/comun/contrato.js): la tablet lleva el draft y el móvil lo copia
 * (`GET /draft`), le corrige (`POST /draft`), le da el resultado
 * (`POST /resultado`) y tus ajustes (`POST /ajustes`). Sin tablet vinculada
 * no sale ninguna petición. Lo que contesta la tablet es un dato: se sanea.
 */
import { nombreClave } from '../motor/nombres.js';
import {
  PUERTO, PROTOCOLO, RETO_VUELTAS, IP_PRIVADA, MAESTRIA_MAX,
  sanearRespuestaDraft, sanearCorreccion, sanearResultado, sanearAjustes,
} from '../comun/contrato.js';

/** La tablet vinculada: una IP privada escrita tal cual y su código. null si no vale. */
export function sanearLectorTablet(x) {
  if (!x || typeof x !== 'object') return null;
  const [ip, puerto = String(PUERTO)] = String(x.direccion ?? '').trim().split(':');
  const codigo = String(x.codigo ?? '').replace(/[\s-]/g, '').toUpperCase();
  const p = Number(puerto);
  if (!IP_PRIVADA.test(ip) || !(Number.isInteger(p) && p > 0 && p < 65536) || !/^[A-Z0-9]{8,64}$/.test(codigo)) return null;
  return { direccion: `${ip}:${p}`, codigo };
}

/** Lo que trae el enlace del QR de la tablet (`#lector=IP:PUERTO&codigo=…`), o null. */
export function lectorTabletDeEnlace(hash) {
  const q = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  return q.has('lector') ? sanearLectorTablet({ direccion: q.get('lector'), codigo: q.get('codigo') }) : null;
}

let enTablet = null;
/** La app dice aquí con qué tablet está vinculada (null: con ninguna, y no se pide nada). */
export const ponerLectorEnTablet = (x) => { enTablet = sanearLectorTablet(x); };
export const baseLector = () => (enTablet ? `http://${enTablet.direccion}` : null);

/** [D] Plazo de una petición a la tablet por la wifi; pasado, «no está». */
export const PLAZO_LECTOR_MS = 8000;

/**
 * Los fallos con tipo: `sinPuente` (no llega), `plazo`, `codigo` (401),
 * `bloqueado` (429), `antigua` (404 en una ruta del protocolo 2) o `error`.
 */
export const FALLOS_DEL_LECTOR = ['sinPuente', 'plazo', 'codigo', 'bloqueado', 'antigua', 'error'];
const fallo = (tipo) => Object.assign(new Error(tipo), { tipo });
const falloDe = (status) => (status === 401 ? 'codigo' : status === 429 ? 'bloqueado' : status === 404 ? 'antigua' : 'error');

/**
 * La única petición a la tablet: con el código, declarando la red local y con
 * plazo. Devuelve el cuerpo (o null si no es JSON) o lanza un fallo con tipo.
 */
export async function pedirJson(ruta, { metodo = 'GET', cuerpo, plazoMs = PLAZO_LECTOR_MS, base = baseLector(), pedir = (...a) => fetch(...a), codigo = enTablet?.codigo, keepalive = false } = {}) {
  if (!base || !codigo) throw fallo('sinPuente');
  const corte = AbortSignal.timeout(plazoMs);
  let r;
  try {
    r = await pedir(`${base}${ruta}`, {
      method: metodo, cache: 'no-store', signal: corte, targetAddressSpace: 'local', keepalive,
      headers: { 'X-Lector-Codigo': codigo, ...(cuerpo !== undefined ? { 'Content-Type': 'application/json' } : {}) },
      ...(cuerpo !== undefined ? { body: JSON.stringify(cuerpo) } : {}),
    });
  } catch {
    throw fallo(corte.aborted ? 'plazo' : 'sinPuente');
  }
  const json = await r.json().catch(() => null);
  if (!r.ok) throw fallo(falloDe(r.status));
  return json;
}

/** El draft de la tablet (`GET /draft`), saneado. Una respuesta que no es del protocolo 2 es `antigua`. */
export async function pedirDraft(opciones) {
  const r = sanearRespuestaDraft(await pedirJson('/draft', opciones));
  if (!r) throw fallo('antigua');
  return r;
}

/** Lo que corriges a mano en ESE draft (`POST /draft`). Nunca lanza: true si la tablet lo tomó. */
export async function corregirDraft(correccion, opciones) {
  const c = sanearCorreccion(correccion);
  if (!c) return false;
  try { await pedirJson('/draft', { ...opciones, metodo: 'POST', cuerpo: c }); return true; } catch { return false; }
}

/** El resultado de la partida de ESE draft (`POST /resultado`); `gane` null es «no la terminé». true si la tablet lo tomó. */
export async function mandarResultado(resultado, opciones) {
  const r = sanearResultado(resultado);
  if (!r) return false;
  try { await pedirJson('/resultado', { ...opciones, metodo: 'POST', cuerpo: r }); return true; } catch { return false; }
}

/**
 * Tus ajustes para que la tablet decida y apunte sin el móvil delante: línea,
 * rango, idioma, tu maestría (las `MAESTRIA_MAX` con más partidas) y tu clave
 * de la base de datos si la usas. null sin línea.
 */
export function ajustesParaLaTablet({ linea, rango, idioma, maestria = {}, clave = null }) {
  const lista = Object.entries(maestria ?? {})
    .filter(([, m]) => Number.isInteger(m?.games) && m.games > 0 && typeof m.winRate === 'number')
    .sort((a, b) => b[1].games - a[1].games).slice(0, MAESTRIA_MAX)
    .map(([n, m]) => [n, { games: m.games, winRate: Math.round(m.winRate * 1000) / 1000 }]);
  return sanearAjustes({ linea, rango, idioma, maestria: Object.fromEntries(lista), ...(clave ? { clave } : {}) });
}

/** `POST /ajustes`. true si la tablet los tomó. */
export async function mandarAjustes(ajustes, opciones) {
  if (!ajustes) return false;
  try { await pedirJson('/ajustes', { ...opciones, metodo: 'POST', cuerpo: ajustes }); return true; } catch { return false; }
}

/** La clave con la que la tablet guarda tus partidas: el móvil la usa si no tiene una suya. null si no hay. */
export async function pedirClaveDeLaTablet(opciones) {
  try {
    const c = (await pedirJson('/clave', { plazoMs: 4000, ...opciones }))?.clave;
    return typeof c === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(c) ? c : null;
  } catch { return null; }
}

/** `/estado` de la tablet para «El sistema» y el Diagnóstico. Nunca lanza: `{ ok:false, tipo }` si no llega. */
export async function pedirEstadoLector(opciones) {
  try {
    const c = await pedirJson('/estado', { plazoMs: 3000, ...opciones });
    const objeto = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : null);
    return {
      ok: true, protocolo: Number.isInteger(c?.protocolo) ? c.protocolo : null,
      aprendido: objeto(c?.aprendido), resultados: objeto(c?.resultados),
      salida: typeof c?.salida === 'string' ? c.salida.slice(0, 500) : null,
      lector: objeto(c?.lector), tablet: objeto(c?.tablet), partidas: objeto(c?.partidas), datos: objeto(c?.datos), solo: objeto(c?.solo),
    };
  } catch (e) {
    return { ok: false, tipo: e?.tipo === 'antigua' ? 'error' : (e?.tipo ?? 'sinPuente') };
  }
}

/** Los fallos que dicen «no llego a la tablet» (no un código malo). */
export const sinLlegarALaTablet = (tipo) => tipo === 'sinPuente' || tipo === 'plazo';

/** La clave del aviso de un fallo: qué hacer en la tablet. */
export function claveDeFallo(tipo, { auto = false } = {}) {
  if (tipo === 'sinPuente') return auto ? 'lector.enTablet.auto.sinPuente' : 'lector.enTablet.sinPuente';
  if (['codigo', 'bloqueado', 'antigua'].includes(tipo)) return `lector.${tipo}`;
  if (auto && !['yaEstaba', 'nada'].includes(tipo)) return 'lector.auto.error';
  return `lector.${tipo}`;
}

/**
 * La prueba de que una tablet conoce el código sin que el código viaje:
 * PBKDF2-SHA256(código, «lector-reto:» + n, RETO_VUELTAS) en hex, la misma
 * cuenta que hace la tablet con node:crypto.
 */
export async function pruebaDelReto(codigo, n, sutil = globalThis.crypto.subtle) {
  const utf8 = (s) => new TextEncoder().encode(s);
  const llave = await sutil.importKey('raw', utf8(codigo), 'PBKDF2', false, ['deriveBits']);
  const bits = await sutil.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: utf8(`lector-reto:${n}`), iterations: RETO_VUELTAS }, llave, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

/**
 * La tablet cambió de IP: se pregunta `/estado` SIN código a la misma /24; a
 * quien contesta como Lector MLBB (401 `codigo`) se le manda un reto, y solo
 * quien lo resuelve recibe el código (y vale si con él contesta `ok`).
 */
export async function buscarTabletEnLaRed(vinculo, { pedir = (...a) => fetch(...a), plazoMs = 1500, aLaVez = 32, azar = () => globalThis.crypto.getRandomValues(new Uint8Array(16)), probar = pruebaDelReto } = {}) {
  const v = sanearLectorTablet(vinculo);
  if (!v) return null;
  const [ip, puerto] = v.direccion.split(':');
  const red = ip.split('.').slice(0, 3).join('.');
  const candidatas = Array.from({ length: 254 }, (_, i) => `${red}.${i + 1}:${puerto}`).filter((d) => d !== v.direccion);
  const sinCodigo = { cache: 'no-store', targetAddressSpace: 'local' };
  const pareceLector = async (d) => {
    try {
      const r = await pedir(`http://${d}/estado`, { ...sinCodigo, signal: AbortSignal.timeout(plazoMs) });
      return r.status === 401 && (await r.json().catch(() => null))?.error === 'codigo';
    } catch { return false; }
  };
  const conoceElCodigo = async (d) => {
    try {
      const n = [...azar()].map((b) => b.toString(16).padStart(2, '0')).join('');
      const r = await pedir(`http://${d}/reto?n=${n}`, { ...sinCodigo, signal: AbortSignal.timeout(plazoMs * 4) });
      const j = await r.json().catch(() => null);
      return r.ok && typeof j?.prueba === 'string' && j.prueba === await probar(v.codigo, n);
    } catch { return false; }
  };
  const aceptaElCodigo = async (d) => {
    try {
      const r = await pedir(`http://${d}/estado`, { ...sinCodigo, signal: AbortSignal.timeout(plazoMs), headers: { 'X-Lector-Codigo': v.codigo } });
      return r.ok && (await r.json().catch(() => null))?.ok === true;
    } catch { return false; }
  };
  for (let i = 0; i < candidatas.length; i += aLaVez) {
    const tanda = candidatas.slice(i, i + aLaVez);
    const vistas = await Promise.all(tanda.map(pareceLector));
    for (const [k, d] of tanda.entries()) {
      if (vistas[k] && await conoceElCodigo(d) && await aceptaElCodigo(d)) return { direccion: d, codigo: v.codigo };
    }
  }
  return null;
}

/** [P] Una búsqueda a la vez y como mucho cada 2 minutos: son 254 preguntas por la wifi. */
export const ENTRE_BUSQUEDAS_MS = 2 * 60 * 1000;
let busquedaEnCurso = null;
let ultimaBusqueda = 0;
export function buscarTabletUnaVez(vinculo, { ahora = Date.now(), ...opciones } = {}) {
  if (busquedaEnCurso) return busquedaEnCurso;
  if (ahora - ultimaBusqueda < ENTRE_BUSQUEDAS_MS) return Promise.resolve(null);
  ultimaBusqueda = ahora;
  busquedaEnCurso = buscarTabletEnLaRed(vinculo, opciones).finally(() => { busquedaEnCurso = null; });
  return busquedaEnCurso;
}

/**
 * «El sistema» en Ajustes: lo que el móvil sabe de la tablet por su `/estado`,
 * en líneas `{ clave, params, mal }` (`mal` = hay que hacer algo). Lo que la
 * tablet no dice no sale.
 */
export function lineasDelSistema(estado, { ahora = Date.now() } = {}) {
  if (!estado?.ok) return [];
  const num = (x) => (Number.isFinite(x) ? x : 0);
  const L = [];
  const tablet = estado.tablet ?? {}, lector = estado.lector ?? {}, { solo, partidas, datos } = estado;
  if (typeof tablet.grabando === 'boolean') L.push({ clave: tablet.grabando ? 'sistema.grabando' : 'sistema.sinGrabar', params: {}, mal: !tablet.grabando });
  if (solo) L.push(solo.activo ? { clave: 'sistema.solo', params: { linea: solo.linea ?? '?' }, mal: false } : { clave: 'sistema.soloApagado', params: {}, mal: true });
  // [M] Con tres partidas jugadas y ninguna apuntada, no ve el final.
  if (solo && num(solo.partidas) > 0) L.push({ clave: 'sistema.jugadas', params: { n: num(solo.partidas), apuntadas: num(solo.apuntadas) }, mal: num(solo.partidas) >= 3 && num(solo.apuntadas) === 0 });
  // [C] El 2 es `SIN_BANEOS_AVISO` del contrato (hay prueba).
  if (solo && num(solo.sinBaneos) >= 2) L.push({ clave: 'sistema.sinBaneos', params: { n: num(solo.sinBaneos) }, mal: true });
  const lecturas = num(lector.lecturas) + num(lector.lecturasSolo);
  if (Object.keys(lector).length) L.push({ clave: 'sistema.lecturas', params: { n: lecturas, fallos: num(lector.fallosCaptura), minutos: num(lector.minutos) }, mal: lecturas > 10 && num(lector.fallosCaptura) / lecturas > 0.2 });
  if (partidas) {
    L.push({ clave: partidas.sinSubir ? 'sistema.partidasSinSubir' : 'sistema.partidas', params: { n: num(partidas.apuntadas), sinSubir: num(partidas.sinSubir) }, mal: num(partidas.sinSubir) > 0 && !!partidas.error });
    const total = num(partidas.porTabla) + num(partidas.porPregunta);
    if (total) L.push({ clave: 'sistema.resultados', params: { tabla: num(partidas.porTabla), total }, mal: false });
    // [C] Diez seguidas iguales en la tabla (`TABLA_SEGUIDAS`) salen por azar menos de una vez de cada cien.
    const ut = partidas.ultimasTabla;
    if (num(ut?.n) >= 10 && (num(ut.gane) === 0 || num(ut.gane) === num(ut.n))) L.push({ clave: ut.gane ? 'sistema.todasVictoria' : 'sistema.todasDerrota', params: { n: num(ut.n) }, mal: true });
    if (num(partidas.sinResultado) > 0) L.push({ clave: 'sistema.sinResultado', params: { n: num(partidas.sinResultado) }, mal: true });
  }
  const fecha = Date.parse(datos?.fecha ?? '');
  if (Number.isFinite(fecha)) { const h = Math.max(0, Math.round((ahora - fecha) / 3600000)); L.push({ clave: 'sistema.datos', params: { h }, mal: h > 72 }); }
  return L;
}

/** ¿Es `a` una versión anterior a `b`? (X.Y.Z; lo que no tenga esa forma, no). */
export function versionAnterior(a, b) {
  const p = (v) => (/^\d+\.\d+\.\d+$/.test(String(v ?? '')) ? String(v).split('.').map(Number) : null);
  const x = p(a), y = p(b);
  if (!x || !y) return false;
  for (let i = 0; i < 3; i++) if (x[i] !== y[i]) return x[i] < y[i];
  return false;
}

/**
 * Qué Lector MLBB contesta: 'antigua' (sin bloque `lector`, o sin el
 * protocolo 2), 'atrasada' (hay una publicada más nueva), 'alDia', 'nose' o
 * 'sinRespuesta' (con el `tipo` del fallo).
 */
export function queApk(estado, ultima = null) {
  if (!estado?.ok) return { estado: 'sinRespuesta', tipo: estado?.tipo ?? 'sinPuente' };
  const tuya = estado.tablet?.apk ?? null;
  if (!estado.lector) return { estado: 'antigua', ultima };
  if (estado.protocolo !== PROTOCOLO) return { estado: 'atrasada', tuya: tuya ?? '?', ultima: ultima ?? '?' };
  if (!tuya) return { estado: 'nose', ultima };
  if (ultima && versionAnterior(tuya, ultima)) return { estado: 'atrasada', tuya, ultima };
  return { estado: ultima ? 'alDia' : 'nose', tuya, ultima };
}

/** [C] La APK más reciente, siempre en la misma dirección de GitHub. */
export const DESCARGA_APK = 'https://github.com/srchipiron/mobile-legends-pick-assist/releases/latest/download/lector-mlbb.apk';

/** La versión de la última Lector MLBB publicada (sin token: es pública). null si no se sabe; nunca lanza. */
export async function pedirUltimaApk({ pedir = (...a) => fetch(...a), plazoMs = 4000 } = {}) {
  try {
    const r = await pedir('https://api.github.com/repos/srchipiron/mobile-legends-pick-assist/releases/latest', { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(plazoMs) });
    if (!r.ok) return null;
    const m = /^lector-v(\d+\.\d+\.\d+)$/.exec(String((await r.json())?.tag_name ?? ''));
    return m ? m[1] : null;
  } catch { return null; }
}

/** La grafía del catálogo para un nombre que dice la tablet; null si no es de nadie. */
export function nombreDelCatalogo(nombre, porClave) {
  return typeof nombre === 'string' ? porClave.get(nombreClave(nombre)) ?? null : null;
}
