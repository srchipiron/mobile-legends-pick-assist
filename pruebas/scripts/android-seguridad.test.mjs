/**
 * La seguridad de la APK, por FORMA (spec/lector.md §1.3, H1–H4): la cuenta
 * del juego de Javi vale dinero, y la APK solo puede MIRAR la pantalla.
 * Cada prueba recorre TODO el Kotlin (y el C++), el manifiesto o apk.yml:
 * un fichero nuevo entra solo, sin lista fija.
 */
import { test, ok, eq, RAIZ, leerTexto, leerJson } from '../ayuda.mjs';
import { readdirSync, readFileSync } from 'node:fs';
import { join, relative } from 'node:path';

const FUENTES = join(RAIZ, 'android/app/src/main');
const ficheros = (ext) => readdirSync(FUENTES, { recursive: true }).map(String).filter((f) => f.endsWith(ext)).map((f) => join(FUENTES, f));
/** El código sin comentarios: un comentario que explica la seguridad nombra lo prohibido. */
const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:"])\/\/.*$/gm, '$1');
const kotlin = () => ficheros('.kt').map((f) => ({ f: relative(RAIZ, f), k: sinComentarios(readFileSync(f, 'utf8')) }));
const manifiesto = () => leerTexto('android/app/src/main/AndroidManifest.xml').replace(/<!--[\s\S]*?-->/g, '');

