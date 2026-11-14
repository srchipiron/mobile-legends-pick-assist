import { useEffect } from 'react';

/** [P] Cada cuánto se pregunta por una versión nueva con la app abierta, y cada cuánto se mira si ya se puede recargar. */
const CADA_HORA_MS = 60 * 60 * 1000;
const PENDIENTE_MS = 15 * 1000;

/**
 * Que la app se actualice sola: se pregunta al volver a la app y cada hora,
 * y se recarga cuando el worker nuevo toma el control (`controllerchange`,
 * el mecanismo imprescindible). Con pestillo (sin él podría quedar en
 * bucle), sin recargar en la primera visita (no había controlador) y nunca
 * con una hoja abierta (se perdería lo escrito): espera a que se cierre.
 */
export function useActualizacion() {
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return undefined;
    let yaRecargado = false;
    let habiaControlador = !!navigator.serviceWorker.controller;
    let pendiente = false;
    const recargar = () => {
      if (yaRecargado) return;
      if (document.querySelector('[role="dialog"]')) { pendiente = true; return; }
      yaRecargado = true;
      window.location.reload();
    };
    const alCambiar = () => {
      if (!habiaControlador) { habiaControlador = true; return; }
      recargar();
    };
    const preguntar = () => {
      if (document.visibilityState !== 'visible') return;
      if (pendiente) { recargar(); return; }
      navigator.serviceWorker.getRegistration().then((r) => r?.update()).catch(() => {});
    };
    navigator.serviceWorker.addEventListener('controllerchange', alCambiar);
    document.addEventListener('visibilitychange', preguntar);
    preguntar();
    const cadaHora = setInterval(preguntar, CADA_HORA_MS);
    const siPendiente = setInterval(() => { if (pendiente) recargar(); }, PENDIENTE_MS);
    return () => {
      clearInterval(cadaHora);
      clearInterval(siPendiente);
      navigator.serviceWorker.removeEventListener('controllerchange', alCambiar);
      document.removeEventListener('visibilitychange', preguntar);
    };
  }, []);
}
