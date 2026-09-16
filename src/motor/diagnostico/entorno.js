/**
 * @typedef {object} Entorno
 * @property {string} version
 * @property {string|null} buildTime
 * @property {string|null} versionPublicada   lo que sirve Pages (version.json, sin caché), si se pudo pedir
 * @property {string} rango
 * @property {number} width
 * @property {number} height
 * @property {boolean} standalone
 * @property {boolean} storage
 * @property {string} sw
 * @property {boolean} [sinDatosPersonales]   en el bot no hay móvil: maestría y partidas no se juzgan
 */

/** @param {import('./informe.js').Informe} inf */
export function seccionEntorno(inf, entorno = {}) {
  inf.seccion('ENTORNO');
  inf.linea(`Versión: ${entorno.version ?? '?'} · compilada ${entorno.buildTime ?? '?'}`);
  inf.linea(`Pantalla: ${entorno.width}x${entorno.height} · ${entorno.width > entorno.height ? 'horizontal' : 'vertical'}`);
  inf.linea(`Instalada como app: ${entorno.standalone ? 'sí' : 'no'}`);
  inf.check(entorno.storage, 'Almacenamiento local disponible', 'Sin almacenamiento local: no se guardan maestría ni draft');
  inf.linea(`Service worker: ${entorno.sw ?? 'desconocido'}`);
  // El service worker guarda la app entera y los datos se refrescan por su
  // cuenta: se pueden ver datos de hoy con la app de ayer, y el diagnóstico
  // decía «todo correcto» enseñando una versión vieja.
  if (entorno.versionPublicada) {
    inf.check(entorno.versionPublicada === entorno.version,
      `Es la última publicada (${entorno.versionPublicada})`,
      `Estás usando la ${entorno.version} y la publicada es la ${entorno.versionPublicada}: cierra la app y vuelve a abrirla`,
      true);
  }
}
