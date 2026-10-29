/**
 * Los recortes de los picks para medir el lector (3.52.0). Con «Leer solo»
 * los baneos se leen al 100%, pero de los picks solo 7 de cada 10 enemigos
 * y la mitad de tu equipo (medido en las 28 partidas del 5 al 9 de octubre
 * de 2026), y bajar el umbral no lo arregla: con el héroe correcto como
 * candidato hay tantas dudas por encima de 0,75 como con uno equivocado.
 * Para saber POR QUÉ falla hay que ver cómo pinta la tablet a los que no
 * reconoce (Barats, Rafaela, Kadita, Badang…), y solo había una captura del
 * draft, la del 1 de octubre.
 *
 * Así que al completar el draft el lector compone, de sus últimas capturas
 * que son la pantalla del draft, una imagen con las DIEZ caras de los picks
 * (tu equipo a la izquierda, el suyo a la derecha) y lo que leyó en cada
 * hueco, y la app la sube a la incidencia de pantallas. Solo las caras: la
 * franja del nombre de cada jugador se queda fuera (en tu equipo va debajo
 * de la cara, en el suyo en la parte de abajo del hueco). A un tercio del
 * tamaño, con una paleta de 256 colores sacada de la propia imagen: unos
 * 35.000 caracteres en base64 (cabe en un mensaje de GitHub) y, devuelta a
 * su sitio, el lector reconoce las diez caras de la captura de referencia
 * igual que en la original (±0,05; medido al escribirlo).
 *
 * Puro: píxeles dentro, PNG y nombres fuera. Sin adb, sin red.
 */
import { escribirPng, leerPng } from './png.mjs';
import { reducir } from './miniatura.mjs';
import { REFERENCIA, leerPicksEnemigos, leerAliados, filaPropia } from './leer.mjs';

/** Las cajas de cada cara en la referencia (x, y, ancho, alto): tu equipo, sin la caja del nombre (y = 404 + 216·i). */
export const CAJAS_ALIADOS = [0, 1, 2, 3, 4].map((i) => [60, 228 + 216 * i, 190, 170]);
/** Las del suyo, sin la parte de abajo de cada hueco, donde va el nombre del jugador. */
export const CAJAS_ENEMIGOS = [0, 1, 2, 3, 4].map((i) => [2120, 230 + 216 * i, 230, 160]);
/** Lo que ocupa cada fila en la imagen compuesta (la caja más alta). */
const ALTO_FILA = 170;
/** A qué tamaño se sube: un tercio (medido: 35 mil caracteres y las mismas lecturas). */
export const ESCALA_RECORTE = 1 / 3;
/** Lo que puede ocupar en base64: deja sitio en el mensaje para la tabla de lo leído. */
export const TOPE_RECORTE = 45000;

const aCaptura = (img, [x, y, ancho, alto]) => {
  const fx = img.ancho / REFERENCIA.ancho, fy = img.alto / REFERENCIA.alto;
  return [Math.round(x * fx), Math.round(y * fy), Math.round(ancho * fx), Math.round(alto * fy)];
};

/** Las diez cajas pegadas en dos columnas (tu equipo, el suyo), a la escala de la referencia. */
export function componerPicks(img) {
  const ancho = CAJAS_ALIADOS[0][2] + CAJAS_ENEMIGOS[0][2], alto = ALTO_FILA * 5;
  const rgba = new Uint8Array(ancho * alto * 4);
  const pegar = (caja, dx, dy) => {
    const [X, Y, W, H] = aCaptura(img, caja);
    // Muestreo al vecino más cercano: en una tablet de otra resolución, la caja se lleva a la de la referencia.
    for (let y = 0; y < caja[3]; y++) for (let x = 0; x < caja[2]; x++) {
      const sx = Math.min(img.ancho - 1, X + Math.floor((x * W) / caja[2])), sy = Math.min(img.alto - 1, Y + Math.floor((y * H) / caja[3]));
      const s = (sy * img.ancho + sx) * 4, d = ((dy + y) * ancho + dx + x) * 4;
      rgba[d] = img.rgba[s]; rgba[d + 1] = img.rgba[s + 1]; rgba[d + 2] = img.rgba[s + 2]; rgba[d + 3] = 255;
    }
  };
  CAJAS_ALIADOS.forEach((c, i) => pegar(c, 0, i * ALTO_FILA));
  CAJAS_ENEMIGOS.forEach((c, i) => pegar(c, CAJAS_ALIADOS[0][2], i * ALTO_FILA));
  return { ancho, alto, rgba };
}

