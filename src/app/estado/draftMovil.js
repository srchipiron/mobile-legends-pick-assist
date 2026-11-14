/**
 * El draft del móvil, puro (sin React): cargarlo de lo guardado, guardarlo,
 * saber si está completo y fundir en él el draft que lleva la tablet.
 * Se guardan NOMBRES, no héroes: el catálogo cambia y un héroe guardado
 * congelaba sus etiquetas.
 */
import { sanearLectura } from '../../motor/registro.js';

/** [D] Lo que cabe en cada bando: lo dice el juego. */
export const TOPES = { enemigos: 5, aliados: 4, baneos: 10 };
/** [P] Lo que dura el «Deshacer» tras vaciar el draft o quitar a alguien (Material: 4–10 s). */
export const DESHACER_MS = 6000;
/** [D] Minutos desde que fijas tu pick (o se completa el draft) hasta preguntar cómo fue: una partida dura más. */
export const MINUTOS_PARA_RECORDAR = 10;
/** [P] Corregir un draft completo (7 de sus 9 héroes) dentro de media hora es la MISMA partida. */
export const COMUNES_DE_LA_MISMA = 7;
export const MISMA_PARTIDA_MS = 30 * 60000;

export const VACIO = Object.freeze({
  enemigos: [], aliados: [], baneos: [], rivalMarcado: null, fase: 'baneos', miPick: null, miPickDesde: null, miPickLeido: false,
  completoDesde: null, cerrado: false, ultimoCompleto: null, recordarDesde: null, apuntadaSola: null, lectura: null,
  aMano: [], desdeTablet: null, ignorarTabletHasta: null,
});
/** Un draft vacío NUEVO cada vez: el «Deshacer» compara por identidad. */
export const vacio = (extra = {}) => ({ ...VACIO, ...extra });

const nombres = (x) => (Array.isArray(x) ? x.filter((n) => typeof n === 'string') : []);
const instante = (x) => (Number.isFinite(x) ? x : null);

/** ¿Están los cinco enemigos y los cuatro compañeros, o ya empezó la partida? */
export const draftCompleto = (d) => d.cerrado === true || (d.enemigos.length >= TOPES.enemigos && d.aliados.length >= TOPES.aliados);

/** Lo guardado en `roam-picker:draft` (forma de 3.x incluida) → el draft. */
export function cargarDraft(d = {}) {
  const o = d && typeof d === 'object' && !Array.isArray(d) ? d : {};
  const enemigos = nombres(o.enemies), aliados = nombres(o.allies);
  const cerrado = o.cerrado === true;
  return {
    ...VACIO,
    enemigos, aliados, baneos: nombres(o.bans),
    rivalMarcado: typeof o.enemyRoam === 'string' ? o.enemyRoam : null,
    miPick: typeof o.miPick === 'string' ? o.miPick : null,
    miPickDesde: instante(o.miPickDesde),
    miPickLeido: o.miPickLeido === true,
    completoDesde: instante(o.completoDesde) && draftCompleto({ cerrado, enemigos, aliados }) ? o.completoDesde : null,
    cerrado,
    recordarDesde: instante(o.recordarDesde),
    apuntadaSola: instante(o.apuntadaSola),
    // [C] Un draft guardado sin fase: con picks, en picks.
    fase: o.fase === 'baneos' || o.fase === 'picks' ? o.fase : (enemigos.length || aliados.length ? 'picks' : 'baneos'),
    lectura: sanearLectura(o.lectura),
    aMano: nombres(o.aMano),
    desdeTablet: instante(o.desdeTablet),
    ignorarTabletHasta: instante(o.ignorarTabletHasta),
  };
}

/** El draft → lo que se guarda (las claves de 3.x se quedan como estaban). */
export function paraGuardar(d) {
  return {
    enemies: d.enemigos, allies: d.aliados, bans: d.baneos, enemyRoam: d.rivalMarcado, fase: d.fase,
    miPick: d.miPick, miPickDesde: d.miPickDesde, ...(d.miPickLeido ? { miPickLeido: true } : {}),
    completoDesde: d.completoDesde, ...(d.cerrado ? { cerrado: true } : {}),
    ...(d.recordarDesde ? { recordarDesde: d.recordarDesde } : {}), ...(d.apuntadaSola ? { apuntadaSola: d.apuntadaSola } : {}),
    ...(d.lectura ? { lectura: d.lectura } : {}), ...(d.aMano?.length ? { aMano: d.aMano } : {}),
    ...(d.desdeTablet ? { desdeTablet: d.desdeTablet } : {}), ...(d.ignorarTabletHasta ? { ignorarTabletHasta: d.ignorarTabletHasta } : {}),
  };
}

