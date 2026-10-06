/**
 * ¿Está la tablet EN PARTIDA? (3.44.0) Para llevar el reloj de los consejos
 * en directo: el lector no lee todavía el reloj del juego, así que la
 * partida empieza cuando aparece el MINIMAPA (arriba a la izquierda), que
 * está en todas las pantallas de juego y en ninguna de las de antes o
 * después (draft, carga, tabla, rango, MVP, estadísticas).
 *
 * Medido el 5 de octubre de 2026 con las 83 pantallas que subió la
 * vigilancia del final (incidencias #14–#35, a 160 px y con la paleta de
 * 252 colores, como las hace `fotogramaDe`): la región del minimapa contra
 * la media de 37 pantallas de juego (`minimapa.json`, las de índice par)
 * da en las de juego que la plantilla no vio entre 0,50 y 0,99 (todas
 * menos una por encima de 0,62) y en las de fuera de partida como mucho
 * 0,42 (la tabla de derrota y las de rango; el draft 0,19–0,26).
 * `UMBRAL_PARTIDA` va en medio y la partida empieza con DOS seguidas: una
 * pantalla rara suelta no arranca el reloj.
 *
 * Y el MARCADOR (muertes de cada equipo y reloj, arriba en el centro: x
 * 44–58%, y 0–5%): se recorta a resolución completa para aprender sus
 * dígitos con las pantallas de las partidas de Javi. Todavía no se lee.
 *
 * Puro: píxeles dentro, números fuera.
 */
import { readFileSync } from 'node:fs';
import { reducir, cuantizar, pngQueQuepa } from './miniatura.mjs';

const PLANTILLA = JSON.parse(readFileSync(new URL('minimapa.json', import.meta.url), 'utf8'));
/** La región del minimapa, en fracciones de la pantalla [x0, y0, x1, y1]. */
export const REGION_MINIMAPA = PLANTILLA.region;
/** Entre el peor de juego (0,50) y el mejor de fuera (0,42), medidos. */
export const UMBRAL_PARTIDA = 0.47;
/** El marcador de arriba en el centro, [x0, y0, x1, y1]. */
export const REGION_MARCADOR = [0.44, 0, 0.58, 0.05];
/** Lo que ocupa como mucho el recorte del marcador en base64 (va con los fotogramas a la incidencia). */
export const TOPE_MARCADOR = 12000;

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

/**
 * Cuánto se parece la esquina de una captura al minimapa. `img` puede ser
 * la captura entera o una ya reducida a `PLANTILLA.ancho` px.
 */
export function parecidoAPartida(img) {
  const pequena = img.ancho === PLANTILLA.ancho ? img : cuantizar(reducir(img, { ancho: PLANTILLA.ancho }));
  return correlacion(vectorMinimapa(pequena), PLANTILLA.v);
}

export const enPartida = (img) => parecidoAPartida(img) >= UMBRAL_PARTIDA;

/** El marcador a resolución completa (o a la mitad si no cabe), como PNG en base64. */
export const recorteMarcador = (img) => pngQueQuepa(img, {
  ancho: Math.round((REGION_MARCADOR[2] - REGION_MARCADOR[0]) * img.ancho),
  region: REGION_MARCADOR,
  tope: TOPE_MARCADOR,
});
