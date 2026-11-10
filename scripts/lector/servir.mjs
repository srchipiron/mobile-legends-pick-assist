/**
 * El servidor del lector (3.25.0): lo arranca Lector MLBB en la tablet
 * (`en-tablet.mjs`, 3.61.0) con la captura de la propia tablet, y la app
 * del móvil le pide lecturas con el botón «Leer del juego» o leyendo sola.
 * Cada lectura reconoce baneos y picks y devuelve los NOMBRES; la imagen no
 * sale de la tablet.
 *
 * - Solo responde con datos a la app publicada (y a una copia local para
 *   las pruebas), con el código de vinculación y una IP privada como `Host`.
 * - VIGILA EL FINAL de la partida por su cuenta (`/vigilar`, `/final`,
 *   3.33.0): la tablet sigue despierta con el móvil en el bolsillo.
 *
 * Hasta 3.96.0 también corría en Termux, en el móvil, capturando la tablet
 * por adb; eso se quitó en 3.97.0 (decisión de Javi).
 *
 * SEGURIDAD: no toca la pantalla ni habla con Moonton, y no lanza programas.
 */
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { timingSafeEqual, pbkdf2 } from 'node:crypto';
import { join, resolve } from 'node:path';
import { Worker } from 'node:worker_threads';
import { leerPng, leerCrudo, escribirPngRapido } from './png.mjs';
import { carasGuardadas } from './leer.mjs';
import { PARTES, leerParte, juntarLectura, leerCaptura } from './lectura.mjs';
import { resumirAprendizaje, sinHuecosVacios, CAPTURAS_POR_CORRECCION, VERSION_APRENDIDO } from './aprender.mjs';

export { CAPTURAS_POR_CORRECCION };
import { fotogramaDe } from './miniatura.mjs';
import { enPartida, recorteMarcador } from './partida.mjs';
import { nombreClave } from '../../src/motor/nombres.js';
import { tiraDe, reconocerResultado, plantillasIniciales } from './resultado.mjs';

/**
 * La captura de las LECTURAS del draft, comprimida o no (3.45.0, pedido por
 * Javi: «prueba lo de la captura sin comprimir»). En su móvil una lectura
 * tardaba 4,9 s de mediana y 3,8 eran la captura: la tablet comprime un PNG
 * de 2400×1504 y el móvil lo descomprime en JavaScript. Sin comprimir son
 * unos 14 MB por la wifi y nada que descomprimir; cuál va antes depende de
 * su tablet y de su wifi, y eso no se puede medir desde aquí. Así que el
 * lector las PRUEBA: alterna hasta tener `muestras` de cada una, se queda
 * con la de menor mediana (de las últimas `ventana`, captura + imagen
 * lista) y cada `explorar` lecturas vuelve a probar la otra por si la wifi
 * cambió. Si la de crudo falla o no se sabe leer, se queda en PNG hasta que
 * se reinicie el lector. Las capturas de la PARTIDA (inicio y final) siguen
 * en PNG: 14 MB cada 10 s por la wifi mientras se juega podrían meter lag.
 * Decisiones de producto.
 */
export const ELECCION_DE_CAPTURA = { muestras: 3, ventana: 5, explorar: 10 };

export function crearElectorDeCaptura({ muestras = ELECCION_DE_CAPTURA.muestras, ventana = ELECCION_DE_CAPTURA.ventana, explorar = ELECCION_DE_CAPTURA.explorar } = {}) {
  const tiempos = { crudo: [], png: [] };
  let n = 0, roto = null;
  const mediana = (l) => [...l].sort((a, b) => a - b)[Math.floor((l.length - 1) / 2)];
  const mejor = () => (mediana(tiempos.crudo) <= mediana(tiempos.png) ? 'crudo' : 'png');
  return {
    /** El formato de la próxima lectura. */
    siguiente() {
      n += 1;
      if (roto) return 'png';
      if (tiempos.crudo.length < muestras || tiempos.png.length < muestras) return tiempos.crudo.length <= tiempos.png.length ? 'crudo' : 'png';
      const m = mejor();
      return n % explorar === 0 ? (m === 'crudo' ? 'png' : 'crudo') : m;
    },
    /** Lo que tardó una lectura con ese formato hasta tener la imagen; devuelve el elegido si acaba de cambiar. */
    anotar(formato, ms) {
      if (!tiempos[formato] || !Number.isFinite(ms)) return null;
      const antes = tiempos.crudo.length >= muestras && tiempos.png.length >= muestras ? mejor() : null;
      tiempos[formato].push(ms);
      if (tiempos[formato].length > ventana) tiempos[formato].shift();
      const ahora = tiempos.crudo.length >= muestras && tiempos.png.length >= muestras ? mejor() : null;
      return ahora && ahora !== antes ? ahora : null;
    },
    /** La captura en crudo no vale en esta tablet: PNG hasta reiniciar. */
    descartar(motivo) { roto = String(motivo ?? 'sin motivo'); },
    estado: () => ({ roto, crudo: tiempos.crudo.length ? mediana(tiempos.crudo) : null, png: tiempos.png.length ? mediana(tiempos.png) : null }),
  };
}

/** Decisión de producto: un puerto alto, fijo, que la app conoce. */
export const PUERTO = 47323;
/** La app publicada. Una copia servida desde el propio móvil también vale (pruebas). */
export const ORIGENES = ['https://srchipiron.github.io'];
export const VERSION_PUENTE = 1;
/** Fallos de captura que la app distingue: la tablet no está, falta emparejar, o adb no consigue la captura. */
export const FALLOS_DE_CAPTURA = ['tablet', 'emparejar', 'captura'];
/** La casa del lector: la de Termux, o la carpeta de la app en la tablet (`LECTOR_CASA`, 3.61.0). */
const CASA = process.env.LECTOR_CASA || homedir();
/** Lo aprendido de las correcciones (aprender.mjs): huecos de picks y caras de esta tablet. */
export const FICHERO_APRENDIDO = join(CASA, '.config', 'lector', 'aprendido.json');
/**
 * Las plantillas de VICTORIA / DERROTA (resultado.mjs): FIJAS desde 3.99.0,
 * cuatro tablas de serie con los nombres tapados. Ya no se aprenden de lo que
 * se contesta ni de lo que se apunta solo: una tabla tapada aprendida como
 * victoria hizo que la tablet apuntara 142 victorias y 3 derrotas en dos
 * semanas. El `resultados.json` que dejó una versión anterior no se lee.
 */
const tablaDeSerie = (f) => leerPng(readFileSync(new URL(f, import.meta.url)));
export const plantillasDeSerie = () => plantillasIniciales({
  victorias: ['tabla-victoria-1.png', 'tabla-victoria-2.png'].map(tablaDeSerie),
  derrotas: ['tabla-derrota-1.png', 'tabla-derrota-2.png'].map(tablaDeSerie),
});

/** Cuántas de las últimas capturas de una corrección se miran para elegir las `CAPTURAS_POR_CORRECCION` que sean la pantalla del draft. */
export const CAPTURAS_A_MIRAR = 8;
/**
 * Las `CAPTURAS_A_MIRAR` de un draft, REPARTIDAS por él con la primera y la
 * última (3.90.4), en su orden. Las ocho últimas eran los últimos ~30 s del
 * draft (una cada 4 s): el 4 de noviembre de 2026, el menú de equipamiento
 * encima del draft en las ocho, y ni los recortes ni el aprendizaje vieron
 * una cara.
 */
export function capturasAMirar(ids, n = CAPTURAS_A_MIRAR) {
  const orden = [...new Set(ids ?? [])].sort();
  if (orden.length <= n) return orden;
  return [...new Set(Array.from({ length: n }, (_, i) => orden[Math.round((i * (orden.length - 1)) / (n - 1))]))];
}

/**
 * Las capturas se borran solas (3.34.0, «se me está llenando el móvil de
 * fotos»): cada una pesa 3–4 MB a 2400×1504 y leyendo solo salen 12 por
 * minuto. Solo hacen falta un rato: las de un draft, para aprender de la
 * corrección al completarlo y al apuntar (las últimas `CAPTURAS_A_MIRAR`);
 * los fotogramas del final, para aprender la tabla al apuntar. Se queda lo
 * de las últimas `RETENCION_CAPTURAS_MS` (3 h: una partida con su cola) y
 * nunca más de `MAX_CAPTURAS` por tipo (40 lecturas son los últimos ~3
 * minutos de un draft, de sobra para las 8 que se miran). Lo que no es una
 * captura del lector no se toca.
 */
export const RETENCION_CAPTURAS_MS = 3 * 3600000;
export const MAX_CAPTURAS = { lectura: 40, fotograma: 24, resultado: 8 };
const FICHERO_DE_CAPTURA = /^(lectura|fotograma|resultado)-[\w-]+?\.(png|json|verdad\.json)$/;
const idDeCaptura = (n) => n.replace(/\.(png|json|verdad\.json)$/, '');
export function podarCapturas(carpeta, { ahora = Date.now(), retencionMs = RETENCION_CAPTURAS_MS, maximos = MAX_CAPTURAS, proteger = new Set() } = {}) {
  let nombres;
  try { nombres = readdirSync(carpeta); } catch { return 0; }
  let borrados = 0;
  for (const tipo of Object.keys(maximos)) {
    const ficheros = nombres.filter((n) => FICHERO_DE_CAPTURA.test(n) && n.startsWith(`${tipo}-`));
    // Los ids llevan la hora en el nombre: ordenados, los primeros son los más viejos.
    // Lo que la vigilancia del final aún enseña (la tabla, sobre todo) no se
    // poda (3.37.0): sin su PNG, `/resultado` no aprende nada de ella.
    const ids = [...new Set(ficheros.map(idDeCaptura))].filter((id) => !proteger.has(id)).sort();
    const sobran = new Set(ids.slice(0, Math.max(0, ids.length - maximos[tipo])));
    for (const n of ficheros) {
      const ruta = join(carpeta, n);
      try {
        if (!sobran.has(idDeCaptura(n)) && ahora - statSync(ruta).mtimeMs <= retencionMs) continue;
        unlinkSync(ruta);
        borrados += 1;
      } catch { /* ya no está */ }
    }
  }
  return borrados;
}

