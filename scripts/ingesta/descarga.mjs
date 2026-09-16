/**
 * La capa de red: una peticion con tope de tiempo, el GET que cae a POST si la
 * ruta contesta 405, la busqueda de la base que responde y la llamada a una
 * ruta ya descubierta, que afloja parametros ante un 422.
 */

import {
  BASES, PREFIXES, TIMEOUT_MS, UA, diagnostics, estado,
} from './contexto.mjs';

/**
 * Una petición. En el error incluye el cuerpo de la respuesta recortado: cuando
 * la API es FastAPI, un 422 dice exactamente qué campos esperaba, y eso vale más
 * que el código de estado a secas para saber qué corregir.
 */
export async function request(url, method, body) {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method,
      headers: {
        'User-Agent': UA,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: ctl.signal,
    });
    if (!res.ok) {
      let detail = '';
      try {
        const texto = await res.text();
        // En un 422 lo único que importa es `details`: dice qué parámetro falla.
        // El resto del cuerpo (soporte, timestamps) ocupaba todo el hueco y
        // dejaba el dato útil fuera del recorte.
        try {
          const j = JSON.parse(texto);
          detail = j.details ? JSON.stringify(j.details).slice(0, 400) : texto.slice(0, 300);
        } catch {
          detail = texto.replace(/\s+/g, ' ').slice(0, 300);
        }
      } catch { /* sin cuerpo */ }
      const err = new Error(`HTTP ${res.status}${detail ? ` · ${detail}` : ''}`);
      err.status = res.status;
      throw err;
    }
    return res.json();
  } finally {
    clearTimeout(timer);
  }
}

/** GET primero; si contesta 405, el endpoint existe pero quiere POST. */
async function getUrl(url, params, forceMethod) {
  const methods = forceMethod ? [forceMethod] : ['GET', 'POST'];
  let lastErr;
  for (const method of methods) {
    try {
      const data = await request(url, method, method === 'POST' ? params : undefined);
      return { data, method };
    } catch (err) {
      lastErr = err;
      // Solo tiene sentido reintentar con POST si el fallo fue "método no permitido".
      if (err.status !== 405) throw err;
    }
  }
  throw lastErr;
}

function buildUrl(base, prefix, path, params) {
  const url = new URL(base + prefix + path);
  for (const [k, v] of Object.entries(params)) {
    if (v != null) url.searchParams.set(k, String(v));
  }
  return url.toString();
}

/**
 * Pide un recurso probando combinaciones de base y prefijo. Una vez que una
 * funciona se fija en LOCKED y las siguientes llamadas van directas.
 */
export async function fetchResource(paths, params = {}) {
  const combos = estado.LOCKED
    ? [estado.LOCKED]
    : BASES.flatMap((base) => PREFIXES.map((prefix) => ({ base, prefix })));

  let lastErr;
  for (const combo of combos) {
    for (const path of paths) {
      const url = buildUrl(combo.base, combo.prefix, path, params);
      try {
        const { data, method } = await getUrl(url, params, combo.method);
        const rows = firstArray(data);
        if (!rows || !rows.length) throw new Error('respuesta sin filas');
        if (!estado.LOCKED) {
          estado.LOCKED = { ...combo, method };
          console.log(`  · base activa: ${method} ${combo.base}${combo.prefix}`);
        }
        diagnostics.ok.push(`${method} ${combo.base}${combo.prefix}${path}`);
        return { data, rows, url };
      } catch (err) {
        lastErr = err;
        if (diagnostics.failed.length < 40) {
          diagnostics.failed.push(`${combo.base}${combo.prefix}${path} → ${err.message}`);
        }
      }
    }
  }
  throw lastErr ?? new Error('ninguna combinación respondió');
}

/** Llama a una ruta ya descubierta, mandando solo los parámetros que acepta. */
export async function callRoute(route, values, pathValue) {
  const base = route.template.replace(/\{[^}]+\}/, encodeURIComponent(pathValue ?? ''));
  const declarados = route.params.length
    ? Object.fromEntries(Object.entries(values).filter(([k]) => route.params.includes(k)))
    : values;

  // Intentos en orden decreciente de exigencia. Un 422 significa que algún
  // parámetro no le vale, y los valores por defecto del endpoint suelen
  // funcionar: antes bastaba un parámetro mal para perder TODOS los counters.
  const intentos = [
    declarados,
    Object.fromEntries(Object.entries(declarados).filter(([k]) => k === 'rank')),
    {},
  ];

  let ultimoError;
  for (const params of intentos) {
    const url = new URL(base);
    try {
      if (route.method === 'GET') {
        for (const [k, v] of Object.entries(params)) {
          if (v != null) url.searchParams.set(k, String(v));
        }
        const data = await request(url.toString(), 'GET');
        return { data, rows: firstArray(data) ?? [] };
      }
      const data = await request(url.toString(), route.method, params);
      return { data, rows: firstArray(data) ?? [] };
    } catch (err) {
      ultimoError = err;
      if (err.status !== 422) throw err; // solo tiene sentido aflojar ante validación
    }
  }
  throw ultimoError;
}

/** Encuentra el primer array de objetos, a cualquier profundidad del envoltorio. */
function firstArray(node, depth = 0) {
  if (depth > 6 || node == null) return null;
  if (Array.isArray(node) && node.length && typeof node[0] === 'object') return node;
  if (typeof node !== 'object') return null;
  for (const v of Object.values(node)) {
    const found = firstArray(v, depth + 1);
    if (found) return found;
  }
  return null;
}
