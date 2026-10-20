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
