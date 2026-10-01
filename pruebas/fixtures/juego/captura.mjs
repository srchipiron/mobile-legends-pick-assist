/**
 * Una pantalla de draft ENTERA (2400×1504) hecha con los dos recortes reales
 * de Javi: la fila de baneos (`baneos.png`, sus diez baneos) y la columna de
 * picks enemigos (`picks-enemigos.png`, Clint y Khufra eligiendo). Lo demás,
 * negro. Sirve para probar el lector de punta a punta, también desde la app.
 */
import { readFileSync } from 'node:fs';
import { leerPng, escribirPng } from '../../../scripts/lector/png.mjs';

const aqui = (f) => new URL(f, import.meta.url);

/** Lo que había en esas capturas, leído a mano. */
export const VERDAD = {
  tuyos: ['Hirara', 'Marcel', 'Masha', 'Belerick', 'Eudora'],
  suyos: ['Saber', 'Irithel', 'Paquito', 'Aulus', 'Hirara'],
  enemigos: ['Clint', 'Khufra'],
};

export function capturaCompleta({ conPicks = true } = {}) {
  const ancho = 2400, alto = 1504, rgba = new Uint8Array(ancho * alto * 4);
  const tira = leerPng(readFileSync(aqui('baneos.png')));
  for (let y = 0; y < tira.alto; y++) for (let x = 0; x < tira.ancho; x++) {
    const dx = x < 720 ? x : x + 960, dy = y + 60;
    rgba.set(tira.rgba.subarray((y * tira.ancho + x) * 4, (y * tira.ancho + x) * 4 + 4), (dy * ancho + dx) * 4);
  }
  if (conPicks) {
    const col = leerPng(readFileSync(aqui('picks-enemigos.png')));
    for (let y = 0; y < col.alto; y++) rgba.set(col.rgba.subarray(y * col.ancho * 4, (y + 1) * col.ancho * 4), ((y + 230) * ancho + 2020) * 4);
  }
  return { ancho, alto, rgba };
}

export const capturaCompletaPng = (opciones) => escribirPng(capturaCompleta(opciones));
