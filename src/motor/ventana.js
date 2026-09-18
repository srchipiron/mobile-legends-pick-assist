/**
 * Qué ventana de días manda en la fuerza de un héroe.
 *
 * La ingesta guarda dos: la de 7 días (todo: estadísticas, cruces, parejas)
 * y, desde 3.2.0, la de 3 días SOLO para las estadísticas por héroe
 * (`meta.recientes`). Una media de 7 días tarda una semana en recoger un
 * parche; la de 3, tres días. Y no cuesta precisión que importe. Medido el 18
 * de septiembre de 2026 sobre los 133 héroes en Gloria, con la MISMA ruta y
 * la misma población (`/api/heroes/rank`, que admite 1, 3, 7, 15 y 30 días):
 *
 *   3 días frente a 7: σ 0,27 pp, mediana 0,18 pp, máximo 1,16 pp, r = 0,9969;
 *   14 de los 15 primeros coinciden. La dispersión entre héroes es 3,2 pp:
 *   el ruido queda 12 veces por debajo de la señal.
 *   1 día frente a 3: σ 34,7 pp, r = 0,09, héroes al 0% y al 100%. Basura.
 *
 * Así que la de 3 días entra, la de 1 no, y no hay peso ni mezcla: se usa la
 * ventana más corta cuya precisión aguanta. Lo que sí hay es una GUARDA, por
 * si un día la de 3 viene como la de 1 (temporada recién empezada con cuatro
 * jugadores en Gloria, API a medias): se comprueba que sea coherente con la
 * de 7 y que sus valores sean posibles, y si no, manda la de 7 y el
 * diagnóstico lo dice. Los cruces y las parejas siguen a 7 días: son 17.556
 * celdas con muchas menos partidas cada una y nadie ha medido su ruido a 3.
 */

/**
 * Coherencia mínima entre la ventana corta y la de 7 días (correlación de
 * los winrates entre héroes) para fiarse de la corta. Derivada de la
 * distribución medida: 0,9969 cuando la ventana es buena, 0,09 cuando es la
 * basura de 1 día. 0,9 está lejos de las dos.
 */
export const COHERENCIA_MINIMA = 0.9;

/**
 * Fuera de esto un winrate de héroe es imposible (es el mismo criterio que
 * el diagnóstico aplica a la ventana de 7 días): con 133 héroes y 3,3 pp de
 * dispersión, ±3σ ni se acerca. Un solo héroe fuera no invalida la ventana
 * entera: ese héroe cae a 7 días y el resto no.
 */
export const WINRATE_POSIBLE = [0.35, 0.65];

/** Cuántos héroes hacen falta en las dos ventanas para medir la coherencia. */
const MINIMO_PARA_COMPARAR = 20;

const posible = (v) => v != null && v >= WINRATE_POSIBLE[0] && v <= WINRATE_POSIBLE[1];

/** Correlación de Pearson entre dos listas de la misma longitud. */
function correlacion(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/**
 * Decide las estadísticas EFECTIVAS por héroe.
 *
 * @param {Record<string, {winRate:number}>} semana   las de 7 días, ya indexadas por clave normalizada
 * @param {Record<string, {winRate:number}>|null} recientes  las de 3 días, mismas claves, o nada
 * @param {number} dias  cuántos días son las recientes (para decirlo)
 * @returns {{ stats: Record<string, object>, ventana: { dias: number, coherencia: number|null, usados: number, motivo: string|null } }}
 */
export function elegirVentana(semana = {}, recientes = null, dias = 3) {
  const solo7 = (motivo) => ({ stats: semana, ventana: { dias: 7, coherencia: null, usados: 0, motivo } });
  if (!recientes || !Object.keys(recientes).length) return solo7(null);

  const comunes = Object.keys(semana).filter((k) => posible(recientes[k]?.winRate) && semana[k]?.winRate != null);
  if (comunes.length < MINIMO_PARA_COMPARAR) return solo7(`solo ${comunes.length} héroes con dato reciente`);
  const r = correlacion(comunes.map((k) => recientes[k].winRate), comunes.map((k) => semana[k].winRate));
  if (!(r >= COHERENCIA_MINIMA)) return solo7(`la ventana de ${dias} días no se parece a la de 7 (r=${r.toFixed(2)})`);

  // Héroe a héroe: el reciente si es posible, si no el de la semana. Se
  // conserva TODO lo demás del registro semanal (pickRate, banRate, heroId):
  // el pickrate de 3 días es la misma cuota y el de 7 tiene más muestra.
  const stats = {};
  let usados = 0;
  for (const [k, s] of Object.entries(semana)) {
    const rec = recientes[k];
    if (posible(rec?.winRate)) { stats[k] = { ...s, winRate: rec.winRate, winRateSemana: s.winRate }; usados++; } else stats[k] = s;
  }
  return { stats, ventana: { dias, coherencia: r, usados, motivo: null } };
}

/** Media del winrate de un conjunto de estadísticas, como la calcula la ingesta (`avgOf`). */
export function mediaDeWinrate(stats = {}) {
  const v = Object.values(stats).map((s) => s?.winRate).filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0.5;
}
