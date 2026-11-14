import { useCallback, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';

/** ¿Hay novedades sin ver? El pie marca la versión con «nuevo» hasta abrir las de ESTA versión. */
export function useNovedades(actual = __APP_VERSION__) {
  const [vista, setVista] = useState(() => leer(CLAVES.versionVista, null));
  const marcarVista = useCallback(() => { setVista(actual); guardar(CLAVES.versionVista, actual); }, [actual]);
  return { nueva: vista !== actual, marcarVista };
}
