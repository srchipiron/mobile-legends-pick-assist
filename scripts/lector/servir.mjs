/**
 * El puente entre el lector y la app (3.25.0): en Termux, en el MÓVIL,
 *
 *   lector                                   (scripts/lector/lector.sh, 3.26.0)
 *   node scripts/lector/servir.mjs           (busca la tablet sola)
 *   node scripts/lector/servir.mjs --tablet 192.168.68.112:PUERTO
 *
 * y en la app, el botón «Leer del juego». Cada toque hace UNA captura de la
 * tablet (la misma de `leer.mjs`), reconoce baneos y picks enemigos y
 * devuelve los NOMBRES; la imagen no sale de Termux.
 *
 * - Sin `--tablet` la encuentra sola (`encontrarTablet`: la última que
 *   funcionó, mDNS, puertos abiertos) y la vuelve a buscar si deja de
 *   contestar: el puerto cambia cada vez que se enciende la depuración.
 * - Escucha solo en 127.0.0.1: desde otro aparato no se puede llamar.
 * - Solo responde con datos a la app publicada (y a una copia local para
 *   las pruebas); a cualquier otra web le dice que no.
 * - Chrome pide UNA vez permiso de «acceder a la red local» (Local Network
 *   Access, Chrome 142+): es esto.
 *
 * `--guardar-capturas carpeta` deja cada captura y lo que se leyó de ella,
 * para afinar el lector con las que salgan mal.
 *
 * Y desde 3.33.0 VIGILA EL FINAL de la partida por su cuenta (`/vigilar`,
 * `/final`): Termux sigue despierto con el móvil en el bolsillo; la app no.
 *
 * SEGURIDAD: como `leer.mjs`, no toca la pantalla de la tablet ni habla con
 * Moonton. Este fichero no lanza programas: la captura es la de `leer.mjs`.
 */
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync, readdirSync, statSync, unlinkSync, existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { leerPng } from './png.mjs';
import { capturarTablet, encontrarTablet, carasGuardadas } from './leer.mjs';
import { PARTES, leerParte, juntarLectura, leerCaptura } from './lectura.mjs';
import { resumirAprendizaje, CAPTURAS_POR_CORRECCION, VERSION_APRENDIDO } from './aprender.mjs';

export { CAPTURAS_POR_CORRECCION };
import { fotogramaDe } from './miniatura.mjs';
import { enPartida, recorteMarcador } from './partida.mjs';
import { hablarConTermux, limpiarTexto, IDIOMAS_VOZ } from './voz.mjs';
import { tramoDeMinutos } from '../../src/motor/directo.js';
import { tiraDe, reconocerResultado, aprenderResultado, plantillasIniciales, cargarResultados, guardarResultados, VERSION_RESULTADOS } from './resultado.mjs';

/** Decisión de producto: un puerto alto, fijo, que la app conoce. */
export const PUERTO = 47323;
/** La app publicada. Una copia servida desde el propio móvil también vale (pruebas). */
export const ORIGENES = ['https://srchipiron.github.io'];
export const VERSION_PUENTE = 1;
/** Fallos de captura que la app distingue: la tablet no está, falta emparejar, o adb no consigue la captura. */
export const FALLOS_DE_CAPTURA = ['tablet', 'emparejar', 'captura'];
/** Dónde se recuerda la última tablet que funcionó (ip y puerto). */
export const FICHERO_MEMORIA = join(homedir(), '.config', 'lector', 'tablet.json');
/** Lo aprendido de las correcciones (aprender.mjs): huecos de picks y caras de esta tablet. */
export const FICHERO_APRENDIDO = join(homedir(), '.config', 'lector', 'aprendido.json');
/** Las plantillas de VICTORIA / DERROTA aprendidas de lo que contesta Javi (resultado.mjs, 3.32.0). */
export const FICHERO_RESULTADOS = join(homedir(), '.config', 'lector', 'resultados.json');
/** Las de serie: la tabla de una derrota (incidencia #15, nombres tapados). */
export const plantillasDeSerie = () => plantillasIniciales(leerPng(readFileSync(new URL('tabla-derrota.png', import.meta.url))));
export function leerResultados(fichero = FICHERO_RESULTADOS) {
  try {
    const r = JSON.parse(readFileSync(fichero, 'utf8'));
    if (!r || r.version !== VERSION_RESULTADOS) return null;
    const c = cargarResultados(r);
    return c.tablas.length ? c : null;
  } catch { return null; }
}
export function guardarResultadosEn(r, fichero = FICHERO_RESULTADOS) {
  try { mkdirSync(resolve(fichero, '..'), { recursive: true }); writeFileSync(fichero, JSON.stringify(guardarResultados(r))); } catch { /* sin disco: se aprende otra vez */ }
}

