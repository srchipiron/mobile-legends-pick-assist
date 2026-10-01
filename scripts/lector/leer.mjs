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
import { readFileSync, writeFileSync, realpathSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerPng } from './png.mjs';
import { cargarCaras, reconocer, espejo } from './caras.mjs';

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

/**
 * Los picks ENEMIGOS: el dibujo grande de la derecha. Medido en la captura
 * de Javi (Clint, 28-9-2026): es la misma cara del juego que usa el lector,
 * AMPLIADA y en ESPEJO, con el centro al 54,7% del ancho y al 48,6% del
 * alto de cada hueco y radio el 34,3% del alto (parecido 0,98; Khufra en el
 * segundo hueco, 0,885, con el siguiente candidato en 0,50). Solo vale
 * mientras se elige: en la fase de skins el dibujo ya lleva la skin y no
 * casa con nada (máximo 0,65 en su captura), y eso sale como «?», no como un
 * nombre. Los de TU equipo no se leen: se ven con la skin que lleva cada
 * uno (ninguno pasaba de 0,72).
 */
export const PICKS_ENEMIGOS = [0, 1, 2, 3, 4].map((i) => {
  const x0 = 2020, ancho = 380, y0 = 230 + 216 * i, alto = 216;
  return [x0 + 0.547 * ancho, y0 + 0.486 * alto, 0.343 * alto];
});

export function leerPicksEnemigos(img, caras) {
  const enEspejo = caras.map((c) => ({ ...c, v: espejo(c.v) }));
  // Búsqueda más ancha que en los baneos: cada dibujo encuadra la cara en un
  // sitio (Khufra cae a unos 20 píxeles de Clint en el mismo hueco).
  return PICKS_ENEMIGOS.map((pos) => reconocer(img, escalar(img, pos), enEspejo, { pasos: 5, escalas: [0.88, 0.94, 1.06, 1.12] }));
}

export const carasGuardadas = () => cargarCaras(JSON.parse(readFileSync(new URL('caras.json', import.meta.url))).caras);

/**
 * Si las caras de referencia se han quedado atrás de los datos (un héroe
 * nuevo, o uno rehecho al que la API le da otra cara), lo dice: sin avisar,
 * ese héroe saldría siempre como «?» sin que nadie supiera por qué.
 */
export const carasDesfasadas = (fuentes = {}, heroes = []) => heroes.filter((h) => h?.cara && fuentes[h.name] !== h.cara).map((h) => h.name);

export function avisoDeCaras() {
  try {
    const { fuentes = {} } = JSON.parse(readFileSync(new URL('caras.json', import.meta.url)));
    const { heroes = [] } = JSON.parse(readFileSync(new URL('../../public/data/roam-meta.json', import.meta.url)));
    const viejas = carasDesfasadas(fuentes, heroes);
    return viejas.length ? `Caras sin poner al día (${viejas.join(', ')}): node scripts/lector/sacar-caras.mjs` : null;
  } catch { return null; }
}

export function capturarTablet(dispositivo) {
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
  const caras = carasGuardadas();
  const baneos = leerBaneos(img, caras);
  const enemigos = leerPicksEnemigos(img, caras);
  if (process.argv.includes('--json')) {
    const plano = (l) => l.map((x) => x.nombre);
    console.log(JSON.stringify({ ancho: img.ancho, alto: img.alto, tuyos: plano(baneos.tuyos), suyos: plano(baneos.suyos), enemigos: plano(enemigos) }));
    return;
  }
  const linea = (l) => l.map((x) => x.nombre ?? `? (¿${x.candidato}? ${Math.round(x.parecido * 100)}%)`).join(', ');
  console.log(`Captura ${img.ancho}×${img.alto}`);
  console.log(`Baneos de tu equipo: ${linea(baneos.tuyos)}`);
  console.log(`Baneos del enemigo:  ${linea(baneos.suyos)}`);
  console.log(`Picks del enemigo:   ${linea(enemigos)}`);
  const dudas = [...baneos.tuyos, ...baneos.suyos, ...enemigos].filter((x) => !x.nombre).length;
  if (dudas) console.log(`${dudas} sin reconocer: hueco vacío, todavía eligiendo, fase de skins o héroe sin cara de referencia.`);
  const aviso = avisoDeCaras();
  if (aviso) console.log(aviso);
}

// Con la ruta real de los dos lados: en Termux el repositorio puede estar
// detrás de un enlace (`~/storage/shared`) o en una carpeta con espacios, y
// comparar la URL con `file://${argv[1]}` hacía que no pasara nada, con
// código 0 (cazado en la revisión de 3.21.0).
const esteFichero = realpathSync(fileURLToPath(import.meta.url));
if (process.argv[1] && realpathSync(resolve(process.argv[1])) === esteFichero) await principal();
