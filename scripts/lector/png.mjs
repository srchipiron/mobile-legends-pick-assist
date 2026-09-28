/**
 * Lector de PNG mínimo, sin dependencias. Lo que da `adb exec-out screencap
 * -p` (RGBA de 8 bits) y lo que sirve la API: RGB, gris, gris con alfa y
 * paleta (con transparencia `tRNS`), de 8 o 16 bits (de 16 se queda el byte
 * alto), con o sin entrelazado Adam7 (una de las 133 caras de la API viene
 * entrelazada). Devuelve { ancho, alto, rgba }. Nada más: en Termux no hay
 * navegador ni librerías de imagen, y una dependencia nativa es justo lo que
 * no compila en un móvil.
 */
import { deflateSync, inflateSync } from 'node:zlib';

const FIRMA = '89504e470d0a1a0a';
/** Canales por tipo de color PNG: gris, RGB, paleta, gris+alfa, RGBA. */
const CANALES = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 };
/** Las siete pasadas de Adam7: [x0, y0, paso x, paso y]. */
const ADAM7 = [[0, 0, 8, 8], [4, 0, 8, 8], [0, 4, 4, 8], [2, 0, 4, 4], [0, 2, 2, 4], [1, 0, 2, 2], [0, 1, 1, 2]];

/** Deshace los filtros de `alto` filas de `fila` bytes desde `desde`; devuelve las filas y dónde acaba. */
function desfiltrar(crudo, desde, fila, alto, bpp) {
  const salida = new Uint8Array(fila * alto);
  let p = desde;
  for (let y = 0; y < alto; y++) {
    const filtro = crudo[p++];
    const o = y * fila, prev = o - fila;
    for (let i = 0; i < fila; i++) {
      const x = crudo[p++];
      const a = i >= bpp ? salida[o + i - bpp] : 0, b = y ? salida[prev + i] : 0, c = y && i >= bpp ? salida[prev + i - bpp] : 0;
      let v;
      if (filtro === 0) v = x;
      else if (filtro === 1) v = x + a;
      else if (filtro === 2) v = x + b;
      else if (filtro === 3) v = x + ((a + b) >> 1);
      else if (filtro === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`filtro PNG desconocido: ${filtro}`);
      salida[o + i] = v & 255;
    }
  }
  return { filas: salida, hasta: p };
}

export function leerPng(buf) {
  if (buf.subarray(0, 8).toString('hex') !== FIRMA) throw new Error('no es un PNG');
  let ancho = 0, alto = 0, bits = 0, tipo = 0, entrelazado = 0, paleta = null, trns = null;
  const datos = [];
  for (let p = 8; p < buf.length;) {
    const largo = buf.readUInt32BE(p);
    const nombre = buf.toString('latin1', p + 4, p + 8);
    const cuerpo = buf.subarray(p + 8, p + 8 + largo);
    if (nombre === 'IHDR') {
      ancho = cuerpo.readUInt32BE(0); alto = cuerpo.readUInt32BE(4);
      bits = cuerpo[8]; tipo = cuerpo[9]; entrelazado = cuerpo[12];
    } else if (nombre === 'PLTE') paleta = cuerpo;
    else if (nombre === 'tRNS') trns = cuerpo;
    else if (nombre === 'IDAT') datos.push(cuerpo);
    else if (nombre === 'IEND') break;
    p += 12 + largo;
  }
  const canales = CANALES[tipo];
  if (!canales || !(bits === 8 || bits === 16) || (tipo === 3 && (bits !== 8 || !paleta))) {
    throw new Error(`PNG no admitido (bits ${bits}, tipo ${tipo})`);
  }
  const bytes = bits / 8, bpp = canales * bytes;
  const crudo = inflateSync(Buffer.concat(datos));
  const rgba = new Uint8Array(ancho * alto * 4);
  const pintar = (filas, w, h, x0, y0, dx, dy) => {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const s = (y * w + x) * bpp, o = ((y0 + y * dy) * ancho + x0 + x * dx) * 4;
      const v = (k) => filas[s + k * bytes];
      if (tipo === 3) {
        const i = v(0);
        rgba[o] = paleta[i * 3]; rgba[o + 1] = paleta[i * 3 + 1]; rgba[o + 2] = paleta[i * 3 + 2];
        rgba[o + 3] = trns && i < trns.length ? trns[i] : 255;
      } else if (canales <= 2) {
        rgba[o] = rgba[o + 1] = rgba[o + 2] = v(0); rgba[o + 3] = canales === 2 ? v(1) : 255;
      } else {
        rgba[o] = v(0); rgba[o + 1] = v(1); rgba[o + 2] = v(2); rgba[o + 3] = canales === 4 ? v(3) : 255;
      }
    }
  };
  if (!entrelazado) {
    pintar(desfiltrar(crudo, 0, ancho * bpp, alto, bpp).filas, ancho, alto, 0, 0, 1, 1);
  } else {
    let p = 0;
    for (const [x0, y0, dx, dy] of ADAM7) {
      const w = Math.ceil((ancho - x0) / dx), h = Math.ceil((alto - y0) / dy);
      if (w <= 0 || h <= 0) continue;
      const { filas, hasta } = desfiltrar(crudo, p, w * bpp, h, bpp);
      pintar(filas, w, h, x0, y0, dx, dy);
      p = hasta;
    }
  }
  return { ancho, alto, rgba };
}

