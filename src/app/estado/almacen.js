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
  // La subida automática de partidas (3.10.0): token de GitHub, incidencia y qué se subió ya.
  envio: 'roam-picker:envio',
  // Instantes de las partidas QUITADAS a propósito (3.10.1): viajan en el código para que fundir no las resucite.
  olvidadas: 'roam-picker:olvidadas',
  // El pulso al tocar (3.22.0): true salvo que lo apagues.
  tacto: 'roam-picker:tacto',
  // El lector de la tablet leyendo solo (3.28.0): false salvo que lo enciendas.
  lectorAuto: 'roam-picker:lector-auto',
  vozCallada: 'roam-picker:voz-callada',
  // El lector en la tablet (3.61.0): dirección y código de vinculación. Clave NUEVA: sin ella, el de Termux.
  lectorTablet: 'roam-picker:lector-tablet',
  // Las claves de invitación (3.65.0). Claves NUEVAS: sin ellas no cambia nada.
  clave: 'roam-picker:clave',            // la clave de este usuario
  licencias: 'roam-picker:licencias',    // la última licencias.json vista (sin red se usa esta)
  admin: 'roam-picker:admin',            // la clave de administrador de Javi (privada: SOLO en su móvil)
  emitidas: 'roam-picker:emitidas',      // las claves que ha dado Javi: nombre, id, fechas
  // La última versión cuyas novedades se abrieron (3.65.5). Clave NUEVA: sin ella, «nuevo» sale una vez.
  versionVista: 'roam-picker:version-vista',
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
