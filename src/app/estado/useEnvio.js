import { useCallback, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';
import { escribirFichero, leerFichero } from '../github.js';
import { sanearEnvio } from '../envio.js';

/**
 * El token de GitHub (3.10.0), hoy solo para la administración (3.65.0):
 * publicar `licencias.json` y `comunidad.json`. Hasta 3.97.0 también subía
 * tus partidas, las pantallas del final, las caras de los picks y el parte
 * de la tablet a incidencias del proyecto; desde 3.98.0 todo eso va a la
 * base de datos (lo sube la tablet o useComunidad) y ya no se abre ninguna
 * incidencia.
 *
 * El estado se guarda en `roam-picker:envio`; el token NO sale de aquí: ni
 * en el código de perfil, ni en el diagnóstico, ni en las props (se pasan
 * `activo` y las funciones, no el token). `guardar` va FUERA de los updaters.
 */
export function useEnvio() {
  const [estado, setEstado] = useState(() => sanearEnvio(leer(CLAVES.envio, {})));

  /** Activar (con el token) o quitar (null). */
  const guardarToken = useCallback((token) => {
    const siguiente = sanearEnvio({ token });
    setEstado(siguiente);
    guardar(CLAVES.envio, siguiente);
  }, []);

  /**
   * Escribir un fichero del repositorio con el token (3.65.0: la
   * administración publica `licencias.json`). El token tampoco sale de aquí:
   * la administración recibe esta función, no el token.
   */
  const escribir = useCallback((fichero) => (estado.token ? escribirFichero(fichero, estado.token) : Promise.resolve({ error: 'sinToken' })), [estado.token]);
  const leerDelRepositorio = useCallback((fichero) => (estado.token ? leerFichero(fichero, estado.token) : Promise.resolve({ error: 'sinToken' })), [estado.token]);

  return { activo: !!estado.token, guardarToken, escribir, leerDelRepositorio };
}
