/**
 * El lector de la pantalla del draft (scripts/lector): leer los baneos de
 * una captura de la tablet. Con un recorte fijo de una captura real de Javi
 * (pruebas/fixtures/juego/baneos.png: la fila de baneos de su draft del 26
 * de septiembre de 2026, fase de picks) y con la regla de seguridad que
 * pidió él: el lector solo hace capturas, nunca toca la tablet.
 */
import { readFileSync, readdirSync, mkdtempSync, mkdirSync, writeFileSync, symlinkSync, existsSync, chmodSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer } from 'node:net';
import { spawnSync } from 'node:child_process';
import { test, ok, eq, terminar, RAIZ, leerJson, generador } from '../arnes.mjs';
import { leerPng, escribirPng } from '../../scripts/lector/png.mjs';
import { LADO, muestra, normalizar, reconocer } from '../../scripts/lector/caras.mjs';
import { leerBaneos, leerPicksEnemigos, leerAliados, filaPropia, carasGuardadas, carasDesfasadas, encontrarTablet, sinRepetidos, REFERENCIA, PICKS_ENEMIGOS, ALIADOS, BANEOS, ambasOrientaciones } from '../../scripts/lector/leer.mjs';
import { preguntaMdns, tabletsDeRespuesta, buscarPorMdns, escanearPuertos, SERVICIO } from '../../scripts/lector/tablet.mjs';
import { capturaCompleta, VERDAD as VERDAD_JUEGO } from '../fixtures/juego/captura.mjs';

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

test('la búsqueda en dos pasadas (reducida y luego entera) decide igual que comparar con todas las caras (3.39.0)', () => {
  // La de hasta 3.38.0, tal cual: cada posición contra todas las caras a 24×24.
  const exhaustiva = (img, [cx, cy, r], refs, { pasos = 3, escalas = [0.94, 1.06], finura = 16 } = {}) => {
    const paso = Math.max(1, Math.round(r / finura)), mejor = new Map();
    let donde = [0, 0], tope = -Infinity;
    const probar = (dx, dy, esc) => {
      const v = normalizar(muestra(img, cx + dx * paso, cy + dy * paso, r * esc));
      for (const c of refs) { let k = 0; for (let i = 0; i < v.length; i++) k += v[i] * c.v[i]; if (!(mejor.get(c.nombre) >= k)) mejor.set(c.nombre, k); if (k > tope) { tope = k; donde = [dx, dy]; } }
    };
    for (let dx = -pasos; dx <= pasos; dx++) for (let dy = -pasos; dy <= pasos; dy++) probar(dx, dy, 1);
    const [bx, by] = donde;
    for (const esc of escalas) for (let dx = bx - 1; dx <= bx + 1; dx++) for (let dy = by - 1; dy <= by + 1; dy++) probar(dx, dy, esc);
    const [a, b] = [...mejor].sort((x, y) => y[1] - x[1]);
    return { candidato: a[0], parecido: a[1], segundo: b[0], parecidoSegundo: b[1] };
  };
  const img = capturaCompleta({ columna: 2 }), ambas = ambasOrientaciones(caras);
  const opPicks = { pasos: 5, escalas: [0.88, 0.94, 1.06, 1.12] };
  const casos = [
    ...PICKS_ENEMIGOS.map((p) => [p, ambas, opPicks]),
    ...ALIADOS.slice(0, 2).map((p) => [p, ambas, { pasos: 5, escalas: [0.88, 0.94, 1.06, 1.12, 1.25], finura: 8 }]),
    ...BANEOS.tuyos.slice(0, 2).map((p) => [p, caras, {}]),
    // Sin el héroe que está: lo que queda son caras parecidas entre sí, que es donde una criba gruesa se equivocaría.
    [PICKS_ENEMIGOS[1], ambas.filter((c) => c.nombre !== 'Eudora'), opPicks],
    [ALIADOS[4], ambas.filter((c) => c.nombre !== 'Estes'), { pasos: 5, escalas: [0.88, 0.94, 1.06, 1.12, 1.25], finura: 8 }],
  ];
  for (const [pos, refs, op] of casos) {
    // Sin afinar (eso busca MÁS que la de antes, a propósito: va en la prueba siguiente).
    const e = exhaustiva(img, pos, refs, op), r = reconocer(img, pos, refs, { ...op, afinar: 0 });
    ok(r.candidato === e.candidato && r.segundo?.nombre === e.segundo, `en ${pos.map(Math.round)} la búsqueda en dos pasadas da ${r.candidato}/${r.segundo?.nombre} y la exhaustiva ${e.candidato}/${e.segundo}`);
    ok(Math.abs(r.parecido - e.parecido) < 1e-9 && Math.abs(r.segundo.parecido - e.parecidoSegundo) < 1e-9, `en ${pos.map(Math.round)} el parecido cambia: ${r.parecido} / ${e.parecido}`);
  }
});

