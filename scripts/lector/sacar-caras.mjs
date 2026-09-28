/**
 * Genera `caras.json`, las caras de referencia del lector de pantalla.
 *
 *   node scripts/lector/sacar-caras.mjs              (de la API: lo normal)
 *   node scripts/lector/sacar-caras.mjs --capturas carpeta/
 *
 * De la API (desde 3.21.0): baja la cara del juego ACTUAL de cada héroe
 * (`cara` en roam-meta.json, que la ingesta saca de `hero.data.head`) y la
 * reduce con el MISMO código que el lector. Medido el 28 de septiembre de
 * 2026 contra las 178 caras etiquetadas de las capturas de Javi: 173
 * aciertos y ningún error, y el peor error se queda en 0,60 de parecido;
 * las recortadas a mano de sus capturas daban lo mismo pero no cubrían a 18
 * héroes, y el retrato de la web (`retrato`) tiene el arte VIEJO de los
 * rehechos y acertaba 35 de 40. Solo pide imágenes al CDN de Moonton: nada
 * de la cuenta.
 *
 * Con `--capturas`, de capturas de la rejilla «Todos» del juego con cada cara
 * etiquetada a mano en `etiquetas.json` (las capturas no van al repositorio).
 * Se queda por si la API deja de dar la cara algún día.
 *
 * Cada cara guarda de dónde salió (`fuentes`): el lector avisa si la API da
 * otra (un héroe rehecho) o si falta la de un héroe nuevo.
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { leerPng } from './png.mjs';
import { muestra, guardarCara } from './caras.mjs';

const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const aqui = new URL('.', import.meta.url);
const destino = new URL('caras.json', aqui);
const previo = existsSync(destino) ? JSON.parse(readFileSync(destino)) : { caras: {}, fuentes: {} };
const caras = { ...previo.caras };
const fuentes = { ...(previo.fuentes ?? {}) };

/** La cara ocupa el círculo entero de la imagen: centro en el medio, radio medio ancho. */
const deImagen = (img) => guardarCara(muestra(img, img.ancho / 2, img.alto / 2, img.ancho / 2));

const carpeta = arg('--capturas');
if (carpeta) {
  const { capturas } = JSON.parse(readFileSync(new URL('etiquetas.json', aqui)));
  const hechas = new Set();
  let usadas = 0;
  for (const { f, caras: lista } of capturas) {
    const ruta = join(carpeta, f);
    if (!existsSync(ruta)) { console.log(`(sin ${f}: sus caras se quedan como estaban)`); continue; }
    const img = leerPng(readFileSync(ruta));
    usadas++;
    for (const { nombre, x, y, r } of lista) {
      if (hechas.has(nombre)) continue;
      hechas.add(nombre);
      caras[nombre] = guardarCara(muestra(img, x, y, r));
      fuentes[nombre] = `captura:${f}`;
    }
  }
  if (!usadas) { console.error('Ninguna captura de etiquetas.json está en esa carpeta.'); process.exit(1); }
  console.log(`${hechas.size} caras de ${usadas} capturas.`);
} else {
  const { heroes } = JSON.parse(readFileSync(new URL('../../public/data/roam-meta.json', aqui)));
  let bajadas = 0; const fallos = [];
  for (const h of heroes) {
    if (!h.cara) { fallos.push(`${h.name} (sin cara en roam-meta.json)`); continue; }
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
}
const ordenar = (o) => Object.fromEntries(Object.entries(o).sort(([a], [b]) => a.localeCompare(b)));
writeFileSync(destino, JSON.stringify({ lado: 24, fuentes: ordenar(fuentes), caras: ordenar(caras) }, null, 0) + '\n');
console.log(`${Object.keys(caras).length} caras en caras.json.`);