/**
 * Hasta 256 colores sacados de la imagen (corte por la mediana sobre 5 bits
 * por canal): la paleta fija de 6×7×6 de las miniaturas deja las caras en
 * manchas, y para medir el reconocimiento hacen falta sus tonos.
 */
export function paletaAdaptativa(img) {
  const clave = (k) => ((img.rgba[k] >> 3) << 10) | ((img.rgba[k + 1] >> 3) << 5) | (img.rgba[k + 2] >> 3);
  const cuenta = new Map();
  for (let k = 0; k < img.rgba.length; k += 4) { const c = clave(k); cuenta.set(c, (cuenta.get(c) ?? 0) + 1); }
  const canal = (c, e) => (c >> (10 - 5 * e)) & 31;
  const cajas = [[...cuenta.keys()]];
  while (cajas.length < 256) {
    let mejor = -1, eje = 0, rango = 0;
    cajas.forEach((caja, i) => {
      if (caja.length < 2) return;
      for (let e = 0; e < 3; e++) {
        let mn = 31, mx = 0;
        for (const c of caja) { const v = canal(c, e); if (v < mn) mn = v; if (v > mx) mx = v; }
        if (mx - mn > rango) { rango = mx - mn; mejor = i; eje = e; }
      }
    });
    if (mejor < 0) break;
    const caja = cajas[mejor].sort((a, b) => canal(a, eje) - canal(b, eje));
    const total = caja.reduce((s, c) => s + cuenta.get(c), 0);
    let acumulado = 0, corte = 0;
    for (; corte < caja.length - 2; corte++) { acumulado += cuenta.get(caja[corte]); if (acumulado >= total / 2) break; }
    cajas.splice(mejor, 1, caja.slice(0, corte + 1), caja.slice(corte + 1));
  }
  const color = new Map();
  for (const caja of cajas) {
    let r = 0, g = 0, b = 0, n = 0;
    for (const c of caja) { const w = cuenta.get(c); r += canal(c, 0) * w; g += canal(c, 1) * w; b += canal(c, 2) * w; n += w; }
    const rgb = [r, g, b].map((v) => Math.min(255, Math.round((v / n) * 8 + 4)));
    for (const c of caja) color.set(c, rgb);
  }
  const rgba = new Uint8Array(img.rgba.length);
  for (let k = 0; k < rgba.length; k += 4) { const [r, g, b] = color.get(clave(k)); rgba[k] = r; rgba[k + 1] = g; rgba[k + 2] = b; rgba[k + 3] = 255; }
  return { ancho: img.ancho, alto: img.alto, rgba };
}

/** La imagen de los diez picks como PNG en base64, que quepa en `tope` (si no, más pequeña). */
export function recorteDePicks(img, { tope = TOPE_RECORTE } = {}) {
  const entera = componerPicks(img);
  for (let escala = ESCALA_RECORTE; escala > 0.1; escala *= 0.85) {
    const b64 = escribirPng(paletaAdaptativa(reducir(entera, { ancho: Math.round(entera.ancho * escala) })), () => 4, { paleta: true }).toString('base64');
    if (b64.length <= tope) return b64;
  }
  return null;
}

/** Lo que leyó el lector en cada hueco: el nombre (si pasa del umbral), el candidato y su parecido. */
const plano = (l) => ({ nombre: l.nombre ?? null, candidato: l.candidato ?? l.nombre ?? null, parecido: Math.round((l.parecido ?? 0) * 100) / 100 });

/**
 * Un recorte de una captura del draft: la imagen y lo leído hueco a hueco,
 * con lo aprendido de esa tablet (`posiciones`, `extra`) como en `/leer`.
 */
export function recorteDeDraft(img, caras, { posiciones = null, extra = [], aliadas = [] } = {}) {
  const picks = recorteDePicks(img);
  if (!picks) return null;
  return {
    picks,
    enemigos: leerPicksEnemigos(img, caras, { posiciones, extra }).map(plano),
    aliados: leerAliados(img, caras, { extra: aliadas }).map(plano),
    tuyoFila: filaPropia(img),
  };
}

/** Cuántas capturas del draft se recortan por partida: las dos últimas (cada una va en su mensaje). */
export const RECORTES_POR_DRAFT = 2;

/**
 * Los recortes de las capturas que el aprendizaje miró (las que no descartó
 * por no ser la pantalla del draft), las que más enemigos leían primero
 * (3.54.0: las últimas solían ser ya la fase de skins) y en su orden.
 */
