/**
 * Lee los baneos de la pantalla del draft de la tablet, desde Termux.
 *
 *   node scripts/lector/leer.mjs --buscar                      (la encuentra sola)
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
import { buscarPorMdns, escanearPuertos } from './tablet.mjs';

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

/**
 * La cara de la API comparada tal cual Y en espejo (3.31.0): en el panel
 * de picks el juego dibuja a unos héroes reflejados (Clint, Khufra,
 * Lesley, Aamon) y a otros no (Rafaela, Eudora, Gloo), medido en dos
 * capturas reales de Javi. Hasta 3.30.1 solo se comparaba en espejo y los
 * del segundo grupo salían «?» siempre: en su captura del 1 de octubre,
 * 2 de 5 solo en espejo y 4 de 5 con las dos (Gloo a 0,80 por un pelo);
 * en los huecos vacíos lo más parecido queda en 0,74.
 */
const orientadas = new WeakMap();
export const ambasOrientaciones = (caras) => {
  // La misma lista para las mismas caras: así se empaquetan una vez (caras.mjs) y no en cada lectura.
  if (!orientadas.has(caras)) orientadas.set(caras, [...caras.map((c) => ({ ...c, v: espejo(c.v) })), ...caras]);
  return orientadas.get(caras);
};

/**
 * `posiciones` y `extra` vienen de lo aprendido de las correcciones
 * (aprender.mjs, 3.27.0): los huecos medidos en ESA tablet y las caras tal
 * como las pinta su panel (ya en la orientación de la pantalla, sin espejo).
 * La geometría MEDIDA manda (3.30.1): se lee primero con `PICKS_ENEMIGOS`
 * y el hueco aprendido solo entra donde esa no lee a nadie. Un aprendizaje
 * equivocado (el 1 de octubre de 2026 una tanda movió el panel entero y
 * los picks dejaron de leerse) ya no puede tapar lo que la medida sí ve.
 */
export function leerPicksEnemigos(img, caras, { posiciones = null, extra = [] } = {}) {
  const referencias = [...ambasOrientaciones(caras), ...extra];
  // Búsqueda más ancha que en los baneos: cada dibujo encuadra la cara en un
  // sitio (Khufra cae a unos 20 píxeles de Clint en el mismo hueco).
  const opciones = { pasos: 5, escalas: [0.88, 0.94, 1.06, 1.12] };
  const medidos = PICKS_ENEMIGOS.map((pos) => reconocer(img, escalar(img, pos), referencias, opciones));
  if (!Array.isArray(posiciones)) return medidos;
  // Un hueco aprendido que lea a alguien que la medida ya leyó está mirando al vecino.
  const yaLeidos = new Set(medidos.map((l) => l.nombre).filter(Boolean));
  return medidos.map((l, i) => {
    const pos = posiciones[i];
    if (l.nombre || !pos || Math.hypot(pos[0] - PICKS_ENEMIGOS[i][0], pos[1] - PICKS_ENEMIGOS[i][1]) < pos[2] / 4) return l;
    const aprendido = reconocer(img, escalar(img, pos), referencias, opciones);
    return aprendido.parecido > l.parecido && !yaLeidos.has(aprendido.nombre) ? aprendido : l;
  });
}

/**
 * TU equipo (3.31.0): el panel de la izquierda, cinco filas de 216 px desde
 * y = 228 con el retrato a la izquierda; la cara cae alrededor de (165, 321
 * + 216·i) con radio ≈ 72, pero cada skin la encuadra en otro sitio (de 124
 * a 173 en x, radio 67–98 en la captura de Javi), así que la búsqueda es
 * más ancha todavía (±5 pasos de r/8, hasta 1,25 de escala). Con las dos
 * orientaciones leyó a los cinco CON sus skins (Clint 0,93, Guinevere
 * 0,94, Novaria 0,84, Leomord 0,97, Estes 0,92); solo en espejo, como se
 * midió en 3.21.0, ninguno pasaba de 0,72. Una de las cinco filas eres TÚ:
 * la de tu nombre en amarillo (`filaPropia`).
 */
