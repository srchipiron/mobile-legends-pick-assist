import { nombreClave } from './nombres.js';

/**
 * Tu maestría: partidas y winrate con cada héroe, escritos a mano, metidos del
 * historial del juego o sacados de las partidas apuntadas. NO entra en la nota
 * (3.93.0, Javi): la usan el Veredicto, la tablet para tus habituales y la
 * comunidad como referencia.
 */

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
 * Pone fecha (la de ahora) a la maestría escrita a mano que no la tiene: lo escrito
 * no puede incluir partidas que aún no se han jugado. Misma referencia si no hay nada que fechar.
 */
export function fecharMaestria(maestria = {}, ahora = Date.now()) {
  const sinFecha = Object.entries(maestria ?? {}).filter(([, m]) => !(Number.isFinite(m?.desde) && m.desde > 0));
  if (!sinFecha.length) return maestria;
  const salida = { ...maestria };
  for (const [nombre, m] of sinFecha) salida[nombre] = { ...m, desde: ahora };
  return salida;
}

/**
 * [M/P] Lo que pesan como mucho tus números DE SIEMPRE con un héroe al lado de lo
 * apuntado con la app («mandan las recientes», Javi). En 212 partidas el winrate de
 * siempre predecía PEOR que una constante y el de la app, encogido, mejor.
 */
export const TOPE_DE_SIEMPRE = 40;

/**
 * Tus números de siempre (la fuente con más partidas, como mucho `TOPE_DE_SIEMPRE`)
 * MÁS todas tus partidas apuntadas con la app (sin previas ni supuestas), por clave.
 */
export function maestriaEfectiva(maestria = {}, partidas = []) {
  const siempre = maestriaDeSiempre(maestria, partidas);
  const salida = {};
  for (const [k, m] of Object.entries(siempre)) {
    if (!(Number(m?.games) > 0) || !Number.isFinite(Number(m?.winRate))) { salida[k] = m; continue; }
    salida[k] = { ...m, games: Math.min(Number(m.games), TOPE_DE_SIEMPRE), winRate: Number(m.winRate), deSiempre: Number(m.games) };
  }
  for (const [nombre, m] of Object.entries(maestriaDesdeRegistro((partidas ?? []).filter((p) => !p?.previa && p?.supuesto !== true)))) {
    const k = nombreClave(nombre); const base = salida[k];
    if (!(base?.games > 0) || base.winRate == null) { salida[k] = { ...m, apuntadas: m.games, wrApuntadas: m.winRate }; continue; }
    const games = base.games + m.games;
    salida[k] = { ...base, games, winRate: (base.winRate * base.games + m.winRate * m.games) / games, apuntadas: m.games, wrApuntadas: m.winRate };
  }
  return salida;
}

/**
 * Tus números de siempre, ENTEROS (sin `TOPE_DE_SIEMPRE`): con cada héroe,
 * la fuente con más partidas entre lo escrito a mano y lo metido del
 * historial del juego (las previas). Es la referencia del Veredicto («contra
 * tu winrate de siempre»), que no puede llevar dentro las partidas con la
 * app que compara.
 */
export function maestriaDeSiempre(maestria = {}, partidas = []) {
  const siempre = {};
  for (const [nombre, m] of Object.entries(maestria ?? {})) {
    const k = nombreClave(nombre);
    if (k && (!siempre[k] || (m?.games ?? 0) > (siempre[k].games ?? 0))) siempre[k] = m;
  }
  for (const [nombre, m] of Object.entries(maestriaDesdeRegistro((partidas ?? []).filter((p) => p?.previa)))) {
    const k = nombreClave(nombre);
    if (!siempre[k] || (m.games ?? 0) > (siempre[k].games ?? 0)) siempre[k] = m;
  }
  return siempre;
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
