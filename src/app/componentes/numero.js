/** Acepta 50,6 y 50.6: el teclado español pone coma y Number() la rechaza. */
export function leerDecimal(crudo) {
  if (crudo == null) return NaN;
  const limpio = String(crudo).trim().replace(',', '.');
  if (limpio === '') return NaN;
  return Number(limpio);
}
