/**
 * Leer VICTORIA / DERROTA de la pantalla de resultado (3.32.0). Lo que se
 * midió en los cuatro fotogramas que subió la app el 1 de octubre de 2026
 * (franja de arriba a 320 px, el 28% del alto):
 *
 * - El final de una partida pasa por VARIAS pantallas: la tabla de
 *   resultado («28 DEFEAT 25» en la cabecera, azul; las palabras van en
 *   inglés aunque el juego esté en español), la de estrellas de rango y la
 *   de estadísticas («Primera Fase de Bloqueo»). Cada 30 s se cazaba una
 *   cualquiera; de ahí los 10 s de `INTERVALO_FINAL_MS`.
 * - La PALABRA va centrada arriba: x 33–67% de la pantalla, y 3–12% (en la
 *   franja, y 11–43%). Entre pantallas distintas la correlación de esa zona
 *   queda en 0,36–0,64; la misma franja desplazada 1 px da 0,87 y 2 px,
 *   0,78: por eso se busca con ±`DESPLAZAMIENTO` px y se exige
 *   `RESULTADO_MINIMO` 0,85.
 * - La CABECERA de la tabla (misma banda, sin la palabra: marcadores, iconos
 *   y reloj) es igual en victoria y derrota, y no se parece a las otras
 *   pantallas (0,49–0,77 con la banda entera). `esTabla` es la puerta: solo
 *   se reconoce y solo se APRENDE en fotogramas que son la tabla; sin ella,
 *   la pantalla de estadísticas de una derrota se aprendería como «derrota»
 *   y la de la victoria siguiente la daría por perdida.
 *
 * Las plantillas de la palabra se aprenden de lo que Javi contesta (Gané /
 * Perdí) en la app (`POST /resultado`): con una de cada, el resultado se
 * apunta solo. Viene UNA de derrota de serie (`tabla-derrota.png`, el
 * fotograma de la incidencia #15 con los nombres tapados); la de victoria
 * llega con su primera partida ganada en la que se caza la tabla. Una
 * plantilla que contradiga a lo que Javi contesta se quita: el sistema se
 * corrige solo. Puro: sin red, sin adb, sin disco.
 */
import { reducir } from './miniatura.mjs';

export const VERSION_RESULTADOS = 1;
/** La franja de arriba, a este ancho y con esta parte del alto (la misma que viaja al proyecto). */
export const ANCHO_TIRA_RESULTADO = 320;
export const ALTO_TIRA_RESULTADO = 0.28;
/** Dónde va la palabra y dónde la cabecera, en fracciones de la FRANJA (x0, x1, y0, y1). */
export const ZONA_PALABRA = [0.33, 0.67, 0.11, 0.43];
export const ZONA_CABECERA = [0, 1, 0.11, 0.43];
/** Umbrales medidos (ver arriba). */
export const RESULTADO_MINIMO = 0.85;
export const MARGEN_RESULTADO = 0.10;
export const TABLA_MINIMA = 0.70;
export const DESPLAZAMIENTO = 2;
/** Plantillas que se guardan por resultado y de la tabla: las últimas. */
export const PLANTILLAS_POR_RESULTADO = 8;

/** La franja de arriba de una captura, como la que viaja al proyecto. */
export const tiraDe = (img) => reducir(img, { ancho: ANCHO_TIRA_RESULTADO, region: [0, 0, 1, ALTO_TIRA_RESULTADO] });

const gris = (rgba, k) => 0.299 * rgba[k] + 0.587 * rgba[k + 1] + 0.114 * rgba[k + 2];
const caja = (tira, [x0, x1, y0, y1]) => [Math.round(tira.ancho * x0), Math.round(tira.ancho * x1), Math.round(tira.alto * y0), Math.round(tira.alto * y1)];

/**
 * El vector (gris, centrado y de norma 1) de una zona de la franja, desplazada
 * (dx, dy) píxeles; con `sin`, los píxeles dentro de esa otra zona valen 0
 * (la cabecera se compara SIN la palabra). Fuera de la imagen, 0.
 */
export function vectorDe(tira, zona, { dx = 0, dy = 0, sin = null } = {}) {
  const [x0, x1, y0, y1] = caja(tira, zona);
  const hueco = sin ? caja(tira, sin) : null;
  const v = new Float32Array((x1 - x0) * (y1 - y0));
  let i = 0, suma = 0, n = 0;
  for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++, i++) {
    if (hueco && x >= hueco[0] && x < hueco[1] && y >= hueco[2] && y < hueco[3]) continue;
    const sx = x + dx, sy = y + dy;
    if (sx < 0 || sy < 0 || sx >= tira.ancho || sy >= tira.alto) continue;
    v[i] = gris(tira.rgba, (sy * tira.ancho + sx) * 4); suma += v[i]; n += 1;
  }
  const media = n ? suma / n : 0;
  let norma = 0;
  for (let k = 0; k < v.length; k++) { if (v[k] !== 0 || !hueco) v[k] -= media; norma += v[k] * v[k]; }
  norma = Math.sqrt(norma) || 1;
  for (let k = 0; k < v.length; k++) v[k] /= norma;
  return v;
}
export const vectorPalabra = (tira, d) => vectorDe(tira, ZONA_PALABRA, d);
export const vectorCabecera = (tira, d) => vectorDe(tira, ZONA_CABECERA, { ...d, sin: ZONA_PALABRA });

