/**
 * Lector de workflows POR FORMA, no por texto suelto. `CLAUDE.md` tiene su
 * propio error apuntado: `run: echo "antes: node scripts/comparar-ingesta.mjs"`
 * pasaba el guardarraíl, y `h > 7200` pasaba el del tope de antigüedad. Aquí un
 * workflow se lee como lo que es -jobs, pasos y sus claves- y de un `run` se
 * sacan los MANDATOS de verdad, sin comentarios de shell ni el interior de un
 * `echo`.
 *
 * No es un YAML completo: entiende el subconjunto que usan estos ficheros
 * (mapas por sangría, listas de pasos y escalares de bloque `|`).
 */
import { readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ, leerTexto } from '../arnes.mjs';

const DIR = '.github/workflows';
const sangria = (l) => l.length - l.trimStart().length;

/** Ficheros de workflow del repositorio (sin rutas a mano: si añades uno, entra). */
export const WORKFLOWS = readdirSync(join(RAIZ, DIR)).filter((f) => f.endsWith('.yml')).sort();

/** Los nodos `clave: valor` del fichero, con su sangría y su valor de bloque ya unido. */
function nodos(texto) {
  const lineas = texto.split('\n');
  const salida = [];
  let bloque = null;
  const cerrar = () => {
    const conts = bloque.lineas.filter((x) => x.trim());
    const min = conts.length ? Math.min(...conts.map(sangria)) : 0;
    bloque.nodo.valor = bloque.lineas.map((x) => x.slice(min)).join('\n').trim();
    bloque = null;
  };
  for (let i = 0; i < lineas.length; i++) {
    const l = lineas[i];
    if (bloque) {
      if (!l.trim() || sangria(l) > bloque.indent) { bloque.lineas.push(l); continue; }
      cerrar();
    }
    if (!l.trim() || /^\s*#/.test(l)) continue;
    const m = l.match(/^(\s*)(- )?([A-Za-z0-9_.-]+):(?:\s(.*)|\s*)$/);
    if (!m) continue;
    const indent = m[1].length + (m[2] ? 2 : 0);
    const valor = (m[4] ?? '').trim();
    const nodo = { linea: i + 1, indent, clave: m[3], valor, lista: !!m[2] };
    salida.push(nodo);
    if (/^[|>][-+]?\d*$/.test(valor)) { nodo.valor = ''; bloque = { indent, nodo, lineas: [] }; }
  }
  if (bloque) cerrar();
  return salida;
}

/**
 * Un workflow leído: `{ fichero, texto, jobs: [{ nombre, claves, pasos }] }`.
 * Cada paso es un objeto con sus claves (`name`, `run`, `uses`, `if`,
 * `timeout-minutes`, `shell`…) y las de segundo nivel como `with.path`.
 */
export function leerWorkflow(fichero) {
  const texto = leerTexto(`${DIR}/${fichero}`);
  const todos = nodos(texto);
  const iJobs = todos.findIndex((n) => n.indent === 0 && n.clave === 'jobs');
  const jobs = [];
  for (const n of todos.slice(iJobs + 1)) {
    if (n.indent === 0) break;
    if (n.indent === 2 && !n.lista) { jobs.push({ nombre: n.clave, claves: {}, pasos: [], _n: [] }); continue; }
    if (jobs.length) jobs[jobs.length - 1]._n.push(n);
  }
  for (const j of jobs) {
    let enPasos = false;
    let clave8 = null;
    for (const n of j._n) {
      if (n.indent === 4 && !n.lista) {
        enPasos = n.clave === 'steps';
        if (!enPasos) j.claves[n.clave] = n.valor;
        continue;
      }
      if (!enPasos) continue;
      if (n.indent === 8 && n.lista) j.pasos.push({ _linea: n.linea });
      const paso = j.pasos[j.pasos.length - 1];
      if (!paso) continue;
      if (n.indent === 8) { paso[n.clave] = n.valor; clave8 = n.clave; }
      else if (n.indent > 8 && clave8) paso[`${clave8}.${n.clave}`] = n.valor;
    }
    delete j._n;
  }
  return { fichero, texto, jobs, pasos: jobs.flatMap((j) => j.pasos) };
}

/** Todos los workflows, leídos. */
export const workflows = () => WORKFLOWS.map(leerWorkflow);

/**
 * Los MANDATOS de un `run`: sin comentarios de shell y troceados por `;`,
 * `&&`, `||` y `|`, con las palabras del shell (`if`, `then`, `!`…) fuera. Lo
 * que va DENTRO de un `echo` queda dentro del mandato `echo`, que es justo lo
 * que hacía pasar el guardarraíl a una mención de la comparación.
 */
export function mandatos(run) {
  if (!run) return [];
  return run
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'))
    .map((l) => l.replace(/\s+#\s.*$/, ''))
    .join('\n')
    .split(/\n|;|&&|\|\||\||\\$/m)
    .map((c) => c.trim().replace(/^(?:if|elif|while|until|then|do|done|else|fi|!|\{|\(|-)\s+/, '').trim())
    .filter(Boolean);
}

/** ¿Este `run` EJECUTA ese mandato? (no lo nombra en un comentario ni en un echo) */
export const ejecuta = (run, re) => mandatos(run).some((c) => re.test(c));
