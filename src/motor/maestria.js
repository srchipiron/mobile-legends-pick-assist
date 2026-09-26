import { nombreClave, buscar } from './nombres.js';

/**
 * Tu maestría: partidas y winrate con cada héroe, escritos a mano o sacados
 * de las partidas apuntadas. Todo lo que compara winrates personales se
 * compara contra TU nivel, nunca contra el 50%: para un jugador del 53,4%
 * un héroe a su media exacta no es mejor que uno sin tocar (1.x premiaba
 * TENER DATOS, no ser bueno con el héroe).
 */

/**
 * Cuánto pesa el 50% mientras no tengas partidas suficientes. Era un CORTE en
 * 100 partidas y apuntar una (de la 99 a la 100) cambiaba el nº1 en 54 de
 * 200 drafts. Encogimiento continuo; conserva la intención (con 100
 * partidas te crees la mitad, con 400 el 80%). Es una elección conservadora,
 * no una medida: haría falta la dispersión del winrate entre jugadores.
 */
const PRIOR_DE_TU_NIVEL = 100;

/** Tu winrate global, ponderado por partidas y encogido hacia el 50%. */
export function tuNivel(maestria = {}) {
  let partidas = 0; let ganadas = 0;
  for (const m of Object.values(maestria ?? {})) {
    if (!(m?.games > 0) || m.winRate == null) continue;
    partidas += m.games; ganadas += m.winRate * m.games;
  }
  if (!partidas) return 0.5;
  return (0.5 * PRIOR_DE_TU_NIVEL + ganadas) / (PRIOR_DE_TU_NIVEL + partidas);
}

/**
 * Cuánto encoger un winrate personal hacia tu nivel, en partidas de prior.
 * No es libre: k = 0.25/σ², con σ la dispersión REAL de tu winrate entre
 * héroes, medida de tus datos descontando la varianza de muestreo (sale ±4
 * puntos, k≈156). El 20 de antes suponía ±11 puntos y cinco partidas al 90%
 * puntuaban 0.87. Con corrección de Bessel; cada héroe pesa games/(games+30)
 * y la σ medida se funde con la de por defecto según cuántos héroes hay,
 * para que el quinto héroe que llega a 30 partidas no mueva k de golpe.
 */
const SIGMA_MINIMA = 0.02;
const SIGMA_MAXIMA = 0.08;
const HEROES_PARA_MEDIR_DISPERSION = 5;
const PARTIDAS_PARA_CONTAR = 30;
const SIGMA_POR_DEFECTO = 0.04;

export function priorDeMaestria(maestria = {}, nivel) {
  const base = nivel ?? tuNivel(maestria);
  const suyos = Object.values(maestria ?? {})
    .filter((m) => m?.games > 0 && m.winRate != null)
    .map((m) => ({ ...m, w: m.games / (m.games + PARTIDAS_PARA_CONTAR) }));
  const nEf = suyos.reduce((s, m) => s + m.w, 0);
  let sigmaMedida = SIGMA_POR_DEFECTO;
  if (nEf > 0) {
    const observada = suyos.reduce((s, m) => s + m.w * (m.winRate - base) ** 2, 0) / nEf * (nEf > 1 ? nEf / (nEf - 1) : 1);
    const porMuestreo = suyos.reduce((s, m) => s + m.w * 0.25 / m.games, 0) / nEf;
    const real = observada - porMuestreo;
    sigmaMedida = real > 0 ? Math.sqrt(real) : SIGMA_MINIMA;
  }
  let sigma = (SIGMA_POR_DEFECTO * HEROES_PARA_MEDIR_DISPERSION + sigmaMedida * nEf) / (HEROES_PARA_MEDIR_DISPERSION + nEf);
  sigma = Math.max(SIGMA_MINIMA, Math.min(SIGMA_MAXIMA, sigma));
  return 0.25 / (sigma * sigma);
}

/**
 * Tu winrate con un héroe, encogido hacia tu nivel con el prior medido, como
 * nota 0..1 (0.5 = como tú, 1 = dos desviaciones por encima) y con sus
 * motivos. El motivo se decide con el estimado ENCOGIDO contra tu nivel ± σ:
 * 20 partidas al 60% no son evidencia; 300 al 57% sí.
 */
