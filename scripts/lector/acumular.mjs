/**
 * Juntar las lecturas en UN draft: baneos, los cinco huecos de cada equipo,
 * tu fila; cerrarlo cuando empieza la partida y empezar otro cuando vuelve un
 * draft nuevo. Y encima, lo que corriges en el móvil (`conCorreccion`), que
 * manda sobre lo leído. Puro: lecturas dentro, estado fuera; nunca lanza.
 * Los nombres son los del lector; se pasan al catálogo al decidir.
 */
import { nombreClave } from '../../src/motor/nombres.js';
import { BANEOS_EN_EL_DRAFT, CAMBIOS_A_LA_VEZ, LECTURAS_EN_PARTIDA } from '../../src/comun/contrato.js';
import { instanteDeCaptura, ID_DE_LECTURA } from './capturas.mjs';

/** [D] Tras cerrar, otro draft solo pasados estos minutos (las pantallas del final no son un draft)… */
export const MINUTOS_PARA_OTRO_DRAFT = 3;
/** [D] …y uno abierto sin cambios en estos se da por abandonado. */
export const MINUTOS_DRAFT_ABANDONADO = 15;
/** [M] Huecos de baneo con otro héroe (o baneos nuevos tras la partida) que dicen que es otro draft: 1 de 338 baneos se lee mal. */
export const BANEOS_DE_OTRO_DRAFT = 2;
/** [M] Héroes DISTINTOS en los paneles de picks que abren el draft sin la fila de baneos: fuera de draft 0 de 854 lecturas, dentro 560 de 935. */
export const PICKS_SIN_BANEOS = 4;
/** [D] Las capturas que recuerda un draft para aprender, y lo que las separa (≈80 s de draft con la última siempre). */
export const IDS_POR_DRAFT = 20;
export const SEPARACION_IDS_MS = 4000;
/** [D] Lecturas seguidas sin leer a nadie para decir «fuera» (el botón tocable de la APK solo sale fuera). */
export const LECTURAS_PARA_FUERA = 2;

export const draftVacio = () => ({ desde: null, baneos: [], banHuecos: Array(10).fill(null), enemigos: Array(5).fill(null), aliados: Array(5).fill(null), tuyoFila: -1, votosFila: [0, 0, 0, 0, 0], cerrado: false, cerradoEn: null, enPartida: 0, actividad: null, ids: [], porPicks: false });

/** Añade la captura a las del draft: la última siempre, y entre las de antes al menos `SEPARACION_IDS_MS`. */
export function conCaptura(ids = [], id) {
  const previa = ids.at(-1), antes = ids.at(-2);
  const depaso = previa && antes && instanteDeCaptura(previa) - instanteDeCaptura(antes) < SEPARACION_IDS_MS;
  return [...(depaso ? ids.slice(0, -1) : ids), id].slice(-IDS_POR_DRAFT);
}

const nombres = (lista) => (Array.isArray(lista) ? lista : []).map((x) => (typeof x?.nombre === 'string' && x.nombre ? x.nombre : null));

/**
 * Lo leído en los huecos de un equipo. [D] Si cambian más de
 * `CAMBIOS_A_LA_VEZ` huecos ya leídos, es la fase de skins: esa lectura no
 * toca el equipo ni vota. Un «?» no borra; un nombre visto en dos huecos de
 * la misma lectura no entra; un héroe ocupa UN hueco (el recién leído gana).
 */
function fundirHuecos(antes, leidos, saltar = -1) {
  const cambios = antes.filter((n, i) => i !== saltar && n && leidos[i] !== undefined && leidos[i] !== n).length;
  if (cambios > CAMBIOS_A_LA_VEZ) return { huecos: antes, cambio: false, descartada: true };
  let cambio = false;
  const huecos = antes.map((n, i) => {
    const nuevo = leidos[i];
    if (!nuevo || nuevo === n) return n;
    if (leidos.some((x, j) => j !== i && x === nuevo)) return n;
    cambio = true;
    return nuevo;
  });
  huecos.forEach((n, i) => {
    if (!n || n === antes[i]) return;
    huecos.forEach((m, j) => { if (j !== i && m === n) huecos[j] = null; });
  });
  return { huecos, cambio, descartada: false };
}

/** [M] Tu fila: la más votada por las lecturas no descartadas; a igualdad, la que estaba (la fase de skins reordena el panel). */
export function filaVotada(votos, actual) {
  const max = Math.max(...votos);
  if (!(max > 0)) return actual;
  return actual >= 0 && votos[actual] === max ? actual : votos.indexOf(max);
}

