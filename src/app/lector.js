import { nombreClave } from '../motor/nombres.js';
import { esDuracionPosible } from '../motor/directo.js';

/**
 * El botón «Leer del juego» (3.25.0) habla con el lector, que desde 3.61.0
 * vive en la tablet (la APK «Lector MLBB», `scripts/lector/en-tablet.mjs`).
 * El puerto es el mismo que el del lector; hay una prueba que los compara.
 * Hasta 3.96.0 también podía ser el de Termux, en el propio móvil
 * (127.0.0.1): se quitó en 3.97.0, y sin tablet vinculada la app no pide
 * nada a ningún lector.
 */
export const PUERTO_LECTOR = 47323;

/**
 * El lector EN LA TABLET (3.61.0, la APK «Lector MLBB»): escucha en la wifi
 * y solo contesta con su código de vinculación. Se vincula escaneando el QR
 * de la tablet, que abre la app con `#lector=IP:PUERTO&codigo=…`, o a mano
 * en Ajustes. Solo una IP PRIVADA escrita tal cual: Chrome exime del bloqueo
 * de contenido mixto las peticiones a una IP local (y `targetAddressSpace`
 * lo declara), y así el código no puede acabar en otro sitio de internet.
 */
const IP_PRIVADA = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;
export function sanearLectorTablet(x) {
  if (!x || typeof x !== 'object') return null;
  const [ip, puerto = String(PUERTO_LECTOR)] = String(x.direccion ?? '').trim().split(':');
  const codigo = String(x.codigo ?? '').replace(/[\s-]/g, '').toUpperCase();
  const p = Number(puerto);
  if (!IP_PRIVADA.test(ip) || !(Number.isInteger(p) && p > 0 && p < 65536) || !/^[A-Z0-9]{8,64}$/.test(codigo)) return null;
  return { direccion: `${ip}:${p}`, codigo };
}
/**
 * Buscar la tablet en la wifi cuando cambia de IP (3.65.4): el router le da
 * otra dirección de vez en cuando (la .116 pasó a ser la .112 el 23 de
 * octubre de 2026) y había que volver a escanear su QR. Se pregunta a las
 * otras IP de la misma red /24, en el mismo puerto, SIN el código: solo la
 * que contesta como Lector MLBB (401 con `error: 'codigo'`) recibe el código,
 * y vale si con él contesta `ok`. Así el código no se manda a cualquier
 * aparato de la casa. null si no aparece.
 */
/**
 * La prueba de que una tablet conoce el código sin que el código viaje
 * (3.70.0): PBKDF2-SHA256(código, «lector-reto:» + n, RETO_VUELTAS), en hex.
 * La misma cuenta que hace el lector con node:crypto (servir.mjs, hay prueba).
 */