const producto = (a, b) => { let s = 0; const n = Math.min(a.length, b.length); for (let i = 0; i < n; i++) s += a[i] * b[i]; return s; };

/** Cuánto se parece una zona de la franja a una plantilla, buscando ±DESPLAZAMIENTO px. */
export function parecidoMaximo(tira, plantilla, vector) {
  let mejor = -Infinity;
  for (let dy = -DESPLAZAMIENTO; dy <= DESPLAZAMIENTO; dy++) for (let dx = -DESPLAZAMIENTO; dx <= DESPLAZAMIENTO; dx++) {
    const p = producto(vector(tira, { dx, dy }), plantilla);
    if (p > mejor) mejor = p;
  }
  return mejor;
}

const mejorDe = (tira, plantillas, vector) => plantillas.reduce((m, p) => Math.max(m, parecidoMaximo(tira, p.v, vector)), -Infinity);

/** ¿Es la tabla de resultado? Su cabecera (sin la palabra) se parece a alguna tabla conocida. */
export const parecidoATabla = (tira, resultados) => mejorDe(tira, resultados?.tablas ?? [], vectorCabecera);
export const esTabla = (tira, resultados) => parecidoATabla(tira, resultados) >= TABLA_MINIMA;

/**
 * Lo que dice la franja: `{ tabla, resultado, parecido, otro }`. `resultado`
 * es 'gane' | 'perdi' | null: solo en la tabla, con una palabra conocida a
 * ≥ RESULTADO_MINIMO y la del otro resultado a más de MARGEN por debajo.
 */
export function reconocerResultado(tira, resultados) {
  const tabla = parecidoATabla(tira, resultados);
  if (tabla < TABLA_MINIMA) return { tabla: false, parecidoTabla: tabla, resultado: null, parecido: 0, otro: 0 };
  const gane = mejorDe(tira, resultados?.gane ?? [], vectorPalabra);
  const perdi = mejorDe(tira, resultados?.perdi ?? [], vectorPalabra);
  const [mejor, otro, nombre] = gane >= perdi ? [gane, perdi, 'gane'] : [perdi, gane, 'perdi'];
  const seguro = mejor >= RESULTADO_MINIMO && mejor - otro >= MARGEN_RESULTADO;
  return { tabla: true, parecidoTabla: tabla, resultado: seguro ? nombre : null, parecido: Number.isFinite(mejor) ? mejor : 0, otro: Number.isFinite(otro) ? otro : 0 };
}

const guardar = (v) => Buffer.from(v.buffer, v.byteOffset, v.byteLength).toString('base64');
const cargar = (s) => { const b = Buffer.from(s, 'base64'); return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength)); };

/** Lo guardado ({ v: base64 }) a vectores, y al revés. */
export const cargarResultados = (r) => {
  const lista = (l) => (Array.isArray(l) ? l.filter((p) => typeof p?.v === 'string').map((p) => ({ ...p, v: cargar(p.v) })) : []);
  return { version: VERSION_RESULTADOS, gane: lista(r?.gane), perdi: lista(r?.perdi), tablas: lista(r?.tablas) };
};
export const guardarResultados = (r) => ({ version: VERSION_RESULTADOS, gane: r.gane.map((p) => ({ ...p, v: guardar(p.v) })), perdi: r.perdi.map((p) => ({ ...p, v: guardar(p.v) })), tablas: r.tablas.map((p) => ({ ...p, v: guardar(p.v) })) });

/** Las plantillas de serie: la tabla de una derrota (incidencia #15), para la cabecera y la palabra. */
export function plantillasIniciales(tiraDerrota) {
  return { version: VERSION_RESULTADOS, gane: [], perdi: [{ v: vectorPalabra(tiraDerrota), de: 'serie' }], tablas: [{ v: vectorCabecera(tiraDerrota), de: 'serie' }] };
}

/**
 * Aprende de un fotograma con su verdad (`gane` true/false, lo que contestó
 * Javi): solo si es la tabla; quita las plantillas del OTRO resultado que se
 * le parezcan (estaban mal) y guarda su palabra y su cabecera. Devuelve los
 * resultados nuevos y qué pasó.
 */
export function aprenderResultado(tira, gane, resultados, { id = null } = {}) {
  const r = { version: VERSION_RESULTADOS, gane: [...(resultados?.gane ?? [])], perdi: [...(resultados?.perdi ?? [])], tablas: [...(resultados?.tablas ?? [])] };
  if (!esTabla(tira, r)) return { resultados: r, aprendido: false, motivo: 'noEsTabla' };
  const mio = gane ? 'gane' : 'perdi', otro = gane ? 'perdi' : 'gane';
  const contradichas = r[otro].filter((p) => parecidoMaximo(tira, p.v, vectorPalabra) >= RESULTADO_MINIMO).length;
  r[otro] = r[otro].filter((p) => parecidoMaximo(tira, p.v, vectorPalabra) < RESULTADO_MINIMO);
  r[mio] = [...r[mio], { v: vectorPalabra(tira), de: id }].slice(-PLANTILLAS_POR_RESULTADO);
  r.tablas = [...r.tablas, { v: vectorCabecera(tira), de: id }].slice(-PLANTILLAS_POR_RESULTADO);
  return { resultados: r, aprendido: true, contradichas };
}
