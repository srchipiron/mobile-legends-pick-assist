import { useEffect, useRef } from 'react';

/**
 * Cierra una hoja con Escape y con el botón ATRÁS de Android. Instalada como
 * app, atrás con una hoja abierta salía de la app en mitad del draft: no
 * había ninguna entrada de historial que retirar. Cada hoja mete una al
 * abrirse y la retira al cerrarse por botón, así que atrás cierra la hoja y
 * nada más. También mueve el foco dentro al abrir y lo devuelve al cerrar.
 */
export function useCerrarConAtras(onClose) {
  const ref = useRef(onClose);
  ref.current = onClose;
  const hoja = useRef(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    const marca = { hoja: Date.now() + Math.random() };
    const anterior = document.activeElement;
    let porHistoria = false;
    try { window.history.pushState(marca, ''); } catch { /* sin historial */ }
    const alVolver = () => { porHistoria = true; ref.current?.(); };
    const esc = (e) => { if (e.key === 'Escape') { e.preventDefault(); ref.current?.(); } };
    window.addEventListener('popstate', alVolver);
    window.addEventListener('keydown', esc);
    // Tras el render: si la hoja ya ha enfocado algo suyo (el buscador), se respeta.
    const enfocar = setTimeout(() => {
      const el = hoja.current;
      if (el && !el.contains(document.activeElement)) el.focus({ preventScroll: true });
    }, 0);
    return () => {
      clearTimeout(enfocar);
      window.removeEventListener('popstate', alVolver);
      window.removeEventListener('keydown', esc);
      // Cerrada por botón: se retira la entrada que metimos, para que atrás
      // no «vuelva» a una hoja que ya no está.
      if (!porHistoria && window.history.state?.hoja === marca.hoja) window.history.back();
      if (anterior && typeof anterior.focus === 'function' && document.contains(anterior)) anterior.focus({ preventScroll: true });
    };
  }, []);
  return hoja;
}

/**
 * Una hoja a pantalla completa (diálogo modal). Toda hoja de la app pasa por
 * aquí: así todas se cierran con atrás y todas devuelven el foco.
 */
export function Hoja({ etiqueta, onCerrar, children, alClicar }) {
  const ref = useCerrarConAtras(onCerrar);
  return (
    <div ref={ref} tabIndex={-1} className="sheet" role="dialog" aria-modal="true" aria-label={etiqueta} onClick={alClicar}>
      {children}
    </div>
  );
}

/** La cabecera típica de una hoja: título a la izquierda y botones a la derecha. */
export function CabeceraDeHoja({ titulo, children }) {
  return (
    <div className="sheet-head">
      <strong style={{ flex: 1, alignSelf: 'center' }}>{titulo}</strong>
      {children}
    </div>
  );
}
