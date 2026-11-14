/**
 * La red de la ingesta: la única función que sale a internet (`request`, con
 * tope y con la puerta de las rutas de la cuenta), la llamada a una ruta del
 * esquema y el camino sin esquema, que prueba bases y prefijos.
 */

import { PREFIJOS, TIMEOUT_MS, UA } from './contexto.mjs';

/**
 * Las rutas de la CUENTA no se tocan nunca: la cuenta de Javi vale dinero [C].
 * El descubrimiento ya las quita del esquema; esta es la segunda puerta.
 */
export const RUTA_PROHIBIDA = /\/(user|users|account|auth|login|oauth|session|me)(\/|$)/i;

/** Un fallo de paso: la API contestó con un error suyo (5xx) o «demasiadas peticiones»; esperar puede arreglarlo [M]. */
export const esFalloDePaso = (e) => e?.status >= 500 || e?.status === 429;

/** Una petición JSON con tope. El error lleva el `details` de un 422 (dice qué parámetro falla) [D]. */
export async function request(url, method, body) {
  if (RUTA_PROHIBIDA.test(new URL(url).pathname)) throw new Error(`ruta prohibida: ${new URL(url).pathname}`);
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: { 'User-Agent': UA, Accept: 'application/json', ...(body ? { 'Content-Type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    if (!res.ok) {
      const detalle = await detalleDe(res);
      const err = new Error(`HTTP ${res.status}${detalle ? ` · ${detalle}` : ''}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

async function detalleDe(res) {
  let texto;
  try { texto = await res.text(); } catch { return ''; }
  try {
    const j = JSON.parse(texto);
    return j.details ? JSON.stringify(j.details).slice(0, 400) : texto.slice(0, 300);
  } catch {
    return texto.replace(/\s+/g, ' ').slice(0, 300);
  }
}

/** El primer array de objetos del envoltorio, a cualquier profundidad (≤ 6). */
export function primerArray(nodo, hondura = 0) {
  if (hondura > 6 || nodo == null) return null;
  if (Array.isArray(nodo) && nodo.length && typeof nodo[0] === 'object') return nodo;
  if (typeof nodo !== 'object') return null;
  for (const v of Object.values(nodo)) {
    const hallado = primerArray(v, hondura + 1);
    if (hallado) return hallado;
  }
  return null;
}

/** Dicen DE QUÉ son los datos: ante un 422 no se sueltan nunca [C]. */
const PARAMETROS_DE_IDENTIDAD = new Set(['rank', 'rank_id', 'lane']);

/**
 * Llama a una ruta descubierta mandando solo los parámetros que declara. Ante
 * un 422 reintenta UNA vez solo con los de identidad. Devuelve `{ data, rows,
 * sin }` (`sin`: lo que se soltó; quien pide una ventana tiene que saberlo).
 */
export async function callRoute(ruta, valores, valorDeCamino) {
  const base = ruta.template.replace(/\{[^}]+\}/, encodeURIComponent(valorDeCamino ?? ''));
  const declarados = ruta.params.length ? Object.fromEntries(Object.entries(valores).filter(([k]) => ruta.params.includes(k))) : valores;
  const identidad = Object.fromEntries(Object.entries(declarados).filter(([k]) => PARAMETROS_DE_IDENTIDAD.has(k)));
  let ultimo;
  for (const params of [declarados, identidad]) {
    const sin = Object.keys(declarados).filter((k) => !(k in params));
    try {
      let data;
      if (ruta.method === 'GET') {
        const url = new URL(base);
        for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
        data = await request(url.toString(), 'GET');
      } else {
        data = await request(new URL(base).toString(), ruta.method, params);
      }
      return { data, rows: primerArray(data) ?? [], sin };
    } catch (err) {
      ultimo = err;
      if (err.status !== 422) throw err;
    }
  }
  throw ultimo;
}

/**
 * Sin esquema: prueba bases × prefijos × caminos (GET y, ante un 405, POST) y
 * fija la primera combinación que da filas en `ctx.fijada` [D]. Los fallos van
 * a `ctx.fallos` (40 como mucho).
 */
export async function buscarRecurso(ctx, caminos, params = {}) {
  const combos = ctx.fijada ? [ctx.fijada] : ctx.op.bases.flatMap((base) => PREFIJOS.map((prefix) => ({ base, prefix })));
  let ultimo;
  for (const combo of combos) {
    for (const camino of caminos) {
      const url = new URL(combo.base + combo.prefix + camino);
      for (const [k, v] of Object.entries(params)) if (v != null) url.searchParams.set(k, String(v));
      try {
        const { data, method } = await getOPost(url.toString(), params, combo.method);
        const rows = primerArray(data);
        if (!rows || !rows.length) throw new Error('respuesta sin filas');
        if (!ctx.fijada) {
          ctx.fijada = { ...combo, method };
          console.log(`  · base activa: ${method} ${combo.base}${combo.prefix}`);
        }
        return { data, rows };
      } catch (err) {
        ultimo = err;
        if (ctx.fallos.length < 40) ctx.fallos.push(`${combo.base}${combo.prefix}${camino} → ${err.message}`);
      }
    }
  }
  throw ultimo ?? new Error('ninguna combinación respondió');
}

/** GET; si contesta 405, el recurso existe y quiere POST. */
async function getOPost(url, params, metodo) {
  let ultimo;
  for (const method of metodo ? [metodo] : ['GET', 'POST']) {
    try {
      return { data: await request(url, method, method === 'POST' ? params : undefined), method };
    } catch (err) {
      ultimo = err;
      if (err.status !== 405) throw err;
    }
  }
  throw ultimo;
}
