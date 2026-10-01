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
import { aprenderDe } from './aprender.mjs';

const { pares, aprendido } = workerData;
const caras = carasGuardadas();
const resultado = aprenderDe(pares.map((p) => ({ id: p.id, img: leerPng(readFileSync(p.png)), verdad: p.verdad })), { caras, aprendido });
parentPort.postMessage(resultado);
