import { useEffect, useState } from 'react';

/**
 * La hora, para lo que depende del tiempo que pasa sin que nadie toque nada
 * (la pregunta de cómo fue la partida, diez minutos después de fijar el
 * pick). Se refresca cada minuto y al volver a la app: ahí es cuando se mira.
 */
export function useAhora(intervaloMs = 60 * 1000) {
  const [ahora, setAhora] = useState(() => Date.now());
  useEffect(() => {
    const tic = () => setAhora(Date.now());
    const id = setInterval(tic, intervaloMs);
    const alVolver = () => { if (document.visibilityState === 'visible') tic(); };
    document.addEventListener('visibilitychange', alVolver);
    return () => { clearInterval(id); document.removeEventListener('visibilitychange', alVolver); };
  }, [intervaloMs]);
  return ahora;
}
