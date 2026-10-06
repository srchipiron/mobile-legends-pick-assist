/**
 * La voz de los consejos en directo (3.44.0): `termux-tts-speak` de
 * Termux:API, en el MÓVIL. No toca la tablet: lo único que hace en ella el
 * lector sigue siendo la captura de leer.mjs.
 *
 * Lo que se dice llega de la app (por `POST /vigilar`, solo desde su
 * origen), así que se trata como dato: va por la ENTRADA ESTÁNDAR, nunca
 * como argumento (un texto que empezara por «-» se leería como una opción
 * del programa), sin caracteres de control y con un tope de largo. El
 * único argumento variable es el idioma, de una lista cerrada.
 *
 * Sin Termux:API instalado el programa no existe: `hablarConTermux` lo dice
 * (`falta`) y el lector lo cuenta en `/final` para que la app lo enseñe.
 */
import { execFile } from 'node:child_process';

export const IDIOMAS_VOZ = ['es', 'en'];
/** Lo más largo que se lee de una vez: un aviso son una a tres frases. */
export const TOPE_VOZ = 400;
/** Lo que puede tardar en decirse un aviso antes de darlo por colgado. */
export const PLAZO_VOZ_MS = 45000;

/** El texto como se va a decir: sin caracteres de control, espacios juntos, con tope. */
export function limpiarTexto(texto) {
  // Los caracteres de control fuera, por su código (la regla de ESLint no deja escribirlos en una expresión).
  const sinControl = [...String(texto ?? '')].map((c) => { const n = c.codePointAt(0); return n < 32 || (n >= 127 && n < 160) ? ' ' : c; }).join('');
  return sinControl.replace(/\s+/g, ' ').trim().slice(0, TOPE_VOZ);
}

/**
 * Dice `texto` en voz alta. Devuelve una promesa con `null` si fue bien o
 * el tipo de fallo: 'falta' (no está Termux:API) u 'otro'. Nunca lanza.
 */
export function hablarConTermux(texto, idioma = 'es') {
  const limpio = limpiarTexto(texto);
  const lengua = IDIOMAS_VOZ.includes(idioma) ? idioma : 'es';
  if (!limpio) return Promise.resolve(null);
  return new Promise((resolver) => {
    let hijo;
    try {
      hijo = execFile('termux-tts-speak', ['-l', lengua], { timeout: PLAZO_VOZ_MS }, (err) => {
        resolver(err ? (err.code === 'ENOENT' ? 'falta' : 'otro') : null);
      });
    } catch {
      resolver('otro');
      return;
    }
    hijo.stdin?.on('error', () => {});
    hijo.stdin?.end(limpio);
  });
}
