import { useCallback, useEffect, useRef, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';
import { sanearLectura } from '../../motor/registro.js';

/** Cuántos caben en cada bando. */
export const TOPES = { enemigos: 5, aliados: 4, baneos: 10 };

/** Decisión de producto (Material recomienda 4–10 s): lo que dura el «Deshacer» tras vaciar el draft o quitar a alguien. */
export const DESHACER_MS = 6000;

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
    // Si lo fijó el lector (3.31.0, tu fila del panel del juego): entonces
    // una lectura posterior puede cambiarlo (cambiaste de héroe); uno fijado
    // a mano, no.
    miPickLeido: d.miPickLeido === true,
    // Desde cuándo el draft está COMPLETO (cinco enemigos y cuatro aliados):
    // sin pick fijado, es lo que dispara la pregunta de cómo fue (3.9.0).
    completoDesde: Number.isFinite(d.completoDesde) && lista(d.enemies).length >= TOPES.enemigos && lista(d.allies).length >= TOPES.aliados ? d.completoDesde : null,
    // La fase del draft: primero los baneos, después los picks. Un draft
    // guardado antes de que existiera (sin `fase`) sigue donde estaba: con
    // picks metidos, en picks; vacío, en baneos.
    fase: d.fase === 'baneos' || d.fase === 'picks' ? d.fase : ((d.enemies?.length || d.allies?.length) ? 'picks' : 'baneos'),
    // Lo que leyó el lector de la tablet en este draft (3.25.0): va con la
    // partida al apuntarla, para medir cuánto acierta.
    lectura: sanearLectura(d.lectura),
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
/** ¿Están los cinco enemigos y los cuatro compañeros? Entonces se está jugando. */
export const draftCompleto = (d) => d.enemigos.length >= TOPES.enemigos && d.aliados.length >= TOPES.aliados;

/** Cuándo se completó: se conserva si ya lo estaba, arranca si acaba de completarse, se borra si deja de estarlo. */
function completoDesdeDe(d, ahora) {
  if (!draftCompleto(d)) return null;
  return d.completoDesde ?? ahora;
}

const VACIO = { enemigos: [], aliados: [], baneos: [], rivalMarcado: null, fase: 'baneos', miPick: null, miPickDesde: null, miPickLeido: false, completoDesde: null, lectura: null };

export function useDraft() {
  const [draft, setDraft] = useState(cargar);
  // El último draft pintado, para sacar la foto del «Deshacer» FUERA de un
  // updater (ahí dentro no va ningún efecto: React puede llamarlo dos veces).
  const actual = useRef(draft);
  actual.current = draft;
  // «Deshacer» (3.23.0): el draft de antes y el que dejó la acción. Solo vale
  // mientras el draft siga siendo `despues`: cualquier otro cambio lo anula
  // (deshacer entonces se llevaría por delante lo que metiste después).
  const [paraDeshacer, setParaDeshacer] = useState(null);

  useEffect(() => {
    guardar(CLAVES.draft, { enemies: draft.enemigos, allies: draft.aliados, bans: draft.baneos, enemyRoam: draft.rivalMarcado, fase: draft.fase, miPick: draft.miPick, miPickDesde: draft.miPickDesde, ...(draft.miPickLeido ? { miPickLeido: true } : {}), completoDesde: draft.completoDesde, ...(draft.lectura ? { lectura: draft.lectura } : {}) });
  }, [draft]);

  const anadir = useCallback((bando, heroe) => {
    // El instante se calcula FUERA del updater (React puede llamarlo dos veces).
    const ahora = Date.now();
    setDraft((d) => {
      const lista = d[bando];
      if (lista.length >= TOPES[bando] || lista.includes(heroe.name)) return d;
      // Tu pick fijado no puede ser a la vez enemigo, compañero ni baneado.
      const sueltaPick = d.miPick === heroe.name;
      const nuevo = { ...d, [bando]: [...lista, heroe.name], ...(sueltaPick ? { miPick: null, miPickDesde: null } : {}) };
      return { ...nuevo, completoDesde: completoDesdeDe(nuevo, ahora) };
    });
  }, []);

  /** «Lo cojo»: fija tu pick (segundo toque en el mismo lo suelta). El instante se calcula FUERA del updater. */
  const fijarPick = useCallback((heroe) => {
    const ahora = Date.now();
    setDraft((d) => (d.miPick === heroe.name ? { ...d, miPick: null, miPickDesde: null, miPickLeido: false } : { ...d, miPick: heroe.name, miPickDesde: ahora, miPickLeido: false }));
  }, []);

  /** «Más tarde»: la pregunta de cómo fue vuelve dentro de otros MINUTOS_PARA_RECORDAR. */
  const posponerRecordatorio = useCallback(() => {
    const ahora = Date.now();
    setDraft((d) => (d.miPick ? { ...d, miPickDesde: ahora } : (d.completoDesde ? { ...d, completoDesde: ahora } : d)));
  }, []);

  const quitar = useCallback((bando, heroe) => setDraft((d) => {
    const nuevo = {
      ...d,
      [bando]: d[bando].filter((n) => n !== heroe.name),
      rivalMarcado: bando === 'enemigos' && d.rivalMarcado === heroe.name ? null : d.rivalMarcado,
    };
    return { ...nuevo, completoDesde: completoDesdeDe(nuevo, null) };
  }), []);

  /** Baneos: se marca y se desmarca sin cerrar el selector. */
  const alternarBaneo = useCallback((heroe) => setDraft((d) => {
    if (d.baneos.includes(heroe.name)) return { ...d, baneos: d.baneos.filter((n) => n !== heroe.name) };
    if (d.baneos.length >= TOPES.baneos) return d;
    // Banear tu pick fijado lo suelta, como meterlo de enemigo (`anadir`):
    // si no, el hueco «Tú» seguía enseñándolo y «Gané» apuntaba al nº1.
    const sueltaPick = d.miPick === heroe.name;
    return { ...d, baneos: [...d.baneos, heroe.name], ...(sueltaPick ? { miPick: null, miPickDesde: null } : {}) };
  }), []);

  /** Tu rival, marcado a mano (segundo toque lo desmarca). Manda sobre lo deducido. */
  const marcarRival = useCallback((heroe) => setDraft((d) => ({ ...d, rivalMarcado: d.rivalMarcado === heroe.name ? null : heroe.name })), []);

  const setFase = useCallback((fase) => setDraft((d) => (d.fase === fase ? d : { ...d, fase })), []);

  /** Nuevo draft: todo vacío y a la fase de baneos. */
  const reiniciar = useCallback(() => setDraft(VACIO), []);

  /**
   * Lo que se hace con UN toque y se lleva por delante lo metido: el botón
   * «Nuevo draft» (va al lado de «Apuntar partida») y la × de un hueco.
   * Hacen lo mismo que `reiniciar` y `quitar`, y dejan un «Deshacer» durante
   * `DESHACER_MS`. El reinicio tras apuntar una partida NO pasa por aquí: la
   * partida ya está guardada y deshacer no la desapuntaría.
   */
  const vaciarConDeshacer = useCallback(() => {
    const antes = actual.current;
    // Sin nada que perder no hay nada que deshacer: el aviso sobre un draft
    // ya vacío no devolvería nada (salía igual hasta 3.24.1).
    const vacio = !antes.enemigos.length && !antes.aliados.length && !antes.baneos.length && !antes.miPick;
    if (vacio) { if (antes.fase !== 'baneos') setDraft(VACIO); return; }
    setDraft(VACIO);
    setParaDeshacer({ antes, despues: VACIO, tipo: 'vaciado' });
  }, []);

  const quitarConDeshacer = useCallback((bando, heroe) => {
    const antes = actual.current;
    if (!antes[bando].includes(heroe.name)) return;
    const nuevo = {
      ...antes,
      [bando]: antes[bando].filter((n) => n !== heroe.name),
      rivalMarcado: bando === 'enemigos' && antes.rivalMarcado === heroe.name ? null : antes.rivalMarcado,
    };
    const despues = { ...nuevo, completoDesde: completoDesdeDe(nuevo, null) };
    setDraft(despues);
    setParaDeshacer({ antes, despues, tipo: 'quitado', nombre: heroe.name });
  }, []);

  /**
   * Lo que leyó el lector de la tablet (3.25.0), ya con los nombres del
   * catálogo. SOLO AÑADE: lo que ya estaba se queda (aunque el lector no lo
   * vea) y nada se alterna (la captura real trae a Hirara en los dos lados
   * de los baneos, y con `alternarBaneo` el segundo lo quitaba). Lo que ya
   * está en otro sitio (un enemigo baneado, un compañero) no se toca. Con
   * enemigos nuevos el draft pasa a picks. Todo de una vez, con Deshacer.
   */
  const aplicarLectura = useCallback(({ baneos = [], enemigos = [], aliados = [], tuyo = null, id = null, dudas = null }) => {
    const antes = actual.current;
    const ahora = Date.now();
    const nuevosBaneos = [...antes.baneos];
    const nuevosEnemigos = [...antes.enemigos];
    const nuevosAliados = [...antes.aliados];
    let nB = 0, nE = 0, nA = 0;
    for (const n of baneos) {
      if (nuevosBaneos.length < TOPES.baneos && !nuevosBaneos.includes(n) && !nuevosEnemigos.includes(n) && !nuevosAliados.includes(n)) { nuevosBaneos.push(n); nB += 1; }
    }
    for (const n of enemigos) {
      if (nuevosEnemigos.length < TOPES.enemigos && !nuevosEnemigos.includes(n) && !nuevosBaneos.includes(n) && !nuevosAliados.includes(n)) { nuevosEnemigos.push(n); nE += 1; }
    }
    // Tu pick (3.31.0): la fila del juego con tu nombre en amarillo. Se fija
    // si no hay pick fijado o si el que hay lo fijó también el lector
    // (cambiaste de héroe mientras elegías); uno fijado a mano se respeta.
    const puedeFijar = tuyo && !nuevosEnemigos.includes(tuyo) && !nuevosBaneos.includes(tuyo) && (!antes.miPick || antes.miPickLeido) && antes.miPick !== tuyo;
    const miPick = puedeFijar ? tuyo : antes.miPick;
    // Tus compañeros (3.31.0): las otras cuatro filas; nunca tu pick.
    for (const n of aliados) {
      if (n !== miPick && nuevosAliados.length < TOPES.aliados && !nuevosAliados.includes(n) && !nuevosEnemigos.includes(n) && !nuevosBaneos.includes(n)) { nuevosAliados.push(n); nA += 1; }
    }
    const union = (a = [], b = []) => [...new Set([...a, ...b])];
    // Las dudas son las de la ÚLTIMA lectura (la más completa), no la unión.
    const lectura = sanearLectura({ baneos: union(antes.lectura?.baneos, baneos), enemigos: union(antes.lectura?.enemigos, enemigos), aliados: union(antes.lectura?.aliados, aliados), tuyo: tuyo ?? antes.lectura?.tuyo, ids: union(antes.lectura?.ids, id ? [id] : []), dudas: dudas ?? antes.lectura?.dudas, aprendizaje: antes.lectura?.aprendizaje });
    const sueltaPick = miPick && (nuevosBaneos.includes(miPick) || nuevosEnemigos.includes(miPick));
    const nuevo = {
      ...antes, baneos: nuevosBaneos, enemigos: nuevosEnemigos, lectura,
      // Tu pick recién fijado no puede seguir de compañero (lo metiste a mano, o lo leyó una fila que ya no es la tuya).
      aliados: puedeFijar ? nuevosAliados.filter((n) => n !== miPick) : nuevosAliados,
      fase: nE || nA ? 'picks' : antes.fase,
      ...(sueltaPick ? { miPick: null, miPickDesde: null, miPickLeido: false } : puedeFijar ? { miPick, miPickDesde: ahora, miPickLeido: true } : {}),
    };
    const despues = { ...nuevo, completoDesde: completoDesdeDe(nuevo, ahora) };
    setDraft(despues);
    const fijado = !!puedeFijar && !sueltaPick;
    if (nB || nE || nA || fijado) setParaDeshacer({ antes, despues, tipo: 'leido', baneos: nB, enemigos: nE, aliados: nA, tuyo: fijado ? miPick : null });
    // Una lectura que no añade nada (leyendo solo, cada pocos segundos) solo
    // apunta su id y sus dudas: el «Deshacer» de la lectura anterior sigue
    // valiendo, apuntando al draft nuevo.
    else setParaDeshacer((p) => (p && p.despues === antes ? { ...p, despues } : p));
    return { baneos: nB, enemigos: nE, aliados: nA, tuyo: fijado ? miPick : null };
  }, []);

  /** Lo que el lector aprendió (o no encontró) al corregirle: va con la partida. */
  const anotarAprendizaje = useCallback((aprendizaje) => {
    const antes = actual.current;
    const lectura = sanearLectura({ ...(antes.lectura ?? {}), aprendizaje });
    if (lectura) setDraft({ ...antes, lectura });
  }, []);

  const deshacible = paraDeshacer && paraDeshacer.despues === draft ? paraDeshacer : null;
  const deshacer = useCallback(() => {
    const d = paraDeshacer;
    if (!d || d.despues !== actual.current) return;
    setDraft(d.antes);
    setParaDeshacer(null);
  }, [paraDeshacer]);
  const olvidarDeshacer = useCallback(() => setParaDeshacer(null), []);
  // Pasado el plazo, el aviso se va solo.
  useEffect(() => {
    if (!paraDeshacer) return undefined;
    const reloj = setTimeout(() => setParaDeshacer((d) => (d === paraDeshacer ? null : d)), DESHACER_MS);
    return () => clearTimeout(reloj);
  }, [paraDeshacer]);

  /** Fuera los nombres que el catálogo ya no conoce, y el rival si ya no está entre los enemigos. */
  const limpiarDesconocidos = useCallback((conocidos) => setDraft((d) => {
    const limpia = (lista) => (lista.every((n) => conocidos.has(n)) ? lista : lista.filter((n) => conocidos.has(n)));
    const enemigos = limpia(d.enemigos); const aliados = limpia(d.aliados); const baneos = limpia(d.baneos);
    const rivalMarcado = d.rivalMarcado && enemigos.includes(d.rivalMarcado) ? d.rivalMarcado : null;
    const miPick = d.miPick && conocidos.has(d.miPick) ? d.miPick : null;
    if (enemigos === d.enemigos && aliados === d.aliados && baneos === d.baneos && rivalMarcado === d.rivalMarcado && miPick === d.miPick) return d;
    const nuevo = { ...d, enemigos, aliados, baneos, rivalMarcado, miPick, miPickDesde: miPick ? d.miPickDesde : null };
    return { ...nuevo, completoDesde: completoDesdeDe(nuevo, null) };
  }), []);

  return { ...draft, anadir, quitar, alternarBaneo, marcarRival, setFase, reiniciar, limpiarDesconocidos, fijarPick, posponerRecordatorio, vaciarConDeshacer, quitarConDeshacer, aplicarLectura, anotarAprendizaje, deshacible, deshacer, olvidarDeshacer };
}
