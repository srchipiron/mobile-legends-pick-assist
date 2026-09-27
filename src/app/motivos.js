/**
 * Qué motivos se enseñan de una sugerencia y en qué orden: los que van a
 * favor delante (sin perder el orden del motor entre los del mismo signo) y
 * como mucho `cuantos`. Puro, para poder probarlo sin depender de que el
 * dato del día traiga una sugerencia con motivos de los dos signos: la
 * prueba de navegador que lo vigilaba no podía cazar la mutación con los
 * datos del 27 de septiembre de 2026.
 */
export function motivosAEnsenar(motivos = [], cuantos = 3) {
  return [...motivos.filter((m) => m?.bueno), ...motivos.filter((m) => !m?.bueno)].slice(0, cuantos);
}
