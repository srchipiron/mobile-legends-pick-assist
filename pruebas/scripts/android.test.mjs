/**
 * Lo que la APK necesita de Android y no se ve hasta tenerla en la mano
 * (3.68.1). La burbuja pide el consejo al lector por http://127.0.0.1, y con
 * targetSdk 28+ Android bloquea ese HTTP sin cifrar salvo que la app lo
 * permita: sin la excepción, la burbuja no salía nunca y no se enteraba
 * nadie (el error se tragaba). Se exige por forma.
 */
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

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

await terminar('scripts/android');
