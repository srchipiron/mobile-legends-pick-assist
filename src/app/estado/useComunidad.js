import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';
import {
  sanearConfig, sanearEstadoComunidad, crearClaveDeJugador, claveDeJugadorValida, tocaSubirComunidad,
  subirPartidas, traerMisPartidas, borrarMisPartidas, bajarComunidad, queTraer,
} from '../../comun/basedatos.js';
import { medirComunidad } from '../../motor/comunidad.js';
import { maestriaDeSiempre, winrateDeReferencia } from '../../motor/maestria.js';
import { esPrevia } from '../../motor/registro.js';

/** [P] Lo que se espera a comunidad.json antes de quedarse con la copia guardada (como licencias.json). */
const PLAZO_CONFIG_MS = 4000;
const RUTA = 'public/comunidad.json';
/** [P] Cada cuánto se miran las partidas que subió la tablet. */
export const TRAER_CADA_MS = 5 * 60 * 1000;
/** [P] Lo que se espera tras un cambio antes de subir: corregir justo después de apuntar sube una vez. */
export const ESPERA_MS = 3000;
/** [P] Tras un fallo, lo que se espera antes de volver a subir lo mismo. */
export const REINTENTO_MS = 10 * 60 * 1000;

/** Huella de lo que se sube (partidas, quitadas y referencia), FNV-1a con el nº de partidas delante: si no cambia, no se sube. */
export function huellaDeSubida({ partidas = [], olvidadas = [], referencia = null }) {
  const texto = JSON.stringify({ p: partidas, m: { o: olvidadas, r: referencia } });
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${partidas.length}.${h.toString(16)}`;
}

/**
 * La base de datos de partidas. Con «Guardar mis partidas» y `comunidad.json`
 * publicado, cada cambio en tus partidas se sube solo con TU clave; al abrir
 * (y como mucho cada TRAER_CADA_MS) se trae lo que la tablet apuntó; y se
 * pueden bajar las de todos para ver si la app ayuda. `escribir` (del token,
 * solo en el móvil de Javi) publica comunidad.json: el token no llega aquí.
 */
export function useComunidad({ perfil, escribir = null, ahora }) {
  const [estado, setEstado] = useState(() => sanearEstadoComunidad(leer(CLAVES.comunidad, {})));
  const [enCurso, setEnCurso] = useState(false);
  const [estadisticas, setEstadisticas] = useState(null);
  const ultimo = useRef({ estado, perfil, enCurso: false });
  ultimo.current.perfil = perfil;

  const cambiar = useCallback((parche) => {
    const siguiente = sanearEstadoComunidad({ ...ultimo.current.estado, ...parche });
    ultimo.current.estado = siguiente;
    setEstado(siguiente);
    guardar(CLAVES.comunidad, siguiente);
  }, []);

  // La configuración publicada; sin red, la última vista (va en el estado).
  useEffect(() => {
    let vivo = true;
    fetch(`./comunidad.json?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(PLAZO_CONFIG_MS) })
      .then((r) => (r.ok ? r.json() : (r.status === 404 ? {} : null)))
      .then((j) => { if (vivo && j) cambiar({ config: sanearConfig(j) }); })
      .catch(() => {});
    return () => { vivo = false; };
  }, [cambiar]);

  // Tu winrate de siempre (maestría a mano + previas), el mismo del Veredicto.
  const referencia = useMemo(() => {
    const r = winrateDeReferencia(maestriaDeSiempre(perfil.mastery ?? {}, (perfil.partidas ?? []).filter(esPrevia)));
    return r ? { winRate: r.winRate, partidas: r.partidas } : null;
  }, [perfil.mastery, perfil.partidas]);
  const huella = useMemo(() => huellaDeSubida({ partidas: perfil.partidas ?? [], olvidadas: perfil.olvidadas ?? [], referencia }), [perfil.partidas, perfil.olvidadas, referencia]);

  const subir = useCallback(async ({ todas = false } = {}) => {
    const { estado: e, perfil: p } = ultimo.current;
    if (!e.activo || !e.config) return { error: 'apagado' };
    if (ultimo.current.enCurso) return { error: 'ocupado' };
    ultimo.current.enCurso = true; setEnCurso(true);
    const h = huellaDeSubida({ partidas: p.partidas ?? [], olvidadas: p.olvidadas ?? [], referencia });
    try {
      const r = await subirPartidas({ config: e.config, clave: e.clave, partidas: p.partidas ?? [], olvidadas: p.olvidadas ?? [], referencia, completo: e.completo && !todas });
      if (r.error) { cambiar({ error: r.error, intento: Date.now(), huellaIntentada: h }); return r; }
      cambiar({ huella: h, cuando: Date.now(), total: r.total, completo: true, error: null, intento: null, huellaIntentada: null });
      return r;
    } finally {
      ultimo.current.enCurso = false; setEnCurso(false);
    }
  }, [cambiar, referencia]);

  // A los ESPERA_MS de un cambio; `ahora` (cada minuto) reintenta tras un fallo.
  useEffect(() => {
    if (enCurso) return undefined;
    const enLinea = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!tocaSubirComunidad(estado, huella, { ahora, enLinea, partidas: perfil.partidas?.length ?? 0, config: estado.config, reintento: REINTENTO_MS })) return undefined;
    const id = setTimeout(() => { subir(); }, ESPERA_MS);
    return () => clearTimeout(id);
  }, [estado, huella, ahora, enCurso, perfil.partidas?.length, subir]);

  /** Activar: con la clave que ya hubiera o una nueva. La primera subida va entera. */
  const activar = useCallback(() => {
    cambiar({ activo: true, clave: ultimo.current.estado.clave ?? crearClaveDeJugador(), huella: null, completo: false, error: null });
  }, [cambiar]);
  const desactivar = useCallback(() => cambiar({ activo: false }), [cambiar]);

  /**
   * Usar una clave que ya tenías (otro móvil): trae sus partidas para
   * fundirlas con las de aquí y la deja puesta. `{ partidas }` o `{ error }`.
   */
  const usarClave = useCallback(async (clave) => {
    const c = String(clave ?? '').trim();
    if (!claveDeJugadorValida(c)) return { error: 'clave' };
    const { config } = ultimo.current.estado;
    if (!config) return { error: 'config' };
    const r = await traerMisPartidas({ config, clave: c });
    if (r.error) return r;
    cambiar({ activo: true, clave: c, huella: null, completo: false, error: null });
    return r;
  }, [cambiar]);

  /** Borrar todo lo tuyo del servidor y olvidar la clave. */
  const borrar = useCallback(async () => {
    const { estado: e } = ultimo.current;
    if (!e.clave || !e.config) return { error: 'config' };
    const r = await borrarMisPartidas({ config: e.config, clave: e.clave });
    if (!r.error) cambiar({ activo: false, clave: null, huella: null, cuando: null, total: null, completo: false, error: null });
    return r;
  }, [cambiar]);

  /** Baja las partidas de todos y las mide. */
  const cargarEstadisticas = useCallback(async () => {
    const { config } = ultimo.current.estado;
    if (!config) return { error: 'config' };
    setEstadisticas({ cargando: true });
    const r = await bajarComunidad(config);
    if (r.error) { setEstadisticas({ error: r.error }); return r; }
    const medida = { ...medirComunidad(r.filas, r.referencias), incompleto: r.incompleto };
    setEstadisticas(medida);
    return medida;
  }, []);

  /** Publica comunidad.json (Administración). Lo que no tenga forma no se publica. */
  const publicarConfig = useCallback(async ({ url, clave }) => {
    const config = sanearConfig({ url, clave });
    if (!config) return { error: 'forma' };
    if (!escribir) return { error: 'sinToken' };
    const r = await escribir({ ruta: RUTA, mensaje: 'Base de datos de partidas: dirección y clave pública', contenido: `${JSON.stringify(config, null, 2)}\n` });
    if (!r.error) cambiar({ config });
    return r;
  }, [escribir, cambiar]);

  // Lo que apuntó la tablet con tu clave y lo arreglado allí después que aquí, para que App lo funda.
  const [nuevas, setNuevas] = useState([]);
  const ultimaTraida = useRef(0);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);
  useEffect(() => {
    const { estado: e } = ultimo.current;
    if (!e.activo || !e.config || !e.clave || Date.now() - ultimaTraida.current < TRAER_CADA_MS) return;
    ultimaTraida.current = Date.now();
    // Sin cancelar al rearmarse (al llegar comunidad.json la configuración es otro objeto): se mira AL LLEGAR.
    traerMisPartidas({ config: e.config, clave: e.clave }).then((r) => {
      if (!montado.current || r.error) { if (r.error) ultimaTraida.current = 0; return; }
      const p = ultimo.current.perfil;
      const faltan = queTraer(r.partidas, p);
      if (faltan.length) setNuevas(faltan);
    }).catch(() => { ultimaTraida.current = 0; });
  }, [ahora, estado.activo, estado.config, estado.clave]);
  const nuevasFundidas = useCallback(() => setNuevas([]), []);

  const pendiente = estado.activo && !!estado.config && (perfil.partidas?.length ?? 0) > 0 && huella !== estado.huella;
  return {
    config: estado.config, activo: estado.activo, clave: estado.clave, cuando: estado.cuando, total: estado.total, error: estado.error,
    enCurso, pendiente, estadisticas, nuevas, nuevasFundidas, activar, desactivar, usarClave, borrar, subir, cargarEstadisticas, publicarConfig,
  };
}
