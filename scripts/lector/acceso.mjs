/**
 * Quién puede hablar con el lector de la tablet. Escucha en la wifi, así que
 * cada petición pasa, en este orden, por: el `Host` (una IP privada escrita
 * tal cual), el `Origin` (solo la app publicada), el código de vinculación
 * (con tope de fallos por aparato) y, según la ruta (`RUTAS` de contrato.js),
 * que sea la app (con `Origin`) o la propia APK (127.0.0.1 y sin `Origin`).
 * servir.mjs aplica todo esto en un solo sitio.
 */
import { timingSafeEqual } from 'node:crypto';
import { IP_PRIVADA } from '../../src/comun/contrato.js';

/** [C] La app publicada; comparte origen con otra app de Javi (aceptado, spec §1.2). */
export const ORIGENES = ['https://srchipiron.github.io'];
/** [D] Solo las pruebas de navegador sirven la app desde 127.0.0.1: la APK nunca pone esta variable. */
export const VARIABLE_ORIGEN_LOCAL = 'LECTOR_ORIGEN_DE_PRUEBA';

/** [C] 127.0.0.1/localhost o una IP privada escrita tal cual (nunca un nombre: rebinding de DNS), con o sin puerto. */
export function hostPermitido(host) {
  if (typeof host !== 'string') return false;
  const sinPuerto = host.replace(/:\d{1,5}$/, '');
  return sinPuerto === '127.0.0.1' || sinPuerto === 'localhost' || IP_PRIVADA.test(sinPuerto);
}

/** [C] La app publicada; la copia local de las pruebas solo con `local`. */
export const origenPermitido = (o, { local = false } = {}) => typeof o === 'string' && (ORIGENES.includes(o) || (local && /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o)));

/** Una petición de la propia APK: por el bucle local y SIN `Origin` (un navegador siempre lo pone). */
export const deLaApk = (req) => !req.headers.origin && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket?.remoteAddress ?? '');

/** [D] Fallos de código por aparato antes de bloquearlo, y durante cuánto; aparatos recordados como mucho. */
export const FALLOS_CODIGO = 10;
export const VENTANA_CODIGO_MS = 10 * 60 * 1000;
const APARATOS_MAXIMOS = 256;

/**
 * El portero del código de vinculación: 'si', 'no' o 'bloqueado'. En tiempo
 * constante, y con tope POR APARATO (con uno global, cualquiera en la wifi
 * dejaba fuera al móvil de Javi). Sin código no se adivina nada (la app
 * buscando la tablet tras un cambio de IP): no cuenta como fallo.
 */
export function crearPortero(codigo, { ahora = () => Date.now() } = {}) {
  const esperado = Buffer.from(String(codigo ?? ''));
  const fallos = new Map();
  return (dado, aparato = '') => {
    const t = ahora();
    const suyos = (fallos.get(aparato) ?? []).filter((f) => t - f < VENTANA_CODIGO_MS);
    if (suyos.length >= FALLOS_CODIGO) return 'bloqueado';
    if (dado == null || String(dado) === '') return 'no';
    const recibido = Buffer.from(String(dado));
    const bueno = esperado.length > 0 && recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
    if (!bueno) {
      fallos.delete(aparato);
      fallos.set(aparato, [...suyos, t]);
      if (fallos.size > APARATOS_MAXIMOS) fallos.delete(fallos.keys().next().value);
    }
    return bueno ? 'si' : 'no';
  };
}

/** [D] Retos de la búsqueda por aparato y en total, por minuto: cada uno son `RETO_VUELTAS` de PBKDF2 en la tablet. */
export const RETOS_POR_MINUTO = 6;
export const RETOS_EN_TOTAL = 30;
/** ¿Se atiende este reto? Poda los aparatos de hace más de un minuto (con IPv6 cada petición puede traer otra dirección). */
export function permitirReto(retos, quien, t, { porAparato = RETOS_POR_MINUTO, enTotal = RETOS_EN_TOTAL } = {}) {
  for (const [k, v] of retos) { const vivos = v.filter((x) => t - x < 60000); if (vivos.length) retos.set(k, vivos); else retos.delete(k); }
  const suyos = retos.get(quien) ?? [];
  const total = [...retos.values()].reduce((n, v) => n + v.length, 0);
  if (suyos.length >= porAparato || total >= enTotal) return false;
  retos.set(quien, [...suyos, t]);
  return true;
}

/** [D] Lo más que se lee de un cuerpo. */
export const CUERPO_MAXIMO = 65536;
/** El cuerpo JSON de una petición, o null (roto o demasiado grande: se corta). Nunca se queda colgado. */
export const leerCuerpo = (req, maximo = CUERPO_MAXIMO) => new Promise((resolver) => {
  const trozos = [];
  let total = 0;
  req.on('data', (t) => { trozos.push(t); total += t.length; if (total > maximo) { resolver(null); req.destroy(); } });
  req.on('end', () => { try { resolver(JSON.parse(Buffer.concat(trozos).toString('utf8'))); } catch { resolver(null); } });
  req.on('error', () => resolver(null));
});

/** El texto sin caracteres de control, con los espacios juntos y con tope: lo que llega de fuera es un dato. */
export function limpiarTexto(texto, tope = 400) {
  const sinControl = [...String(texto ?? '')].map((c) => { const n = c.codePointAt(0); return n < 32 || (n >= 127 && n < 160) ? ' ' : c; }).join('');
  return sinControl.replace(/\s+/g, ' ').trim().slice(0, tope);
}
