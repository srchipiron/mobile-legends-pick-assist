import { useCallback, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';
import { escribirFichero, leerFichero } from '../github.js';

/** Lo guardado en `roam-picker:envio` (la clave no se renombra): solo el token; lo de versiones viejas se olvida. */
export function sanearToken(x) {
  const o = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  return { token: typeof o.token === 'string' && o.token.trim() ? o.token.trim() : null };
}

/**
 * El token de GitHub de Javi, solo para administrar (publicar
 * `licencias.json` y `comunidad.json`). No sale de aquí: ni en props (se
 * pasan `activo` y las funciones), ni en el perfil, ni en el diagnóstico; y
 * solo viaja a api.github.com (github.js).
 */
export function useToken() {
  const [estado, setEstado] = useState(() => sanearToken(leer(CLAVES.envio, {})));
  /** Guardar el token, o quitarlo con null. */
  const guardarToken = useCallback((token) => { const s = sanearToken({ token }); setEstado(s); guardar(CLAVES.envio, s); }, []);
  const escribir = useCallback((fichero) => (estado.token ? escribirFichero(fichero, estado.token) : Promise.resolve({ error: 'sinToken' })), [estado.token]);
  const leerDelRepositorio = useCallback((fichero) => (estado.token ? leerFichero(fichero, estado.token) : Promise.resolve({ error: 'sinToken' })), [estado.token]);
  return { activo: !!estado.token, guardarToken, escribir, leerDelRepositorio };
}
