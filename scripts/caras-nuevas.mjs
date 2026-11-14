#!/usr/bin/env node
/**
 * La vigilancia, tras «Datos sin actualizar» (3.102.0): sale con 1 y lo dice
 * si la API sirve la cara de un héroe que el lector de la tablet no tiene
 * (otra imagen, o un héroe nuevo). Así se abre la incidencia de siempre con
 * el porqué arriba, y se cierra sola cuando se rehacen las caras.
 *
 * Nació del parche del 11 de noviembre de 2026: Popol and Kupa y Cyclops
 * cambiaron de dibujo, la tablet no los habría leído en el draft, y nada lo
 * dijo hasta que se revisó el parche a mano. Compara el FICHERO de la imagen
 * (`carasDesfasadas`), no la URL entera: con cada compilación del juego
 * cambia la carpeta del CDN y no la imagen.
 *
 * NO va en `npm test`: una cara nueva llega con los datos del bot y tiraría
 * el despliegue, que no es lo que falla.
 *
 *   node scripts/caras-nuevas.mjs [public/data/roam-meta.json] [scripts/lector/caras.json]
 */
import { readFileSync } from 'node:fs';
import { carasDesfasadas } from './lector/leer.mjs';

const [rutaMeta = 'public/data/roam-meta.json', rutaCaras = 'scripts/lector/caras.json'] = process.argv.slice(2);
let heroes, fuentes;
try {
  ({ heroes = [] } = JSON.parse(readFileSync(rutaMeta, 'utf8')));
  ({ fuentes = {} } = JSON.parse(readFileSync(rutaCaras, 'utf8')));
} catch (e) {
  // Sin los ficheros no se puede saber: no se abre incidencia por eso (lo vigila el resto).
  console.log(`No puedo comparar las caras: ${e.message}`);
  process.exit(0);
}
const nuevas = carasDesfasadas(fuentes, heroes);
if (nuevas.length) {
  console.log(`Caras nuevas en el juego, que el lector de la tablet aún no tiene: ${nuevas.join(', ')}. `
    + 'Hasta rehacerlas no los reconoce en el draft. Se arregla con `node scripts/lector/sacar-caras.mjs` (y la APK se recompila sola con el push).');
  process.exit(1);
}
console.log(`Las caras del lector están al día (${heroes.filter((h) => h?.cara).length} héroes).`);
