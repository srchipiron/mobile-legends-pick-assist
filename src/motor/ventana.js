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

/**
 * Qué RANGO manda en la fuerza de un héroe (3.11.0). Gloria Mítica es el
 * rango más alto y el que se vacía en cada reinicio de temporada: todos
 * bajan y vuelven a subir en semanas. Mientras tanto su winrate sale de muy
 * pocas partidas y es sobre todo ruido. Medido en la historia de
 * `roam-meta.json` (40 corridas del 3 al 22 de septiembre de 2026, parche
 * asentado): r(Gloria 7 días, Mítico 7 días) = 0,86–0,90 siempre, σ de Gloria
 * 3,2 pp. El 23 por la tarde, cuando la ventana de 7 días dejó de incluir
 * días anteriores al reinicio del 16, cayó a 0,63 y la σ saltó a 5,3 pp; Mítico
 * no se movió (r con «todos los rangos» 0,89, con su propia ventana de 15 días
 * 0,86). Gloria a 7 días se parecía a Gloria a 15 solo a r = 0,36, y Gloria a
 * 15 y a 30 daban r = 1,00: los nueve días desde el reinicio casi no
 * aportaban partidas. Así que, si Gloria no es coherente con Mítico en la
 * MISMA ventana, manda Mítico entero (winrate, pick y ban: una sola
 * población) y el diagnóstico lo dice; cuando Gloria se rellena, vuelve sola.
 * Solo se mira el par Gloria–Mítico porque el umbral está calibrado ahí:
 * Mítico–Leyenda va a 0,97 en un parche asentado y necesitaría el suyo.
 */

/**
 * Coherencia mínima de Gloria con Mítico (7 días) para fiarse de Gloria.
 * Derivada de la distribución medida: 0,86–0,90 en 40 corridas con Gloria
 * llena, 0,63–0,67 con Gloria vacía tras el reinicio. 0,80 queda entre las dos.
 */
export const COHERENCIA_DE_RANGO_MINIMA = 0.8;

/** El rango que se consulta cuando Gloria no aguanta. */
export const RANGO_DE_RESPALDO = { glory: 'mythic' };

/**
 * @param {Record<string, Record<string, {winRate:number}>>} statsByRank  las de 7 días por rango, ya indexadas
 * @param {string} rango  el rango pedido
 * @returns {{ rango: string, pedido: string, coherencia: number|null, motivo: string|null }}
 */
export function elegirRango(statsByRank = {}, rango = null) {
  const respaldo = RANGO_DE_RESPALDO[rango];
  const pedidas = statsByRank?.[rango]; const otras = respaldo ? statsByRank?.[respaldo] : null;
  if (!pedidas || !otras) return { rango, pedido: rango, coherencia: null, motivo: null };
  const comunes = Object.keys(pedidas).filter((k) => posible(pedidas[k]?.winRate) && posible(otras[k]?.winRate));
  if (comunes.length < MINIMO_PARA_COMPARAR) {
    // Sin bastantes héroes para comparar, manda el rango que TIENE datos.
    // Hasta 3.14.0 se caía siempre al respaldo, también cuando el roto era
    // Mítico (vacío o sin winrates): los 133 se quedaban sin fuerza y el
    // motivo culpaba a Gloria.
    const validos = (s) => Object.values(s).filter((x) => posible(x?.winRate)).length;
    const nPedidas = validos(pedidas); const nOtras = validos(otras);
    if (nOtras > nPedidas) return { rango: respaldo, pedido: rango, coherencia: null, motivo: `solo ${nPedidas} héroes con dato en ${rango}` };
    return { rango, pedido: rango, coherencia: null, motivo: nPedidas > nOtras ? `solo ${nOtras} héroes con dato en ${respaldo}: no se puede comprobar ${rango}` : null };
  }
  const r = correlacion(comunes.map((k) => pedidas[k].winRate), comunes.map((k) => otras[k].winRate));
  if (r >= COHERENCIA_DE_RANGO_MINIMA) return { rango, pedido: rango, coherencia: r, motivo: null };
  return { rango: respaldo, pedido: rango, coherencia: r, motivo: `${rango} no se parece a ${respaldo} (r=${r.toFixed(2)}): pocas partidas en ${rango}, normal tras un reinicio de temporada` };
}

