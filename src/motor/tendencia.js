import { nombreClave } from './nombres.js';

/**
 * Quién sube y quién baja en el meta (3.50.0), como el «trending» de
 * mlbb.io o los rastreadores de LoL. Compara la ventana de 7 días de hoy
 * con la de hace una semana (la historia que guarda la ingesta, una foto
 * por día) y solo nombra a un héroe si el cambio es suyo y no del rango:
 *
 *  - se mide RESPECTO A LO QUE SE JUEGA (cada cambio menos la media de los
 *    cambios ponderada por cuota de pick). Tras un reinicio de temporada
 *    Gloria se rellena y casi todos «suben» a la vez: eso no dice nada de
 *    ningún héroe;
 *  - y tiene que verse en las DOS poblaciones (tu rango y su respaldo) en el
 *    mismo sentido. Medido en la historia de roam-meta.json: con el parche
 *    asentado (6–17 de septiembre de 2026) el cambio semanal de un héroe es
 *    σ 0,25–0,3 puntos y casa entre Gloria y Mítico a r ≈ 0,7 (es meta, no
 *    muestra); tras el reinicio Gloria se mueve 1–5 puntos y casa a 0,4–0,6.
 *
 * Es una descripción («ha subido»), no una predicción: no se ha medido si
 * lo que sube sigue subiendo, y no puntúa en ningún sitio.
 */

/** Días de historia que guarda la ingesta: hasta `DIAS_MAX` atrás más hoy (cada día pesa ~1,3 KB comprimido en el móvil). */
export const HISTORIA_DIAS = 10;
/** La foto de referencia: la más cercana a hace 7 días, entre 5 y 9 (el bot puede faltar algún día). */
export const DIAS_ATRAS = 7;
export const DIAS_MIN = 5;
export const DIAS_MAX = 9;
// Decisión de producto con la medida de arriba: 1 punto es más de 3σ del
// cambio semanal con el parche asentado (allí salían 0–1 héroes por semana:
// «el meta está quieto» es verdad) y el 8 de octubre de 2026 da 9 y 12.
export const UMBRAL_MOVIMIENTO = 0.01;
// Lo que tiene que moverse el OTRO rango, en el mismo sentido, para confirmar.
export const CONFIRMACION = 0.005;

const dia = (fecha) => Date.parse(`${fecha}T00:00:00Z`);

/** La foto de referencia: con los dos rangos, a 5–9 días de `hoy`, la más cercana a 7. */
export function fotoDeReferencia(historia = [], hoy, rangos = []) {
  const t = dia(hoy);
  if (!Number.isFinite(t)) return null;
  let mejor = null;
  for (const e of Array.isArray(historia) ? historia : []) {
    const d = (t - dia(e?.fecha)) / 864e5;
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
