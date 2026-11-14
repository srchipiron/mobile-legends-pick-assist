/**
 * Lector de workflows y acciones locales POR FORMA, no por texto suelto: un
 * `run: echo "antes: node scripts/comparar-ingesta.mjs"` pasaba un
 * guardarraíl por texto. Un workflow se lee como lo que es (jobs, pasos y sus
 * claves) y de un `run` salen los MANDATOS, sin comentarios ni el interior de
 * un `echo`. No es un YAML completo: el subconjunto de estos ficheros (mapas
 * por sangría, listas de pasos y escalares de bloque `|`).
 */
import { existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ, leerTexto } from '../ayuda.mjs';

const DIR = '.github/workflows';
const ACCIONES = '.github/actions';
const sangria = (l) => l.length - l.trimStart().length;

/** Ficheros de workflow del repositorio (sin lista a mano: si añades uno, entra). */
export const WORKFLOWS = readdirSync(join(RAIZ, DIR)).filter((f) => f.endsWith('.yml')).sort();
/** Acciones locales (`.github/actions/<nombre>/action.yml`). */
export const ACCIONES_LOCALES = existsSync(join(RAIZ, ACCIONES))
  ? readdirSync(join(RAIZ, ACCIONES)).filter((d) => existsSync(join(RAIZ, ACCIONES, d, 'action.yml'))).sort()
  : [];

/** Los nodos `clave: valor` del texto, con su sangría y su valor de bloque ya unido. */
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
    const nodo = { linea: i + 1, indent, clave: m[3], valor: (m[4] ?? '').trim(), lista: !!m[2] };
    salida.push(nodo);
    if (/^[|>][-+]?\d*$/.test(nodo.valor)) { nodo.valor = ''; bloque = { indent, nodo, lineas: [] }; }
  }
  if (bloque) cerrar();
  return salida;
}

/** Los pasos de una lista cuyos elementos empiezan en la sangría `item`; las claves hondas, como `with.path`. */
function pasosDe(ns, item) {
  const pasos = [];
  let clave = null;
  for (const n of ns) {
    if (n.indent === item && n.lista) pasos.push({ _linea: n.linea });
    const paso = pasos[pasos.length - 1];
    if (!paso) continue;
    if (n.indent === item) { paso[n.clave] = n.valor; clave = n.clave; } else if (n.indent > item && clave) paso[`${clave}.${n.clave}`] = n.valor;
  }
  return pasos;
}

/**
 * Un workflow leído: `{ fichero, texto, jobs: [{ nombre, claves, pasos }], pasos }`.
 * Cada paso es un objeto con sus claves (`name`, `run`, `uses`, `if`, `shell`…).
 */
export function leerWorkflow(fichero) {
  const texto = leerTexto(`${DIR}/${fichero}`);
  const todos = nodos(texto);
  const jobs = [];
  for (const n of todos.slice(todos.findIndex((x) => x.indent === 0 && x.clave === 'jobs') + 1)) {
    if (n.indent === 0) break;
    if (n.indent === 2 && !n.lista) { jobs.push({ nombre: n.clave, claves: {}, _n: [] }); continue; }
    jobs.at(-1)?._n.push(n);
  }
  for (const j of jobs) {
    const enPasos = [];
    let dentro = false;
    for (const n of j._n) {
      if (n.indent === 4 && !n.lista) { dentro = n.clave === 'steps'; if (!dentro) j.claves[n.clave] = n.valor; continue; }
      if (dentro) enPasos.push(n);
    }
    j.pasos = pasosDe(enPasos, 8);
    delete j._n;
  }
  return { fichero, texto, jobs, pasos: jobs.flatMap((j) => j.pasos) };
}

/** Una acción local: `{ nombre, texto, pasos }` (los de `runs.steps`). */
export function leerAccion(nombre) {
  const texto = leerTexto(`${ACCIONES}/${nombre}/action.yml`);
  const todos = nodos(texto);
  const desde = todos.findIndex((n) => n.indent === 2 && n.clave === 'steps');
  return { nombre, texto, pasos: desde < 0 ? [] : pasosDe(todos.slice(desde + 1), 6) };
}

/** Todos los workflows, leídos. */
export const workflows = () => WORKFLOWS.map(leerWorkflow);

/**
 * Los MANDATOS de un `run`: sin comentarios de shell y troceados por `;`,
 * `&&`, `||` y `|`, con las palabras del shell (`if`, `then`, `!`…) fuera. Lo
 * de DENTRO de un `echo` queda dentro del mandato `echo`.
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
