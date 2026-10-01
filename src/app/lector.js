import { nombreClave } from '../motor/nombres.js';

/**
 * El botón «Leer del juego» (3.25.0) habla con el lector de Termux
 * (`scripts/lector/servir.mjs`), que escucha en el propio móvil. El puerto
 * es el mismo que el del lector; hay una prueba que los compara.
 *
 * Una web publicada pidiendo a 127.0.0.1: Chrome 142+ lo permite tras un
 * permiso de «red local» que se da una vez, y lo exime del bloqueo de
 * contenido mixto porque la dirección es local antes de resolver nada.
 */
export const PUERTO_LECTOR = 47323;
export const URL_LECTOR = `http://127.0.0.1:${PUERTO_LECTOR}`;
/** Decisión de producto: la captura por wifi más el reconocimiento tardan 2–4 s; 20 s es «no está». */
export const PLAZO_LECTOR_MS = 20000;

/**
 * Un fallo con su tipo: `sinPuente` (no está abierto o falta el permiso),
 * `plazo`, `tablet` (el lector no la ve en la wifi), `emparejar` (la tablet
 * no deja entrar al móvil), `captura` (adb no consigue la captura) o `error`.
 */
export const FALLOS_DEL_LECTOR = ['sinPuente', 'plazo', 'tablet', 'emparejar', 'captura', 'error'];
const fallo = (tipo) => Object.assign(new Error(tipo), { tipo });

/** Pide una lectura al lector. Devuelve lo que manda (`tuyos`, `suyos`, `enemigos`) o lanza un fallo con tipo. */
export async function pedirLectura({ base = URL_LECTOR, plazoMs = PLAZO_LECTOR_MS, pedir = (...a) => fetch(...a) } = {}) {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), plazoMs);
  let respuesta;
  try {
    respuesta = await pedir(`${base}/leer`, { cache: 'no-store', signal: corte.signal });
  } catch {
    throw fallo(corte.signal.aborted ? 'plazo' : 'sinPuente');
  } finally {
    clearTimeout(reloj);
  }
  let cuerpo = null;
  try { cuerpo = await respuesta.json(); } catch { /* cuerpo vacío */ }
  if (!respuesta.ok) throw fallo(['tablet', 'emparejar', 'captura'].includes(cuerpo?.error) ? cuerpo.error : 'error');
  if (!cuerpo || !Array.isArray(cuerpo.enemigos)) throw fallo('error');
  return cuerpo;
}

/**
 * Los nombres que el lector reconoció, con la grafía del catálogo (el
 * lector usa la de sus caras de referencia: «X.Borg» frente a «X Borg»).
 * Lo que sale como «?» (hueco vacío, eligiendo, skin) no se mete.
 */
export function nombresDeLectura(lectura, heroes = []) {
  const porClave = new Map(heroes.map((h) => [nombreClave(h.name), h.name]));
  const resolver = (lista) => (Array.isArray(lista) ? lista : [])
    .map((x) => (x?.nombre ? porClave.get(nombreClave(x.nombre)) : null))
    .filter(Boolean);
  return {
    baneos: [...new Set([...resolver(lectura?.tuyos), ...resolver(lectura?.suyos)])],
    enemigos: [...new Set(resolver(lectura?.enemigos))],
  };
}
