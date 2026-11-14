/**
 * La tier list de mlbb.gg, héroe a héroe. Es OPINIÓN: se enseña y NO puntúa
 * (sabiendo el winrate, la tier no dice nada de hacia dónde va: −0,045 pp ±
 * 0,015) [M]. Tiene su propia base; si falla se conserva la anterior.
 */

import { nombreClave } from '../../src/motor/nombres.js';

const CABECERAS = { 'User-Agent': 'mobile-legends-pick-assist (tier list, uso personal)', Accept: 'application/json' };
const TOPE_MS = 20000;
/** Los escalones que publica, del mejor al peor; cualquier otra cosa se descarta [C]. */
export const ESCALONES = ['SS', 'S', 'A', 'B', 'C', 'D'];

async function pedir(url) {
  const res = await fetch(url, { headers: CABECERAS, signal: AbortSignal.timeout(TOPE_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}

/**
 * `{ tiers: {fuente, fecha, tiers} | null, diag }`. Con menos de la mitad de
 * héroes no es una tier list y se conserva la anterior entera; si no, el que
 * no llega hoy conserva la suya [D]. `base` null: apagada.
 */
export async function pedirTiers(base, heroList, previous, { sleep = (ms) => new Promise((r) => setTimeout(r, ms)), ahora = () => new Date().toISOString() } = {}) {
  const anterior = previous?.tiers ?? null;
  const conservar = (motivo) => ({ tiers: anterior, diag: `fallo: ${motivo.slice(0, 120)}${anterior ? '; conservo la anterior' : ''}` });
  if (!base) return { tiers: anterior, diag: 'apagada' };
  let lista;
  try {
    lista = await pedir(`${base}/heroes`);
  } catch (err) {
    return conservar(err.message);
  }
  if (!Array.isArray(lista) || !lista.length) return conservar('la lista viene vacía');

  const nuestros = new Map(heroList.map((h) => [nombreClave(h.name), h.name]));
  const tiers = {};
  let fallos = 0;
  for (const h of lista) {
    const nombre = nuestros.get(nombreClave(h?.name ?? ''));
    if (!nombre || h?.id == null) continue;
    try {
      const ficha = await pedir(`${base}/heroes/${h.id}`);
      if (ESCALONES.includes(ficha?.tier)) tiers[nombre] = ficha.tier;
    } catch {
      fallos++;
    }
    await sleep(200);
  }
  const n = Object.keys(tiers).length;
  if (n < heroList.length / 2) return conservar(`solo ${n} héroes con tier (${fallos} fallos)`);
  let conservados = 0;
  for (const h of heroList) {
    const antes = anterior?.tiers?.[h.name];
    if (tiers[h.name] == null && ESCALONES.includes(antes)) { tiers[h.name] = antes; conservados++; }
  }
  const diag = `${n} héroes${fallos ? ` (${fallos} fallos)` : ''}${conservados ? ` · ${conservados} con la tier anterior` : ''}`;
  return { tiers: { fuente: 'mlbb.gg', fecha: ahora(), tiers }, diag };
}