/**
 * Cuándo se completó: se conserva si ya lo estaba, arranca si acaba de
 * completarse (o vuelve el de antes si es una corrección de la misma
 * partida) y se borra si deja de estarlo. `ultimoCompleto` vive en memoria.
 */
export function conCompleto(d, ahora) {
  if (!draftCompleto(d)) {
    const ultimoCompleto = d.completoDesde ? { desde: d.completoDesde, heroes: [...d.enemigos, ...d.aliados] } : (d.ultimoCompleto ?? null);
    return { ...d, completoDesde: null, ultimoCompleto };
  }
  if (d.completoDesde || !Number.isFinite(ahora)) return { ...d, completoDesde: d.completoDesde ?? null };
  const a = d.ultimoCompleto;
  const comunes = a ? [...d.enemigos, ...d.aliados].filter((n) => a.heroes.includes(n)).length : 0;
  const mismo = a && ahora - a.desde >= 0 && ahora - a.desde < MISMA_PARTIDA_MS && comunes >= COMUNES_DE_LA_MISMA;
  return { ...d, completoDesde: mismo ? a.desde : ahora };
}

/** [D] La partida empezó con el draft a medias: se cierra con lo que tenga (sin ningún enemigo, no es este draft). */
export function cerrarConPartida(d, ahora) {
  if (draftCompleto(d) || !d.enemigos.length) return d;
  return conCompleto({ ...d, cerrado: true }, ahora);
}

/** Tu fila, solo si el héroe es de tu línea: fuera del pool es un error de lectura. */
const tuyoValido = (tuyo, pool) => (tuyo && pool?.size && !pool.has(tuyo) ? null : tuyo ?? null);
const sin = (lista, quitar) => lista.filter((n) => !quitar.has(n));
const union = (...listas) => [...new Set(listas.flat())];

/**
 * Funde el draft de la tablet en el del móvil. La tablet manda sobre lo que
 * ella leyó (el héroe que un jugador solo miraba y cambió, sale) y la mano
 * sobre lo que tocó: lo metido a mano (`aMano`) se queda y lo leído que
 * quitaste (`rechazados` = leído y fuera del draft) no vuelve. Los baneos
 * solo se suman. Un draft de la tablet con `desde` ≤ `ignorarTabletHasta`
 * (vaciaste o apuntaste ese) no entra; uno más nuevo que el que se seguía
 * empieza un draft nuevo.
 *
 * @returns {{ despues, nuevos: { baneos, enemigos, aliados, tuyo }, quitados: number, ignorado: boolean }}
 */