test('la muestra de una cara da los mismos números que la de hasta 3.38.0, también pegada al borde de la imagen', () => {
  // La de antes: un píxel acotado por llamada, canal a canal. Con ella se hicieron las caras guardadas.
  const pixel = (img, x, y, c) => img.rgba[(Math.max(0, Math.min(img.alto - 1, y)) * img.ancho + Math.max(0, Math.min(img.ancho - 1, x))) * 4 + c];
  const caja = (img, x0, y0, x1, y1, c) => {
    let s = 0;
    for (let j = 0; j < 2; j++) for (let i = 0; i < 2; i++) {
      const x = x0 + ((i + 0.5) / 2) * (x1 - x0) - 0.5, y = y0 + ((j + 0.5) / 2) * (y1 - y0) - 0.5, xf = Math.floor(x), yf = Math.floor(y), fx = x - xf, fy = y - yf;
      s += (pixel(img, xf, yf, c) * (1 - fx) + pixel(img, xf + 1, yf, c) * fx) * (1 - fy) + (pixel(img, xf, yf + 1, c) * (1 - fx) + pixel(img, xf + 1, yf + 1, c) * fx) * fy;
    }
    return s / 4;
  };
  const antes = (img, cx, cy, r) => {
    const sx = cx - 0.6 * r, sy = cy - 0.7 * r, sw = 1.2 * r, sh = 0.9 * r, v = new Float32Array(LADO * LADO * 3);
    for (let j = 0, k = 0; j < LADO; j++) for (let i = 0; i < LADO; i++) for (let c = 0; c < 3; c++) v[k++] = caja(img, sx + (i * sw) / LADO, sy + (j * sh) / LADO, sx + ((i + 1) * sw) / LADO, sy + ((j + 1) * sh) / LADO, c);
    return v;
  };
  const img = capturaCompleta({ columna: 2 });
  for (const [cx, cy, r] of [[2228, 335, 74], [165, 537, 72], [85, 138, 47], [3, 5, 60], [2398, 1500, 90], [1200.3, 700.7, 33.3]]) {
    const a = antes(img, cx, cy, r), b = muestra(img, cx, cy, r);
    ok(a.every((x, i) => x === b[i]), `la muestra en (${cx}, ${cy}, ${r}) no es la de antes`);
  }
});

test('los picks enemigos se leen tal cual y en espejo: en la captura del 1 de octubre tres de cinco no van reflejados (3.31.0)', () => {
  const img = capturaCompleta({ columna: 2 });
  const l = leerPicksEnemigos(img, caras);
  // Gloo (sin espejo) se quedaba en 0,65 y salía «?»: su dibujo pide otro tamaño en otro sitio, y hasta 3.38.0 el tamaño solo se buscaba alrededor del mejor sitio de TODOS.
  eq(l.map((x) => x.nombre ?? '?').join(), 'Rafaela,Eudora,Gloo,Lesley,Aamon', `lee ${l.map((x) => `${x.nombre ?? '?'}(${x.parecido.toFixed(2)})`).join(' ')}`);
});

