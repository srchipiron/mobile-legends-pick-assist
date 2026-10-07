import { useCallback, useEffect, useRef, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';
import { sanearLectura } from '../../motor/registro.js';
import { cambiosDeHueco, dudasQueQuedan } from '../lector.js';

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
    completoDesde: Number.isFinite(d.completoDesde) && (d.cerrado === true || (lista(d.enemies).length >= TOPES.enemigos && lista(d.allies).length >= TOPES.aliados)) ? d.completoDesde : null,
    // Cerrado por la partida aunque falte alguien (3.46.0, `cerrarConPartida`).
    cerrado: d.cerrado === true,
    // «Más tarde» sin pick fijado (3.37.0): cuándo se pospuso la pregunta.
    // Antes se reescribía `completoDesde`, que es también lo que identifica
    // el draft ante la vigilancia del lector, y posponer la reiniciaba: se
    // perdía la tabla del final y se vigilaba la partida siguiente.
    recordarDesde: Number.isFinite(d.recordarDesde) ? d.recordarDesde : null,
    // El draft cuya partida apuntada sola se DESHIZO (3.37.0): sin la marca
    // guardada, una recarga volvía a apuntarla.
    apuntadaSola: Number.isFinite(d.apuntadaSola) ? d.apuntadaSola : null,
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
/** ¿Están los cinco enemigos y los cuatro compañeros, o ya empezó la partida? Entonces se está jugando. */
export const draftCompleto = (d) => d.cerrado === true || (d.enemigos.length >= TOPES.enemigos && d.aliados.length >= TOPES.aliados);

/**
 * La partida ha empezado con el draft a medias (3.46.0): el lector no leyó a
 * algún compañero (o enemigo) y nadie lo metió a mano. Todo lo de la partida
 * (la voz, la vigilancia del final, el resultado y la duración) esperaba a
 * que el draft estuviera completo y no arrancaba: el 7 de octubre de 2026, 2
 * de 6 partidas, y 7 de 46 desde el 2 de octubre. Cuando el lector ve la
 * partida (minimapa, dos lecturas seguidas), el draft se da por cerrado con
 * lo que tenga: `cerrado` cuenta como completo hasta el siguiente draft, así
 * que meter después al que falta es la MISMA partida (`completoDesde` no
 * cambia). Sin ningún enemigo no se cierra (no es este draft el que se está
 * jugando: la app abierta entre dos partidas con el draft vacío).
 */
export function cerrarConPartida(d, ahora) {
  if (draftCompleto(d) || !d.enemigos.length) return d;
  return conCompleto({ ...d, cerrado: true }, ahora);
}

/**
 * Corregir un draft completo (la × a un enemigo mal leído y meter al de
 * verdad) es la MISMA partida (3.44.1): `completoDesde` es lo que la
 * identifica ante el lector, y hasta 3.44.0 la corrección arrancaba otro,
 * el lector tiraba la partida que vigilaba (fotogramas, resultado), volvía
 * a decir el aviso del inicio y medía la duración desde la corrección. Se
 * reconoce porque vuelve a completarse con casi los mismos héroes
 * (`COMUNES_DE_LA_MISMA` de 9: una partida nueva no comparte casi ninguno)
 * y dentro de `MISMA_PARTIDA_MS` (lo que dura una partida). Decisiones de
 * producto. No se guarda: tras recargar a medias de una corrección, el
 * draft vuelve a contar como nuevo, como antes.
 */
export const COMUNES_DE_LA_MISMA = 7;
export const MISMA_PARTIDA_MS = 30 * 60000;

/** Cuándo se completó: se conserva si ya lo estaba, arranca si acaba de completarse (o vuelve el de antes si es una corrección), se borra si deja de estarlo. */
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

const VACIO = { enemigos: [], aliados: [], baneos: [], rivalMarcado: null, fase: 'baneos', miPick: null, miPickDesde: null, miPickLeido: false, completoDesde: null, cerrado: false, ultimoCompleto: null, recordarDesde: null, apuntadaSola: null, lectura: null };

export function useDraft() {
  const [draft, setDraft] = useState(cargar);
  // El último draft pintado, para sacar la foto del «Deshacer» FUERA de un
  // updater (ahí dentro no va ningún efecto: React puede llamarlo dos veces).
  const actual = useRef(draft);
  // Quién leyó el lector en cada hueco de picks (3.37.0), para cambiar al
  // que un jugador solo miraba por el que coge. No se guarda: tras recargar
  // a medias, solo se pierde ese cambio en ese draft.
  const huecosLeidos = useRef({ enemigos: [], aliados: [] });
  actual.current = draft;
  // «Deshacer» (3.23.0): el draft de antes y el que dejó la acción. Solo vale
  // mientras el draft siga siendo `despues`: cualquier otro cambio lo anula
  // (deshacer entonces se llevaría por delante lo que metiste después).
  const [paraDeshacer, setParaDeshacer] = useState(null);

  useEffect(() => {
    guardar(CLAVES.draft, { enemies: draft.enemigos, allies: draft.aliados, bans: draft.baneos, enemyRoam: draft.rivalMarcado, fase: draft.fase, miPick: draft.miPick, miPickDesde: draft.miPickDesde, ...(draft.miPickLeido ? { miPickLeido: true } : {}), completoDesde: draft.completoDesde, ...(draft.cerrado ? { cerrado: true } : {}), ...(draft.recordarDesde ? { recordarDesde: draft.recordarDesde } : {}), ...(draft.apuntadaSola ? { apuntadaSola: draft.apuntadaSola } : {}), ...(draft.lectura ? { lectura: draft.lectura } : {}) });
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
      return conCompleto(nuevo, ahora);
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
    setDraft((d) => (d.miPick ? { ...d, miPickDesde: ahora } : (d.completoDesde ? { ...d, recordarDesde: ahora } : d)));
  }, []);

  const quitar = useCallback((bando, heroe) => setDraft((d) => {
    const nuevo = {
      ...d,
      [bando]: d[bando].filter((n) => n !== heroe.name),
      rivalMarcado: bando === 'enemigos' && d.rivalMarcado === heroe.name ? null : d.rivalMarcado,
    };
    return conCompleto(nuevo, null);
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
    setParaDeshacer({ antes, despues: VACIO, tipo: 'vaciado', creado: Date.now() });
  }, []);

  const quitarConDeshacer = useCallback((bando, heroe) => {
    const antes = actual.current;
    if (!antes[bando].includes(heroe.name)) return;
    const nuevo = {
      ...antes,
      [bando]: antes[bando].filter((n) => n !== heroe.name),
      rivalMarcado: bando === 'enemigos' && antes.rivalMarcado === heroe.name ? null : antes.rivalMarcado,
    };
    const despues = conCompleto(nuevo, null);
    setDraft(despues);
    setParaDeshacer({ antes, despues, tipo: 'quitado', nombre: heroe.name, creado: Date.now() });
  }, []);

  /**
   * Lo que leyó el lector de la tablet (3.25.0), ya con los nombres del
   * catálogo. SOLO AÑADE: lo que ya estaba se queda (aunque el lector no lo
   * vea) y nada se alterna (la captura real trae a Hirara en los dos lados
   * de los baneos, y con `alternarBaneo` el segundo lo quitaba). Lo que ya
   * está en otro sitio (un enemigo baneado, un compañero) no se toca. Con
   * enemigos nuevos el draft pasa a picks. Todo de una vez, con Deshacer.
   */
  const aplicarLectura = useCallback(({ baneos = [], enemigos = [], aliados = [], tuyo = null, id = null, dudas = null, huecos = null, ms = null, msCaptura = null, formato = null }) => {
    const reconocio = baneos.length + enemigos.length + aliados.length > 0 || !!tuyo;
    const antes = actual.current;
    const ahora = Date.now();
    // Draft nuevo: los huecos de la partida anterior no dicen nada.
    if (!antes.enemigos.length && !antes.aliados.length) huecosLeidos.current = { enemigos: [], aliados: [] };
    // El héroe que un jugador solo MIRABA se cambia por el que se ve ahora
    // en su hueco (3.37.0, `cambiosDeHueco`). Solo si sigue en el draft: lo
    // que ya quitaste o moviste a mano no se toca.
    const cambioE = cambiosDeHueco(huecosLeidos.current.enemigos, huecos?.enemigos ?? []);
    const cambioA = cambiosDeHueco(huecosLeidos.current.aliados, huecos?.aliados ?? []);
    huecosLeidos.current = { enemigos: cambioE.huecos, aliados: cambioA.huecos };
    const quitadosE = cambioE.quitar.filter((n) => antes.enemigos.includes(n) && !enemigos.includes(n));
    const quitadosA = cambioA.quitar.filter((n) => antes.aliados.includes(n) && !aliados.includes(n));
    // Lo que ya se leyó y no está en el draft lo quitaste tú (la × o
    // «Deshacer»): no se vuelve a meter (3.40.0). Leyendo solo, la lectura
    // siguiente lo devolvía a los 5 s: no había forma de quitar un nombre
    // mal leído (Joy, Wanwan) mientras la tablet lo enseñara.
    const rechazados = (leidos = [], ahora = []) => new Set(leidos.filter((n) => !ahora.includes(n)));
    const rechazadosB = rechazados(antes.lectura?.baneos, antes.baneos);
    const rechazadosE = rechazados(antes.lectura?.enemigos, antes.enemigos);
    const rechazadosA = rechazados(antes.lectura?.aliados, antes.aliados);
    const nuevosBaneos = [...antes.baneos];
    const nuevosEnemigos = antes.enemigos.filter((n) => !quitadosE.includes(n));
    const nuevosAliados = antes.aliados.filter((n) => !quitadosA.includes(n));
    let nB = 0, nE = 0, nA = 0;
    for (const n of baneos) {
      if (!rechazadosB.has(n) && nuevosBaneos.length < TOPES.baneos && !nuevosBaneos.includes(n) && !nuevosEnemigos.includes(n) && !nuevosAliados.includes(n)) { nuevosBaneos.push(n); nB += 1; }
    }
    for (const n of enemigos) {
      if (!rechazadosE.has(n) && nuevosEnemigos.length < TOPES.enemigos && !nuevosEnemigos.includes(n) && !nuevosBaneos.includes(n) && !nuevosAliados.includes(n)) { nuevosEnemigos.push(n); nE += 1; }
    }
    // Tu pick (3.31.0): la fila del juego con tu nombre en amarillo. Se fija
    // si no hay pick fijado o si el que hay lo fijó también el lector
    // (cambiaste de héroe mientras elegías); uno fijado a mano se respeta.
    // Y si soltaste el pick que fijó el lector, ese mismo no se vuelve a fijar (3.40.0).
    const soltadoAMano = !antes.miPick && antes.lectura?.tuyo === tuyo;
    const puedeFijar = tuyo && !soltadoAMano && !nuevosEnemigos.includes(tuyo) && !nuevosBaneos.includes(tuyo) && (!antes.miPick || antes.miPickLeido) && antes.miPick !== tuyo;
    const miPick = puedeFijar ? tuyo : antes.miPick;
    // Tus compañeros (3.31.0): las otras cuatro filas; nunca tu pick.
    for (const n of aliados) {
      if (n !== miPick && !rechazadosA.has(n) && nuevosAliados.length < TOPES.aliados && !nuevosAliados.includes(n) && !nuevosEnemigos.includes(n) && !nuevosBaneos.includes(n)) { nuevosAliados.push(n); nA += 1; }
    }
    // Lo cambiado sale también de lo leído: no fue un error del lector (el
    // jugador lo miró y cogió otro) y no debe contar como fallo al apuntar.
    const union = (a = [], b = [], sin = []) => [...new Set([...a, ...b])].filter((n) => !sin.includes(n));
    // Las dudas son las de la ÚLTIMA lectura que reconoció a alguien, no la
    // unión ni la de una pantalla que no es el draft (`dudasQueQuedan`).
    const lectura = sanearLectura({ baneos: union(antes.lectura?.baneos, baneos), enemigos: union(antes.lectura?.enemigos, enemigos, quitadosE), aliados: union(antes.lectura?.aliados, aliados, quitadosA), tuyo: tuyo ?? antes.lectura?.tuyo, ids: union(antes.lectura?.ids, id ? [id] : []), dudas: dudasQueQuedan(antes.lectura?.dudas, dudas, reconocio), aprendizaje: antes.lectura?.aprendizaje, ms: [...(antes.lectura?.ms ?? []), ...(Number.isFinite(ms) ? [ms] : [])], msCaptura: [...(antes.lectura?.msCaptura ?? []), ...(Number.isFinite(msCaptura) ? [msCaptura] : [])], formatos: [...(antes.lectura?.formatos ?? []), ...(Number.isFinite(ms) ? [formato === 'crudo' ? 'crudo' : 'png'] : [])] });
    const sueltaPick = miPick && (nuevosBaneos.includes(miPick) || nuevosEnemigos.includes(miPick));
    const nuevo = {
      ...antes, baneos: nuevosBaneos, enemigos: nuevosEnemigos, lectura,
      // Tu pick recién fijado no puede seguir de compañero (lo metiste a mano, o lo leyó una fila que ya no es la tuya).
      aliados: puedeFijar ? nuevosAliados.filter((n) => n !== miPick) : nuevosAliados,
      fase: nE || nA ? 'picks' : antes.fase,
      ...(sueltaPick ? { miPick: null, miPickDesde: null, miPickLeido: false } : puedeFijar ? { miPick, miPickDesde: ahora, miPickLeido: true } : {}),
    };
    const despues = conCompleto(nuevo, ahora);
    setDraft(despues);
    const fijado = !!puedeFijar && !sueltaPick;
    const cambiados = quitadosE.length + quitadosA.length;
    if (nB || nE || nA || fijado || cambiados) setParaDeshacer({ antes, despues, tipo: 'leido', baneos: nB, enemigos: nE, aliados: nA, tuyo: fijado ? miPick : null, creado: ahora });
    // Una lectura que no añade nada (leyendo solo, cada pocos segundos) solo
    // apunta su id y sus dudas: el «Deshacer» de la lectura anterior sigue
    // valiendo, apuntando al draft nuevo.
    else setParaDeshacer((p) => (p && p.despues === antes ? { ...p, despues } : p));
    return { baneos: nB, enemigos: nE, aliados: nA, tuyo: fijado ? miPick : null, cambiados };
  }, []);

  /** Lo que el lector aprendió (o no encontró) al corregirle: va con la partida. */
  const anotarAprendizaje = useCallback((aprendizaje, desde) => {
    const antes = actual.current;
    // Aprender tarda (decenas de segundos por captura en un móvil): si entre
    // tanto se apuntó la partida, la respuesta caía en el draft SIGUIENTE y
    // viajaba con otra partida (3.40.0). Solo en el draft que se corrigió.
    if (!Number.isFinite(desde) || antes.completoDesde !== desde) return;
    const lectura = sanearLectura({ ...(antes.lectura ?? {}), aprendizaje });
    if (lectura) setDraft({ ...antes, lectura });
  }, []);

  const deshacible = paraDeshacer && paraDeshacer.despues === draft ? paraDeshacer : null;
  const deshacer = useCallback(() => {
    const d = paraDeshacer;
    if (!d || d.despues !== actual.current) return;
    // Lo leído se conserva (3.40.0): lo que se deshace queda como «leído y
    // quitado», y la siguiente lectura no lo vuelve a meter.
    setDraft(d.tipo === 'leido' ? { ...d.antes, lectura: d.despues.lectura } : d.antes);
    setParaDeshacer(null);
  }, [paraDeshacer]);
  const olvidarDeshacer = useCallback(() => setParaDeshacer(null), []);
  /** El draft tal cual está (para devolverlo con `restaurar` si una partida apuntada sola no era) (3.32.0). */
  const foto = useCallback(() => actual.current, []);
  const restaurar = useCallback((d) => { if (d && typeof d === 'object') setDraft(d); }, []);
  // Pasado el plazo, el aviso se va solo.
  // El plazo cuenta desde que se CREÓ el aviso (3.40.0): una lectura sin
  // nada nuevo lo reapunta al draft nuevo, y con el reloj atado al objeto
  // cada lectura (una cada 5 s leyendo solo) lo volvía a poner a 6 s: el
  // «Deshacer» de una × no se iba nunca y a los 18 s seguía devolviendo.
  const creado = paraDeshacer?.creado ?? null;
  useEffect(() => {
    if (creado == null) return undefined;
    const reloj = setTimeout(() => setParaDeshacer((d) => (d?.creado === creado ? null : d)), Math.max(0, creado + DESHACER_MS - Date.now()));
    return () => clearTimeout(reloj);
  }, [creado]);

  /** El lector ve la partida empezada: el draft se cierra con lo que tenga (3.46.0). El instante, FUERA del updater. */
  const cerrarPorPartida = useCallback(() => {
    const ahora = Date.now();
    setDraft((d) => cerrarConPartida(d, ahora));
  }, []);

  /** Fuera los nombres que el catálogo ya no conoce, y el rival si ya no está entre los enemigos. */
  const limpiarDesconocidos = useCallback((conocidos) => setDraft((d) => {
    const limpia = (lista) => (lista.every((n) => conocidos.has(n)) ? lista : lista.filter((n) => conocidos.has(n)));
    const enemigos = limpia(d.enemigos); const aliados = limpia(d.aliados); const baneos = limpia(d.baneos);
    const rivalMarcado = d.rivalMarcado && enemigos.includes(d.rivalMarcado) ? d.rivalMarcado : null;
    const miPick = d.miPick && conocidos.has(d.miPick) ? d.miPick : null;
    if (enemigos === d.enemigos && aliados === d.aliados && baneos === d.baneos && rivalMarcado === d.rivalMarcado && miPick === d.miPick) return d;
    const nuevo = { ...d, enemigos, aliados, baneos, rivalMarcado, miPick, miPickDesde: miPick ? d.miPickDesde : null };
    return conCompleto(nuevo, null);
  }), []);

  return { ...draft, anadir, quitar, cerrarPorPartida, alternarBaneo, marcarRival, setFase, reiniciar, limpiarDesconocidos, fijarPick, posponerRecordatorio, vaciarConDeshacer, quitarConDeshacer, aplicarLectura, anotarAprendizaje, deshacible, deshacer, olvidarDeshacer, foto, restaurar };
}
