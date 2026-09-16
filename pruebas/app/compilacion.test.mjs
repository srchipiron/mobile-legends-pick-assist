/**
 * Lo que SE PUBLICA, no lo que dice la configuración.
 *
 * Aquí se compila la app entera a un temporal y se mira el `sw.js` y los
 * ficheros que salen. Leer el texto de `vite.config.js` dejaba pasar de todo
 * (probado por mutación): `'heroes/*.jpg'` en la precarga (2,5 MB de caras)
 * pasaba porque la comprobación solo buscaba `png`, y quitar la regla de
 * caché entera pasaba porque la palabra «objetos» sigue en un comentario.
 *
 * La compilación cuesta ~4 s y se hace UNA vez para todo el fichero.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { test, ok, eq, terminar, RAIZ, leerJson, leerTexto } from '../arnes.mjs';

const DIST = mkdtempSync(resolve(tmpdir(), 'dist-sw-'));
execFileSync('npx', ['vite', 'build', '--outDir', DIST], {
  cwd: RAIZ, encoding: 'utf8', timeout: 180000, stdio: ['ignore', 'pipe', 'pipe'],
});
const sw = readFileSync(resolve(DIST, 'sw.js'), 'utf8');
/** Lo que el instalador se descarga de golpe al instalar la app. */
const precarga = [...sw.matchAll(/url:"([^"]+)"/g)].map((m) => m[1]);
/** Las reglas de caché en tiempo de ejecución, ya compiladas: se ejecutan de verdad contra una URL. */
const reglas = [...sw.matchAll(/registerRoute\((\/(?:\\\/|[^/])+\/[a-z]*),/g)].map((m) => new Function(`return ${m[1]}`)());

test('las imagenes no entran en la precarga del instalador', () => {
  // Son ~4,6 MB entre iconos y caras. En la precarga, instalar la app pasaria
  // de 1 MB a 5,6 MB de golpe, y de todas ellas un draft usa once. Van fuera y
  // se guardan en cuanto se ven.
  const vite = leerTexto('vite.config.js');
  const glob = vite.match(/globPatterns:\s*\[([^\]]*)\]/)?.[1] ?? '';
  ok(glob, 'vite.config.js no fija globPatterns: por defecto precarga TODOS los png');
  ok(!/\bpng\b(?![^,]*icon)/.test(glob.replace(/'icon-\*\.png'/, '')),
    `la precarga sigue metiendo png: ${glob}`);

  // Y lo que de verdad decide: el sw.js compilado, que es lo que instala el móvil.
  ok(precarga.length >= 5 && precarga.some((u) => /\.html$/.test(u)), `no se lee la precarga del sw.js compilado: ${precarga.slice(0, 5)}`);
  const imagenes = precarga.filter((u) => /\.(png|jpe?g|webp)$/i.test(u) && !/^icon-\d+\.png$/.test(u));
  ok(!imagenes.length, `la precarga del instalador mete imágenes que no son los iconos de la app: ${imagenes.slice(0, 5).join(', ')}`);

  // La regla de cache en tiempo de ejecucion tiene que casar con lo que la
  // app pide de verdad: ./heroes/{id}.jpg y ./objetos/{id}.png. Sin ella no
  // habria imagen sin cobertura, que es justo cuando estas en un draft.
  ok(reglas.length, 'el sw.js compilado no tiene ninguna regla de cache con expresión regular');
  for (const pedida of ['/mobile-legends-pick-assist/heroes/12.jpg', '/mobile-legends-pick-assist/objetos/1001.png']) {
    ok(reglas.some((re) => re.test(pedida)), `ninguna regla de cache del sw.js casa con ${pedida}: sin cobertura no habrá imagen`);
  }
});