/**
 * La vigilancia del final de la partida vive AQUÍ desde 3.33.0: la app avisa
 * de cuándo se completó el draft (`POST /vigilar { desde }`) y el lector, que
 * en Termux sigue despierto con el móvil en el bolsillo, captura por su
 * cuenta cada `intervaloMs` desde el minuto `desdeMin` hasta el `hastaMin`,
 * se queda con los fotogramas en que la pantalla cambia (hasta
 * `maxFotogramas`; el de la tabla siempre) y reconoce el resultado; la app
 * lo recoge (`GET /final`) cuando vuelve a estar a la vista. Hasta 3.32.1 era
 * la app la que pedía fotogramas, y solo con la pestaña visible: en las tres
 * partidas del 2 de octubre de 2026 los únicos fotogramas eran de cuando
 * Javi miraba el móvil (rango, MVP, en partida) y la tabla no se vio nunca.
 * Los mismos números que `src/app/lector.js` (hay prueba); el reloj es el
 * del móvil en los dos lados, así que `desde` se compara tal cual.
 *
 * `partidaHastaMin` (3.44.1): con el inicio VISTO, se vigila hasta ese
 * minuto de partida aunque pase del `hastaMin` del draft. Con 25 desde el
 * draft, una partida de más de unos 23 minutos acababa sin tabla, sin
 * duración y sin apuntarse sola: justo el tramo 20+ se quedaba sin medir.
 * En cuanto sale la tabla se deja de mirar a los dos minutos. Decisión de
 * producto: una partida de Gloria casi nunca pasa de 30.
 */
/*
 * La ráfaga del final (3.89.2): en cuanto deja de verse el minimapa tras verlo
 * (acaba la partida), una captura cada `rapidoMs` durante `rafagaMs`. Cada
 * 10 s la tabla pasaba entre dos capturas: las 8 pantallas del final sin
 * reconocer del 31 de octubre al 3 de noviembre de 2026 eran la explosión de
 * la base, la de rango y el draft siguiente, a 10 s una de otra, y ninguna
 * la tabla. Las derrotas se quedaban sin apuntar. 2 s es lo que tarda una
 * lectura entera en la tablet (0,6–1,6 s); 90 s, de la explosión a la
 * pantalla de rango con margen. Decisiones de producto.
 */
export const VIGILANCIA = { desdeMin: 8, hastaMin: 25, intervaloMs: 10000, maxFotogramas: 8, inicioDesdeMin: 0, inicioEstimadoMin: 1, intervaloInicioMs: 20000, partidaHastaMin: 40, rapidoMs: 2000, rafagaMs: 90000 };

/**
 * ¿Toca capturar el final ahora? Cada `intervaloMs`, o cada `rapidoMs` mientras
 * dura la ráfaga (`rafagaHasta`). El reloj late cada `latido`, así que se da
 * medio latido de margen: sin él, un latido que llega un pelo antes de los
 * 10 s dejaba la captura para el siguiente (12 s).
 */
export function tocaCapturarFinal({ ultimaFinal = 0, rafagaHasta = 0 } = {}, t, vigilancia = VIGILANCIA, latido = Math.min(vigilancia.intervaloMs, vigilancia.rapidoMs)) {
  const paso = rafagaHasta > t ? Math.min(vigilancia.rapidoMs, vigilancia.intervaloMs) : vigilancia.intervaloMs;
  return t - ultimaFinal >= paso - latido / 2;
}

/**
 * El INICIO de la partida (3.44.0): el lector lo busca desde el minuto
 * `inicioDesdeMin` tras el draft, una captura cada `intervaloInicioMs`, y lo
 * reconoce por el minimapa (partida.mjs, dos capturas seguidas). Sin inicio
 * visto al llegar al minuto 8 se estima en el `inicioEstimadoMin` del draft
 * y se marca. Sirve para la DURACIÓN de la partida. Los consejos en voz alta
 * que colgaban de aquí se quitaron en 3.96.0 (decisión de Javi).
 *
 * Se mira desde el minuto 0 y no desde el 1 (3.45.1): la partida empieza
 * antes. El 6 de octubre de 2026 el draft se completó de 15 a 55 s antes de
 * empezar la partida: mirando desde el minuto 1 el inicio salía estimado.
 */
/**
 * El inicio visto por las LECTURAS del draft (3.46.0): cada `/leer` dice si
 * la tablet ya está en partida (minimapa, como la vigilancia). Si el draft
 * se cierra porque la partida ha empezado (la app lo da por cerrado aunque
 * falte alguien), la vigilancia llega tarde y su primera captura ya es de
 * juego: el inicio saldría estimado y la partida sin duración. Con una
 * lectura FUERA y luego `LECTURAS_EN_PARTIDA` seguidas DENTRO, el inicio es
 * el punto medio entre la última de fuera y la primera de dentro, si entre
 * las dos no pasó más de `HUECO_MAXIMO_LECTURAS_MS` (una cada 5 s leyendo
 * solo; con la app escondida un rato, el punto medio ya no dice nada) y la
 * primera de dentro cae en los `MINUTOS_DEL_INICIO_LEIDO` antes del draft.
 * Decisiones de producto, con el mismo criterio que la vigilancia (dos
 * capturas seguidas, punto medio).
 */
export const LECTURAS_EN_PARTIDA = 2;
export const HUECO_MAXIMO_LECTURAS_MS = 60000;
export const MINUTOS_DEL_INICIO_LEIDO = 10;

/** Lo aprendido, si es de la versión actual: lo de 3.27.0–3.30.0 (versión 1) se aprendió sin guardas y se descarta. */
export function leerAprendido(fichero = FICHERO_APRENDIDO) {
  try { const a = JSON.parse(readFileSync(fichero, 'utf8')); return a && typeof a === 'object' && a.version === VERSION_APRENDIDO ? sinHuecosVacios(a) : null; } catch { return null; }
}
export function guardarAprendido(a, fichero = FICHERO_APRENDIDO) {
  try { mkdirSync(resolve(fichero, '..'), { recursive: true }); writeFileSync(fichero, JSON.stringify(a)); } catch { /* sin disco: se aprende otra vez la próxima */ }
}

/** Drafts arreglados que se aprenden de una vez (3.83.0): unos segundos de hilo cada uno en la tablet. */
export const ARREGLOS_POR_TANDA = 10;

/** El aprendizaje de verdad, en un hilo aparte (aprender-tarea.mjs). */
export function aprenderEnHilo({ pares, aprendido }) {
  return new Promise((resolver, rechazar) => {
    const hilo = new Worker(new URL('aprender-tarea.mjs', import.meta.url), { workerData: { pares, aprendido } });
    hilo.once('message', resolver);
    hilo.once('error', rechazar);
    hilo.once('exit', (codigo) => { if (codigo !== 0) rechazar(new Error(`el hilo de aprendizaje salió con ${codigo}`)); });
  });
}

/** Los recortes de un draft para medir el lector (3.81.0), en un hilo aparte (recortes-tarea.mjs). */
export function recortarEnHilo({ capturas, aprendido }) {
  return new Promise((resolver, rechazar) => {
    const hilo = new Worker(new URL('recortes-tarea.mjs', import.meta.url), { workerData: { capturas, aprendido } });
    hilo.once('message', resolver);
    hilo.once('error', rechazar);
    hilo.once('exit', (codigo) => { if (codigo !== 0) rechazar(new Error(`el hilo de los recortes salió con ${codigo}`)); });
  });
}

/**
 * El `Host` de una petición al lector: 127.0.0.1 o localhost, con o sin
 * puerto. Con `red` (el lector en la tablet, 3.61.0) también una IP privada
 * escrita tal cual: nunca un nombre, que es lo que usa el DNS rebinding.
 */
