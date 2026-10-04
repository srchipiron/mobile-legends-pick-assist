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
 * enemigos, a1–a5 tu equipo), a quién se parecía más y cuánto. Es lo que
 * dice qué afinar.
 */
export function dudasDeLectura(lectura) {
  const dudas = [];
  for (const [lado, letra] of [['tuyos', 't'], ['suyos', 's'], ['enemigos', 'e'], ['aliados', 'a']]) {
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
 * Vigilar el final de la partida (3.30.0; desde 3.33.0 la vigila el LECTOR):
 * desde `DESDE_FINAL_MIN` minutos después de completar el draft (antes es
 * jugar, y una captura en una teamfight puede dar un tirón en la tablet)
 * hasta `HASTA_FINAL_MIN`, una captura cada `INTERVALO_FINAL_MS`. Decisiones
 * de producto: una partida dura 10–20 minutos y la tabla de resultado pasa
 * en segundos. Los captura el lector en Termux, que sigue despierto con el
 * móvil en el bolsillo: la app solo le avisa de cuándo se completó el draft
 * (`avisarVigilancia`) y recoge lo vigilado (`pedirFinal`) cada
 * `INTERVALO_FINAL_MS` mientras está a la vista. Mismos números que
 * `VIGILANCIA` en servir.mjs (hay prueba).
 */
export const DESDE_FINAL_MIN = 8;
export const HASTA_FINAL_MIN = 25;
export const INTERVALO_FINAL_MS = 10000;
/** Cuánto dura el «Deshacer» de una partida apuntada sola (3.32.0): más que el de un toque, porque nadie lo esperaba. */
export const DESHACER_APUNTADA_MS = 20000;
export const MAX_FOTOGRAMAS = 8;

/** ¿Toca preguntar al lector por el final? Con el modo encendido, la app a la vista y el draft completo: el reloj lo lleva el lector. */
export const tocaVigilarFinal = ({ auto, visible = true, completoDesde }) => !!auto && visible && !!completoDesde;

/**
 * Avisa al lector de que el draft se completó en `desde` (reloj del móvil,
 * el mismo que el suyo): desde entonces vigila el final por su cuenta.
 * Devuelve lo vigilado hasta ahora, o null si no hay lector. Nunca lanza.
 */
export async function avisarVigilancia({ desde, base = URL_LECTOR, plazoMs = PLAZO_LECTOR_MS, pedir = (...a) => fetch(...a) } = {}) {
  if (!Number.isFinite(desde)) return null;
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), plazoMs);
  try {
    const r = await pedir(`${base}/vigilar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desde }), cache: 'no-store', signal: corte.signal });
    const cuerpo = r.ok ? await r.json().catch(() => null) : null;
    return cuerpo && Array.isArray(cuerpo.fotogramas) ? cuerpo : null;
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
}

/** Lo vigilado por el lector: `{ desde, activa, resultado, resultadoId, resultadoEn, fotogramas }`. Lanza con tipo si no hay lector. */
export async function pedirFinal({ base = URL_LECTOR, plazoMs = PLAZO_LECTOR_MS, pedir = (...a) => fetch(...a) } = {}) {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), plazoMs);
  let respuesta;
  try {
    respuesta = await pedir(`${base}/final`, { cache: 'no-store', signal: corte.signal });
  } catch {
    throw fallo(corte.signal.aborted ? 'plazo' : 'sinPuente');
  } finally {
    clearTimeout(reloj);
  }
  let cuerpo = null;
  try { cuerpo = await respuesta.json(); } catch { /* cuerpo vacío */ }
  if (!respuesta.ok || !cuerpo || !Array.isArray(cuerpo.fotogramas)) throw fallo('error');
  return cuerpo;
}

/**
 * Funde lo vigilado por el lector con los fotogramas que la app ya tiene:
 * solo si es de ESTE draft (`desde` igual a `completoDesde`; si no, es de
 * otro o el lector se reinició), sin repetir ids y sin pasar de `maximo`.
 * `resultado` es 'gane' o 'perdi' cuando el lector vio la tabla, con
 * `resultadoEn` (cuándo la vio: el instante de la partida apuntada sola).
 */
export function fundirFinal(actuales, final, { completoDesde, maximo = MAX_FOTOGRAMAS }) {
  if (!final || !Number.isFinite(completoDesde) || final.desde !== completoDesde) return { suyo: false, fotogramas: actuales, resultado: null, resultadoEn: null };
  const ids = new Set(actuales.map((f) => f.id));
  const fotogramas = [...actuales];
  for (const f of Array.isArray(final.fotogramas) ? final.fotogramas : []) {
    if (!f || typeof f.id !== 'string' || ids.has(f.id)) continue;
    const nuevo = { id: f.id, minuto: f.minuto, miniatura: f.miniatura, tira: f.tira, ...(f.tabla ? { tabla: true } : {}) };
    if (fotogramas.length < maximo) fotogramas.push(nuevo);
    else if (f.tabla) {
      // La tabla del resultado entra siempre (3.37.0), en el sitio de la
      // última pantalla que no lo sea: es la que se sube y la que enseña.
      const i = fotogramas.findLastIndex((x) => !x.tabla);
      if (i < 0) continue;
      ids.delete(fotogramas[i].id);
      fotogramas[i] = nuevo;
    } else continue;
    ids.add(f.id);
  }
  const resultado = final.resultado === 'gane' || final.resultado === 'perdi' ? final.resultado : null;
  return { suyo: true, fotogramas, resultado, resultadoEn: resultado && Number.isFinite(final.resultadoEn) ? final.resultadoEn : null };
}

/**
 * Lo que contestó Javi (o lo que se apuntó solo) con los fotogramas de esa
 * partida, para que el lector aprenda la palabra de la tabla (3.32.0).
 * Nunca lanza; sin fotogramas no pide nada.
 */
export async function ensenarResultado({ ids = [], gane, base = URL_LECTOR, plazoMs = PLAZO_LECTOR_MS, pedir = (...a) => fetch(...a) } = {}) {
  if (!ids.length || typeof gane !== 'boolean') return null;
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), plazoMs);
  try {
    const r = await pedir(`${base}/resultado`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, gane }), cache: 'no-store', signal: corte.signal });
    return r.ok ? await r.json().catch(() => null) : null;
  } catch {
    return null;
  } finally {
    clearTimeout(reloj);
  }
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
  const uno = (x) => (x?.nombre ? porClave.get(nombreClave(x.nombre)) ?? null : null);
  const resolver = (lista) => (Array.isArray(lista) ? lista : []).map(uno).filter(Boolean);
  // Tu equipo (3.31.0): las cinco filas del panel de la izquierda, y una es
  // la tuya (`tuyoFila`, la del nombre en amarillo). Si el lector no
  // distingue cuál, no entra ningún compañero: uno de ellos serías tú.
  const filas = Array.isArray(lectura?.aliados) ? lectura.aliados : [];
  const tuyoFila = Number.isInteger(lectura?.tuyoFila) && lectura.tuyoFila >= 0 && lectura.tuyoFila < filas.length ? lectura.tuyoFila : -1;
  const tuyo = tuyoFila >= 0 ? uno(filas[tuyoFila]) : null;
  const aliados = tuyoFila >= 0 ? [...new Set(resolver(filas.filter((_, i) => i !== tuyoFila)))].filter((n) => n !== tuyo) : [];
  // Y por HUECO (3.37.0): quién se ve en cada jugador, o null. Sirve para
  // cambiar al héroe que un jugador solo estaba MIRANDO por el que coge
  // (`cambiosDeHueco`). Tu fila va a null: no es un compañero.
  const porHueco = (lista, saltar = -1) => (Array.isArray(lista) ? lista : []).map((x, i) => (i === saltar ? null : uno(x)));
  return {
    baneos: [...new Set([...resolver(lectura?.tuyos), ...resolver(lectura?.suyos)])],
    enemigos: [...new Set(resolver(lectura?.enemigos))],
    aliados,
    tuyo,
    huecos: { enemigos: porHueco(lectura?.enemigos), aliados: tuyoFila >= 0 ? porHueco(filas, tuyoFila) : [] },
  };
}

/**
 * Qué nombres leídos antes hay que QUITAR porque su hueco enseña ahora a
 * otro (3.37.0). El juego pinta en el hueco de cada jugador el héroe que
 * está mirando antes de confirmarlo, y el lector solo sumaba: en las 29
 * partidas leídas hasta el 3 de octubre de 2026, 30 de 407 nombres leídos
 * hubo que quitarlos a mano después (Joy cinco veces, Wanwan y Miya tres),
 * todos en los picks y ninguno en los baneos. Un nombre se quita si el
 * MISMO hueco reconoce ahora a otro y él no sale en ningún otro hueco de
 * esta lectura (un «?» no quita nada: en la fase de skins no se reconoce a
 * nadie). Devuelve los nombres a quitar y los huecos al día.
 */
export function cambiosDeHueco(anteriores = [], actuales = []) {
  const quitar = [];
  const huecos = [];
  const n = Math.max(anteriores.length, actuales.length);
  for (let i = 0; i < n; i += 1) {
    const a = anteriores[i] ?? null; const b = actuales[i] ?? null;
    if (a && b && a !== b && !actuales.includes(a)) quitar.push(a);
    huecos.push(b ?? a);
  }
  return { quitar: [...new Set(quitar)], huecos };
}