export const ALIADOS = [0, 1, 2, 3, 4].map((i) => [165, 321 + 216 * i, 72]);
/** Dónde va el nombre del jugador de cada fila (x0, y0, ancho, alto), en la referencia. */
export const NOMBRES_ALIADOS = [0, 1, 2, 3, 4].map((i) => [14, 404 + 216 * i, 300, 36]);
/** Tu nombre va en amarillo: en la captura de Javi el 10,7% de su caja; en las otras cuatro, del 0,7% al 1,7%. */
export const AMARILLO_MINIMO = 0.05;

export function leerAliados(img, caras) {
  const referencias = ambasOrientaciones(caras);
  // Rejilla a r/8 (el doble de gruesa que en los picks) con ±5 pasos: mismo
  // alcance que ±8 a r/16 por la mitad de tiempo (1,3 s frente a 2,6 aquí) y
  // los cinco siguen entre 0,87 y 0,94; a r/6 con ±4 se pierden dos.
  return ALIADOS.map((pos) => reconocer(img, escalar(img, pos), referencias, { pasos: 5, escalas: [0.88, 0.94, 1.06, 1.12, 1.25], finura: 8 }));
}

/** Fracción de píxeles amarillos (el color del nombre propio) en una caja de la captura. */
export function fraccionAmarilla(img, [x0, y0, ancho, alto]) {
  const fx = img.ancho / REFERENCIA.ancho, fy = img.alto / REFERENCIA.alto;
  const X0 = Math.round(x0 * fx), Y0 = Math.round(y0 * fy), X1 = Math.min(img.ancho, Math.round((x0 + ancho) * fx)), Y1 = Math.min(img.alto, Math.round((y0 + alto) * fy));
  let n = 0, total = 0;
  for (let y = Y0; y < Y1; y++) for (let x = X0; x < X1; x++) {
    const i = (y * img.ancho + x) * 4, R = img.rgba[i], G = img.rgba[i + 1], B = img.rgba[i + 2];
    total += 1;
    if (R > 170 && G > 140 && B < 110 && R - B > 100) n += 1;
  }
  return total ? n / total : 0;
}

/**
 * Qué fila de tu equipo eres tú: la única con el nombre en amarillo (al
 * menos `AMARILLO_MINIMO` de su caja y el doble que cualquier otra). −1 si
 * no se distingue: entonces no se sabe cuál de los cinco es tu pick y la
 * app no mete a nadie como compañero, porque uno de ellos serías tú.
 */
export function filaPropia(img) {
  const f = NOMBRES_ALIADOS.map((caja) => fraccionAmarilla(img, caja));
  const mejor = f.reduce((m, v, i) => (v > f[m] ? i : m), 0);
  const resto = Math.max(...f.filter((_, i) => i !== mejor));
  return f[mejor] >= AMARILLO_MINIMO && f[mejor] >= 2 * resto ? mejor : -1;
}

/**
 * El mismo héroe no puede estar dos veces en los huecos de UN equipo (sus
 * cinco baneos, los cinco picks): si dos leen el mismo nombre, uno está
 * mal. Se queda el que más se parece y el otro pasa a «?» con su candidato.
 * OJO: los dos equipos SÍ pueden banear al mismo héroe (Hirara en la
 * captura real; Belerick y Atlas en la primera tarde): no se cruza entre lados.
 */
export function sinRepetidos(lecturas) {
  const mejor = new Map();
  for (const l of lecturas) if (l.nombre && !(mejor.get(l.nombre)?.parecido >= l.parecido)) mejor.set(l.nombre, l);
  return lecturas.map((l) => (l.nombre && mejor.get(l.nombre) !== l ? { ...l, nombre: null, repetido: true } : l));
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

/**
 * `adb connect` y lo que contesta («connected to», «already connected»,
 * «failed to authenticate» si falta emparejar, «failed to connect» si ahí
 * no hay nadie). No lanza: lo que diga adb se devuelve como texto.
 */
export function conectarTablet(dispositivo, { ms = 15000 } = {}) {
  try {
    return execFileSync('adb', ['connect', dispositivo], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: ms });
  } catch (e) {
    return `${e.stdout ?? ''}${e.stderr ?? ''}${e.message ?? ''}`;
  }
}

