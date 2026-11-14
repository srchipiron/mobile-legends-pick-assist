/**
 * La huella de cada imagen que se publica, para pedirla con `?v=<huella>`:
 * las caras y los iconos van al móvil con `CacheFirst`, y una imagen
 * cambiada con el MISMO nombre no llegaba nunca [C]. Sale del CONTENIDO del
 * fichero, no de la URL: una bajada fallida deja la huella del fichero viejo.
 */
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

export const LARGO_HUELLA = 8;

export function huellasDeImagenes(dir, ext) {
  let ficheros;
  try { ficheros = readdirSync(dir).filter((f) => f.endsWith(ext) && /^\d+\./.test(f)); } catch { return {}; }
  return Object.fromEntries(ficheros.map((f) => [
    f.slice(0, -ext.length),
    createHash('md5').update(readFileSync(join(dir, f))).digest('hex').slice(0, LARGO_HUELLA),
  ]));
}