export function recortesDelDraft(informe, leer, caras, opciones = {}, maximo = RECORTES_POR_DRAFT) {
  const validas = (informe ?? []).map((l, i) => ({ ...l, i })).filter((l) => !l.descartada && l.id);
  const ids = validas.sort((a, b) => (b.aciertos ?? 0) - (a.aciertos ?? 0) || b.i - a.i).slice(0, maximo).sort((a, b) => a.i - b.i).map((l) => l.id);
  return ids.map((id) => { const r = recorteDeDraft(leer(id), caras, opciones); return r ? { id, ...r } : null; }).filter(Boolean);
}

/**
 * Sin la verdad (3.81.0, la tablet sola): de las capturas de un draft, la
 * última (3.86.5) y las que más héroes leían (enemigos y tu equipo; a
 * igualdad, las más nuevas) hasta `maximo`, en su orden. Las del final del draft suelen ser ya la fase de
 * skins, y las primeras, picks a medias: las que más leen son las del draft
 * casi entero. Cada captura se decodifica al mirarla.
 */
export function mejoresRecortes(ids, leer, caras, opciones = {}, maximo = RECORTES_POR_DRAFT) {
  const { posiciones = null, extra = [], aliadas = [] } = opciones;
  const vistos = [];
  (ids ?? []).forEach((id, i) => {
    try {
      const img = leer(id);
      const n = leerPicksEnemigos(img, caras, { posiciones, extra }).filter((l) => l.nombre).length + leerAliados(img, caras, { extra: aliadas }).filter((l) => l.nombre).length;
      vistos.push({ id, i, n });
    } catch { /* una captura que no se lee no cuenta */ }
  });
  // La última del draft va siempre (3.86.5): Javi elige el último y su hueco solo lleva su héroe (con la
  // foto de la skin) al final; las que más leen son de antes, con su hueco vacío. Con ella se ve quién era,
  // desde el PC y al aprender de lo arreglado.
  const ultima = vistos.reduce((u, v) => (!u || v.i > u.i ? v : u), null);
  const porLeidos = vistos.filter((v) => v !== ultima).sort((a, b) => b.n - a.n || b.i - a.i);
  const elegidos = (ultima && maximo > 0 ? [ultima, ...porLeidos.slice(0, maximo - 1)] : []).sort((a, b) => a.i - b.i);
  return elegidos.map(({ id }) => { try { const r = recorteDeDraft(leer(id), caras, opciones); return r ? { id, ...r } : null; } catch { return null; } }).filter(Boolean);
}

/**
 * El recorte de vuelta a su sitio (3.82.0): una pantalla negra de la
 * referencia con las diez caras donde estaban, para leerla o aprender de ella
 * como de una captura. Devuelto así, el lector lee las diez caras igual
 * (±0,05, `recortes.test`). Lo usan `scripts/medir-lector.mjs` y las pruebas.
 */
export function devolverPicks(b64) {
  const ancho = CAJAS_ALIADOS[0][2] + CAJAS_ENEMIGOS[0][2], alto = ALTO_FILA * 5;
  const bytes = Buffer.from(b64, 'base64');
  // Un recorte es un tercio de esto (3.83.0): uno que dice ser más grande no se descomprime (de la base de datos puede llegar cualquier cosa).
  if (bytes.length < 24 || bytes.readUInt32BE(16) * bytes.readUInt32BE(20) > ancho * alto) throw new Error('recorte demasiado grande');
  const r = leerPng(bytes);
  const cap = { ancho: REFERENCIA.ancho, alto: REFERENCIA.alto, rgba: new Uint8Array(REFERENCIA.ancho * REFERENCIA.alto * 4) };
  const pixel = (x, y) => { const sx = Math.min(r.ancho - 1, Math.floor((x * r.ancho) / ancho)), sy = Math.min(r.alto - 1, Math.floor((y * r.alto) / alto)); return r.rgba.subarray((sy * r.ancho + sx) * 4, (sy * r.ancho + sx) * 4 + 4); };
  for (let i = 0; i < 5; i++) {
    const [ax, ay, aw, ah] = CAJAS_ALIADOS[i], [ex, ey, ew, eh] = CAJAS_ENEMIGOS[i];
    for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) cap.rgba.set(pixel(x, i * ALTO_FILA + y), ((ay + y) * REFERENCIA.ancho + ax + x) * 4);
    for (let y = 0; y < eh; y++) for (let x = 0; x < ew; x++) cap.rgba.set(pixel(aw + x, i * ALTO_FILA + y), ((ey + y) * REFERENCIA.ancho + ex + x) * 4);
  }
  return cap;
}

