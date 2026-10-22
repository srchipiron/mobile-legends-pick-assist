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
 * @property {{ donde: string|null, auto: boolean, estado: object|null, ultimo: object|null, ahora: number }|null} [lector]
 *   el lector de la tablet (3.61.4): dónde está (la IP de la tablet, o null si es el de Termux), si lee solo,
 *   si contesta ahora y cómo fue la última lectura. NUNCA el código de vinculación.
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
  // El lector (3.61.4): desde el móvil no hay otra forma de saber si contesta y qué pasó.
  const lec = entorno.lector;
  if (lec) {
    inf.linea(`Lector: ${lec.donde ? `en la tablet (${lec.donde})` : 'el de Termux, en este móvil'} · leer solo: ${lec.auto ? 'sí' : 'no'}`);
    if (lec.estado) {
      const a = lec.estado.aprendido;
      inf.check(lec.estado.ok,
        `El lector contesta${a ? ` (aprendido de ${a.capturas} capturas: ${a.caras} caras de rivales, ${a.aliados} de tu equipo)` : ''}`,
        `El lector no contesta (${lec.estado.tipo}): ${lec.donde ? 'abre «Lector MLBB» en la tablet y toca «Empezar a leer»; si cambió de wifi, vuelve a escanear su QR' : 'abre Termux y escribe: lector'}`,
        true);
      // Por qué se cerró la app de la tablet la última vez (3.61.5): «se cierra sola» tiene varias causas.
      if (lec.estado.salida) inf.linea(`Tablet: ${lec.estado.salida.replace(/\n/g, ' · ')}`);
      // Lo que cuentan el lector y la APK de sí mismos (3.63.0).
      const l = lec.estado.lector, tb = lec.estado.tablet;
      if (l) inf.linea(`Lector: encendido hace ${l.minutos} min · ${l.lecturas} lecturas · ${l.fallosCaptura} capturas fallidas · ${l.memoriaMB} MB`);
      if (tb) inf.linea(`Lector MLBB ${tb.apk ?? '?'}: grabando ${tb.grabando ? 'sí' : 'no'} · burbuja ${tb.burbuja ? 'sí' : 'sin permiso'} · ahorro de batería ${tb.bateriaLibre ? 'quitado' : 'puesto'} · memoria libre ${tb.memoriaLibreMB ?? '?'} MB${tb.memoriaBaja ? ' (BAJA)' : ''}`);
    }
    if (lec.ultimo) {
      const min = Math.max(0, Math.round((lec.ahora - lec.ultimo.cuando) / 60000));
      inf.linea(`Última lectura: hace ${min} min · ${lec.ultimo.ok ? `bien (${lec.ultimo.nuevos} nuevos)` : `falló (${lec.ultimo.tipo})`}`);
    }
  }
}
