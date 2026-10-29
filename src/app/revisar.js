/**
 * Revisar lo que no vio el lector, con sus capturas (3.86.0). Javi: «desde
 * el PC, ¿puedo corregirte los picks? Haz algún sistema para ver las
 * capturas y ayudarte a identificar cada héroe». La tablet sube, de cada
 * draft que no leyó entero, las diez caras (sin nombres de jugadores) y lo
 * leído hueco a hueco (`recortes`, 3.81.0). Aquí se cruzan con TUS partidas
 * por el instante (`partida` = `t`) y se arma, hueco a hueco, lo que se
 * enseña y lo que se guarda. Guardar es arreglar la partida (`editada`): la
 * tablet aprende de lo arreglado (`aprenderDeLoArreglado`, 3.83.0) con SUS
 * recortes, no con estos.
 *
 * Puro: sin red ni React. Lo que llega de la base de datos lo escribe
 * cualquiera con la clave pública, así que se valida por forma y la imagen
 * solo pasa si es un PNG en base64 de tamaño acotado.
 */

/** La composición de diez caras de recortes.mjs (en la referencia): tu equipo a la izquierda, el suyo a la derecha, una fila por jugador. */
export const COMPOSICION = { ancho: 420, alto: 850, fila: 170, aliado: { x: 0, ancho: 190, alto: 170 }, enemigo: { x: 190, ancho: 230, alto: 160 } };
/** Lo que puede ocupar una imagen (base64): el tope de `recorteParaSubir` con margen. */
export const TOPE_IMAGEN = 80000;
/** Cuántas horas atrás se miran (el máximo de `recortes_recientes`: 60 días). */
export const HORAS_DE_RECORTES = 1440;

const PNG_BASE64 = /^iVBORw0KGgo[A-Za-z0-9+/]*={0,2}$/;
export const imagenValida = (b64) => typeof b64 === 'string' && b64.length <= TOPE_IMAGEN && PNG_BASE64.test(b64);

const huecos = (lista, nombre) => [0, 1, 2, 3, 4].map((i) => (Array.isArray(lista) ? nombre(lista[i]) : null));

/** Mete en los huecos vacíos, por orden, a los de la partida que no salen ya: con uno sin leer y la partida completa, cae en su sitio. */
function completar(lista, extra, saltar = -1) {
  const salen = new Set(lista.filter(Boolean));
  const faltan = (extra ?? []).filter((n) => n && !salen.has(n));
  return lista.map((n, i) => (n || i === saltar ? n : faltan.shift() ?? null));
}

/** ¿La partida aún tiene algo que revisar? Draft a medias o tu pick supuesto. */
export const porRevisar = (p) => !!p && (p.supuesto === true || (p.draft?.enemigos?.length ?? 0) < 5 || (p.draft?.aliados?.length ?? 0) < 4);

/**
 * Las revisiones: una por partida tuya con recorte (el más reciente), las
 * pendientes primero y luego de la más nueva a la más vieja. `heroes`: los
 * nombres del catálogo (lo que no esté sale vacío). Nunca lanza.
 */
