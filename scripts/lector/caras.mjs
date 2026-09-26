/**
 * Reconocer la cara redonda de un héroe (baneos y rejilla del draft) contra
 * las caras sacadas del propio juego. Puro: recibe píxeles, no lee ficheros.
 *
 * Por qué así, medido el 26 de septiembre de 2026 con las capturas de Javi:
 * contra los retratos de la API acertaba 35 de 40 (el juego ha rehecho el
 * arte de Floryn, Faramis, Kalea, Thamuz y Julian y la API no); contra caras
 * recortadas del propio juego, 26 de 27, y el que falló no tenía cara del
 * juego. Una cara acertada correlaciona 0,96–0,997; la mejor equivocada,
 * 0,79 como mucho. Por eso hay un umbral (`PARECIDO_MINIMO`) y por debajo
 * se dice «no sé» en vez de adivinar: un baneo mal leído es peor que uno
 * que se toca a mano.
 */

/** Lado de la rejilla a la que se reduce cada cara (G×G×3 números). */
export const LADO = 24;
/**
 * Por debajo, «no sé». Entre 0,79 (el mejor equivocado medido) y 0,907
 * (el acierto más bajo medido, Hirara con el aro de selección encima).
 */
export const PARECIDO_MINIMO = 0.85;

/**
 * La parte que se compara: la mitad de arriba del círculo. Abajo va el
 * símbolo de baneo o la cifra de la rejilla, que no son de la cara.
 */
const zona = (cx, cy, r) => [cx - 0.6 * r, cy - 0.7 * r, 1.2 * r, 0.9 * r];

function pixel(img, x, y, c) {
  const xi = Math.max(0, Math.min(img.ancho - 1, x)), yi = Math.max(0, Math.min(img.alto - 1, y));
  return img.rgba[(yi * img.ancho + xi) * 4 + c];
}

/** Media de la caja [x0,x1)×[y0,y1) con 2×2 muestras bilineales. */
function caja(img, x0, y0, x1, y1, c) {
  let s = 0;
  for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
    const x = x0 + ((i + 0.5) / 2) * (x1 - x0) - 0.5, y = y0 + ((j + 0.5) / 2) * (y1 - y0) - 0.5;
    const xf = Math.floor(x), yf = Math.floor(y), fx = x - xf, fy = y - yf;
    s += (pixel(img, xf, yf, c) * (1 - fx) + pixel(img, xf + 1, yf, c) * fx) * (1 - fy)
      + (pixel(img, xf, yf + 1, c) * (1 - fx) + pixel(img, xf + 1, yf + 1, c) * fx) * fy;
  }
  return s / 4;
}

/** La cara reducida a LADO×LADO×3, en bruto (0–255). */
export function muestra(img, cx, cy, r) {
  const [sx, sy, sw, sh] = zona(cx, cy, r);
  const v = new Float32Array(LADO * LADO * 3);
  for (let j = 0, k = 0; j < LADO; j++) for (let i = 0; i < LADO; i++) for (let c = 0; c < 3; c++) {
    v[k++] = caja(img, sx + (i * sw) / LADO, sy + (j * sh) / LADO, sx + ((i + 1) * sw) / LADO, sy + ((j + 1) * sh) / LADO, c);
  }
  return v;
}

/** Centrada y de norma 1: el producto escalar de dos es su correlación. */
export function normalizar(v) {
  const out = new Float32Array(v.length);
  let m = 0; for (const a of v) m += a; m /= v.length;
  let s = 0; for (let i = 0; i < v.length; i++) { out[i] = v[i] - m; s += out[i] * out[i]; }
  s = Math.sqrt(s) || 1; for (let i = 0; i < v.length; i++) out[i] /= s;
  return out;
}

const escalar = (a, b) => { let s = 0; for (let i = 0; i < a.length; i++) s += a[i] * b[i]; return s; };

/**
 * Qué héroe hay en el círculo (cx, cy, r) de la captura. `caras` es
 * [{ nombre, v }] con v ya normalizado. Busca el centro y el tamaño
 * alrededor del dado (las posiciones están medidas a ojo y cada pantalla
 * pinta el círculo un poco distinto). Devuelve el mejor y el segundo, con
 * `nombre: null` si el mejor no llega a PARECIDO_MINIMO.
 */
export function reconocer(img, [cx, cy, r], caras) {
  const paso = Math.max(1, Math.round(r / 16));
  const mejor = new Map();
  let donde = [0, 0], tope = -Infinity;
  const probar = (dx, dy, esc) => {
    const v = normalizar(muestra(img, cx + dx * paso, cy + dy * paso, r * esc));
    for (const c of caras) {
      const k = escalar(v, c.v);
      if (!(mejor.get(c.nombre) >= k)) mejor.set(c.nombre, k);
      if (k > tope) { tope = k; donde = [dx, dy]; }
    }
  };
  // Primero la posición a tamaño tal cual; después el tamaño alrededor de la mejor.
  for (let dx = -3; dx <= 3; dx++) for (let dy = -3; dy <= 3; dy++) probar(dx, dy, 1);
  const [bx, by] = donde;
  for (const esc of [0.94, 1.06]) for (let dx = bx - 1; dx <= bx + 1; dx++) for (let dy = by - 1; dy <= by + 1; dy++) probar(dx, dy, esc);
  const orden = [...mejor].sort((a, b) => b[1] - a[1]);
  const [primero, segundo] = orden;
  return {
    nombre: primero && primero[1] >= PARECIDO_MINIMO ? primero[0] : null,
    candidato: primero?.[0] ?? null,
    parecido: primero?.[1] ?? 0,
    segundo: segundo ? { nombre: segundo[0], parecido: segundo[1] } : null,
  };
}

/** Caras guardadas (base64 de LADO×LADO×3 bytes) a vectores normalizados. */
export function cargarCaras(guardadas) {
  return Object.entries(guardadas).map(([nombre, b64]) => ({ nombre, v: normalizar(Float32Array.from(Buffer.from(b64, 'base64'))) }));
}

/** Una muestra en bruto a base64, para guardarla. */
export const guardarCara = (v) => Buffer.from(Uint8Array.from(v, (x) => Math.round(x))).toString('base64');
