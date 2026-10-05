/**
 * Las imagenes: se bajan a NUESTRO sitio (nunca se enlaza el CDN de Moonton),
 * solo las que faltan, con tope de tiempo, y comprobando por sus cabeceras que
 * lo bajado es de verdad una imagen.
 */

import { writeFile, mkdir, readdir, readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { TIMEOUT_MS, UA, diagnostics, sleep } from './contexto.mjs';

/**
 * Los iconos de los objetos, guardados en NUESTRO sitio.
 *
 * No se enlazan desde el CDN de Moonton por dos motivos: la app promete que
 * tus datos no salen de tu movil -y cada imagen enlazada le cuenta tu IP a un
 * tercero-, y en mitad de un draft una imagen que tarda es una imagen que no
 * esta. Sirviendolos nosotros funcionan tambien sin cobertura.
 *
 * Solo se baja lo que falta O lo que ha cambiado de origen (3.41.0): cada
 * carpeta lleva `FUENTES` (id -> URL de la que salió el fichero). Antes se
 * miraba solo si el fichero existía, y Masha y Bruno, rehechos en 2.2.16,
 * seguían con la cara VIEJA en las tarjetas aunque la API ya diera otra URL
 * (comprobado el 5 de octubre de 2026: el fichero guardado y el de su URL de
 * hoy eran imágenes distintas). Un fichero sin URL apuntada (los de antes de
 * esto) se baja una vez para saberla. Si la bajada falla se queda el de
 * antes con su URL de antes: así se vuelve a intentar en la corrida siguiente.
 */
export const FUENTES = 'fuentes.json';

export async function bajarImagenes(urlPorClave, dir, ext, clave) {
  let bajados = 0;
  let fallos = 0;
  let cambiados = 0;
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

  for (const [id, url] of Object.entries(urlPorClave)) {
    if (!url) continue;
    const esta = existentes.has(`${id}${ext}`);
    if (esta && fuentes[id] === url) continue;
    try {
      // Con tope: un CDN que no responde colgaba el paso hasta el
      // timeout-minutes y se perdía la corrida entera con nueve minutos hechos.
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!esImagen(buf)) throw new Error('no es una imagen');
      await writeFile(resolve(dir, `${id}${ext}`), buf);
      fuentes[id] = url;
      bajados += 1;
      if (esta) cambiados += 1;
    } catch (err) {
      fallos += 1;
      if (fallos <= 3) console.warn(`  · imagen ${id}: ${err.message}`);
    }
    await sleep(80);
  }
  // Ordenado por id: el diff de una corrida sin cambios es vacío.
  const ordenadas = Object.fromEntries(Object.entries(fuentes).sort(([a], [b]) => a.localeCompare(b, 'en', { numeric: true })));
  await writeFile(resolve(dir, FUENTES), `${JSON.stringify(ordenadas, null, 1)}\n`);
  (diagnostics.imagenes ??= {})[clave] = { bajados, cambiados, fallos, yaEstaban: existentes.size };
  return { bajados, cambiados, fallos };
}

/**
 * Que lo bajado sea de verdad una imagen. Guardar una pagina de error con
 * extension .png dejaria un hueco roto en pantalla sin que nada fallara: es
 * justo la clase de fallo invisible que mas caro sale aqui.
 *
 * Se miran las cabeceras, no la extension del enlace: la API sirve JPEG con
 * nombre .png, asi que fiarse del nombre habria colado basura.
 */
function esImagen(buf) {
  if (buf.length < 200) return false;
  const png = buf[0] === 0x89 && buf.toString('latin1', 1, 4) === 'PNG';
  const jpeg = buf[0] === 0xff && buf[1] === 0xd8;
  const webp = buf.toString('latin1', 0, 4) === 'RIFF' && buf.toString('latin1', 8, 12) === 'WEBP';
  return png || jpeg || webp;
}