export function notaDeMaestria(heroe, maestria, nivel, prior) {
  const m = buscar(maestria, heroe?.name);
  if (!m || !(m.games > 0) || m.winRate == null) return { valor: 0.5, motivos: [] };
  const base = nivel ?? tuNivel(maestria);
  const k = prior ?? priorDeMaestria(maestria, base);
  const encogido = (m.winRate * m.games + base * k) / (m.games + k);
  const sigma = Math.sqrt(0.25 / k);
  const valor = Math.max(0, Math.min(1, (encogido - base) / (4 * sigma) + 0.5));
  const motivos = [];
  const params = { pct: Math.round(m.winRate * 100), n: m.games };
  if (encogido >= base + sigma) motivos.push({ clave: 'regla.maestriaBuena', params, bueno: true, peso: 1.4 });
  if (encogido <= base - sigma) motivos.push({ clave: 'regla.maestriaMala', params, bueno: false, peso: 1.4 });
  return { valor, encogido, motivos };
}

/**
 * Tus partidas apuntadas por héroe, en el formato de la maestría. Aquí SÍ
 * entran las previas (las del historial del juego): para eso se meten.
 * Agrupado por clave y etiquetado con la primera grafía vista.
 */
export function maestriaDesdeRegistro(partidas = []) {
  const cuenta = new Map();
  for (const p of partidas) {
    const k = nombreClave(p?.pick);
    if (!k) continue;
    const c = cuenta.get(k) ?? { name: p.pick, games: 0, wins: 0 };
    c.games += 1; if (p.gane) c.wins += 1;
    cuenta.set(k, c);
  }
  return Object.fromEntries([...cuenta.values()].map((c) => [c.name, { games: c.games, winRate: c.wins / c.games }]));
}

/**
 * La maestría que usa el motor: la escrita a mano MÁS la de tus partidas
 * apuntadas. Claves normalizadas: 400 partidas de «X.Borg» desaparecían del
 * ranking con la clave cruda.
 *
 * Desde 3.13.0 cada héroe escrito a mano lleva `desde` (cuándo se guardó):
 * son los números del juego A ESE DÍA, así que las partidas apuntadas con la
 * app DESPUÉS se le SUMAN. Antes ganaba la fuente con más partidas «porque
 * la escrita a mano ya las incluye», y eso solo era verdad si se volvía a
 * escribir tras jugar: con 564 partidas de Rafaela a mano, las 31 apuntadas
 * al 77% no movían nada. Las previas (del historial del juego) no se suman:
 * el total del juego ya las lleva. Sin `desde` (guardada antes de 3.13.0)
 * no se sabe qué incluye y sigue ganando la que tenga más partidas.
 */
export function maestriaEfectiva(maestria = {}, partidas = []) {
  const salida = {};
  const fechada = new Map();
  for (const [nombre, m] of Object.entries(maestria ?? {})) {
    const k = nombreClave(nombre);
    if (!salida[k] || (m?.games ?? 0) > (salida[k].games ?? 0)) {
      salida[k] = m;
      if (Number.isFinite(m?.desde) && m.desde > 0) fechada.set(k, m.desde); else fechada.delete(k);
    }
  }
  // Lo apuntado después de la fecha de cada héroe fechado: se suma.
  const despues = (partidas ?? []).filter((p) => !p?.previa && fechada.has(nombreClave(p?.pick)) && p.t > fechada.get(nombreClave(p.pick)));
  for (const [nombre, m] of Object.entries(maestriaDesdeRegistro(despues))) {
    const k = nombreClave(nombre); const base = salida[k];
    const games = base.games + m.games;
    salida[k] = { ...base, games, winRate: (base.winRate * base.games + m.winRate * m.games) / games, apuntadas: m.games };
  }
  // Los héroes sin fecha o sin maestría a mano: como siempre, gana la fuente con más partidas.
  for (const [nombre, m] of Object.entries(maestriaDesdeRegistro((partidas ?? []).filter((p) => !fechada.has(nombreClave(p?.pick)))))) {
    const k = nombreClave(nombre);
    if (!salida[k] || (m.games ?? 0) > (salida[k].games ?? 0)) salida[k] = m;
  }
  return salida;
}

/** Tu winrate de referencia: la maestría ponderada por partidas (miles, frente a las pocas del registro). */
export function winrateDeReferencia(maestria = {}) {
  let partidas = 0; let ganadas = 0;
  for (const m of Object.values(maestria ?? {})) {
    if (!(m?.games > 0) || m.winRate == null) continue;
    partidas += m.games; ganadas += m.winRate * m.games;
  }
  return partidas ? { winRate: ganadas / partidas, partidas } : null;
}
