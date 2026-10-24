import { useCallback, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';

/**
 * ¿Hay novedades sin ver? (3.65.5) La app se actualiza sola y nadie se
 * enteraba de lo que cambiaba: el pie marca la versión con «nuevo» hasta que
 * se abren las novedades de ESTA versión. Sin ventanas que tapen el draft.
 */
export function useNovedades(actual = __APP_VERSION__) {
  const [vista, setVista] = useState(() => leer(CLAVES.versionVista, null));
  const marcarVista = useCallback(() => { setVista(actual); guardar(CLAVES.versionVista, actual); }, [actual]);
  return { nueva: vista !== actual, marcarVista };
}