/** [D] Lo que nada en la APK puede hacer: lanzar programas, tocar la pantalla, cargar código o mirar otras apps. */
const PROHIBIDO_KT = /\bProcessBuilder\b|\bRuntime\b|\.exec\s*\(|AccessibilityService|AccessibilityNodeInfo|dispatchGesture|injectInputEvent|\bInstrumentation\b|\bInputManager\b|MotionEvent\.obtain|\bUiAutomation\b|DexClassLoader|PathClassLoader|InMemoryDexClassLoader|Class\.forName|getDeclaredMethod|\.getMethod\s*\(|"su"|"sh"|\/system\/(x?bin)|\binput (tap|swipe|keyevent|text)\b|\badb\b/;
const PROHIBIDO_CPP = /\bsystem\s*\(|\bpopen\s*\(|\bexec[lv]p?e?\s*\(|\bfork\s*\(|\bposix_spawn|\bdlopen\s*\(/;

test('H1: ningún Kotlin lanza programas, toca la pantalla, usa accesibilidad o carga código, y el C++ solo arranca Node', () => {
  const kts = kotlin();
  ok(kts.length >= 8, `la prueba no ve el Kotlin: ${kts.length} ficheros`);
  for (const { f, k } of kts) ok(!PROHIBIDO_KT.test(k), `${f} usa ${k.match(PROHIBIDO_KT)?.[0]}: la APK solo mira la pantalla`);
  const cpps = ficheros('.cpp');
  ok(cpps.length >= 1, 'la prueba no ve el C++');
  for (const f of cpps) {
    const c = sinComentarios(readFileSync(f, 'utf8'));
    ok(!PROHIBIDO_CPP.test(c), `${relative(RAIZ, f)} usa ${c.match(PROHIBIDO_CPP)?.[0]}`);
  }
});

/** [C] Los permisos de hoy, y por qué (comentario del manifiesto). Uno nuevo se añade aquí con su motivo, nunca de pasada. */
const PERMISOS = [
  'INTERNET', 'ACCESS_NETWORK_STATE', 'FOREGROUND_SERVICE', 'FOREGROUND_SERVICE_MEDIA_PROJECTION', 'POST_NOTIFICATIONS',
  'REQUEST_IGNORE_BATTERY_OPTIMIZATIONS', 'SYSTEM_ALERT_WINDOW', 'REQUEST_INSTALL_PACKAGES', 'UPDATE_PACKAGES_WITHOUT_USER_ACTION',
];

test('H1: el manifiesto pide exactamente los permisos de la lista, y ninguno de los que tocan la pantalla o el sistema', () => {
  const m = manifiesto();
  const pedidos = [...m.matchAll(/<uses-permission(?:-sdk-\d+)?\s+android:name="android\.permission\.([A-Z_]+)"/g)].map((x) => x[1]);
  const todos = [...m.matchAll(/<uses-permission[^>]*>/g)];
  eq(todos.length, pedidos.length, 'un permiso con otra forma (otro espacio de nombres, otro atributo) se cuela sin mirarlo');
  eq([...pedidos].sort().join(), [...PERMISOS].sort().join(), 'los permisos del manifiesto no son los de la lista');
  for (const malo of ['BIND_ACCESSIBILITY_SERVICE', 'INJECT_EVENTS', 'WRITE_SECURE_SETTINGS', 'BIND_DEVICE_ADMIN', 'BIND_INPUT_METHOD', 'accessibilityservice', 'READ_LOGS']) {
    ok(!m.includes(malo), `el manifiesto nombra ${malo}`);
  }
});

/** Las clases propias de la APK: las únicas que se pueden abrir con un Intent explícito. */
const PROPIAS = () => new Set(kotlin().flatMap(({ k }) => [...k.matchAll(/\bclass (\w+)\s*(?:\(|:)/g)].map((x) => x[1])));

test('H2: Mobile Legends solo se ABRE, con getLaunchIntentForPackage, tras «Empezar a leer» y si la preferencia abrirJuego lo deja; nada más lanza otra app', () => {
  const kts = kotlin();
  const lanzar = kts.flatMap(({ f, k }) => [...k.matchAll(/getLaunchIntentForPackage\(([^)]*)\)/g)].map((x) => ({ f, arg: x[1], linea: k.slice(k.lastIndexOf('\n', x.index) + 1, k.indexOf('\n', x.index)) })));
  eq(lanzar.length, 1, `getLaunchIntentForPackage aparece ${lanzar.length} veces: solo puede abrir el juego`);
  const [{ f, arg, linea }] = lanzar;
  const constante = kts.find((x) => x.f === f).k.match(new RegExp(`\\b${arg}\\s*=\\s*"([^"]+)"`))?.[1] ?? (arg.match(/^"(.*)"$/)?.[1]);
  eq(constante, 'com.mobile.legends', `lo que se abre no es Mobile Legends: ${arg}`);
  ok(/\bif \((?:[^()]|\([^()]*\))*getBoolean\("abrirJuego", true\)\)\s*packageManager\.getLaunchIntentForPackage\(/.test(linea), `abrir el juego no va detrás de la preferencia abrirJuego: ${linea.trim()}`);
  ok(manifiesto().match(/<queries>[\s\S]*?<\/queries>/)?.[0].match(/<package android:name="([^"]+)"/g)?.length === 1 && manifiesto().includes('<package android:name="com.mobile.legends" />'), 'el manifiesto puede ver otras apps además del juego');
  const propias = PROPIAS();
  for (const { f: g, k } of kts) {
    for (const malo of ['setPackage(', 'setComponent(', 'ComponentName(', 'setClassName(', 'parseUri(', 'CATEGORY_LAUNCHER', 'bindService(', 'sendBroadcast(']) ok(!k.includes(malo), `${g} usa ${malo}: podría lanzar otra app`);
    // Cada Intent: una pantalla o servicio PROPIO, un ajuste de Android de esta app, o el navegador con una dirección de la lista (H3).
    for (const x of k.matchAll(/\bIntent\(([^()]*(?:\([^()]*\))?[^()]*)\)/g)) {
      const a = x[1].trim();
      const propia = /^(this|contexto|c|applicationContext|this@\w+), (\w+)::class\.java$/.exec(a);
      const ajuste = /^Settings\.ACTION_(REQUEST_IGNORE_BATTERY_OPTIMIZATIONS|MANAGE_OVERLAY_PERMISSION), Uri\.parse\("package:\$packageName"\)$/.test(a);
      const navegador = /^Intent\.ACTION_VIEW, Uri\.parse\((DESCARGA_APK|"https:\/\/github\.com\/srchipiron\/mobile-legends-pick-assist\/[^"]*")\)$/.test(a);
      ok((propia && propias.has(propia[2])) || ajuste || navegador, `${g}: Intent(${a}) no es de los permitidos`);
    }
    // Y cada cosa que se arranca es uno de esos Intent, la captura de Android, la confirmación del instalador o el juego.
    for (const x of k.matchAll(/\b(startActivity|startActivityForResult|startService|startForegroundService)\((\w+)/g)) {
      const linea = k.slice(k.lastIndexOf('\n', x.index) + 1, k.indexOf('\n', x.index));
      const bien = x[2] === 'Intent' || (x[2] === 'it' && /getLaunchIntentForPackage\(JUEGO\)/.test(linea)) || (x[2] === 'confirmar' && g.endsWith('Actualizar.kt'))
        || (x[2] === 'getSystemService' && /createScreenCaptureIntent\(\)/.test(linea));
      ok(bien, `${g}: ${x[1]}(${x[2]}…) arranca algo que no es de la lista`);
    }
  }
});

/** [C] A dónde puede hablar el Kotlin (H3): su propio lector, la release de GitHub y el enlace del QR. */
const URLS = [
  { prefijo: 'http://127.0.0.1:' },
  { exacta: 'https://api.github.com/repos/srchipiron/mobile-legends-pick-assist/releases/latest' },
  { prefijo: 'https://github.com/srchipiron/mobile-legends-pick-assist/' },
  { exacta: 'https://srchipiron.github.io/mobile-legends-pick-assist/' },
];

test('H3: cada dirección del Kotlin está en la lista blanca, y cada conexión sale de una de ellas', () => {
  const vistas = [];
  for (const { f, k } of kotlin()) {
    for (const x of k.matchAll(/"([^"\n]*:\/\/[^"\n]*)"/g)) {
      vistas.push(x[1]);
      ok(URLS.some((u) => (u.exacta ? x[1] === u.exacta : x[1].startsWith(u.prefijo))), `${f} lleva una dirección fuera de la lista: ${x[1]}`);
    }
    // Una conexión: a una de esas direcciones escrita tal cual, a la API de GitHub o a la descarga ya comprobada.
    for (const x of k.matchAll(/\bURL\(([^)]*)\)/g)) {
      const a = x[1].trim();
      ok(/^"(http:\/\/127\.0\.0\.1:|https:\/\/)/.test(a) || a === 'API' || a === 'nueva.url', `${f}: URL(${a}) no sale de la lista`);
      if (a === 'nueva.url') ok(/startsWith\("https:\/\/github\.com\/srchipiron\/mobile-legends-pick-assist\/"\)/.test(k), `${f} descarga una APK sin mirar que venga de la release del repositorio`);
    }
    ok(!/(?<!Server)\bSocket\s*\(|DatagramSocket|WebSocket|okhttp/i.test(k), `${f} abre una conexión por otra vía`);
    for (const x of k.matchAll(/\bServerSocket\(([^)]*\)?)\)/g)) eq(x[1], '0, 16, InetAddress.getByName("127.0.0.1")', `${f}: un ServerSocket que no escucha solo en 127.0.0.1`);
  }
  ok(vistas.some((u) => u.startsWith('http://127.0.0.1:')) && vistas.some((u) => u.startsWith('https://api.github.com/')), `la prueba no ve las direcciones de siempre: ${vistas}`);
});

test('H4: apk.yml FALLA si falta la clave de firma cifrada: nunca crea otra ni sube nada al repositorio', () => {
  const y = leerTexto('.github/workflows/apk.yml').replace(/^\s*#.*$/gm, '');
  for (const malo of ['keytool', 'genkeypair', '-genkey', 'contents/android', 'git push', 'git commit']) ok(!y.includes(malo), `apk.yml usa ${malo}: podría crear o subir otra clave de firma`);
  ok(!/openssl enc(?![^\n]*\s-d\s)/.test(y), 'apk.yml cifra algo con openssl: solo puede DEScifrar la clave que ya está');
  const falta = /if \[ ! -f android\/firma\.jks\.cifrado \]; then[\s\S]*?exit 1[\s\S]*?fi/.exec(y);
  ok(falta, 'apk.yml no se para cuando falta android/firma.jks.cifrado');
  ok(falta.index < y.indexOf('gradlew'), 'apk.yml compila antes de comprobar la clave de firma');
  ok(/^\s*run:\s*npm test\s*$/m.test(y.slice(0, y.indexOf('gh release'))), 'apk.yml publica sin pasar npm test');
  ok(readdirSync(join(RAIZ, 'android')).includes('firma.jks.cifrado'), 'falta android/firma.jks.cifrado: sin ella no se puede actualizar la APK de Javi');
});

test('apk.yml: con un push a main compila y publica; a mano solo compila (y sube la APK como artefacto) salvo que se pida publicar', () => {
  const y = leerTexto('.github/workflows/apk.yml');
  ok(/workflow_dispatch:\s*\n\s*inputs:\s*\n\s*publicar:/.test(y), 'el lanzamiento a mano no tiene la opción «publicar»');
  ok(/default:\s*false/.test(y.slice(y.indexOf('publicar:'), y.indexOf('publicar:') + 300)), '«publicar» no está apagado por defecto');
  const publicar = y.slice(y.indexOf('- name: Publicar'));
  ok(/^\s*if: github\.event_name == 'push' \|\| inputs\.publicar\s*$/m.test(publicar.split('\n').slice(0, 3).join('\n')), 'la release se publica también al compilar a mano sin pedirlo');
  ok(/actions\/upload-artifact@[0-9a-f]{40}/.test(y) && /lector-mlbb\.apk/.test(y.slice(y.indexOf('upload-artifact'))), 'compilar a mano no deja la APK como artefacto');
  ok(!/ref: main/.test(y), 'apk.yml compila siempre main: a mano no se podría compilar una rama');
});

/** [C] La última APK publicada con el esquema viejo (3.102.0 = 3·10000 + 102·100). */
const ULTIMO_CODIGO_PUBLICADO = 40200;

test('versionCode = mayor·1.000.000 + menor·1.000 + parche: nunca baja de la última publicada y crece con cada versión', () => {
  const g = leerTexto('android/app/build.gradle.kts');
  const formula = /versionCode = mayor \* 1_000_000 \+ menor \* 1_000 \+ parche/.test(g);
  ok(formula, 'el versionCode no sigue el esquema de 4.0');
  ok(/require\(menor < 1000 && parche < 1000\)/.test(g), 'sin tope, un menor ≥ 1000 se comería al mayor (como en 3.100.0)');
  const codigo = (v) => { const [a, b, c] = v.split('.').map(Number); return a * 1_000_000 + b * 1_000 + c; };
  const version = leerJson('package.json').version;
  ok(codigo(version) > ULTIMO_CODIGO_PUBLICADO, `la ${version} daría ${codigo(version)}, por debajo de la última publicada (${ULTIMO_CODIGO_PUBLICADO}): Android no la instalaría encima`);
  ok(codigo('4.0.0') > ULTIMO_CODIGO_PUBLICADO && codigo('4.0.1') > codigo('4.0.0') && codigo('4.1.0') > codigo('4.0.999') && codigo('5.0.0') > codigo('4.999.999'), 'el esquema no crece con la versión');
});

test('la 4.0 se instala ENCIMA de la vieja sin perder nada: el mismo paquete, la misma firma y los mismos nombres de lo guardado', () => {
  const g = leerTexto('android/app/build.gradle.kts');
  ok(/namespace = "es\.srchipiron\.lector"/.test(g) && /applicationId = "es\.srchipiron\.lector"/.test(g), 'cambia el paquete: sería otra app');
  ok(/System\.getenv\("LECTOR_FIRMA"\)/.test(g) && /keyAlias = "lector"/.test(g) && (g.match(/System\.getenv\("LECTOR_FIRMA_CLAVE"\)/g) ?? []).length === 2, 'cambia la configuración de la firma');
  const k = kotlin().map((x) => x.k).join('\n');
  ok(!/getSharedPreferences\("(?!lector")/.test(k), 'unas preferencias con otro nombre que «lector»');
  for (const clave of ['codigo', 'abrirJuego', 'guiaVista', 'burbuja', 'ultimoResumen', 'fallosVistos']) ok(k.includes(`"${clave}"`), `se pierde la preferencia «${clave}»`);
  for (const f of ['solo.json', 'salud.json', 'fallo.txt', 'fallo-grabar.txt', 'fallo-nodo.txt', 'salida-nodo.txt', 'nodejs-project.version', 'lector.log']) ok(k.includes(`"${f}"`), `se pierde el fichero ${f}`);
  ok(/allowBackup="false"/.test(manifiesto()), 'la copia de seguridad de Android se llevaría el código de vinculación');
});
