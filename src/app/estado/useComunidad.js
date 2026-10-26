import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';
import { useAhora } from './useAhora.js';
import { huellaDe, ESPERA_MS, REINTENTO_MS } from '../envio.js';
import {
  sanearConfig, sanearEstadoComunidad, crearClaveDeJugador, claveDeJugadorValida, tocaSubirComunidad,
  subirPartidas, traerMisPartidas, borrarMisPartidas, bajarComunidad, queTraer,
} from '../basedatos.js';
import { medirComunidad } from '../../motor/comunidad.js';
import { maestriaDeSiempre, winrateDeReferencia } from '../../motor/maestria.js';
import { esPrevia } from '../../motor/registro.js';

/** Lo que se espera a comunidad.json antes de quedarse con la copia guardada. Decisión de producto, como licencias.json. */
const PLAZO_CONFIG_MS = 4000;
const RUTA = 'public/comunidad.json';
/** Cada cuánto se miran las partidas que subió la tablet. Decisión de producto. */
export const TRAER_CADA_MS = 5 * 60 * 1000;

/**
 * La base de datos de partidas de todos (3.69.0). Con la casilla puesta y
 * `comunidad.json` publicado, cada cambio en tus partidas se sube solo (a los
 * ESPERA_MS, como la subida a GitHub) con TU clave. Y cualquiera puede bajar
 * las de todos para ver si la app ayuda (`cargarEstadisticas`).
 *
 * `escribir` (de useEnvio, solo en el móvil de Javi) publica comunidad.json:
 * el token no llega aquí.
 */
export function useComunidad({ perfil, escribir = null }) {
  const [estado, setEstado] = useState(() => sanearEstadoComunidad(leer(CLAVES.comunidad, {})));
  const [enCurso, setEnCurso] = useState(false);
  const [estadisticas, setEstadisticas] = useState(null);
  const ahora = useAhora();
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

  // Tu winrate de siempre (maestría manual + previas), el mismo del Veredicto.
  const referencia = useMemo(() => {
    const r = winrateDeReferencia(maestriaDeSiempre(perfil.mastery ?? {}, (perfil.partidas ?? []).filter(esPrevia)));
    return r ? { winRate: r.winRate, partidas: r.partidas } : null;
  }, [perfil.mastery, perfil.partidas]);
  // La huella cubre partidas, quitadas y referencia: cambiar cualquiera sube.
  const huella = useMemo(() => huellaDe({ partidas: perfil.partidas ?? [], mastery: { o: perfil.olvidadas ?? [], r: referencia } }), [perfil.partidas, perfil.olvidadas, referencia]);

  const subir = useCallback(async ({ todas = false } = {}) => {
    const { estado: e, perfil: p } = ultimo.current;
    if (!e.activo || !e.config) return { error: 'apagado' };
    if (ultimo.current.enCurso) return { error: 'ocupado' };
    ultimo.current.enCurso = true; setEnCurso(true);
    const h = huellaDe({ partidas: p.partidas ?? [], mastery: { o: p.olvidadas ?? [], r: referencia } });
    try {
      const r = await subirPartidas({ config: e.config, clave: e.clave, partidas: p.partidas ?? [], olvidadas: p.olvidadas ?? [], referencia, completo: e.completo && !todas });
      if (r.error) { cambiar({ error: r.error, intento: Date.now(), huellaIntentada: h }); return r; }
      cambiar({ huella: h, cuando: Date.now(), total: r.total, completo: true, error: null, intento: null, huellaIntentada: null });
      return r;
    } finally {
      ultimo.current.enCurso = false; setEnCurso(false);
    }
  }, [cambiar, referencia]);

  // Lo automático, como useEnvio: a los ESPERA_MS de un cambio, y `ahora` reintenta.
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

  /**
   * Lo que apuntó la tablet sola (3.70.0) llega a la base de datos con tu
   * clave: al abrir la app (y cada `ahora`, como mucho cada TRAER_CADA_MS)
   * se trae lo que aquí no está ni se quitó, y lo arreglado allí después
   * que aquí (3.76.0), para que App lo funda.
   */
  const [nuevas, setNuevas] = useState([]);
  const ultimaTraida = useRef(0);
  const montado = useRef(true);
  useEffect(() => () => { montado.current = false; }, []);
  useEffect(() => {
    const { estado: e } = ultimo.current;
    if (!e.activo || !e.config || !e.clave || Date.now() - ultimaTraida.current < TRAER_CADA_MS) return;
    ultimaTraida.current = Date.now();
    // Sin cancelar al rearmarse: al llegar comunidad.json la configuración es
    // otro objeto, el efecto vuelve a correr y la respuesta se tiraba (y el
    // tope de arriba no dejaba pedirla otra vez). Lo de aquí se mira AL LLEGAR.
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
