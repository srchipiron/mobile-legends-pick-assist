import { correlacion, DIA_MS } from './estadistica.js';

/**
 * Qué ventana de días y qué rango mandan en la fuerza de un héroe, y de qué rango
 * salen cruces y parejas. Una sola decisión, en `prepararDatos` (y la de las
 * matrices, en la ingesta), con GUARDA: si la ventana corta o el rango pedido no
 * se parecen a la referencia, manda la referencia y el diagnóstico dice por qué.
 */

/**
 * [M] La de 3 días entra si se parece a la de 7: 0,9969 buena (18-9-2026, σ 0,27 pp
 * frente a 3,2 pp entre héroes), 0,09 la de 1 día. 0,9 queda lejos de las dos.
 */
export const COHERENCIA_MINIMA = 0.9;
/** [D] Fuera de esto un winrate de héroe es imposible (±3σ ni se acerca): ese héroe cae a 7 días. */
export const WINRATE_POSIBLE = [0.35, 0.65];
/** [P] Héroes en común para medir una coherencia. */
const MINIMO_PARA_COMPARAR = 20;

const posible = (v) => v != null && v >= WINRATE_POSIBLE[0] && v <= WINRATE_POSIBLE[1];

/**
 * Las estadísticas EFECTIVAS: las de 7 días, con el winrate de la corta héroe a
 * héroe donde es posible (el resto del registro, pick y ban, de la de 7).
 * @returns {{ stats, ventana: { dias, coherencia, usados, motivo } }}
 */
export function elegirVentana(semana = {}, recientes = null, dias = 3) {
  const solo7 = (motivo) => ({ stats: semana, ventana: { dias: 7, coherencia: null, usados: 0, motivo } });
  if (!recientes || !Object.keys(recientes).length) return solo7(null);
  const comunes = Object.keys(semana).filter((k) => posible(recientes[k]?.winRate) && semana[k]?.winRate != null);
  if (comunes.length < MINIMO_PARA_COMPARAR) return solo7(`solo ${comunes.length} héroes con dato reciente`);
  const r = correlacion(comunes.map((k) => recientes[k].winRate), comunes.map((k) => semana[k].winRate));
  if (!(r >= COHERENCIA_MINIMA)) return solo7(`la ventana de ${dias} días no se parece a la de 7 (r=${r.toFixed(2)})`);
  const stats = {};
  let usados = 0;
  for (const [k, s] of Object.entries(semana)) {
    const rec = recientes[k];
    if (posible(rec?.winRate)) { stats[k] = { ...s, winRate: rec.winRate, winRateSemana: s.winRate }; usados++; } else stats[k] = s;
  }
  return { stats, ventana: { dias, coherencia: r, usados, motivo: null } };
}

/**
 * [M] Gloria se vacía en cada reinicio de temporada: r(Gloria, Mítico) a 7 días
 * 0,86–0,90 llena, 0,63–0,67 vacía (septiembre de 2026). Por debajo de 0,8 manda
 * Mítico entero (winrate, pick y ban). Solo el par Gloria–Mítico: el umbral está
 * calibrado ahí.
 */
export const COHERENCIA_DE_RANGO_MINIMA = 0.8;
export const RANGO_DE_RESPALDO = { glory: 'mythic' };

/** @returns {{ rango, pedido, coherencia, motivo }} */
export function elegirRango(statsByRank = {}, rango = null) {
  const respaldo = RANGO_DE_RESPALDO[rango];
  const pedidas = statsByRank?.[rango]; const otras = respaldo ? statsByRank?.[respaldo] : null;
  if (!pedidas || !otras) return { rango, pedido: rango, coherencia: null, motivo: null };
  const comunes = Object.keys(pedidas).filter((k) => posible(pedidas[k]?.winRate) && posible(otras[k]?.winRate));
  if (comunes.length < MINIMO_PARA_COMPARAR) {
    // Sin bastantes para comparar, manda el rango que TIENE datos (no siempre el respaldo).
    const validos = (s) => Object.values(s).filter((x) => posible(x?.winRate)).length;
    const nPedidas = validos(pedidas); const nOtras = validos(otras);
    if (nOtras > nPedidas) return { rango: respaldo, pedido: rango, coherencia: null, motivo: `solo ${nPedidas} héroes con dato en ${rango}` };
    return { rango, pedido: rango, coherencia: null, motivo: nPedidas > nOtras ? `solo ${nOtras} héroes con dato en ${respaldo}: no se puede comprobar ${rango}` : null };
  }
  const r = correlacion(comunes.map((k) => pedidas[k].winRate), comunes.map((k) => otras[k].winRate));
  if (r >= COHERENCIA_DE_RANGO_MINIMA) return { rango, pedido: rango, coherencia: r, motivo: null };
  return { rango: respaldo, pedido: rango, coherencia: r, motivo: `${rango} no se parece a ${respaldo} (r=${r.toFixed(2)}): pocas partidas en ${rango}, normal tras un reinicio de temporada` };
}

