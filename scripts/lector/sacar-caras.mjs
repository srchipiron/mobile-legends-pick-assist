/**
 * Genera `caras.json` (las caras de referencia del lector) a partir de
 * capturas de la rejilla «Todos» del juego con cada cara etiquetada a mano
 * en `etiquetas.json`. Las capturas NO van en el repositorio (4 MB cada
 * una); para añadir héroes: se añaden sus capturas a una carpeta, se
 * apuntan sus caras en `etiquetas.json` y se vuelve a pasar:
 *
 *   node scripts/lector/sacar-caras.mjs --capturas carpeta/
 *
 * Un héroe que ya está en caras.json y no sale en ninguna captura dada se
 * conserva: se puede añadir por tandas.
 *
 * Con `--api`, los héroes que sigan sin cara del juego la toman del retrato
 * de la API (`public/heroes/{id}.jpg`, descodificado con el Chromium de las
 * pruebas: solo aquí, nunca en Termux). Vale menos —el juego ha rehecho el
 * arte de varios y la API no: con los retratos acertaba 35 de 40—, así que
 * se apuntan en `deLaApi` y una cara del juego los sustituye en cuanto la hay.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { leerPng } from './png.mjs';
import { muestra, guardarCara } from './caras.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const carpeta = arg('--capturas');
const conApi = process.argv.includes('--api');
if (!carpeta && !conApi) { console.error('Uso: node scripts/lector/sacar-caras.mjs --capturas carpeta/'); process.exit(2); }
const aqui = new URL('.', import.meta.url);
const { capturas } = JSON.parse(readFileSync(new URL('etiquetas.json', aqui)));
const destino = new URL('caras.json', aqui);
const previo = existsSync(destino) ? JSON.parse(readFileSync(destino)) : { caras: {}, deLaApi: [] };
const caras = { ...previo.caras };
const deLaApi = new Set(previo.deLaApi ?? []);
const hechas = new Set();
let usadas = 0;
for (const { f, caras: lista } of carpeta ? capturas : []) {
  const ruta = join(carpeta, f);
  if (!existsSync(ruta)) { console.log(`(sin ${f}: sus caras se quedan como estaban)`); continue; }
  const img = leerPng(readFileSync(ruta));
  usadas++;
  for (const { nombre, x, y, r } of lista) {
    if (hechas.has(nombre)) continue;
    hechas.add(nombre);
    caras[nombre] = guardarCara(muestra(img, x, y, r));
    deLaApi.delete(nombre);
  }
}
if (carpeta && !usadas) { console.error('Ninguna captura de etiquetas.json está en esa carpeta.'); process.exit(1); }
if (conApi) {
  const { chromium } = await import('playwright-core');
  const raiz = new URL('../../', aqui);
  const { heroes } = JSON.parse(readFileSync(new URL('public/data/roam-meta.json', raiz)));
  const navegador = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROME });
  const pagina = await navegador.newPage();
  for (const h of heroes.filter((x) => !caras[x.name] || deLaApi.has(x.name))) {
    const src = 'data:image/jpeg;base64,' + readFileSync(new URL(`public/heroes/${h.id}.jpg`, raiz)).toString('base64');
    const { ancho, alto, datos } = await pagina.evaluate(async (s) => {
      const i = new globalThis.Image(); await new Promise((ok) => { i.onload = ok; i.src = s; });
      const c = document.createElement('canvas'); c.width = i.width; c.height = i.height;
      const x = c.getContext('2d'); x.drawImage(i, 0, 0);
      return { ancho: i.width, alto: i.height, datos: Array.from(x.getImageData(0, 0, i.width, i.height).data) };
    }, src);
    // El círculo del juego enseña el retrato entero: radio = medio ancho.
    caras[h.name] = guardarCara(muestra({ ancho, alto, rgba: Uint8Array.from(datos) }, ancho / 2, alto / 2, ancho / 2));
    deLaApi.add(h.name);
  }
  await navegador.close();
}
const ordenadas = Object.fromEntries(Object.entries(caras).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(destino, JSON.stringify({ lado: 24, deLaApi: [...deLaApi].sort(), caras: ordenadas }, null, 0) + '\n');
console.log(`${Object.keys(ordenadas).length} caras: ${hechas.size} del juego en esta tanda, ${deLaApi.size} de la API (${[...deLaApi].sort().join(', ') || 'ninguna'}).`);
