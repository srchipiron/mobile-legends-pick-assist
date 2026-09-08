#!/usr/bin/env node
/**
 * Detecta consts usadas antes de declararse DENTRO DE LA MISMA función.
 * Ese fallo no da error al compilar: la app arranca, revienta y deja la pantalla
 * en negro. Sin herramientas de desarrollo en el móvil cuesta mucho localizarlo,
 * así que se comprueba aquí antes de subir nada.
 */
import { readFileSync } from 'node:fs';

const files = process.argv.slice(2);
let fallos = 0;

/** Trocea el fichero en funciones de primer nivel. */
function bloques(lines) {
  const inicios = [];
  lines.forEach((line, i) => {
    if (/^(export\s+)?(default\s+)?function\s+\w+/.test(line)) inicios.push(i);
  });
  return inicios.map((start, idx) => ({
    start,
    end: idx + 1 < inicios.length ? inicios[idx + 1] : lines.length,
  }));
}

for (const file of files) {
  const lines = readFileSync(file, 'utf8').split('\n');

  for (const { start, end } of bloques(lines)) {
    // Solo las declaraciones del cuerpo principal (dos espacios de sangría):
    // las anidadas viven en su propio ámbito y no aplican.
    const declared = new Map();
    for (let i = start; i < end; i++) {
      // `let` también: un `let x = useMemo(...)` usado antes es el mismo TDZ y la
      // misma pantalla en negro (probado por mutación: solo se miraba `const`).
      // Y las desestructuradas (`const [a, setA] = useState()`, `const { x } =
      // props`), que son la mitad de las de App.jsx y justo las de React:
      // solo se miraba `const nombre =` (probado por mutación).
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
        const line = lines[i]
          .replace(/\.\s*[A-Za-z_$][\w$]*/g, '')
          .replace(/([A-Za-z_$][\w$]*)\s*:/g, '')
          .replace(/'[^']*'|"[^"]*"|`[^`]*`/g, '');
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
console.log('Orden de declaraciones correcto.');
