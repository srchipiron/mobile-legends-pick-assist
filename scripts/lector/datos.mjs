/**
 * Lo que la tablet lee de disco o baja de la web pública de Pick Assist: los
 * datos con los que decide, la configuración pública de la base de datos, lo
 * que la APK escribe de la tablet (`salud.json`) y lo último que dijo el
 * móvil de ti (`solo-movil.json`). Todo se lee con forma o no se usa.
 */
import { mkdirSync, readFileSync, writeFileSync, renameSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { sanearAjustes } from '../../src/comun/contrato.js';
import { sanearConfig } from '../../src/comun/basedatos.js';
import { leerAjustesSolo, ajustesEfectivos } from './solo.mjs';

/** [C] Los únicos sitios de fuera a los que la tablet pide algo: tres ficheros fijos de la web pública, solo GET. */
export const DATOS_DE_LA_WEB = {
  catalogo: 'https://srchipiron.github.io/mobile-legends-pick-assist/data/heroes.json',
  meta: 'https://srchipiron.github.io/mobile-legends-pick-assist/data/roam-meta.json',
  comunidad: 'https://srchipiron.github.io/mobile-legends-pick-assist/comunidad.json',
};
/** [D] El bot trae datos dos veces al día. */
export const REFRESCAR_DATOS_MS = 6 * 60 * 60 * 1000;
export const FICHEROS = { catalogo: 'heroes.json', meta: 'roam-meta.json', comunidad: 'comunidad.json' };

/** ¿Tiene forma de lo que sirve la app? (una página de error o un fichero a medias no se guarda) */
export const datosValidos = (que, j) => {
  if (que === 'comunidad') return !!j && typeof j === 'object' && !Array.isArray(j);
  return que === 'catalogo' ? Array.isArray(j?.heroes) && j.heroes.length >= 50 : Array.isArray(j?.heroes) && j.heroes.length >= 50 && !!j.stats;
};

/**
 * Los datos para decidir, de las carpetas dadas (los bajados primero, luego
 * los que trae la APK): el meta MÁS NUEVO por `generatedAt` (no el primero
 * que aparezca: con la descarga rota se decidía con datos viejos) y el
 * catálogo de su misma carpeta si lo hay. `de` es el índice de la carpeta.
 */
export function lectorDeDatos(carpetas) {
  const cache = {};
  const leer = (c, que) => {
    const f = join(c, FICHEROS[que]);
    try {
      const m = statSync(f).mtimeMs;
      if (cache[f]?.m === m) return cache[f].j;
      const j = JSON.parse(readFileSync(f, 'utf8'));
      if (!datosValidos(que, j)) return null;
      cache[f] = { m, j };
      return j;
    } catch { return null; }
  };
  const fecha = (j) => { const t = Date.parse(j?.generatedAt ?? ''); return Number.isFinite(t) ? t : -Infinity; };
  return () => {
    let meta = null, deMeta = null;
    carpetas.forEach((c, i) => { const j = leer(c, 'meta'); if (j && (!meta || fecha(j) > fecha(meta))) { meta = j; deMeta = i; } });
    const orden = deMeta == null ? carpetas : [carpetas[deMeta], ...carpetas.filter((_, i) => i !== deMeta)];
    let catalogo = null;
    for (const c of orden) { catalogo = leer(c, 'catalogo'); if (catalogo) break; }
    return { catalogo, meta, de: deMeta };
  };
}

/** Baja los datos de la web a `carpeta` (a un temporal y luego encima). Nunca lanza; dice cuántos ficheros guardó y deja una línea por cada uno que no. */
export async function bajarDatos(carpeta, { pedir = (...a) => fetch(...a), plazoMs = 60000, registrar = () => {} } = {}) {
  mkdirSync(carpeta, { recursive: true });
  let guardados = 0;
  for (const [que, url] of Object.entries(DATOS_DE_LA_WEB)) {
    try {
      const r = await pedir(url, { signal: AbortSignal.timeout(plazoMs) });
      if (!r.ok) { registrar(`Datos de la web (${que}): no se pudo (HTTP ${r.status}).`); continue; }
      const texto = await r.text();
      if (!datosValidos(que, JSON.parse(texto))) { registrar(`Datos de la web (${que}): rechazados, no se pudo usar (no tienen la forma de Pick Assist).`); continue; }
      const f = join(carpeta, FICHEROS[que]);
      writeFileSync(`${f}.tmp`, texto);
      renameSync(`${f}.tmp`, f);
      guardados += 1;
    } catch (e) { registrar(`Datos de la web (${que}): no se pudo (${e.message}); sigo con los que había.`); }
  }
  return guardados;
}

/** La dirección y la clave PÚBLICA de la base de datos (bajada o la que trae la APK), saneadas; null si no hay. */
export function leerComunidad(carpetas) {
  for (const c of carpetas) {
    try { const j = sanearConfig(JSON.parse(readFileSync(join(c, FICHEROS.comunidad), 'utf8'))); if (j) return j; } catch { /* la siguiente */ }
  }
  return null;
}

/** Lo que la APK escribe de la tablet (`salud.json`): solo los campos conocidos, con su tipo. null si no hay. */
export function leerSaludDeLaApk(fichero) {
  try {
    const j = JSON.parse(readFileSync(fichero, 'utf8'));
    const salida = {};
    for (const k of ['apk', 'modelo', 'esquina', 'burbujaEstado']) if (typeof j[k] === 'string') salida[k] = j[k].slice(0, 60);
    for (const k of ['android', 'memoriaLibreMB', 'memoriaAppMB', 'cuando']) if (Number.isFinite(j[k])) salida[k] = Math.round(j[k]);
    for (const k of ['grabando', 'burbuja', 'bateriaLibre', 'memoriaBaja']) if (typeof j[k] === 'boolean') salida[k] = j[k];
    return Object.keys(salida).length ? salida : null;
  } catch { return null; }
}

/**
 * Los ajustes con los que lee la tablet: los de la APK (`solo.json`) y, si no
 * eligió línea, los últimos del móvil (`POST /ajustes`), guardados en
 * `solo-movil.json` para que valgan tras reiniciar sin el móvil delante.
 * `ajustes.delMovil()` da lo último del móvil (maestría, clave, cuándo).
 */
export function ajustesDeLaTablet(casa, interno) {
  const fichero = join(casa, 'solo-movil.json');
  const conCuando = (j) => { const a = sanearAjustes(j); return a ? { ...a, cuando: Number.isFinite(j?.cuando) ? j.cuando : 0 } : null; };
  let guardado;
  try { guardado = conCuando(JSON.parse(readFileSync(fichero, 'utf8'))); } catch { guardado = null; }
  const delMovil = () => {
    const m = interno.ajustesDelMovil();
    if (m && JSON.stringify(m) !== JSON.stringify(guardado)) {
      guardado = m;
      try { writeFileSync(fichero, JSON.stringify(guardado)); } catch { /* sin disco, vale lo de memoria */ }
    }
    return m ?? guardado;
  };
  const ajustes = () => ajustesEfectivos(leerAjustesSolo(join(casa, 'solo.json')), delMovil());
  ajustes.delMovil = delMovil;
  return ajustes;
}
