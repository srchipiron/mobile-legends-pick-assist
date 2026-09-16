/**
 * La ÚNICA capa de persistencia de la app: localStorage, con try/catch por
 * el modo incógnito y lo saneado al cargar.
 *
 * OJO: estas claves siguen diciendo `roam-picker` aunque la app se llame
 * Mobile Legends Pick Assist. NO se renombran: el almacenamiento del
 * navegador va por clave, así que cambiarlas borraría la maestría y las
 * partidas que Javi ya tiene guardadas. El nombre bonito va por fuera; esto
 * es plomería.
 */
export const CLAVES = {
  draft: 'roam-picker:draft',
  maestria: 'roam-picker:mastery',
  partidas: 'roam-picker:partidas',
  rango: 'roam-picker:rank',
  linea: 'roam-picker:linea',
  idioma: 'roam-picker:idioma',
};

/** Lee un valor guardado; con cualquier fallo (JSON roto, sin almacén) devuelve `porDefecto`. */
export function leer(clave, porDefecto) {
  try { return JSON.parse(localStorage.getItem(clave) ?? 'null') ?? porDefecto; } catch { return porDefecto; }
}

/** Guarda un valor. En incógnito o con el almacén lleno, no pasa nada: la sesión sigue. */
export function guardar(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* modo incógnito */ }
}

/** ¿Hay almacenamiento de verdad? (Para el diagnóstico.) */
export function hayAlmacen() {
  try {
    localStorage.setItem('__t', '1');
    localStorage.removeItem('__t');
    return true;
  } catch {
    return false;
  }
}