/** Cuántas de las últimas capturas de una corrección se miran para elegir las `CAPTURAS_POR_CORRECCION` que sean la pantalla del draft. */
export const CAPTURAS_A_MIRAR = 8;

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
 */
export const VIGILANCIA = { desdeMin: 8, hastaMin: 25, intervaloMs: 10000, maxFotogramas: 8, inicioDesdeMin: 1, intervaloInicioMs: 20000 };

/**
 * Los consejos EN DIRECTO (3.44.0): con el draft completo la app manda el
 * guion (src/motor/directo.js, ya traducido: `{ min, texto }`, el minuto
 * contado desde que empieza la PARTIDA) y una frase de cierre por tramo de
 * duración. El lector busca el inicio de la partida desde el minuto
 * `inicioDesdeMin` tras el draft, una captura cada `intervaloInicioMs`
 * (decisión de Javi: desde el minuto 1 cada 20 s; desde el 8 sigue la
 * vigilancia del final como antes), lo reconoce por el minimapa (partida.mjs,
 * dos capturas seguidas) y desde ahí dice cada aviso en su minuto. Un aviso
 * que se queda atrás más de `RETRASO_MAXIMO_MIN` (el inicio se vio tarde)
 * no se dice: un consejo del minuto 5 en el 9 confunde. Sin inicio visto al
 * llegar al minuto 8, se estima en el minuto 1 del draft y se marca.
 */
export const RETRASO_MAXIMO_MIN = 2;
/** El primer aviso (el inicio) se dice aunque el inicio se viera tarde, hasta este minuto. */
const RETRASO_DEL_INICIO_MIN = 4;
/** Lo que se acepta de la app: avisos, frases de cierre. */
const MAX_AVISOS = 20, MAX_CIERRES = 6;

/** Lo aprendido, si es de la versión actual: lo de 3.27.0–3.30.0 (versión 1) se aprendió sin guardas y se descarta. */
export function leerAprendido(fichero = FICHERO_APRENDIDO) {
  try { const a = JSON.parse(readFileSync(fichero, 'utf8')); return a && typeof a === 'object' && a.version === VERSION_APRENDIDO ? a : null; } catch { return null; }
}
export function guardarAprendido(a, fichero = FICHERO_APRENDIDO) {
  try { mkdirSync(resolve(fichero, '..'), { recursive: true }); writeFileSync(fichero, JSON.stringify(a)); } catch { /* sin disco: se aprende otra vez la próxima */ }
}

/** El aprendizaje de verdad, en un hilo aparte (aprender-tarea.mjs). */
export function aprenderEnHilo({ pares, aprendido }) {
  return new Promise((resolver, rechazar) => {
    const hilo = new Worker(new URL('aprender-tarea.mjs', import.meta.url), { workerData: { pares, aprendido } });
    hilo.once('message', resolver);
    hilo.once('error', rechazar);
    hilo.once('exit', (codigo) => { if (codigo !== 0) rechazar(new Error(`el hilo de aprendizaje salió con ${codigo}`)); });
  });
}

export function leerMemoria(fichero = FICHERO_MEMORIA) {
  try { const m = JSON.parse(readFileSync(fichero, 'utf8')); return m && typeof m === 'object' ? m : {}; } catch { return {}; }
}
export function guardarMemoria(m, fichero = FICHERO_MEMORIA) {
  try { mkdirSync(resolve(fichero, '..'), { recursive: true }); writeFileSync(fichero, JSON.stringify({ ip: m.ip, puerto: m.puerto, nombre: m.nombre ?? null })); } catch { /* sin disco: se busca la próxima vez */ }
}