test('afinar posición y tamaño encuentra al que está y no pone nombre al que no está (3.39.0)', () => {
  const img = capturaCompleta({ columna: 2 }), ambas = ambasOrientaciones(caras);
  const opPicks = { pasos: 5, escalas: [0.88, 0.94, 1.06, 1.12] }, opAliados = { pasos: 5, escalas: [0.88, 0.94, 1.06, 1.12, 1.25], finura: 8 };
  const casos = [
    ...BANEOS.tuyos.map((p, i) => [p, VERDAD_JUEGO.tuyos[i], caras, {}]),
    ...BANEOS.suyos.map((p, i) => [p, VERDAD_JUEGO.suyos[i], caras, {}]),
    ...PICKS_ENEMIGOS.map((p, i) => [p, VERDAD_JUEGO.enemigos2[i], ambas, opPicks]),
    ...ALIADOS.map((p, i) => [p, VERDAD_JUEGO.aliados[i], ambas, opAliados]),
  ];
  for (const [pos, verdad, refs, op] of casos) {
    const con = reconocer(img, pos, refs, op), sinAfinar = reconocer(img, pos, refs, { ...op, afinar: 0 });
    eq(con.nombre, verdad, `en ${pos.map(Math.round)} lee ${con.candidato} (${con.parecido.toFixed(3)}) y es ${verdad}`);
    ok(con.parecido >= sinAfinar.parecido - 1e-12, `afinar baja el parecido de ${verdad}`);
    // El mismo hueco sin su héroe entre las caras (un héroe nuevo o rehecho): afinar sube al que más se le parece, pero no hasta ponerle nombre.
    const sin = reconocer(img, pos, refs.filter((c) => c.nombre !== verdad), op);
    eq(sin.nombre, null, `sin ${verdad} entre las caras, afinar lee ${sin.candidato} (${sin.parecido.toFixed(3)})`);
  }
});

