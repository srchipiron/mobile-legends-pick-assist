#!/usr/bin/env node
/**
 * Detecta variables usadas antes de declararse DENTRO DE LA MISMA función.
 * Ese fallo no da error al compilar: la app arranca, revienta y deja la
 * pantalla en negro. Sin herramientas de desarrollo en el móvil cuesta mucho
 * localizarlo, así que se comprueba aquí antes de subir nada.
 *
 *   node scripts/comprobar/orden.mjs src          (recorre *.jsx y *.js)
 *   node scripts/comprobar/orden.mjs fichero.jsx  (uno o varios ficheros)
 *
 * Acepta directorios para que un componente NUEVO quede vigilado sin tener
 * que apuntarlo en una lista: la lista fija de dos ficheros dejaba fuera todo
 * lo que se añadiera después.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const entradas = process.argv.slice(2);
if (!entradas.length) { console.error('uso: orden.mjs <fichero o directorio>...'); process.exit(2); }

/**
 * De un directorio se cogen solo los .jsx: el fallo que esto caza (un
 * `useMemo` que lee otro declarado más abajo) vive en los componentes. Sobre
 * el motor, la heurística de «dos espacios = cuerpo de la función» daba
 * falsos positivos con una variable anidada que se llamaba como una de
 * fuera. Un fichero suelto se acepta sea cual sea su extensión.
 */
function ficherosDe(ruta, explicito = true) {
  if (statSync(ruta).isDirectory()) return readdirSync(ruta).flatMap((n) => ficherosDe(join(ruta, n), false));
  return explicito || ruta.endsWith('.jsx') ? [ruta] : [];
}

/**
 * Trocea el fichero en construcciones de primer nivel: cada línea que
 * empieza en la columna 0 (una función, un `const x = () =>`, una clase)
 * abre un bloque. Solo con `function`, las flechas de primer nivel entre dos
 * funciones se les sumaban al bloque anterior y una variable declarada
 * dentro de una flecha «se usaba antes» en la otra: falso positivo en
 * perfil.js el primer día que se pasó sobre todo src/.
 */
function bloques(lines) {
  const inicios = [];
  lines.forEach((line, i) => {
    if (/^[A-Za-z_$]/.test(line) && !/^(import|export\s*\{|export\s+\*)/.test(line)) inicios.push(i);
  });
  return inicios.map((start, idx) => ({ start, end: idx + 1 < inicios.length ? inicios[idx + 1] : lines.length }));
}

let fallos = 0;
const files = entradas.flatMap((e) => ficherosDe(e));
for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');
  for (const { start, end } of bloques(lines)) {
    // Solo las declaraciones del cuerpo principal (dos espacios de sangría):
    // las anidadas viven en su propio ámbito y no aplican. `let` también (un
    // `let x = useMemo(...)` usado antes es el mismo TDZ), y las
    // desestructuradas (`const [a, setA] = useState()`, `const { x } = props`),
    // que son la mitad de las de React. Las dos cosas, probadas por mutación.
    const declared = new Map();
    for (let i = start; i < end; i++) {
      const m = lines[i].match(/^ {2}(?:const|let)\s+(\[[^\]]*\]|\{[^}]*\}|[A-Za-z_$][\w$]*)\s*=/);
      if (!m) continue;
      const nombres = m[1].startsWith('[') || m[1].startsWith('{')
        // En `{ a: b }` el local es b; en `{ a = 1 }` es a; en `[x, , y]` son x e y.
        ? [...m[1].replace(/=\s*[^,}\]]+/g, '').matchAll(/([A-Za-z_$][\w$]*)(?!\s*:)/g)].map((x) => x[1])
        : [m[1]];
      for (const nombre of nombres) if (!declared.has(nombre)) declared.set(nombre, i);
    }
    for (const [name, declLine] of declared) {
      const re = new RegExp(`\\b${name.replace(/\$/g, '\\$')}\\b`);
      for (let i = start; i < declLine; i++) {
        // Fuera los accesos a propiedad (.enemies), las claves de objeto
        // (enemies:) y las cadenas: no son usos de la variable.
        // Y los parámetros de una flecha (`(n) =>`, `n =>`): son otra
        // variable con el mismo nombre, no un uso de la de fuera (falsos
        // positivos en modelo.js y selftest.js al pasar el guardarraíl sobre
        // todo src/).
        const line = lines[i]
          .replace(/\.\s*[A-Za-z_$][\w$]*/g, '')
          .replace(/([A-Za-z_$][\w$]*)\s*:/g, '')
          .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '')
          .replace(/\(([^()]*)\)\s*=>/g, '=>')
          .replace(/\b[A-Za-z_$][\w$]*\s*=>/g, '=>');
        if (!re.test(line) || /^\s*(\/\/|\*|import)/.test(lines[i])) continue;
        console.error(`${file}:${i + 1} usa "${name}", declarada en la línea ${declLine + 1}`);
        fallos++;
        break;
      }
    }
  }
}

if (fallos) {
  console.error(`\n${fallos} uso(s) antes de declarar: la app no arrancaría.`);
  process.exit(1);
}
console.log(`Orden de declaraciones correcto en ${files.length} ficheros.`);