test('version.json se publica fuera de la precarga y la app lo pide sin caché', async () => {
  // La otra mitad de «el diagnostico avisa si el movil esta usando una version
  // vieja»: el aviso solo puede funcionar si ALGUIEN emite version.json y si la
  // app lo pide sin pasar por la cache. Si entrara en la precarga del
  // instalador o bajo /data/ (que tiene su propia regla de cache), se serviria
  // de cache y diria siempre que estas al dia, que es peor que no comprobarlo.
  ok(existsSync(resolve(DIST, 'version.json')),
    'la compilación no emite version.json en la raíz: el diagnóstico no puede saber qué versión hay publicada');
  const publicada = JSON.parse(readFileSync(resolve(DIST, 'version.json'), 'utf8'));
  eq(publicada.version, leerJson('package.json').version, 'version.json no lleva la versión que se está publicando');
  ok(publicada.buildTime && !Number.isNaN(Date.parse(publicada.buildTime)), `version.json sin fecha de compilación: ${publicada.buildTime}`);
  ok(!existsSync(resolve(DIST, 'data/version.json')), 'version.json se publica bajo /data/: se serviría de caché');

  ok(!precarga.some((u) => /version\.json|historial\.json/.test(u)),
    `version.json (o historial.json) entra en la precarga del instalador: ${precarga.join(', ')}`);
  for (const ruta of ['/mobile-legends-pick-assist/version.json', '/mobile-legends-pick-assist/historial.json']) {
    ok(!reglas.some((re) => re.test(ruta)), `una regla de caché del sw.js sirve ${ruta} de caché: diría siempre que estás al día`);
  }

  // Y que la app lo pida de verdad sin cache. Se ejecuta `pedirPublicada`
  // contra un fetch de mentira: un comentario con «no-store» no lo pasa.
  const { pedirPublicada } = await import('../../src/app/entorno.js');
  const llamadas = [];
  const previo = globalThis.fetch;
  globalThis.fetch = async (url, opciones) => {
    llamadas.push({ url: String(url), opciones });
    return { ok: true, json: async () => ({ version: '9.9.9' }) };
  };
  try {
    const r = await pedirPublicada();
    eq(r.publicada?.version, '9.9.9', 'pedirPublicada no devuelve lo que responde el servidor');
    const version = llamadas.find((l) => /version\.json/.test(l.url));
    ok(version, `la app no pide version.json: ${llamadas.map((l) => l.url).join(', ')}`);
    eq(version.opciones?.cache, 'no-store', 'la app pide version.json sin `cache: no-store`: leería la versión vieja de la propia caché');
    const historial = llamadas.find((l) => /historial\.json/.test(l.url));
    ok(historial, 'la app no pide historial.json: el diagnóstico se quedaría sin la serie de la vigilancia');
    eq(historial.opciones?.cache, 'no-store', 'historial.json se pide con caché: diría siempre lo mismo');
  } finally {
    globalThis.fetch = previo;
  }
});

test('las novedades salen del CHANGELOG.md y la primera es la version que se publica', async () => {
  const { parsearChangelog, resumen, sinMarkdown } = await import('../../scripts/changelog.mjs');
  const md = leerTexto('CHANGELOG.md');
  const pkg = leerJson('package.json');
  const entradas = parsearChangelog(md);
  ok(entradas.length >= 5 && entradas.length <= 12, `deberian salir entre 5 y 12 versiones, salen ${entradas.length}`);
  eq(entradas[0].version, pkg.version, 'la primera entrada no es la version del package.json');
  ok(entradas.every((e) => e.cambios.length > 0), 'hay una version sin cambios');
  ok(entradas.every((e) => e.cambios.every((c) => !/\*\*|`/.test(c))), 'queda markdown en los cambios');
  // Las lineas de continuacion se pegan a su vineta, no se pierden.
  const fx = parsearChangelog('## 2.0.0\n\n- **Uno.** Sigue aqui\n  y aqui.\n- Dos.\n\n## 1.9.0\n\n- Tres `x`.\n');
  eq(fx.length, 2, 'fixture: dos versiones');
  eq(fx[0].cambios[0], 'Uno. Sigue aqui y aqui.', `continuacion mal pegada: ${fx[0].cambios[0]}`);
  eq(fx[1].cambios[0], 'Tres x.', 'sinMarkdown no quita el codigo');
  // Las versiones antiguas van en parrafos: cada parrafo es un cambio.
  const px = parsearChangelog('## 1.0.0\n\n**Uno.** Sigue\naqui.\n\nDos entero.\n');
  eq(px[0].cambios.length, 2, `dos parrafos, dos cambios: ${JSON.stringify(px[0].cambios)}`);
  eq(px[0].cambios[0], 'Uno. Sigue aqui.', 'el parrafo no se pega');
  eq(sinMarkdown('**a** `b`'), 'a b', 'sinMarkdown');
  // El resumen es la primera frase, y un cambio de una frase se queda entero.
  eq(resumen('Banear en la mitad de toques. El selector ya no se cierra con cada heroe: tocas y listo.'), 'Banear en la mitad de toques.', 'resumen');
  eq(resumen('Corrige un fallo.'), 'Corrige un fallo.', 'resumen de una frase');
  eq(resumen('Probabilidad estimada de ganar: debajo del analisis sale el porcentaje.'), 'Probabilidad estimada de ganar.', 'resumen con dos puntos');

  // Y las novedades que se PUBLICAN son las de ese mismo fichero: `vite.config.js`
  // las mete en `__CHANGELOG__` al compilar, así que no pueden desincronizarse.
  const js = precarga.filter((u) => /\.js$/.test(u)).map((u) => readFileSync(resolve(DIST, u), 'utf8')).join('\n');
  ok(js.includes(entradas[0].version), `la app compilada no lleva la versión ${entradas[0].version}`);
  ok(js.includes(entradas[0].cambios[0]),
    'las novedades de la app compilada no salen del CHANGELOG.md: se escribirían dos veces y se desincronizarían');
});

await terminar('app/compilacion');
rmSync(DIST, { recursive: true, force: true });
