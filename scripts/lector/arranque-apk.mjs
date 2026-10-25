/**
 * Lo primero que arranca Node en la APK (3.72.3). En nodejs-mobile, cuando
 * Node sale, sale el proceso entero: la app se cerraba sola («se cerró ella
 * misma, código 1») y no quedaba ni rastro del porqué. Un error al CARGAR el
 * lector (un fichero que falta, uno que no se entiende) pasa antes de que
 * en-tablet.mjs pueda poner sus vigilantes, así que aquí se ponen PRIMERO y
 * el lector se carga después, dentro de un try: lo que falle, se apunta en
 * `fallo-nodo.txt` (la app lo enseña arriba, con «Copiar») y Node se queda
 * vivo para que la app no se cierre.
 *
 * Sin imports del lector arriba del todo, a propósito: solo node:fs y node:path.
 */
import { writeFileSync } from 'node:fs';
import { join } from 'node:path';

const casa = process.env.LECTOR_CASA || '.';
const apuntar = (tipo, e) => {
  const texto = `${tipo}: ${e?.stack ?? e}`.slice(0, 4000);
  console.error(`ERROR sin recoger (${tipo}); el lector sigue. ${texto}`);
  try { writeFileSync(join(casa, 'fallo-nodo.txt'), `${new Date().toISOString()} ${texto}`); } catch { /* sin disco: queda en el registro */ }
};
process.on('uncaughtException', (e) => apuntar('excepción', e));
process.on('unhandledRejection', (e) => apuntar('promesa', e));

try {
  const { principal } = await import('./en-tablet.mjs');
  await principal();
} catch (e) {
  apuntar('al arrancar', e);
  // Sin nada pendiente, Node acabaría y con él la app: se queda esperando.
  setInterval(() => {}, 1 << 30);
}
