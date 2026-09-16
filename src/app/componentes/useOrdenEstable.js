import { useEffect, useState } from 'react';

/**
 * Orden estable para una tira de chips que se tocan a contrarreloj: el
 * tocado se queda en su sitio (marcado) y el candidato nuevo entra por el
 * final. Antes el siguiente ocupaba justo el hueco del tocado y un doble
 * toque baneaba a dos. Es el MISMO hook para la tira de fuera y para la de
 * dentro del selector; si aparece otra tira así, usa este.
 *
 * @param items     nombres en el orden que propone el motor
 * @param marcados  Set con los ya elegidos
 * @param visibles  cuántos sin marcar se enseñan
 */
export function useOrdenEstable(items, marcados, visibles) {
  const [orden, setOrden] = useState([]);
  useEffect(() => {
    setOrden((prev) => {
      const vivos = prev.filter((n) => marcados.has(n) || items.includes(n));
      const nuevos = items.filter((n) => !vivos.includes(n));
      const salida = []; let libres = 0;
      for (const n of [...vivos, ...nuevos]) {
        if (marcados.has(n)) { salida.push(n); continue; }
        if (libres >= visibles) continue;
        salida.push(n); libres += 1;
      }
      return salida;
    });
  }, [items, marcados, visibles]);
  return orden;
}
