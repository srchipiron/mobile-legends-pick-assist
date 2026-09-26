/**
 * El lector de la pantalla del draft (scripts/lector): leer los baneos de
 * una captura de la tablet. Con un recorte fijo de una captura real de Javi
 * (pruebas/fixtures/juego/baneos.png: la fila de baneos de su draft del 26
 * de septiembre de 2026, fase de picks) y con la regla de seguridad que
 * pidió él: el lector solo hace capturas, nunca toca la tablet.
 */
import { readFileSync, readdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { test, ok, eq, terminar, RAIZ, leerJson, leerTexto, generador } from '../arnes.mjs';
import { leerPng, escribirPng } from '../../scripts/lector/png.mjs';
import { LADO } from '../../scripts/lector/caras.mjs';
import { leerBaneos, carasGuardadas, REFERENCIA } from '../../scripts/lector/leer.mjs';

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

/** Lo que había (leído a mano de la captura; el tercero no se sabe: rubio con cicatriz, sin cara del juego). */
const VERDAD = { tuyos: ['Hirara', 'Marcel', undefined, 'Belerick', 'Eudora'], suyos: ['Saber', 'Irithel', 'Paquito', 'Aulus', 'Hirara'] };
const caras = carasGuardadas();

function comprobar(leido, donde) {
  for (const lado of ['tuyos', 'suyos']) VERDAD[lado].forEach((v, i) => {
    const r = leido[lado][i];
    if (v === undefined) return;
    eq(r.nombre, v, `${donde}: el baneo ${i + 1} de ${lado} sale ${r.nombre} (${r.candidato} ${r.parecido.toFixed(3)}) y es ${v}`);
  });
}

test('lee los nueve baneos conocidos de una captura real y no se inventa el décimo', () => {
  const leido = leerBaneos(capturaDeBaneos(), caras);
  comprobar(leido, 'captura real');
  // El que no tiene cara del juego: mejor «no sé» que un nombre, salvo que diga uno con seguridad de verdad.
  const duda = leido.tuyos[2];
  ok(duda.nombre === null || duda.parecido >= 0.95, `al baneo sin cara le pone nombre con poca seguridad: ${duda.nombre} ${duda.parecido}`);
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

test('las caras de referencia son una por héroe del catálogo, con su tamaño, y las de la API están marcadas', () => {
  const { lado, caras: guardadas, deLaApi } = leerJson('scripts/lector/caras.json');
  eq(lado, LADO, 'caras.json está hecho con otro tamaño que el del lector');
  const catalogo = leerJson('public/data/roam-meta.json').heroes.map((h) => h.name);
  const nombres = Object.keys(guardadas);
  const fuera = nombres.filter((n) => !catalogo.includes(n));
  eq(fuera.length, 0, `caras con nombres que no son del catálogo: ${fuera}`);
  const faltan = catalogo.filter((n) => !nombres.includes(n));
  eq(faltan.length, 0, `héroes sin cara de referencia: ${faltan}`);
  for (const [n, b64] of Object.entries(guardadas)) eq(Buffer.from(b64, 'base64').length, LADO * LADO * 3, `la cara de ${n} no tiene ${LADO}×${LADO}×3`);
  ok(deLaApi.every((n) => guardadas[n]), 'deLaApi nombra a alguien sin cara');
});

test('SEGURIDAD: el lector solo conecta y hace capturas con adb; nunca toca, instala ni abre una consola en la tablet', () => {
  // Javi: «no quiero perder la cuenta». Tocar la pantalla por adb sería
  // automatizar el juego (bot) y pone la cuenta en riesgo; leer una captura no.
  const carpeta = join(RAIZ, 'scripts/lector');
  const PERMITIDOS = [/^\['connect', \w+\]$/, /^\['-s', \w+, 'exec-out', 'screencap', '-p'\]$/];
  let llamadas = 0;
  for (const f of readdirSync(carpeta).filter((x) => /\.m?js$/.test(x))) {
    const texto = leerTexto(`scripts/lector/${f}`);
    for (const m of texto.matchAll(/(?:execFileSync|execFile|spawnSync|spawn|execSync|exec)\s*\(\s*([^,)]+)(?:,\s*(\[[^\]]*\]))?/g)) {
      const programa = m[1].trim();
      ok(programa === "'adb'", `${f} lanza otro programa (${programa}): el lector solo puede hablar con adb`);
      ok(PERMITIDOS.some((p) => p.test((m[2] ?? '').trim())), `${f} llama a adb con ${m[2]}: solo se permite connect y exec-out screencap -p`);
      llamadas++;
    }
    ok(!/\binput\s+(tap|swipe|text|keyevent)|\b(install|uninstall|am start|monkey)\b/.test(texto.replace(/^\s*(\*|\/\/).*$/gm, '')), `${f} menciona un mandato que actúa sobre la tablet`);
  }
  eq(llamadas, 2, `el lector hace ${llamadas} llamadas a programas y se esperaban 2 (connect y screencap)`);
});

await terminar('scripts/lector');
