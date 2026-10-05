/**
 * La huella de cada imagen que se publica (3.41.0), para pedirla con
 * `?v=<huella>`. Las caras y los iconos se guardan en el móvil con
 * `CacheFirst` (funcionan sin cobertura), así que una imagen que cambia en el
 * servidor con el MISMO nombre no llegaba nunca: Masha y Bruno, rehechos,
 * habrían seguido con la cara vieja en el móvil aunque el repositorio ya
 * tuviera la nueva. La huella sale del CONTENIDO del fichero que se publica,
 * no de la URL de la API: si una bajada falla, la huella sigue siendo la del
 * fichero viejo y no se guarda en caché una imagen vieja con una clave nueva.
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
