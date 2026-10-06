import { nombreClave } from '../motor/nombres.js';
import { esDuracionPosible } from '../motor/directo.js';

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
 * La corrección espera a que el lector APRENDA (3.41.0): decenas de segundos
 * por captura en un móvil, de tres a ocho capturas, y detrás de la tanda
 * anterior si la hay. Con los 20 s de una lectura la app cortaba y lo
 * aprendido no llegaba nunca a la partida (el lector sí aprendía). Es una
 * petición a 127.0.0.1 que no bloquea nada: tres minutos, decisión de producto.
 */
export const PLAZO_CORREGIR_MS = 3 * 60 * 1000;
/**
 * Leyendo solo (3.28.0): cada cuánto se pide una lectura. Con el draft en
 * marcha, cada 5 s (una lectura tarda 4–6 s en el móvil: va una tras otra
 * sin acumularse); con el draft vacío, cada 12 s, que es buscar si ha
 * empezado uno sin tener la tablet haciendo capturas sin parar.
 */
export const INTERVALO_AUTO_MS = 5000;
export const INTERVALO_AUTO_VACIO_MS = 12000;
/**
 * Con el draft completo pero sin TU pick (3.44.1): si eliges el último, los
 * cinco enemigos y tus cuatro compañeros están antes que tú, la lectura
 * paraba y los consejos en directo hablaban del nº1 aunque cogieras otro. Se
 * sigue leyendo (tu fila) hasta este plazo: lo que dura la elección de skins.
 * Decisión de producto; pasado, se para como siempre (no se captura jugando).
 */
export const LEER_TU_PICK_MS = 90000;

/**
 * ¿Toca leer solo ahora? Con el modo encendido, la app a la vista, sin una
 * hoja abierta (el draft se está tocando a mano) y el draft sin completar:
 * con los cinco enemigos y los cuatro compañeros ya no hay nada que leer, y
 * seguir haciendo capturas durante la partida sería gastar por nada.
 */
export const tocaLeerSolo = ({ auto, visible = true, hoja = null, completo = false, leyendo = false, miPick = null, completoDesde = null, ahora = Date.now() }) => !!auto && visible && !hoja && !leyendo
  && (!completo || (!miPick && Number.isFinite(completoDesde) && ahora - completoDesde >= 0 && ahora - completoDesde < LEER_TU_PICK_MS));

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
 * Las dudas que se quedan con el draft (3.40.0): las de la última lectura que
 * reconoció a ALGUIEN. Leyendo solo se captura cada 5 s hasta completar el
 * draft, y las últimas capturas suelen ser la pantalla de carga o la partida
 * (todo «?»): sus dudas tapaban las del draft, que son las que dicen qué
 * afinar. Si ninguna lectura ha reconocido a nadie, valen las últimas: ese
 * es justo el caso en que el lector no casa con la tablet.
 */
export function dudasQueQuedan(previas, nuevas, reconocio) {
  if (!Array.isArray(nuevas)) return previas ?? null;
  return reconocio || !previas?.length ? nuevas : previas;
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
export async function corregirLectura({ ids = [], enemigos = [], baneos = [], base = URL_LECTOR, plazoMs = PLAZO_CORREGIR_MS, pedir = (...a) => fetch(...a) } = {}) {
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
export async function avisarVigilancia({ desde, directo = null, base = URL_LECTOR, plazoMs = PLAZO_LECTOR_MS, pedir = (...a) => fetch(...a) } = {}) {
  if (!Number.isFinite(desde)) return null;
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), plazoMs);
  try {
    // Con el guion de los consejos en directo (3.44.0), ya traducido: el lector lo dice en voz alta.
    const r = await pedir(`${base}/vigilar`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ desde, ...(directo ? { guion: directo.guion, cierres: directo.cierres, idioma: directo.idioma } : {}) }), cache: 'no-store', signal: corte.signal });
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
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
/** Un fotograma como lo da el lector: id `fotograma-…`, minuto, y las dos imágenes en base64 (sin nada más dentro). */
export const fotogramaValido = (f) => !!f && typeof f.id === 'string' && /^fotograma-[\w-]{1,80}$/.test(f.id)
  && Number.isFinite(f.minuto) && typeof f.miniatura === 'string' && BASE64.test(f.miniatura) && typeof f.tira === 'string' && BASE64.test(f.tira)
  // El recorte del marcador (3.44.0), si viene, con la misma forma.
  && (f.marcador == null || (typeof f.marcador === 'string' && BASE64.test(f.marcador)));

