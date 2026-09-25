import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { CLAVES, leer, guardar } from './almacen.js';
import { useAhora } from './useAhora.js';
import { recogerPerfil, exportarPerfil } from '../../motor/perfil.js';
import { subirIncidencia } from '../github.js';
import { huellaDe, sanearEnvio, tocaSubir, ESPERA_MS } from '../envio.js';

/**
 * La subida automática de tus partidas (3.10.0). Con un token de GitHub
 * guardado, cada cambio en tus partidas o tu maestría se sube solo (a los
 * ESPERA_MS) a la misma incidencia del proyecto, y el bot responde ahí. Sin
 * token no hace nada: queda el botón de siempre, que abre el formulario.
 *
 * El estado se guarda en `roam-picker:envio`; el token NO sale de aquí: ni
 * en el código de perfil, ni en el diagnóstico, ni en las props (la hoja
 * recibe `activo`, no el token). `guardar` va FUERA de los updaters.
 */
export function useEnvio({ perfil, t }) {
  const [estado, setEstado] = useState(() => sanearEnvio(leer(CLAVES.envio, {})));
  const [enCurso, setEnCurso] = useState(false);
  const ahora = useAhora();
  const huella = useMemo(() => huellaDe(perfil), [perfil]);
  const ultimo = useRef({ perfil, estado, enCurso: false });
  ultimo.current.perfil = perfil;

  const cambiar = useCallback((parche) => {
    const siguiente = sanearEnvio({ ...ultimo.current.estado, ...parche });
    ultimo.current.estado = siguiente;
    setEstado(siguiente);
    guardar(CLAVES.envio, siguiente);
  }, []);

  /** Sube ahora (lo llama el temporizador y el botón). Devuelve lo que dijo la API. */
  const enviar = useCallback(async () => {
    const { perfil: p, estado: e } = ultimo.current;
    if (!e.token) return { error: 'sinToken' };
    if (ultimo.current.enCurso) return { error: 'ocupado' };
    ultimo.current.enCurso = true; setEnCurso(true);
    const h = huellaDe(p);
    try {
      const codigo = await exportarPerfil(recogerPerfil(p));
      const conApp = (p.partidas ?? []).filter((x) => !x.previa).length;
      const r = await subirIncidencia({
        numero: e.incidencia,
        etiquetas: ['partidas'],
        titulo: t('hist.enviarTitulo', { n: conApp, fecha: new Date().toLocaleDateString() }),
        cuerpo: `${t('hist.autoCuerpo')}\n\n\`\`\`\n${codigo}\n\`\`\``,
      }, e.token);
      if (r.error) { cambiar({ error: r.error, intento: Date.now(), huellaIntentada: h }); return r; }
      cambiar({ incidencia: r.numero, url: r.url, huella: h, cuando: Date.now(), error: null, intento: null, huellaIntentada: null });
      return r;
    } finally {
      ultimo.current.enCurso = false; setEnCurso(false);
    }
  }, [t, cambiar]);

  /** Activar (con el token) o quitar (null). Quitarlo conserva la incidencia: al volver a activarlo sigue en la misma. */
  const guardarToken = useCallback((token) => {
    const limpio = typeof token === 'string' && token.trim() ? token.trim() : null;
    cambiar({ token: limpio, error: null, intento: null, huellaIntentada: null });
  }, [cambiar]);

  // Lo automático: cuando hay algo nuevo que subir, a los ESPERA_MS. `ahora`
  // (cada minuto y al volver a la app) vuelve a mirar tras un fallo o sin red.
  useEffect(() => {
    if (enCurso) return undefined;
    const enLinea = typeof navigator === 'undefined' || navigator.onLine !== false;
    if (!tocaSubir(estado, huella, { ahora, enLinea, partidas: perfil.partidas?.length ?? 0 })) return undefined;
    const id = setTimeout(() => { enviar(); }, ESPERA_MS);
    return () => clearTimeout(id);
  }, [estado, huella, ahora, enCurso, perfil.partidas?.length, enviar]);

  const pendiente = !!estado.token && (perfil.partidas?.length ?? 0) > 0 && huella !== estado.huella;
  return {
    activo: !!estado.token, incidencia: estado.incidencia, url: estado.url, cuando: estado.cuando, error: estado.error,
    enCurso, pendiente, enviar, guardarToken,
  };
}
