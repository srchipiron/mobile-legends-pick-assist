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