export function fundirFinal(actuales, final, { completoDesde, maximo = MAX_FOTOGRAMAS }) {
  if (!final || !Number.isFinite(completoDesde) || final.desde !== completoDesde) return { suyo: false, fotogramas: actuales, resultado: null, resultadoEn: null, duracion: null, voz: null };
  const ids = new Set(actuales.map((f) => f.id));
  const fotogramas = [...actuales];
  for (const f of Array.isArray(final.fotogramas) ? final.fotogramas : []) {
    // Lo que llega del puerto del lector va a una incidencia de GitHub: solo
    // se acepta con la forma que da el lector (3.40.0). Un texto con «@claude»
    // dentro de una franja habría puesto a trabajar a Claude en el repositorio
    // con el token de Javi (claude.yml atiende a sus comentarios).
    if (!fotogramaValido(f) || ids.has(f.id)) continue;
    const nuevo = { id: f.id, minuto: f.minuto, miniatura: f.miniatura, tira: f.tira, ...(f.marcador ? { marcador: f.marcador } : {}), ...(f.tabla ? { tabla: true } : {}) };
    if (fotogramas.length >= maximo) {
      // Las ÚLTIMAS (3.40.0), como en el lector: la nueva saca a la más vieja
      // que no sea tabla, y la tabla del resultado entra siempre (3.37.0).
      const i = fotogramas.findIndex((x) => !x.tabla);
      if (i < 0 && !f.tabla) continue;
      const fuera = i >= 0 ? i : 0;
      ids.delete(fotogramas[fuera].id);
      fotogramas.splice(fuera, 1);
    }
    fotogramas.push(nuevo);
    ids.add(f.id);
  }
  const resultado = final.resultado === 'gane' || final.resultado === 'perdi' ? final.resultado : null;
  // Cuánto duró la partida (3.44.0, del inicio que vio el lector a la tabla)
  // y si la voz funciona: lo de la voz se enseña, la duración se apunta.
  const duracion = esDuracionPosible(final.duracion) && !final.inicioEstimado ? final.duracion : null;
  const voz = ['ok', 'falta', 'otro'].includes(final.voz) ? final.voz : null;
  return { suyo: true, fotogramas, resultado, resultadoEn: resultado && Number.isFinite(final.resultadoEn) ? final.resultadoEn : null, duracion, voz };
}

/**
 * El guion de los consejos en directo (3.44.0), traducido para el lector:
 * cada aviso del motor (`plan.directo`: minuto y frases con clave) a texto, y
 * una frase de cierre por tramo de duración. Con su huella, para volver a
 * mandarlo solo si cambia (fijaste otro pick).
 */
export function guionTraducido(plan, t, idioma = 'es') {
  const guion = (plan?.directo ?? []).map((a) => ({ min: a.min, texto: a.partes.map((p) => t(p.clave, p.params)).join(' ') }));
  const cierres = (plan?.cierres ?? []).map((c) => t(c.clave, c.params));
  return { guion, cierres, idioma, huella: JSON.stringify([guion, cierres, idioma]) };
}

/**
 * Lo que contestó Javi (o lo que se apuntó solo) con los fotogramas de esa
 * partida, para que el lector aprenda la palabra de la tabla (3.32.0).
 * Nunca lanza; sin fotogramas no pide nada.
 */
export async function ensenarResultado({ ids = [], gane, desde = null, base = URL_LECTOR, plazoMs = PLAZO_LECTOR_MS, pedir = (...a) => fetch(...a) } = {}) {
  // Con `desde` (3.44.1) el lector deja también de vigilar y de hablar de esa partida, aunque no haya fotogramas.
  if ((!ids.length && !Number.isFinite(desde)) || typeof gane !== 'boolean') return null;
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), plazoMs);
  try {
    const r = await pedir(`${base}/resultado`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, gane, ...(Number.isFinite(desde) ? { desde } : {}) }), cache: 'no-store', signal: corte.signal });
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
  const validos = fotogramas.filter(fotogramaValido);
  // Lo que más importa primero (3.40.0): la tabla del resultado y después las
  // más recientes. Por orden, las miniaturas reales (10–12 mil caracteres)
  // llenaban el mensaje con las cuatro o cinco primeras y la tabla, que va
  // la última, no se subió en ninguna de las incidencias #21–#35.
  const porImportancia = [...validos.filter((f) => f.tabla), ...validos.filter((f) => !f.tabla).reverse()];
  const caben = (cabecera, trozo) => {
    let largo = cabecera.length;
    const dentro = new Set();
    for (const f of porImportancia) { const t = trozo(f); if (largo + t.length <= TOPE_MENSAJE) { largo += t.length; dentro.add(f); } }
    return validos.filter((f) => dentro.has(f));
  };
  const trozoMini = (f) => `\n\n${f.id} · minuto ${f.minuto}${f.tabla ? ' · TABLA' : ''} · pantalla entera a 160 px (PNG, base64):\n\n${VALLA}\n${f.miniatura}\n${VALLA}`;
  const trozoTira = (f) => `\n\n${f.id} · minuto ${f.minuto}${f.tabla ? ' · TABLA' : ''}:\n\n${VALLA}\n${f.tira}\n${VALLA}`;
  // Y el recorte del marcador a resolución completa (3.44.0), con lo que
  // sobre DESPUÉS de las franjas: un marcador grande no deja fuera una franja.
  const trozoMarcador = (f) => `\n\n${f.id} · marcador a resolución completa:\n\n${VALLA}\n${f.marcador}\n${VALLA}`;
  const cabecera = `Fotogramas del final de una partida (${etiqueta}) · app ${version} · `;
  const enCuerpo = caben(cabecera + '000 de 000 pantallas distintas desde el minuto 00.\n', trozoMini);
  const cuerpo = `${cabecera}${enCuerpo.length} de ${validos.length} pantallas distintas desde el minuto ${DESDE_FINAL_MIN}.\n` + enCuerpo.map(trozoMini).join('');
  const enComentario = caben('Franjas de arriba a 320 px (PNG, base64):', trozoTira);
  let comentario = 'Franjas de arriba a 320 px (PNG, base64):' + enComentario.map(trozoTira).join('');
  for (const f of porImportancia.filter((x) => x.marcador)) {
    const trozo = trozoMarcador(f);
    if (comentario.length + trozo.length <= TOPE_MENSAJE) comentario += trozo;
  }
  return { titulo: `Final de partida (${etiqueta}): ${enCuerpo.length} de ${validos.length} pantallas${validos.some((f) => f.tabla) ? ', con la tabla' : ''}`, cuerpo, comentario };
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
