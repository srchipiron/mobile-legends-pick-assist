/**
 * El informe del diagnóstico: líneas de texto plano con estado, para copiar
 * y pegar desde el móvil. La primera línea es lo único que se lee con prisa,
 * así que tiene que ser cierta de un vistazo («Todo correcto (1 avisos)» se
 * contradecía y estaba mal escrito).
 *
 * En español a propósito: es depuración, no interfaz.
 */

export const OK = 'OK  ';
export const MAL = 'FALLO';
export const AVISO = 'AVISO';

/** La primera línea del informe. */
export function titular(fallos, avisos) {
  const nf = (n, uno, varios) => `${n} ${n === 1 ? uno : varios}`;
  if (fallos && avisos) return `${nf(fallos, 'FALLO', 'FALLOS')} y ${nf(avisos, 'aviso', 'avisos')}`;
  if (fallos) return nf(fallos, 'FALLO', 'FALLOS');
  if (avisos) return `Sin fallos, ${nf(avisos, 'aviso', 'avisos')}`;
  return 'Todo correcto';
}

/**
 * @typedef {object} Informe
 * @property {(estado: string, texto: string) => void} add
 * @property {(cond: boolean, bien: string, mal: string, blando?: boolean) => void} check  FALLO si no se cumple; AVISO si `blando`
 * @property {(titulo: string) => void} seccion
 * @property {(texto: string) => void} linea
 * @property {string[]} lineas
 * @property {() => number} fallos
 * @property {() => number} avisos
 */

/** @returns {Informe} */
export function crearInforme() {
  const lineas = [];
  let fallos = 0;
  let avisos = 0;
  const add = (estado, texto) => {
    if (estado === MAL) fallos += 1;
    if (estado === AVISO) avisos += 1;
    lineas.push(`[${estado}] ${texto}`);
  };
  return {
    lineas,
    add,
    check: (cond, bien, mal, blando = false) => add(cond ? OK : (blando ? AVISO : MAL), cond ? bien : mal),
    seccion: (t) => lineas.push('', `--- ${t} ---`),
    linea: (texto) => lineas.push(texto),
    fallos: () => fallos,
    avisos: () => avisos,
  };
}
