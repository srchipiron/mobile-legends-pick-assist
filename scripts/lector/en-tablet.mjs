/**
 * El lector DENTRO de la tablet (3.61.0, elegido por Javi: «B»). Lo arranca
 * la APK de `android/` con Node embebido, y la captura ya no es adb: es la
 * pantalla de la propia tablet, que la APK graba con el permiso normal de
 * Android (MediaProjection) y entrega por 127.0.0.1 con un secreto. Así no
 * hace falta la depuración inalámbrica, ni emparejar, ni puertos que cambian.
 *
 * Lo que cambia frente a Termux, y por qué es seguro:
 * - Escucha en la wifi (la app está en el MÓVIL), pero solo contesta con el
 *   código de vinculación (`X-Lector-Codigo`, `crearPortero`), a la app
 *   publicada (`origenPermitido`) y con una IP privada como `Host`.
 * - La captura y la voz las da la APK en 127.0.0.1 (`LECTOR_INTERNO`); este
 *   fichero no habla con nada más ni lanza programas.
 * - Nada toca la pantalla ni el juego: solo se LEE lo que se ve.
 *
 * Variables (las pone la APK): LECTOR_INTERNO (http://127.0.0.1:PUERTO),
 * LECTOR_SECRETO, LECTOR_CODIGO, LECTOR_CASA (carpeta de la app).
 */
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { crearServidor, crearElectorDeCaptura, cargarLoAprendido, podarCapturas, PUERTO } from './servir.mjs';
import { limpiarTexto } from './voz.mjs';
import { leerCrudo, escribirPngRapido } from './png.mjs';

/** Solo 127.0.0.1: la APK es la única que da la captura. */
export const esInterno = (u) => typeof u === 'string' && /^http:\/\/127\.0\.0\.1:\d{1,5}$/.test(u);

/** Un código de vinculación decente: 8 o más letras o cifras. */
export const codigoValido = (c) => typeof c === 'string' && /^[A-Za-z0-9]{8,64}$/.test(c);

/**
 * La captura de la APK, siempre en crudo (la cabecera de 16 bytes de
 * `screencap` + RGBA: así la APK no comprime nada) y con su secreto. Lo que
 * el servidor pide en PNG (las pantallas del final) se comprime aquí.
 */
export function capturaDeLaApk(base, secreto, { pedir = fetch } = {}) {
  if (!esInterno(base)) throw new Error('la captura solo puede venir de 127.0.0.1');
  return async ({ crudo = false } = {}) => {
    let r;
    try { r = await pedir(`${base}/captura`, { headers: { 'X-Secreto': secreto }, signal: AbortSignal.timeout(15000) }); } catch (e) { throw Object.assign(new Error(`la app del lector no contesta (${e.message})`), { tipo: 'captura' }); }
    if (!r.ok) throw Object.assign(new Error(r.status === 409 ? 'La tablet no está grabando la pantalla: abre la app del lector y toca «Empezar».' : `captura ${r.status}`), { tipo: 'captura' });
    const buf = Buffer.from(await r.arrayBuffer());
    return crudo ? buf : escribirPngRapido(leerCrudo(buf));
  };
}

/** La voz de la APK (TextToSpeech de Android): null si sonó, «falta» si no hay voz. */
export function vozDeLaApk(base, secreto, { pedir = fetch } = {}) {
  if (!esInterno(base)) throw new Error('la voz solo puede ir a 127.0.0.1');
  return async (texto, idioma = 'es') => {
    const limpio = limpiarTexto(texto);
    if (!limpio) return null;
    try {
      const r = await pedir(`${base}/voz`, { method: 'POST', headers: { 'X-Secreto': secreto, 'Content-Type': 'application/json' }, body: JSON.stringify({ texto: limpio, idioma: idioma === 'en' ? 'en' : 'es' }), signal: AbortSignal.timeout(60000) });
      return r.ok ? null : r.status === 404 ? 'falta' : 'otro';
    } catch { return 'otro'; }
  };
}

export async function principal(env = process.env) {
  const registrar = (m) => console.log(m);
  const base = env.LECTOR_INTERNO, secreto = env.LECTOR_SECRETO, codigo = env.LECTOR_CODIGO;
  if (!esInterno(base) || !secreto || !codigoValido(codigo)) throw new Error('faltan LECTOR_INTERNO, LECTOR_SECRETO o un LECTOR_CODIGO válido');
  const carpeta = join(env.LECTOR_CASA || '.', 'capturas');
  mkdirSync(carpeta, { recursive: true });
  podarCapturas(carpeta);
  const servidor = crearServidor({
    capturar: capturaDeLaApk(base, secreto), hablar: vozDeLaApk(base, secreto), codigo,
    // Por qué se cerró la app la última vez (3.61.5, lo dice Android): el Diagnóstico del móvil lo enseña.
    estadoExtra: { salida: String(env.LECTOR_ULTIMA_SALIDA ?? '').slice(0, 500) || null },
    elector: crearElectorDeCaptura(), carpeta, registrar, ...cargarLoAprendido(registrar),
  });
  const puerto = Number(env.LECTOR_PUERTO ?? PUERTO);
  await new Promise((r) => servidor.listen(puerto, env.LECTOR_ESCUCHA ?? '0.0.0.0', r));
  registrar(`Lector en la tablet esperando en el puerto ${servidor.address().port}.`);
  return servidor;
}

if (process.env.LECTOR_INTERNO && process.argv[1]?.endsWith('en-tablet.mjs')) await principal();
