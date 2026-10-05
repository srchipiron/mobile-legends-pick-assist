/**
 * La subida automática de tus partidas al proyecto (3.10.0): QUÉ hay que
 * subir y CUÁNDO toca. Puro, sin React ni red: la red está en github.js y
 * el estado en estado/useEnvio.js. Lo que se sube es el mismo código de
 * perfil de «Tu perfil» (partidas y maestría), a la misma incidencia de
 * GitHub cada vez, y el bot responde ahí con la medida.
 */

/** Cuánto se espera tras un cambio antes de subir: corregir un resultado justo después de apuntarlo sube una vez, no dos. Decisión de producto. */
export const ESPERA_MS = 3000;

/** Tras un fallo (sin red, token caducado), cuánto se espera antes de volver a intentarlo con los mismos datos. Decisión de producto. */
export const REINTENTO_MS = 10 * 60 * 1000;

/**
 * Huella de lo que se sube (partidas y maestría): si no cambia, no se sube.
 * FNV-1a sobre el JSON, con el nº de partidas delante para leerla a ojo.
 */
export function huellaDe({ partidas = [], mastery = {} } = {}) {
  const texto = JSON.stringify({ p: partidas, m: mastery });
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return `${partidas.length}.${h.toString(16)}`;
}

/** Lo guardado en `roam-picker:envio`, con la forma garantizada (un almacén editado a mano no puede reventar la app). */
export function sanearEnvio(x) {
  const o = x && typeof x === 'object' && !Array.isArray(x) ? x : {};
  const num = (v) => (Number.isFinite(v) && v > 0 ? v : null);
  const texto = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);
  return {
    token: texto(o.token),
    incidencia: num(o.incidencia),
    url: texto(o.url),
    huella: texto(o.huella),
    cuando: num(o.cuando),
    error: texto(o.error),
    intento: num(o.intento),
    huellaIntentada: texto(o.huellaIntentada),
  };
}

/**
 * ¿Toca subir ahora? Con token, con algo que subir, con red, con datos
 * distintos de los ya subidos, y sin machacar la API tras un fallo: los
 * mismos datos que fallaron se reintentan pasado REINTENTO_MS (o antes si
 * cambian).
 */
export function tocaSubir(estado, huella, { ahora, enLinea = true, partidas = 0 } = {}) {
  if (!estado?.token || !partidas || !enLinea) return false;
  if (huella === estado.huella) return false;
  if (estado.error && estado.huellaIntentada === huella && estado.intento && ahora - estado.intento < REINTENTO_MS) return false;
  return true;
}

/**
 * Las subidas APARTE (las pantallas del final de una partida) que aún no han
 * llegado (3.41.0). Antes se vaciaban antes de saber si la subida fue bien:
 * sin cobertura al apuntar, esa partida perdía sus pantallas para siempre.
 * Ahora esperan en cola (en memoria: es lo que dura la app abierta, y una
 * partida apuntada la deja abierta) y se reintentan al volver la red o cada
 * minuto. Como mucho `MAX_APARTE`: se tiran las más viejas, que son las que
 * menos dicen.
 */
export const MAX_APARTE = 4;

export const encolarAparte = (cola, envio) => [...cola, { ...envio }].slice(-MAX_APARTE);

/**
 * Sube en orden lo que hay en cola y devuelve lo que queda. Para en el
 * primer fallo (sin red, el siguiente fallaría igual). Si la incidencia se
 * crea y el comentario falla, queda solo el comentario, con su número: así
 * no se repite la incidencia.
 */
export async function vaciarCola(cola, { subir, comentar }) {
  const queda = [...cola];
  while (queda.length) {
    const e = queda[0];
    if (!e.numero) {
      const r = await subir(e);
      if (!r || r.error) return queda;
      queda[0] = { ...e, numero: r.numero ?? null };
      if (!e.comentario || !r.numero) { queda.shift(); continue; }
    }
    const c = await comentar({ numero: queda[0].numero, cuerpo: queda[0].comentario });
    if (!c || c.error) return queda;
    queda.shift();
  }
  return queda;
}
