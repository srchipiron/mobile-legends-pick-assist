/**
 * Los recortes de un draft para medir el lector, en un hilo aparte
 * (worker_threads) como el aprendizaje: decodificar y leer ocho capturas
 * lleva segundos en la tablet y el lector sigue contestando. Recibe rutas;
 * devuelve los recortes (nunca la verdad: la tablet sola no la sabe). Con
 * `cabecera`, solo la franja de arriba de la primera que se decodifique
 * (`{ id, cabecera }` o null), para volver a medir la fila de baneos.
 * Sin adb, sin programas.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { leerPng } from './png.mjs';
import { carasGuardadas } from './leer.mjs';
import { carasAprendidas, aliadasAprendidas } from './aprender.mjs';
import { mejoresRecortes, cabeceraDeDraft } from './recortes.mjs';

const { capturas, aprendido, cabecera = false } = workerData;
const porId = new Map(capturas.map((c) => [c.id, c.png]));
if (cabecera) {
  let hecha = null;
  for (const c of capturas) {
    try { const b64 = cabeceraDeDraft(leerPng(readFileSync(c.png))); if (b64) { hecha = { id: c.id, cabecera: b64 }; break; } } catch { /* la siguiente */ }
  }
  parentPort.postMessage(hecha);
} else {
  let recortes = [];
  try {
    recortes = mejoresRecortes(capturas.map((c) => c.id), (id) => leerPng(readFileSync(porId.get(id))), carasGuardadas(), { posiciones: aprendido?.picks ?? null, extra: carasAprendidas(aprendido), aliadas: aliadasAprendidas(aprendido) });
  } catch { /* sin recortes */ }
  parentPort.postMessage(recortes);
}