/** [P] Celdas en común para comparar dos matrices. */
export const CELDAS_PARA_COMPARAR = 500;

/**
 * La misma guarda para cruces y parejas, en la INGESTA (guardar las dos matrices
 * doblaría lo que baja el móvil). Decide la PEOR de las dos y van del mismo rango.
 * [M] 3-10-2026: cruces de Gloria contra Mítico r = 0,64 (parejas 0,43); Mítico
 * contra Gloria asentada 0,91. Un respaldo a medias (< `filasMinimas`) no
 * sustituye a una matriz entera; sin poder comprobar hoy se sigue con lo que dijo
 * la última comprobación (`ultima`).
 */
export function elegirRangoDeRelaciones({ pedidas = null, respaldo = null, rango = null, minimo = CELDAS_PARA_COMPARAR, filasMinimas = 0, ultima = null, fecha = null } = {}) {
  const rangoRespaldo = RANGO_DE_RESPALDO[rango];
  const base = { rango, pedido: rango, coherencia: null, motivo: null, ...(ultima ? { ultima } : {}) };
  if (!rangoRespaldo || !pedidas) return base;
  const sinComprobar = (porque) => (ultima?.rango === rangoRespaldo
    ? { ...base, rango: rangoRespaldo, motivo: `${porque}; se sigue con ${rangoRespaldo}, como dijo la última comprobación${ultima.fecha ? ` (${String(ultima.fecha).slice(0, 10)})` : ''}` }
    : { ...base, motivo: porque });
  if (!respaldo) return sinComprobar(`no se pudo bajar ${rangoRespaldo} para comprobar ${rango}`);
  const filas = Object.values(respaldo.counters ?? {}).filter((f) => Object.keys(f ?? {}).length).length;
  if (filas < filasMinimas) return sinComprobar(`no se pudo bajar ${rangoRespaldo} entero (${filas} de ${filasMinimas} héroes) para comprobar ${rango}`);
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
  if (!medidas.length) return { ...sinComprobar(`pocos cruces en común con ${rangoRespaldo} para comprobar ${rango}`), coherencia };
  const peor = Math.min(...medidas);
  const medida = (elegido) => ({ rango: elegido, coherencia, ...(fecha ? { fecha } : {}) });
  if (peor >= COHERENCIA_DE_RANGO_MINIMA) return { ...base, coherencia, ultima: medida(rango) };
  return { rango: rangoRespaldo, pedido: rango, coherencia, ultima: medida(rangoRespaldo), motivo: `los cruces y parejas de ${rango} no se parecen a los de ${rangoRespaldo} (r=${peor.toFixed(2)}): pocas partidas en ${rango}, normal unos días después de un reinicio de temporada` };
}

/**
 * El centro del término de héroe: media del winrate PONDERADA por cuota de pick
 * (≈0,50 por construcción: lo que cabe esperar del que sale en un draft). Sin
 * cuota pesa 0; sin ninguna, la media simple. [M] La simple (0,482 tras el
 * reinicio) daba 45 % a 1 contra 5.
 */
export function mediaDeWinrate(stats = {}) {
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

/** [P] La tier list de mlbb.gg es opinión y caduca: pasadas dos semanas de parche no se enseña. */
export const TIERS_CADUCAN_DIAS = 14;
export function tiersVigentes(crudo, ahora = Date.now()) {
  const t = crudo?.tiers;
  const fecha = Date.parse(t?.fecha ?? '');
  if (!t?.tiers || !Number.isFinite(fecha) || ahora - fecha > TIERS_CADUCAN_DIAS * DIA_MS) return null;
  return t.tiers;
}
