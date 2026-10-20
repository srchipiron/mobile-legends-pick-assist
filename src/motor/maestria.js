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
 * puntos, k≈156; el 20 de octubre de 2026, k≈290). El 20 de antes suponía ±11 puntos y cinco partidas al 90%
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
  if (encogido >= base + sigma) motivos.push(motivoDeMaestria(m, true));
  if (encogido <= base - sigma) motivos.push(motivoDeMaestria(m, false));
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
 * Pone fecha a la maestría escrita a mano que no la tiene (3.13.1). Sin
 * fecha, las partidas apuntadas no se le suman (no se sabe qué incluye), y
 * con 3.13.0 eso exigía abrir el editor y guardar: tras publicarla, 0 de
 * los 11 héroes de Javi tenían fecha. Fechar con el momento en que la app la
 * ve es seguro: lo escrito a mano no puede incluir partidas que aún no se
 * han jugado, así que lo que se apunte DESPUÉS se suma sin contarse dos
 * veces, y lo apuntado antes sigue sin sumarse, como hasta ahora. Devuelve
 * la misma referencia si no hay nada que fechar.
 */
export function fecharMaestria(maestria = {}, ahora = Date.now()) {
  const sinFecha = Object.entries(maestria ?? {}).filter(([, m]) => !(Number.isFinite(m?.desde) && m.desde > 0));
  if (!sinFecha.length) return maestria;
  const salida = { ...maestria };
  for (const [nombre, m] of sinFecha) salida[nombre] = { ...m, desde: ahora };
  return salida;
}

/**
 * Lo que pesan, como mucho, tus números DE SIEMPRE con un héroe (escritos a
 * mano o metidos del historial del juego) al lado de tus partidas apuntadas
 * con la app (3.56.0, elegido por Javi: «mandan las recientes»). Medido el
 * 13 de octubre de 2026 en sus 212 partidas con la app, prediciendo cada una
 * con las demás: el winrate de siempre predice PEOR que no usarlo (logL/n
 * −0,6633 frente a −0,6603 de una constante: Diggie 54% en 3.821 partidas de
 * siempre y 46% en 26 con la app; Rafaela 53% y 75% en 60) y el de las
 * partidas con la app, encogido, mejor (−0,6559 con un prior de 40). Con 212
 * partidas la mejora aún cabe en el error; lo de siempre se queda como punto
 * de partida para los héroes que casi no has jugado con la app. Decisión de
 * producto apoyada en esa medida, no una constante calibrada.
 */
export const TOPE_DE_SIEMPRE = 40;

/**
 * La maestría que usa el motor: tus números de siempre (lo escrito a mano o
 * lo metido del historial del juego, la fuente con más partidas, como
 * mucho `TOPE_DE_SIEMPRE`) MÁS todas tus partidas apuntadas con la app.
 * Claves normalizadas: 400 partidas de «X.Borg» desaparecían del ranking con
 * la clave cruda.
 *
 * Hasta 3.55.0 lo de siempre entraba entero (3.821 partidas de Diggie
 * tapaban las 26 jugadas con la app) y lo apuntado solo se sumaba si era
 * posterior a la fecha de lo escrito a mano (`desde`), para no contar dos
 * veces lo que el total del juego ya incluía. Con lo de siempre acotado ese
 * doble recuento es como mucho `TOPE_DE_SIEMPRE` partidas y deja de importar:
 * cuenta TODO lo apuntado con la app, también lo de antes de la fecha.
 */
export function maestriaEfectiva(maestria = {}, partidas = []) {
  const siempre = maestriaDeSiempre(maestria, partidas);
  const salida = {};
  for (const [k, m] of Object.entries(siempre)) {
    if (!(Number(m?.games) > 0) || !Number.isFinite(Number(m?.winRate))) { salida[k] = m; continue; }
    salida[k] = { ...m, games: Math.min(Number(m.games), TOPE_DE_SIEMPRE), winRate: Number(m.winRate), deSiempre: Number(m.games) };
  }
  for (const [nombre, m] of Object.entries(maestriaDesdeRegistro((partidas ?? []).filter((p) => !p?.previa)))) {
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

/**
 * Lo que dice el motivo de maestría (3.56.0): números que de verdad has
 * jugado, no la mezcla con la que puntúa el motor. Con partidas apuntadas,
 * las de la app (`regla.maestria…App`); sin ellas, las de siempre enteras.
 * «Lo llevas al 66% en 100 partidas» era la mezcla de 40 de siempre y 60
 * con la app: ninguna de las dos cosas.
 */
export function motivoDeMaestria(m, bueno) {
  if (m?.apuntadas > 0 && Number.isFinite(m.wrApuntadas)) {
    return { clave: bueno ? 'regla.maestriaBuenaApp' : 'regla.maestriaMalaApp', params: { pct: Math.round(m.wrApuntadas * 100), n: m.apuntadas }, bueno, peso: 1.4 };
  }
  const n = Number.isFinite(m?.deSiempre) ? m.deSiempre : m?.games;
  return { clave: bueno ? 'regla.maestriaBuena' : 'regla.maestriaMala', params: { pct: Math.round((m?.winRate ?? 0) * 100), n }, bueno, peso: 1.4 };
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
