/**
 * La escritura del JSON: aqui no se decide nada del dato, solo como se
 * escribe. Todo el porque esta en el comentario de `serializar`.
 */

/**
 * El JSON de salida, con las dos matrices en UNA LINEA POR HEROE.
 *
 * Desde que los counters vienen completos son 17.556 numeros. Con la
 * indentacion normal eso son 17.556 lineas: el fichero pasa de 377 KB a 623 KB
 * y el diff se vuelve ilegible, justo lo que Javi no puede permitirse
 * revisando desde el movil. Con una linea por heroe, el diff dice "cambiaron
 * estos 12 heroes" en vez de doce mil lineas sueltas.
 *
 * Los winrates se redondean a cuatro decimales. La quinta cifra de un winrate
 * es ruido: la API la da, pero no significa nada y ocupa.
 */
export function serializar(out) {
  // Marca de texto normal, no un caracter de control: JSON.stringify escapa
  // \u0000 como la secuencia literal "\u0000", asi que la marca no volvia a
  // encontrarse y el fichero salia con basura donde iban los datos.
  const MARCA = '@@fila';
  const filas = [];
  const compactar = (m) => Object.fromEntries(Object.entries(m ?? {}).map(([k, fila]) => {
    const redondeada = Object.fromEntries(
      Object.entries(fila ?? {}).map(([n, v]) => [n, typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v]),
    );
    filas.push(JSON.stringify(redondeada));
    return [k, `${MARCA}:${filas.length - 1}:${MARCA}`];
  }));

  // Las builds tambien van a una linea por heroe: son tres builds por linea y
  // con la indentacion normal se comen 3.000 lineas de diff por nada.
  const compactarBuilds = (m) => Object.fromEntries(Object.entries(m ?? {}).map(([k, porLinea]) => {
    filas.push(JSON.stringify(porLinea));
    return [k, `${MARCA}:${filas.length - 1}:${MARCA}`];
  }));

  const texto = JSON.stringify(
    {
      ...out,
      counters: compactar(out.counters),
      synergies: compactar(out.synergies),
      builds: compactarBuilds(out.builds),
    },
    null,
    2,
  );
  return texto.replace(
    new RegExp(`"${MARCA}:(\\d+):${MARCA}"`, 'g'),
    (_, i) => filas[Number(i)],
  );
}