/**
 * Una lectura más sobre el draft, en el instante `ahora`. [M] Solo cuenta lo
 * que se lee en la PANTALLA DEL DRAFT: con la fila de baneos (≥2 distintos),
 * con `PICKS_SIN_BANEOS` en los paneles, o sumando a un draft abierto que ya
 * lo fue; y sus baneos solo si lee la fila (un baneo suelto es un fantasma).
 */
export function acumularDraft(estado, lectura, ahora) {
  let e = estado ?? draftVacio();
  if (!lectura) return e;
  if (lectura.partida) {
    const enPartida = e.enPartida + 1;
    const cierra = !e.cerrado && enPartida >= LECTURAS_EN_PARTIDA && (e.baneos.length || e.enemigos.some(Boolean));
    return { ...e, enPartida, ...(cierra ? { cerrado: true, cerradoEn: ahora } : {}) };
  }
  const huecosBan = [0, 1, 2, 3, 4].map((i) => nombres(lectura.tuyos)[i] ?? null).concat([0, 1, 2, 3, 4].map((i) => nombres(lectura.suyos)[i] ?? null));
  const baneos = huecosBan.filter(Boolean);
  const enemigos = nombres(lectura.enemigos);
  const filas = nombres(lectura.aliados);
  const banDistintos = new Set(baneos).size;
  const porPicks = new Set([...enemigos, ...filas].filter(Boolean)).size >= PICKS_SIN_BANEOS;
  const deDraft = banDistintos >= BANEOS_EN_EL_DRAFT || porPicks || (!e.cerrado && (e.baneos.length >= BANEOS_EN_EL_DRAFT || e.porPicks));
  const algo = deDraft && (baneos.length || enemigos.some(Boolean) || filas.some(Boolean));
  if (!deDraft) return e.enPartida ? { ...e, enPartida: 0 } : e;
  const deFila = banDistintos >= BANEOS_EN_EL_DRAFT;
  const huecosFila = deFila ? huecosBan : Array(10).fill(null);
  const baneosFila = deFila ? baneos : [];
  const banHuecos = e.banHuecos ?? Array(10).fill(null);
  const huecosDistintos = huecosFila.filter((n, i) => n && banHuecos[i] && banHuecos[i] !== n).length;
  const nuevos = baneosFila.filter((n) => !e.baneos.includes(n)).length;
  const otro = algo && ((e.cerrado && (ahora - e.cerradoEn >= MINUTOS_PARA_OTRO_DRAFT * 60000 || nuevos >= BANEOS_DE_OTRO_DRAFT || huecosDistintos >= BANEOS_DE_OTRO_DRAFT))
    || (!e.cerrado && (huecosDistintos >= BANEOS_DE_OTRO_DRAFT || (e.actividad != null && ahora - e.actividad >= MINUTOS_DRAFT_ABANDONADO * 60000))));
  if (otro) e = draftVacio();
  if (e.cerrado) return { ...e, enPartida: 0 };
  const leida = Number.isInteger(lectura.tuyoFila) && lectura.tuyoFila >= 0 && lectura.tuyoFila < 5 ? lectura.tuyoFila : -1;
  const nuevosBaneos = [...new Set([...e.baneos, ...baneosFila])].slice(0, 10);
  const enem = fundirHuecos(e.enemigos, enemigos);
  const ali = fundirHuecos(e.aliados, filas, e.tuyoFila >= 0 ? e.tuyoFila : leida);
  const votosFila = [...(e.votosFila ?? [0, 0, 0, 0, 0])];
  if (leida >= 0 && !ali.descartada) votosFila[leida] += 1;
  const tuyoFila = filaVotada(votosFila, e.tuyoFila);
  const cambio = nuevosBaneos.length !== e.baneos.length || enem.cambio || ali.cambio || tuyoFila !== e.tuyoFila;
  // [M] Solo se aprende de la pantalla del draft: capturas con la fila de baneos leída.
  const ids = typeof lectura.id === 'string' && ID_DE_LECTURA.test(lectura.id) && deFila ? conCaptura(e.ids ?? [], lectura.id) : e.ids ?? [];
  return {
    ...e, desde: e.desde ?? (algo ? ahora : null), baneos: nuevosBaneos, banHuecos: (e.banHuecos ?? Array(10).fill(null)).map((x, i) => x ?? huecosFila[i]),
    enemigos: enem.huecos, aliados: ali.huecos, tuyoFila, votosFila, enPartida: 0, actividad: cambio ? ahora : e.actividad ?? (algo ? ahora : null), ids, porPicks: !!(e.porPicks || porPicks),
  };
}