/**
 * Escritor de PNG (para las pruebas y los recortes): RGBA por defecto; con
 * `paleta` escribe tipo 3 (con `tRNS`), y con `entrelazado`, Adam7, para
 * poder probar el lector con lo que sirve la API. `filtros` elige el filtro
 * de cada fila (por defecto 0).
 */
export function escribirPng({ ancho, alto, rgba }, filtros = () => 0, { paleta = false, entrelazado = false } = {}) {
  let bpp = 4, pixel = (x, y) => rgba.subarray((y * ancho + x) * 4, (y * ancho + x) * 4 + 4);
  const trozos = [];
  if (paleta) {
    const indice = new Map(), colores = [];
    for (let k = 0; k < rgba.length; k += 4) {
      const clave = rgba.subarray(k, k + 4).join();
      if (!indice.has(clave)) { indice.set(clave, colores.length); colores.push(rgba.subarray(k, k + 4)); }
    }
    if (colores.length > 256) throw new Error('más de 256 colores para una paleta');
    trozos.push(['PLTE', Buffer.from(colores.flatMap((c) => [c[0], c[1], c[2]]))], ['tRNS', Buffer.from(colores.map((c) => c[3]))]);
    bpp = 1; const rgbaOriginal = rgba;
    pixel = (x, y) => [indice.get(rgbaOriginal.subarray((y * ancho + x) * 4, (y * ancho + x) * 4 + 4).join())];
  }
  const filasDe = (x0, y0, dx, dy) => {
    const w = Math.ceil((ancho - x0) / dx), h = Math.ceil((alto - y0) / dy);
    if (w <= 0 || h <= 0) return [];
    const fila = w * bpp, out = [];
    const crudaDe = (y) => { const r = new Uint8Array(fila); for (let x = 0; x < w; x++) r.set(pixel(x0 + x * dx, y0 + y * dy), x * bpp); return r; };
    let previa = null;
    for (let y = 0; y < h; y++) {
      const actual = crudaDe(y), f = filtros(y), linea = new Uint8Array(fila + 1);
      linea[0] = f;
      for (let i = 0; i < fila; i++) {
        const x = actual[i], a = i >= bpp ? actual[i - bpp] : 0, b = previa ? previa[i] : 0, c = previa && i >= bpp ? previa[i - bpp] : 0;
        let p = 0;
        if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
        else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
        linea[1 + i] = (x - p) & 255;
      }
      out.push(linea); previa = actual;
    }
    return out;
  };
  const filas = entrelazado ? ADAM7.flatMap(([x0, y0, dx, dy]) => filasDe(x0, y0, dx, dy)) : filasDe(0, 0, 1, 1);
  const trozo = (nombre, cuerpo) => {
    const largo = Buffer.alloc(4); largo.writeUInt32BE(cuerpo.length);
    const tn = Buffer.concat([Buffer.from(nombre, 'latin1'), cuerpo]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tn));
    return Buffer.concat([largo, tn, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = paleta ? 3 : 6; ihdr[12] = entrelazado ? 1 : 0;
  return Buffer.concat([Buffer.from(FIRMA, 'hex'), trozo('IHDR', ihdr), ...trozos.map(([n, c]) => trozo(n, c)),
    trozo('IDAT', deflateSync(Buffer.concat(filas))), trozo('IEND', Buffer.alloc(0))]);
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
