import { probablesDelBando } from '../motor/draft.js';
import { filtrarPorNombre } from '../motor/alias.js';

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

/** Cuántos de tus héroes salen como botón junto a tu hueco (3.87.3): los mismos que la burbuja de la tablet (`HABITUALES`). */
export const TUS_HABITUALES = 6;

/**
 * Tus héroes más jugados en tus partidas (3.87.3), para rellenar TU hueco
 * con un toque: en las capturas de antes de 3.86.5 tu hueco sale vacío
 * (eliges el último) y había que acordarse y escribirlo. Sin los que ya
 * salen en el draft ni los supuestos (no los jugaste seguro); a igualdad,
 * el último jugado. Solo nombres del catálogo.
 */
export function tusMasJugados(partidas = [], heroes = [], fuera = [], n = TUS_HABITUALES) {
  const porClave = new Map((heroes ?? []).map((h) => [String(h).toLowerCase(), h]));
  const salen = new Set((fuera ?? []).filter((x) => typeof x === 'string').map((x) => x.toLowerCase()));
  const cuenta = new Map();
  for (const p of partidas ?? []) {
    const nombre = typeof p?.pick === 'string' ? porClave.get(p.pick.toLowerCase()) : null;
    if (!nombre || p.supuesto === true || salen.has(nombre.toLowerCase())) continue;
    const c = cuenta.get(nombre) ?? { n: 0, t: 0 };
    cuenta.set(nombre, { n: c.n + 1, t: Math.max(c.t, Number.isFinite(p.t) ? p.t : 0) });
  }
  return [...cuenta.entries()].sort((a, b) => b[1].n - a[1].n || b[1].t - a[1].t).slice(0, n).map(([h]) => h);
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

/** Cuántos de tus compañeros de siempre van delante al elegir un compañero (3.89.0): los mismos que tus héroes (`TUS_HABITUALES`). */
export const COMPANEROS_HABITUALES = TUS_HABITUALES;

/**
 * Los héroes que más salen a tu lado en tus partidas (3.89.0), sin los que
 * ya están en el draft. Juegas con amigos: el hueco que no se leyó suele ser
 * uno de los suyos. Medido en tus 260 partidas: el que falta está entre
 * estos seis en el 23% de los huecos, y entre los seis primeros del motor
 * solo en el 9%.
 */
export function companerosHabituales(partidas = [], heroes = [], fuera = [], n = COMPANEROS_HABITUALES) {
  const porClave = new Map((heroes ?? []).map((h) => [String(h).toLowerCase(), h]));
  const salen = new Set((fuera ?? []).filter((x) => typeof x === 'string').map((x) => x.toLowerCase()));
  const cuenta = new Map();
  for (const p of partidas ?? []) {
    for (const a of Array.isArray(p?.draft?.aliados) ? p.draft.aliados : []) {
      const nombre = typeof a === 'string' ? porClave.get(a.toLowerCase()) : null;
      if (!nombre || salen.has(nombre.toLowerCase())) continue;
      cuenta.set(nombre, (cuenta.get(nombre) ?? 0) + 1);
    }
  }
  return [...cuenta.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, n).map(([h]) => h);
}

/** Cuántas caras salen al tocar un hueco (3.89.0): el rival que falta está entre las 24 primeras del motor en el 70% de tus huecos. Decisión de producto. */
export const CARAS_POR_HUECO = 24;

/**
 * Las caras para elegir quién va en un hueco (3.89.0), en orden: `primeros`
 * (tus héroes o tus compañeros de siempre) y luego lo que el motor da por
 * más probable en ese equipo (`probablesDelBando`, el orden del selector de
 * la app). Buscando, cualquiera que case. Nunca uno que ya está en el draft
 * (`fuera`). `datos`: lo de `prepararDatos`.
 */
export function carasParaHueco(datos, { lado = 'enemigos', equipo = [], fuera = [], linea = null, primeros = [], buscar = '', n = CARAS_POR_HUECO } = {}) {
  const heroes = datos?.heroes ?? [];
  if (!heroes.length) return [];
  const porClave = new Map(heroes.map((h) => [h.name.toLowerCase(), h]));
  const de = (x) => (typeof x === 'string' ? porClave.get(x.toLowerCase()) ?? null : null);
  const no = new Set((fuera ?? []).map(de).filter(Boolean));
  if (buscar.trim()) {
    // Primero los que EMPIEZAN por lo escrito, como en el selector de la app.
    const q = buscar.trim().toLowerCase();
    const empieza = (h) => (h.name.toLowerCase().startsWith(q) ? 0 : 1);
    return filtrarPorNombre(heroes, buscar).filter((h) => !no.has(h)).sort((a, b) => empieza(a) - empieza(b)).slice(0, n);
  }
  const delEquipo = (equipo ?? []).map(de).filter(Boolean);
  const probables = datos.meta?.stats && datos.lineas ? probablesDelBando(datos, { equipo: delEquipo, linea, bando: lado }) : heroes;
  const orden = [...(primeros ?? []).map(de).filter(Boolean), ...probables];
  return [...new Set(orden)].filter((h) => !no.has(h)).slice(0, n);
}

/**
 * Las partidas que la tablet no supo cómo acabaron (3.89.4), para decirlo en
 * «Capturas» con un toque al acabar la sesión: Javi juega una detrás de otra
 * y no contesta el «¿Cómo acabó?» de la tablet, así que se quedaban allí sin
 * resultado (casi siempre derrotas) y no llegaban a sus números. Llegan en
 * las pantallas del final (`tipo: 'final'`, con `partida`) que la tablet sube
 * con TU clave, y se leen con `mis_recortes` y esa clave (3.90.2): la primera
 * versión las cogía de `recortes_recientes`, que sube cualquiera, y la
 * revisión de seguridad coló una partida falsa y borró una de verdad con «No
 * la jugué». Por eso, además, nunca sale una con el instante de una partida
 * tuya, que es también como se ven las ya contestadas (en la tablet o aquí:
 * la tablet fija su instante al preguntar, el mismo en todas partes). Fuera
 * las que descartaste (`olvidadas`). De la más nueva a la más vieja.
 */
export function sinResultado(propios = [], partidas = [], heroes = [], olvidadas = []) {
  const porClave = new Map((heroes ?? []).map((n) => [String(n).toLowerCase(), n]));
  const nombre = (n) => (typeof n === 'string' ? porClave.get(n.toLowerCase()) ?? null : null);
  const mias = new Set((partidas ?? []).filter((p) => Number.isFinite(p?.t)).map((p) => p.t));
  const quitadas = new Set(olvidadas ?? []);
  const vistas = new Map();
  for (const fila of propios ?? []) {
    const d = fila?.d ?? fila;
    const p = d?.partida;
    if (d?.tipo !== 'final' || !p || typeof p !== 'object' || !Number.isFinite(p.t) || !nombre(p.pick) || mias.has(p.t) || quitadas.has(p.t) || vistas.has(p.t)) continue;
    const pick = nombre(p.pick);
    const lista = (l, n) => (Array.isArray(l) ? l.map(nombre).filter(Boolean).slice(0, n) : []);
    vistas.set(p.t, {
      t: p.t,
      pantallas: (Array.isArray(d.capturas) ? d.capturas : []).map((c) => c?.miniatura).filter(imagenValida).slice(0, 2),
      partida: {
        t: p.t, pick, origen: 'lector', ...(p.supuesto === true ? { supuesto: true } : {}), rango: typeof p.rango === 'string' && p.rango.length <= 20 ? p.rango : null,
        recomendados: lista(p.recomendados, 3), bans: lista(p.bans, 10),
        ...(typeof p.estimacion === 'number' ? { estimacion: p.estimacion, ...(Number.isInteger(p.modelo) ? { modelo: p.modelo } : {}) } : {}),
        draft: { linea: typeof p.draft?.linea === 'string' ? p.draft.linea : null, enemigos: lista(p.draft?.enemigos, 5), aliados: lista(p.draft?.aliados, 4) },
        ...(Number.isFinite(p.duracion) ? { duracion: p.duracion } : {}),
      },
    });
  }
  return [...vistas.values()].sort((a, b) => b.t - a.t);
}

/**
 * Los comprobantes de las partidas que apuntó la tablet (3.101.0): la franja
 * del final de cada una, sin los nombres de los otros jugadores, subida con
 * TU clave (`mis_recortes`, `tipo: 'resultado'`). Por instante de partida;
 * solo PNG en base64 con forma (`imagenValida`), lo demás no sale.
 */
export function comprobantes(recortes = []) {
  const mapa = new Map();
  for (const fila of Array.isArray(recortes) ? recortes : []) {
    const d = fila?.d ?? fila;
    const tira = d?.capturas?.[0]?.tira;
    if (d?.tipo !== 'resultado' || !Number.isFinite(d.t) || typeof d.gane !== 'boolean' || !imagenValida(tira) || mapa.has(d.t)) continue;
    mapa.set(d.t, { tira, gane: d.gane, parecido: Number.isFinite(d.parecido) ? d.parecido : null });
  }
  return mapa;
}
