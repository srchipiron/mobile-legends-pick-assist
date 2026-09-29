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

/** Decisión de producto (como en iOS y Android): lo que hay que bajar la hoja para que se cierre. */
export const CERRAR_PX = 80;
/** Un tirón rápido (px/ms) la cierra aunque sea corto. */
export const CERRAR_VELOCIDAD = 0.6;
const INTERACTIVO = 'input, button, a, select, textarea, label, [role=tab]';

const quieto = () => !!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
const animar = (el, fotogramas, opciones) => {
  try { return el.animate(fotogramas, opciones); } catch { return null; }
};

/**
 * Cerrar una hoja ARRASTRÁNDOLA hacia abajo (3.22.0), como las hojas de iOS
 * y Android: desde el asa de arriba o desde el título, nunca desde un botón,
 * un campo o la rejilla (ahí el dedo toca o desplaza, y cerrar sin querer en
 * mitad del draft sería peor que no tener el gesto). Cierra con la misma
 * `onCerrar` que el botón, así que la entrada del historial se retira igual.
 */
function useArrastrarParaCerrar(hoja, onCerrar) {
  const cerrarRef = useRef(onCerrar);
  cerrarRef.current = onCerrar;
  return (e) => {
    const el = hoja.current;
    if (!el || !cerrarRef.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    const objetivo = e.target;
    if (objetivo.closest?.('.sheet') !== el) return;
    const enAsa = !!objetivo.closest('.sheet-asa');
    const enTitulo = !!objetivo.closest('.sheet-head') && !objetivo.closest(INTERACTIVO);
    if (!enAsa && !enTitulo) return;
    const y0 = e.clientY;
    let ultimo = { y: y0, t: e.timeStamp };
    let previo = ultimo;
    let dy = 0;
    try { el.setPointerCapture(e.pointerId); } catch { /* sin captura: sigue funcionando mientras el dedo esté encima */ }
    el.style.transition = 'none';
    const mover = (ev) => {
      dy = Math.max(0, ev.clientY - y0);
      previo = ultimo; ultimo = { y: ev.clientY, t: ev.timeStamp };
      el.style.translate = `0 ${dy}px`;
    };
    const soltar = (ev) => {
      el.removeEventListener('pointermove', mover);
      el.removeEventListener('pointerup', soltar);
      el.removeEventListener('pointercancel', soltar);
      const dt = Math.max(1, ultimo.t - previo.t);
      const velocidad = (ultimo.y - previo.y) / dt;
      const cierra = ev.type === 'pointerup' && (dy >= CERRAR_PX || (dy > 16 && velocidad >= CERRAR_VELOCIDAD));
      el.style.transition = '';
      el.style.translate = '';
      if (cierra) {
        const salida = quieto() ? null : animar(el, [{ translate: `0 ${dy}px` }, { translate: '0 100%' }], { duration: 160, easing: 'ease-in', fill: 'forwards' });
        if (salida?.finished) salida.finished.then(() => cerrarRef.current?.(), () => cerrarRef.current?.());
        else cerrarRef.current?.();
      } else if (dy > 0 && !quieto()) {
        animar(el, [{ translate: `0 ${dy}px` }, { translate: '0 0' }], { duration: 240, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' });
      }
    };
    el.addEventListener('pointermove', mover);
    el.addEventListener('pointerup', soltar);
    el.addEventListener('pointercancel', soltar);
  };
}

/**
 * Una hoja a pantalla completa (diálogo modal). Toda hoja de la app pasa por
 * aquí: así todas se cierran con atrás y todas devuelven el foco. Desde
 * 3.22.0 entra con un muelle (CSS, `@starting-style`) y se cierra también
 * arrastrando el asa hacia abajo.
 */
export function Hoja({ etiqueta, onCerrar, children, alClicar }) {
  const ref = useCerrarConAtras(onCerrar);
  const alPulsar = useArrastrarParaCerrar(ref, onCerrar);
  return (
    <div ref={ref} tabIndex={-1} className="sheet" role="dialog" aria-modal="true" aria-label={etiqueta} onClick={alClicar} onPointerDown={alPulsar}>
      {onCerrar && <div className="sheet-asa" aria-hidden="true"><span /></div>}
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
