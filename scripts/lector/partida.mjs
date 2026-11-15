/**
 * ¿Está la tablet EN PARTIDA? Por el MINIMAPA de arriba a la izquierda: sale
 * en todas las pantallas de juego y en ninguna de antes o después (draft,
 * carga, tabla, rango, MVP, estadísticas). Puro: píxeles dentro, números fuera.
 */
import { readFileSync } from 'node:fs';
import { reducir, cuantizar } from './miniatura.mjs';

/** [M] La media de 37 pantallas de juego a 160 px con la paleta de 252 colores. */
const PLANTILLA = JSON.parse(readFileSync(new URL('minimapa.json', import.meta.url), 'utf8'));
/** La región del minimapa, en fracciones de la pantalla [x0, y0, x1, y1]. */
export const REGION_MINIMAPA = PLANTILLA.region;
/** [M] Entre el peor de juego (0,50) y el mejor de fuera (0,42), en 83 pantallas. */
export const UMBRAL_PARTIDA = 0.47;

/** Los valores de la región del minimapa de una imagen ya reducida a 160 px (como la plantilla). */
export function vectorMinimapa(pequena) {
  const [x0, y0, x1, y1] = REGION_MINIMAPA;
  const v = [];
  for (let y = Math.round(y0 * pequena.alto); y < Math.round(y1 * pequena.alto); y++) {
    for (let x = Math.round(x0 * pequena.ancho); x < Math.round(x1 * pequena.ancho); x++) {
      const k = (y * pequena.ancho + x) * 4;
      v.push(pequena.rgba[k], pequena.rgba[k + 1], pequena.rgba[k + 2]);
    }
  }
  return v;
}

function correlacion(a, b) {
  const n = Math.min(a.length, b.length);
  if (!n) return 0;
  let ma = 0, mb = 0;
  for (let i = 0; i < n; i++) { ma += a[i]; mb += b[i]; }
  ma /= n; mb /= n;
  let s = 0, sa = 0, sb = 0;
  for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; s += x * y; sa += x * x; sb += y * y; }
  return sa && sb ? s / Math.sqrt(sa * sb) : 0;
}

/** Cuánto se parece la esquina de una captura (entera o ya reducida a la plantilla) al minimapa. */
export function parecidoAPartida(img) {
  const pequena = img.ancho === PLANTILLA.ancho ? img : cuantizar(reducir(img, { ancho: PLANTILLA.ancho }));
  return correlacion(vectorMinimapa(pequena), PLANTILLA.v);
}

export const enPartida = (img) => parecidoAPartida(img) >= UMBRAL_PARTIDA;
