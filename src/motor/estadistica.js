/** Las cuentas que comparten varios módulos del motor, escritas UNA vez. */

export const logit = (p) => Math.log(p / (1 - p));
export const sigmoide = (x) => 1 / (1 + Math.exp(-x));
export const clamp01 = (x) => Math.max(0, Math.min(1, x));

export const DIA_MS = 86400000;
export const SEMANA_MS = 7 * DIA_MS;

/** Pearson entre dos listas de la misma longitud (0 si alguna no varía). */
export function correlacion(xs, ys) {
  const n = xs.length;
  const mx = xs.reduce((a, b) => a + b, 0) / n;
  const my = ys.reduce((a, b) => a + b, 0) / n;
  let sxy = 0; let sxx = 0; let syy = 0;
  for (let i = 0; i < n; i++) { sxy += (xs[i] - mx) * (ys[i] - my); sxx += (xs[i] - mx) ** 2; syy += (ys[i] - my) ** 2; }
  return sxx && syy ? sxy / Math.sqrt(sxx * syy) : 0;
}

/** FNV-1a de 32 bits de un texto (huellas y sumas de control; no es criptografía). */
export function fnv1a(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) h = Math.imul(h ^ texto.charCodeAt(i), 16777619);
  return h >>> 0;
}