test('TU equipo se lee con sus skins y la fila con el nombre en amarillo es la tuya (3.31.0)', () => {
  const img = capturaCompleta();
  const a = leerAliados(img, caras);
  eq(a.map((x) => x.nombre ?? '?').join(), VERDAD_JUEGO.aliados.join(), `lee ${a.map((x) => `${x.nombre ?? '?'}(${x.parecido.toFixed(2)})`).join(' ')}`);
  ok(a.every((x) => x.parecido >= 0.85), `algún aliado por debajo de 0,85: ${a.map((x) => x.parecido.toFixed(2))}`);
  eq(filaPropia(img), VERDAD_JUEGO.tuyoFila, 'no reconoce la fila con el nombre en amarillo');
  eq(filaPropia(capturaCompleta({ filaAmarilla: 1 })), 1, 'la fila amarilla no se reconoce en otra posición');
  eq(filaPropia(capturaCompleta({ filaAmarilla: -1 })), -1, 'sin nombre en amarillo dice que una fila es la tuya');
  eq(filaPropia(capturaCompleta({ filasAmarillas: [1, 4] })), -1, 'con dos filas en amarillo (no se distingue) elige una');
  // Sin el panel de tu equipo (otra pantalla) no lee a nadie ni inventa tu fila.
  const sinEquipo = capturaCompleta({ conAliados: false });
  ok(leerAliados(sinEquipo, caras).every((x) => !x.nombre), 'con el panel vacío inventa compañeros');
  eq(filaPropia(sinEquipo), -1, 'con el panel vacío inventa tu fila');
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
  const todos = readdirSync(carpeta, { recursive: true }).map(String);
  const ficheros = todos.filter((f) => /\.(c|m)?js$/.test(f));
  const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const PERMITIDOS = [/^\['connect', \w+\]$/, /^\['-s', \w+, 'exec-out', 'screencap', '-p'\]$/];
  const PROHIBIDOS = /['"`](input|shell|tap|swipe|keyevent|text|install|uninstall|push|am|pm|monkey|sendevent|root|reboot)['"`]/;
  for (const f of ficheros) {
    const texto = sinComentarios(readFileSync(join(carpeta, f), 'utf8'));
    ok(!PROHIBIDOS.test(texto), `${f} lleva un mandato de adb que actúa sobre la tablet: ${texto.match(PROHIBIDOS)?.[0]}`);
    if (f === 'leer.mjs') continue;
    ok(!/child_process|\bexecFile|\bspawn|\bexecSync|\bprocess\.binding/.test(texto), `${f} puede lanzar programas: solo leer.mjs lo tiene permitido`);
  }
  // Los guiones de shell (lector.sh, 3.26.0) no llaman a adb: ni una vez.
  for (const f of todos.filter((g) => /\.sh$/.test(g))) {
    const texto = readFileSync(join(carpeta, f), 'utf8').replace(/^\s*#.*$/gm, '');
    ok(!/\badb\b/.test(texto), `${f} llama a adb: la captura solo la hace leer.mjs`);
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

/** Una respuesta mDNS como la de Android: PTR, y en los adicionales el SRV (con el nombre comprimido) y el A. */
function respuestaMdns({ instancia = 'adb-PDNP06J000015130-eiqLkn', ip = '192.168.5.161', puerto = 45199, conA = true } = {}) {
  const nombre = (n) => Buffer.concat([...n.split('.').map((p) => Buffer.concat([Buffer.from([p.length]), Buffer.from(p)])), Buffer.from([0])]);
  const u16 = (v) => Buffer.from([v >> 8, v & 255]);
  const registro = (n, tipo, rdata) => Buffer.concat([n, u16(tipo), u16(1), Buffer.from([0, 0, 0, 120]), u16(rdata.length), rdata]);
  const cabecera = Buffer.concat([u16(0), u16(0x8400), u16(0), u16(1), u16(0), u16(conA ? 2 : 1)]);
  const servicio = nombre(SERVICIO);
  const ptr = registro(servicio, 12, nombre(`${instancia}.${SERVICIO}`));
  const dondeInstancia = cabecera.length + servicio.length + 10; // el rdata del PTR
  const puntero = Buffer.from([0xc0 | (dondeInstancia >> 8), dondeInstancia & 255]);
  const srv = registro(puntero, 33, Buffer.concat([u16(0), u16(0), u16(puerto), nombre('Tablet-de-Javi.local')]));
  const a = registro(nombre('Tablet-de-Javi.local'), 1, Buffer.from(ip.split('.').map(Number)));
  return Buffer.concat([cabecera, ptr, srv, ...(conA ? [a] : [])]);
}

test('la tablet se encuentra sola: la pregunta mDNS pide respuesta unicast y la respuesta de Android se lee entera', async () => {
  const pregunta = preguntaMdns();
  eq(pregunta.readUInt16BE(4), 1, 'la pregunta no lleva una pregunta');
  eq(pregunta.readUInt16BE(pregunta.length - 2), 0x8001, 'la pregunta no pide respuesta unicast (bit QU): con el multicast filtrado no llegaría nada');
  eq(pregunta.readUInt16BE(pregunta.length - 4), 12, 'la pregunta no es por un PTR');
  const [t] = tabletsDeRespuesta(respuestaMdns());
  eq(`${t?.ip}:${t?.puerto} ${t?.nombre}`, '192.168.5.161:45199 adb-PDNP06J000015130-eiqLkn', `la respuesta no se lee: ${JSON.stringify(t)}`);
  // Sin el registro A, vale la IP de quien contesta.
  eq(tabletsDeRespuesta(respuestaMdns({ conA: false }), '192.168.5.7')[0]?.ip, '192.168.5.7', 'sin registro A no usa la IP de quien contesta');
  eq(tabletsDeRespuesta(Buffer.from([1, 2, 3])).length, 0, 'una respuesta rota da tablets');
  eq(tabletsDeRespuesta(respuestaMdns(), null, '_otro._tcp.local').length, 0, 'un servicio que no es adb cuenta como tablet');
  // Sin nadie que conteste, vuelve vacío pasado el plazo, sin lanzar.
  const t0 = Date.now();
  eq((await buscarPorMdns({ ms: 150 })).length, 0, 'sin tablet en la red encuentra algo');
  // Las pruebas corren a la vez y las de lector.sh bloquean el bucle con spawnSync: el margen es ancho a propósito.
  ok(Date.now() - t0 < 10000, 'la búsqueda sin respuesta no acaba al plazo');
  // El escaneo de puertos encuentra uno abierto en el rango.
  const servidor = createServer();
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const abierto = servidor.address().port;
  try {
    const puertos = await escanearPuertos('127.0.0.1', { desde: abierto - 200, hasta: abierto + 200, ms: 500 });
    // En la máquina puede haber otros puertos abiertos en ese rango: el nuestro tiene que estar, y uno cerrado no.
    ok(puertos.includes(abierto), `el escaneo da ${puertos} y el puerto abierto es ${abierto}`);
    ok(puertos.length <= 5, `el escaneo da abiertos de más: ${puertos}`);
  } finally { servidor.close(); }
});

test('encontrarTablet prueba por orden: la última que funcionó, la anunciada en la wifi, los puertos abiertos; y distingue «falta emparejar»', async () => {
  const dicho = [];
  const probar = (respuestas) => (d) => { dicho.push(d); return respuestas[d] ?? `failed to connect to '${d}'`; };
  // 1) La de la última vez sigue valiendo: no se pregunta a la wifi.
  let preguntas = 0;
  let t = await encontrarTablet({ memoria: { ip: '10.0.0.5', puerto: 40000 }, probar: probar({ '10.0.0.5:40000': 'already connected to 10.0.0.5:40000' }), buscar: async () => { preguntas += 1; return []; }, escanear: async () => [] });
  eq(`${t.ip}:${t.puerto} ${t.via}`, '10.0.0.5:40000 memoria');
  eq(preguntas, 0, 'con la última tablet válida pregunta a la wifi igualmente');
  // 2) La de la última vez ya no vale (puerto cambiado): la anunciada por mDNS.
  t = await encontrarTablet({ memoria: { ip: '10.0.0.5', puerto: 40000 }, probar: probar({ '10.0.0.5:41111': 'connected to 10.0.0.5:41111' }), buscar: async () => [{ ip: '10.0.0.5', puerto: 41111, nombre: 'adb-x' }], escanear: async () => [] });
  eq(`${t.puerto} ${t.via}`, '41111 wifi', 'no coge la anunciada en la wifi');
  // 3) Nadie contesta por mDNS: los puertos abiertos de la IP conocida, por orden, saltando los que no son adb.
  let escaneada = null;
  t = await encontrarTablet({ memoria: { ip: '10.0.0.5', puerto: 40000 }, probar: probar({ '10.0.0.5:42222': 'connected to 10.0.0.5:42222' }), buscar: async () => [], escanear: async (ip) => { escaneada = ip; return [33333, 42222, 50000]; } });
  eq(`${escaneada} ${t.puerto} ${t.via}`, '10.0.0.5 42222 puertos', 'no encuentra el puerto escaneando');
  ok(!dicho.includes('10.0.0.5:50000'), 'sigue probando puertos después de encontrarla');
  // 4) Sin IP conocida y sin anuncio no escanea nada y lo dice.
  escaneada = null;
  let e = await encontrarTablet({ memoria: {}, probar: probar({}), buscar: async () => [], escanear: async (ip) => { escaneada = ip; return []; } }).catch((x) => x);
  eq(`${e.tipo} ${escaneada}`, 'tablet null', `sin saber la IP ${e.tipo}, escanea ${escaneada}`);
  // 5) «failed to authenticate» es que falta emparejar, no que no esté.
  e = await encontrarTablet({ memoria: { ip: '10.0.0.5', puerto: 40000 }, probar: probar({ '10.0.0.5:40000': "failed to authenticate to 10.0.0.5:40000" }), buscar: async () => [], escanear: async () => [] }).catch((x) => x);
  eq(e.tipo, 'emparejar', `falta emparejar y dice ${e.tipo}`);
});

test('«lector» (lector.sh) se instala solo, cierra el lector anterior, trae lo último y arranca el servidor guardando capturas', () => {
  // Con node, git y pkill de pega: la prueba no toca la red ni mata nada.
  const tmp = mkdtempSync(join(tmpdir(), 'lector-sh-'));
  const bin = join(tmp, 'bin'), home = join(tmp, 'home'), prefix = join(tmp, 'prefix');
  mkdirSync(bin); mkdirSync(join(home, '.termux'), { recursive: true }); mkdirSync(join(prefix, 'bin'), { recursive: true });
  for (const c of ['node', 'git', 'pkill']) { writeFileSync(join(bin, c), `#!/bin/sh\necho "${c} $*"\n`); chmodSync(join(bin, c), 0o755); }
  const env = { ...process.env, HOME: home, PREFIX: prefix, PATH: `${bin}:${process.env.PATH}` };
  const r = spawnSync('bash', [join(RAIZ, 'scripts/lector/lector.sh'), '--puerto', '1'], { encoding: 'utf8', env });
  eq(r.status, 0, `lector.sh sale con ${r.status}: ${r.stderr}`);
  ok(/git pull --ff-only/.test(r.stdout), 'no trae lo último del repositorio');
  ok(/pkill -f scripts\/lector\/servir\.mjs/.test(r.stdout), 'no cierra un lector anterior (contestaría a la app con el puerto viejo)');
  ok(new RegExp(`node .*scripts/lector/servir\\.mjs --guardar-capturas ${home}/capturas --puerto 1`).test(r.stdout), `no arranca el servidor como toca: ${r.stdout}`);
  ok(!/--tablet/.test(r.stdout), 'pasa un --tablet: la gracia es que la busque sola');
  ok(existsSync(join(prefix, 'bin', 'lector')) && existsSync(join(home, '.shortcuts', 'Lector')), 'no se instala como mandato «lector» y acceso directo del widget');
  ok(/^#!/.test(readFileSync(join(prefix, 'bin', 'lector'), 'utf8')), 'el mandato instalado no es un guion');
  // Los envoltorios llevan el bash de Termux con su ruta entera (3.32.1): el widget y Termux:Boot los lanzan sin el entorno de Termux y ahí /usr/bin/env no existe.
  symlinkSync('/bin/bash', join(prefix, 'bin', 'bash'));
  writeFileSync(join(home, '.shortcuts', 'Lector'), '#!/usr/bin/env bash\nexec "/viejo/lector.sh" "$@"\n');
  const r3 = spawnSync('bash', [join(RAIZ, 'scripts/lector/lector.sh')], { encoding: 'utf8', env });
  const atajo = readFileSync(join(home, '.shortcuts', 'Lector'), 'utf8');
  ok(atajo.startsWith(`#!${prefix}/bin/bash\n`) && atajo.includes(`exec "${prefix}/bin/bash" "`), `el acceso directo no usa el bash de Termux con su ruta entera: ${atajo}`);
  ok(!/\/viejo\//.test(atajo) && /Acceso directo «Lector»/.test(r3.stdout), 'un acceso directo viejo no se reescribe');
  ok(readFileSync(join(prefix, 'bin', 'lector'), 'utf8').startsWith(`#!${prefix}/bin/bash\n`), 'el mandato «lector» no usa el bash de Termux');
  // Un argumento «--actualizado» (el relanzamiento tras git pull) no llega al servidor.
  const r4 = spawnSync('bash', [join(RAIZ, 'scripts/lector/lector.sh'), '--actualizado', '--puerto', '2'], { encoding: 'utf8', env });
  ok(/servir\.mjs --guardar-capturas .* --puerto 2$/m.test(r4.stdout) && !/--actualizado/.test(r4.stdout) && !/git pull/.test(r4.stdout), `tras relanzarse vuelve a hacer pull o pasa --actualizado al servidor: ${r4.stdout}`);
  // Con acceso al almacenamiento las capturas NO van a Descargas (3.34.0: llenaban la galería), y las que había allí se quitan.
  mkdirSync(join(home, 'storage', 'downloads', 'capturas'), { recursive: true });
  writeFileSync(join(home, 'storage', 'downloads', 'capturas', 'lectura-vieja.png'), 'x');
  writeFileSync(join(home, 'storage', 'downloads', 'capturas', 'lectura-vieja.verdad.json'), '{}');
  // Lo que no es del lector se queda (3.37.0: antes era un `rm -rf` de la carpeta).
  writeFileSync(join(home, 'storage', 'downloads', 'capturas', 'mi-foto.jpg'), 'x');
  const r2 = spawnSync('bash', [join(RAIZ, 'scripts/lector/lector.sh')], { encoding: 'utf8', env });
  ok(new RegExp(`--guardar-capturas ${home}/capturas`).test(r2.stdout), `con ~/storage guarda en Descargas: ${r2.stdout}`);
  ok(!existsSync(join(home, 'storage', 'downloads', 'capturas', 'lectura-vieja.png')) && !existsSync(join(home, 'storage', 'downloads', 'capturas', 'lectura-vieja.verdad.json')) && /Quitadas 2 capturas de Descargas/.test(r2.stdout), `no quita las capturas antiguas de Descargas: ${r2.stdout}`);
  ok(existsSync(join(home, 'storage', 'downloads', 'capturas', 'mi-foto.jpg')), 'borra de Descargas un fichero que no es del lector');
  // Y con la carpeta ya vacía, se quita la carpeta.
  rmSync(join(home, 'storage', 'downloads', 'capturas', 'mi-foto.jpg'));
  writeFileSync(join(home, 'storage', 'downloads', 'capturas', 'fotograma-1.png'), 'x');
  spawnSync('bash', [join(RAIZ, 'scripts/lector/lector.sh')], { encoding: 'utf8', env });
  ok(!existsSync(join(home, 'storage', 'downloads', 'capturas')), 'la carpeta vacía de Descargas no se quita');
});

test('el mismo héroe leído en dos huecos de una fila: se queda el que más se parece, el otro pasa a «?»', () => {
  // Dentro de los cinco de un equipo dos iguales no pueden ser (entre equipos sí: Hirara en la captura real).
  const l = sinRepetidos([
    { nombre: 'Belerick', candidato: 'Belerick', parecido: 0.91 }, { nombre: 'Eudora', candidato: 'Eudora', parecido: 0.95 },
    { nombre: 'Belerick', candidato: 'Belerick', parecido: 0.84 }, { nombre: null, candidato: 'Saber', parecido: 0.6 },
  ]);
  eq(l.map((x) => x.nombre ?? '?').join(), 'Belerick,Eudora,?,?', `no quita el repetido que menos se parece: ${l.map((x) => x.nombre)}`);
  eq(`${l[2].candidato} ${l[2].repetido}`, 'Belerick true', 'el hueco quitado no conserva su candidato ni dice que era un repetido');
  eq(sinRepetidos([{ nombre: 'A', parecido: 0.9 }, { nombre: 'B', parecido: 0.9 }]).filter((x) => x.nombre).length, 2, 'quita huecos distintos');
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
