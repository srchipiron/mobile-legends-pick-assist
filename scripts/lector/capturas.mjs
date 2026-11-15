/**
 * Las capturas que el lector guarda en `<casa>/capturas` para aprender de una
 * corrección: cuáles, cuántas y cuándo se borran. Lo único que el lector
 * borra en la tablet son sus propias capturas (CLAUDE.md, seguridad).
 */
import { readdirSync, statSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { PREGUNTA_CADUCA_MS } from '../../src/comun/contrato.js';

/** [D] Lo que vive una captura: lo mismo que la pregunta «¿Cómo acabó?» de su partida (sin capturas no hay de qué aprender). */
export const RETENCION_CAPTURAS_MS = PREGUNTA_CADUCA_MS;
/** [D] Como mucho, por tipo: 40 lecturas son un minuto de draft a 1,5 s (las del draft abierto se protegen aparte). */
export const MAX_CAPTURAS = { lectura: 40, fotograma: 24, resultado: 8 };
/** [M] Las capturas de un draft que se miran al aprender o recortar: 8 repartidas, con la primera y la última. */
export const CAPTURAS_A_MIRAR = 8;
/** [C] El id de una lectura: la fecha ISO con «-» y su número (`lectura-2026-10-14T17-52-57-139Z-42`). */
export const ID_DE_LECTURA = /^lectura-[\w-]+$/;

/** El nombre de una captura del lector; cualquier otro fichero de la carpeta no se toca. */
const FICHERO_DE_CAPTURA = /^(lectura|fotograma|resultado)-[\w-]+?\.(png|json|verdad\.json)$/;
const idDeFichero = (n) => n.replace(/\.(png|json|verdad\.json)$/, '');

/** El instante de una captura por su nombre, o NaN. */
export function instanteDeCaptura(id) {
  const m = /^lectura-(\d{4}-\d\d-\d\d)T(\d\d)-(\d\d)-(\d\d)-(\d{3})Z/.exec(typeof id === 'string' ? id : '');
  return m ? Date.parse(`${m[1]}T${m[2]}:${m[3]}:${m[4]}.${m[5]}Z`) : NaN;
}

/** [M] Las `n` capturas de un draft que se miran: repartidas por él, con la primera y la última (las ocho últimas eran el menú de equipamiento). */
export function capturasAMirar(ids, n = CAPTURAS_A_MIRAR) {
  const orden = [...new Set(ids ?? [])].sort();
  if (orden.length <= n) return orden;
  return [...new Set(Array.from({ length: n }, (_, i) => orden[Math.round((i * (orden.length - 1)) / (n - 1))]))];
}

/**
 * Borra las capturas de más de `retencionMs` y las que pasan del tope de su
 * tipo (las más viejas: el nombre lleva la hora). Las de `proteger` (en uso,
 * del draft abierto) no cuentan para el tope; la retención vale para todas.
 * Devuelve cuántos ficheros borró.
 */
export function podarCapturas(carpeta, { ahora = Date.now(), retencionMs = RETENCION_CAPTURAS_MS, maximos = MAX_CAPTURAS, proteger = new Set() } = {}) {
  let nombres;
  try { nombres = readdirSync(carpeta); } catch { return 0; }
  let borrados = 0;
  for (const tipo of Object.keys(maximos)) {
    const ficheros = nombres.filter((n) => FICHERO_DE_CAPTURA.test(n) && n.startsWith(`${tipo}-`));
    const ids = [...new Set(ficheros.map(idDeFichero))].filter((id) => !proteger.has(id)).sort();
    const sobran = new Set(ids.slice(0, Math.max(0, ids.length - maximos[tipo])));
    for (const n of ficheros) {
      const ruta = join(carpeta, n);
      try {
        if (!sobran.has(idDeFichero(n)) && ahora - statSync(ruta).mtimeMs <= retencionMs) continue;
        unlinkSync(ruta);
        borrados += 1;
      } catch { /* ya no está */ }
    }
  }
  return borrados;
}
