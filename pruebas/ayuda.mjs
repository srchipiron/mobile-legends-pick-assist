/**
 * Lo que comparten las pruebas. Corren con `node --test` (un proceso por
 * fichero, espera lo asíncrono y una prueba que falla tarde también cuenta).
 * `ok`/`eq`/`casi` son las de siempre: `eq` es `===`, no una igualdad profunda.
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export { test } from 'node:test';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');
export const leerJson = (ruta) => JSON.parse(readFileSync(resolve(RAIZ, ruta), 'utf8'));
export const leerTexto = (ruta) => readFileSync(resolve(RAIZ, ruta), 'utf8');

export const ok = (cond, msg) => { if (!cond) throw new Error(msg ?? 'condición falsa'); };
export const eq = (a, b, msg) => ok(a === b, msg ?? `esperaba ${JSON.stringify(b)} y salió ${JSON.stringify(a)}`);
export const casi = (a, b, tol = 1e-9, msg) => ok(Math.abs(a - b) <= tol, msg ?? `esperaba ${b} ± ${tol} y salió ${a}`);
export const lanza = (fn, msg) => { let salto = false; try { fn(); } catch { salto = true; } ok(salto, msg ?? 'no lanzó'); };

/** mulberry32: drafts sintéticos iguales en cualquier máquina. */
export function generador(semilla = 7) {
  let a = (semilla >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 0..1 que sale del NOMBRE, no de la posición: ordenar un fichero no lo cambia. */
export function porNombre(nombre, sal = 31) {
  let x = 2166136261 ^ sal;
  for (const ch of String(nombre)) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
  return ((x >>> 0) % 100000) / 100000;
}
