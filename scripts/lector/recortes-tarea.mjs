/**
 * Los recortes de un draft para medir el lector (3.81.0), en un hilo aparte
 * (worker_threads) como el aprendizaje: decodificar y leer ocho capturas
 * lleva segundos en la tablet y el lector sigue contestando. Recibe rutas;
 * devuelve los recortes (nunca la verdad: la tablet sola no la sabe).
 * Sin adb, sin programas.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { leerPng } from './png.mjs';
import { carasGuardadas } from './leer.mjs';
import { carasAprendidas, aliadasAprendidas } from './aprender.mjs';
import { mejoresRecortes } from './recortes.mjs';

const { capturas, aprendido } = workerData;
const porId = new Map(capturas.map((c) => [c.id, c.png]));
let recortes = [];
try {
  recortes = mejoresRecortes(capturas.map((c) => c.id), (id) => leerPng(readFileSync(porId.get(id))), carasGuardadas(), { posiciones: aprendido?.picks ?? null, extra: carasAprendidas(aprendido), aliadas: aliadasAprendidas(aprendido) });
} catch { /* sin recortes */ }
parentPort.postMessage(recortes);
