/**
 * Reconocer la cara de un héroe (baneos, rejilla, picks) contra la cara del
 * juego ACTUAL que da la API (`hero.data.head`, ver sacar-caras.mjs). Puro:
 * recibe píxeles, no lee ficheros.
 *
 * Por qué así, medido con las capturas de Javi (26–28 de septiembre de
 * 2026): contra el retrato de la web (arte VIEJO de los héroes rehechos)
 * acertaba 35 de 40; contra caras recortadas de sus capturas, 54 de 54 pero
 * sin cubrir a 18 héroes; contra la cara del juego de la API, 173 de 178 con
 * CERO errores. Un acierto va de 0,75 a 0,99 de correlación (p10 0,89); el
 * mejor equivocado, 0,60 en baneos y rejilla y 0,72 en el panel de picks
 * (huecos vacíos o con skin). Por debajo de `PARECIDO_MINIMO` se dice «no
 * sé» en vez de adivinar: un héroe mal leído es peor que uno que se toca a mano.
 */

/** Lado de la rejilla a la que se reduce cada cara (G×G×3 números). */
export const LADO = 24;
/**
 * Por debajo, «no sé». Por encima del peor caso sin coincidencia medido
 * (0,72, un hueco de picks con skin) con 0,08 de margen; deja fuera un
 * acierto de 0,75 (Argus) y recoge los de 0,82–0,83 (Zhask, Alpha).
 */
export const PARECIDO_MINIMO = 0.80;

/**
 * La parte que se compara: la mitad de arriba del círculo. Abajo va el
 * símbolo de baneo o la cifra de la rejilla, que no son de la cara.
 */
const zona = (cx, cy, r) => [cx - 0.6 * r, cy - 0.7 * r, 1.2 * r, 0.9 * r];

/**
 * La cara reducida a LADO×LADO×3, en bruto (0–255): la media de cada celda
 * con 2×2 muestras bilineales. Las mismas cuentas que hasta 3.38.0 (las
 * caras guardadas se hicieron con ellas), pero con las coordenadas de cada
 * fila y columna calculadas una vez y los tres canales a la vez: era una
 * llamada por píxel, canal y muestra, 16 por número.
 */
