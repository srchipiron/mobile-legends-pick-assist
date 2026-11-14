/**
 * La ÚNICA capa de persistencia de la app: localStorage con try/catch
 * (incógnito, almacén lleno); lo saneado lo hace quien carga.
 *
 * [C] Las claves dicen `roam-picker` aunque la app se llame Pick Assist: NO
 * se renombran (borrarían la maestría y las partidas de Javi). Y
 * `roam-picker:voz-callada` (la voz de 3.53–3.95) queda RESERVADA: nadie la
 * lee ni la escribe, y no se reutiliza.
 */
export const CLAVES = {
  draft: 'roam-picker:draft',
  maestria: 'roam-picker:mastery',
  partidas: 'roam-picker:partidas',
  olvidadas: 'roam-picker:olvidadas',
  comprobadas: 'roam-picker:comprobadas',
  rango: 'roam-picker:rank',
  linea: 'roam-picker:linea',
  idioma: 'roam-picker:idioma',
  tacto: 'roam-picker:tacto',
  lectorAuto: 'roam-picker:lector-auto',
  lectorTablet: 'roam-picker:lector-tablet',
  // El token de GitHub de administración (`{ token }`).
  envio: 'roam-picker:envio',
  clave: 'roam-picker:clave',
  licencias: 'roam-picker:licencias',
  // La clave de administrador de Javi (la privada vive SOLO en su móvil).
  admin: 'roam-picker:admin',
  emitidas: 'roam-picker:emitidas',
  versionVista: 'roam-picker:version-vista',
  comunidad: 'roam-picker:comunidad',
};

/** Lee un valor guardado; con cualquier fallo (JSON roto, sin almacén) devuelve `porDefecto`. */
export function leer(clave, porDefecto) {
  try { return JSON.parse(localStorage.getItem(clave) ?? 'null') ?? porDefecto; } catch { return porDefecto; }
}

/** Guarda un valor; sin almacén, la sesión sigue. */
export function guardar(clave, valor) {
  try { localStorage.setItem(clave, JSON.stringify(valor)); } catch { /* incógnito o lleno */ }
}

/** ¿Hay almacenamiento de verdad? (para el diagnóstico) */
export function hayAlmacen() {
  try { localStorage.setItem('__t', '1'); localStorage.removeItem('__t'); return true; } catch { return false; }
}
