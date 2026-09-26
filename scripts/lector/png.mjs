/**
 * Lector de PNG mínimo, sin dependencias: lo que da `adb exec-out screencap
 * -p` (8 bits, RGBA o RGB, sin entrelazar). Devuelve { ancho, alto, rgba }.
 * Nada más: en Termux no hay navegador ni librerías de imagen, y una
 * dependencia nativa es justo lo que no compila en un móvil.
 */
import { deflateSync, inflateSync } from 'node:zlib';

const FIRMA = '89504e470d0a1a0a';

export function leerPng(buf) {
  if (buf.subarray(0, 8).toString('hex') !== FIRMA) throw new Error('no es un PNG');
  let ancho = 0, alto = 0, bits = 0, tipo = 0, entrelazado = 0;
  const datos = [];
  for (let p = 8; p < buf.length;) {
    const largo = buf.readUInt32BE(p);
    const nombre = buf.toString('latin1', p + 4, p + 8);
    const cuerpo = buf.subarray(p + 8, p + 8 + largo);
    if (nombre === 'IHDR') {
      ancho = cuerpo.readUInt32BE(0); alto = cuerpo.readUInt32BE(4);
      bits = cuerpo[8]; tipo = cuerpo[9]; entrelazado = cuerpo[12];
    } else if (nombre === 'IDAT') datos.push(cuerpo);
    else if (nombre === 'IEND') break;
    p += 12 + largo;
  }
  const canales = { 6: 4, 2: 3 }[tipo];
  if (bits !== 8 || !canales || entrelazado) throw new Error(`PNG no admitido (bits ${bits}, tipo ${tipo}, entrelazado ${entrelazado})`);
  const crudo = inflateSync(Buffer.concat(datos));
  const fila = ancho * canales;
  const rgba = new Uint8Array(ancho * alto * 4);
  let previa = new Uint8Array(fila), actual = new Uint8Array(fila);
  for (let y = 0; y < alto; y++) {
    const base = y * (fila + 1), filtro = crudo[base];
    for (let i = 0; i < fila; i++) {
      const x = crudo[base + 1 + i];
      const a = i >= canales ? actual[i - canales] : 0, b = previa[i], c = i >= canales ? previa[i - canales] : 0;
      let v;
      if (filtro === 0) v = x;
      else if (filtro === 1) v = x + a;
      else if (filtro === 2) v = x + b;
      else if (filtro === 3) v = x + ((a + b) >> 1);
      else if (filtro === 4) {
        const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c);
        v = x + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c);
      } else throw new Error(`filtro PNG desconocido: ${filtro}`);
      actual[i] = v & 255;
    }
    for (let px = 0; px < ancho; px++) {
      const o = (y * ancho + px) * 4, s = px * canales;
      rgba[o] = actual[s]; rgba[o + 1] = actual[s + 1]; rgba[o + 2] = actual[s + 2]; rgba[o + 3] = canales === 4 ? actual[s + 3] : 255;
    }
    [previa, actual] = [actual, previa];
  }
  return { ancho, alto, rgba };
}

/**
 * Escritor de PNG RGBA (para las pruebas y los recortes). `filtros` elige
 * el filtro de cada fila (por defecto 0), para poder probar el lector con
 * los cinco.
 */
export function escribirPng({ ancho, alto, rgba }, filtros = () => 0) {
  const fila = ancho * 4, crudo = Buffer.alloc(alto * (fila + 1));
  for (let y = 0; y < alto; y++) {
    const f = filtros(y), base = y * (fila + 1);
    crudo[base] = f;
    for (let i = 0; i < fila; i++) {
      const x = rgba[y * fila + i], a = i >= 4 ? rgba[y * fila + i - 4] : 0, b = y ? rgba[(y - 1) * fila + i] : 0, c = y && i >= 4 ? rgba[(y - 1) * fila + i - 4] : 0;
      let p = 0;
      if (f === 1) p = a; else if (f === 2) p = b; else if (f === 3) p = (a + b) >> 1;
      else if (f === 4) { const pp = a + b - c, pa = Math.abs(pp - a), pb = Math.abs(pp - b), pc = Math.abs(pp - c); p = pa <= pb && pa <= pc ? a : pb <= pc ? b : c; }
      crudo[base + 1 + i] = (x - p) & 255;
    }
  }
  const trozo = (nombre, cuerpo) => {
    const largo = Buffer.alloc(4); largo.writeUInt32BE(cuerpo.length);
    const tn = Buffer.concat([Buffer.from(nombre, 'latin1'), cuerpo]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(tn));
    return Buffer.concat([largo, tn, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(ancho, 0); ihdr.writeUInt32BE(alto, 4); ihdr[8] = 8; ihdr[9] = 6;
  return Buffer.concat([Buffer.from(FIRMA, 'hex'), trozo('IHDR', ihdr), trozo('IDAT', deflateSync(crudo)), trozo('IEND', Buffer.alloc(0))]);
}

function crc32(buf) {
  let c = ~0;
  for (const byte of buf) { c ^= byte; for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1)); }
  return ~c >>> 0;
}
