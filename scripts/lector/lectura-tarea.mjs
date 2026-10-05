/**
 * Un hilo del lector (3.39.0): recibe la captura YA decodificada en memoria
 * compartida (no se copia: son 14 MB) y lee el trozo que le toca
 * (`leerParte`). Vive mientras vive el servidor; las caras le llegan una
 * vez, al arrancar. Sin adb, sin programas.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { leerParte } from './lectura.mjs';

const caras = workerData.caras;
parentPort.on('message', ({ id, parte, ancho, alto, pixeles, aprendido }) => {
  try {
    parentPort.postMessage({ id, resultado: leerParte({ ancho, alto, rgba: new Uint8Array(pixeles) }, parte, caras, aprendido) });
  } catch (e) {
    parentPort.postMessage({ id, error: String(e?.message ?? e) });
  }
});
