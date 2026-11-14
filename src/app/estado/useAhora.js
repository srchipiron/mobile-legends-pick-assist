import { useEffect, useState } from 'react';

/**
 * El único reloj de la app, para lo que depende del tiempo sin que nadie
 * toque nada (la pregunta de cómo fue la partida, las partidas a
 * comprobar, reintentar la subida): cada minuto y al volver a la app.
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
