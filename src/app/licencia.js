/**
 * Las claves de invitación (3.65.0, decidido por Javi: «controlar quién la
 * usa», sin servidor). Cómo va:
 *
 * - Javi tiene en SU móvil una clave de administrador (ECDSA P-256, WebCrypto):
 *   la privada no sale de ahí (salvo la copia de seguridad que él guarde) y
 *   la pública se publica en `licencias.json` junto a la app.
 * - Cada invitado recibe una CLAVE: un texto firmado con su nombre, su id y,
 *   si se quiere, su caducidad. Se comparte como enlace (`#clave=…`): al
 *   abrirlo, la app la guarda.
 * - La app comprueba la firma con la pública, que no esté caducada ni en la
 *   lista de revocadas de `licencias.json`. Solo si `exigir` está puesto se
 *   cierra la puerta a quien no tenga clave válida.
 *
 * Es una puerta, no una caja fuerte: la app es estática y su código está a
 * la vista, así que quien se empeñe puede saltársela. Sirve para que la use
 * quien Javi invita y para poder retirarle el permiso a quien quiera.
 */

const ALGORITMO = { name: 'ECDSA', namedCurve: 'P-256' };
const FIRMA = { name: 'ECDSA', hash: 'SHA-256' };

const aBase64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const deBase64url = (texto) => {
  const b = atob(String(texto).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(b, (c) => c.charCodeAt(0));
};
const utf8 = (s) => new TextEncoder().encode(s);

/** Una clave de administrador nueva: { publica, privada } en JWK. */
export async function crearClaveDeAdministrador(sutil = globalThis.crypto.subtle) {
  const par = await sutil.generateKey(ALGORITMO, true, ['sign', 'verify']);
  return { publica: await sutil.exportKey('jwk', par.publicKey), privada: await sutil.exportKey('jwk', par.privateKey) };
}

/** Lo que va dentro de una clave, con la forma garantizada. */
export function sanearDatosDeClave(d) {
  if (!d || typeof d !== 'object') return null;
  const id = typeof d.id === 'string' && /^[a-z0-9]{6,24}$/.test(d.id) ? d.id : null;
  const nombre = typeof d.n === 'string' ? d.n.trim().slice(0, 40) : '';
  const emitida = Number.isFinite(d.e) ? d.e : null;
  const caduca = Number.isFinite(d.c) ? d.c : null;
  return id && nombre && emitida ? { id, nombre, emitida, caduca } : null;
}

/** Firma una clave para `nombre` (caduca a los `dias`, o nunca). Devuelve el texto de la clave. */
export async function firmarClave({ nombre, dias = null, privada, ahora = Date.now(), azar = () => globalThis.crypto.getRandomValues(new Uint8Array(6)), sutil = globalThis.crypto.subtle }) {
  const id = [...azar()].map((b) => b.toString(36).padStart(2, '0')).join('').slice(0, 10);
  const datos = { id, n: String(nombre).trim().slice(0, 40), e: ahora, ...(dias ? { c: ahora + dias * 86400000 } : {}) };
  if (!sanearDatosDeClave(datos)) throw new Error('nombre');
  const cuerpo = aBase64url(utf8(JSON.stringify(datos)));
  const llave = await sutil.importKey('jwk', privada, ALGORITMO, false, ['sign']);
  const firma = await sutil.sign(FIRMA, llave, utf8(cuerpo));
  return `${cuerpo}.${aBase64url(firma)}`;
}

/**
 * ¿Vale esta clave? `{ valida, motivo, datos }`; motivo: 'formato',
 * 'sinPublica', 'firma', 'caducada' o 'revocada'. Nunca lanza.
 */
export async function comprobarClave(clave, { publica, revocadas = [], ahora = Date.now(), sutil = globalThis.crypto.subtle } = {}) {
  const [cuerpo, firma, sobra] = String(clave ?? '').trim().split('.');
  if (!cuerpo || !firma || sobra !== undefined) return { valida: false, motivo: 'formato' };
  let datos;
  try { datos = sanearDatosDeClave(JSON.parse(new TextDecoder().decode(deBase64url(cuerpo)))); } catch { datos = null; }
  if (!datos) return { valida: false, motivo: 'formato' };
  if (!publica) return { valida: false, motivo: 'sinPublica', datos };
  try {
    const llave = await sutil.importKey('jwk', publica, ALGORITMO, false, ['verify']);
    if (!(await sutil.verify(FIRMA, llave, deBase64url(firma), utf8(cuerpo)))) return { valida: false, motivo: 'firma', datos };
  } catch { return { valida: false, motivo: 'firma', datos }; }
  if (datos.caduca && ahora > datos.caduca) return { valida: false, motivo: 'caducada', datos };
  if (revocadas.includes(datos.id)) return { valida: false, motivo: 'revocada', datos };
  return { valida: true, motivo: null, datos };
}

/** `licencias.json` con la forma garantizada. */
export function sanearLicencias(x) {
  const o = x && typeof x === 'object' ? x : {};
  const publica = o.publica && typeof o.publica === 'object' && o.publica.kty === 'EC' && typeof o.publica.x === 'string' && typeof o.publica.y === 'string'
    ? { kty: 'EC', crv: 'P-256', x: o.publica.x, y: o.publica.y } : null;
  return {
    version: 1,
    publica,
    exigir: o.exigir === true && !!publica,
    revocadas: Array.isArray(o.revocadas) ? o.revocadas.filter((r) => typeof r === 'string' && /^[a-z0-9]{6,24}$/.test(r)).slice(0, 1000) : [],
  };
}

/** La clave que trae un enlace (`#clave=…`), o null. */
export function claveDeEnlace(hash) {
  const q = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  const c = q.get('clave');
  return c && /^[\w-]+\.[\w-]+$/.test(c) ? c : null;
}

/** El enlace para compartir una clave: abre la app y la deja puesta. */
export const enlaceDeClave = (clave, base = 'https://srchipiron.github.io/mobile-legends-pick-assist/') => `${base}#clave=${clave}`;

/**
 * ¿Pasa por la puerta? Si no se exige clave, todos. Si se exige: el
 * administrador (tiene la privada de la pública publicada) y quien tenga una
 * clave válida. Sin `licencias.json` (sin red la primera vez), se deja pasar:
 * una puerta que se cierra por no tener cobertura castiga a quien sí tiene clave.
 */
export function pasaLaPuerta({ licencias, comprobada, esAdministrador = false }) {
  if (!licencias?.exigir) return true;
  if (esAdministrador) return true;
  return !!comprobada?.valida;
}