export const RETO_VUELTAS = 100000;
export async function pruebaDelReto(codigo, n, sutil = globalThis.crypto.subtle) {
  const utf8 = (s) => new TextEncoder().encode(s);
  const llave = await sutil.importKey('raw', utf8(codigo), 'PBKDF2', false, ['deriveBits']);
  const bits = await sutil.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: utf8(`lector-reto:${n}`), iterations: RETO_VUELTAS }, llave, 256);
  return [...new Uint8Array(bits)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function buscarTabletEnLaRed(vinculo, { pedir = (...a) => fetch(...a), plazoMs = 1500, aLaVez = 32, azar = () => globalThis.crypto.getRandomValues(new Uint8Array(16)), probar = pruebaDelReto } = {}) {
  const v = sanearLectorTablet(vinculo);
  if (!v) return null;
  const [ip, puerto] = v.direccion.split(':');
  const base = ip.split('.').slice(0, 3).join('.');
  const candidatas = Array.from({ length: 254 }, (_, i) => `${base}.${i + 1}:${puerto}`).filter((d) => d !== v.direccion);
  const contesta = async (d, codigo = null) => {
    try {
      const r = await pedir(`http://${d}/estado`, { cache: 'no-store', signal: AbortSignal.timeout(plazoMs), targetAddressSpace: 'local', ...(codigo ? { headers: { 'X-Lector-Codigo': codigo } } : {}) });
      const j = await r.json().catch(() => null);
      return codigo ? r.ok && j?.ok === true : r.status === 401 && j?.error === 'codigo';
    } catch { return false; }
  };
  // ¿Conoce el código? Sin mandarlo (3.70.0): un aparato que contesta 401
  // «codigo» y luego ok a cualquier código se quedaba con él.
  const conoce = async (d) => {
    try {
      const n = [...azar()].map((b) => b.toString(16).padStart(2, '0')).join('');
      const r = await pedir(`http://${d}/reto?n=${n}`, { cache: 'no-store', signal: AbortSignal.timeout(plazoMs * 4), targetAddressSpace: 'local' });
      const j = await r.json().catch(() => null);
      return r.ok && typeof j?.prueba === 'string' && j.prueba === await probar(v.codigo, n);
    } catch { return false; }
  };
  for (let i = 0; i < candidatas.length; i += aLaVez) {
    const tanda = candidatas.slice(i, i + aLaVez);
    const vistas = await Promise.all(tanda.map((d) => contesta(d)));
    for (const [k, d] of tanda.entries()) {
      if (vistas[k] && await conoce(d) && await contesta(d, v.codigo)) return { direccion: d, codigo: v.codigo };
    }
  }
  return null;
}

/**
 * La búsqueda, una a la vez y como mucho cada `ENTRE_BUSQUEDAS_MS` (la piden
 * Ajustes y el aviso de fondo a la vez; 254 preguntas por la wifi no se
 * repiten cada pocos segundos). Decisión de producto: 2 minutos. null si no
 * toca o no aparece.
 */
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
/** Solo para las pruebas: olvidar la última búsqueda. */
export const olvidarBusqueda = () => { ultimaBusqueda = 0; busquedaEnCurso = null; };
/** Los fallos que dicen «no llego a la tablet» (no un código malo ni una captura que falla). */
export const sinLlegarALaTablet = (tipo) => tipo === 'sinPuente' || tipo === 'plazo';

/** Lo que trae el enlace del QR de la tablet (`#lector=IP:PUERTO&codigo=…`), o null. */
export function lectorTabletDeEnlace(hash) {
  const q = new URLSearchParams(String(hash ?? '').replace(/^#/, ''));
  return q.has('lector') ? sanearLectorTablet({ direccion: q.get('lector'), codigo: q.get('codigo') }) : null;
}
let enTablet = null;
/** La app dice aquí dónde está el lector (null: sin tablet vinculada, no hay lector). */
export const ponerLectorEnTablet = (x) => { enTablet = sanearLectorTablet(x); };
export const lectorEnTablet = () => enTablet;
export const baseLector = () => (enTablet ? `http://${enTablet.direccion}` : null);
/**
 * `fetch` al lector de la tablet, con el código y declarando que el destino
 * es la red local. Sin tablet vinculada no sale ninguna petición (3.97.0):
 * falla como un lector que no contesta.
 */
export const pedirAlLector = (url, opciones = {}) => (enTablet
  ? fetch(url, { ...opciones, headers: { ...(opciones.headers ?? {}), 'X-Lector-Codigo': enTablet.codigo }, targetAddressSpace: 'local' })
  : Promise.reject(new TypeError('sin tablet vinculada')));
/** Decisión de producto: la captura por wifi más el reconocimiento tardan 2–4 s; 20 s es «no está». */
export const PLAZO_LECTOR_MS = 20000;
/**
 * La corrección espera a que el lector APRENDA (3.41.0): decenas de segundos
 * por captura en un móvil, de tres a ocho capturas, y detrás de la tanda
 * anterior si la hay. Con los 20 s de una lectura la app cortaba y lo
 * aprendido no llegaba nunca a la partida (el lector sí aprendía). Es una
 * petición a la tablet que no bloquea nada: tres minutos, decisión de producto.
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
export const tocaLeerSolo = ({ auto, visible = true, hoja = null, completo = false, cerrado = false, leyendo = false, miPick = null, completoDesde = null, ahora = Date.now() }) => !!auto && visible && !hoja && !leyendo
  // Cerrado por la partida (3.46.0): ya no hay fila tuya que leer, se está jugando.
  && (!completo || (!cerrado && !miPick && Number.isFinite(completoDesde) && ahora - completoDesde >= 0 && ahora - completoDesde < LEER_TU_PICK_MS));

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
export const FALLOS_DEL_LECTOR = ['sinPuente', 'plazo', 'tablet', 'emparejar', 'captura', 'codigo', 'bloqueado', 'error'];
/** El fallo por la respuesta: 401 es el código de vinculación de la tablet, 429 que lo ha bloqueado tras varios malos. */
const falloDe = (respuesta, cuerpo) => (respuesta.status === 401 ? 'codigo' : respuesta.status === 429 ? 'bloqueado'
  : ['tablet', 'emparejar', 'captura'].includes(cuerpo?.error) ? cuerpo.error : 'error');
/** La clave del aviso de un fallo: qué hacer en la tablet (desde 3.97.0 no hay otro lector). */
export const claveDeFallo = (tipo, { auto = false } = {}) => {
  if (['sinPuente', 'captura', 'tablet', 'emparejar'].includes(tipo)) return `lector.enTablet.${auto ? 'auto.' : ''}${tipo === 'sinPuente' ? 'sinPuente' : 'captura'}`;
  if (['codigo', 'bloqueado'].includes(tipo)) return `lector.${tipo}`;
  if (auto) return 'lector.auto.error';
  // plazo, error, y los avisos que no son fallos (yaEstaba, nada).
  return `lector.${tipo}`;
};
const fallo = (tipo) => Object.assign(new Error(tipo), { tipo });

/**
 * Tu fila leída, solo si el héroe es de TU línea (3.46.1). Las skins hacen
 * que esa fila sea la peor leída, y un héroe mal reconocido ahí se fijaba
 * como tu pick: el 6 de octubre de 2026 «Hayabusa» (jungla) quedó fijado en
 * una partida de roam, la voz se calló (el plan de un pick fuera del ranking
 * no se dice) y la partida se apuntó sola con Hayabusa. En tus 134 partidas
 * con línea, esa es la ÚNICA con el héroe fuera de la línea: lo leído fuera
 * del pool es un error del lector, no un cambio de línea. Sin pool conocido
 * (aún sin datos), no se filtra.
 */
export const tuyoDeTuLinea = (nombres, pool) => (nombres?.tuyo && pool?.size && !pool.has(nombres.tuyo) ? { ...nombres, tuyo: null } : nombres);

/** Pide una lectura al lector. Devuelve lo que manda (`tuyos`, `suyos`, `enemigos`) o lanza un fallo con tipo. */
export async function pedirLectura({ base = baseLector(), plazoMs = PLAZO_LECTOR_MS, pedir = pedirAlLector } = {}) {
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
  if (!respuesta.ok) throw fallo(falloDe(respuesta, cuerpo));
  if (!cuerpo || !Array.isArray(cuerpo.enemigos)) throw fallo('error');
  return cuerpo;
}

/**
 * El estado del lector para el Diagnóstico (3.61.4): si contesta, y qué ha
 * aprendido. Sin él, «el lector no va» solo se veía tocando el botón. Nunca
 * lanza; plazo corto, que el diagnóstico no espere.
 */
/**
 * La clave con la que la tablet guarda tus partidas (3.76.0): con ella el
 * móvil ve y arregla lo mismo que «Mis partidas» de la APK. Solo con el
 * lector en la tablet (con su código). La clave o null; nunca lanza.
 */
/**
 * El sistema de un vistazo (3.77.0): lo que el móvil sabe de la tablet por
 * su `/estado`, en líneas para Ajustes. Cada línea es `{ clave, params,
 * mal }`: `mal` cuando hay que hacer algo. Lo que la tablet no dice
 * (una APK vieja) no sale.
 */
export function lineasDelSistema(estado, { ahora = Date.now() } = {}) {
  if (!estado?.ok) return [];
  const num = (x) => (Number.isFinite(x) ? x : 0);
  const L = [];
  const tablet = estado.tablet ?? {}, lector = estado.lector ?? {}, solo = estado.solo, partidas = estado.partidas, datos = estado.datos;
  if (typeof tablet.grabando === 'boolean') L.push({ clave: tablet.grabando ? 'sistema.grabando' : 'sistema.sinGrabar', params: {}, mal: !tablet.grabando });
  if (solo) L.push(solo.activo ? { clave: 'sistema.solo', params: { linea: solo.linea ?? '?' }, mal: false } : { clave: 'sistema.soloApagado', params: {}, mal: true });
  // Partidas desde que arrancó y cuántas apuntó sola (3.83.2): con tres sin apuntar ninguna, no ve el final.
  if (solo && num(solo.partidas) > 0) L.push({ clave: 'sistema.jugadas', params: { n: num(solo.partidas), apuntadas: num(solo.apuntadas) }, mal: num(solo.partidas) >= 3 && num(solo.apuntadas) === 0 });
  // Drafts cerrados sin leer los baneos (3.101.1): el 2 es `SIN_BANEOS_AVISO` de revisar-tablet (hay prueba).
  if (solo && num(solo.sinBaneos) >= 2) L.push({ clave: 'sistema.sinBaneos', params: { n: num(solo.sinBaneos) }, mal: true });
  const lecturas = num(lector.lecturas) + num(lector.lecturasSolo);
  if (lector && Object.keys(lector).length) L.push({ clave: 'sistema.lecturas', params: { n: lecturas, fallos: num(lector.fallosCaptura), minutos: num(lector.minutos) }, mal: lecturas > 10 && num(lector.fallosCaptura) / lecturas > 0.2 });
  if (partidas) {
    L.push({ clave: partidas.sinSubir ? 'sistema.partidasSinSubir' : 'sistema.partidas', params: { n: num(partidas.apuntadas), sinSubir: num(partidas.sinSubir) }, mal: num(partidas.sinSubir) > 0 && !!partidas.error });
    const total = num(partidas.porTabla) + num(partidas.porPregunta);
    if (total) L.push({ clave: 'sistema.resultados', params: { tabla: num(partidas.porTabla), total }, mal: false });
    // Las últimas diez leídas en la tabla, todas iguales (3.99.0): del 26 de octubre al 9 de noviembre apuntó 142 victorias y 3 derrotas sin que nada avisara.
    const ut = partidas.ultimasTabla;
    if (num(ut?.n) >= 10 && (num(ut.gane) === 0 || num(ut.gane) === num(ut.n))) L.push({ clave: ut.gane ? 'sistema.todasVictoria' : 'sistema.todasDerrota', params: { n: num(ut.n) }, mal: true });
    // Las que la tablet no supo cómo acabaron (3.82.1): sin resultado no cuentan para nada hasta que las contestes.
    if (num(partidas.sinResultado) > 0) L.push({ clave: 'sistema.sinResultado', params: { n: num(partidas.sinResultado) }, mal: true });
  }
  const fecha = Date.parse(datos?.fecha ?? '');
  if (Number.isFinite(fecha)) { const h = Math.max(0, Math.round((ahora - fecha) / 3600000)); L.push({ clave: 'sistema.datos', params: { h }, mal: h > 72 }); }
  return L;
}

export async function pedirClaveDeLaTablet({ base = baseLector(), plazoMs = 4000, pedir = pedirAlLector, vinculada = !!enTablet } = {}) {
  if (!vinculada) return null;
  try {
    const r = await pedir(`${base}/clave`, { cache: 'no-store', signal: AbortSignal.timeout(plazoMs) });
    if (!r.ok) return null;
    const c = (await r.json())?.clave;
    return typeof c === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(c) ? c : null;
  } catch { return null; }
}

export async function pedirEstadoLector({ base = baseLector(), plazoMs = 3000, pedir = pedirAlLector } = {}) {
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), plazoMs);
  try {
    const r = await pedir(`${base}/estado`, { cache: 'no-store', signal: corte.signal });
    let cuerpo = null;
    try { cuerpo = await r.json(); } catch { /* vacío */ }
    if (!r.ok) return { ok: false, tipo: falloDe(r, cuerpo) };
    const objeto = (x) => (x && typeof x === 'object' && !Array.isArray(x) ? x : null);
    return { ok: true, aprendido: cuerpo?.aprendido ?? null, resultados: cuerpo?.resultados ?? null, salida: typeof cuerpo?.salida === 'string' ? cuerpo.salida.slice(0, 500) : null, lector: objeto(cuerpo?.lector), tablet: objeto(cuerpo?.tablet), partidas: objeto(cuerpo?.partidas), datos: objeto(cuerpo?.datos), solo: objeto(cuerpo?.solo) };
  } catch {
    return { ok: false, tipo: corte.signal.aborted ? 'plazo' : 'sinPuente' };
  } finally { clearTimeout(reloj); }
}

/**
 * Devuelve al lector lo que había de verdad (3.27.0): con los ids de sus
 * capturas y los enemigos y baneos finales (corregidos a mano), cruza el
 * pantallazo con la verdad y aprende dónde están los huecos en esa tablet
 * y qué cara pinta. Desde 3.58.0 también tu equipo y tu pick, para que
 * aprenda las caras de tus compañeros con sus skins. Nunca lanza: si el
 * lector no está, no pasa nada.
 */
export async function corregirLectura({ ids = [], enemigos = [], baneos = [], aliados = [], tuyo = null, base = baseLector(), plazoMs = PLAZO_CORREGIR_MS, pedir = pedirAlLector } = {}) {
  if (!ids.length || !enemigos.length) return null;
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), plazoMs);
  try {
    const r = await pedir(`${base}/corregir`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ids, enemigos, baneos, aliados, ...(tuyo ? { tuyo } : {}) }), cache: 'no-store', signal: corte.signal });
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
 * en segundos. Los captura el lector de la tablet, que sigue despierto con el
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