const IP_PRIVADA = /^(10\.\d{1,3}\.\d{1,3}\.\d{1,3}|192\.168\.\d{1,3}\.\d{1,3}|172\.(1[6-9]|2\d|3[01])\.\d{1,3}\.\d{1,3})(:\d{1,5})?$/;
export const hostPermitido = (h, { red = false } = {}) => typeof h === 'string' && (/^(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(h) || (red && IP_PRIVADA.test(h)));

/**
 * El código de vinculación del lector en la tablet (3.61.0): escucha en la
 * wifi y solo contesta a quien lo lleve en `X-Lector-Codigo`. Comparado en
 * tiempo constante y con tope de intentos fallidos POR APARATO (la IP que
 * llama): tras `FALLOS_CODIGO` en `VENTANA_CODIGO_MS`, ese aparato no entra
 * hasta que pase la ventana, ni con el bueno (así adivinarlo por fuerza
 * bruta no compensa). Por aparato y no global: con un contador global,
 * cualquiera en la wifi dejaba fuera al móvil de Javi con diez códigos
 * malos (revisión de seguridad de 3.61.0). Se recuerdan `APARATOS_MAXIMOS`.
 */
export const FALLOS_CODIGO = 10;
export const VENTANA_CODIGO_MS = 10 * 60 * 1000;
const APARATOS_MAXIMOS = 256;
export function crearPortero(codigo, { ahora = () => Date.now() } = {}) {
  const esperado = Buffer.from(String(codigo ?? ''));
  const fallos = new Map();
  return (dado, aparato = '') => {
    const t = ahora();
    const suyos = (fallos.get(aparato) ?? []).filter((f) => t - f < VENTANA_CODIGO_MS);
    if (suyos.length >= FALLOS_CODIGO) return 'bloqueado';
    // Sin código no se está adivinando nada (3.65.4): es la app del móvil
    // buscando la tablet en la wifi tras un cambio de IP. No cuenta como fallo.
    if (dado == null || String(dado) === '') return 'no';
    const recibido = Buffer.from(String(dado ?? ''));
    const bueno = esperado.length > 0 && recibido.length === esperado.length && timingSafeEqual(recibido, esperado);
    if (!bueno) {
      fallos.delete(aparato);
      fallos.set(aparato, [...suyos, t]);
      if (fallos.size > APARATOS_MAXIMOS) fallos.delete(fallos.keys().next().value);
    }
    return bueno ? 'si' : 'no';
  };
}

/**
 * Lo que la app del móvil manda a la tablet (3.62.0): tu nº1 para la
 * burbuja que la APK pinta sobre el juego, y el resumen de la partida que
 * se acaba de apuntar, que la APK enseña como notificación. Solo texto
 * plano, sin caracteres de control y con tope: la APK lo pinta tal cual.
 */
/** El texto sin caracteres de control y con los espacios juntos. */
export function limpiarTexto(texto, tope = 400) {
  // Los caracteres de control fuera, por su código (la regla de ESLint no deja escribirlos en una expresión).
  const sinControl = [...String(texto ?? '')].map((c) => { const n = c.codePointAt(0); return n < 32 || (n >= 127 && n < 160) ? ' ' : c; }).join('');
  return sinControl.replace(/\s+/g, ' ').trim().slice(0, tope);
}
const textoPlano = (x, tope) => (typeof x === 'string' && limpiarTexto(x) ? limpiarTexto(x).slice(0, tope) : null);
export function sanearConsejo(c) {
  const titulo = textoPlano(c?.titulo, 80);
  return titulo ? { titulo, detalle: textoPlano(c?.detalle, 160) } : null;
}
/**
 * Cómo puede ser un nombre de héroe que llega de fuera (3.72.4): letras
 * latinas, también con tilde, cifras, espacio y . ' & -. Escrito carácter a
 * carácter y NO con las clases de propiedad Unicode (barra-p, «letra»): el Node de la APK (nodejs-mobile) no trae los
 * datos Unicode de esas clases, la expresión no compilaba y servir.mjs no
 * cargaba; Lector MLBB se cerraba nada más empezar a grabar desde 3.70.0.
 */
export const NOMBRE_DE_HEROE = /^[A-Za-z0-9\u00C0-\u00D6\u00D8-\u00F6\u00F8-\u00FF .'&-]+$/;
/** Lo que la app dice de tus ajustes (3.69.3): solo palabras cortas en minúscula; lo valida el modo solo. */
export function sanearAjustes(a) {
  const palabra = (v) => (typeof v === 'string' && /^[a-z]{2,12}$/.test(v) ? v : null);
  const linea = palabra(a?.linea);
  if (!linea) return null;
  // Tu maestría (3.70.0): la tablet decide con ella como la app. Nombres
  // cortos, partidas y winrate con sentido, como mucho MAESTRIA_MAX héroes.
  const maestria = {};
  if (a?.maestria && typeof a.maestria === 'object' && !Array.isArray(a.maestria)) {
    for (const [nombre, m] of Object.entries(a.maestria).slice(0, MAESTRIA_MAX)) {
      if (typeof nombre === 'string' && nombre.length <= 30 && NOMBRE_DE_HEROE.test(nombre) && Number.isInteger(m?.games) && m.games > 0 && m.games < 1e6 && typeof m.winRate === 'number' && m.winRate >= 0 && m.winRate <= 1) {
        maestria[nombre] = { games: m.games, winRate: m.winRate };
      }
    }
  }
  // Tu clave de la base de datos de partidas (3.70.0), si la tienes puesta: la tablet sube con ella lo que apunta.
  const clave = typeof a?.clave === 'string' && /^[A-Za-z0-9_-]{32,64}$/.test(a.clave) ? a.clave : null;
  return { linea, rango: palabra(a?.rango) ?? 'glory', idioma: a?.idioma === 'en' ? 'en' : 'es', ...(Object.keys(maestria).length ? { maestria } : {}), ...(clave ? { clave } : {}) };
}
/** Héroes de la maestría que se aceptan del móvil: los de todas las líneas. */
export const MAESTRIA_MAX = 200;

/**
 * Lo que la tablet sola no reconoció en un draft (3.71.0, `correccionDelDraft`
 * de solo.mjs), para que la APK te lo pregunte. Solo nombres del catálogo,
 * ids de captura con su forma y como mucho `CAPTURAS_A_MIRAR` (las que mira
 * el aprendizaje). null si no tiene forma.
 */
export function sanearCorreccion(c) {
  const nombre = (n) => (typeof n === 'string' && n.length <= 30 && NOMBRE_DE_HEROE.test(n) ? n : null);
  if (!c || typeof c.id !== 'string' || !/^correccion-\d{1,15}$/.test(c.id) || !Number.isFinite(c.cuando)) return null;
  const todas = (Array.isArray(c.ids) ? c.ids : []).filter((id) => typeof id === 'string' && /^lectura-[\w-]+$/.test(id));
  const ids = capturasAMirar(todas);
  const heroes = (Array.isArray(c.heroes) ? c.heroes : []).map(nombre).filter(Boolean).slice(0, 400);
  const huecos = (l) => [0, 1, 2, 3, 4].map((i) => (Array.isArray(l) ? nombre(l[i]) : null));
  if (!ids.length || !heroes.length) return null;
  const l = c.leidos ?? {};
  return {
    id: c.id, cuando: c.cuando, ids, heroes,
    leidos: { enemigos: huecos(l.enemigos), aliados: huecos(l.aliados), tuyoFila: Number.isInteger(l.tuyoFila) && l.tuyoFila >= 0 && l.tuyoFila < 5 ? l.tuyoFila : -1, baneos: (Array.isArray(l.baneos) ? l.baneos : []).map(nombre).filter(Boolean).slice(0, 10) },
    ...(Number.isFinite(c.partida) ? { partida: c.partida } : {}),
    // Tus habituales (3.85.0), para contestar «Tú» con un toque: solo héroes de la lista.
    ...(Array.isArray(c.tuyos) ? { tuyos: c.tuyos.map(nombre).filter((n) => n && heroes.includes(n)).slice(0, 6) } : {}),
  };
}
/**
 * La pregunta de cómo acabó la partida (3.72.5): la tablet sola no reconoció
 * el final (la victoria no viene de serie, o no salió la tabla) y la APK te
 * lo pregunta. Solo id con forma, el instante del draft y el pick como texto.
 */
export function sanearPregunta(p) {
  if (!p || typeof p.id !== 'string' || !/^pregunta-\d{1,15}$/.test(p.id) || !Number.isFinite(p.desde) || !Number.isFinite(p.cuando)) return null;
  const pick = typeof p.pick === 'string' && p.pick.length <= 30 && NOMBRE_DE_HEROE.test(p.pick) ? p.pick : null;
  return { id: p.id, desde: p.desde, cuando: p.cuando, pick };
}
/** Una petición de la propia tablet (la APK): por 127.0.0.1 y sin `Origin`, que un navegador siempre pone. */
export const deLaApk = (req) => !req.headers.origin && ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress ?? '');
export function sanearResumen(r) {
  const titulo = textoPlano(r?.titulo, 80), texto = textoPlano(r?.texto, 300);
  return titulo && texto && typeof r?.id === 'string' && /^[\w-]{1,60}$/.test(r.id) ? { id: r.id, titulo, texto } : null;
}

export const origenPermitido = (o) => !!o && (ORIGENES.includes(o) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o));

export { leerCaptura };

/**
 * La lectura en tres hilos a la vez (3.39.0): baneos, picks enemigos y tu
 * equipo no dependen uno de otro, y el móvil tiene varios núcleos. La
 * captura se decodifica aquí una vez y se comparte sin copiarla. Los hilos
 * se crean al primer toque y viven con el servidor (`cerrar`). Si un hilo
 * falla, esa lectura se hace aquí, entera, y los hilos se vuelven a crear
 * en la siguiente: leer más despacio es mejor que no leer.
 */
export function lectorEnHilos({ caras, registrar = () => {}, tarea = new URL('lectura-tarea.mjs', import.meta.url) }) {
  let hilos = null, siguiente = 0;
  const pendientes = new Map();
  const tirar = (motivo) => {
    for (const h of hilos ?? []) h.terminate().catch(() => {});
    hilos = null;
    for (const { rechazar } of pendientes.values()) rechazar(motivo);
    pendientes.clear();
  };
  const arrancar = () => {
    hilos = PARTES.map(() => {
      const h = new Worker(tarea, { workerData: { caras } });
      h.unref();
      h.on('message', ({ id, resultado, error }) => {
        const p = pendientes.get(id);
        if (!p) return;
        pendientes.delete(id);
        if (error) p.rechazar(new Error(error)); else p.resolver(resultado);
      });
      h.on('error', (e) => tirar(e));
      h.on('exit', (codigo) => { if (codigo !== 0 && hilos) tirar(new Error(`un hilo de lectura salió con ${codigo}`)); });
      return h;
    });
  };
  const pedir = (hilo, mensaje) => new Promise((resolver, rechazar) => {
    const id = ++siguiente;
    pendientes.set(id, { resolver, rechazar });
    hilo.postMessage({ id, ...mensaje });
  });
  return {
    async leer(captura, aprendido = null) {
      // Un PNG, o la imagen ya lista (la captura en crudo, 3.45.0).
      const img = captura?.rgba ? captura : leerPng(captura);
      try {
        if (!hilos) arrancar();
        const pixeles = new SharedArrayBuffer(img.rgba.length);
        new Uint8Array(pixeles).set(img.rgba);
        const [baneos, enemigos, aliados] = await Promise.all(PARTES.map((parte, i) => pedir(hilos[i], { parte, ancho: img.ancho, alto: img.alto, pixeles, aprendido })));
        return juntarLectura(img, { baneos, enemigos, aliados });
      } catch (e) {
        registrar(`Los hilos de lectura fallaron (${String(e?.message ?? e).split('\n')[0]}): leo en uno solo.`);
        tirar(e);
        const [baneos, enemigos, aliados] = PARTES.map((p) => leerParte(img, p, caras, aprendido));
        return juntarLectura(img, { baneos, enemigos, aliados });
      }
    },
    cerrar: () => tirar(new Error('lector cerrado')),
  };
}

/** Capturas seguidas con el minimapa para quitar la burbuja: las mismas que cierran el draft (LECTURAS_EN_PARTIDA). */
export const EN_PARTIDA_PARA_ESCONDER = 2;
/**
 * El reto de la búsqueda en la wifi (3.70.0): la app pregunta `/reto?n=…`
 * SIN el código y solo se lo da a la tablet que demuestra conocerlo con
 * PBKDF2(código, «lector-reto:» + n). Hasta aquí se lo daba a cualquiera que
 * contestara 401 «codigo»: un aparato de la wifi se quedaba con el código (y
 * con 3.70.0, con tu clave de jugador). Las vueltas hacen que adivinar el
 * código a partir de una prueba cueste años: decisión de seguridad, ~50 ms
 * por prueba en la tablet. Y como mucho RETOS_POR_MINUTO por aparato.
 */
