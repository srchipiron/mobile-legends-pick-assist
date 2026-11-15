/**
 * El aprendizaje en su hilo (worker_threads): el lector sigue leyendo
 * mientras busca caras (decenas de segundos por captura en la tablet).
 * Recibe rutas de capturas (o recortes de la base de datos) y la verdad;
 * devuelve lo aprendido. No lanza programas.
 */
import { parentPort, workerData } from 'node:worker_threads';
import { readFileSync } from 'node:fs';
import { leerPng } from './png.mjs';
import { carasGuardadas } from './leer.mjs';
import { aprenderDe } from './aprender.mjs';
import { devolverPicks } from './recortes.mjs';

const { pares, aprendido } = workerData;
// Cada captura se decodifica al mirarla (14 MB cada una), o el recorte de la base de datos devuelto a su sitio.
const leer = (p) => (typeof p.picks === 'string' ? devolverPicks(p.picks) : leerPng(readFileSync(p.png)));
parentPort.postMessage(aprenderDe(pares.map((p) => ({ id: p.id, img: () => leer(p), verdad: p.verdad })), { caras: carasGuardadas(), aprendido }));
