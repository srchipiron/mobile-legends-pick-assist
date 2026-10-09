/**
 * El aprendizaje en un hilo aparte (worker_threads), para que el lector
 * siga contestando a la app mientras busca caras: unas decenas de segundos
 * por captura en un móvil. Recibe rutas y la verdad; devuelve lo aprendido.
 * Sin adb, sin programas.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { leerPng } from './png.mjs';
import { carasGuardadas } from './leer.mjs';
import { aprenderDe, carasAprendidas } from './aprender.mjs';
import { recortesDelDraft } from './recortes.mjs';

const { pares, aprendido } = workerData;
const caras = carasGuardadas();
// Cada captura se decodifica al mirarla (14 MB cada una en un móvil): no todas a la vez.
const leer = (p) => leerPng(readFileSync(p.png));
const resultado = aprenderDe(pares.map((p) => ({ id: p.id, img: () => leer(p), verdad: p.verdad })), { caras, aprendido });
// Y los recortes de los picks para medir el lector (3.52.0), de las capturas
// que SÍ eran la pantalla del draft. Un fallo aquí no tira lo aprendido.
let recortes = [];
try {
  const porId = new Map(pares.map((p) => [p.id, p]));
  recortes = recortesDelDraft(resultado.informe, (id) => leer(porId.get(id)), caras, { posiciones: resultado.aprendido.picks, extra: carasAprendidas(resultado.aprendido) });
} catch { /* sin recortes: lo aprendido sale igual */ }
parentPort.postMessage({ ...resultado, recortes });