/**
 * La captura con la tablet encontrada sola: la primera vez (o tras
 * `preparar()`, al arrancar) la busca; si una captura falla, la olvida y la
 * busca otra vez antes de rendirse, porque el puerto habrá cambiado. Con
 * `fija` (`--tablet IP:PUERTO`) no busca nada. Lo que encuentra se guarda
 * en `memoria` para la próxima vez; también la fijada, en cuanto una captura
 * sale (3.33.1: si no, el siguiente `lector` a secas volvía a buscar en la IP
 * de antes, que es lo que le pasó a Javi en otra wifi).
 */
export function capturaAutomatica({ fija = null, memoria = {}, recordar = () => {}, encontrar = encontrarTablet, capturar = capturarTablet, registrar = () => {} }) {
  let tablet = fija, buscando = null;
  const localizar = () => {
    buscando ??= encontrar({ memoria, registrar }).then((c) => {
      tablet = `${c.ip}:${c.puerto}`;
      Object.assign(memoria, { ip: c.ip, puerto: c.puerto, nombre: c.nombre ?? memoria.nombre ?? null });
      recordar(memoria);
      registrar(`Tablet: ${tablet} (${c.via === 'memoria' ? 'la de la última vez' : c.via === 'wifi' ? 'anunciada en la wifi' : 'por sus puertos'}).`);
      return tablet;
    }).finally(() => { buscando = null; });
    return buscando;
  };
  let fijaRecordada = false;
  const ahora = async (segunda = false) => {
    if (!tablet) await localizar();
    try {
      const png = capturar(tablet);
      if (fija && !fijaRecordada) {
        fijaRecordada = true;
        const [ip, puerto] = fija.split(':');
        Object.assign(memoria, { ip, puerto: Number(puerto) });
        recordar(memoria);
      }
      return png;
    } catch (e) {
      if (fija || segunda) throw e;
      registrar(`La tablet no contesta en ${tablet}: la busco otra vez.`);
      tablet = null;
      return ahora(true);
    }
  };
  ahora.preparar = () => { if (!tablet) localizar().catch((e) => registrar(e.message)); };
  return ahora;
}

