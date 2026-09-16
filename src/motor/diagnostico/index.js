import { cobertura } from '../matrices.js';
import { crearInforme, titular } from './informe.js';
import { seccionEntorno } from './entorno.js';
import { seccionDraft } from './draft.js';
import { seccionDatos, seccionCobertura, seccionSalud, seccionHistorial } from './datos.js';
import { seccionPro } from './pro.js';
import { seccionMotor, seccionModelo } from './motor.js';
import { seccionMaestria, seccionPartidas } from './personal.js';

export { titular } from './informe.js';
export { medirRuido, cifrasDe } from './datos.js';
export { MINIMO_PARA_MEDIR_PRO } from './pro.js';

/**
 * Autodiagnóstico. Se ejecuta EN EL MÓVIL contra los datos que tiene la app
 * en ese momento (botón Diagnóstico → Copiar), y en el bot contra lo que la
 * app SIRVE (scripts/diagnostico.mjs): el mismo código en los dos sitios.
 * Existe porque `npm test` comprueba que el motor es correcto, no que la
 * descarga de hoy haya salido bien ni que el móvil enseñe lo que debe.
 *
 * @param {object} d
 * @param {import('../draft.js').Datos} d.datos     lo que devuelve prepararDatos
 * @param {string} d.linea
 * @param {object} d.maestria         la que usa el motor (maestriaEfectiva)
 * @param {object|null} d.maestriaManual  la escrita a mano (referencia del Veredicto)
 * @param {object[]} d.partidas
 * @param {import('./entorno.js').Entorno} d.entorno
 * @param {import('./draft.js').DraftDiagnostico|null} d.draft
 * @param {object[]|null} d.historial   filas de historial/salud.jsonl
 * @param {object|null} d.pro           pro.json
 * @returns {{ texto: string, fallos: number, avisos: number }}
 */
export function diagnosticar({ datos, linea = 'roam', maestria = {}, maestriaManual = null, partidas = [], entorno = {}, draft = null, historial = null, pro = null }) {
  const inf = crearInforme();
  seccionEntorno(inf, entorno);
  seccionDraft(inf, { draft, linea, entorno });
  seccionDatos(inf, { datos, linea, entorno });
  seccionCobertura(inf, { datos, linea, entorno });
  seccionSalud(inf, { datos });
  seccionHistorial(inf, { datos, linea, historial });
  seccionPro(inf, pro);
  const cov = cobertura(datos.poolsPorLinea[linea] ?? [], datos.meta.stats, datos.meta.counters);
  seccionMotor(inf, { datos, linea, maestria, cov });
  seccionMaestria(inf, { datos, linea, maestria, entorno });
  seccionPartidas(inf, { partidas, maestria, maestriaManual, entorno });
  seccionModelo(inf, { datos, linea, maestria, pro });
  const cabecera = ['MOBILE LEGENDS PICK ASSIST · DIAGNÓSTICO', new Date().toLocaleString('es-ES'), titular(inf.fallos(), inf.avisos())];
  return { texto: [...cabecera, ...inf.lineas].join('\n'), fallos: inf.fallos(), avisos: inf.avisos() };
}