/**
 * La captura de la pantalla de la tablet: en PNG (`-p`, la tablet la
 * comprime) o, con `crudo`, tal cual (3.45.0: unos 14 MB a 2400×1504 por la
 * wifi, sin comprimir; `leerCrudo` en png.mjs). Las dos son el mismo
 * `screencap` de solo lectura: nada toca la pantalla.
 */
export function capturarTablet(dispositivo, { crudo = false } = {}) {
  // `connect` no falla si ya está conectada; sin él, el primer uso tras
  // encender la depuración no encuentra la tablet.
  conectarTablet(dispositivo);
  if (crudo) return execFileSync('adb', ['-s', dispositivo, 'exec-out', 'screencap'], { maxBuffer: 64 * 1024 * 1024, timeout: 20000 });
  return execFileSync('adb', ['-s', dispositivo, 'exec-out', 'screencap', '-p'], { maxBuffer: 64 * 1024 * 1024, timeout: 20000 });
}

const fallo = (tipo, mensaje) => Object.assign(new Error(mensaje), { tipo });

/**
 * Encontrar la tablet sin que nadie escriba el puerto (3.26.0). Por orden:
 * la última que funcionó (`memoria`: ip y puerto; si la tablet no apagó la
 * depuración, sigue valiendo), las que anuncia la wifi por mDNS y, si nadie
 * contesta pero se sabe la IP, los puertos abiertos de esa IP. Cada
 * candidata se comprueba con `adb connect`: solo se devuelve una que
 * conecte. «failed to authenticate» es que falta emparejar, y se dice
 * distinto de «no la veo».
 */
export async function encontrarTablet({ memoria = {}, registrar = () => {}, probar = (d) => conectarTablet(d, { ms: 6000 }), buscar = buscarPorMdns, escanear = escanearPuertos, maxPuertos = 8 } = {}) {
  const vistas = new Set();
  let faltaEmparejar = false;
  const intentar = (c) => {
    const clave = `${c.ip}:${c.puerto}`;
    if (vistas.has(clave)) return false;
    vistas.add(clave);
    const dicho = String(probar(clave));
    if (/connected to/i.test(dicho)) return true;
    if (/authenticate/i.test(dicho)) faltaEmparejar = true;
    registrar(`${clave} (${c.via}): ${dicho.trim().split('\n')[0]}`);
    return false;
  };
  if (memoria.ip && memoria.puerto) {
    const c = { ip: memoria.ip, puerto: Number(memoria.puerto), via: 'memoria' };
    if (intentar(c)) return c;
  }
  const anunciadas = await buscar();
  for (const t of anunciadas) { const c = { ...t, via: 'wifi' }; if (intentar(c)) return c; }
  const ip = memoria.ip ?? anunciadas[0]?.ip;
  if (ip) {
    registrar(`Nadie contesta por mDNS: busco el puerto de la depuración en ${ip}…`);
    const puertos = (await escanear(ip)).slice(0, maxPuertos);
    for (const puerto of puertos) { const c = { ip, puerto, via: 'puertos' }; if (intentar(c)) return c; }
  }
  if (faltaEmparejar) throw fallo('emparejar', 'La tablet no deja entrar al móvil: hay que emparejarlos una vez (adb pair).');
  throw fallo('tablet', ip ? `No encuentro la tablet en ${ip}: ¿está encendida la depuración inalámbrica?` : 'No veo ninguna tablet con la depuración inalámbrica encendida en esta wifi.');
}

async function principal() {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  let tablet = arg('--tablet');
  const archivo = arg('--archivo'), guardar = arg('--guardar');
  if (!tablet && !archivo && !process.argv.includes('--buscar')) {
    console.error('Uso: node scripts/lector/leer.mjs --tablet IP:PUERTO   (o --buscar, o --archivo captura.png)');
    process.exit(2);
  }
  let png;
  try {
    if (!archivo && (!tablet || !tablet.includes(':'))) {
      const t = await encontrarTablet({ memoria: tablet ? { ip: tablet } : {}, registrar: (m) => console.error(m) });
      tablet = `${t.ip}:${t.puerto}`;
      console.error(`Tablet: ${tablet} (${t.via})`);
    }
    png = archivo ? readFileSync(archivo) : capturarTablet(tablet);
  } catch (e) {
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
