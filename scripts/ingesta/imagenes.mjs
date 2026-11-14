/**
 * Las imágenes se bajan a NUESTRO sitio: enlazar el CDN le cuenta tu IP a un
 * tercero y sin cobertura no llega [P]. Solo lo que falta o cambió de origen
 * (`fuentes.json`: id → URL), con tope, y solo lo que ES una imagen.
 */

import { writeFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TIMEOUT_MS, UA } from './contexto.mjs';

export const FUENTES = 'fuentes.json';

/** Lo que llega de la API es dato: id numérico (un «../x» escribía fuera) y https o la propia máquina [C]. */
export const esIdDeImagen = (id) => /^\d{1,12}$/.test(String(id));
export function esUrlDeImagen(url) {
  try {
    const u = new URL(String(url));
    return u.protocol === 'https:' || (u.protocol === 'http:' && ['127.0.0.1', 'localhost'].includes(u.hostname));
  } catch { return false; }
}

/** Por la cabecera, no por la extensión: la API sirve JPEG con nombre .png [M]. */
function esImagen(buf) {
  if (buf.length < 200) return false;
  const png = buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG';
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const webp = buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
  return png || jpeg || webp;
}

/**
 * Baja `{ id: url }` a `dir/<id><ext>`. Un fallo deja el fichero y la URL de
 * antes (se reintenta en la corrida siguiente). Devuelve `{ bajados,
 * cambiados, fallos, yaEstaban }`.
 */
export async function bajarImagenes(urlPorId, dir, ext, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)) } = {}) {
  let bajados = 0, cambiados = 0, fallos = 0;
  let existentes = new Set();
  try {
    existentes = new Set((await readdir(dir)).filter((f) => f.endsWith(ext)));
  } catch {
    await mkdir(dir, { recursive: true });
  }
  let fuentes = {};
  try {
    const leidas = JSON.parse(await readFile(resolve(dir, FUENTES), 'utf8'));
    if (leidas && typeof leidas === 'object' && !Array.isArray(leidas)) fuentes = leidas;
  } catch { /* sin fichero (o roto): se aprende bajando */ }

  const fallo = (id, motivo) => { fallos += 1; if (fallos <= 3) console.warn(`  · imagen ${String(id).slice(0, 20)}: ${motivo}`); };
  for (const [id, url] of Object.entries(urlPorId)) {
    if (!url) continue;
    if (!esIdDeImagen(id) || !esUrlDeImagen(url)) { fallo(id, 'id o dirección no válidos'); continue; }
    const esta = existentes.has(`${id}${ext}`);
    if (esta && fuentes[id] === url) continue;
    try {
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!esImagen(buf)) throw new Error('no es una imagen');
      await writeFile(resolve(dir, `${id}${ext}`), buf);
      fuentes[id] = url;
      bajados += 1;
      if (esta) cambiados += 1;
    } catch (err) {
      fallo(id, err.message);
    }
    await sleep(80);
  }
  // Ordenado por id: el diff de una corrida sin cambios es vacío.
  const ordenadas = Object.fromEntries(Object.entries(fuentes).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })));
  await writeFile(resolve(dir, FUENTES), `${JSON.stringify(ordenadas, null, 1)}\n`);
  return { bajados, cambiados, fallos, yaEstaban: existentes.size };
}
