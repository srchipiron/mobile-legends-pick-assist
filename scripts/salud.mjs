/**
 * Las filas de historial/salud.jsonl, línea a línea (3.60.5). Tres sitios lo
 * leían con un `map(JSON.parse)` dentro de un `try`: una sola línea rota
 * (un commit cortado) vaciaba el historial entero, y el diagnóstico (el del
 * móvil y el de la vigilancia) comparaba con un pasado que no existía. Las
 * rotas se saltan y se cuentan.
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
 * Lo que aguantan los datos sin actualizarse antes de abrir incidencia
 * (3.81.2): el mismo límite de rancio que el despliegue (`::warning::`) y
 * «El sistema» en Ajustes. Decisión de producto. Hasta aquí la vigilancia
 * solo abría incidencia con un FALLO, y del 10 al 19 de octubre de 2026 la
 * API caída dejó 353 filas sin un solo fallo: los datos envejecían y nadie se
 * enteraba sin preguntar.
 */
export const DATOS_RANCIOS_H = 72;

/** La frase de por qué hay que mirar, con la última fila del historial; null si los datos están al día o no se sabe. */
export function datosRancios(filas = [], limite = DATOS_RANCIOS_H) {
  const f = filas.at(-1);
  const h = Number(f?.edadHoras);
  if (!Number.isFinite(h) || h <= limite) return null;
  return `Los datos que sirve la app tienen ${Math.round(h)} horas (son del ${String(f.datosDe ?? '?').slice(0, 16).replace('T', ' ')} UTC): la actualización lleva más de ${limite} horas sin entrar. Mira las corridas de «Actualizar datos meta».`;
}
