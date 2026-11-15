/**
 * Rehace `caras.json`, las caras de referencia del lector (herramienta del
 * repositorio; no corre en la tablet):
 *
 *   node scripts/lector/sacar-caras.mjs
 *
 * [M] Baja la cara del juego ACTUAL de cada héroe (`cara` en roam-meta.json,
 * que la ingesta saca de `hero.data.head`) y la reduce con el MISMO código
 * que el lector: 177 de 178 caras reales bien y ninguna mal (el retrato de la
 * web tiene el arte viejo de los rehechos: 35 de 40). Solo pide imágenes al
 * CDN, con pausa: nada de la cuenta. Cada cara guarda de dónde salió
 * (`fuentes`), para avisar cuando el juego la cambia (`caras-nuevas.mjs`).
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { leerPng } from './png.mjs';
import { muestra, guardarCara } from './caras.mjs';

const aqui = new URL('.', import.meta.url);
const destino = new URL('caras.json', aqui);
const previo = existsSync(destino) ? JSON.parse(readFileSync(destino)) : { caras: {}, fuentes: {} };
const caras = { ...previo.caras };
const fuentes = { ...(previo.fuentes ?? {}) };

/** La cara ocupa el círculo entero de la imagen: centro en el medio, radio medio ancho. */
const deImagen = (img) => guardarCara(muestra(img, img.ancho / 2, img.alto / 2, img.ancho / 2));

const { heroes } = JSON.parse(readFileSync(new URL('../../public/data/roam-meta.json', aqui)));
let bajadas = 0;
const fallos = [];
for (const h of heroes) {
  if (typeof h.cara !== 'string' || !h.cara.startsWith('https://')) { fallos.push(`${h.name} (sin cara https en roam-meta.json)`); continue; }
  if (fuentes[h.name] === h.cara && caras[h.name]) continue;
  try {
    const r = await fetch(h.cara, { signal: AbortSignal.timeout(15000) });
    if (!r.ok) throw new Error(`HTTP ${r.status}`);
    caras[h.name] = deImagen(leerPng(Buffer.from(await r.arrayBuffer())));
    fuentes[h.name] = h.cara;
    bajadas++;
  } catch (e) { fallos.push(`${h.name} (${e.message})`); }
  await new Promise((ok) => setTimeout(ok, 150));
}
console.log(`${bajadas} caras nuevas de la API${fallos.length ? `; sin cara: ${fallos.join(', ')}` : ''}.`);
const ordenar = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(destino, JSON.stringify({ lado: 24, fuentes: ordenar(fuentes), caras: ordenar(caras) }, null, 0) + '\n');
console.log(`${Object.keys(caras).length} caras en caras.json.`);
