/**
 * Lo que comparten las pruebas del servidor de la tablet: arrancarlo en un
 * puerto libre de 127.0.0.1 con un código y pedirle cosas como la app (con
 * `Origin`), como la APK (sin `Origin`, desde 127.0.0.1) o como cualquiera.
 */
import { request } from 'node:http';
import { crearServidor } from '../../../scripts/lector/servir.mjs';
import { capturaCompleta } from './captura.mjs';

export const CODIGO = 'AB12CD34EF';
export const APP = 'https://srchipiron.github.io';

/** Una petición con las cabeceras de la app; `origen: null` es la APK. Devuelve `{ estado, cuerpo, json, cabeceras }`. */
export const pedir = (puerto, camino, { metodo = 'GET', cuerpo = undefined, host = `192.168.1.40:${puerto}`, codigo = CODIGO, origen = APP, cabeceras = {} } = {}) => new Promise((resolver, rechazar) => {
  const datos = cuerpo === undefined ? null : Buffer.from(typeof cuerpo === 'string' ? cuerpo : JSON.stringify(cuerpo));
  const headers = { Host: host, ...(origen ? { Origin: origen } : {}), ...(codigo ? { 'X-Lector-Codigo': codigo } : {}), ...(datos ? { 'Content-Type': 'application/json', 'Content-Length': datos.length } : {}), ...cabeceras };
  const q = request({ host: '127.0.0.1', port: puerto, path: camino, method: metodo, headers }, (res) => {
    let b = '';
    res.on('data', (t) => { b += t; });
    res.on('end', () => { let json = null; try { json = JSON.parse(b); } catch { /* no es JSON */ } resolver({ estado: res.statusCode, cuerpo: b, json, cabeceras: res.headers }); });
  });
  q.on('error', rechazar);
  if (datos) q.write(datos);
  q.end();
});
/** Lo mismo como la APK de la propia tablet. */
export const pedirApk = (puerto, camino, opciones = {}) => pedir(puerto, camino, { ...opciones, origen: null });

/** El servidor en un puerto libre; por defecto lee la captura real compuesta, en un solo hilo. */
export async function arrancar(opciones = {}) {
  const img = capturaCompleta();
  const s = crearServidor({ codigo: CODIGO, capturar: async () => img, enHilos: false, ...opciones });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  return { s, puerto: s.address().port, interno: s.interno, cerrar: () => new Promise((r) => { s.close(r); s.closeAllConnections?.(); }) };
}

/** Espera (hasta `ms`) a que `cond` sea verdad. */
export const hasta = async (cond, ms = 10000) => { const t0 = Date.now(); while (!(await cond()) && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 20)); return cond(); };
