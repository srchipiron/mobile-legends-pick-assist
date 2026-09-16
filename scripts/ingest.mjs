#!/usr/bin/env node
/**
 * Ingesta de datos meta de MLBB. ENTRADA FINA: todo vive en scripts/ingesta/
 * (cli, descubrimiento, descarga, extraccion, relaciones, fusion, imagenes,
 * salida). Aqui solo se re-exporta lo de siempre y se arranca `main` cuando se
 * ejecuta directamente, con el mismo codigo de salida de siempre.
 *
 * La API de la comunidad (proyecto Rone Arena, antes OpenMLBB / api-mobilelegends)
 * ha cambiado de dominio y de prefijo de rutas más de una vez. En vez de fijar
 * una URL que caduca, este script PRUEBA las bases y los prefijos conocidos y se
 * queda con la primera combinación que responde. Lo que ha funcionado y lo que ha
 * fallado queda anotado en el JSON de salida, para poder diagnosticar desde la app.
 *
 *   node scripts/ingest.mjs
 *   node scripts/ingest.mjs --rank mythic --days 7
 *   node scripts/ingest.mjs --base https://otra.api/api
 *   node scripts/ingest.mjs --base http://127.0.0.1:8816/api --pausa 0 --out /tmp/x.json   (pruebas)
 */

import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from './ingesta/cli.mjs';

export { parseArgs, main } from './ingesta/cli.mjs';
export { callRoute } from './ingesta/descarga.mjs';
export { extraerLineas, extraerRol } from './ingesta/extraccion.mjs';
export { serializar } from './ingesta/salida.mjs';

// Solo se ejecuta al lanzarlo directamente, para poder importar sus funciones
// desde las pruebas sin disparar una ingesta entera.
const ejecutadoDirectamente = process.argv[1]
  && resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (ejecutadoDirectamente) {
  main().catch((err) => {
    console.error('Ingesta fallida:', err.message);
    process.exit(1);
  });
}
