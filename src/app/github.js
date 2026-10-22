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

const deBase64 = (b64) => new TextDecoder().decode(Uint8Array.from(atob(String(b64).replace(/\s/g, '')), (c) => c.charCodeAt(0)));
const RUTA_ESCRIBIBLE = /^public\/[\w.-]+\.json$/;

/**
 * Lee un fichero del repositorio tal como está AHORA en `main` (3.65.1): la
 * copia de Pages tarda minutos en rehacerse tras cada cambio, y la
 * administración enseñaba lo de antes. `{ contenido }` (null si no existe) o
 * `{ error }`. Las mismas rutas que `escribirFichero`.
 */
export async function leerFichero({ ruta }, token, { location = globalThis.location, fetch = globalThis.fetch } = {}) {
  if (!RUTA_ESCRIBIBLE.test(ruta)) return { error: 'ruta' };
  const { duenno, repo } = repositorioDe(location);
  const r = await pedir('GET', `/repos/${duenno}/${repo}/contents/${ruta}?ref=main`, token, undefined, fetch);
  if (r.error === 'noExiste') return { contenido: null, sha: null };
  if (r.error) return { error: r.error, estado: r.estado };
  try { return { contenido: deBase64(r.datos?.content ?? ''), sha: r.datos?.sha ?? null }; } catch { return { error: 'otro' }; }
}

/**
 * Escribe un fichero del repositorio en `main` (3.65.0: `licencias.json`,
 * desde el panel de administración de Javi). Con el token de siempre, que
 * necesita además permiso de «Contents: write»; sin él contesta 'permiso'.
 * Solo rutas fijas que pide el código, nunca una que venga de fuera.
 * `contenido` puede ser una función del contenido ACTUAL del repositorio
 * (3.65.1): así un cambio parte de lo último guardado y no de una copia vieja.
 */
export async function escribirFichero({ ruta, contenido, mensaje }, token, { location = globalThis.location, fetch = globalThis.fetch } = {}) {
  if (!RUTA_ESCRIBIBLE.test(ruta)) return { error: 'ruta' };
  const { duenno, repo } = repositorioDe(location);
  const base = `/repos/${duenno}/${repo}/contents/${ruta}`;
  const actual = await leerFichero({ ruta }, token, { location, fetch });
  if (actual.error) return { error: actual.error, estado: actual.estado };
  let texto;
  try { texto = typeof contenido === 'function' ? contenido(actual.contenido) : contenido; } catch (e) { return { error: e?.message === 'yaHay' ? 'yaHay' : 'otro' }; }
  const b64 = btoa(String.fromCharCode(...new TextEncoder().encode(texto)));
  const r = await pedir('PUT', base, token, { message: mensaje, content: b64, branch: 'main', ...(actual.sha ? { sha: actual.sha } : {}) }, fetch);
  return r.error ? { error: r.error, estado: r.estado } : { ok: true, contenido: texto };
}

/** Un comentario en una incidencia existente. Devuelve { url } o { error }. */
export async function comentarIncidencia({ numero, cuerpo }, token, { location = globalThis.location, fetch = globalThis.fetch } = {}) {
  const { duenno, repo } = repositorioDe(location);
  const r = await pedir('POST', `/repos/${duenno}/${repo}/issues/${numero}/comments`, token, { body: cuerpo }, fetch);
  if (r.error) return { error: r.error, estado: r.estado };
  return { url: r.datos?.html_url ?? null };
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
