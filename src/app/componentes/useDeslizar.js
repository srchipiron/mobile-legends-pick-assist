import { useLayoutEffect, useRef } from 'react';

/** Decisión de producto: lo que tarda una tarjeta en llegar a su puesto nuevo. */
export const DESLIZAR_MS = 320;
/** Y lo que tarda en aparecer una que entra entre las ocho. */
export const APARECER_MS = 200;
const RESERVA = 'cubic-bezier(0.2, 0.8, 0.2, 1)';

function muelle() {
  try {
    const v = window.getComputedStyle(document.documentElement).getPropertyValue('--muelle').trim();
    return v && window.CSS?.supports('transition-timing-function', v) ? v : RESERVA;
  } catch { return RESERVA; }
}

function animar(el, fotogramas, opciones) {
  try { el.animate(fotogramas, opciones); } catch { /* sin Web Animations: se queda quieta, que es lo de antes */ }
}

/**
 * Las tarjetas se DESLIZAN a su puesto nuevo cuando cambia el orden (3.22.0),
 * en vez de saltar: al quitar un enemigo o fijar tu pick se ve quién sube y
 * quién baja. Es la técnica FLIP: se mide dónde estaba cada tarjeta
 * (`offsetTop`, que no incluye transformaciones, así que una animación a
 * medias no ensucia la medida), se deja que React la ponga en su sitio y se
 * anima desde la diferencia hasta cero. Solo se mueven las que CAMBIAN DE
 * PUESTO: si crece el análisis de encima, todas bajan a la vez y eso no es
 * noticia. Una tarjeta que entra entre las ocho aparece con un fundido.
 *
 * Con «reducir movimiento» del sistema no se anima nada. La transformación
 * dura 320 ms y va en la TARJETA, que no tiene descendientes `position:
 * fixed` (las hojas se montan en App): la trampa del `backdrop-filter` del
 * pie no aplica aquí.
 *
 * Cuando cambian los DATOS (llega el meta tras el catálogo, cambias de rango
 * o de línea) el orden entero se rehace y no hay «quién sube»: se colocan
 * sin animar. Medido al escribirlo: sin esta guarda, al cargar la página
 * ocho tarjetas volaban 800 px.
 *
 * @param ref       el contenedor; sus hijos directos con `data-heroe` son las tarjetas
 * @param contexto  lo que, si cambia, no es un cambio de orden sino otro ranking (los datos, la línea)
 */
export function useDeslizar(ref, contexto) {
  const antes = useRef(null);
  const contextoPrevio = useRef(contexto);
  useLayoutEffect(() => {
    const cont = ref.current;
    if (!cont) return;
    const tarjetas = [...cont.querySelectorAll(':scope > [data-heroe]')];
    const ahora = new Map(tarjetas.map((el, i) => [el.dataset.heroe, { x: el.offsetLeft, y: el.offsetTop, i }]));
    const previo = antes.current;
    antes.current = ahora;
    const mismoContexto = contextoPrevio.current === contexto;
    contextoPrevio.current = contexto;
    // La primera vez no hay de dónde venir: aparecer de golpe es lo correcto.
    if (!previo?.size || !mismoContexto) return;
    const orden = (m) => [...m.keys()].join('|');
    if (orden(previo) === orden(ahora)) return;
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return;
    const easing = muelle();
    for (const el of tarjetas) {
      const a = previo.get(el.dataset.heroe);
      const b = ahora.get(el.dataset.heroe);
      if (!a) {
        animar(el, [{ opacity: 0 }, { opacity: 1 }], { duration: APARECER_MS, easing: 'ease-out' });
      } else if (a.i !== b.i && (Math.abs(a.y - b.y) > 1 || Math.abs(a.x - b.x) > 1)) {
        animar(el, [{ transform: `translate(${a.x - b.x}px, ${a.y - b.y}px)` }, { transform: 'none' }], { duration: DESLIZAR_MS, easing });
      }
    }
  });
}
