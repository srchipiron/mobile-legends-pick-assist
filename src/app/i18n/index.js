import ES from './es.js';
import EN from './en.js';

/**
 * Dos idiomas: español e inglés. Los textos que salen del MOTOR (los motivos
 * de cada tarjeta, las frases del análisis) viajan como clave más parámetros,
 * no como frase hecha: el motor no sabe de idiomas y la traducción no se
 * cuela en la lógica. Todo lo que se ve en pantalla pasa por `t()`; la única
 * excepción a propósito es el diagnóstico, que es depuración.
 */

export const IDIOMAS = ['es', 'en'];
const TEXTOS = { es: ES, en: EN };

/** El idioma del móvil, si lo hablamos. Si no, inglés. */
export function idiomaPorDefecto() {
  const pref = typeof navigator !== 'undefined' ? (navigator.languages ?? [navigator.language]) : [];
  for (const l of pref) {
    const corto = String(l ?? '').slice(0, 2).toLowerCase();
    if (IDIOMAS.includes(corto)) return corto;
  }
  return 'en';
}

/**
 * Traductor. Si falta una clave devuelve la clave misma: un texto sin
 * traducir se ve a la legua en vez de quedarse en blanco.
 *
 * Plural: «{n|línea|líneas}» elige por el valor de `n` (antes salía «1 líneas
 * abiertas»). Una lista de CLAVES en un parámetro se traduce elemento a
 * elemento y se une con «y»/«and».
 */
export function crearT(idioma) {
  const dic = TEXTOS[idioma] ?? EN;
  const y = idioma === 'es' ? ' y ' : ' and ';
  const t = (clave, params) => {
    const plantilla = dic[clave] ?? TEXTOS.es[clave] ?? clave;
    if (!params) return plantilla;
    return plantilla
      .replace(/\{(\w+)\|([^|}]*)\|([^}]*)\}/g, (_, k, uno, varios) => (Number(params[k]) === 1 ? uno : varios))
      .replace(/\{(\w+)\}/g, (_, k) => {
        const v = params[k];
        if (Array.isArray(v)) {
          const partes = v.map((x) => (typeof x === 'string' && (dic[x] ?? TEXTOS.es[x]) ? t(x) : x));
          return partes.length > 1 ? `${partes.slice(0, -1).join(', ')}${y}${partes.at(-1)}` : (partes[0] ?? '');
        }
        return v ?? `{${k}}`;
      });
  };
  return t;
}

/** Para las pruebas: que ningún idioma se haya quedado a medias. */
export const CLAVES = Object.keys(ES);
export const DICCIONARIOS = TEXTOS;