/**
 * Lecturas seguidas con la tablet ya en partida (el lector lo dice por el
 * minimapa, `partida`) para dar el draft por cerrado aunque falte alguien
 * (3.46.0). Las mismas dos capturas seguidas con que el lector da la
 * partida por empezada (`LECTURAS_EN_PARTIDA` de servir.mjs, con prueba).
 */
export const LECTURAS_EN_PARTIDA = 2;
/** Cuenta las lecturas seguidas en partida: una que no lo está (o un lector viejo sin el dato) vuelve a cero. */
export const lecturasEnPartida = (seguidas, lectura) => (lectura?.partida === true ? seguidas + 1 : 0);

/** ¿Toca preguntar al lector por el final? Con el modo encendido, la app a la vista y el draft completo: el reloj lo lleva el lector. */
export const tocaVigilarFinal = ({ auto, visible = true, completoDesde }) => !!auto && visible && !!completoDesde;

/**
 * Avisa al lector de que el draft se completó en `desde` (reloj del móvil,
 * el mismo que el suyo): desde entonces vigila el final por su cuenta.
 * Devuelve lo vigilado hasta ahora, o null si no hay lector. Nunca lanza.
 */
export async function avisarVigilancia({ desde, base = baseLector(), plazoMs = PLAZO_LECTOR_MS, pedir = pedirAlLector } = {}) {
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
export async function pedirFinal({ base = baseLector(), plazoMs = PLAZO_LECTOR_MS, pedir = pedirAlLector } = {}) {
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
  if (!final || !Number.isFinite(completoDesde) || final.desde !== completoDesde) return { suyo: false, fotogramas: actuales, resultado: null, resultadoEn: null, duracion: null };
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
  // Cuánto duró la partida (3.44.0, del inicio que vio el lector a la tabla): se apunta.
  const duracion = esDuracionPosible(final.duracion) && !final.inicioEstimado ? final.duracion : null;
  return { suyo: true, fotogramas, resultado, resultadoEn: resultado && Number.isFinite(final.resultadoEn) ? final.resultadoEn : null, duracion };
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
 * Qué Lector MLBB contesta (3.65.2), con lo que da `/estado` y la última
 * publicada: 'antigua' (anterior a 3.63.0: sin bloque `lector`, no se
 * actualiza sola), 'atrasada' (hay una más nueva), 'alDia', 'nose' o
 * 'sinRespuesta' (con el `tipo` del fallo).
 */
export function queApk(estado, ultima = null) {
  // Sin respuesta (3.65.3): antes no se decía nada y Ajustes se quedaba mudo.
  if (!estado?.ok) return { estado: 'sinRespuesta', tipo: estado?.tipo ?? 'sinPuente' };
  if (!estado.lector) return { estado: 'antigua', ultima };
  const tuya = estado.tablet?.apk ?? null;
  if (!tuya) return { estado: 'nose', ultima };
  if (ultima && versionAnterior(tuya, ultima)) return { estado: 'atrasada', tuya, ultima };
  return { estado: ultima ? 'alDia' : 'nose', tuya, ultima };
}

/** La APK más reciente, siempre en la misma dirección de GitHub. */
export const DESCARGA_APK = 'https://github.com/srchipiron/mobile-legends-pick-assist/releases/latest/download/lector-mlbb.apk';

/**
 * La versión de la última Lector MLBB publicada (3.65.2): las anteriores a
 * 3.64.0 no se actualizan solas y nadie lo decía. Sin token (es pública).
 * null si no se sabe. Nunca lanza.
 */
export async function pedirUltimaApk({ pedir = (...a) => fetch(...a), plazoMs = 4000 } = {}) {
  try {
    const r = await pedir('https://api.github.com/repos/srchipiron/mobile-legends-pick-assist/releases/latest', { cache: 'no-store', headers: { Accept: 'application/vnd.github+json' }, signal: AbortSignal.timeout(plazoMs) });
    if (!r.ok) return null;
    const m = /^lector-v(\d+\.\d+\.\d+)$/.exec(String((await r.json())?.tag_name ?? ''));
    return m ? m[1] : null;
  } catch { return null; }
}

/**
 * Lo que la tablet enseña (3.62.0): tu nº1 en la burbuja sobre el juego y,
 * al apuntar una partida, su resumen como notificación. Solo con el lector
 * EN LA TABLET. Nunca lanza.
 */
export async function mandarALaTablet(cuerpo, { base = baseLector(), plazoMs = PLAZO_LECTOR_MS, pedir = pedirAlLector } = {}) {
  if (!enTablet) return false;
  const corte = new AbortController();
  const reloj = setTimeout(() => corte.abort(), plazoMs);
  try {
    const r = await pedir(`${base}/consejo`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(cuerpo), cache: 'no-store', signal: corte.signal });
    return r.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(reloj);
  }
}

/**
 * El consejo de la burbuja: tu pick (el fijado o el nº1) con su
 * probabilidad, y debajo los dos siguientes. Sin ranking, nada.
 */
export function consejoParaLaTablet({ eleccion, ranking = [], fase = 'picks', baneos = [], deLosTuyos = null }, t) {
  // En la fase de baneos (3.65.5) lo que sirve es a quién banear, con tu
  // nº1 de ahora como recordatorio: el pick no se decide hasta después.
  // La fase va delante en la segunda línea (3.69.2): así se ve en la burbuja
  // que la app sabe en qué punto del draft estás.
  const conFase = (resto) => [t(fase === 'baneos' ? 'tablet.fase.baneos' : 'tablet.fase.picks'), resto].filter(Boolean).join(' · ');
  if (fase === 'baneos' && baneos.length) {
    const lista = baneos.slice(0, 3).map((b) => b.heroe?.name).filter(Boolean).join(' · ');
    if (lista) return { titulo: t('tablet.banea', { lista }), detalle: conFase(eleccion?.heroe ? t('tablet.tuNumeroUno', { heroe: eleccion.heroe.name }) : null) };
  }
  if (!eleccion?.heroe || !ranking.length) return null;
  const pct = (p) => `${Math.round(p * 100)}%`;
  const siguientes = ranking.filter((r) => r.heroe.name !== eleccion.heroe.name).slice(0, 2);
  const otros = siguientes.map((r) => `${r.heroe.name} ${pct(r.p)}`);
  // El mejor de los tuyos (3.72.0), si no es ya uno de los que se nombran.
  const tuyo = deLosTuyos?.heroe && deLosTuyos.heroe.name !== eleccion.heroe.name && !siguientes.some((r) => r.heroe.name === deLosTuyos.heroe.name)
    ? t('tablet.deLosTuyos', { heroe: `${deLosTuyos.heroe.name} ${pct(deLosTuyos.p)}` }) : null;
  return { titulo: `${eleccion.heroe.name} ${pct(eleccion.p)}`, detalle: conFase([otros.length ? t('tablet.siguientes', { lista: otros.join(' · ') }) : null, tuyo].filter(Boolean).join(' · ') || null) };
}

/** El resumen de la partida recién apuntada: con quién, si era el consejo y cómo vas en las últimas. */
export function resumenParaLaTablet({ t: instante, pick, gane, recomendados = [], estimacion = null, ultimas = [] }, t) {
  const primero = recomendados[0];
  const ganadas = ultimas.filter((p) => p.gane).length;
  return {
    id: `partida-${instante}`,
    titulo: t(gane ? 'tablet.resumen.ganada' : 'tablet.resumen.perdida', { pick }),
    texto: [
      primero && nombreClave(primero) === nombreClave(pick) ? t('tablet.resumen.eraPrimero') : primero ? t('tablet.resumen.otroPrimero', { primero }) : null,
      estimacion != null ? t('tablet.resumen.daba', { p: Math.round(estimacion * 100) }) : null,
      ultimas.length ? t('tablet.resumen.ultimas', { n: ultimas.length, g: ganadas }) : null,
    ].filter(Boolean).join(' '),
  };
}

/**
 * Lo que contestó Javi (o lo que se apuntó solo) con los fotogramas de esa
 * partida (3.32.0). Desde 3.99.0 el lector ya no aprende de esto (las
 * plantillas de la tabla son fijas y medidas): solo deja de vigilar esa
 * partida. Nunca lanza; sin fotogramas ni `desde` no pide nada.
 */
export async function ensenarResultado({ ids = [], gane, desde = null, base = baseLector(), plazoMs = PLAZO_LECTOR_MS, pedir = pedirAlLector } = {}) {
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
 * Los baneos de una lectura solo entran si lee la FILA (3.101.3): dos
 * distintos. Con la fila de baneos rota desde el 11 de noviembre de 2026,
 * 28 de 949 lecturas «leían» un baneo suelto que no estaba (hasta tu propio
 * pick); con la fila bien, el 99% de los baneos vistos iban con otros. Es
 * `BANEOS_EN_EL_DRAFT` de la tablet (solo.mjs): hay prueba de que coinciden.
 */
export const BANEOS_DE_LA_FILA = 2;

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
  const baneos = [...new Set([...resolver(lectura?.tuyos), ...resolver(lectura?.suyos)])];
  return {
    baneos: baneos.length >= BANEOS_DE_LA_FILA ? baneos : [],
    enemigos: [...new Set(resolver(lectura?.enemigos))],
    aliados,
    tuyo,
    huecos: { enemigos: porHueco(lectura?.enemigos), aliados: tuyoFila >= 0 ? porHueco(filas, tuyoFila) : [] },
  };
}

/**
 * Cuántos jugadores de un equipo pueden cambiar de héroe a la vez en la
 * fase de picks: el orden es 1-2-2-2-2-1, así que como mucho dos de un
 * mismo equipo eligen a la vez (definido por el juego).
 */
export const CAMBIOS_A_LA_VEZ = 2;

/**
 * ¿Esta lectura de un equipo ya no es la fase de picks? (3.54.0) Si cambian
 * a la vez MÁS huecos ya leídos de los que pueden estar eligiendo (a otro
 * héroe o a «?»), la tablet enseña otra cosa: la fase de skins (cada
 * jugador con su skin), una ventana encima que oscurece el panel o la
 * carga. Medido en los recortes que subió el lector del 10 al 12 de octubre
 * de 2026: en esas pantallas el lector «reconocía» a Wanwan (0,81–0,87),
 * Esmeralda, Joy, Beatrix o Harley donde no estaban, y `cambiosDeHueco`
 * quitaba por ellos al héroe bueno. Al pasar de la última captura de picks
 * a la primera de skins cambian los cinco. Esa lectura no toca ese equipo.
 */
export function fueraDeLosPicks(anteriores = [], actuales = []) {
  let cambios = 0;
  for (let i = 0; i < Math.min(anteriores.length, actuales.length); i += 1) {
    if (anteriores[i] && actuales[i] !== anteriores[i]) cambios += 1;
  }
  return cambios > CAMBIOS_A_LA_VEZ;
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
