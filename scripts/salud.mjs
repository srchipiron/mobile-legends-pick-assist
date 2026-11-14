/**
 * Las filas de historial/salud.jsonl, línea a línea: una rota (un commit
 * cortado) vaciaba el historial entero y el diagnóstico comparaba con un
 * pasado que no existía [C]. Las rotas se saltan y se cuentan. Lo leen
 * vite.config.js, diagnostico.mjs, tendencia.mjs y datos-rancios.mjs.
 */
export function filasDeSalud(texto, { max = Infinity } = {}) {
  const filas = [];
  let rotas = 0;
  for (const linea of String(texto ?? '').split('\n')) {
    if (!linea.trim()) continue;
    try { filas.push(JSON.parse(linea)); } catch { rotas += 1; }
  }
  return { filas: Number.isFinite(max) ? filas.slice(-max) : filas, rotas };
}

/**
 * Lo que aguantan los datos sin actualizarse antes de abrir incidencia: el
 * mismo límite que el aviso del despliegue y «El sistema» en Ajustes [P]. Un
 * aviso del diagnóstico no abre incidencia, y una API caída nueve días dejó
 * 353 filas sin un solo fallo [M].
 */
export const DATOS_RANCIOS_H = 72;

/** La frase de por qué hay que mirar, con la última fila; null si los datos están al día o no se sabe. */
export function datosRancios(filas = [], limite = DATOS_RANCIOS_H) {
  const f = filas.at(-1);
  const h = Number(f?.edadHoras);
  if (!Number.isFinite(h) || h <= limite) return null;
  return `Los datos que sirve la app tienen ${Math.round(h)} horas (son del ${String(f.datosDe ?? '?').slice(0, 16).replace('T', ' ')} UTC): la actualización lleva más de ${limite} horas sin entrar. Mira las corridas de «Actualizar datos meta».`;
}
