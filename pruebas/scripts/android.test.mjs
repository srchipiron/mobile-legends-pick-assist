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
  // Desde lo que arranca Nodo.kt de verdad (3.72.3: arranque-apk.mjs, que carga en-tablet.mjs con import()).
  const entrada = /File\(proyecto, "([^"]+\.mjs)"\)/.exec(readFileSync(join(KOTLIN, 'Nodo.kt'), 'utf8'))?.[1];
  ok(entrada, 'no se encuentra qué arranca Nodo.kt');
  const cola = [entrada]; const vistos = new Set();
  while (cola.length) {
    const f = cola.pop();
    if (vistos.has(f)) continue;
    vistos.add(f);
    ok(copiado(f), `${f} lo importa el lector de la tablet y la APK no lo lleva dentro (build.gradle.kts, copiarLector)`);
    const texto = readFileSync(join(RAIZ, f), 'utf8');
    for (const m of texto.matchAll(/(?:import|export)\b[^'"`;]*?\bfrom\s*['"](\.[^'"]+)['"]/g)) cola.push(relative(RAIZ, join(RAIZ, dirname(f), m[1])));
    for (const m of texto.matchAll(/\bimport\(\s*['"](\.[^'"]+)['"]\s*\)/g)) cola.push(relative(RAIZ, join(RAIZ, dirname(f), m[1])));
  }
  ok(vistos.has('scripts/lector/en-tablet.mjs'), 'lo que arranca la APK no carga el lector (en-tablet.mjs)');
  // El Node de la APK (nodejs-mobile 18.20.4) no trae los datos Unicode de las
  // clases de propiedad: `\p{L}` no compila, el fichero no carga y Lector MLBB
  // se cerraba al empezar a grabar (3.70.0 → 3.72.4, «Invalid property name in
  // character class»). Nada de lo que carga la APK puede usarlas, ni el
  // indicador `v` de expresiones, que las da por supuestas.
  for (const f of vistos) {
    const texto = readFileSync(join(RAIZ, f), 'utf8');
    const propiedad = texto.match(/\\[pP]\{[^}]*\}/);
    ok(!propiedad, `${f} usa ${propiedad?.[0]} en una expresión regular: el Node de la APK no la entiende y el fichero no carga`);
    ok(!/\/[a-z]*v[a-z]*\.test\(|new RegExp\([^)]*['"][a-z]*v[a-z]*['"]\)/.test(texto), `${f} usa el indicador v de expresiones regulares`);
  }
  ok([...vistos].some((f) => f.startsWith('src/app/')), 'el recorrido no llega a lo que el lector importa de la app');
});

test('el lector de la tablet solo llama a donde debe (3.70.0): su puerto interno, la web de Pick Assist y la base de datos', async () => {
  // fetch es global: la lista de imports permitidos no limita los destinos. Se mira cada llamada.
  const PERMITIDAS = {
    'scripts/lector/en-tablet.mjs': { fetch: ['...a'], pedir: ['`${base}/captura`', '`${base}/voz`', 'url'] },
    'src/app/basedatos.js': { fetch: ['`${config.url}/rest/v1/rpc/${funcion}`'] },
  };
  const cola = ['scripts/lector/en-tablet.mjs']; const vistos = new Set(); const vistas = [];
  while (cola.length) {
    const f = cola.pop();
    if (vistos.has(f)) continue;
    vistos.add(f);
    const texto = readFileSync(join(RAIZ, f), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    for (const m of texto.matchAll(/(?:import|export)\b[^'"`;]*?\bfrom\s*['"](\.[^'"]+)['"]/g)) cola.push(relative(RAIZ, join(RAIZ, dirname(f), m[1])));
    for (const m of texto.matchAll(/\b(fetch|pedir)\s*\(\s*([^,)]*)/g)) {
      if (f === 'scripts/lector/servir.mjs' && m[1] === 'pedir') continue; // los hilos de lectura, no la red
      vistas.push(`${f} ${m[1]}(${m[2].trim()})`);
      ok((PERMITIDAS[f]?.[m[1]] ?? []).includes(m[2].trim()), `${f} llama a ${m[1]}(${m[2].trim()}): una salida a la red que no está en la lista (revisa a dónde va y añádela aquí)`);
    }
  }
  ok(vistas.length >= 4, `la prueba no ve las llamadas de siempre: ${vistas}`);
  // Y a dónde van: la web fija y una base de datos que pasa sanearConfig.
  const { DATOS_DE_LA_WEB, esInterno } = await import('../../scripts/lector/en-tablet.mjs');
  ok(Object.values(DATOS_DE_LA_WEB).every((u) => u.startsWith('https://srchipiron.github.io/mobile-legends-pick-assist/')), 'la tablet baja datos de otro sitio');
  ok(esInterno('http://127.0.0.1:1234') && !esInterno('http://192.168.1.5:1234'), 'la captura podría pedirse fuera de 127.0.0.1');
});

test('un fallo al empezar a grabar no cierra la app ni entra en bucle (3.72.1): se recoge, se enseña arriba con «Copiar» y no se pide grabar sola', () => {
  const lector = readFileSync(join(KOTLIN, 'Lector.kt'), 'utf8');
  const principal = readFileSync(join(KOTLIN, 'Principal.kt'), 'utf8');
  // Todo lo de empezar (primer plano, la proyección, la pantalla virtual, la burbuja) dentro del try.
  const empezar = lector.slice(lector.indexOf('EMPEZAR -> try {'), lector.indexOf('PARAR ->'));
  ok(empezar.includes('startForeground(') && empezar.includes('empezar(codigo, datos)'), 'empezar a grabar va fuera del try: un fallo cierra la app');
  ok(/catch \(e: Throwable\)[\s\S]*fallo-grabar\.txt[\s\S]*stopSelf\(\)/.test(empezar), 'el fallo al empezar a grabar no se guarda o el servicio sigue');
  // La petición sola al abrir, solo sin fallo sin ver.
  ok(/if \(n == null && fallo == null && !Lector\.grabando && !pedidoAlAbrir/.test(principal), 'con un fallo sin ver, la app vuelve a pedir grabar sola al abrirse (bucle)');
  // Una sola petición de grabar a la vez: dos diálogos anulaban el permiso del primero y la app se cerraba.
  const alternar = principal.slice(principal.indexOf('private fun alternar()'), principal.indexOf('override fun onActivityResult'));
  ok(/if \(pidiendo\) return\s+pidiendo = true/.test(alternar), 'se puede pedir grabar dos veces a la vez');
  ok(/if \(peticion == PEDIR_GRABAR\) pidiendo = false/.test(principal), 'tras contestar, no se puede volver a pedir');
  ok(/if \(grabando\) Unit/.test(empezar), 'un segundo permiso para la grabación que ya va');
  for (const f of ['fallo-grabar.txt', 'fallo.txt', 'salida-nodo.txt', 'fallo-nodo.txt']) ok(principal.includes(`fichero("${f}")`), `el aviso no enseña ${f}`);
  ok(/Salidas\.falloDesde\(this, visto\)/.test(principal) && /setPrimaryClip/.test(principal) && /fallosVistos/.test(principal), 'el aviso no lee el cierre de Android, no se puede copiar o no se puede quitar');
});

test('Node en la APK arranca vigilado (3.72.3): los vigilantes se ponen ANTES de cargar el lector, y un fallo al cargarlo no cierra la app', () => {
  const entrada = /File\(proyecto, "([^"]+\.mjs)"\)/.exec(readFileSync(join(KOTLIN, 'Nodo.kt'), 'utf8'))?.[1];
  eq(entrada, 'scripts/lector/arranque-apk.mjs', 'la APK arranca otra cosa que el arranque vigilado');
  const a = readFileSync(join(RAIZ, entrada), 'utf8');
  const estaticos = [...a.matchAll(/^import\b[^;]*?from\s*['"]([^'"]+)['"]|^import\s*['"]([^'"]+)['"]/gm)].map((m) => m[1] ?? m[2]);
  ok(estaticos.every((m) => m.startsWith('node:')), `el arranque carga algo del lector antes de vigilar: ${estaticos}`);
  const vigila = a.indexOf("process.on('uncaughtException'"), promesas = a.indexOf("process.on('unhandledRejection'"), carga = a.indexOf("await import('./en-tablet.mjs')");
  ok(vigila > 0 && promesas > 0 && carga > vigila && carga > promesas, 'el lector se carga antes de poner los vigilantes');
  ok(/try \{[\s\S]*await import\('\.\/en-tablet\.mjs'\)[\s\S]*\} catch \(e\) \{[\s\S]*fallo-nodo|apuntar\('al arrancar'/.test(a) && /setInterval\(/.test(a), 'un fallo al cargar el lector deja salir a Node (y cierra la app)');
});

await terminar('scripts/android');
