#!/usr/bin/env node
/**
 * Deriva `SPECIALITY_TAGS` y `ROLE_VETO` (src/motor/reglas.js) del catálogo
 * escrito a mano: qué tags llevan los héroes de cada speciality de Moonton, y
 * qué tag no aparece NUNCA en un rol. Sale de los datos y se mide (dejando
 * cada héroe fuera, los 126 del catálogo) [M]:
 *
 *   ROLE_DEFAULTS solo        precisión 66.8%  cobertura 39.6%  F1 49.2%
 *   + speciality              precisión 66.9%  cobertura 52.7%  F1 57.4%
 *   + speciality + veto       precisión 67.4%  cobertura 52.5%  F1 57.6%
 *
 *   node scripts/derivar-tags.mjs                    (imprime las tablas)
 *   node scripts/derivar-tags.mjs --detalles f.json  (speciality de un volcado guardado)
 *   node scripts/derivar-tags.mjs --meta f.json      (otro roam-meta.json)
 */
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ES_SPECIALITY } from './ingesta/extraccion.mjs';

const RAIZ = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/** Confianza mínima para aceptar speciality → tag, cuántas veces sobre la media, y héroes mínimos [D]. */
const P_MIN = 0.6;
const LIFT_MIN = 1.5;
const N_MIN = 10;
/** Héroes mínimos de un rol para afirmar que un tag NUNCA le corresponde [D]. */
const ROL_MIN = 15;

export function derivar(catalogo, specialityDe, rolDe) {
  const conAmbos = catalogo.filter((h) => (specialityDe(h.name) ?? []).length);
  const tags = [...new Set(catalogo.flatMap((h) => h.tags))];
  const base = Object.fromEntries(tags.map((t) => [t, catalogo.filter((h) => h.tags.includes(t)).length / catalogo.length]));
  const mapa = {};
  for (const esp of [...new Set(conAmbos.flatMap((h) => specialityDe(h.name)))].filter(Boolean)) {
    const con = conAmbos.filter((h) => specialityDe(h.name).includes(esp));
    if (con.length < N_MIN) continue;
    for (const t of tags) {
      const p = con.filter((h) => h.tags.includes(t)).length / con.length;
      if (p >= P_MIN && p / (base[t] || 1e-9) >= LIFT_MIN) (mapa[esp] ??= []).push(t);
    }
  }
  // El veto evita que una correlación se cuele como propiedad: casi todo «Crowd Control» es tanque,
  // y una maga con CC salía de primera línea [M].
  const veto = {};
  for (const rol of [...new Set(catalogo.map((h) => rolDe(h.name)).filter(Boolean))]) {
    const del = catalogo.filter((h) => rolDe(h.name) === rol);
    if (del.length < ROL_MIN) continue;
    const nunca = tags.filter((t) => !del.some((h) => h.tags.includes(t)));
    if (nunca.length) veto[rol] = nunca.sort();
  }
  return { mapa, veto };
}

/** La tabla como código de reglas.js: solo claves con forma de speciality y tags con la de un tag nuestro (una comilla era código) [C]. */
export function pintarTabla(o) {
  return Object.entries(o)
    .filter(([k, v]) => ES_SPECIALITY.test(k) && Array.isArray(v) && v.every((x) => /^[a-z_]{1,30}$/.test(x)))
    .map(([k, v]) => `  '${k}': [${v.map((x) => `'${x}'`).join(', ')}],`).join('\n');
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const arg = (k, def) => { const i = process.argv.indexOf(k); return i > -1 ? process.argv[i + 1] : def; };
  const catalogo = JSON.parse(readFileSync(resolve(RAIZ, 'public/data/heroes.json'), 'utf8')).heroes;
  const meta = JSON.parse(readFileSync(arg('--meta', resolve(RAIZ, 'public/data/roam-meta.json')), 'utf8'));
  const rol = new Map((meta.heroes ?? []).map((h) => [h.name, (h.role ?? '').toLowerCase()]));
  if (![...rol.values()].some(Boolean)) {
    console.error('Los datos no traen rol de héroe: sin eso no se puede derivar el veto. Ejecuta la ingesta o pasa --meta.');
    process.exit(1);
  }
  // La speciality de los 133 la guarda la ingesta (y la conserva si la ficha no llega).
  const detalles = arg('--detalles', null);
  const det = detalles
    ? JSON.parse(readFileSync(detalles, 'utf8'))
    : Object.fromEntries((meta.heroes ?? []).filter((h) => Array.isArray(h?.speciality) && h.speciality.length).map((h) => [h.name, h.speciality]));
  // Con pocas, la tabla saldría vacía y el bot propondría borrar SPECIALITY_TAGS [C].
  const minimo = Math.floor((meta.heroes ?? []).length / 2);
  if (Object.keys(det).length < minimo) {
    console.error(`Solo ${Object.keys(det).length} héroes con speciality (mínimo ${minimo}): no se deriva nada.`);
    process.exit(1);
  }
  const speciality = (n) => (Array.isArray(det[n]) ? det[n] : det[n]?.speciality) ?? [];
  const { mapa, veto } = derivar(catalogo, speciality, (n) => rol.get(n) ?? '');
  console.log(`export const SPECIALITY_TAGS = {\n${pintarTabla(mapa)}\n};\n`);
  console.log(`export const ROLE_VETO = {\n${pintarTabla(veto)}\n};`);
}
