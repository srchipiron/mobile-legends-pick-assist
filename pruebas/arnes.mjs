/**
 * El arnés de pruebas. Sin dependencias: cada fichero `*.test.mjs` lo
 * importa, declara sus pruebas con `test()` y termina con `await terminar()`.
 *
 * Las pruebas asíncronas se APUNTAN y se esperan todas (Promise.all) antes
 * de decidir el código de salida. Un plazo fijo dejaba fuera a seis pruebas
 * en GitHub y un fallo suyo no tumbaba el despliegue (ver CLAUDE.md).
 */
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Lee un JSON del repositorio (ruta relativa a la raíz). */
export const leerJson = (ruta) => JSON.parse(readFileSync(resolve(RAIZ, ruta), 'utf8'));
/** Lee un fichero de texto del repositorio. */
export const leerTexto = (ruta) => readFileSync(resolve(RAIZ, ruta), 'utf8');

const estado = { pasadas: 0, fallos: 0, pendientes: [], nombres: new Set(), fichero: null };

function anotarFallo(nombre, err) {
  estado.fallos += 1;
  const detalle = err?.stack && process.env.PRUEBAS_TRAZA ? err.stack : (err?.message ?? String(err));
  console.error(`  FALLA  ${nombre}\n         ${detalle}`);
}

/**
 * Declara una prueba. Si `fn` devuelve una promesa, se apunta y se espera en
 * `terminar()`. Dos pruebas con el mismo nombre en un fichero es un error:
 * una tapaba a la otra en la salida.
 */
export function test(nombre, fn) {
  if (estado.nombres.has(nombre)) throw new Error(`prueba repetida: ${nombre}`);
  estado.nombres.add(nombre);
  try {
    const r = fn();
    if (r instanceof Promise) {
      estado.pendientes.push(r.then(() => { estado.pasadas += 1; }).catch((err) => anotarFallo(nombre, err)));
      return;
    }
    estado.pasadas += 1;
  } catch (err) {
    anotarFallo(nombre, err);
  }
}

export const ok = (cond, msg) => { if (!cond) throw new Error(msg ?? 'condición falsa'); };
export const eq = (a, b, msg) => ok(a === b, msg ?? `esperaba ${JSON.stringify(b)} y salió ${JSON.stringify(a)}`);
/** Igualdad numérica con tolerancia. */
export const casi = (a, b, tol = 1e-9, msg) => ok(Math.abs(a - b) <= tol, msg ?? `esperaba ${b} ± ${tol} y salió ${a}`);
export const lanza = (fn, msg) => { let saltó = false; try { fn(); } catch { saltó = true; } ok(saltó, msg ?? 'no lanzó'); };

/**
 * Generador determinista (mulberry32) para drafts sintéticos: mismas
 * entradas, mismos drafts, en cualquier máquina.
 */
export function generador(semilla = 7) {
  let a = (semilla >>> 0) || 1;
  return () => {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Un número 0..1 que sale del NOMBRE, no de la posición: ordenar un fichero no lo cambia. */
export function porNombre(nombre, sal = 31) {
  let x = 2166136261 ^ sal;
  for (const ch of String(nombre)) x = Math.imul(x ^ ch.charCodeAt(0), 16777619);
  return ((x >>> 0) % 100000) / 100000;
}

/**
 * Espera las asíncronas, imprime el resumen y fija el código de salida.
 * `nombre` es el del fichero (para el resumen del runner).
 */
export async function terminar(nombre = '') {
  await Promise.all(estado.pendientes);
  const total = estado.pasadas + estado.fallos;
  console.log(`${nombre ? `${nombre}: ` : ''}${estado.pasadas} de ${total} correctas${estado.fallos ? `, ${estado.fallos} fallos` : ''}`);
  process.exitCode = estado.fallos ? 1 : 0;
  return estado.fallos === 0;
}
