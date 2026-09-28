/**
 * El lector de la pantalla del draft (scripts/lector): leer los baneos de
 * una captura de la tablet. Con un recorte fijo de una captura real de Javi
 * (pruebas/fixtures/juego/baneos.png: la fila de baneos de su draft del 26
 * de septiembre de 2026, fase de picks) y con la regla de seguridad que
 * pidió él: el lector solo hace capturas, nunca toca la tablet.
 */
import { readFileSync, readdirSync, mkdtempSync, writeFileSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test, ok, eq, terminar, RAIZ, leerJson, generador } from '../arnes.mjs';
import { leerPng, escribirPng } from '../../scripts/lector/png.mjs';
import { LADO } from '../../scripts/lector/caras.mjs';
import { leerBaneos, leerPicksEnemigos, carasGuardadas, carasDesfasadas, REFERENCIA } from '../../scripts/lector/leer.mjs';

test('el lector de PNG devuelve los mismos píxeles con los cinco filtros de fila', () => {
  const azar = generador(3);
  const ancho = 37, alto = 23, rgba = new Uint8Array(ancho * alto * 4);
  // Degradados con ruido: con píxeles al azar puro Paeth y media casi no se distinguen de «nada».
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) for (let c = 0; c < 4; c++) rgba[(y * ancho + x) * 4 + c] = (x * 7 + y * 3 * (c + 1) + Math.floor(azar() * 40)) & 255;
  for (const filtro of [0, 1, 2, 3, 4]) {
    const vuelta = leerPng(escribirPng({ ancho, alto, rgba }, () => filtro));
    eq(vuelta.ancho, ancho); eq(vuelta.alto, alto);
    ok(Buffer.from(vuelta.rgba).equals(Buffer.from(rgba)), `con el filtro ${filtro} los píxeles no vuelven iguales`);
  }
  const mezcla = leerPng(escribirPng({ ancho, alto, rgba }, (y) => y % 5));
  ok(Buffer.from(mezcla.rgba).equals(Buffer.from(rgba)), 'mezclando filtros por fila los píxeles no vuelven iguales');
  // Entrelazado Adam7 (una de las 133 caras de la API viene así), con un
  // tamaño que no es múltiplo de 8 para que las pasadas queden desiguales.
  const adam7 = leerPng(escribirPng({ ancho, alto, rgba }, (y) => y % 5, { entrelazado: true }));
  ok(Buffer.from(adam7.rgba).equals(Buffer.from(rgba)), 'con entrelazado Adam7 los píxeles no vuelven iguales');
  // Paleta con transparencia (el dibujo grande de la API es de paleta).
  const pocos = rgba.map((v, k) => (k % 4 === 3 ? (v > 128 ? 255 : 90) : v & 0xc0));
  for (const entrelazado of [false, true]) {
    const pal = leerPng(escribirPng({ ancho, alto, rgba: pocos }, (y) => y % 5, { paleta: true, entrelazado }));
    ok(Buffer.from(pal.rgba).equals(Buffer.from(pocos)), `con paleta${entrelazado ? ' y entrelazado' : ''} los píxeles no vuelven iguales`);
  }
});

test('una imagen entrelazada REAL de la API se lee igual que en el navegador', () => {
  // La cara de Thamuz (`hero.data.head` de la API, 28-9-2026) viene
  // entrelazada. El escritor de las pruebas comparte la tabla Adam7 con el
  // lector, así que un error en ella pasaría la prueba de ida y vuelta: esta
  // no. La huella se sacó con este lector después de comprobar que da los
  // mismos píxeles que Chromium (diferencia máxima 0 en RGB y en alfa).
  const img = leerPng(readFileSync(join(RAIZ, 'pruebas/fixtures/juego/entrelazado.png')));
  let h = 0x811c9dc5;
  for (const b of img.rgba) { h ^= b; h = Math.imul(h, 0x01000193) >>> 0; }
  eq(`${img.ancho}x${img.alto} ${h.toString(16)}`, '128x128 7baf46b4', 'la imagen entrelazada no se lee como en el navegador');
});

/** La captura entera de 2400×1504, negra salvo las dos tiras de baneos del recorte. */
function capturaDeBaneos() {
  const tira = leerPng(readFileSync(join(RAIZ, 'pruebas/fixtures/juego/baneos.png')));
  const { ancho, alto } = REFERENCIA, rgba = new Uint8Array(ancho * alto * 4);
  for (let y = 0; y < tira.alto; y++) for (let x = 0; x < tira.ancho; x++) {
    const dx = x < 720 ? x : x + 960, dy = y + 60;
    rgba.set(tira.rgba.subarray((y * tira.ancho + x) * 4, (y * tira.ancho + x) * 4 + 4), (dy * ancho + dx) * 4);
  }
  return { ancho, alto, rgba };
}

/**
 * Lo que había, leído a mano de la captura. El tercero («rubio con
 * cicatriz») no lo reconocía ni la cara de la web ni ninguna recortada: es
 * Masha, rehecha en el parche 2.2.16; con la cara del juego de la API sale a
 * 0,974 y el siguiente candidato a 0,71.
 */
