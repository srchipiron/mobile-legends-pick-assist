/**
 * Lo que la APK necesita de Android y no se ve hasta tenerla en la mano
 * (3.68.1). La burbuja pide el consejo al lector por http://127.0.0.1, y con
 * targetSdk 28+ Android bloquea ese HTTP sin cifrar salvo que la app lo
 * permita: sin la excepción, la burbuja no salía nunca y no se enteraba
 * nadie (el error se tragaba). Se exige por forma.
 */
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join, dirname, relative } from 'node:path';

const KOTLIN = join(RAIZ, 'android/app/src/main/java/es/srchipiron/lector');
const manifiesto = readFileSync(join(RAIZ, 'android/app/src/main/AndroidManifest.xml'), 'utf8');

test('si el Kotlin habla con http://127.0.0.1, el manifiesto lo permite SOLO para 127.0.0.1', () => {
  const usan = readdirSync(KOTLIN).filter((f) => f.endsWith('.kt') && readFileSync(join(KOTLIN, f), 'utf8').includes('http://127.0.0.1'));
  ok(usan.length > 0, 'la prueba no prueba nada: ningún .kt habla con 127.0.0.1');
  const m = /android:networkSecurityConfig="@xml\/([\w]+)"/.exec(manifiesto);
  ok(m, `${usan.join(', ')} piden http://127.0.0.1 y el manifiesto no tiene networkSecurityConfig: Android lo bloquea en silencio`);
  const red = readFileSync(join(RAIZ, `android/app/src/main/res/xml/${m[1]}.xml`), 'utf8');
  ok(/<base-config[^>]*cleartextTrafficPermitted="false"/.test(red), 'la base permite HTTP sin cifrar a cualquier sitio');
  const dominios = [...red.matchAll(/<domain[^>]*>([^<]+)<\/domain>/g)].map((x) => x[1].trim());
  eq(dominios.join(), '127.0.0.1', `HTTP sin cifrar permitido a más sitios que la propia tablet: ${dominios}`);
  ok(!/usesCleartextTraffic="true"/.test(manifiesto), 'usesCleartextTraffic abre HTTP a todo');
});

test('todo lo que importa el lector de la tablet va dentro de la APK (3.70.0): un fichero de fuera sin copiar la tira al arrancar', () => {
  // Lo que copia `copiarLector` (build.gradle.kts): carpetas enteras o, con include, ficheros sueltos.
  const gradle = readFileSync(join(RAIZ, 'android/app/build.gradle.kts'), 'utf8');
  const bloque = gradle.slice(gradle.indexOf('copiarLector'), gradle.indexOf('tasks.named("preBuild")'));
  const copias = [...bloque.matchAll(/from\(rootProject\.file\("\.\.\/([^"]+)"\)\)\s*\{([^}]*)\}/g)].map((m) => ({
    carpeta: m[1].replace(/\/$/, ''),
    solo: [...m[2].matchAll(/include\(([^)]*)\)/g)].flatMap((x) => [...x[1].matchAll(/"([^"]+)"/g)].map((y) => y[1])),
  }));
  ok(copias.some((c) => c.carpeta === 'scripts/lector'), 'no se encuentra la copia del lector en build.gradle.kts');
  const copiado = (f) => copias.some((c) => (f === c.carpeta || f.startsWith(`${c.carpeta}/`)) && (!c.solo.length || c.solo.includes(relative(c.carpeta, f))));
  const cola = ['scripts/lector/en-tablet.mjs']; const vistos = new Set();
  while (cola.length) {
    const f = cola.pop();
    if (vistos.has(f)) continue;
    vistos.add(f);
    ok(copiado(f), `${f} lo importa el lector de la tablet y la APK no lo lleva dentro (build.gradle.kts, copiarLector)`);
    const texto = readFileSync(join(RAIZ, f), 'utf8');
    for (const m of texto.matchAll(/(?:import|export)\b[^'"`;]*?\bfrom\s*['"](\.[^'"]+)['"]/g)) cola.push(relative(RAIZ, join(RAIZ, dirname(f), m[1])));
  }
  ok([...vistos].some((f) => f.startsWith('src/app/')), 'el recorrido no llega a lo que el lector importa de la app');
});

await terminar('scripts/android');
