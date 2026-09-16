import { useEffect } from 'react';

/**
 * Que la app se actualice sola.
 *
 * El service worker guarda la app entera para que funcione sin cobertura, y
 * el navegador solo comprueba si hay una nueva al navegar. Con la pestaña
 * abierta desde hace horas te quedas con la de ayer: pasó, y el diagnóstico
 * tenía que pedirte que cerraras y volvieras a abrir.
 *
 * Se pregunta al volver a la app y una vez por hora, y se recarga en cuanto
 * la nueva toma el control (`controllerchange`: es el mecanismo
 * imprescindible, comprobado en un navegador de verdad). Recargar no quita
 * nada: el draft, la maestría y las partidas se guardan en cada cambio.
 */
export function useActualizacion() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;

    // Una sola vez: sin el pestillo, un navegador que reinstale el worker
    // podría dejar la página recargándose en bucle.
    let yaRecargado = false;
    // En la PRIMERA visita el worker toma el control de una página que ya es
    // la nueva: recargar ahí era una recarga en frío para nada, y podía
    // cortar la elección de línea del primer arranque.
    let habiaControlador = !!navigator.serviceWorker.controller;
    // Con una hoja abierta (maestría a medias de teclear, un código pegado)
    // no se recarga: se espera a que se cierre. Medido: una actualización
    // con «Tu maestría» abierta perdía lo escrito.
    let pendiente = false;
    const hojaAbierta = () => !!document.querySelector('[role="dialog"]');
    const recargar = () => {
      if (yaRecargado) return;
      if (hojaAbierta()) { pendiente = true; return; }
      yaRecargado = true;
      window.location.reload();
    };
    const alCambiar = () => {
      if (!habiaControlador) { habiaControlador = true; return; }
      recargar();
    };
    navigator.serviceWorker.addEventListener('controllerchange', alCambiar);

    const preguntar = () => {
      if (document.visibilityState !== 'visible') return;
      if (pendiente) { recargar(); return; }
      navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {});
    };
    preguntar();
    document.addEventListener('visibilitychange', preguntar);
    const cadaHora = setInterval(preguntar, 60 * 60 * 1000);
    const siPendiente = setInterval(() => { if (pendiente) recargar(); }, 15 * 1000);

    return () => {
      clearInterval(siPendiente);
      navigator.serviceWorker.removeEventListener('controllerchange', alCambiar);
      document.removeEventListener('visibilitychange', preguntar);
      clearInterval(cadaHora);
    };
  }, []);
}