const VERDAD = { tuyos: ['Hirara', 'Marcel', 'Masha', 'Belerick', 'Eudora'], suyos: ['Saber', 'Irithel', 'Paquito', 'Aulus', 'Hirara'] };
const caras = carasGuardadas();

function comprobar(leido, donde) {
  for (const lado of ['tuyos', 'suyos']) VERDAD[lado].forEach((v, i) => {
    const r = leido[lado][i];
    if (v === undefined) return;
    eq(r.nombre, v, `${donde}: el baneo ${i + 1} de ${lado} sale ${r.nombre} (${r.candidato} ${r.parecido.toFixed(3)}) y es ${v}`);
  });
}

test('lee los diez baneos de una captura real', () => {
  comprobar(leerBaneos(capturaDeBaneos(), caras), 'captura real');
});

test('lee los picks del enemigo mientras se elige: Clint y Khufra, y nada en los huecos vacíos', () => {
  // La columna derecha de la misma captura (pruebas/fixtures/juego/picks-enemigos.png):
  // el dibujo va AMPLIADO y en ESPEJO; los huecos 3–5 son la silueta roja de «eligiendo».
  const col = leerPng(readFileSync(join(RAIZ, 'pruebas/fixtures/juego/picks-enemigos.png')));
  const { ancho, alto } = REFERENCIA, rgba = new Uint8Array(ancho * alto * 4);
  for (let y = 0; y < col.alto; y++) rgba.set(col.rgba.subarray(y * col.ancho * 4, (y + 1) * col.ancho * 4), ((y + 230) * ancho + 2020) * 4);
  const picks = leerPicksEnemigos({ ancho, alto, rgba }, caras);
  eq(picks.map((p) => p.nombre ?? '?').join(','), 'Clint,Khufra,?,?,?', `los picks enemigos salen ${picks.map((p) => `${p.candidato} ${p.parecido.toFixed(2)}`).join(' | ')}`);
});

test('una pantalla de otra resolución se lee escalando las posiciones', () => {
  // La misma captura a 2/3 (1600×1003): las posiciones medidas a 2400 tienen que seguir valiendo.
  const g = capturaDeBaneos(), f = 2 / 3;
  const ancho = Math.round(g.ancho * f), alto = Math.round(g.alto * f), rgba = new Uint8Array(ancho * alto * 4);
  for (let y = 0; y < alto; y++) for (let x = 0; x < ancho; x++) for (let c = 0; c < 4; c++) {
    const sx = Math.min(g.ancho - 1, Math.floor(x / f)), sy = Math.min(g.alto - 1, Math.floor(y / f));
    const sx2 = Math.min(g.ancho - 1, sx + 1), sy2 = Math.min(g.alto - 1, sy + 1);
    const p = (xx, yy) => g.rgba[(yy * g.ancho + xx) * 4 + c];
    rgba[(y * ancho + x) * 4 + c] = (p(sx, sy) + p(sx2, sy) + p(sx, sy2) + p(sx2, sy2)) / 4;
  }
  comprobar(leerBaneos({ ancho, alto, rgba }, caras), 'a 1600×1003');
});

test('una pantalla sin baneos (un hueco vacío) no saca ningún nombre', () => {
  const { ancho, alto } = REFERENCIA, rgba = new Uint8Array(ancho * alto * 4);
  // El azul oscuro del hueco vacío, con algo de ruido.
  const azar = generador(5);
  for (let i = 0; i < rgba.length; i += 4) { rgba[i] = 20 + azar() * 10; rgba[i + 1] = 40 + azar() * 10; rgba[i + 2] = 80 + azar() * 10; rgba[i + 3] = 255; }
  const leido = leerBaneos({ ancho, alto, rgba }, caras);
  const nombres = [...leido.tuyos, ...leido.suyos].filter((x) => x.nombre).map((x) => x.nombre);
  eq(nombres.length, 0, `saca nombres de huecos vacíos: ${nombres}`);
});

test('la línea de mandatos lee un PNG y devuelve JSON con código 0', () => {
  const tmp = mkdtempSync(join(tmpdir(), 'lector-'));
  const ruta = join(tmp, 'captura.png');
  writeFileSync(ruta, escribirPng(capturaDeBaneos()));
  const r = spawnSync(process.execPath, [join(RAIZ, 'scripts/lector/leer.mjs'), '--archivo', ruta, '--json'], { encoding: 'utf8' });
  eq(r.status, 0, `sale con ${r.status}: ${r.stderr}`);
  const j = JSON.parse(r.stdout);
  eq(j.suyos.join(','), VERDAD.suyos.join(','));
  eq(j.tuyos[0], 'Hirara');
  const sin = spawnSync(process.execPath, [join(RAIZ, 'scripts/lector/leer.mjs')], { encoding: 'utf8' });
  eq(sin.status, 2, 'sin tablet ni archivo no avisa del uso');
});

