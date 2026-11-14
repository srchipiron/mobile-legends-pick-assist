/**
 * Cómo se escribe `roam-meta.json`: matrices, builds, winrate y curva por
 * línea e historia a UNA LÍNEA POR HÉROE (el diff dice «cambiaron estos 12
 * héroes», legible desde el móvil) y las matrices a 4 decimales (la quinta
 * cifra es ruido) [D]. `serializar(JSON.parse(f)) + '\n' === f` [C].
 */

/** El texto del fichero, sin el `\n` final (lo pone quien escribe). */
export function serializar(out) {
  // Una marca de texto normal: JSON.stringify escapa un carácter de control y la marca no volvía a encontrarse [C].
  const MARCA = '@@fila';
  const filas = [];
  const enUnaLinea = (valor) => {
    filas.push(JSON.stringify(valor));
    return `${MARCA}:${filas.length - 1}:${MARCA}`;
  };
  const a4 = (fila) => Object.fromEntries(Object.entries(fila ?? {}).map(([n, v]) => [n, typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v]));
  const matriz = (m) => Object.fromEntries(Object.entries(m ?? {}).map(([k, fila]) => [k, enUnaLinea(a4(fila))]));
  const porHeroe = (m) => Object.fromEntries(Object.entries(m ?? {}).map(([k, v]) => [k, enUnaLinea(v)]));
  const texto = JSON.stringify({
    ...out,
    counters: matriz(out.counters),
    synergies: matriz(out.synergies),
    builds: porHeroe(out.builds),
    ...(out.winrateLinea ? { winrateLinea: porHeroe(out.winrateLinea) } : {}),
    ...(out.curvaLinea ? { curvaLinea: porHeroe(out.curvaLinea) } : {}),
    ...(out.historia ? { historia: out.historia.map(({ fecha, ...porRango }) => ({ fecha, ...porHeroe(porRango) })) } : {}),
  }, null, 2);
  return texto.replace(new RegExp(`"${MARCA}:(\\d+):${MARCA}"`, 'g'), (_, i) => filas[Number(i)]);
}
