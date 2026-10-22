import { hayAlmacen } from './estado/almacen.js';

/**
 * Datos del entorno que solo existen en el navegador, para el diagnóstico.
 * Vive en la app y no en el motor: el motor no sabe de `window`.
 */
export function leerEntorno({ version, buildTime, rango, publicada = null, lector = null }) {
  return {
    lector,
    version,
    versionPublicada: publicada?.version ?? null,
    buildTime: buildTime ? new Date(buildTime).toLocaleString('es-ES') : null,
    rango,
    width: window.innerWidth,
    height: window.innerHeight,
    standalone: window.matchMedia?.('(display-mode: standalone)').matches ?? false,
    storage: hayAlmacen(),
    sw: 'serviceWorker' in navigator
      ? (navigator.serviceWorker.controller ? 'activo' : 'registrado sin controlar')
      : 'no soportado',
  };
}

/** Lo que se espera a version.json e historial.json antes del diagnóstico (decisión de producto). */
export const PLAZO_PUBLICADA_MS = 4000;

/**
 * Qué versión hay PUBLICADA y las últimas corridas de la vigilancia, sin
 * pasar por la caché. El service worker guarda la app entera, así que se
 * puede estar usando la de ayer con los datos de hoy. Si no hay red, null:
 * no poder preguntarlo no es un problema.
 */
export async function pedirPublicada({ plazo = PLAZO_PUBLICADA_MS } = {}) {
  const sinCache = async (ruta) => {
    try {
      // Con plazo (3.60.2): con la red colgada el botón no hacía nada y el
      // informe salía minutos después, cuando ya no se esperaba.
      const res = await fetch(`${ruta}?t=${Date.now()}`, { cache: 'no-store', signal: AbortSignal.timeout(plazo) });
      return res.ok ? await res.json() : null;
    } catch {
      return null;
    }
  };
  const [publicada, historial] = await Promise.all([sinCache('./version.json'), sinCache('./historial.json')]);
  return { publicada, historial };
}
