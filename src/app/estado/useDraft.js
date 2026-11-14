import { useCallback, useEffect, useRef, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';
import { TOPES, DESHACER_MS, vacio, cargarDraft, paraGuardar, conCompleto, fundirTablet } from './draftMovil.js';

/** Quita a un héroe de un bando (y el rival marcado si era él). */
const quitarDe = (d, bando, heroe) => conCompleto({
  ...d, [bando]: d[bando].filter((n) => n !== heroe.name),
  rivalMarcado: bando === 'enemigos' && d.rivalMarcado === heroe.name ? null : d.rivalMarcado,
}, null);

/**
 * El draft que tienes delante, guardado en cada cambio (Android mata la
 * pestaña al cambiar de app). `anadir` es el único sitio que mete a alguien
 * por la mano; `fundir` mete lo que lleva la tablet. Los instantes se toman
 * FUERA de los updaters (React puede llamarlos dos veces) y nada se guarda
 * dentro de uno.
 */
export function useDraft() {
  const [draft, setDraft] = useState(() => cargarDraft(leer(CLAVES.draft, {})));
  // El último draft pintado: la foto del «Deshacer» se saca de aquí.
  const actual = useRef(draft);
  actual.current = draft;
  // «Deshacer»: el draft de antes y el que dejó la acción; vale mientras el draft siga siendo `despues`.
  const [paraDeshacer, setParaDeshacer] = useState(null);

  useEffect(() => { guardar(CLAVES.draft, paraGuardar(draft)); }, [draft]);

  const anadir = useCallback((bando, heroe) => {
    const ahora = Date.now();
    setDraft((d) => {
      const lista = d[bando];
      if (lista.length >= TOPES[bando] || lista.includes(heroe.name)) return d;
      // Tu pick no puede ser a la vez enemigo, compañero ni baneado.
      const suelta = d.miPick === heroe.name ? { miPick: null, miPickDesde: null } : {};
      const aMano = d.aMano.includes(heroe.name) ? d.aMano : [...d.aMano, heroe.name];
      return conCompleto({ ...d, [bando]: [...lista, heroe.name], aMano, ...suelta }, ahora);
    });
  }, []);

  const quitar = useCallback((bando, heroe) => setDraft((d) => quitarDe(d, bando, heroe)), []);

  /** «Lo cojo»: fija tu pick; otro toque en el mismo lo suelta. */
  const fijarPick = useCallback((heroe) => {
    const ahora = Date.now();
    setDraft((d) => (d.miPick === heroe.name ? { ...d, miPick: null, miPickDesde: null, miPickLeido: false } : { ...d, miPick: heroe.name, miPickDesde: ahora, miPickLeido: false }));
  }, []);

  /** «Más tarde»: la pregunta vuelve dentro de otros MINUTOS_PARA_RECORDAR (sin tocar `completoDesde`). */
  const posponerRecordatorio = useCallback(() => {
    const ahora = Date.now();
    setDraft((d) => (d.miPick ? { ...d, miPickDesde: ahora } : (d.completoDesde ? { ...d, recordarDesde: ahora } : d)));
  }, []);

  /** Baneos: se marcan y desmarcan sin cerrar el selector; banear tu pick lo suelta. */
  const alternarBaneo = useCallback((heroe) => setDraft((d) => {
    if (d.baneos.includes(heroe.name)) return { ...d, baneos: d.baneos.filter((n) => n !== heroe.name) };
    if (d.baneos.length >= TOPES.baneos) return d;
    return { ...d, baneos: [...d.baneos, heroe.name], ...(d.miPick === heroe.name ? { miPick: null, miPickDesde: null } : {}) };
  }), []);

  const marcarRival = useCallback((heroe) => setDraft((d) => ({ ...d, rivalMarcado: d.rivalMarcado === heroe.name ? null : heroe.name })), []);
  const setFase = useCallback((fase) => setDraft((d) => (d.fase === fase ? d : { ...d, fase })), []);

  /** Draft nuevo tras apuntar: el de la tablet que se seguía ya no vuelve a entrar. */
  const reiniciar = useCallback(() => {
    const d = actual.current;
    setDraft(vacio({ ignorarTabletHasta: d.desdeTablet ?? d.ignorarTabletHasta }));
  }, []);

  /** «Nuevo draft», con «Deshacer». Vaciar uno ya vacío no ofrece nada. */
  const vaciarConDeshacer = useCallback(() => {
    const antes = actual.current;
    const despues = vacio({ ignorarTabletHasta: antes.desdeTablet ?? antes.ignorarTabletHasta });
    const nada = !antes.enemigos.length && !antes.aliados.length && !antes.baneos.length && !antes.miPick;
    setDraft(nada && antes.fase === 'baneos' && despues.ignorarTabletHasta === antes.ignorarTabletHasta ? antes : despues);
    if (!nada) setParaDeshacer({ antes, despues, tipo: 'vaciado', creado: Date.now() });
  }, []);

  /** La × de un hueco, con «Deshacer». */
  const quitarConDeshacer = useCallback((bando, heroe) => {
    const antes = actual.current;
    if (!antes[bando].includes(heroe.name)) return;
    const despues = quitarDe(antes, bando, heroe);
    setDraft(despues);
    setParaDeshacer({ antes, despues, tipo: 'quitado', nombre: heroe.name, creado: Date.now() });
  }, []);

  /**
   * Lo que lleva la tablet (`GET /draft`). Lo que añade deja «Deshacer»;
   * una copia sin nada nuevo reapunta el «Deshacer» que hubiera al draft
   * nuevo sin reiniciar su plazo.
   */
  const fundir = useCallback((tablet, { pool = null } = {}) => {
    const antes = actual.current;
    const ahora = Date.now();
    const r = fundirTablet(antes, tablet, { ahora, pool });
    if (r.ignorado || r.despues === antes) return r;
    setDraft(r.despues);
    const { baneos, enemigos, aliados, tuyo } = r.nuevos;
    if (baneos || enemigos || aliados || tuyo || r.quitados) {
      setParaDeshacer({ antes, despues: r.despues, tipo: 'leido', baneos, enemigos, aliados, tuyo, creado: ahora });
    } else setParaDeshacer((p) => (p && p.despues === antes ? { ...p, despues: r.despues } : p));
    return r;
  }, []);

  const deshacible = paraDeshacer && paraDeshacer.despues === draft ? paraDeshacer : null;
  const deshacer = useCallback(() => {
    const d = paraDeshacer;
    if (!d || d.despues !== actual.current) return;
    // Lo leído se conserva: lo que se deshace queda como «leído y quitado» y no vuelve.
    setDraft(d.tipo === 'leido' ? { ...d.antes, lectura: d.despues.lectura, desdeTablet: d.despues.desdeTablet } : d.antes);
    setParaDeshacer(null);
  }, [paraDeshacer]);
  const olvidarDeshacer = useCallback(() => setParaDeshacer(null), []);
  // El plazo cuenta desde que se CREÓ el aviso: una copia sin nada nuevo no lo alarga.
  const creado = paraDeshacer?.creado ?? null;
  useEffect(() => {
    if (creado == null) return undefined;
    const reloj = setTimeout(() => setParaDeshacer((d) => (d?.creado === creado ? null : d)), Math.max(0, creado + DESHACER_MS - Date.now()));
    return () => clearTimeout(reloj);
  }, [creado]);

  /** El draft tal cual (para devolverlo si una partida apuntada no era) y devolverlo. */
  const foto = useCallback(() => actual.current, []);
  const restaurar = useCallback((d) => { if (d && typeof d === 'object') setDraft(d); }, []);

  /** Fuera los nombres que el catálogo ya no conoce (la API renombró al héroe). */
  const limpiarDesconocidos = useCallback((conocidos) => setDraft((d) => {
    const limpia = (lista) => (lista.every((n) => conocidos.has(n)) ? lista : lista.filter((n) => conocidos.has(n)));
    const enemigos = limpia(d.enemigos), aliados = limpia(d.aliados), baneos = limpia(d.baneos);
    const rivalMarcado = d.rivalMarcado && enemigos.includes(d.rivalMarcado) ? d.rivalMarcado : null;
    const miPick = d.miPick && conocidos.has(d.miPick) ? d.miPick : null;
    if (enemigos === d.enemigos && aliados === d.aliados && baneos === d.baneos && rivalMarcado === d.rivalMarcado && miPick === d.miPick) return d;
    return conCompleto({ ...d, enemigos, aliados, baneos, rivalMarcado, miPick, miPickDesde: miPick ? d.miPickDesde : null }, null);
  }), []);

  return {
    ...draft, anadir, quitar, alternarBaneo, marcarRival, setFase, reiniciar, limpiarDesconocidos, fijarPick, posponerRecordatorio,
    vaciarConDeshacer, quitarConDeshacer, fundir, deshacible, deshacer, olvidarDeshacer, foto, restaurar,
  };
}
