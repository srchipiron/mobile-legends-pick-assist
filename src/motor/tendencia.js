import { nombreClave } from './nombres.js';
import { DIA_MS } from './estadistica.js';

/**
 * Quién sube y quién baja en el meta: la ventana de 7 días de hoy contra la de hace
 * una semana (la historia de la ingesta), centrado en lo que se juega (tras un
 * reinicio casi todos «suben» a la vez) y confirmado en el rango de respaldo en el
 * mismo sentido. [M] Con el parche asentado el cambio semanal es σ 0,25–0,3 puntos y
 * casa entre Gloria y Mítico a r ≈ 0,7. Describe, no predice, y no puntúa.
 */

/** Días de historia que guarda la ingesta: hasta `DIAS_MAX` atrás más hoy (cada día pesa ~1,3 KB comprimido en el móvil). */
export const HISTORIA_DIAS = 10;
/** La foto de referencia: la más cercana a hace 7 días, entre 5 y 9 (el bot puede faltar algún día). */
export const DIAS_ATRAS = 7;
export const DIAS_MIN = 5;
export const DIAS_MAX = 9;
/** [M/P] Un punto: más de 3σ del cambio semanal asentado. */
export const UMBRAL_MOVIMIENTO = 0.01;
/** [P] Lo que tiene que moverse el OTRO rango, en el mismo sentido, para confirmar. */
export const CONFIRMACION = 0.005;

const dia = (fecha) => Date.parse(`${fecha}T00:00:00Z`);

/** La foto de referencia: con los dos rangos, a 5–9 días de `hoy`, la más cercana a 7. */
export function fotoDeReferencia(historia = [], hoy, rangos = []) {
  const t = dia(hoy);
  if (!Number.isFinite(t)) return null;
  let mejor = null;
  for (const e of Array.isArray(historia) ? historia : []) {
    const d = (t - dia(e?.fecha)) / DIA_MS;
    if (!(d >= DIAS_MIN && d <= DIAS_MAX)) continue;
    if (!rangos.every((r) => e[r] && Object.keys(e[r]).length)) continue;
    if (!mejor || Math.abs(d - DIAS_ATRAS) < Math.abs(mejor.dias - DIAS_ATRAS)) mejor = { foto: e, dias: d };
  }
  return mejor;
}

/** Cambio de cada héroe respecto a la media de los cambios ponderada por su cuota de pick de hoy. */
function cambiosCentrados(ahora = {}, antes = {}) {
  const previo = new Map(Object.entries(antes).map(([k, v]) => [nombreClave(k), v]));
  const cambios = new Map();
  let suma = 0; let peso = 0;
  for (const [nombre, s] of Object.entries(ahora)) {
    const a = previo.get(nombreClave(nombre));
    const wr = Number(s?.winRate); const wr0 = Number(a?.[0]);
    if (!Number.isFinite(wr) || !Number.isFinite(wr0)) continue;
    const pick = Number(s?.pickRate) > 0 ? Number(s.pickRate) : 0;
    cambios.set(nombreClave(nombre), { nombre, dif: wr - wr0, wr, pick, difPick: pick - (Number(a?.[1]) || 0) });
    suma += (wr - wr0) * pick; peso += pick;
  }
  const centro = peso > 0 ? suma / peso : 0;
  for (const c of cambios.values()) c.dif -= centro;
  return cambios;
}

/**
 * @param {{ historia: Array, statsByRank: object, hoy: string, rango: string, otro: string }} entrada
 * @returns {{ estado: 'ok'|'sinOtro'|'sinHistoria', desde?: string, dias?: number, suben: Array, bajan: Array, noConfirmados: number }}
 */
export function movimientos({ historia = [], statsByRank = {}, hoy, rango, otro } = {}) {
  const vacio = { suben: [], bajan: [], noConfirmados: 0 };
  if (!otro || !statsByRank?.[rango] || !statsByRank?.[otro]) return { estado: 'sinOtro', ...vacio };
  const ref = fotoDeReferencia(historia, hoy, [rango, otro]);
  if (!ref) return { estado: 'sinHistoria', ...vacio };
  const propios = cambiosCentrados(statsByRank[rango], ref.foto[rango]);
  const delOtro = cambiosCentrados(statsByRank[otro], ref.foto[otro]);
  const suben = []; const bajan = []; let noConfirmados = 0;
  for (const [clave, c] of propios) {
    if (Math.abs(c.dif) < UMBRAL_MOVIMIENTO) continue;
    const o = delOtro.get(clave);
    if (!o || Math.sign(o.dif) !== Math.sign(c.dif) || Math.abs(o.dif) < CONFIRMACION) { noConfirmados++; continue; }
    const fila = { heroe: c.nombre, dif: c.dif, difOtro: o.dif, wr: c.wr, pick: c.pick, difPick: c.difPick };
    (c.dif > 0 ? suben : bajan).push(fila);
  }
  suben.sort((a, b) => b.dif - a.dif);
  bajan.sort((a, b) => a.dif - b.dif);
  return { estado: 'ok', desde: ref.foto.fecha, dias: ref.dias, suben, bajan, noConfirmados };
}
