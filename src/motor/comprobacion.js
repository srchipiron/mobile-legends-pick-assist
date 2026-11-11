import { conResultado } from './registro.js';
import { wilson } from './habitos.js';

/**
 * Comprobar la tablet cada semana (3.101.0). Del 26 de octubre al 10 de
 * noviembre de 2026 la tablet apuntó 132 victorias de 135 y nadie lo vio en
 * dos semanas; con tres partidas suyas comprobadas a mano cada semana, un
 * fallo así sale en días. Las tres se eligen AL AZAR entre las que apuntó
 * sola y nadie ha tocado (una muestra sin sesgo de lo que la tablet apunta),
 * con un azar fijo por semana: la misma lista al volver a abrir.
 * `POR_SEMANA` es decisión de producto (un minuto a la semana).
 */
export const POR_SEMANA = 3;
export const SEMANA_MS = 7 * 86400000;
/** Un lunes (5 de enero de 2026, 00:00 UTC): las semanas empiezan en lunes. */
const LUNES = Date.UTC(2026, 0, 5);
export const semanaDe = (t) => Math.floor((t - LUNES) / SEMANA_MS);
/** Cuántas comprobadas se guardan: unas tres años de semanas. */
export const TOPE_COMPROBADAS = 500;

/** FNV-1a de 32 bits: el azar fijo de cada semana. */
function huella(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h;
}

/** Lo guardado, con forma: `{ t, bien, que, cuando }`, sin repetir partida, las más nuevas. */
export function sanearComprobadas(lista) {
  const vistas = new Set();
  return (Array.isArray(lista) ? lista : [])
    .filter((c) => c && Number.isFinite(c.t) && typeof c.bien === 'boolean' && Number.isFinite(c.cuando))
    .map((c) => ({ t: c.t, bien: c.bien, que: c.bien ? null : (c.que === 'heroe' ? 'heroe' : 'resultado'), cuando: c.cuando }))
    .sort((a, b) => b.cuando - a.cuando)
    .filter((c) => (vistas.has(c.t) ? false : (vistas.add(c.t), true)))
    .slice(0, TOPE_COMPROBADAS);
}

/**
 * Las que toca comprobar ahora: hasta `POR_SEMANA` menos las ya comprobadas
 * esta semana, de las apuntadas por la tablet en los últimos siete días, con
 * resultado del que fiarse y sin tocar (`editada`: lo arreglado ya es la
 * verdad, no lo que apuntó ella).
 */
export function paraComprobar(partidas, comprobadas = [], { ahora = Date.now(), porSemana = POR_SEMANA } = {}) {
  const semana = semanaDe(ahora);
  const hechas = sanearComprobadas(comprobadas);
  const faltan = porSemana - hechas.filter((c) => semanaDe(c.cuando) === semana).length;
  if (faltan <= 0) return [];
  const ya = new Set(hechas.map((c) => c.t));
  return (Array.isArray(partidas) ? partidas : [])
    .filter((p) => p?.origen === 'lector' && conResultado(p) && typeof p.pick === 'string' && !Number.isFinite(p.editada)
      && Number.isFinite(p.t) && p.t <= ahora && ahora - p.t < SEMANA_MS && !ya.has(p.t))
    .sort((a, b) => huella(`${semana}:${a.t}`) - huella(`${semana}:${b.t}`))
    .slice(0, faltan);
}

/** ¿Cuánto acierta la tablet en lo que comprobaste? Con su intervalo (Wilson), y los fallos por tipo. */
export function precisionDeLaTablet(comprobadas = []) {
  const lista = sanearComprobadas(comprobadas);
  const n = lista.length;
  const bien = lista.filter((c) => c.bien).length;
  if (!n) return { n: 0, bien: 0, mal: 0, resultado: 0, heroe: 0 };
  return { n, bien, mal: n - bien, resultado: lista.filter((c) => c.que === 'resultado').length, heroe: lista.filter((c) => c.que === 'heroe').length, wr: bien / n, ...wilson(bien, n) };
}
