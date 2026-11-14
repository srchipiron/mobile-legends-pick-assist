/**
 * Antes de las pruebas de navegador: dist/ tiene que ser la compilación de
 * lo que hay ahora (misma versión que package.json y más nueva que todo
 * src/, index.html y vite.config.js). Probar un dist/ viejo da verde sobre
 * código que ya no existe. Sale con 1 y dice qué hacer.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { RAIZ } from '../ayuda.mjs';

const DIST = process.env.PRUEBAS_DIST ?? join(RAIZ, 'dist');
const fallo = (motivo) => { console.error(`dist/ no vale para las pruebas de navegador: ${motivo}. Compila antes: npm run build`); process.exit(1); };

if (!existsSync(join(DIST, 'version.json'))) fallo('no hay compilación');
const version = JSON.parse(readFileSync(join(RAIZ, 'package.json'), 'utf8')).version;
const compilada = JSON.parse(readFileSync(join(DIST, 'version.json'), 'utf8')).version;
if (compilada !== version) fallo(`es la ${compilada} y package.json dice ${version}`);
const ficheros = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? ficheros(join(d, e.name)) : [join(d, e.name)]));
const fuentes = [...ficheros(join(RAIZ, 'src')), join(RAIZ, 'index.html'), join(RAIZ, 'vite.config.js')];
const masNueva = fuentes.reduce((a, f) => (statSync(f).mtimeMs > a.ms ? { f, ms: statSync(f).mtimeMs } : a), { f: null, ms: 0 });
if (statSync(join(DIST, 'version.json')).mtimeMs < masNueva.ms) fallo(`${masNueva.f.slice(RAIZ.length + 1)} es más nuevo que la compilación`);
