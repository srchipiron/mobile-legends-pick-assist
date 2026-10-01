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
 * SEGURIDAD: como `leer.mjs`, no toca la pantalla de la tablet ni habla con
 * Moonton. Este fichero no lanza programas: la captura es la de `leer.mjs`.
 */
import { createServer } from 'node:http';
import { mkdirSync, writeFileSync, readFileSync, existsSync, realpathSync } from 'node:fs';
import { homedir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker } from 'node:worker_threads';
import { leerPng } from './png.mjs';
import { capturarTablet, encontrarTablet, leerBaneos, leerPicksEnemigos, leerAliados, filaPropia, sinRepetidos, carasGuardadas } from './leer.mjs';
import { carasAprendidas, resumirAprendizaje, CAPTURAS_POR_CORRECCION, VERSION_APRENDIDO } from './aprender.mjs';

export { CAPTURAS_POR_CORRECCION };
import { miniaturasDe, fotogramaDe } from './miniatura.mjs';
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
 * en `memoria` para la próxima vez.
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
  const ahora = async (segunda = false) => {
    if (!tablet) await localizar();
    try { return capturar(tablet); } catch (e) {
      if (fija || segunda) throw e;
      registrar(`La tablet no contesta en ${tablet}: la busco otra vez.`);
      tablet = null;
      return ahora(true);
    }
  };
  ahora.preparar = () => { if (!tablet) localizar().catch((e) => registrar(e.message)); };
  return ahora;
}

export const origenPermitido = (o) => !!o && (ORIGENES.includes(o) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o));

const plano = (r) => ({ nombre: r.nombre ?? null, candidato: r.candidato ?? null, parecido: Math.round((r.parecido ?? 0) * 1000) / 1000 });

/**
 * Lo que se lee de una captura (PNG): baneos de los dos lados, picks
 * enemigos (con lo aprendido de esta tablet si lo hay) y, desde 3.31.0, TU
 * equipo: las cinco filas de la izquierda (`aliados`) y cuál eres tú
 * (`tuyo`: el nombre de la fila con tu nombre en amarillo, o null si no se
 * distingue; `tuyoFila` dice cuál, de 0 a 4, o −1).
 */
export function leerCaptura(png, caras, aprendido = null) {
  const img = leerPng(png);
  const baneos = leerBaneos(img, caras);
  const enemigos = sinRepetidos(leerPicksEnemigos(img, caras, { posiciones: aprendido?.picks ?? undefined, extra: carasAprendidas(aprendido) }));
  const aliados = sinRepetidos(leerAliados(img, caras));
  const tuyoFila = filaPropia(img);
  // Un equipo no banea dos veces al mismo héroe; los DOS equipos sí pueden
  // banear al mismo (Hirara en la captura real, Belerick y Atlas en la
  // primera tarde): se quita el repetido dentro de cada lado, no entre lados.
  return {
    ancho: img.ancho, alto: img.alto,
    tuyos: sinRepetidos(baneos.tuyos).map(plano), suyos: sinRepetidos(baneos.suyos).map(plano), enemigos: enemigos.map(plano),
    aliados: aliados.map(plano), tuyoFila, tuyo: tuyoFila >= 0 ? (aliados[tuyoFila].nombre ?? null) : null,
  };
}

/**
 * El servidor, con la captura inyectada: en Termux es `capturarTablet`, en
 * las pruebas una captura de fichero.
 */
export function crearServidor({ capturar, caras = carasGuardadas(), carpeta = null, registrar = () => {}, aprendido = null, aprender = aprenderEnHilo, guardar = guardarAprendido, resultados = null, guardarResultadosDe = guardarResultadosEn }) {
  let n = 0, aprendiendo = null, fotogramaAnterior = null;
  resultados = resultados ?? plantillasDeSerie();
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
    if (req.method === 'GET' && ruta === '/captura') {
      // Una captura REDUCIDA para mandar al proyecto (3.29.0, temporal: la
      // pantalla de resultado, para medir dónde está el cartel). Solo a la
      // app, y es lo único que sale como imagen: pequeña y con paleta.
      if (!origen) { res.writeHead(403, cabeceras).end(JSON.stringify({ error: 'origen no permitido' })); return; }
      let png;
      try { png = await capturar(); } catch (e) {
        res.writeHead(502, cabeceras).end(JSON.stringify({ error: FALLOS_DE_CAPTURA.includes(e?.tipo) ? e.tipo : 'captura' }));
        return;
      }
      try {
        const img = leerPng(png);
        const esFotograma = new URL(req.url, 'http://127.0.0.1').searchParams.has('fotograma');
        const id = `${esFotograma ? 'fotograma' : 'resultado'}-${new Date().toISOString().replace(/[:.]/g, '-')}`;
        if (esFotograma) {
          // Un fotograma del final de partida (3.30.0): solo cuenta si la pantalla ha cambiado.
          const f = fotogramaDe(img, fotogramaAnterior);
          fotogramaAnterior = f.pequena;
          if (f.cambio && carpeta) writeFileSync(join(carpeta, `${id}.png`), png);
          // Y si es la tabla de resultado con una palabra conocida, el resultado (3.32.0).
          const leido = f.cambio ? reconocerResultado(tiraDe(img), resultados) : null;
          if (f.cambio) registrar(`Fotograma ${id}: la pantalla ha cambiado (${f.miniatura.length + f.tira.length} caracteres)${leido?.tabla ? ` · tabla de resultado: ${leido.resultado ?? 'palabra sin plantilla'} (${leido.parecido.toFixed(2)})` : ''}.`);
          res.writeHead(200, cabeceras).end(JSON.stringify({ id, ancho: img.ancho, alto: img.alto, cambio: f.cambio, ...(f.cambio ? { miniatura: f.miniatura, tira: f.tira, tabla: leido.tabla, resultado: leido.resultado, resultadoParecido: Math.round(leido.parecido * 1000) / 1000 } : {}) }));
          return;
        }
        if (carpeta) writeFileSync(join(carpeta, `${id}.png`), png);
        const mini = miniaturasDe(img);
        registrar(`Captura reducida ${id} (${img.ancho}×${img.alto}): ${mini.miniatura.length + mini.tira.length} caracteres.`);
        res.writeHead(200, cabeceras).end(JSON.stringify({ id, ancho: img.ancho, alto: img.alto, ...mini }));
      } catch (e) {
        registrar(`La captura no se pudo reducir: ${e.message}`);
        res.writeHead(500, cabeceras).end(JSON.stringify({ error: 'formato' }));
      }
      return;
    }
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
        const lectura = { version: VERSION_PUENTE, id, ...leerCaptura(png, caras, aprendido), ms: Date.now() - t0 };
        if (carpeta) {
          writeFileSync(join(carpeta, `${id}.png`), png);
          writeFileSync(join(carpeta, `${id}.json`), JSON.stringify(lectura, null, 1));
        }
        // Un «?» dice a qué se quedó más cerca: con eso se afina sin pedir la captura.
        const nombres = (l) => l.map((x) => x.nombre ?? (x.candidato ? `?(${x.candidato} ${x.parecido.toFixed(2)})` : '?')).join(', ');
        registrar(`Lectura ${n} (${lectura.ms} ms): baneos ${nombres([...lectura.tuyos, ...lectura.suyos])} · enemigos ${nombres(lectura.enemigos)} · tu equipo ${nombres(lectura.aliados)} · tú ${lectura.tuyo ?? (lectura.tuyoFila >= 0 ? '?' : 'sin fila amarilla')}`);
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
