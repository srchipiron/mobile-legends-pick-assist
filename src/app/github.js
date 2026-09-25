/**
 * Abrir una incidencia en GitHub YA RELLENA desde la app, sin credenciales:
 * se abre el formulario y tú solo confirmas. El repositorio se deduce de la
 * propia dirección (en Pages el primer tramo de la ruta ES el repositorio).
 * Lo usan el diagnóstico («A GitHub») y el envío de tus partidas.
 */

/** GitHub acepta direcciones largas, pero con más de esto algunos navegadores las cortan. */
export const TOPE_URL = 7000;

export function repositorioDe(location = globalThis.location) {
  const duenno = String(location?.hostname ?? '').split('.')[0] || 'srchipiron';
  const repo = String(location?.pathname ?? '').split('/').filter(Boolean)[0] ?? 'mlbb-roam-picker';
  return { duenno, repo };
}

export function urlDeIncidencia({ titulo, cuerpo, etiquetas = [] }, location = globalThis.location) {
  const { duenno, repo } = repositorioDe(location);
  const url = new URL(`https://github.com/${duenno}/${repo}/issues/new`);
  url.searchParams.set('title', titulo);
  if (etiquetas.length) url.searchParams.set('labels', etiquetas.join(','));
  url.searchParams.set('body', cuerpo);
  return url.toString();
}

/**
 * La API de GitHub, para subir las partidas SIN pasar por el navegador
 * (3.10.0): abrir el formulario ya relleno obligaba a iniciar sesión en
 * GitHub desde el móvil, y con el código dentro de la dirección ese inicio
 * de sesión fallaba (error 501). Con un token de acceso limitado a las
 * incidencias de este repositorio, la app la crea o la edita directamente.
 *
 * Es el ÚNICO destino al que viaja el token: en la cabecera Authorization,
 * nunca en la dirección ni en el cuerpo. Un token de grano fino con solo
 * «Issues: read and write» sobre este repositorio no puede tocar nada más,
 * y no tiene nada que ver con la cuenta del juego.
 */
export const API_GITHUB = 'https://api.github.com';

/** ¿Tiene forma de token? Lo demás lo dice GitHub al usarlo (401 si no vale). */
export function tokenPlausible(token) {
  const s = String(token ?? '').trim();
  return s.length >= 20 && !/\s/.test(s);
}

async function pedir(metodo, ruta, token, cuerpo, fetchImpl) {
  let r;
  try {
    r = await fetchImpl(`${API_GITHUB}${ruta}`, {
      method: metodo,
      headers: { Accept: 'application/vnd.github+json', Authorization: `Bearer ${token}`, 'X-GitHub-Api-Version': '2022-11-28', 'Content-Type': 'application/json' },
      body: JSON.stringify(cuerpo),
    });
  } catch { return { error: 'red' }; }
  let datos;
  try { datos = await r.json(); } catch { datos = null; }
  if (r.ok) return { datos };
  if (r.status === 401) return { error: 'token', estado: 401 };
  if (r.status === 403) return { error: 'permiso', estado: 403 };
  if (r.status === 404 || r.status === 410) return { error: 'noExiste', estado: r.status };
  return { error: 'otro', estado: r.status };
}

/**
 * Sube el código a una incidencia: edita la de siempre (`numero`) y, si ya
 * no existe o todavía no hay ninguna, abre una nueva con sus etiquetas. El
 * bot (partidas.yml) escucha las dos cosas, abrir y editar, así que todas
 * las subidas van a la MISMA incidencia y sus respuestas quedan en hilo.
 * Devuelve { numero, url, editada } o { error: 'token'|'permiso'|'red'|'otro' }.
 */
export async function subirIncidencia({ numero = null, titulo, cuerpo, etiquetas = [] }, token, { location = globalThis.location, fetch = globalThis.fetch } = {}) {
  const { duenno, repo } = repositorioDe(location);
  const base = `/repos/${duenno}/${repo}/issues`;
  if (numero) {
    const r = await pedir('PATCH', `${base}/${numero}`, token, { title: titulo, body: cuerpo }, fetch);
    if (!r.error) return { numero: r.datos?.number ?? numero, url: r.datos?.html_url ?? null, editada: true };
    if (r.error !== 'noExiste') return { error: r.error, estado: r.estado };
    // La incidencia guardada ya no está (borrada, o de otro repositorio): se abre otra.
  }
  const r = await pedir('POST', base, token, { title: titulo, body: cuerpo, ...(etiquetas.length ? { labels: etiquetas } : {}) }, fetch);
  // Un 404 al CREAR es el token sin acceso a este repositorio (GitHub esconde el repositorio), no una incidencia perdida.
  if (r.error) return { error: r.error === 'noExiste' ? 'permiso' : r.error, estado: r.estado };
  return { numero: r.datos?.number ?? null, url: r.datos?.html_url ?? null, editada: false };
}