/** ¿Esta lectura vio a alguien? (para contar las seguidas sin nadie de `faseDe`). */
export const leeAlguien = (l) => !!l && !l.partida && [l.tuyos, l.suyos, l.enemigos, l.aliados].some((x) => Array.isArray(x) && x.some((h) => h?.nombre));

/** La fase para la burbuja: «partida» con minimapa; «draft» con un draft abierto o pocas lecturas vacías; «fuera» si no. */
export function faseDe(draft, lectura, vacias) {
  if (lectura?.partida) return 'partida';
  const abierto = !draft?.cerrado && (draft?.baneos?.length || draft?.enemigos?.some(Boolean) || draft?.aliados?.some(Boolean));
  return abierto || vacias < LECTURAS_PARA_FUERA ? 'draft' : 'fuera';
}

const es = (a, b) => !!a && !!b && nombreClave(a) === nombreClave(b);
const esta = (lista, n) => lista.some((x) => es(x, n));

/**
 * Lo que manda la corrección del móvil (`sanearCorreccion`), con lo que
 * QUITÓ: lo que el draft tenía en ese momento y la corrección no lleva.
 * Así lo que se lea después sigue entrando, salvo lo que quitaste.
 */
export function registrarCorreccion(draft, c) {
  const fuera = (lista, quiero, saltar = -1) => lista.filter((n, i) => n && i !== saltar && !esta(quiero, n));
  return {
    ...c,
    rechazados: {
      enemigos: fuera(draft.enemigos, c.enemigos),
      // Sin tu héroe en la corrección, tu fila no se toca: los compañeros van sin ti.
      aliados: fuera(draft.aliados, [...c.aliados, ...(c.tuyo ? [c.tuyo] : [])], c.tuyo ? -1 : draft.tuyoFila),
      baneos: fuera(draft.baneos, c.baneos),
    },
  };
}

/**
 * Pone `quiero` en los huecos: cada nombre que ya está se queda en su hueco;
 * los que faltan van a un hueco libre (o al de un nombre que la corrección no
 * lleva). `fijo` es tu fila, que no se toca aquí.
 */
function colocar(huecos, quiero, fuera, fijo = -1) {
  const h = huecos.map((n, i) => (i !== fijo && n && esta(fuera, n) ? null : n));
  for (const nombre of quiero) {
    if (h.some((n, i) => i !== fijo && es(n, nombre))) continue;
    let i = h.findIndex((n, j) => j !== fijo && !n);
    if (i < 0) i = h.findIndex((n, j) => j !== fijo && !esta(quiero, n));
    if (i >= 0) h[i] = nombre;
  }
  return h;
}

/** El draft con la corrección encima (la misma forma que el draft). Sin corrección, el mismo draft. */
export function conCorreccion(draft, correccion = draft?.correccion) {
  if (!draft || !correccion) return draft;
  const c = correccion;
  const r = c.rechazados ?? { enemigos: [], aliados: [], baneos: [] };
  const enemigos = colocar(draft.enemigos, c.enemigos, [...r.enemigos, ...c.aliados, ...(c.tuyo ? [c.tuyo] : [])]);
  let tuyoFila = draft.tuyoFila;
  let aliados = [...draft.aliados];
  if (c.tuyo) {
    if (tuyoFila < 0) {
      const ya = aliados.findIndex((n) => es(n, c.tuyo));
      tuyoFila = ya >= 0 ? ya : aliados.findIndex((n) => !n || esta(r.aliados, n) || esta(c.enemigos, n));
      if (tuyoFila < 0) tuyoFila = aliados.findIndex((n) => !esta(c.aliados, n));
    }
    if (tuyoFila >= 0) aliados = aliados.map((n, i) => (i === tuyoFila ? c.tuyo : es(n, c.tuyo) ? null : n));
  }
  aliados = colocar(aliados, c.aliados, [...r.aliados, ...c.enemigos], tuyoFila);
  const elegidos = [...enemigos, ...aliados].filter(Boolean);
  const baneos = [...c.baneos, ...draft.baneos.filter((n) => !esta(r.baneos, n) && !esta(c.baneos, n))].filter((n) => !esta(elegidos, n)).slice(0, 10);
  return { ...draft, enemigos, aliados, tuyoFila, baneos, corregido: true };
}
