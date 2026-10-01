/**
 * Una captura reducida para mandarla al proyecto (3.29.0, temporal): la
 * pantalla de resultado de la tablet, para medir dónde está el cartel de
 * VICTORIA/DERROTA y poder apuntar la partida sola. Viaja como texto en una
 * incidencia (base64 dentro del cuerpo, que admite 65.536 caracteres), así
 * que tiene que ser PEQUEÑA: ancho fijo, paleta de 252 colores (6×7×6) y
 * dos imágenes, la pantalla entera a 320 px y la franja de arriba a 640 px
 * (donde suele ir el cartel), cada una en su mensaje.
 *
 * Puro: píxeles dentro, PNG fuera. Sin adb, sin red.
 */
import { escribirPng } from './png.mjs';

export const ANCHO_MINIATURA = 320;
export const ANCHO_TIRA = 640;
/** La franja de arriba donde va el cartel: el 28% del alto. */
export const ALTO_TIRA = 0.28;
const NIVELES = [6, 7, 6];

/** Reduce una región de la imagen a `ancho` píxeles de ancho promediando cajas. */
export function reducir(img, { ancho, region = [0, 0, 1, 1] } = {}) {
  const x0 = Math.floor(region[0] * img.ancho), y0 = Math.floor(region[1] * img.alto);
  const x1 = Math.ceil(region[2] * img.ancho), y1 = Math.ceil(region[3] * img.alto);
  const escala = (x1 - x0) / ancho;
  const alto = Math.max(1, Math.round((y1 - y0) / escala));
  const rgba = new Uint8Array(ancho * alto * 4);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) {
    const sx0 = x0 + Math.floor(x * escala), sx1 = Math.min(x1, x0 + Math.max(1, Math.floor((x + 1) * escala)));
    const sy0 = y0 + Math.floor(y * escala), sy1 = Math.min(y1, y0 + Math.max(1, Math.floor((y + 1) * escala)));
    let r = 0, g = 0, b = 0, n = 0;
    for (let sy = sy0; sy < sy1; sy++) for (let sx = sx0; sx < sx1; sx++) {
      const k = (sy * img.ancho + sx) * 4;
      r += img.rgba[k]; g += img.rgba[k + 1]; b += img.rgba[k + 2]; n += 1;
    }
    const k = (y * ancho + x) * 4;
    rgba[k] = r / (n || 1); rgba[k + 1] = g / (n || 1); rgba[k + 2] = b / (n || 1); rgba[k + 3] = 255;
  }
  return { ancho, alto, rgba };
}

/** Deja cada canal en pocos niveles (6×7×6 = 252 colores): cabe en una paleta PNG. */
export function cuantizar({ ancho, alto, rgba }) {
  const out = new Uint8Array(rgba.length);
  for (let k = 0; k < rgba.length; k += 4) {
    for (let c = 0; c < 3; c++) {
      const n = NIVELES[c];
      out[k + c] = Math.round(Math.round((rgba[k + c] / 255) * (n - 1)) * (255 / (n - 1)));
    }
    out[k + 3] = 255;
  }
  return { ancho, alto, rgba: out };
}

const aPng = (img) => escribirPng(cuantizar(img), () => 4, { paleta: true });
/** Lo que cabe en un mensaje de GitHub son 65.536 caracteres; esto deja sitio para el texto de alrededor. */
export const TOPE_BASE64 = 60000;

/** Un PNG en base64 que quepa en el tope: si no cabe, a la mitad de ancho, hasta que quepa. */
export function pngQueQuepa(img, { ancho, region = [0, 0, 1, 1], tope = TOPE_BASE64 } = {}) {
  for (let a = ancho; a >= 40; a = Math.floor(a / 2)) {
    const b64 = aPng(reducir(img, { ancho: a, region })).toString('base64');
    if (b64.length <= tope) return b64;
  }
  return aPng(reducir(img, { ancho: 40, region })).toString('base64');
}

/** Las dos imágenes pequeñas de una captura, como PNG en base64. */
export function miniaturasDe(img) {
  return {
    miniatura: pngQueQuepa(img, { ancho: ANCHO_MINIATURA }),
    tira: pngQueQuepa(img, { ancho: ANCHO_TIRA, region: [0, 0, 1, ALTO_TIRA] }),
  };
}
