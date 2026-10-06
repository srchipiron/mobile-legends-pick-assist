/**
 * Lo que se lee de una captura, partido en tres trozos que no dependen uno
 * de otro (3.39.0): los diez baneos, los cinco picks enemigos y tu equipo.
 * Así el lector de Termux los hace a la vez en tres hilos
 * (`lectura-tarea.mjs`, `lectorEnHilos` en servir.mjs) y aquí, de uno en
 * uno, con el MISMO resultado (hay prueba). Puro: recibe píxeles.
 *
 * Va aparte de servir.mjs a propósito: un hilo que importara servir.mjs
 * vería en `process.argv` el mismo fichero que el proceso principal y
 * arrancaría otro servidor.
 */
import { leerPng } from './png.mjs';
import { leerBaneos, leerPicksEnemigos, leerAliados, filaPropia, sinRepetidos } from './leer.mjs';
import { carasAprendidas } from './aprender.mjs';

/** Los tres trozos, en el orden en que se reparten entre los hilos. */
export const PARTES = ['baneos', 'enemigos', 'aliados'];

/** Un trozo de la lectura de `img` (ya decodificada). */
export function leerParte(img, parte, caras, aprendido = null) {
  if (parte === 'baneos') return leerBaneos(img, caras);
  if (parte === 'enemigos') return leerPicksEnemigos(img, caras, { posiciones: aprendido?.picks ?? undefined, extra: carasAprendidas(aprendido) });
  if (parte === 'aliados') return { aliados: leerAliados(img, caras), tuyoFila: filaPropia(img) };
  throw new Error(`parte desconocida: ${parte}`);
}

const plano = (r) => ({ nombre: r.nombre ?? null, candidato: r.candidato ?? null, parecido: Math.round((r.parecido ?? 0) * 1000) / 1000 });

/**
 * Los tres trozos juntos, como los devuelve `/leer`: baneos de los dos
 * lados, picks enemigos (con lo aprendido de esta tablet si lo hay) y TU
 * equipo: las cinco filas de la izquierda (`aliados`) y cuál eres tú
 * (`tuyo`: el nombre de la fila con tu nombre en amarillo, o null si no se
 * distingue; `tuyoFila` dice cuál, de 0 a 4, o −1).
 */
export function juntarLectura({ ancho, alto }, { baneos, enemigos, aliados }) {
  const pickados = sinRepetidos(enemigos), nuestros = sinRepetidos(aliados.aliados);
  // Un equipo no banea dos veces al mismo héroe; los DOS equipos sí pueden
  // banear al mismo (Hirara en la captura real, Belerick y Atlas en la
  // primera tarde): se quita el repetido dentro de cada lado, no entre lados.
  return {
    ancho, alto,
    tuyos: sinRepetidos(baneos.tuyos).map(plano), suyos: sinRepetidos(baneos.suyos).map(plano), enemigos: pickados.map(plano),
    aliados: nuestros.map(plano), tuyoFila: aliados.tuyoFila, tuyo: aliados.tuyoFila >= 0 ? (nuestros[aliados.tuyoFila].nombre ?? null) : null,
  };
}

/** La lectura entera de una captura, en este hilo. */
export function leerCaptura(captura, caras, aprendido = null) {
  // Un PNG, o la imagen ya lista (la captura en crudo, 3.45.0).
  const img = captura?.rgba ? captura : leerPng(captura);
  const [baneos, enemigos, aliados] = PARTES.map((p) => leerParte(img, p, caras, aprendido));
  return juntarLectura(img, { baneos, enemigos, aliados });
}
