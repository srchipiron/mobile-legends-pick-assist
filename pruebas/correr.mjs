#!/usr/bin/env node
/**
 * Ejecuta todos los `*.test.mjs` de pruebas/ (o los que se pasen por
 * argumento), cada uno en su proceso, hasta tres a la vez, y devuelve rojo si
 * alguno falla. Cada fichero se aísla: un `process.exit` o un error de
 * importación en uno no tapa a los demás, y la salida de cada uno se imprime
 * entera cuando acaba, sin mezclarse.
 *
 *   node pruebas/correr.mjs                 todos
 *   node pruebas/correr.mjs motor/modelo    solo los que casen con el patrón
 *   PRUEBAS_TRAZA=1 node pruebas/correr.mjs  con traza completa de cada fallo
 */
import { spawn } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const AQUI = dirname(fileURLToPath(import.meta.url));
const RAIZ = resolve(AQUI, '..');
// `--e2e`: las pruebas de navegador (pruebas/interfaz/*.e2e.mjs), de una en
// una y sobre dist/ ya compilado. No van en `npm test`: publicar no depende
// de tener un Chrome a mano; corren en pruebas-ui.yml y a mano con
// `npm run test:ui`.
const E2E = process.argv.includes('--e2e');
const patrones = process.argv.slice(2).filter((a) => a !== '--e2e');

function listar(dir) {
  const out = [];
  for (const nombre of readdirSync(dir)) {
    const ruta = join(dir, nombre);
    if (statSync(ruta).isDirectory()) { if (nombre !== 'fixtures' && nombre !== 'paridad' && (E2E ? nombre === 'interfaz' : nombre !== 'interfaz')) out.push(...listar(ruta)); continue; }
    if (nombre.endsWith(E2E ? '.e2e.mjs' : '.test.mjs')) out.push(ruta);
  }
  return out.sort();
}

const ficheros = listar(AQUI).filter((f) => !patrones.length || patrones.some((p) => relative(RAIZ, f).includes(p)));
if (!ficheros.length) { console.error('No hay ficheros de prueba que casen'); process.exit(2); }

const PARALELO = E2E ? 1 : Math.max(1, Math.min(3, Number(process.env.PRUEBAS_PARALELO) || 3));
if (E2E) comprobarDist();

/**
 * Las pruebas de navegador corren sobre `dist/`, no sobre el código: con un
 * `dist/` de otra versión fallan diciendo cosas que no son (la de novedades
 * se queja de que la primera entrada del CHANGELOG no es la publicada), y
 * desde el móvil eso es un rojo que cuesta media hora antes de caer en que
 * solo faltaba compilar. En GitHub no pasa porque `pruebas-ui.yml` compila
 * en el paso de antes.
 */
function comprobarDist() {
  if (!existsSync(resolve(RAIZ, 'dist/index.html'))) {
    console.error('No hay dist/: compila antes con `npm run build`');
    process.exit(2);
  }
  const version = JSON.parse(readFileSync(resolve(RAIZ, 'package.json'), 'utf8')).version;
  let compilada = null;
  try {
    compilada = JSON.parse(readFileSync(resolve(RAIZ, 'dist/version.json'), 'utf8')).version;
  } catch { /* un dist/ sin version.json es de antes de 1.13.0, o está a medias */ }
  if (compilada !== version) {
    console.error(`dist/ trae la ${compilada ?? '(sin version.json)'} y package.json dice ${version}: compila antes con \`npm run build\``);
    console.error('Sin eso, lo que fallaría es la versión vieja, no tu cambio.');
    process.exit(2);
  }
}
const resultados = [];
let indice = 0;

function correr(fichero) {
  return new Promise((resolver) => {
    const inicio = Date.now();
    const hijo = spawn(process.execPath, [fichero], { cwd: RAIZ, env: process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let salida = '';
    hijo.stdout.on('data', (d) => { salida += d; });
    hijo.stderr.on('data', (d) => { salida += d; });
    hijo.on('close', (codigo) => {
      const nombre = relative(RAIZ, fichero);
      const segundos = ((Date.now() - inicio) / 1000).toFixed(1);
      console.log(`\n=== ${nombre} (${segundos} s)${codigo ? ' · FALLA' : ''}`);
      process.stdout.write(salida.endsWith('\n') ? salida : `${salida}\n`);
      resolver({ nombre, codigo: codigo ?? 1, salida });
    });
  });
}

async function trabajador() {
  while (indice < ficheros.length) {
    const f = ficheros[indice++];
    resultados.push(await correr(f));
  }
}

await Promise.all(Array.from({ length: PARALELO }, trabajador));

const rotos = resultados.filter((r) => r.codigo !== 0);
let pasadas = 0; let fallos = 0;
for (const r of resultados) {
  const m = r.salida.match(/(\d+) de (\d+) correctas(?:, (\d+) fallos)?/);
  if (m) { pasadas += Number(m[1]); fallos += Number(m[3] ?? 0); }
}
console.log(`\n${ficheros.length} ficheros · ${pasadas} pruebas correctas${fallos ? `, ${fallos} fallos` : ''}${rotos.length ? ` · ROTOS: ${rotos.map((r) => r.nombre).join(', ')}` : ''}`);
process.exit(rotos.length ? 1 : 0);