test('las caras de referencia tienen su tamaño y su fuente, y el lector avisa de las que se quedan atrás', () => {
  // NO se exige que haya cara para todo el catálogo: un héroe nuevo llegaría
  // con los datos del bot y tumbaría el despliegue (la lección de las
  // pruebas que exigen el dato de un día bueno). Para eso está el aviso.
  const { lado, caras: guardadas, fuentes } = leerJson('scripts/lector/caras.json');
  eq(lado, LADO, 'caras.json está hecho con otro tamaño que el del lector');
  for (const [n, b64] of Object.entries(guardadas)) {
    eq(Buffer.from(b64, 'base64').length, LADO * LADO * 3, `la cara de ${n} no tiene ${LADO}×${LADO}×3`);
    ok(fuentes?.[n], `la cara de ${n} no dice de dónde salió`);
  }
  const heroes = [{ name: 'A', cara: 'u1' }, { name: 'B', cara: 'u2' }, { name: 'C', cara: 'u3' }, { name: 'D' }];
  eq(carasDesfasadas({ A: 'u1', B: 'viejo' }, heroes).join(','), 'B,C', 'no avisa de una cara rehecha (B) o de un héroe nuevo (C)');
});

test('SEGURIDAD: el lector solo conecta y hace capturas con adb; nunca toca, instala ni abre una consola en la tablet', () => {
  // Javi: «no quiero perder la cuenta». Tocar la pantalla por adb sería
  // automatizar el juego (bot) y pone la cuenta en riesgo; leer una captura no.
  // Por FORMA, no por texto (3.21.0: la primera versión se saltaba con
  // `import { execFileSync as x }`, con `cp['execFileSync']` o partiendo
  // 'input', 'tap' en dos argumentos): toda la carpeta, subcarpetas incluidas.
  const carpeta = join(RAIZ, 'scripts/lector');
  const ficheros = readdirSync(carpeta, { recursive: true }).map(String).filter((f) => /\.(c|m)?js$/.test(f));
  const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const PERMITIDOS = [/^\['connect', \w+\]$/, /^\['-s', \w+, 'exec-out', 'screencap', '-p'\]$/];
  const PROHIBIDOS = /['"`](input|shell|tap|swipe|keyevent|text|install|uninstall|push|am|pm|monkey|sendevent|root|reboot)['"`]/;
  for (const f of ficheros) {
    const texto = sinComentarios(readFileSync(join(carpeta, f), 'utf8'));
    ok(!PROHIBIDOS.test(texto), `${f} lleva un mandato de adb que actúa sobre la tablet: ${texto.match(PROHIBIDOS)?.[0]}`);
    if (f === 'leer.mjs') continue;
    ok(!/child_process|\bexecFile|\bspawn|\bexecSync|\bprocess\.binding/.test(texto), `${f} puede lanzar programas: solo leer.mjs lo tiene permitido`);
  }
  const leer = sinComentarios(readFileSync(join(carpeta, 'leer.mjs'), 'utf8'));
  // Una sola importación de child_process, sin alias, sin importación dinámica.
  const importes = [...leer.matchAll(/child_process/g)].length;
  eq(importes, 1, 'leer.mjs menciona child_process más de una vez (¿importación dinámica o require?)');
  ok(/^import \{ execFileSync \} from 'node:child_process';$/m.test(leer), 'leer.mjs no importa exactamente { execFileSync } de node:child_process (sin alias)');
  ok(!/\bimport\s*\(|\brequire\s*\(|\bspawn|\bexecSync|\bexec\s*\(|\bfork\s*\(/.test(leer), 'leer.mjs lanza programas por otra vía');
  // Y execFileSync aparece exactamente en el import y en dos llamadas, las permitidas.
  const usos = [...leer.matchAll(/\bexecFileSync\b/g)].length;
  const llamadas = [...leer.matchAll(/execFileSync\(\s*'adb',\s*(\[[^\]]*\])/g)].map((m) => m[1]);
  eq(usos, 3, `execFileSync aparece ${usos} veces en leer.mjs y se esperaban 3 (import, connect, screencap)`);
  eq(llamadas.length, 2, `leer.mjs hace ${llamadas.length} llamadas a adb y se esperaban 2`);
  for (const a of llamadas) ok(PERMITIDOS.some((p) => p.test(a)), `leer.mjs llama a adb con ${a}: solo se permite connect y exec-out screencap -p`);
});

test('la línea de mandatos funciona también por un enlace y desde una carpeta con espacios', () => {
  // Como en Termux con ~/storage/shared: antes no hacía nada y salía con 0.
  const tmp = mkdtempSync(join(tmpdir(), 'lector con espacio '));
  const enlace = join(tmp, 'repo');
  symlinkSync(RAIZ, enlace);
  const r = spawnSync(process.execPath, [join(enlace, 'scripts/lector/leer.mjs')], { encoding: 'utf8' });
  eq(r.status, 2, `por un enlace sale con ${r.status} y sin el mensaje de uso: ${r.stderr}`);
});

await terminar('scripts/lector');
