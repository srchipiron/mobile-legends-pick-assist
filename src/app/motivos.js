/**
 * Qué motivos se enseñan de una sugerencia y en qué orden: los que van a
 * favor delante (sin perder el orden del motor entre los del mismo signo) y
 * como mucho `cuantos`. Coger «el primero» sin mirar el signo enseñaba
 * «pierde contra Selena» como la razón para cogerlo.
 */
export function motivosAEnsenar(motivos = [], cuantos = 3) {
  return [...motivos.filter((m) => m?.bueno), ...motivos.filter((m) => !m?.bueno)].slice(0, cuantos);
}
