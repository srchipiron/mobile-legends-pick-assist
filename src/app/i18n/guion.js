/**
 * El guion de los consejos en directo (3.44.0), traducido para el lector:
 * cada aviso del motor (`plan.directo`: minuto y frases con clave) a texto, y
 * una frase de cierre por tramo de duración. Con su huella, para volver a
 * mandarlo solo si cambia (fijaste otro pick).
 *
 * Aquí y no en lector.js desde 3.71.0: la tablet lo traduce ella sola, sin el
 * móvil, y la APK solo lleva lo que importa el lector (este fichero y los
 * textos, sin React ni nada del navegador).
 */
export function guionTraducido(plan, t, idioma = 'es') {
  const guion = (plan?.directo ?? []).map((a) => ({ min: a.min, texto: a.partes.map((p) => t(p.clave, p.params)).join(' ') }));
  const cierres = (plan?.cierres ?? []).map((c) => t(c.clave, c.params));
  return { guion, cierres, idioma, huella: JSON.stringify([guion, cierres, idioma]) };
}