export function revisiones(recortes = [], partidas = [], heroes = []) {
  const porClave = new Map((heroes ?? []).map((n) => [String(n).toLowerCase(), n]));
  const nombre = (n) => (typeof n === 'string' ? porClave.get(n.toLowerCase()) ?? null : null);
  const porT = new Map((partidas ?? []).filter((p) => Number.isFinite(p?.t)).map((p) => [p.t, p]));
  // Los recortes los puede subir cualquiera con la clave pública (3.86.1, revisión de seguridad): si la
  // misma partida trae recortes de DOS lectores, uno se hace pasar por el tuyo y no se sabe cuál; no sale.
  const lectores = new Map();
  for (const fila of recortes ?? []) {
    const d = fila?.d ?? fila;
    if (Number.isFinite(d?.partida)) lectores.set(d.partida, new Set([...(lectores.get(d.partida) ?? []), fila?.j ?? null]));
  }
  const vistas = new Map();
  for (const fila of recortes ?? []) {
    const d = fila?.d ?? fila;
    if (!d || typeof d !== 'object' || d.tipo === 'final' || !Number.isFinite(d.partida)) continue;
    const partida = porT.get(d.partida);
    if (!partida || vistas.has(d.partida) || lectores.get(d.partida).size > 1) continue;
    const capturas = (Array.isArray(d.capturas) ? d.capturas : []).filter((c) => typeof c?.id === 'string' && /^lectura-[\w-]{1,80}$/.test(c.id) && imagenValida(c.picks)).slice(0, 2).map((c) => ({ id: c.id, png: c.picks }));
    if (!capturas.length) continue;
    const l = d.leidos ?? {};
    const tuyoFila = Number.isInteger(l.tuyoFila) && l.tuyoFila >= 0 && l.tuyoFila < 5 ? l.tuyoFila : -1;
    const draft = partida.draft ?? {};
    const enemigos = completar(huecos(l.enemigos, nombre), (draft.enemigos ?? []).map(nombre));
    const aliados = huecos(l.aliados, nombre);
    // Tu fila es tu pick (si no es supuesto: entonces es lo que hay que decir).
    if (tuyoFila >= 0) aliados[tuyoFila] = partida.supuesto ? null : nombre(partida.pick);
    vistas.set(d.partida, { t: d.partida, partida, capturas, tuyoFila, enemigos, aliados: completar(aliados, (draft.aliados ?? []).map(nombre), tuyoFila), pendiente: porRevisar(partida) });
  }
  return [...vistas.values()].sort((a, b) => (b.pendiente - a.pendiente) || b.t - a.t);
}

/**
 * Lo que se guarda de los diez huecos: `{ pick, enemigos, aliados }` con
 * nombres del catálogo, o `{ error }` («repetido», «tuyo» si no se sabe cuál
 * eres o falta). Sin tu fila leída (`tuyoFila` −1), `tuyo` va aparte.
 */
export function cambiosDeRevision({ enemigos = [], aliados = [], tuyoFila = -1, tuyo = null }, heroes = []) {
  const porClave = new Map((heroes ?? []).map((n) => [String(n).toLowerCase(), n]));
  const nombre = (n) => (typeof n === 'string' && n.trim() ? porClave.get(n.trim().toLowerCase()) ?? undefined : null);
  const e = enemigos.slice(0, 5).map(nombre), a = aliados.slice(0, 5).map(nombre);
  if ([...e, ...a].includes(undefined) || nombre(tuyo) === undefined) return { error: 'nombre' };
  const pick = tuyoFila >= 0 ? a[tuyoFila] : nombre(tuyo);
  if (!pick) return { error: 'tuyo' };
  const companeros = a.filter((n, i) => n && i !== tuyoFila && !(tuyoFila < 0 && n === pick));
  const todos = [pick, ...e.filter(Boolean), ...companeros];
  if (new Set(todos).size !== todos.length) return { error: 'repetido' };
  return { pick, enemigos: e.filter(Boolean), aliados: companeros.slice(0, 4) };
}

/**
 * Cómo pintar la cara de un hueco con la imagen compuesta como fondo:
 * tamaño de la caja y del fondo, y su posición, a `escala` píxeles por
 * píxel de la referencia (la imagen puede venir a cualquier tamaño).
 */
export function encuadre(lado, i, escala) {
  const c = COMPOSICION[lado === 'enemigos' ? 'enemigo' : 'aliado'];
  const r = (x) => Math.round(x * escala);
  return { ancho: r(c.ancho), alto: r(c.alto), fondo: `${r(COMPOSICION.ancho)}px ${r(COMPOSICION.alto)}px`, posicion: `${-r(c.x)}px ${-r(i * COMPOSICION.fila)}px` };
}