export function fundirTablet(antes, tablet, { ahora = Date.now(), pool = null } = {}) {
  const nada = { despues: antes, nuevos: { baneos: 0, enemigos: 0, aliados: 0, tuyo: null }, quitados: 0, ignorado: true };
  if (!tablet?.desde) return nada;
  if (antes.ignorarTabletHasta && tablet.desde <= antes.ignorarTabletHasta) return nada;
  if (antes.desdeTablet && tablet.desde < antes.desdeTablet) return nada;
  // Otro draft: el que se seguía es más viejo, o el del móvil se completó antes de que empezara este.
  const otro = antes.desdeTablet ? tablet.desde > antes.desdeTablet : !!antes.completoDesde && tablet.desde > antes.completoDesde;
  const base = otro ? vacio({ ignorarTabletHasta: antes.ignorarTabletHasta }) : antes;
  const aMano = new Set(base.aMano ?? []);
  const leido = base.lectura ?? {};
  const rechazados = (lado, ahoraHay) => new Set(nombres(leido[lado]).filter((n) => !ahoraHay.includes(n)));
  const rechazadosB = rechazados('baneos', base.baneos), rechazadosE = rechazados('enemigos', base.enemigos), rechazadosA = rechazados('aliados', base.aliados);

  const tE = tablet.enemigos.filter(Boolean);
  const tA = tablet.aliados.filter((n, i) => n && i !== tablet.tuyoFila && n !== tablet.tuyo);
  // Lo que la tablet leyó antes y ya no ve se va, salvo lo que metiste tú.
  const dejados = (lado, actuales) => new Set(nombres(leido[lado]).filter((n) => !actuales.includes(n) && !aMano.has(n)));
  const fueraE = dejados('enemigos', tE), fueraA = dejados('aliados', tA);
  let enemigos = sin(base.enemigos, fueraE), aliados = sin(base.aliados, fueraA);
  const baneos = [...base.baneos];
  const quitados = base.enemigos.length - enemigos.length + base.aliados.length - aliados.length;

  const cabe = (n, lista, tope, rechazo) => !rechazo.has(n) && lista.length < tope && !baneos.includes(n) && !enemigos.includes(n) && !aliados.includes(n);
  let nB = 0, nE = 0, nA = 0;
  for (const n of tablet.baneos) if (cabe(n, baneos, TOPES.baneos, rechazadosB)) { baneos.push(n); nB += 1; }
  for (const n of tE) if (cabe(n, enemigos, TOPES.enemigos, rechazadosE)) { enemigos = [...enemigos, n]; nE += 1; }

  // Tu fila: se fija si no hay pick o el que hay también lo puso la tablet; el que soltaste no vuelve.
  const tuyo = tuyoValido(tablet.tuyo, pool);
  const soltado = !base.miPick && leido.tuyo === tuyo;
  const fija = !!tuyo && !soltado && !baneos.includes(tuyo) && !enemigos.includes(tuyo) && (!base.miPick || base.miPickLeido) && base.miPick !== tuyo;
  const miPick = fija ? tuyo : base.miPick;
  if (fija) aliados = aliados.filter((n) => n !== tuyo);
  for (const n of tA) if (n !== miPick && cabe(n, aliados, TOPES.aliados, rechazadosA)) { aliados = [...aliados, n]; nA += 1; }

  const lectura = sanearLectura({
    baneos: union([...rechazadosB], tablet.baneos).slice(0, 10),
    enemigos: union([...rechazadosE], tE).slice(0, 5),
    aliados: union([...rechazadosA], tA).slice(0, 5),
    tuyo: tuyo ?? leido.tuyo,
  });
  const sueltaPick = !!miPick && (baneos.includes(miPick) || enemigos.includes(miPick));
  const nuevo = {
    ...base, baneos, enemigos, aliados, lectura, desdeTablet: tablet.desde,
    fase: nE || nA || (otro && tE.length + tA.length) ? 'picks' : base.fase,
    rivalMarcado: base.rivalMarcado && enemigos.includes(base.rivalMarcado) ? base.rivalMarcado : null,
    ...(sueltaPick ? { miPick: null, miPickDesde: null, miPickLeido: false } : fija ? { miPick, miPickDesde: ahora, miPickLeido: true } : {}),
  };
  const despues = tablet.cerrado ? cerrarConPartida(conCompleto(nuevo, ahora), ahora) : conCompleto(nuevo, ahora);
  return { despues, nuevos: { baneos: nB, enemigos: nE, aliados: nA, tuyo: fija && !sueltaPick ? miPick : null }, quitados, ignorado: false, otro };
}

/** Lo que el móvil corrige del draft de la tablet que sigue (`POST /draft`), o null si no sigue ninguno. */
export function correccionDe(d) {
  if (!d.desdeTablet) return null;
  return { desde: d.desdeTablet, enemigos: d.enemigos, aliados: d.aliados.filter((n) => n !== d.miPick), tuyo: d.miPick, baneos: d.baneos };
}

/** Huella para saber si el móvil y la tablet ven lo mismo (sin orden). */
export function huellaDeNombres({ desde, enemigos = [], aliados = [], tuyo = null, baneos = [] }) {
  const s = (l) => [...l].filter(Boolean).sort().join(',');
  return `${desde}|${s(enemigos)}|${s(aliados)}|${tuyo ?? ''}|${s(baneos)}`;
}

/** La huella del draft de la tablet tal como lo dice ella. */
export const huellaDeLaTablet = (t) => huellaDeNombres({
  desde: t.desde, enemigos: t.enemigos, aliados: t.aliados.filter((n, i) => i !== t.tuyoFila && n !== t.tuyo), tuyo: t.tuyo, baneos: t.baneos,
});