/**
 * La MISMA guarda para cruces y parejas (3.35.0), que hasta entonces salían
 * siempre de Gloria aunque la fuerza ya hubiera caído a Mítico: el gemelo
 * del fallo de 3.11.0 en otro componente. La ruta de cruces de la API no
 * deja elegir días (solo rango), y su ventana tardó doce días en vaciarse
 * tras el reinicio del 16 de septiembre de 2026: σ de los cruces 0,0128
 * estable del 30 de agosto al 27 de septiembre y 0,0181–0,0201 del 1 al 3 de
 * octubre; σ de las parejas 0,020 → 0,033–0,037. Medido el 3 de octubre con
 * las 17.556 celdas de cada rango: cruces de Gloria hoy frente a los de
 * Gloria asentada (20 de septiembre) r = 0,62, los de Mítico hoy frente a
 * esa misma Gloria asentada r = 0,905; parejas 0,39 frente a 0,87; Gloria
 * hoy frente a Mítico hoy 0,64 (cruces) y 0,43 (parejas). Y es muestra, no
 * juego: la fila de un héroe poco jugado es 1,93 veces más dispersa que la
 * de uno muy jugado en Gloria (1,16 asentada), 1,53 en Mítico. Se reutiliza
 * `COHERENCIA_DE_RANGO_MINIMA`: 0,8 queda entre lo malo de hoy (0,43–0,64)
 * y la peor cota de lo bueno (0,87, que además lleva dos semanas de deriva
 * del meta dentro). Decide la PEOR de las dos matrices y las dos van del
 * mismo rango: un cruce de Mítico con parejas de Gloria no es ninguna
 * población. La decide la ingesta (bajar las dos matrices de los dos rangos
 * y guardar las dos doblaría el fichero que se descarga en el móvil) y la
 * marca en `relaciones` de roam-meta.json, que el diagnóstico enseña.
 */
export const CELDAS_PARA_COMPARAR = 500;
export function elegirRangoDeRelaciones({ pedidas = null, respaldo = null, rango = null, minimo = CELDAS_PARA_COMPARAR, filasMinimas = 0 } = {}) {
  const rangoRespaldo = RANGO_DE_RESPALDO[rango];
  const base = { rango, pedido: rango, coherencia: null, motivo: null };
  if (!rangoRespaldo || !pedidas || !respaldo) return base;
  // Un respaldo a medias (la API cortó a mitad de la segunda tanda) no
  // sustituye a una matriz entera (3.37.0): con 500 celdas en común bastaba
  // con cuatro héroes de Mítico para tirar los 133 de Gloria.
  const filas = Object.values(respaldo.counters ?? {}).filter((f) => Object.keys(f ?? {}).length).length;
  if (filas < filasMinimas) return { ...base, motivo: `no se pudo bajar ${rangoRespaldo} entero (${filas} de ${filasMinimas} héroes) para comprobar ${rango}` };
  const coherencia = {};
  for (const m of ['counters', 'synergies']) {
    const xs = []; const ys = [];
    for (const [heroe, fila] of Object.entries(pedidas[m] ?? {})) {
      const otra = respaldo[m]?.[heroe];
      if (!otra) continue;
      for (const [rival, v] of Object.entries(fila ?? {})) {
        if (Number.isFinite(v) && Number.isFinite(otra[rival])) { xs.push(v); ys.push(otra[rival]); }
      }
    }
    coherencia[m] = xs.length >= minimo ? correlacion(xs, ys) : null;
  }
  const medidas = Object.values(coherencia).filter((x) => x != null);
  if (!medidas.length) return { ...base, coherencia, motivo: `pocos cruces en común con ${rangoRespaldo} para comprobar ${rango}` };
  const peor = Math.min(...medidas);
  if (peor >= COHERENCIA_DE_RANGO_MINIMA) return { ...base, coherencia };
  return { rango: rangoRespaldo, pedido: rango, coherencia, motivo: `los cruces y parejas de ${rango} no se parecen a los de ${rangoRespaldo} (r=${peor.toFixed(2)}): pocas partidas en ${rango}, normal unos días después de un reinicio de temporada` };
}

/** Media del winrate de un conjunto de estadísticas, como la calcula la ingesta (`avgOf`). */
export function mediaDeWinrate(stats = {}) {
  // PONDERADA por cuota de pick, no la media simple de los 133. El centro
  // del término de héroe tiene que ser lo que cabe esperar del héroe que
  // SALE en un draft, y los que salen son los populares. Medido el 24 de
  // septiembre de 2026 (Gloria, tras el reinicio de temporada): media
  // simple 0,482, ponderada 0,502; con la simple cada héroe visto sumaba
  // +0,09 de logit y el equipo con más héroes en pantalla iba por delante
  // (1 contra 5: 45%; incidencia #9, dos días sin publicar datos). La
  // ponderada es ≈0,50 por construcción: cada partida tiene un ganador.
  // Un héroe sin cuota pesa 0, no 1 (el mismo `?? 1` que ya costó dos
  // centros en 3.4.0 y 3.5.0); sin ninguna cuota, la media simple.
  let sw = 0; let swr = 0; let n = 0; let suma = 0;
  for (const s of Object.values(stats)) {
    const w = s?.winRate;
    if (w == null) continue;
    n += 1; suma += w;
    const peso = Number.isFinite(s.pickRate) && s.pickRate > 0 ? s.pickRate : 0;
    sw += peso; swr += peso * w;
  }
  if (sw > 0) return swr / sw;
  return n ? suma / n : 0.5;
}
