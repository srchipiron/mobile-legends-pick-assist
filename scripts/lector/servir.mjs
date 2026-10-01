/**
 * El puente entre el lector y la app (3.25.0): en Termux, en el MÓVIL,
 *
 *   node scripts/lector/servir.mjs --tablet 192.168.68.112:PUERTO
 *
 * y en la app, el botón «Leer del juego». Cada toque hace UNA captura de la
 * tablet (la misma de `leer.mjs`), reconoce baneos y picks enemigos y
 * devuelve los NOMBRES; la imagen no sale de Termux.
 *
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
import { mkdirSync, writeFileSync, realpathSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { leerPng } from './png.mjs';
import { capturarTablet, leerBaneos, leerPicksEnemigos, carasGuardadas } from './leer.mjs';

/** Decisión de producto: un puerto alto, fijo, que la app conoce. */
export const PUERTO = 47323;
/** La app publicada. Una copia servida desde el propio móvil también vale (pruebas). */
export const ORIGENES = ['https://srchipiron.github.io'];
export const VERSION_PUENTE = 1;

export const origenPermitido = (o) => !!o && (ORIGENES.includes(o) || /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/.test(o));

const plano = (r) => ({ nombre: r.nombre ?? null, candidato: r.candidato ?? null, parecido: Math.round((r.parecido ?? 0) * 1000) / 1000 });

/** Lo que se lee de una captura (PNG): baneos de los dos lados y picks enemigos. */
export function leerCaptura(png, caras) {
  const img = leerPng(png);
  const baneos = leerBaneos(img, caras);
  const enemigos = leerPicksEnemigos(img, caras);
  return { ancho: img.ancho, alto: img.alto, tuyos: baneos.tuyos.map(plano), suyos: baneos.suyos.map(plano), enemigos: enemigos.map(plano) };
}

/**
 * El servidor, con la captura inyectada: en Termux es `capturarTablet`, en
 * las pruebas una captura de fichero.
 */
export function crearServidor({ capturar, caras = carasGuardadas(), carpeta = null, registrar = () => {} }) {
  let n = 0;
  return createServer((req, res) => {
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
      res.writeHead(204, { ...cabeceras, 'Access-Control-Allow-Methods': 'GET', 'Access-Control-Allow-Private-Network': 'true', 'Access-Control-Max-Age': '600' }).end();
      return;
    }
    const ruta = new URL(req.url, 'http://127.0.0.1').pathname;
    if (req.method === 'GET' && ruta === '/estado') {
      res.writeHead(200, cabeceras).end(JSON.stringify({ ok: true, version: VERSION_PUENTE }));
      return;
    }
    if (req.method === 'GET' && ruta === '/leer') {
      const t0 = Date.now();
      let png;
      try { png = capturar(); } catch (e) {
        registrar(`No se pudo hacer la captura: ${String(e.message).split('\n')[0]}`);
        res.writeHead(502, cabeceras).end(JSON.stringify({ error: 'captura' }));
        return;
      }
      try {
        const lectura = { version: VERSION_PUENTE, ...leerCaptura(png, caras), ms: Date.now() - t0 };
        n += 1;
        if (carpeta) {
          const base = join(carpeta, `lectura-${new Date().toISOString().replace(/[:.]/g, '-')}-${n}`);
          writeFileSync(`${base}.png`, png);
          writeFileSync(`${base}.json`, JSON.stringify(lectura, null, 1));
        }
        const nombres = (l) => l.map((x) => x.nombre ?? '?').join(', ');
        registrar(`Lectura ${n} (${lectura.ms} ms): baneos ${nombres([...lectura.tuyos, ...lectura.suyos])} · enemigos ${nombres(lectura.enemigos)}`);
        res.writeHead(200, cabeceras).end(JSON.stringify(lectura));
      } catch (e) {
        registrar(`La captura no se pudo leer: ${e.message}`);
        res.writeHead(500, cabeceras).end(JSON.stringify({ error: 'formato' }));
      }
      return;
    }
    res.writeHead(404, cabeceras).end(JSON.stringify({ error: 'no existe' }));
  });
}

async function principal() {
  const arg = (n) => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
  const tablet = arg('--tablet');
  const puerto = Number(arg('--puerto') ?? PUERTO);
  const carpeta = arg('--guardar-capturas');
  if (!tablet) {
    console.error('Uso: node scripts/lector/servir.mjs --tablet IP:PUERTO   [--guardar-capturas carpeta]');
    process.exit(2);
  }
  if (carpeta) mkdirSync(carpeta, { recursive: true });
  const servidor = crearServidor({ capturar: () => capturarTablet(tablet), carpeta, registrar: (m) => console.log(m) });
  servidor.on('error', (e) => {
    console.error(e.code === 'EADDRINUSE' ? `El puerto ${puerto} ya está en uso: ¿hay otro lector abierto?` : e.message);
    process.exit(1);
  });
  servidor.listen(puerto, '127.0.0.1', () => {
    console.log(`Lector esperando en http://127.0.0.1:${puerto} (tablet ${tablet}).`);
    console.log('Abre la app y toca «Leer del juego». Ctrl+C para parar, y apaga la depuración inalámbrica al acabar.');
  });
}

if (process.argv[1] && realpathSync(resolve(process.argv[1])) === realpathSync(fileURLToPath(import.meta.url))) await principal();
