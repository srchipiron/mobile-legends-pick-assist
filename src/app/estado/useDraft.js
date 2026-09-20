import { useCallback, useEffect, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';

/** Cuántos caben en cada bando. */
export const TOPES = { enemigos: 5, aliados: 4, baneos: 10 };

/** Minutos desde que fijas tu pick hasta que la app pregunta cómo fue: una partida dura más. */
export const MINUTOS_PARA_RECORDAR = 10;

/** Lo guardado (`{ enemies, allies, bans, enemyRoam, fase }`) tal cual está en el móvil. */
function cargar() {
  const d = leer(CLAVES.draft, {});
  const lista = (x) => (Array.isArray(x) ? x.filter((n) => typeof n === 'string') : []);
  return {
    enemigos: lista(d.enemies),
    aliados: lista(d.allies),
    baneos: lista(d.bans),
    rivalMarcado: typeof d.enemyRoam === 'string' ? d.enemyRoam : null,
    // Tu pick FIJADO («Lo cojo», 3.5.0) y cuándo: de él hablan el análisis,
    // la composición y el consejo a los compañeros, y por él se pregunta
    // cómo fue la partida.
    miPick: typeof d.miPick === 'string' ? d.miPick : null,
    miPickDesde: Number.isFinite(d.miPickDesde) ? d.miPickDesde : null,
    // La fase del draft: primero los baneos, después los picks. Un draft
    // guardado antes de que existiera (sin `fase`) sigue donde estaba: con
    // picks metidos, en picks; vacío, en baneos.
    fase: d.fase === 'baneos' || d.fase === 'picks' ? d.fase : ((d.enemies?.length || d.allies?.length) ? 'picks' : 'baneos'),
  };
}

/**
 * El draft que tienes delante. Sobrevive a que Android mate la pestaña al
 * cambiar de app: se guarda en cada cambio, y se guardan NOMBRES, no
 * objetos (guardar el héroe entero congelaba sus tags tras una
 * actualización del catálogo).
 *
 * `anadir` es el ÚNICO sitio que mete a alguien en el draft: con tope y sin
 * repetir. Un nombre guardado que ya no resuelve (la API renombró al héroe)
 * se limpia al llegar el catálogo, con `limpiarDesconocidos`.
 */
export function useDraft() {
  const [draft, setDraft] = useState(cargar);

  useEffect(() => {
    guardar(CLAVES.draft, { enemies: draft.enemigos, allies: draft.aliados, bans: draft.baneos, enemyRoam: draft.rivalMarcado, fase: draft.fase, miPick: draft.miPick, miPickDesde: draft.miPickDesde });
  }, [draft]);

  const anadir = useCallback((bando, heroe) => setDraft((d) => {
    const lista = d[bando];
    if (lista.length >= TOPES[bando] || lista.includes(heroe.name)) return d;
    // Tu pick fijado no puede ser a la vez enemigo o baneado.
    const sueltaPick = bando !== 'aliados' && d.miPick === heroe.name;
    return { ...d, [bando]: [...lista, heroe.name], ...(sueltaPick ? { miPick: null, miPickDesde: null } : {}) };
  }), []);

  /** «Lo cojo»: fija tu pick (segundo toque en el mismo lo suelta). El instante se calcula FUERA del updater. */
  const fijarPick = useCallback((heroe) => {
    const ahora = Date.now();
    setDraft((d) => (d.miPick === heroe.name ? { ...d, miPick: null, miPickDesde: null } : { ...d, miPick: heroe.name, miPickDesde: ahora }));
  }, []);

  /** «Más tarde»: la pregunta de cómo fue vuelve dentro de otros MINUTOS_PARA_RECORDAR. */
  const posponerRecordatorio = useCallback(() => {
    const ahora = Date.now();
    setDraft((d) => (d.miPick ? { ...d, miPickDesde: ahora } : d));
  }, []);

  const quitar = useCallback((bando, heroe) => setDraft((d) => ({
    ...d,
    [bando]: d[bando].filter((n) => n !== heroe.name),
    rivalMarcado: bando === 'enemigos' && d.rivalMarcado === heroe.name ? null : d.rivalMarcado,
  })), []);

  /** Baneos: se marca y se desmarca sin cerrar el selector. */
  const alternarBaneo = useCallback((heroe) => setDraft((d) => (d.baneos.includes(heroe.name)
    ? { ...d, baneos: d.baneos.filter((n) => n !== heroe.name) }
    : (d.baneos.length < TOPES.baneos ? { ...d, baneos: [...d.baneos, heroe.name] } : d))), []);

  /** Tu rival, marcado a mano (segundo toque lo desmarca). Manda sobre lo deducido. */
  const marcarRival = useCallback((heroe) => setDraft((d) => ({ ...d, rivalMarcado: d.rivalMarcado === heroe.name ? null : heroe.name })), []);

  const setFase = useCallback((fase) => setDraft((d) => (d.fase === fase ? d : { ...d, fase })), []);

  /** Nuevo draft: todo vacío y a la fase de baneos. */
  const reiniciar = useCallback(() => setDraft({ enemigos: [], aliados: [], baneos: [], rivalMarcado: null, fase: 'baneos', miPick: null, miPickDesde: null }), []);

  /** Fuera los nombres que el catálogo ya no conoce, y el rival si ya no está entre los enemigos. */
  const limpiarDesconocidos = useCallback((conocidos) => setDraft((d) => {
    const limpia = (lista) => (lista.every((n) => conocidos.has(n)) ? lista : lista.filter((n) => conocidos.has(n)));
    const enemigos = limpia(d.enemigos); const aliados = limpia(d.aliados); const baneos = limpia(d.baneos);
    const rivalMarcado = d.rivalMarcado && enemigos.includes(d.rivalMarcado) ? d.rivalMarcado : null;
    const miPick = d.miPick && conocidos.has(d.miPick) ? d.miPick : null;
    if (enemigos === d.enemigos && aliados === d.aliados && baneos === d.baneos && rivalMarcado === d.rivalMarcado && miPick === d.miPick) return d;
    return { ...d, enemigos, aliados, baneos, rivalMarcado, miPick, miPickDesde: miPick ? d.miPickDesde : null };
  }), []);

  return { ...draft, anadir, quitar, alternarBaneo, marcarRival, setFase, reiniciar, limpiarDesconocidos, fijarPick, posponerRecordatorio };
}
