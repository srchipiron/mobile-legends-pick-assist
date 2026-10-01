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
 * Leyendo solo (3.28.0): cada cuánto se pide una lectura. Con el draft en
 * marcha, cada 5 s (una lectura tarda 4–6 s en el móvil: va una tras otra
 * sin acumularse); con el draft vacío, cada 12 s, que es buscar si ha
 * empezado uno sin tener la tablet haciendo capturas sin parar.
 */
export const INTERVALO_AUTO_MS = 5000;
export const INTERVALO_AUTO_VACIO_MS = 12000;

/**
 * ¿Toca leer solo ahora? Con el modo encendido, la app a la vista, sin una
 * hoja abierta (el draft se está tocando a mano) y el draft sin completar:
 * con los cinco enemigos y los cuatro compañeros ya no hay nada que leer, y
 * seguir haciendo capturas durante la partida sería gastar por nada.
 */
export const tocaLeerSolo = ({ auto, visible = true, hoja = null, completo = false, leyendo = false }) => !!auto && visible && !hoja && !completo && !leyendo;

/**
 * Lo que el lector no reconoció en una lectura, compacto, para guardarlo
 * con la partida: hueco (t1–t5 baneos tuyos, s1–s5 suyos, e1–e5 picks
 * enemigos), a quién se parecía más y cuánto. Es lo que dice qué afinar.
 */
export function dudasDeLectura(lectura) {
  const dudas = [];
  for (const [lado, letra] of [['tuyos', 't'], ['suyos', 's'], ['enemigos', 'e']]) {
    (Array.isArray(lectura?.[lado]) ? lectura[lado] : []).forEach((x, i) => {
      if (!x || x.nombre || !x.candidato) return;
      dudas.push({ hueco: `${letra}${i + 1}`, candidato: String(x.candidato).slice(0, 40), parecido: Math.round((Number(x.parecido) || 0) * 100) / 100 });
    });
  }
  return dudas;
}

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
 * Devuelve al lector lo que había de verdad (3.27.0): con los ids de sus
 * capturas y los enemigos y baneos finales (corregidos a mano), cruza el
 * pantallazo con la verdad y aprende dónde están los huecos en esa tablet
 * y qué cara pinta. Nunca lanza: si el lector no está, no pasa nada.
 */
export async function corregirLectura({ ids = [], enemigos = [], baneos = [], base = URL_LECTOR, plazoMs = PLAZO_LECTOR_MS, pedir = (...a) => fetch(...a) } = {}) {
  if (!ids.length || !enemigos.length) return null;
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), plazoMs);
  try {
    const r = await pedir(`${base}/corregir`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, enemigos, baneos }), cache: 'no-store', signal: corte.signal });
    return r.ok ? await r.json().catch(() => null) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * Vigilar el final de la partida (3.30.0): desde `DESDE_FINAL_MIN` minutos
 * después de completar el draft (antes es jugar, y una captura en una
 * teamfight puede dar un tirón en la tablet) hasta `HASTA_FINAL_MIN`, un
 * fotograma cada `INTERVALO_FINAL_MS`. Decisiones de producto: una partida
 * dura 10–20 minutos; con 30 s la pantalla de resultado (que se queda hasta
 * que se toca) no se escapa.
 */
export const DESDE_FINAL_MIN = 8;
export const HASTA_FINAL_MIN = 25;
export const INTERVALO_FINAL_MS = 30000;
export const MAX_FOTOGRAMAS = 8;

export const tocaVigilarFinal = ({ auto, visible = true, completoDesde, ahora }) => {
  if (!auto || !visible || !completoDesde) return false;
  const min = (ahora - completoDesde) / 60000;
  return min >= DESDE_FINAL_MIN && min <= HASTA_FINAL_MIN;
};

/** Un fotograma del lector: `{ cambio }` o `{ cambio: true, id, miniatura, tira }`. Lanza con tipo si no hay lector. */
export async function pedirFotograma({ base = URL_LECTOR, plazoMs = PLAZO_LECTOR_MS, pedir = (...a) => fetch(...a) } = {}) {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), plazoMs);
  let respuesta;
  try {
    respuesta = await pedir(`${base}/captura?fotograma=1`, { cache: 'no-store', signal: corte.signal });
  } catch {
    throw fallo(corte.signal.aborted ? 'plazo' : 'sinPuente');
  } finally {
    clearTimeout(reloj);
  }
  let cuerpo = null;
  try { cuerpo = await respuesta.json(); } catch { /* cuerpo vacío */ }
  if (!respuesta.ok) throw fallo(['tablet', 'emparejar', 'captura'].includes(cuerpo?.error) ? cuerpo.error : 'error');
  if (!cuerpo || typeof cuerpo.cambio !== 'boolean') throw fallo('error');
  return cuerpo;
}

/**
 * La incidencia con los fotogramas del final de una partida: las
 * miniaturas en el cuerpo y las franjas de arriba en un comentario, como
 * texto, sin pasarse de lo que admite un mensaje (`TOPE_MENSAJE`).
 */
export const TOPE_MENSAJE = 60000;
const VALLA = '```';
export function cuerpoDeFotogramas({ fotogramas, resultado = null, version = '' }) {
  const etiqueta = resultado === 'gane' ? 'ganada' : resultado === 'perdi' ? 'perdida' : 'sin apuntar';
  const lineas = [`Fotogramas del final de una partida (${etiqueta}) · app ${version} · ${fotogramas.length} pantallas distintas desde el minuto ${DESDE_FINAL_MIN}.`, ''];
  let cuerpo = lineas.join('\n');
  for (const f of fotogramas) {
    const trozo = `\n\n${f.id} · minuto ${f.minuto} · pantalla entera a 160 px (PNG, base64):\n\n${VALLA}\n${f.miniatura}\n${VALLA}`;
    if (cuerpo.length + trozo.length > TOPE_MENSAJE) break;
    cuerpo += trozo;
  }
  let comentario = 'Franjas de arriba a 320 px (PNG, base64):';
  for (const f of fotogramas) {
    const trozo = `\n\n${f.id} · minuto ${f.minuto}:\n\n${VALLA}\n${f.tira}\n${VALLA}`;
    if (comentario.length + trozo.length > TOPE_MENSAJE) break;
    comentario += trozo;
  }
  return { titulo: `Final de partida (${etiqueta}): ${fotogramas.length} pantallas`, cuerpo, comentario };
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