export const RETO_VUELTAS = 100000;
export const RETOS_POR_MINUTO = 6;
/**
 * Cada cuánto, como mucho, se echa un vistazo al minimapa con la burbuja
 * puesta y nadie capturando (3.69.3): sin la app leyendo ni el modo solo, la
 * burbuja se quedaba en mitad de la partida. Decisión de producto: dos
 * vistazos son 20 s de burbuja al empezar.
 */
export const VISTAZO_MS = 10000;

/**
 * El servidor, con la captura inyectada: en Termux es `capturarTablet`, en
 * las pruebas una captura de fichero.
 */
/** Lo que vale la fase que dice el modo solo (3.84.0): unas vueltas de draft (1,5 s) o de fuera (12 s). */
export const FASE_VALE_MS = 30000;

export function crearServidor({ capturar, elector = null, caras = carasGuardadas(), carpeta = null, registrar = () => {}, aprendido = null, aprender = aprenderEnHilo, recortar = recortarEnHilo, guardar = guardarAprendido, resultados = null, vigilancia: vigilanciaPedida = VIGILANCIA, ahora = () => Date.now(), maximos = MAX_CAPTURAS, enHilos = true, codigo = null, estadoExtra = null, alCorregir = null, historial = null, claveDeLaTablet = null }) {
  // En la tablet (3.61.0) escucha en la wifi: con código, y aceptando su IP como `Host`.
  const portero = codigo ? crearPortero(codigo, { ahora }) : null;
  // Los retos de cada aparato en el último minuto (3.70.0).
  const retos = new Map();
  // Lo último que mandó la app para la tablet (3.62.0): en memoria, se pierde al reiniciar (la app lo vuelve a mandar).
  let consejoActual = null, resumenActual = null;
  // En qué está la tablet sola (3.84.0): 'draft' o 'fuera', y cuándo lo dijo. La burbuja solo
  // enseña lo pendiente (para tocar) FUERA del draft y de la partida: dentro taparía botones del juego.
  let fase = null, faseEn = 0;
  /** Una fase vale `FASE_VALE_MS`: con el modo solo parado o apartado por el móvil, no se sabe. */
  const faseVigente = () => (fase && ahora() - faseEn <= FASE_VALE_MS ? fase : null);
  // Lo que no reconoció la tablet sola (3.71.0): la APK lo pregunta tras la partida.
  let correccion = null;
  // La corrección contestada antes de apuntar su partida (3.74.3), hasta que el modo solo la recoja.
  let correccionContestada = null;
  // Cómo acabó la partida, si la tablet sola no lo reconoció (3.72.5), y lo que contestaste.
  let pregunta = null, respuesta = null;
  const preguntaVigente = () => (pregunta && ahora() - pregunta.cuando <= RETENCION_CAPTURAS_MS ? pregunta : null);
  const correccionVigente = () => (correccion && ahora() - correccion.cuando <= RETENCION_CAPTURAS_MS ? correccion : null);
  // En partida (3.69.3), la burbuja se quita: tapaba el juego y no tiene nada
  // que decir hasta el draft siguiente. Cuenta las capturas SEGUIDAS con el
  // minimapa (de /leer, del modo solo y de la vigilancia); una que no lo
  // tenga (la tabla del final, el draft siguiente) la devuelve.
  let seguidasEnPartida = 0, ultimaMirada = null;
  const anotarPartida = (si) => { seguidasEnPartida = si ? seguidasEnPartida + 1 : 0; ultimaMirada = ahora(); };
  // Lo último que dijo la app de tu línea, rango e idioma (3.69.3): el modo
  // solo los usa si en la APK no se eligió línea, para que la tablet siga
  // leyendo cuando el móvil se calla. En memoria; en-tablet.mjs lo guarda.
  let ajustesDelMovil = null;
  // El modo solo de la tablet (3.66.0) se aparta cuando el móvil lee o
  // manda su consejo: estos instantes dicen cuándo fue la última vez.
  let ultimaDelMovil = null, consejoDelMovil = null;
  // Lo que no se pida, como siempre (las pruebas encogen solo algunos plazos).
  const vigilancia = { ...VIGILANCIA, ...vigilanciaPedida };
  // El reloj de la vigilancia late al paso más corto; cada parte decide si le toca.
  const latido = Math.min(vigilancia.intervaloMs, vigilancia.intervaloInicioMs, vigilancia.rapidoMs);
  // Las lecturas, en tres hilos a la vez (3.39.0); `enHilos: false` las hace aquí.
  const lector = enHilos ? lectorEnHilos({ caras, registrar }) : null;
  let n = 0, aprendiendo = null;
  // La salud del lector (3.63.0): cuántas lecturas, cuántas capturas fallaron y la última, desde que arrancó.
  const arranque = ahora();
  const salud = { lecturas: 0, lecturasSolo: 0, vistazos: 0, fallosCaptura: 0, ultimoFallo: null };
  resultados = resultados ?? plantillasDeSerie();
  /** Guarda una captura y borra las que ya no hacen falta (3.34.0). */
  // Las del draft que está leyendo el modo solo tampoco (3.81.4): con una lectura cada 1,5 s, las 40 de `MAX_CAPTURAS` son un minuto.
  let delDraft = [];
  // Las capturas que un hilo está leyendo (3.86.4): aprender tarda decenas de segundos y la tablet sigue
  // leyendo cada 1,5 s; la poda se las llevaba a medias («No se pudo aprender: ENOENT», 28 de octubre de 2026).
  const enUso = new Map();
  const usando = async (ids, fn) => {
    for (const id of ids) enUso.set(id, (enUso.get(id) ?? 0) + 1);
    try { return await fn(); } finally { for (const id of ids) { const n = (enUso.get(id) ?? 1) - 1; if (n > 0) enUso.set(id, n); else enUso.delete(id); } }
  };
  const podar = () => { if (carpeta) podarCapturas(carpeta, { ahora: ahora(), maximos, proteger: new Set([...(final?.fotogramas ?? []).map((f) => f.id), ...(correccionVigente()?.ids ?? []), ...delDraft, ...enUso.keys()]) }); };
  const guardarCaptura = (nombre, contenido, { conPoda = true } = {}) => {
    if (!carpeta) return;
    writeFileSync(join(carpeta, nombre), contenido);
    if (conPoda) podar();
  };
  // El final de la partida que se está vigilando (3.33.0): uno a la vez, el del último draft completado.
  let final = null, capturandoFinal = false, relojFinal = null;
  // Lo que dijeron las lecturas de si la tablet estaba en partida (3.46.0).
  const leidas = { fuera: null, dentro: null, seguidas: 0 };
  const hora = (t) => new Date(t).toISOString().slice(11, 19);
  const pararVigilancia = () => { if (relojFinal) clearInterval(relojFinal); relojFinal = null; if (final) final.activa = false; };
  const estadoFinal = () => (final
    ? { desde: final.desde, activa: final.activa, acabada: !!final.acabada, resultado: final.resultado, resultadoId: final.resultadoId, resultadoEn: final.resultadoEn, fotogramas: final.fotogramas, inicio: final.inicio, inicioEstimado: final.inicioEstimado, duracion: final.duracion }
    : { desde: null, activa: false, acabada: false, resultado: null, resultadoId: null, resultadoEn: null, fotogramas: [], inicio: null, inicioEstimado: false, duracion: null });

  /**
   * Dos capturas seguidas con el minimapa: empezó la partida (hacia la mitad
   * entre la anterior y la primera). Solo es un inicio MEDIDO si antes se
   * vio la tablet fuera de partida: si la primera captura ya era de juego
   * (el draft se completó a mano con la partida empezada, o el lector se
   * reinició a mitad), la partida empezó antes y no se sabe cuánto; hasta
   * 3.44.0 eso salía como medido y la duración, minutos corta, se apuntaba.
   */
  const detectarInicio = (f, img, t, intervalo) => {
    if (f.inicio) return;
    if (!enPartida(img)) { f.seguidas = 0; f.vistoFuera = true; return; }
    f.seguidas += 1;
    if (f.seguidas === 1) f.primera = t;
    if (f.seguidas >= 2) {
      f.inicio = f.primera - intervalo / 2;
      f.inicioEstimado = !f.vistoFuera;
      // Visto empezar: se vigila hasta `partidaHastaMin` de partida aunque pase del minuto del draft.
      if (!f.inicioEstimado) f.hasta = Math.max(f.hasta, f.inicio + vigilancia.partidaHastaMin * 60000);
      registrar(`La partida ha empezado hacia las ${hora(f.inicio)}${f.inicioEstimado ? ' o antes (ya estaba en partida al empezar a mirar: inicio estimado)' : ''}.`);
    }
  };
  const vigilarTic = async () => {
    if (!final || !final.activa || capturandoFinal) return;
    // El final que se vigilaba al empezar: si mientras se capturaba llegó un
    // draft nuevo (`/vigilar`), esta captura no es suya (3.37.0).
    const yo = final;
    const t = ahora();
    if (t > final.hasta) {
      pararVigilancia();
      registrar(`Vigilancia del final acabada a los ${Math.round((final.hasta - final.desde) / 60000)} minutos del draft: ${final.fotogramas.length} pantallas distintas${final.resultado ? `, resultado ${final.resultado === 'gane' ? 'ganada' : 'perdida'}` : ', sin ver la tabla de resultado'}.`);
      return;
    }
    const finDelInicio = final.desde + vigilancia.desdeMin * 60000;
    // Sin el inicio visto al llegar a la vigilancia del final, se estima.
    if (!final.inicio && t >= finDelInicio) {
      final.inicio = final.desde + vigilancia.inicioEstimadoMin * 60000;
      final.inicioEstimado = true;
      registrar(`No he visto empezar la partida: la doy por empezada hacia las ${hora(final.inicio)} (estimado).`);
    }
    if (t < finDelInicio) {
      // Buscando el inicio: una captura cada `intervaloInicioMs`, solo para mirar el minimapa (no se guarda).
      if (final.inicio || t < final.desde + vigilancia.inicioDesdeMin * 60000 || t - final.ultimaInicio < vigilancia.intervaloInicioMs) return;
      final.ultimaInicio = t;
      capturandoFinal = true;
      try {
        const png = await capturar();
        if (final !== yo) return;
        const imgInicio = leerPng(png);
        anotarPartida(enPartida(imgInicio));
        detectarInicio(final, imgInicio, t, vigilancia.intervaloInicioMs);
      } catch (e) {
        if (final === yo && !final.fallosInicio++) registrar(`Buscando el inicio de la partida no consigo la captura (${String(e.message).split('\n')[0]}): sigo intentándolo.`);
      } finally { capturandoFinal = false; }
      return;
    }
    if (!tocaCapturarFinal(final, t, vigilancia, latido)) return;
    final.ultimaFinal = t;
    capturandoFinal = true;
    try {
      let png;
      try { png = await capturar(); } catch (e) {
        if (final !== yo) return;
        final.fallos += 1;
        if (final.fallos === 1) registrar(`Vigilando el final no consigo la captura (${String(e.message).split('\n')[0]}): sigo intentándolo.`);
        return;
      }
      if (final !== yo) return;
      const img = leerPng(png);
      const dentro = enPartida(img);
      anotarPartida(dentro);
      // Deja de verse el minimapa: ha acabado (o un menú encima). A mirar deprisa.
      if (final.enJuego && !dentro && !(final.rafagaHasta > t)) {
        final.rafagaHasta = t + vigilancia.rafagaMs;
        registrar(`Sin minimapa a los ${Math.round((t - final.desde) / 60000)} minutos del draft: miro la pantalla cada ${vigilancia.rapidoMs / 1000} s para ver la tabla del final.`);
      }
      final.enJuego = dentro;
      detectarInicio(final, img, t, vigilancia.intervaloMs);
      const f = fotogramaDe(img, final.anterior);
      final.anterior = f.pequena;
      if (!f.cambio) return;
      const id = `fotograma-${new Date(t).toISOString().replace(/[:.]/g, '-')}`;
      // Se poda DESPUÉS de decidir qué pantallas se quedan: así no se borra
      // la que acaba de entrar ni se guarda la que acaba de salir.
      guardarCaptura(`${id}.png`, png, { conPoda: false });
      const leido = reconocerResultado(tiraDe(img), resultados);
      // El marcador a resolución completa, para aprender sus dígitos (3.44.0): solo en partida.
      const marcador = !leido.tabla && dentro ? recorteMarcador(img) : null;
      // Las de la ráfaga (3.90.3) son las del final de verdad: la explosión, la tabla, el rango.
      const rafaga = final.rafagaHasta > t;
      const foto = { id, minuto: Math.round((t - final.desde) / 60000), miniatura: f.miniatura, tira: f.tira, ...(marcador ? { marcador } : {}), ...(rafaga ? { rafaga: true } : {}), tabla: leido.tabla, resultado: leido.resultado, resultadoParecido: Math.round(leido.parecido * 1000) / 1000 };
      // Hasta `maxFotogramas` pantallas distintas; la de la TABLA viaja
      // siempre, reconozca o no la palabra (sustituye a la última que no sea
      // tabla). Hasta 3.36.0 solo entraba con la palabra reconocida, y la de
      // VICTORIA, que no tiene plantilla de serie, se perdía en cuanto había
      // ocho pantallas: no se podía aprender nunca.
      // Y desde 3.40.0 se quedan las ÚLTIMAS: la nueva saca a la más vieja que
      // no sea tabla. Quedándose las primeras, las ocho eran pantallas de
      // juego de los minutos 8 y 9 (15 de 15 incidencias desde 3.33.0) y las
      // del final (rango, MVP, estadísticas) no entraban nunca.
      // Y desde 3.90.3 una de después de la ráfaga (el vestíbulo, 20 minutos
      // más tarde) no saca a una de la ráfaga: el 4 de noviembre de 2026 las
      // pantallas del vestíbulo se llevaron las del final, y no se pudo ver por
      // qué no se reconoció la tabla.
      if (final.fotogramas.length >= vigilancia.maxFotogramas) {
        const sale = (x) => !x.tabla && (rafaga || !x.rafaga);
        const i = final.fotogramas.findIndex(sale);
        if (i >= 0) final.fotogramas.splice(i, 1);
        else if (!leido.tabla) { podar(); return; }
        else final.fotogramas.shift();
      }
      final.fotogramas.push(foto);
      // La primera tabla: la partida ha acabado, gane o pierda, y aunque la
      // palabra no tenga plantilla (la de victoria se aprende): cuánto duró
      // (3.44.0) y lo que el modelo daba para ESE final. Y se deja de mirar a
      // los dos minutos (las pantallas de después), sin pasar del límite.
      if (leido.tabla) final.acabada = true;
      if (leido.tabla && final.duracion == null && final.inicio) {
        final.duracion = Math.round(((t - final.inicio) / 60000) * 10) / 10;
        final.hasta = Math.min(final.hasta, Math.max(final.desde + vigilancia.hastaMin * 60000, t + 2 * 60000));
        registrar(`Partida de unos ${final.duracion} minutos${final.inicioEstimado ? ' (inicio estimado: no se apunta)' : ''}.`);
      }
      if (leido.resultado && !final.resultado) Object.assign(final, { resultado: leido.resultado, resultadoId: id, resultadoEn: t });
      podar();
      registrar(`Fotograma ${id} (minuto ${foto.minuto}): la pantalla ha cambiado${leido.tabla ? ` · tabla de resultado: ${leido.resultado ? (leido.resultado === 'gane' ? 'VICTORIA' : 'DERROTA') : 'palabra sin plantilla'} (${leido.parecido.toFixed(2)})` : ''}.`);
      // Con el resultado leído la partida ha acabado: seguir capturando cada
      // `intervaloMs` hasta el minuto 25 era gastar batería en el móvil (y en
      // las pruebas, con capturas cada 200 ms, ahogaba al propio proceso).
      if (leido.resultado) {
        pararVigilancia();
        registrar('Resultado leído: dejo de vigilar el final.');
      }
    } catch (e) {
      registrar(`Un fotograma del final no se pudo leer: ${e.message}`);
    } finally { capturandoFinal = false; }
  };
  /** Empieza (o sigue, si es el mismo draft) a vigilar el final del draft completado en `desde`. */
  /** Los drafts viejos que alguien pidió vigilar y no se vigilan (para decirlo una vez). */
  const ignoradas = new Set();
  const vigilar = (desde) => {
    if (final?.desde === desde) return final;
    // Nunca hacia atrás (3.86.3): el 28 de octubre de 2026 el móvil, con su draft viejo abierto, volvía
    // a mandar vigilar cada vez que `/final` no era el suyo, y la tablet y él se quitaban la partida.
    if (final && Number.isFinite(final.desde) && desde < final.desde) {
      if (!ignoradas.has(desde)) { ignoradas.add(desde); registrar(`No vuelvo a vigilar el draft de las ${hora(desde)}: ya vigilo uno más nuevo (${hora(final.desde)}).`); }
      return final;
    }
    pararVigilancia();
    final = { desde, hasta: desde + vigilancia.hastaMin * 60000, activa: true, fotogramas: [], resultado: null, resultadoId: null, resultadoEn: null, anterior: null, fallos: 0, vistoFuera: false, acabada: false, inicio: null, inicioEstimado: false, seguidas: 0, primera: null, ultimaInicio: 0, fallosInicio: 0, duracion: null, ultimaFinal: 0, enJuego: false, rafagaHasta: 0 };
    if (ahora() > final.hasta) { final.activa = false; return final; }
    relojFinal = setInterval(vigilarTic, latido);
    relojFinal.unref?.();
    registrar(`Draft completo a las ${hora(desde)}: busco el inicio de la partida desde el minuto ${vigilancia.inicioDesdeMin} y vigilo el final del minuto ${vigilancia.desdeMin} al ${vigilancia.hastaMin}.`);
    // La partida ya empezó y las lecturas la vieron empezar (3.46.0).
    const { fuera, dentro, seguidas } = leidas;
    if (seguidas >= LECTURAS_EN_PARTIDA && fuera != null && dentro > fuera && dentro - fuera <= HUECO_MAXIMO_LECTURAS_MS
      && dentro >= desde - MINUTOS_DEL_INICIO_LEIDO * 60000 && dentro <= ahora()) {
      final.inicio = (fuera + dentro) / 2;
      final.vistoFuera = true;
      final.hasta = Math.max(final.hasta, final.inicio + vigilancia.partidaHastaMin * 60000);
      registrar(`La partida empezó hacia las ${hora(final.inicio)} (lo vieron las lecturas del draft).`);
    }
    return final;
  };
  /** Cómo va el lector (`/estado`; desde 3.74.0 también el parte de salud que sube la tablet). */
  const estado = () => ({ ok: true, version: VERSION_PUENTE, aprendido: { capturas: aprendido?.capturas ?? 0, caras: Object.keys(aprendido?.caras ?? {}).length, aliados: Object.keys(aprendido?.aliados ?? {}).length, picks: !!aprendido?.picks }, resultados: { gane: resultados.gane.length, perdi: resultados.perdi.length, tablas: resultados.tablas.length }, lector: { minutos: Math.round((ahora() - arranque) / 60000), ...salud, memoriaMB: Math.round(process.memoryUsage().rss / 1e6) }, pendiente: { correccion: !!correccionVigente(), pregunta: !!preguntaVigente(), vigilando: !!final?.activa }, ...(typeof estadoExtra === 'function' ? estadoExtra() : estadoExtra ?? {}) });
  const leerCuerpo = (req, maximo = 65536) => new Promise((resolver) => {
    const trozos = [];
    // Demasiado grande: se corta y se contesta como cuerpo malo (sin el
    // `resolver`, la promesa quedaba colgada para siempre por petición).
    req.on('data', (t) => { trozos.push(t); if (trozos.reduce((s, x) => s + x.length, 0) > maximo) { resolver(null); req.destroy(); } });
    req.on('end', () => { try { resolver(JSON.parse(Buffer.concat(trozos).toString('utf8'))); } catch { resolver(null); } });
    req.on('error', () => resolver(null));
  });
  /** Guarda la verdad junto a cada captura nombrada y aprende de las últimas (una tanda a la vez). */
  const corregir = async ({ ids, enemigos, baneos, aliados, tuyo }) => {
    if (!carpeta) return { aprendido: false, motivo: 'sin carpeta de capturas' };
    const nombres = (l) => (Array.isArray(l) ? l.filter((x) => typeof x === 'string').slice(0, 10).map((x) => x.slice(0, 40)) : []);
    // Tu equipo y tu pick (3.58.0): para aprender las caras de tus compañeros con sus skins.
    const verdad = { enemigos: nombres(enemigos).slice(0, 5), baneos: nombres(baneos), aliados: nombres(aliados).slice(0, 4), tuyo: typeof tuyo === 'string' ? tuyo.slice(0, 40) : null, cuando: new Date().toISOString() };
    const validos = (Array.isArray(ids) ? ids : []).filter((id) => /^lectura-[\w-]+$/.test(id) && existsSync(join(carpeta, `${id}.png`)));
    for (const id of validos) writeFileSync(join(carpeta, `${id}.verdad.json`), JSON.stringify(verdad));
    const pares = capturasAMirar(validos).map((id) => ({ id, png: join(carpeta, `${id}.png`), verdad }));
    if (!pares.length || !verdad.enemigos.length) return { aprendido: false, motivo: 'nada que cruzar' };
    return usando(pares.map((p) => p.id), () => corregirCon(pares, verdad));
  };
  const corregirCon = async (pares, verdad) => {
    // `while` y no `if` (3.60.4): con tres correcciones a la vez, las dos que
    // esperaban arrancaban juntas sobre el mismo `aprendido` y una pisaba a la otra.
    while (aprendiendo) await aprendiendo.catch(() => {});
    registrar(`Corrección recibida (${verdad.enemigos.length} enemigos, ${verdad.baneos.length} baneos): aprendiendo de ${pares.length} capturas…`);
    aprendiendo = aprender({ pares, aprendido }).then((r) => {
      aprendido = r.aprendido;
      guardar(aprendido);
      for (const l of resumirAprendizaje(r)) registrar(l);
      return r;
    }).finally(() => { aprendiendo = null; });
    const r = await aprendiendo;
    // Con los recortes de los picks (3.52.0): la app los sube a la incidencia de pantallas para medir.
    return { aprendido: true, aprendidos: r.informe.flatMap((l) => [...l.aprendidos.map((a) => a.nombre), ...(l.aliados?.aprendidos ?? [])]), sinEncontrar: r.informe.flatMap((l) => l.sinEncontrar.map((x) => x.nombre)), recortes: Array.isArray(r.recortes) ? r.recortes : [] };
  };
  /**
   * Una lectura de la pantalla (3.66.0, antes dentro de `/leer`): la piden la
   * app del móvil por `/leer` y el modo solo de la tablet. Con `rapida`, en
   * partida no reconoce caras. Devuelve `{ ok, lectura }` o `{ ok: false, estado, error }`.
   */
  async function hacerLectura({ rapida = false, soloPartida = false, delSolo = false } = {}) {
    const t0 = Date.now();
    // El instante de la lectura en el reloj de la vigilancia (inyectable en las pruebas).
    const tLeida = ahora();
    // Un vistazo al minimapa (3.69.3) no es una lectura: no cuenta como que alguien lee.
    // Las del modo solo van aparte (3.74.3): la APK mira `lecturas` para saber si el MÓVIL lee.
    if (soloPartida) salud.vistazos += 1; else if (delSolo) salud.lecturasSolo += 1; else salud.lecturas += 1;
    // Comprimida o no (3.45.0, `crearElectorDeCaptura`); sin elector, comprimida como siempre.
    let formato = elector?.siguiente() ?? 'png', png = null, crudo = null, tFormato = t0, t1;
    try {
      try {
        if (formato === 'crudo') crudo = leerCrudo(await capturar({ crudo: true }));
      } catch (e) {
        // ¿La crudo o la tablet? Se prueba la comprimida: si sale, es la
        // crudo la que no vale aquí; si tampoco, es la tablet (y la crudo
        // no se descarta por eso).
        registrar(`La captura sin comprimir falló (${String(e.message).split('\n')[0]}): pruebo la comprimida.`);
        formato = 'png'; tFormato = Date.now();
        png = await capturar();
        elector?.descartar(e.message);
        registrar('La captura sin comprimir no vale con esta tablet: sigo con la comprimida hasta que reinicies el lector.');
      }
      if (formato === 'png' && !png) png = await capturar();
    } catch (e) {
      registrar(`No se pudo hacer la captura: ${String(e.message).split('\n')[0]}`);
      salud.fallosCaptura += 1;
      salud.ultimoFallo = { cuando: ahora(), que: String(e.message).split('\n')[0].slice(0, 160) };
      return { ok: false, estado: 502, error: FALLOS_DE_CAPTURA.includes(e?.tipo) ? e.tipo : 'captura' };
    }
    try {
      n += 1;
      const id = `lectura-${new Date().toISOString().replace(/[:.]/g, '-')}-${n}`;
      t1 = Date.now();
      const img = crudo ?? leerPng(png);
      // Lo que costó tener la imagen con este formato (captura + descomprimir): eso decide cuál va antes.
      const elegido = elector?.anotar(formato, Date.now() - tFormato);
      if (elegido) {
        const { crudo: mc, png: mp } = elector.estado();
        registrar(`Captura ${elegido === 'crudo' ? 'SIN comprimir' : 'comprimida'}: es la más rápida en tu tablet (mediana sin comprimir ${(mc / 1000).toFixed(1)} s, comprimida ${(mp / 1000).toFixed(1)} s).`);
      }
      // ¿Ya en partida? (3.46.0): con esto la app cierra un draft a medias y el inicio se mide.
      const partida = enPartida(img);
      anotarPartida(partida);
      if (partida) { leidas.seguidas += 1; if (leidas.seguidas === 1) leidas.dentro = tLeida; } else { leidas.fuera = tLeida; leidas.dentro = null; leidas.seguidas = 0; }
      // Rápida (3.66.0): en partida el modo solo solo pregunta si sigue en
      // partida (el minimapa, 13 ms); reconocer caras entonces podría meter lag.
      if (soloPartida || (rapida && partida)) return { ok: true, lectura: { version: VERSION_PUENTE, partida, rapida: true } };
      const leido = lector ? await lector.leer(img, aprendido) : leerCaptura(img, caras, aprendido);
      // `ms` es lo que espera la app; `msCaptura`, lo que tardó la tablet en dar la imagen (3.39.0), y con qué formato (3.45.0).
      const lectura = { version: VERSION_PUENTE, id, ...leido, partida, ms: Date.now() - t0, msCaptura: t1 - tFormato, formato };
      if (carpeta) {
        writeFileSync(join(carpeta, `${id}.json`), JSON.stringify(lectura, null, 1));
        // El aprendizaje lee PNG: la crudo se comprime aparte, sin parar al lector.
        if (png) guardarCaptura(`${id}.png`, png);
        else escribirPngRapido(img).then((b) => guardarCaptura(`${id}.png`, b)).catch((e) => registrar(`No se pudo guardar la captura ${id}: ${e.message}`));
      }
      // Un «?» dice a qué se quedó más cerca: con eso se afina sin pedir la captura.
      const nombres = (l) => l.map((x) => x.nombre ?? (x.candidato ? `?(${x.candidato} ${x.parecido.toFixed(2)})` : '?')).join(', ');
      registrar(`Lectura ${n} (${lectura.ms} ms, captura ${formato === 'crudo' ? 'sin comprimir' : 'comprimida'} ${lectura.msCaptura}): baneos ${nombres([...lectura.tuyos, ...lectura.suyos])} · enemigos ${nombres(lectura.enemigos)} · tu equipo ${nombres(lectura.aliados)} · tú ${lectura.tuyo ?? (lectura.tuyoFila >= 0 ? '?' : 'sin fila amarilla')}`);
      return { ok: true, lectura };
    } catch (e) {
      registrar(`La captura no se pudo leer: ${e.message}`);
      return { ok: false, estado: 500, error: 'formato' };
    }
  }

  const servidor = createServer(async (req, res) => {
    const origen = req.headers.origin;
    const cabeceras = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
    // Solo peticiones dirigidas a ESTE aparato (3.40.0): con otro `Host` es
    // una web que ha hecho apuntar su dominio a 127.0.0.1 (DNS rebinding).
    if (!hostPermitido(req.headers.host, { red: !!portero })) {
      res.writeHead(403, cabeceras).end(JSON.stringify({ error: 'host no permitido' }));
      return;
    }
    if (origen) {
      if (!origenPermitido(origen)) {
        res.writeHead(403, cabeceras).end(JSON.stringify({ error: 'origen no permitido' }));
        return;
      }
      cabeceras['Access-Control-Allow-Origin'] = origen;
    }
    if (req.method === 'OPTIONS') {
      // Comprobación previa (CORS y red privada): sí, pero solo para GET.
      res.writeHead(204, { ...cabeceras, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type, X-Lector-Codigo', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Max-Age': '600' }).end();
      return;
    }
    if (portero && req.method === 'GET' && new URL(req.url, 'http://127.0.0.1').pathname === '/reto') {
      const n = new URL(req.url, 'http://127.0.0.1').searchParams.get('n') ?? '';
      if (!/^[0-9a-f]{32}$/.test(n)) { res.writeHead(400, cabeceras).end(JSON.stringify({ error: 'reto' })); return; }
      const quien = req.socket.remoteAddress ?? '';
      const t = ahora();
      const suyos = (retos.get(quien) ?? []).filter((x) => t - x < 60000);
      if (suyos.length >= RETOS_POR_MINUTO) { res.writeHead(429, cabeceras).end(JSON.stringify({ error: 'bloqueado' })); return; }
      retos.set(quien, [...suyos, t]);
      pbkdf2(codigo, `lector-reto:${n}`, RETO_VUELTAS, 32, 'sha256', (e, clave) => {
        if (e) { res.writeHead(500, cabeceras).end(JSON.stringify({ error: 'reto' })); return; }
        res.writeHead(200, cabeceras).end(JSON.stringify({ prueba: clave.toString('hex') }));
      });
      return;
    }
    if (portero) {
      const r = portero(req.headers['x-lector-codigo'], req.socket.remoteAddress ?? '');
      if (r !== 'si') { res.writeHead(r === 'bloqueado' ? 429 : 401, cabeceras).end(JSON.stringify({ error: r === 'bloqueado' ? 'bloqueado' : 'codigo' })); return; }
    }
    const ruta = new URL(req.url, 'http://127.0.0.1').pathname;
    if (req.method === 'GET' && ruta === '/estado') {
      res.writeHead(200, cabeceras).end(JSON.stringify(estado()));
      return;
    }
    if (req.method === 'POST' && ruta === '/vigilar') {
      // El draft se ha completado (3.33.0): desde ahora el lector vigila el final por su cuenta. Solo a la app.
      if (!origen) { res.writeHead(403, cabeceras).end(JSON.stringify({ error: 'origen no permitido' })); return; }
      const cuerpo = await leerCuerpo(req);
      const desde = Number(cuerpo?.desde), t = ahora();
      // Un instante del reloj del móvil, reciente: ni futuro ni de hace más de un día.
      if (!Number.isFinite(desde) || desde > t + 60000 || desde < t - 24 * 3600000) { res.writeHead(400, cabeceras).end(JSON.stringify({ error: 'desde' })); return; }
      vigilar(desde);
      res.writeHead(200, cabeceras).end(JSON.stringify(estadoFinal()));
      return;
    }
    if (req.method === 'POST' && ruta === '/consejo') {
      // La app manda tu nº1 y el resumen de la partida (3.62.0). Solo la app.
      if (!origen) { res.writeHead(403, cabeceras).end(JSON.stringify({ error: 'origen no permitido' })); return; }
      const cuerpo = await leerCuerpo(req);
      if (!cuerpo || typeof cuerpo !== 'object') { res.writeHead(400, cabeceras).end(JSON.stringify({ error: 'cuerpo' })); return; }
      if ('consejo' in cuerpo) { consejoActual = sanearConsejo(cuerpo.consejo); consejoDelMovil = ahora(); }
      if ('ajustes' in cuerpo) {
        const a = sanearAjustes(cuerpo.ajustes);
        // `cuando`: lo que la tablet apunte DESPUÉS no está en esa maestría y se le suma.
        if (a) ajustesDelMovil = { ...a, cuando: ahora() };
      }
      if ('resumen' in cuerpo) resumenActual = sanearResumen(cuerpo.resumen) ?? resumenActual;
      res.writeHead(200, cabeceras).end(JSON.stringify({ ok: true }));
      return;
    }
    // La clave con la que la tablet guarda tus partidas (3.76.0): la pide la app del móvil
    // vinculada (con el código) para usar la MISMA y ver y arreglar lo mismo. Solo la app.
    if (req.method === 'GET' && ruta === '/clave') {
      if (!origen || !portero) { res.writeHead(403, cabeceras).end(JSON.stringify({ error: 'solo la app vinculada' })); return; }
      const clave = claveDeLaTablet?.() ?? null;
      res.writeHead(clave ? 200 : 404, cabeceras).end(JSON.stringify(clave ? { clave } : { error: 'sin clave' }));
      return;
    }
    if (req.method === 'GET' && ruta === '/consejo') {
      // Solo la APK (3.86.1): la app del móvil escribe el consejo, no lo lee.
      if (!deLaApk(req)) { res.writeHead(403, cabeceras).end(JSON.stringify({ error: 'solo la tablet' })); return; }
      // Lo lee la APK de la tablet (3.62.0) para la burbuja y la notificación: sin `Origin`, desde 127.0.0.1 y con el código.
      // En partida, sin consejo: la APK quita la burbuja (también una de antes de 3.69.3).
      const escondida = seguidasEnPartida >= EN_PARTIDA_PARA_ESCONDER;
      // Lo pendiente (3.84.0): solo si hay, para que la burbuja lo ofrezca fuera del draft y de la partida.
      // Desde 3.89.0 solo la pregunta del resultado: «quién era» no se ofrece entre partida y partida
      // (no da tiempo); queda en la tarjeta de la APK y se revisa de golpe en «Capturas».
      // Y mientras se vigila el final de una partida ya empezada (3.99.0), ni burbuja ni botón: la
      // grabación de la pantalla los coge, y el botón «¿Cómo acabó?» caía encima de la tabla del final.
      const alFinal = !!final?.activa && final.inicio != null;
      const pendiente = { pregunta: !!preguntaVigente() && !alFinal, correccion: false };
      res.writeHead(200, cabeceras).end(JSON.stringify({ consejo: escondida || alFinal ? null : consejoActual, resumen: resumenActual, enPartida: escondida, fase: escondida ? 'partida' : faseVigente(), pendiente }));
      return;
    }
    if (req.method === 'GET' && ruta === '/final') {
      // Lo vigilado hasta ahora: fotogramas (reducidos) y resultado, si lo hay. Solo a la app: lleva imágenes.
      if (!origen) { res.writeHead(403, cabeceras).end(JSON.stringify({ error: 'origen no permitido' })); return; }
      res.writeHead(200, cabeceras).end(JSON.stringify(estadoFinal()));
      return;
    }
    // `/captura` (3.29.0, una pantalla reducida a petición) se quitó en 3.40.0:
    // la app ya no la pedía desde que vigila el lector (3.33.0) y daba una
    // imagen de la tablet a cualquier programa del móvil que pusiera la
    // cabecera `Origin` (fuera de un navegador se pone la que se quiera).
    if (req.method === 'POST' && ruta === '/resultado') {
      // Lo que contestó Javi (Gané / Perdí), o lo que apuntó la app sola. Desde 3.99.0 ya no
      // se aprende la palabra de la tabla (las plantillas son fijas): solo deja de vigilar esa partida.
      if (!origen) { res.writeHead(403, cabeceras).end(JSON.stringify({ error: 'origen no permitido' })); return; }
      const cuerpo = await leerCuerpo(req);
      // Apuntada en la app (3.44.1): esa partida ha acabado aunque no se viera
      // la tabla; seguir mirando era gastar batería.
      if (cuerpo && typeof cuerpo.gane === 'boolean' && final && Number.isFinite(cuerpo.desde) && cuerpo.desde === final.desde && !final.acabada) {
        final.acabada = true;
        pararVigilancia();
        registrar('Partida apuntada en la app: dejo de vigilarla.');
      }
      if (!cuerpo || typeof cuerpo.gane !== 'boolean') { res.writeHead(400, cabeceras).end(JSON.stringify({ error: 'falta gane' })); return; }
      res.writeHead(200, cabeceras).end(JSON.stringify({ ok: true, aprendidos: 0 }));
      return;
    }
    if (req.method === 'POST' && ruta === '/corregir') {
      // Solo con el origen de la app: sin cabecera Origin no se escribe nada.
      if (!origen) { res.writeHead(403, cabeceras).end(JSON.stringify({ error: 'origen no permitido' })); return; }
      const cuerpo = await leerCuerpo(req);
      if (!cuerpo) { res.writeHead(400, cabeceras).end(JSON.stringify({ error: 'cuerpo' })); return; }
      try {
        // El resultado ANTES de la cabecera (3.52.0): con `writeHead(200)` delante
        // del `await`, un aprendizaje que fallaba intentaba contestar 500 con la
        // cabecera ya enviada y el lector entero se caía.
        const r = await corregir(cuerpo);
        res.writeHead(200, cabeceras).end(JSON.stringify(r));
      } catch (e) {
        registrar(`No se pudo aprender: ${e.message}`);
        res.writeHead(500, cabeceras).end(JSON.stringify({ error: 'aprender' }));
      }
      return;
    }
    // Enseñar al lector desde la tablet (3.71.0): la APK pregunta quién era el
    // «?» y manda tu respuesta. Solo la APK (127.0.0.1, sin Origin, con el código).
    if (ruta === '/correccion' && (req.method === 'GET' || req.method === 'POST')) {
      if (!deLaApk(req)) { res.writeHead(403, cabeceras).end(JSON.stringify({ error: 'solo la tablet' })); return; }
      const c = correccionVigente();
      if (req.method === 'GET') {
        res.writeHead(200, cabeceras).end(JSON.stringify({ correccion: c ? { id: c.id, cuando: c.cuando, leidos: c.leidos, heroes: c.heroes, tuyos: c.tuyos ?? [] } : null }));
        return;
      }
      const cuerpo = await leerCuerpo(req);
      // Otra vez tras leer el cuerpo: entretanto pudo contestarla otra petición o llegar otra corrección.
      if (!c || correccionVigente() !== c || cuerpo?.id !== c.id) { res.writeHead(409, cabeceras).end(JSON.stringify({ error: 'ya no hay esa corrección' })); return; }
      if (cuerpo.descartar === true) { correccion = null; registrar('Corrección descartada en la tablet.'); res.writeHead(200, cabeceras).end(JSON.stringify({ ok: true })); return; }
      // Solo héroes del catálogo, sin repetir, como mucho cinco enemigos y cuatro compañeros.
      const porClave = new Map(c.heroes.map((h) => [nombreClave(h), h]));
      const lista = (l) => (Array.isArray(l) ? l : []).filter((x) => typeof x === 'string' && x.trim()).map((x) => porClave.get(nombreClave(x)));
      const enemigos = lista(cuerpo.enemigos), aliados = lista(cuerpo.aliados);
      const tuyo = typeof cuerpo.tuyo === 'string' && cuerpo.tuyo.trim() ? porClave.get(nombreClave(cuerpo.tuyo)) : null;
      const todos = [...enemigos, ...aliados, ...(tuyo !== null ? [tuyo] : [])];
      if (todos.some((x) => !x) || enemigos.length > 5 || aliados.length > 4 || new Set(todos).size !== todos.length || !enemigos.length) {
        res.writeHead(400, cabeceras).end(JSON.stringify({ error: 'héroes' }));
        return;
      }
      correccion = null;
      // Contestada antes de que se apunte la partida (3.74.3): se guarda y el modo solo la aplica al apuntarla.
      if (!Number.isFinite(c.partida)) correccionContestada = { cuando: c.cuando, enemigos, aliados, tuyo };
      // La partida apuntada se arregla aunque aprender falle: lo que dices es la verdad igual.
      try { alCorregir?.({ partida: c.partida ?? null, enemigos, aliados, tuyo }); } catch (e) { registrar(`No se pudo arreglar la partida apuntada: ${e.message}`); }
      try {
        const r = await corregir({ ids: c.ids, enemigos, baneos: c.leidos.baneos, aliados, tuyo });
        res.writeHead(200, cabeceras).end(JSON.stringify(r));
      } catch (e) {
        registrar(`No se pudo aprender: ${e.message}`);
        res.writeHead(500, cabeceras).end(JSON.stringify({ error: 'aprender' }));
      }
      return;
    }
    // ¿Cómo acabó la partida? (3.72.5) La APK lo pregunta si la tablet sola no
    // lo reconoció, y con la respuesta se apunta y se aprende la tabla. Solo la APK.
    // Tus partidas (3.75.0): la APK las enseña como están en la base de datos y
    // te deja arreglarlas (resultado, tu pick, quién iba en cada equipo). Solo la APK.
    if ((ruta === '/partidas' && req.method === 'GET') || (ruta === '/partida' && req.method === 'POST')) {
      if (!deLaApk(req)) { res.writeHead(403, cabeceras).end(JSON.stringify({ error: 'solo la tablet' })); return; }
      if (!historial) { res.writeHead(404, cabeceras).end(JSON.stringify({ error: 'no existe' })); return; }
      if (req.method === 'GET') { res.writeHead(200, cabeceras).end(JSON.stringify(await historial.listar())); return; }
      const r = historial.editar(await leerCuerpo(req));
      res.writeHead(r.ok ? 200 : r.estado ?? 400, cabeceras).end(JSON.stringify(r));
      return;
    }
    if (ruta === '/pregunta' && (req.method === 'GET' || req.method === 'POST')) {
      if (!deLaApk(req)) { res.writeHead(403, cabeceras).end(JSON.stringify({ error: 'solo la tablet' })); return; }
      const p = preguntaVigente();
      if (req.method === 'GET') { res.writeHead(200, cabeceras).end(JSON.stringify({ pregunta: p ? { id: p.id, pick: p.pick } : null })); return; }
      const cuerpo = await leerCuerpo(req);
      if (!p || preguntaVigente() !== p || cuerpo?.id !== p.id) { res.writeHead(409, cabeceras).end(JSON.stringify({ error: 'ya no hay esa pregunta' })); return; }
      if (!(cuerpo.gane === true || cuerpo.gane === false || cuerpo.gane === null)) { res.writeHead(400, cabeceras).end(JSON.stringify({ error: 'gane' })); return; }
      pregunta = null;
      respuesta = { id: p.id, desde: p.desde, gane: cuerpo.gane, cuando: ahora() };
      if (typeof cuerpo.gane === 'boolean' && final?.desde === p.desde) {
        // Esa partida ha acabado: se deja de vigilar.
        final.acabada = true;
        pararVigilancia();
      }
      registrar(`Contestado en la tablet: ${cuerpo.gane === null ? 'la partida no contó' : cuerpo.gane ? 'ganada' : 'perdida'}.`);
      res.writeHead(200, cabeceras).end(JSON.stringify({ ok: true, aprendidos: 0 }));
      return;
    }
    if (req.method === 'GET' && ruta === '/leer') {
      // La app del móvil está leyendo (3.66.0): el modo solo de la tablet se aparta.
      ultimaDelMovil = ahora();
      const r = await hacerLectura();
      res.writeHead(r.ok ? 200 : r.estado, cabeceras).end(JSON.stringify(r.ok ? r.lectura : { error: r.error }));
      return;
    }
    res.writeHead(404, cabeceras).end(JSON.stringify({ error: 'no existe' }));
  });
  // La app leyendo sola pide cada 5 s y reutiliza la conexión; con el cierre
  // de Node a los 5 s de inactividad, cada toque caía justo cuando el lector
  // cerraba el socket (ECONNRESET, visto en las pruebas con el bucle ocupado).
  servidor.keepAliveTimeout = 65000;
  // Para el modo solo de la tablet (3.66.0), en el mismo proceso: leer como
  // `/leer`, saber si el móvil anda leyendo y poner el consejo de la burbuja
  // (que no pisa al del móvil: lo que manda la app manda).
  servidor.interno = {
    leer: (opciones) => hacerLectura({ ...opciones, delSolo: true }),
    delMovil: () => ({ leyo: ultimaDelMovil, consejo: consejoDelMovil }),
    ponerConsejo: (c) => { consejoActual = sanearConsejo(c); },
    ajustesDelMovil: () => ajustesDelMovil,
    // Lo que usa el modo solo para apuntar la partida él (3.70.0).
    vigilar: (desde) => vigilar(desde),
    final: () => estadoFinal(),
    ponerResumen: (r) => { resumenActual = sanearResumen(r) ?? resumenActual; },
    // Lo que no reconoció (3.71.0), para preguntarlo en la APK.
    ponerCorreccion: (c) => { correccion = sanearCorreccion(c); },
    ponerFase: (f) => { if (f === null || f === 'draft' || f === 'fuera' || f === 'partida') { fase = f; faseEn = ahora(); } },
    /** Las capturas del draft abierto (3.81.4), para que la poda no se las lleve: solo ids con forma, como mucho las de un draft. */
    protegerLecturas: (ids) => { delDraft = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && /^lectura-[\w-]+$/.test(id)).slice(-40); },
    correccion: () => correccionVigente(),
    /**
     * Los recortes de las capturas de un draft (3.81.0): solo ids con forma
     * que existan en la carpeta, `CAPTURAS_A_MIRAR` repartidas por el draft. [] si no hay
     * o si el hilo falla: medir no puede tirar el lector.
     */
    recortesDe: async (ids) => {
      const validos = (Array.isArray(ids) ? ids : []).filter((id) => typeof id === 'string' && /^lectura-[\w-]+$/.test(id) && carpeta && existsSync(join(carpeta, `${id}.png`)));
      if (!validos.length) return [];
      try {
        const mirar = capturasAMirar(validos);
        const r = await usando(mirar, () => recortar({ capturas: mirar.map((id) => ({ id, png: join(carpeta, `${id}.png`) })), aprendido }));
        return Array.isArray(r) ? r : [];
      } catch (e) { registrar(`No se pudieron recortar las capturas del draft: ${e.message}`); return []; }
    },
    /**
     * Aprender de los drafts que arreglaste en el historial (3.83.0): cada
     * draft son sus recortes (`picks`, las diez caras sin nombres, de la tabla
     * `recortes`) con la verdad que dijiste. Uno a uno, por el mismo
     * aprendizaje que «Enseña al lector» (sus guardas: una cara de compañero
     * entra confirmada en dos drafts y sin parecerse a otro héroe). Lo que
     * llega de la base de datos son datos: ids, base64 y nombres con forma, y
     * como mucho `ARREGLOS_POR_TANDA` drafts. Devuelve cuántos se miraron, qué
     * se aprendió y `hechos` (3.83.1): las `clave` de los drafts mirados o sin
     * forma (no la tendrán nunca); los que fallan (el hilo sin memoria) no van,
     * y se reintentan la próxima vez. Antes la tanda entera se daba por hecha.
     * Un fallo no tira el lector.
     */
    aprenderDeArreglos: async (drafts) => {
      const texto = (x) => (typeof x === 'string' && x.length <= 40 ? x : null);
      const lista = (l, n) => (Array.isArray(l) ? l.map(texto).filter(Boolean).slice(0, n) : []);
      const salida = { mirados: 0, aprendidos: [], hechos: [], fallidos: 0 };
      const claveDe = (d) => (typeof d?.clave === 'string' ? d.clave : null);
      const buenos = (Array.isArray(drafts) ? drafts : []).slice(0, ARREGLOS_POR_TANDA).map((d) => {
        const verdad = { enemigos: lista(d?.verdad?.enemigos, 5), aliados: lista(d?.verdad?.aliados, 4), tuyo: texto(d?.verdad?.tuyo), baneos: [] };
        const pares = (Array.isArray(d?.capturas) ? d.capturas : []).slice(0, 2)
          .filter((c) => typeof c?.id === 'string' && /^lectura-[\w-]{1,80}$/.test(c.id) && typeof c.picks === 'string' && c.picks.length <= 120000 && /^[A-Za-z0-9+/=]+$/.test(c.picks))
          .map((c) => ({ id: c.id, picks: c.picks, verdad }));
        if (verdad.enemigos.length && pares.length) return { pares, clave: claveDe(d) };
        if (claveDe(d)) salida.hechos.push(claveDe(d));
        return null;
      }).filter(Boolean);
      for (const { pares, clave } of buenos) {
        while (aprendiendo) await aprendiendo.catch(() => {});
        try {
          aprendiendo = aprender({ pares, aprendido }).then((r) => { aprendido = r.aprendido; guardar(aprendido); return r; }).finally(() => { aprendiendo = null; });
          const r = await aprendiendo;
          salida.mirados += 1;
          if (clave) salida.hechos.push(clave);
          salida.aprendidos.push(...r.informe.flatMap((l) => [...l.aprendidos.map((x) => x.nombre), ...(l.aliados?.aprendidos ?? [])]));
        } catch (e) { salida.fallidos += 1; registrar(`Aprender de lo arreglado: no se pudo (${e.message}).`); }
      }
      return salida;
    },
    correccionContestada: () => { const c = correccionContestada; correccionContestada = null; return c && ahora() - c.cuando <= RETENCION_CAPTURAS_MS ? c : null; },
    // Cómo acabó la partida (3.72.5): el modo solo pregunta y recoge la respuesta (una vez).
    ponerPregunta: (p) => { pregunta = sanearPregunta(p); },
    respuesta: () => { const r = respuesta; respuesta = null; return r; },
    estado: () => estado(),
    /**
     * Un vistazo al minimapa si la burbuja tiene algo que enseñar y nadie ha
     * capturado en VISTAZO_MS (3.69.3). null si no tocaba.
     */
    mirarPartida: async () => {
      if (!consejoActual || (ultimaMirada != null && ahora() - ultimaMirada < VISTAZO_MS)) return null;
      return hacerLectura({ soloPartida: true });
    },
  };
  servidor.on('close', () => { pararVigilancia(); lector?.cerrar(); });
  return servidor;
}

/** Lo aprendido de las correcciones, de disco, diciendo qué hay. Las plantillas del resultado son de serie (3.99.0). */
export function cargarLoAprendido(registrar) {
  const aprendido = leerAprendido();
  if (!aprendido && existsSync(FICHERO_APRENDIDO)) registrar('Lo aprendido con una versión anterior del lector se descarta: se aprendió sin las guardas de 3.30.1 y movía el panel de picks. Se vuelve a aprender solo.');
  if (aprendido) registrar(`Con lo aprendido de ${aprendido.capturas} capturas: ${Object.keys(aprendido.caras ?? {}).length} caras de esta tablet${aprendido.picks ? ' y los huecos de picks medidos aquí' : ''}.`);
  registrar('Resultado de la partida: se lee de la tabla del final con las plantillas de serie (victoria y derrota).');
  return { aprendido };
}
