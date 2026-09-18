/**
 * La tier list de mlbb.gg, héroe a héroe.
 *
 * Es OPINIÓN curada, no dato, y se guarda como tal: se enseña al lado del
 * winrate (hoja Meta y tarjetas) y NO puntúa. Está medido por qué (18 de
 * septiembre de 2026, 133 héroes en Gloria): la tier solo coincide con los
 * datos en la cima (SS: 53,9% de winrate medio; S: 50,3%; A/B/C/D todas
 * entre 48,0% y 49,5%, indistinguibles), Spearman tier~winrate 0,51, y en la
 * regresión wr3 ~ wr7 + tier el coeficiente de la tier es −0,045 pp ± 0,015:
 * sabiendo el winrate, la tier no dice nada de hacia dónde va. Donde
 * discrepan es sistemático: Fanny y Granger en S con 40–42% de winrate, Argus
 * y Dyrroth en C/D ganando el 52–54%. La tier mide «techo en buenas manos»;
 * el winrate, «qué gana en Gloria». Para el techo de Javi ya está su
 * maestría. Se enseña para poder comparar con lo que se lee por ahí, no para
 * decidir.
 *
 * Se pide como el contraste de counters (`scripts/contrastar-counters.mjs`):
 * la lista y luego la ficha de cada héroe, con pausa. No es la API principal
 * y por eso tiene su propia base (`--tiers`), se apaga con `--tiers off` y
 * se apaga sola cuando la base principal viene fijada (pruebas, local): una
 * prueba no debe salir a internet. Si falla, se conserva la de la corrida
 * anterior con su fecha: una tier de ayer sigue siendo la misma opinión.
 */

import { TIERS, diagnostics, sleep } from './contexto.mjs';
import { nombreClave } from '../../src/motor/nombres.js';

const CABECERAS = { 'User-Agent': 'mobile-legends-pick-assist (tier list, uso personal)', Accept: 'application/json' };
const TOPE_MS = 20000;
/** Los escalones que publica, del mejor al peor. Cualquier otra cosa se descarta. */
export const ESCALONES = ['SS', 'S', 'A', 'B', 'C', 'D'];

async function pedir(url) {
  const res = await fetch(url, { headers: CABECERAS, signal: AbortSignal.timeout(TOPE_MS) });
  if (!res.ok) throw new Error(`HTTP ${res.status} en ${url}`);
  return res.json();
}

/**
 * @param {Array<{name:string}>} heroList  nuestros héroes (para casar los nombres)
 * @param {object|null} previous  el roam-meta.json guardado, por si hay que conservar
 * @returns {Promise<{fuente:string, fecha:string, tiers:Record<string,string>}|null>}
 */
export async function fetchTiers(heroList, previous) {
  const conservar = (motivo) => {
    diagnostics.tiers = `fallo: ${motivo.slice(0, 120)}${previous?.tiers ? '; conservo la anterior' : ''}`;
    return previous?.tiers ?? null;
  };
  if (!TIERS) { diagnostics.tiers = 'apagada'; return previous?.tiers ?? null; }
  let lista;
  try {
    lista = await pedir(`${TIERS}/heroes`);
  } catch (err) {
    return conservar(err.message);
  }
  if (!Array.isArray(lista) || !lista.length) return conservar('la lista viene vacía');

  // Casar por clave normalizada, como todo en este proyecto: mlbb.gg y la API
  // escriben algún nombre distinto y sin esto se quedarían sin tier en silencio.
  const nuestros = new Map(heroList.map((h) => [nombreClave(h.name), h.name]));
  const tiers = {};
  let fallos = 0;
  for (const h of lista) {
    const nombre = nuestros.get(nombreClave(h?.name ?? ''));
    if (!nombre || h?.id == null) continue;
    try {
      const ficha = await pedir(`${TIERS}/heroes/${h.id}`);
      if (ESCALONES.includes(ficha?.tier)) tiers[nombre] = ficha.tier;
    } catch {
      fallos++;
    }
    await sleep(200);
  }
  const n = Object.keys(tiers).length;
  // Con menos de la mitad no es una tier list, es un trozo: mejor la de ayer entera.
  if (n < heroList.length / 2) return conservar(`solo ${n} héroes con tier (${fallos} fallos)`);
  diagnostics.tiers = `${n} héroes${fallos ? ` (${fallos} fallos)` : ''}`;
  return { fuente: 'mlbb.gg', fecha: new Date().toISOString(), tiers };
}