export function muestra(img, cx, cy, r) {
  const [sx, sy, sw, sh] = zona(cx, cy, r);
  const { ancho, alto, rgba } = img;
  // Para cada una de las 2·LADO muestras de un eje: el píxel de la izquierda (ya acotado), el de la derecha y el peso.
  const eje = (s0, sl, max) => {
    const p0 = new Int32Array(2 * LADO), p1 = new Int32Array(2 * LADO), f = new Float64Array(2 * LADO);
    for (let k = 0; k < LADO; k++) {
      const a = s0 + (k * sl) / LADO, b = s0 + ((k + 1) * sl) / LADO;
      for (let u = 0; u < 2; u++) {
        const x = a + ((u + 0.5) / 2) * (b - a) - 0.5, xf = Math.floor(x);
        p0[2 * k + u] = Math.max(0, Math.min(max - 1, xf)); p1[2 * k + u] = Math.max(0, Math.min(max - 1, xf + 1)); f[2 * k + u] = x - xf;
      }
    }
    return { p0, p1, f };
  };
  const X = eje(sx, sw, ancho), Y = eje(sy, sh, alto);
  const v = new Float32Array(LADO * LADO * 3);
  const s = [0, 0, 0];
  for (let j = 0, k = 0; j < LADO; j++) for (let i = 0; i < LADO; i++, k += 3) {
    s[0] = s[1] = s[2] = 0;
    for (let vj = 0; vj < 2; vj++) {
      const q = 2 * j + vj, fy = Y.f[q], f0 = Y.p0[q] * ancho, f1 = Y.p1[q] * ancho;
      for (let ui = 0; ui < 2; ui++) {
        const e = 2 * i + ui, fx = X.f[e], a00 = (f0 + X.p0[e]) * 4, a10 = (f0 + X.p1[e]) * 4, a01 = (f1 + X.p0[e]) * 4, a11 = (f1 + X.p1[e]) * 4;
        for (let c = 0; c < 3; c++) {
          s[c] += (rgba[a00 + c] * (1 - fx) + rgba[a10 + c] * fx) * (1 - fy) + (rgba[a01 + c] * (1 - fx) + rgba[a11 + c] * fx) * fy;
        }
      }
    }
    v[k] = s[0] / 4; v[k + 1] = s[1] / 4; v[k + 2] = s[2] / 4;
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

/** Lado de la versión reducida con la que se hace la primera pasada (celdas de 3×3). */
export const LADO_GRUESO = 8;
/**
 * Cuántos héroes pasan de la pasada gruesa a la fina. Medido contra la
 * búsqueda de antes en 260 casos (caras reales, desplazadas, sin su héroe y
 * sitios al azar): con 16 cambiaba el segundo candidato en 4, con 24 en 1 y
 * con 32 en ninguno, ni en el parecido; 32 cuesta un tercio de lo de antes.
 */
export const FINALISTAS = 32;
/**
 * Cuántos de los mejores se AFINAN (3.39.0): cada uno, desde su mejor
 * sitio, se mueve un paso o un tamaño (`PASO_DE_ESCALA`, entre
 * `ESCALA_MINIMA` y `ESCALA_MAXIMA`) mientras se parezca más. Medido en las
 * 22 caras reales de las pruebas, en su sitio y desplazadas (81 casos), y
 * en 167 huecos sin el héroe (vacíos, al azar o con su cara quitada de la
 * lista): aciertos de 76 a 81 de 81 (el más bajo, de 0,65 a 0,81: Gloo en
 * el panel de picks), falsos 0 de 167 con 3 y con 5, y el falso más alto
 * el mismo, 0,7996, que sin afinar. Cuesta un 3% más.
 */
export const AFINADOS = 3;
/** El paso de tamaño al afinar y hasta dónde: un 6%, del 76% al 136% del radio medido (decisión al medir: cubre las escalas que ya se buscaban y un poco más). */
export const PASO_DE_ESCALA = 0.06, ESCALA_MINIMA = 0.76, ESCALA_MAXIMA = 1.36;
const D = LADO * LADO * 3, d = LADO_GRUESO * LADO_GRUESO * 3, BLOQUE = LADO / LADO_GRUESO;

/**
 * La versión reducida de un vector (bruto o ya normalizado: la media de cada
 * bloque conserva la media del vector, así que reducir y normalizar dan lo
 * mismo en cualquier orden), normalizada.
 */
function reducir(v) {
  const out = new Float32Array(d);
  for (let j = 0; j < LADO; j++) for (let i = 0; i < LADO; i++) for (let c = 0; c < 3; c++) {
    out[(((j / BLOQUE) | 0) * LADO_GRUESO + ((i / BLOQUE) | 0)) * 3 + c] += v[(j * LADO + i) * 3 + c];
  }
  return normalizar(out);
}

/** Las caras de referencia en dos tablas seguidas (completa y reducida), una vez por lista. */
const empaquetadas = new WeakMap();
function empaquetar(caras) {
  let e = empaquetadas.get(caras);
  if (e) return e;
  const nombres = caras.map((c) => c.nombre), completa = new Float32Array(caras.length * D), gruesa = new Float32Array(caras.length * d);
  caras.forEach((c, n) => { completa.set(c.v, n * D); gruesa.set(reducir(c.v), n * d); });
  const indice = new Map(); nombres.forEach((nb, n) => (indice.get(nb) ?? indice.set(nb, []).get(nb)).push(n));
  e = { nombres, completa, gruesa, indice };
  empaquetadas.set(caras, e);
  return e;
}

/** Producto escalar con la fila `n` de una tabla; de cuatro en cuatro (los dos largos son múltiplos de 4). */
function producto(v, tabla, n, largo) {
  let s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  for (let i = 0, o = n * largo; i < largo; i += 4, o += 4) {
    s0 += v[i] * tabla[o]; s1 += v[i + 1] * tabla[o + 1]; s2 += v[i + 2] * tabla[o + 2]; s3 += v[i + 3] * tabla[o + 3];
  }
  return s0 + s1 + s2 + s3;
}

/**
 * Qué héroe hay en el círculo (cx, cy, r) de la captura. `caras` es
 * [{ nombre, v }] con v ya normalizado. Busca el centro y el tamaño
 * alrededor del dado (las posiciones están medidas a ojo y cada pantalla
 * pinta el círculo un poco distinto). Devuelve el mejor y el segundo, con
 * `nombre: null` si el mejor no llega a PARECIDO_MINIMO.
 *
 * En dos pasadas (3.39.0): en cada posición de la búsqueda se compara
 * primero con todas las caras REDUCIDAS a 8×8 (nueve veces menos números)
 * y solo los `FINALISTAS` héroes que más se parecen en alguna posición se
 * comparan a 24×24, que es el parecido que se devuelve y se mide contra
 * los umbrales. Hasta 3.38.0 cada hueco era 157 posiciones × 266 caras ×
 * 1.728 números: el 80% de una lectura de 4,8 s aquí (en el móvil, varias
 * veces más).
 */
export function reconocer(img, [cx, cy, r], caras, { pasos = 3, escalas = [0.94, 1.06], finura = 16, afinar = AFINADOS } = {}) {
  const paso = Math.max(1, Math.round(r / finura));
  const ref = empaquetar(caras);
  const tomar = (dx, dy, esc) => { const bruta = muestra(img, cx + dx * paso, cy + dy * paso, r * esc); return { dx, dy, esc, v: normalizar(bruta), g: reducir(bruta) }; };
  // Pasada gruesa: el mejor parecido reducido de cada héroe en cualquier posición.
  const grueso = new Map();
  const cribar = (m) => { for (let n = 0; n < ref.nombres.length; n++) { const k = producto(m.g, ref.gruesa, n, d); if (!(grueso.get(ref.nombres[n]) >= k)) grueso.set(ref.nombres[n], k); } };
  const mejor = new Map(), dondeDe = new Map();
  let donde = [0, 0], tope = -Infinity;
  const comparar = (m, filas) => {
    for (const n of filas) {
      const k = producto(m.v, ref.completa, n, D);
      if (!(mejor.get(ref.nombres[n]) >= k)) { mejor.set(ref.nombres[n], k); dondeDe.set(ref.nombres[n], [m.dx, m.dy, m.esc]); }
      if (k > tope) { tope = k; donde = [m.dx, m.dy]; }
    }
  };
  const finalistas = () => [...grueso].sort((a, b) => b[1] - a[1]).slice(0, FINALISTAS).flatMap(([nb]) => ref.indice.get(nb));
  // Primero la posición a tamaño tal cual; después el tamaño alrededor de la mejor.
  const primeras = [];
  for (let dx = -pasos; dx <= pasos; dx++) for (let dy = -pasos; dy <= pasos; dy++) { const m = tomar(dx, dy, 1); cribar(m); primeras.push(m); }
  const filas = finalistas();
  for (const m of primeras) comparar(m, filas);
  const [bx, by] = donde;
  for (const esc of escalas) for (let dx = bx - 1; dx <= bx + 1; dx++) for (let dy = by - 1; dy <= by + 1; dy++) comparar(tomar(dx, dy, esc), filas);
  // Afinar: los `afinar` mejores, cada uno desde SU mejor sitio, se mueven un
  // paso (o un tamaño) mientras se parezcan más. El tamaño de antes solo se
  // buscaba alrededor de la mejor posición de todos a tamaño tal cual.
  for (const [nb] of [...mejor].sort((a, b) => b[1] - a[1]).slice(0, afinar)) {
    const filasDe = ref.indice.get(nb), vistas = new Map();
    let [x, y, e] = dondeDe.get(nb), valor = mejor.get(nb);
    const valorEn = (dx, dy, esc) => {
      const clave = `${dx},${dy},${esc}`;
      if (!vistas.has(clave)) { const m = tomar(dx, dy, esc); vistas.set(clave, Math.max(...filasDe.map((n) => producto(m.v, ref.completa, n, D)))); }
      return vistas.get(clave);
    };
    for (let vuelta = 0; vuelta < 40; vuelta++) {
      let mejora = null;
      for (const [dx, dy, de] of [[1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]]) {
        const esc = Math.round((e + de * PASO_DE_ESCALA) * 1000) / 1000;
        if (esc < ESCALA_MINIMA || esc > ESCALA_MAXIMA || Math.abs(x + dx) > 2 * pasos || Math.abs(y + dy) > 2 * pasos) continue;
        const k = valorEn(x + dx, y + dy, esc);
        if (k > valor && (!mejora || k > mejora[3])) mejora = [x + dx, y + dy, esc, k];
      }
      if (!mejora) break;
      [x, y, e, valor] = mejora;
    }
    mejor.set(nb, valor);
  }
  const orden = [...mejor].sort((a, b) => b[1] - a[1]);
  const [primero, segundo] = orden;
  return {
    nombre: primero && primero[1] >= PARECIDO_MINIMO ? primero[0] : null,
    candidato: primero?.[0] ?? null,
    parecido: primero?.[1] ?? 0,
    segundo: segundo ? { nombre: segundo[0], parecido: segundo[1] } : null,
  };
}

/**
 * La misma cara en espejo: la zona que se compara es simétrica respecto al
 * centro, así que basta con dar la vuelta a las columnas. El panel de picks
 * enemigos enseña el dibujo reflejado.
 */
export function espejo(v) {
  const out = new Float32Array(v.length);
  for (let j = 0; j < LADO; j++) for (let i = 0; i < LADO; i++) for (let c = 0; c < 3; c++) {
    out[(j * LADO + i) * 3 + c] = v[(j * LADO + (LADO - 1 - i)) * 3 + c];
  }
  return out;
}

/** Caras guardadas (base64 de LADO×LADO×3 bytes) a vectores normalizados. */
export function cargarCaras(guardadas) {
  return Object.entries(guardadas).map(([nombre, b64]) => ({ nombre, v: normalizar(Float32Array.from(Buffer.from(b64, 'base64'))) }));
}

/** Una muestra en bruto a base64, para guardarla. */
export const guardarCara = (v) => Buffer.from(Uint8Array.from(v, (x) => Math.round(x))).toString('base64');
