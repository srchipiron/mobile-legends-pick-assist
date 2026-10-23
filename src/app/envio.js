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
    // El parte de salud de la tablet (3.63.0): su incidencia y el último que subió.
    tablet: num(o.tablet),
    tabletHuella: texto(o.tabletHuella),
    tabletCuando: num(o.tabletCuando),
    // Lo ya subido aparte (3.65.3): al reabrir la app con el draft completo, la
    // misma lectura se subía otra vez (#142, #143 y #145 eran una).
    subidas: Array.isArray(o.subidas) ? o.subidas.filter((v) => typeof v === 'string' && v.length <= 80).slice(-MAX_SUBIDAS) : [],
  };
}

/** Las últimas subidas aparte que se recuerdan. Decisión de producto: unas semanas de partidas. */
export const MAX_SUBIDAS = 60;

/** ¿Ya se subió esto (aquí o en otra pestaña)? Sin `id`, nunca. */
export const yaSubido = (estado, guardado, id) => !!id && [...(estado?.subidas ?? []), ...(guardado?.subidas ?? [])].includes(id);

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

/** Cada cuánto sube el parte de la tablet si todo sigue igual: uno al día basta para ver que va. Decisión de producto. */
export const PARTE_CADA_MS = 24 * 60 * 60 * 1000;
/** Ni con avisos más de uno cada tanto: un aviso que va y viene no puede llenar la incidencia. Decisión de producto. */
export const PARTE_MINIMO_MS = 30 * 60 * 1000;
/** ¿Toca subir el parte? Con token; si cambian los avisos (y hace más de PARTE_MINIMO_MS), o si hace un día del último. */
/**
 * Lo del parte que ya hizo OTRA pestaña (3.65.2): con la app abierta dos
 * veces, cada una tenía su copia del estado y las dos subían el mismo parte
 * (dos comentarios en un segundo, el 22 de octubre). Lo guardado manda si es
 * más reciente.
 */
export function conLoDeOtraPestana(estado, guardado) {
  const g = guardado ?? {};
  const cuando = Math.max(estado?.tabletCuando ?? 0, g.tabletCuando ?? 0) || null;
  const deOtra = cuando && cuando === g.tabletCuando && cuando !== estado?.tabletCuando;
  return { ...estado, tabletCuando: cuando, tabletHuella: deOtra ? g.tabletHuella ?? null : estado?.tabletHuella ?? null, tablet: estado?.tablet ?? g.tablet ?? null };
}

export function tocaParte(estado, parte, { ahora }) {
  if (!estado?.token || !parte) return false;
  const desde = estado.tabletCuando ? ahora - estado.tabletCuando : Infinity;
  if (desde < PARTE_MINIMO_MS) return false;
  return parte.huella !== estado.tabletHuella || desde >= PARTE_CADA_MS;
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
/**
 * Las partidas que viajan en cada subida (3.60.2): las más recientes. El bot
 * funde por instante con lo que ya tiene (`fundirPerfil`), así que no se
 * pierde ninguna; mandarlas todas pasaba del límite de 65.536 caracteres del
 * cuerpo de una incidencia hacia las 350–400 partidas (237 eran 38.114) y
 * GitHub la rechazaba, para siempre. 200 con lector son unos 30.000.
 */
export const PARTIDAS_POR_ENVIO = 200;
export const paraSubir = (perfil = {}) => ({ ...perfil, partidas: [...(perfil.partidas ?? [])].sort((a, b) => (b.t ?? 0) - (a.t ?? 0)).slice(0, PARTIDAS_POR_ENVIO) });

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
