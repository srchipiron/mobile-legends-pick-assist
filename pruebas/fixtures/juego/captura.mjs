/**
 * Una pantalla de draft ENTERA (2400×1504) hecha con recortes reales de las
 * capturas de Javi: la fila de baneos (`baneos.png`, sus diez baneos), la
 * columna de picks enemigos (`picks-enemigos.png`, Clint y Khufra eligiendo;
 * o `picks-enemigos-2.png`, 1 de octubre de 2026: Rafaela, Eudora, Gloo,
 * Lesley y Aamon, tres de ellos SIN espejo) y, desde 3.31.0, la columna de
 * su equipo (`aliados.png`, cinco con skin, los nombres de los jugadores
 * tapados) con el nombre de la quinta fila pintado de amarillo, que es como
 * el juego marca la tuya. Lo demás, negro. Sirve para probar el lector de
 * punta a punta, también desde la app.
 */
import { readFileSync } from 'node:fs';
import { leerPng, escribirPng } from '../../../scripts/lector/png.mjs';

const aqui = (f) => new URL(f, import.meta.url);

/** Lo que había en esas capturas, leído a mano. */
export const VERDAD = {
  tuyos: ['Hirara', 'Marcel', 'Masha', 'Belerick', 'Eudora'],
  suyos: ['Saber', 'Irithel', 'Paquito', 'Aulus', 'Hirara'],
  enemigos: ['Clint', 'Khufra'],
  /** La segunda columna de picks: Gloo se queda a 0,80 por un pelo y sale «?». */
  enemigos2: ['Rafaela', 'Eudora', 'Gloo', 'Lesley', 'Aamon'],
  aliados: ['Clint', 'Guinevere', 'Novaria', 'Leomord', 'Estes'],
  /** La quinta fila es la de Javi (nombre en amarillo). */
  tuyo: 'Estes',
  tuyoFila: 4,
};

export function capturaCompleta({ conPicks = true, columna = 1, conAliados = true, filaAmarilla = VERDAD.tuyoFila, filasAmarillas = null } = {}) {
  const ancho = 2400, alto = 1504, rgba = new Uint8Array(ancho * alto * 4);
  const tira = leerPng(readFileSync(aqui('baneos.png')));
  for (let y = 0; y < tira.alto; y++) for (let x = 0; x < tira.ancho; x++) {
    const dx = x < 720 ? x : x + 960, dy = y + 60;
    rgba.set(tira.rgba.subarray((y * tira.ancho + x) * 4, (y * tira.ancho + x) * 4 + 4), (dy * ancho + dx) * 4);
  }
  if (conPicks) {
    const col = leerPng(readFileSync(aqui(columna === 2 ? 'picks-enemigos-2.png' : 'picks-enemigos.png')));
    for (let y = 0; y < col.alto; y++) rgba.set(col.rgba.subarray(y * col.ancho * 4, (y + 1) * col.ancho * 4), ((y + 230) * ancho + 2020) * 4);
  }
  if (conAliados) {
    const col = leerPng(readFileSync(aqui('aliados.png')));
    for (let y = 0; y < col.alto; y++) rgba.set(col.rgba.subarray(y * col.ancho * 4, (y + 1) * col.ancho * 4), ((y + 228) * ancho + 60) * 4);
    // El nombre propio en amarillo: trazos de 2 px cada 16 en su caja (≈ el 12% de los píxeles, como el 10,7% medido).
    for (const fila of filasAmarillas ?? (filaAmarilla >= 0 ? [filaAmarilla] : [])) {
      const y0 = 404 + 216 * fila;
      for (let y = y0 + 6; y < y0 + 30; y++) for (let x = 20; x < 300; x++) if (x % 16 < 2) rgba.set([255, 214, 10, 255], (y * ancho + x) * 4);
    }
  }
  return { ancho, alto, rgba };
}

export const capturaCompletaPng = (opciones) => escribirPng(capturaCompleta(opciones));
