/**
 * Las imagenes: se bajan a NUESTRO sitio (nunca se enlaza el CDN de Moonton),
 * solo las que faltan, con tope de tiempo, y comprobando por sus cabeceras que
 * lo bajado es de verdad una imagen.
 */

import { writeFile, mkdir, readdir } from 'node:fs/promises';
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
 * Solo se baja lo que falta: son 100x100 y no cambian salvo que Moonton
 * rediseñe el objeto, asi que la segunda corrida no descarga nada.
 */
export async function bajarImagenes(urlPorClave, dir, ext, clave) {
  let bajados = 0;
  let fallos = 0;
  let existentes = new Set();
  try {
    existentes = new Set((await readdir(dir)).filter((f) => f.endsWith(ext)));
  } catch {
    await mkdir(dir, { recursive: true });
  }

  for (const [id, url] of Object.entries(urlPorClave)) {
    if (!url || existentes.has(`${id}${ext}`)) continue;
    try {
      // Con tope: un CDN que no responde colgaba el paso hasta el
      // timeout-minutes y se perdía la corrida entera con nueve minutos hechos.
      const res = await fetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(TIMEOUT_MS) });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const buf = Buffer.from(await res.arrayBuffer());
      if (!esImagen(buf)) throw new Error('no es una imagen');
      await writeFile(resolve(dir, `${id}${ext}`), buf);
      bajados += 1;
    } catch (err) {
      fallos += 1;
      if (fallos <= 3) console.warn(`  · imagen ${id}: ${err.message}`);
    }
    await sleep(80);
  }
  (diagnostics.imagenes ??= {})[clave] = { bajados, fallos, yaEstaban: existentes.size };
  return { bajados, fallos };
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