/** El `Host` de una petición al lector: 127.0.0.1 o localhost, con o sin puerto. */
export const hostPermitido = (h) => typeof h === 'string' && /^(127\.0\.0\.1|localhost)(:\d{1,5})?$/.test(h);

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
    async leer(png, aprendido = null) {
      const img = leerPng(png);
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

/**
 * El servidor, con la captura inyectada: en Termux es `capturarTablet`, en
 * las pruebas una captura de fichero.
 */
export function crearServidor({ capturar, caras = carasGuardadas(), carpeta = null, registrar = () => {}, aprendido = null, aprender = aprenderEnHilo, guardar = guardarAprendido, resultados = null, guardarResultadosDe = guardarResultadosEn, vigilancia: vigilanciaPedida = VIGILANCIA, ahora = () => Date.now(), maximos = MAX_CAPTURAS, enHilos = true, hablar = hablarConTermux }) {
  // Lo que no se pida, como siempre (las pruebas encogen solo algunos plazos).
  const vigilancia = { ...VIGILANCIA, ...vigilanciaPedida };
  // Las lecturas, en tres hilos a la vez (3.39.0); `enHilos: false` las hace aquí.
  const lector = enHilos ? lectorEnHilos({ caras, registrar }) : null;
  let n = 0, aprendiendo = null;
  resultados = resultados ?? plantillasDeSerie();
  /** Guarda una captura y borra las que ya no hacen falta (3.34.0). */
  const podar = () => { if (carpeta) podarCapturas(carpeta, { ahora: ahora(), maximos, proteger: new Set((final?.fotogramas ?? []).map((f) => f.id)) }); };
  const guardarCaptura = (nombre, contenido, { conPoda = true } = {}) => {
    if (!carpeta) return;
    writeFileSync(join(carpeta, nombre), contenido);
    if (conPoda) podar();
  };
  // El final de la partida que se está vigilando (3.33.0): uno a la vez, el del último draft completado.
  let final = null, capturandoFinal = false, relojFinal = null;
  const hora = (t) => new Date(t).toISOString().slice(11, 19);
  const pararVigilancia = () => { if (relojFinal) clearInterval(relojFinal); relojFinal = null; if (final) final.activa = false; };
  const estadoFinal = () => (final
    ? { desde: final.desde, activa: final.activa, resultado: final.resultado, resultadoId: final.resultadoId, resultadoEn: final.resultadoEn, fotogramas: final.fotogramas, inicio: final.inicio, inicioEstimado: final.inicioEstimado, duracion: final.duracion, voz: final.voz, avisos: final.guion.length, dichos: final.dichos.size }
    : { desde: null, activa: false, resultado: null, resultadoId: null, resultadoEn: null, fotogramas: [], inicio: null, inicioEstimado: false, duracion: null, voz: null, avisos: 0, dichos: 0 });

  // ── La voz (3.44.0): un aviso detrás de otro, nunca dos a la vez. ──────
  let colaVoz = Promise.resolve();
  const decir = (f, texto) => {
    colaVoz = colaVoz.then(() => hablar(texto, f.idioma)).then((r) => {
      const antes = f.voz;
      f.voz = r ?? 'ok';
      if (r === 'falta' && antes !== 'falta') registrar('Para oír los consejos instala Termux:API (F-Droid) y ejecuta: pkg install termux-api');
    }).catch(() => { f.voz = 'otro'; });
    return colaVoz;
  };
  /** Los avisos que tocan ya: en su minuto de PARTIDA, y no si se quedaron muy atrás. */
  const hablarPendientes = (f, t) => {
    if (!f.inicio) return;
    const m = (t - f.inicio) / 60000;
    f.guion.forEach((a, i) => {
      if (f.dichos.has(i) || a.min > m) return;
      f.dichos.add(i);
      const tope = i === 0 && a.min < 1 ? RETRASO_DEL_INICIO_MIN : RETRASO_MAXIMO_MIN;
      if (m - a.min <= tope) { registrar(`Minuto ${m.toFixed(1)} de partida: «${a.texto}»`); decir(f, a.texto); }
    });
  };
  /** Dos capturas seguidas con el minimapa: empezó la partida (hacia la mitad entre la anterior y la primera). */
  const detectarInicio = (f, img, t, intervalo) => {
    if (f.inicio) return;
    if (!enPartida(img)) { f.seguidas = 0; return; }
    f.seguidas += 1;
    if (f.seguidas === 1) f.primera = t;
    if (f.seguidas >= 2) {
      f.inicio = f.primera - intervalo / 2;
      registrar(`La partida ha empezado hacia las ${hora(f.inicio)}: ${f.guion.length} consejos en directo${f.guion.length ? '' : ' (la app no ha mandado ninguno)'}.`);
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
      registrar(`Vigilancia del final acabada a los ${vigilancia.hastaMin} minutos: ${final.fotogramas.length} pantallas distintas${final.resultado ? `, resultado ${final.resultado === 'gane' ? 'ganada' : 'perdida'}` : ', sin ver la tabla de resultado'}.`);
      return;
    }
    const finDelInicio = final.desde + vigilancia.desdeMin * 60000;
    // Sin el inicio visto al llegar a la vigilancia del final, se estima.
    if (!final.inicio && t >= finDelInicio) {
      final.inicio = final.desde + vigilancia.inicioDesdeMin * 60000;
      final.inicioEstimado = true;
      registrar(`No he visto empezar la partida: la doy por empezada hacia las ${hora(final.inicio)} (estimado).`);
    }
    hablarPendientes(final, t);
    if (t < finDelInicio) {
      // Buscando el inicio: una captura cada `intervaloInicioMs`, solo para mirar el minimapa (no se guarda).
      if (final.inicio || t < final.desde + vigilancia.inicioDesdeMin * 60000 || t - final.ultimaInicio < vigilancia.intervaloInicioMs) return;
      final.ultimaInicio = t;
      capturandoFinal = true;
      try {
        const png = await capturar();
        if (final !== yo) return;
        detectarInicio(final, leerPng(png), t, vigilancia.intervaloInicioMs);
        hablarPendientes(final, ahora());
      } catch (e) {
        if (final === yo && !final.fallosInicio++) registrar(`Buscando el inicio de la partida no consigo la captura (${String(e.message).split('\n')[0]}): sigo intentándolo.`);
      } finally { capturandoFinal = false; }
      return;
    }
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
      const marcador = !leido.tabla && enPartida(img) ? recorteMarcador(img) : null;
      const foto = { id, minuto: Math.round((t - final.desde) / 60000), miniatura: f.miniatura, tira: f.tira, ...(marcador ? { marcador } : {}), tabla: leido.tabla, resultado: leido.resultado, resultadoParecido: Math.round(leido.parecido * 1000) / 1000 };
      // Hasta `maxFotogramas` pantallas distintas; la de la TABLA viaja
      // siempre, reconozca o no la palabra (sustituye a la última que no sea
      // tabla). Hasta 3.36.0 solo entraba con la palabra reconocida, y la de
      // VICTORIA, que no tiene plantilla de serie, se perdía en cuanto había
      // ocho pantallas: no se podía aprender nunca.
      // Y desde 3.40.0 se quedan las ÚLTIMAS: la nueva saca a la más vieja que
      // no sea tabla. Quedándose las primeras, las ocho eran pantallas de
      // juego de los minutos 8 y 9 (15 de 15 incidencias desde 3.33.0) y las
      // del final (rango, MVP, estadísticas) no entraban nunca.
      if (final.fotogramas.length >= vigilancia.maxFotogramas) {
        const i = final.fotogramas.findIndex((x) => !x.tabla);
        if (i >= 0) final.fotogramas.splice(i, 1);
        else if (!leido.tabla) { podar(); return; }
        else final.fotogramas.shift();
      }
      final.fotogramas.push(foto);
      if (leido.resultado && !final.resultado) {
        Object.assign(final, { resultado: leido.resultado, resultadoId: id, resultadoEn: t });
        // Cuánto duró (3.44.0), y lo que el modelo daba para ESE final.
        if (final.inicio) {
          final.duracion = Math.round(((t - final.inicio) / 60000) * 10) / 10;
          const cierre = final.cierres[tramoDeMinutos(final.duracion)];
          registrar(`Partida de unos ${final.duracion} minutos${final.inicioEstimado ? ' (inicio estimado)' : ''}.`);
          if (cierre) decir(final, cierre);
        }
      }
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
  /**
   * El guion que manda la app (3.44.0), como dato: cada aviso con su minuto
   * (0–40) y su texto limpio; las frases de cierre, una por tramo.
   */
  const guionDe = (cuerpo) => ({
    guion: (Array.isArray(cuerpo?.guion) ? cuerpo.guion : []).slice(0, MAX_AVISOS)
      .map((a) => ({ min: Number(a?.min), texto: typeof a?.texto === 'string' ? limpiarTexto(a.texto) : '' }))
      .filter((a) => Number.isFinite(a.min) && a.min >= 0 && a.min <= 40 && a.texto)
      .sort((a, b) => a.min - b.min),
    cierres: (Array.isArray(cuerpo?.cierres) ? cuerpo.cierres : []).slice(0, MAX_CIERRES).map((c) => (typeof c === 'string' ? limpiarTexto(c) : '')),
    idioma: IDIOMAS_VOZ.includes(cuerpo?.idioma) ? cuerpo.idioma : 'es',
  });
  /** Empieza (o sigue, si es el mismo draft) a vigilar el final del draft completado en `desde`. */
  const vigilar = (desde, cuerpo = {}) => {
    const nuevo = guionDe(cuerpo);
    if (final?.desde === desde) {
      // El mismo draft con otro guion (fijaste otro pick): el nuevo, sin repetir lo ya pasado.
      if (Array.isArray(cuerpo?.guion)) {
        const m = final.inicio ? (ahora() - final.inicio) / 60000 : -1;
        Object.assign(final, nuevo, { dichos: new Set(nuevo.guion.map((a, i) => (a.min <= m ? i : -1)).filter((i) => i >= 0)) });
      }
      return final;
    }
    pararVigilancia();
    final = { desde, hasta: desde + vigilancia.hastaMin * 60000, activa: true, fotogramas: [], resultado: null, resultadoId: null, resultadoEn: null, anterior: null, fallos: 0, ...nuevo, dichos: new Set(), inicio: null, inicioEstimado: false, seguidas: 0, primera: null, ultimaInicio: 0, fallosInicio: 0, duracion: null, voz: null };
    if (ahora() > final.hasta) { final.activa = false; return final; }
    relojFinal = setInterval(vigilarTic, Math.min(vigilancia.intervaloMs, vigilancia.intervaloInicioMs));
    relojFinal.unref?.();
    registrar(`Draft completo a las ${hora(desde)}: busco el inicio de la partida desde el minuto ${vigilancia.inicioDesdeMin} (${final.guion.length} consejos en directo) y vigilo el final del minuto ${vigilancia.desdeMin} al ${vigilancia.hastaMin}.`);
    return final;
  };
  const leerCuerpo = (req) => new Promise((resolver) => {
    const trozos = [];
    req.on('data', (t) => { trozos.push(t); if (trozos.reduce((s, x) => s + x.length, 0) > 65536) req.destroy(); });
    req.on('end', () => { try { resolver(JSON.parse(Buffer.concat(trozos).toString('utf8'))); } catch { resolver(null); } });
    req.on('error', () => resolver(null));
  });
  /** Guarda la verdad junto a cada captura nombrada y aprende de las últimas (una tanda a la vez). */
  const corregir = async ({ ids, enemigos, baneos }) => {
    if (!carpeta) return { aprendido: false, motivo: 'sin carpeta de capturas' };
    const nombres = (l) => (Array.isArray(l) ? l.filter((x) => typeof x === 'string').slice(0, 10) : []);
    const verdad = { enemigos: nombres(enemigos).slice(0, 5), baneos: nombres(baneos), cuando: new Date().toISOString() };
    const validos = (Array.isArray(ids) ? ids : []).filter((id) => /^lectura-[\w-]+$/.test(id) && existsSync(join(carpeta, `${id}.png`)));
    for (const id of validos) writeFileSync(join(carpeta, `${id}.verdad.json`), JSON.stringify(verdad));
    const pares = validos.sort().slice(-CAPTURAS_A_MIRAR).map((id) => ({ id, png: join(carpeta, `${id}.png`), verdad }));
    if (!pares.length || !verdad.enemigos.length) return { aprendido: false, motivo: 'nada que cruzar' };
    if (aprendiendo) await aprendiendo.catch(() => {});
    registrar(`Corrección recibida (${verdad.enemigos.length} enemigos, ${verdad.baneos.length} baneos): aprendiendo de ${pares.length} capturas…`);
    aprendiendo = aprender({ pares, aprendido }).then((r) => {
      aprendido = r.aprendido;
      guardar(aprendido);
      for (const l of resumirAprendizaje(r)) registrar(l);
      return r;
    }).finally(() => { aprendiendo = null; });
    const r = await aprendiendo;
    return { aprendido: true, aprendidos: r.informe.flatMap((l) => l.aprendidos.map((a) => a.nombre)), sinEncontrar: r.informe.flatMap((l) => l.sinEncontrar.map((x) => x.nombre)) };
  };
  const servidor = createServer(async (req, res) => {
    const origen = req.headers.origin;
    const cabeceras = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', Vary: 'Origin' };
    // Solo peticiones dirigidas a ESTE aparato (3.40.0): con otro `Host` es
    // una web que ha hecho apuntar su dominio a 127.0.0.1 (DNS rebinding).
    if (!hostPermitido(req.headers.host)) {
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
      res.writeHead(204, { ...cabeceras, 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Max-Age': '600' }).end();
      return;
    }
    const ruta = new URL(req.url, 'http://127.0.0.1').pathname;
    if (req.method === 'GET' && ruta === '/estado') {
      res.writeHead(200, cabeceras).end(JSON.stringify({ ok: true, version: VERSION_PUENTE, aprendido: { capturas: aprendido?.capturas ?? 0, caras: Object.keys(aprendido?.caras ?? {}).length, picks: !!aprendido?.picks }, resultados: { gane: resultados.gane.length, perdi: resultados.perdi.length, tablas: resultados.tablas.length } }));
      return;
    }
    if (req.method === 'POST' && ruta === '/vigilar') {
      // El draft se ha completado (3.33.0): desde ahora el lector vigila el final por su cuenta. Solo a la app.
      if (!origen) { res.writeHead(403, cabeceras).end(JSON.stringify({ error: 'origen no permitido' })); return; }
      const cuerpo = await leerCuerpo(req);
      const desde = Number(cuerpo?.desde), t = ahora();
      // Un instante del reloj del móvil, reciente: ni futuro ni de hace más de un día.
      if (!Number.isFinite(desde) || desde > t + 60000 || desde < t - 24 * 3600000) { res.writeHead(400, cabeceras).end(JSON.stringify({ error: 'desde' })); return; }
      vigilar(desde, cuerpo);
      res.writeHead(200, cabeceras).end(JSON.stringify(estadoFinal()));
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
      // Lo que contestó Javi (Gané / Perdí) con los fotogramas de esa partida (3.32.0): se aprende la palabra de la tabla.
      if (!origen) { res.writeHead(403, cabeceras).end(JSON.stringify({ error: 'origen no permitido' })); return; }
      const cuerpo = await leerCuerpo(req);
      if (!cuerpo || typeof cuerpo.gane !== 'boolean' || !carpeta) { res.writeHead(400, cabeceras).end(JSON.stringify({ error: 'falta gane o carpeta' })); return; }
      const ids = (Array.isArray(cuerpo.ids) ? cuerpo.ids : []).filter((id) => /^fotograma-[\w-]+$/.test(id) && existsSync(join(carpeta, `${id}.png`))).slice(-8);
      let aprendidos = 0, contradichas = 0;
      for (const id of ids) {
        try {
          const r = aprenderResultado(tiraDe(leerPng(readFileSync(join(carpeta, `${id}.png`)))), cuerpo.gane, resultados, { id });
          if (r.aprendido) { aprendidos += 1; contradichas += r.contradichas; resultados = r.resultados; }
        } catch (e) { registrar(`No se pudo aprender el resultado de ${id}: ${e.message}`); }
      }
      if (aprendidos) guardarResultadosDe(resultados);
      registrar(`Resultado contestado (${cuerpo.gane ? 'ganada' : 'perdida'}): ${aprendidos} tabla(s) aprendida(s) de ${ids.length} fotogramas${contradichas ? `, ${contradichas} plantilla(s) contraria(s) quitada(s)` : ''}. Plantillas: ${resultados.gane.length} de victoria, ${resultados.perdi.length} de derrota.`);
      res.writeHead(200, cabeceras).end(JSON.stringify({ aprendidos, contradichas, gane: resultados.gane.length, perdi: resultados.perdi.length, tablas: resultados.tablas.length }));
      return;
    }
    if (req.method === 'POST' && ruta === '/corregir') {
      // Solo con el origen de la app: sin cabecera Origin no se escribe nada.
      if (!origen) { res.writeHead(403, cabeceras).end(JSON.stringify({ error: 'origen no permitido' })); return; }
      const cuerpo = await leerCuerpo(req);
      if (!cuerpo) { res.writeHead(400, cabeceras).end(JSON.stringify({ error: 'cuerpo' })); return; }
      try {
        res.writeHead(200, cabeceras).end(JSON.stringify(await corregir(cuerpo)));
      } catch (e) {
        registrar(`No se pudo aprender: ${e.message}`);
        res.writeHead(500, cabeceras).end(JSON.stringify({ error: 'aprender' }));
      }
      return;
    }
    if (req.method === 'GET' && ruta === '/leer') {
      const t0 = Date.now();
      let png;
      try { png = await capturar(); } catch (e) {
        registrar(`No se pudo hacer la captura: ${String(e.message).split('\n')[0]}`);
        res.writeHead(502, cabeceras).end(JSON.stringify({ error: FALLOS_DE_CAPTURA.includes(e?.tipo) ? e.tipo : 'captura' }));
        return;
      }
      try {
        n += 1;
        const id = `lectura-${new Date().toISOString().replace(/[:.]/g, '-')}-${n}`;
        const t1 = Date.now();
        const leido = lector ? await lector.leer(png, aprendido) : leerCaptura(png, caras, aprendido);
        // `ms` es lo que espera la app; `msCaptura`, lo que tardó la tablet en dar la imagen (3.39.0).
        const lectura = { version: VERSION_PUENTE, id, ...leido, ms: Date.now() - t0, msCaptura: t1 - t0 };
        if (carpeta) {
          writeFileSync(join(carpeta, `${id}.json`), JSON.stringify(lectura, null, 1));
          guardarCaptura(`${id}.png`, png);
        }
        // Un «?» dice a qué se quedó más cerca: con eso se afina sin pedir la captura.
        const nombres = (l) => l.map((x) => x.nombre ?? (x.candidato ? `?(${x.candidato} ${x.parecido.toFixed(2)})` : '?')).join(', ');
        registrar(`Lectura ${n} (${lectura.ms} ms, captura ${lectura.msCaptura}): baneos ${nombres([...lectura.tuyos, ...lectura.suyos])} · enemigos ${nombres(lectura.enemigos)} · tu equipo ${nombres(lectura.aliados)} · tú ${lectura.tuyo ?? (lectura.tuyoFila >= 0 ? '?' : 'sin fila amarilla')}`);
        res.writeHead(200, cabeceras).end(JSON.stringify(lectura));
      } catch (e) {
        registrar(`La captura no se pudo leer: ${e.message}`);
        res.writeHead(500, cabeceras).end(JSON.stringify({ error: 'formato' }));
      }
      return;
    }
    res.writeHead(404, cabeceras).end(JSON.stringify({ error: 'no existe' }));
  });
  // La app leyendo sola pide cada 5 s y reutiliza la conexión; con el cierre
  // de Node a los 5 s de inactividad, cada toque caía justo cuando el lector
  // cerraba el socket (ECONNRESET, visto en las pruebas con el bucle ocupado).
  servidor.keepAliveTimeout = 65000;
  servidor.on('close', () => { pararVigilancia(); lector?.cerrar(); });
  return servidor;
}

async function principal() {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const tablet = arg('--tablet');
  const puerto = Number(arg('--puerto') ?? PUERTO);
  const carpeta = arg('--guardar-capturas');
  if (process.argv.includes('--ayuda') || process.argv.includes('--help')) {
    console.error('Uso: node scripts/lector/servir.mjs [--tablet IP:PUERTO | --tablet IP] [--guardar-capturas carpeta]');
    process.exit(2);
  }
  if (carpeta) mkdirSync(carpeta, { recursive: true });
  const registrar = (m) => console.log(m);
  if (carpeta) {
    const borradas = podarCapturas(carpeta);
    if (borradas) registrar(`Borradas ${borradas} capturas antiguas de ${carpeta} (se guardan solo unas horas).`);
  }
  // `--tablet IP:PUERTO` la fija; `--tablet IP` solo dice dónde buscar.
  const fija = tablet?.includes(':') ? tablet : null;
  const memoria = leerMemoria();
  if (tablet && !fija) memoria.ip = tablet;
  const capturar = capturaAutomatica({ fija, memoria, recordar: guardarMemoria, registrar });
  const aprendido = leerAprendido();
  if (!aprendido && existsSync(FICHERO_APRENDIDO)) registrar('Lo aprendido con una versión anterior del lector se descarta: se aprendió sin las guardas de 3.30.1 y movía el panel de picks. Se vuelve a aprender solo.');
  if (aprendido) registrar(`Con lo aprendido de ${aprendido.capturas} capturas: ${Object.keys(aprendido.caras ?? {}).length} caras de esta tablet${aprendido.picks ? ' y los huecos de picks medidos aquí' : ''}.`);
  const resultados = leerResultados();
  registrar(resultados ? `Resultados: ${resultados.gane.length} plantillas de victoria y ${resultados.perdi.length} de derrota aprendidas de tus partidas.` : 'Resultados: solo la derrota de serie; la victoria se aprende de tu primera partida ganada en la que se vea la tabla.');
  const servidor = crearServidor({ capturar, carpeta, registrar, aprendido, resultados });
  servidor.on('error', (e) => {
    console.error(e.code === 'EADDRINUSE' ? `El puerto ${puerto} ya está en uso: hay otro lector abierto. Ciérralo, o arranca con «lector», que lo cierra solo.` : e.message);
    process.exit(1);
  });
  servidor.listen(puerto, '127.0.0.1', () => {
    console.log(`Lector esperando en http://127.0.0.1:${puerto}${fija ? ` (tablet ${fija})` : ''}.`);
    console.log('Abre la app y toca «Leer del juego». Ctrl+C para parar, y apaga la depuración inalámbrica al acabar.');
    if (!fija) capturar.preparar();
  });
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) await principal();
