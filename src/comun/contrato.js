/**
 * El contrato entre el móvil (src/app) y la tablet (scripts/lector, dentro de la APK).
 *
 * Protocolo 2 (4.0.0): la tablet es la ÚNICA que lleva el draft (lo lee,
 * lo acumula, lo cierra, vigila el final y apunta la partida). El móvil lo
 * copia con `GET /draft` y le manda lo que tú tocas: la corrección del draft,
 * el resultado y tus ajustes. Antes los dos acumulaban por su lado y hacían
 * falta reglas de quién manda (3.86.2, 3.86.3).
 *
 * Todo lo que cruza la wifi se sanea en los DOS lados: para el móvil, lo de la
 * tablet es un dato de fuera, y al revés. Va dentro de la APK: nada de `\p{}`
 * ni del indicador `v` en las expresiones (el Node 18 de la APK no los compila).
 */

/** [C] El puerto del servidor de la tablet; el QR y las tablets ya vinculadas lo llevan dentro. */
export const PUERTO = 47323;
/** [C] Versión del protocolo; `GET /estado` y `GET /draft` la dicen. */
export const PROTOCOLO = 2;
/** [C] Vueltas de PBKDF2 del reto de la búsqueda (~50 ms por prueba en la tablet). */
export const RETO_VUELTAS = 100000;
/** [C] Una IP privada escrita tal cual: nunca un nombre (rebinding de DNS). */
export const IP_PRIVADA = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})$/;
/** [C] Lo que puede ser un nombre de héroe (letras latinas, espacios y . ' & -). */
export const NOMBRE_DE_HEROE = /^[A-Za-z0-9À-ÖØ-öø-ÿ .'&-]{1,40}$/;

/** [M] Baneos DISTINTOS en una lectura para fiarse de la fila: el 99 % de los reales (3.874/3.914) van con ≥2. */
export const BANEOS_EN_EL_DRAFT = 2;
/** [D] Huecos que cambian a la vez en el draft (orden 1-2-2-2-2-1): más es la fase de skins. */
export const CAMBIOS_A_LA_VEZ = 2;
/** [D] Capturas seguidas con minimapa para dar la partida por empezada. */
export const LECTURAS_EN_PARTIDA = 2;
/** [D] Partidas seguidas con el mismo resultado por tabla que hacen sospechar (<1 % por azar). */
export const TABLA_SEGUIDAS = 10;
/** [D] Partidas sin leer los baneos que encienden el aviso. */
export const SIN_BANEOS_AVISO = 2;
/** [D] Una pregunta «¿Cómo acabó?» sin contestar caduca (y las capturas se guardan lo mismo). */
export const PREGUNTA_CADUCA_MS = 3 * 60 * 60 * 1000;
/** [P] Cada cuánto copia el móvil el draft de la tablet con la app a la vista. */
export const INTERVALO_DRAFT_MS = 2000;
/** [P] Héroes de tu maestría que acepta la tablet. */
export const MAESTRIA_MAX = 200;

/**
 * Qué rutas hay y QUIÉN puede usarlas. `app` exige `Origin` permitido; `apk`
 * exige el socket desde 127.0.0.1 y SIN `Origin` (un navegador siempre lo
 * pone); todas, menos `/reto`, el código de vinculación.
 */
export const RUTAS = Object.freeze({
  'GET /reto': 'cualquiera',
  'GET /estado': 'ambos',
  'GET /clave': 'app',
  'GET /draft': 'app',
  'POST /draft': 'app',
  'POST /ajustes': 'app',
  'POST /resultado': 'app',
  'GET /consejo': 'apk',
  'GET /correccion': 'apk',
  'POST /correccion': 'apk',
  'GET /pregunta': 'apk',
  'POST /pregunta': 'apk',
  'GET /partidas': 'apk',
  'POST /partida': 'apk',
});

const esNombre = (v) => typeof v === 'string' && NOMBRE_DE_HEROE.test(v);
const nombreOVacio = (v) => (esNombre(v) ? v : null);
const instante = (v) => (Number.isFinite(v) && v > 0 && v < 1e14 ? Math.trunc(v) : null);
/** Hasta `n` nombres, sin repetir y sin lo que no tenga forma. */
const lista = (v, n) => [...new Set((Array.isArray(v) ? v : []).filter(esNombre))].slice(0, n);
/** Cinco huecos: nombre o null. */
const huecos = (v) => Array.from({ length: 5 }, (_, i) => nombreOVacio(Array.isArray(v) ? v[i] : null));
const palabra = (v) => (typeof v === 'string' && /^[a-z]{2,12}$/.test(v) ? v : null);

/** Lo que el móvil le dice a la tablet de ti (`POST /ajustes`). null sin línea. */
export function sanearAjustes(a) {
  const linea = palabra(a?.linea);
  if (!linea) return null;
  const maestria = {};
  if (a?.maestria && typeof a.maestria === 'object' && !Array.isArray(a.maestria)) {
    for (const [nombre, m] of Object.entries(a.maestria).slice(0, MAESTRIA_MAX)) {
      if (esNombre(nombre) && nombre.length <= 30 && Number.isInteger(m?.games) && m.games > 0 && m.games < 1e6
        && typeof m.winRate === 'number' && m.winRate >= 0 && m.winRate <= 1) maestria[nombre] = { games: m.games, winRate: m.winRate };
    }
  }
  const clave = typeof a?.clave === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(a.clave) ? a.clave : null;
  return { linea, rango: palabra(a?.rango) ?? 'glory', idioma: a?.idioma === 'en' ? 'en' : 'es',
    ...(Object.keys(maestria).length ? { maestria } : {}), ...(clave ? { clave } : {}) };
}

/**
 * El draft que lleva la tablet (`GET /draft` → `draft`). `desde` es su
 * identidad (cuándo se vio por primera vez); `aliados` son los cinco huecos
 * de tu equipo, con el tuyo en `tuyoFila` (−1 si no se distingue).
 */
export function sanearDraftTablet(d) {
  const desde = instante(d?.desde);
  if (!desde) return null;
  const tuyoFila = Number.isInteger(d?.tuyoFila) && d.tuyoFila >= -1 && d.tuyoFila <= 4 ? d.tuyoFila : -1;
  const aliados = huecos(d?.aliados);
  return {
    desde,
    cambiado: instante(d?.cambiado) ?? desde,
    cerrado: d?.cerrado === true,
    cerradoEn: d?.cerrado === true ? instante(d?.cerradoEn) : null,
    linea: palabra(d?.linea),
    enemigos: huecos(d?.enemigos),
    aliados,
    tuyoFila,
    tuyo: nombreOVacio(d?.tuyo) ?? (tuyoFila >= 0 ? aliados[tuyoFila] : null),
    baneos: lista(d?.baneos, 10),
    porPicks: d?.porPicks === true,
    corregido: d?.corregido === true,
  };
}

const ESTADOS_DE_PARTIDA = new Set(['vigilando', 'preguntando', 'apuntada', 'sinResultado']);

/**
 * La partida del último draft cerrado (`GET /draft` → `partida`). `registro`
 * es la partida tal como la apuntó la tablet (forma de `apuntar`, motor/registro.js);
 * el móvil la funde con el MISMO `t`, así que la base de datos no la duplica.
 * Aquí solo se mira que sea un objeto con `t`: su forma la sanea el motor.
 */
export function sanearPartidaTablet(p) {
  const desde = instante(p?.desde);
  if (!desde || !ESTADOS_DE_PARTIDA.has(p?.estado)) return null;
  const registro = p?.estado === 'apuntada' && p?.registro && typeof p.registro === 'object' && !Array.isArray(p.registro) && instante(p.registro.t)
    ? p.registro : null;
  return { desde, estado: p.estado, gane: typeof p?.gane === 'boolean' ? p.gane : null, registro };
}

/** La respuesta entera de `GET /draft`. null si no es del protocolo 2. */
export function sanearRespuestaDraft(r) {
  if (r?.protocolo !== PROTOCOLO) return null;
  const fase = ['draft', 'fuera', 'partida'].includes(r?.fase) ? r.fase : null;
  return { protocolo: PROTOCOLO, fase, draft: sanearDraftTablet(r?.draft), partida: sanearPartidaTablet(r?.partida) };
}

/**
 * Lo que corriges a mano en el móvil (`POST /draft`): manda sobre lo leído
 * en ESE draft (el consejo de la burbuja, la partida que se apunte) y la
 * tablet aprende de ello. `aliados` son tus compañeros, sin ti.
 */
export function sanearCorreccion(c) {
  const desde = instante(c?.desde);
  if (!desde) return null;
  const tuyo = nombreOVacio(c?.tuyo);
  const enemigos = lista(c?.enemigos, 5);
  const aliados = lista(c?.aliados, 4).filter((n) => n !== tuyo && !enemigos.includes(n));
  const elegidos = new Set([...enemigos, ...aliados, tuyo].filter(Boolean));
  return { desde, enemigos, aliados, tuyo, baneos: lista(c?.baneos, 10).filter((n) => !elegidos.has(n)) };
}

/** El resultado que das en el móvil (`POST /resultado`): `gane` null es «no la terminé». */
export function sanearResultado(r) {
  const desde = instante(r?.desde);
  if (!desde || !(typeof r?.gane === 'boolean' || r?.gane === null)) return null;
  return { desde, gane: r.gane };
}
