/**
 * Lee los baneos de la pantalla del draft de la tablet, desde Termux.
 *
 *   node scripts/lector/leer.mjs --tablet 192.168.68.112:PUERTO
 *   node scripts/lector/leer.mjs --archivo captura.png        (sin tablet)
 *
 * Añade `--json` para la salida en JSON y `--guardar f.png` para quedarse
 * con la captura.
 *
 * SEGURIDAD (la cuenta de Javi vale dinero): esto SOLO hace una captura de
 * pantalla por depuración inalámbrica, lo mismo que una captura a mano. No
 * toca la pantalla, no pulsa nada, no instala nada en la tablet y no habla
 * con Moonton ni con ninguna API. Hay una prueba que falla si en esta
 * carpeta aparece cualquier otro mandato de adb.
 */
import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { leerPng } from './png.mjs';
import { cargarCaras, reconocer } from './caras.mjs';

/**
 * Dónde están los diez baneos en una pantalla de 2400×1504, medido en las
 * capturas de Javi (fase de picks y de skins: la fila de arriba no se
 * mueve). Los cinco de la izquierda son los de tu equipo. En otra
 * resolución se escala con el ancho y el alto.
 */
export const REFERENCIA = { ancho: 2400, alto: 1504 };
export const BANEOS = {
  tuyos: [85, 222, 358, 495, 633].map((x) => [x, 138, 47]),
  suyos: [1760, 1898, 2036, 2174, 2312].map((x) => [x, 138, 47]),
};

const escalar = (img, [x, y, r]) => {
  const fx = img.ancho / REFERENCIA.ancho, fy = img.alto / REFERENCIA.alto;
  return [x * fx, y * fy, r * Math.min(fx, fy)];
};

export function leerBaneos(img, caras) {
  const leer = (lista) => lista.map((pos) => reconocer(img, escalar(img, pos), caras));
  return { tuyos: leer(BANEOS.tuyos), suyos: leer(BANEOS.suyos) };
}

export const carasGuardadas = () => cargarCaras(JSON.parse(readFileSync(new URL('caras.json', import.meta.url))).caras);

function capturarTablet(dispositivo) {
  // `connect` no falla si ya está conectada; sin él, el primer uso tras
  // encender la depuración no encuentra la tablet.
  execFileSync('adb', ['connect', dispositivo], { stdio: 'ignore', timeout: 15000 });
  return execFileSync('adb', ['-s', dispositivo, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024, timeout: 20000 });
}

async function principal() {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const tablet = arg('--tablet'), archivo = arg('--archivo'), guardar = arg('--guardar');
  if (!tablet && !archivo) {
    console.error('Uso: node scripts/lector/leer.mjs --tablet IP:PUERTO   (o --archivo captura.png)');
    process.exit(2);
  }
  let png;
  try { png = archivo ? readFileSync(archivo) : capturarTablet(tablet); }
  catch (e) {
    console.error(`No se pudo hacer la captura: ${e.message.split('\n')[0]}`);
    console.error('¿Está la depuración inalámbrica encendida y el puerto es el de «Dirección IP y puerto» (no el de vincular)?');
    process.exit(1);
  }
  if (guardar) writeFileSync(guardar, png);
  const img = leerPng(png);
  const baneos = leerBaneos(img, carasGuardadas());
  if (process.argv.includes('--json')) {
    const plano = (l) => l.map((x) => x.nombre);
    console.log(JSON.stringify({ ancho: img.ancho, alto: img.alto, tuyos: plano(baneos.tuyos), suyos: plano(baneos.suyos) }));
    return;
  }
  const linea = (l) => l.map((x) => x.nombre ?? `? (¿${x.candidato}? ${Math.round(x.parecido * 100)}%)`).join(', ');
  console.log(`Captura ${img.ancho}×${img.alto}`);
  console.log(`Baneos de tu equipo: ${linea(baneos.tuyos)}`);
  console.log(`Baneos del enemigo:  ${linea(baneos.suyos)}`);
  const dudas = [...baneos.tuyos, ...baneos.suyos].filter((x) => !x.nombre).length;
  if (dudas) console.log(`${dudas} sin reconocer: hueco vacío o héroe sin cara de referencia.`);
}

if (import.meta.url === `file://${process.argv[1]}`) await principal();
