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
import { transformSync } from 'esbuild';
import { test, ok, eq, terminar, RAIZ, leerJson, generador } from '../arnes.mjs';
import { leerPng, escribirPng } from '../../scripts/lector/png.mjs';
import { LADO, muestra, normalizar, reconocer, CRIBA_PICKS, PARECIDO_MINIMO } from '../../scripts/lector/caras.mjs';
import { leerBaneos, leerPicksEnemigos, leerAliados, filaPropia, carasGuardadas, carasDesfasadas, sinRepetidos, REFERENCIA, PICKS_ENEMIGOS, ALIADOS, BANEOS, ambasOrientaciones, aceptarCercanos, CERCA_ENEMIGO, MARGEN_CERCA_ENEMIGO, carasDelPanel } from '../../scripts/lector/leer.mjs';
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
  const exhaustiva = (img, [cx, cy, r], refs, { pasos = 3, escalas = [0.94, 1.06], finura = 16, criba = [], saltoCriba = 1 } = {}) => {
    const paso = Math.max(1, Math.round(r / finura)), mejor = new Map();
    let donde = [0, 0], tope = -Infinity;
    const probar = (dx, dy, esc) => {
      const v = normalizar(muestra(img, cx + dx * paso, cy + dy * paso, r * esc));
      for (const c of refs) { let k = 0; for (let i = 0; i < v.length; i++) k += v[i] * c.v[i]; if (!(mejor.get(c.nombre) >= k)) mejor.set(c.nombre, k); if (k > tope) { tope = k; donde = [dx, dy]; } }
    };
    for (const ec of [1, ...criba]) for (let dx = -pasos; dx <= pasos; dx += ec === 1 ? 1 : saltoCriba) for (let dy = -pasos; dy <= pasos; dy += ec === 1 ? 1 : saltoCriba) probar(dx, dy, ec);
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
    // Con la criba a dos tamaños de 3.55.0, las opciones de verdad de leerPicksEnemigos y leerAliados.
    ...PICKS_ENEMIGOS.slice(0, 3).map((p) => [p, ambas, { ...opPicks, criba: CRIBA_PICKS, saltoCriba: 2 }]),
    ...ALIADOS.slice(3).map((p) => [p, ambas, { pasos: 5, escalas: [0.88, 0.94, 1.06, 1.12, 1.25], finura: 8, criba: CRIBA_PICKS }]),
    [PICKS_ENEMIGOS[1], ambas.filter((c) => c.nombre !== 'Eudora'), { ...opPicks, criba: CRIBA_PICKS, saltoCriba: 2 }],
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
  eq(sin.status, 2, 'sin archivo no avisa del uso');
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
  // Otra compilación del juego cambia la carpeta y no la imagen (11 de noviembre de 2026): eso no es una cara nueva.
  const cdn = (carpeta, f) => `https://akmweb.youngjoygame.com/web/svnres/img/test/homepage_2_2_16_${carpeta}_1/100_${f}.png`;
  const tras = [{ name: 'Miya', cara: cdn(1235, 'aaa') }, { name: 'Popol and Kupa', cara: cdn(1235, 'nuevo') }];
  eq(carasDesfasadas({ Miya: cdn(1232, 'aaa'), 'Popol and Kupa': cdn(1232, 'viejo') }, tras).join(','), 'Popol and Kupa', 'confunde otra carpeta con otra cara');
});

test('SEGURIDAD: todo lo que el lector ejecuta (su carpeta y lo que importa de fuera) solo importa lo permitido y no puede cargar código por otra vía (3.40.0)', () => {
  // La prueba de abajo mira PALABRAS; la revisión de seguridad de 3.40.0 la
  // esquivó con `await import('node:child' + '_process')` y partiendo
  // 'sh'+'ell', y metiéndolo en src/motor/nombres.js, que el lector importa
  // desde fuera de su carpeta. Aquí se recorre el grafo de importaciones
  // entero y se mira la FORMA: qué módulos de Node importa cada fichero y que
  // no haya otra manera de cargar código.
  const leerFichero = (f) => readFileSync(f, 'utf8');
  // Sin comentarios con un ANALIZADOR (esbuild, el de Vite), no con una
  // expresión: `const u = 'a//'; return import(…)` escondía el import detrás
  // de un «//» dentro de una cadena (lo cazó la revisión por mutación).
  const sinComentarios = (t) => transformSync(t, { loader: 'js', format: 'esm' }).code;
  const carpeta = join(RAIZ, 'scripts/lector');
  const cola = readdirSync(carpeta, { recursive: true }).map(String).filter((f) => /\.(c|m)?js$/.test(f)).map((f) => join(carpeta, f));
  const vistos = new Map();
  while (cola.length) {
    const f = cola.pop();
    if (vistos.has(f)) continue;
    const texto = sinComentarios(leerFichero(f));
    vistos.set(f, texto);
    for (const m of texto.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)) {
      const dep = m[1] ?? m[2];
      if (dep.startsWith('.')) cola.push(join(f, '..', dep));
    }
  }
  const relativo = (f) => f.slice(RAIZ.length + 1);
  ok([...vistos.keys()].some((f) => /src\/motor\/nombres\.js$/.test(f)), 'el recorrido no llega a lo que el lector importa de fuera de su carpeta');
  // Los módulos de Node que puede importar cada fichero (lo de hoy): ninguno lanza programas (3.97.0).
  const DE_NODE = {
    'scripts/lector/leer.mjs': ['node:fs', 'node:path', 'node:url'],
    // node:crypto: comparar el código de vinculación en tiempo constante (3.61.0).
    'scripts/lector/servir.mjs': ['node:http', 'node:fs', 'node:os', 'node:path', 'node:url', 'node:worker_threads', 'node:crypto'],
    // El lector dentro de la tablet (3.61.0): ni lanza programas ni abre conexiones propias (la captura, por fetch a 127.0.0.1).
    // node:url (3.66.0): encontrar los datos que trae la APK junto a sus scripts.
    // node:crypto (3.74.1): la clave al azar del lector para sus partes (Node 18 no trae crypto global).
    'scripts/lector/en-tablet.mjs': ['node:fs', 'node:path', 'node:url', 'node:crypto'],
    // node:fs (3.66.0): leer solo.json, la línea que eligió la APK para el modo «Sin móvil».
    'scripts/lector/solo.mjs': ['node:fs'],
    'scripts/lector/png.mjs': ['node:zlib'],
    'scripts/lector/sacar-caras.mjs': ['node:fs', 'node:path'],
    'scripts/lector/lectura-tarea.mjs': ['node:worker_threads'],
    'scripts/lector/aprender-tarea.mjs': ['node:worker_threads', 'node:fs'],
    'scripts/lector/recortes-tarea.mjs': ['node:worker_threads', 'node:fs'],
    'scripts/lector/partida.mjs': ['node:fs'],
    // El arranque vigilado de la APK (3.72.3): escribir fallo-nodo.txt en la casa de la app.
    'scripts/lector/arranque-apk.mjs': ['node:fs', 'node:path'],
  };
  // La ÚNICA carga dinámica permitida (3.72.3): el arranque de la APK carga el
  // lector DESPUÉS de poner los vigilantes de errores, con este literal exacto
  // y una sola vez. Cualquier otro import() sigue prohibido.
  const CARGA_PERMITIDA = { 'scripts/lector/arranque-apk.mjs': 'import("./en-tablet.mjs")' }; // como lo deja esbuild al quitar los comentarios
  for (const [f, texto] of vistos) {
    const r = relativo(f);
    const deps = [...texto.matchAll(/(?:^|\n)\s*(?:import|export)\b[^'"`;]*?\bfrom\s*['"]([^'"]+)['"]|(?:^|\n)\s*import\s*['"]([^'"]+)['"]/g)].map((m) => m[1] ?? m[2]).filter((d) => !d.startsWith('.'));
    for (const d of deps) ok((DE_NODE[r] ?? []).includes(d), `${r} importa ${d}, que no tiene permitido`);
    // Ninguna otra forma de cargar o ejecutar código.
    // También `process.getBuiltinModule` (carga child_process sin import),
    // el constructor de funciones por `.constructor(`, `Reflect` y CUALQUIER
    // llamada a un miembro calculado (`x['constr' + 'uctor'](…)`): en el
    // código del lector no hay ninguna, así que la regla puede ser estricta.
    const permitida = CARGA_PERMITIDA[r];
    if (permitida) eq(texto.split(permitida).length - 1, 1, `${r} no carga el lector con su única carga permitida`);
    const otraVia = (permitida ? texto.split(permitida).join('') : texto).match(/\bimport\s*\(|\brequire\s*\(|\bcreateRequire\b|\beval\s*\(|\bFunction\s*\(|\bprocess\s*\[|\bprocess\.(binding|dlopen|_linkedBinding)\b|\bgetBuiltinModule\b|\.constructor\b|\bconstructor\s*\(|\bReflect\b|\]\s*\(|\bglobalThis\s*\[|\beval\s*:\s*true|\bmodule\.constructor\b/);
    ok(!otraVia, `${r} puede cargar o ejecutar código por otra vía: ${otraVia?.[0]}`);
    // Un hilo solo arranca ficheros del propio lector, nunca código en texto.
    for (const m of texto.matchAll(/new\s+Worker\s*\((.{0,80})/g)) ok(/^\s*(new URL\(\s*["'][\w-]+\.mjs["'],\s*import\.meta\.url\s*\)|tarea)\s*,/.test(m[1]), `${r} arranca un hilo con ${m[1].trim()}`);
    // Y `tarea` solo puede ser un fichero del lector (su valor por defecto).
    if (/new\s+Worker\s*\(\s*tarea\b/.test(texto)) ok(/\btarea\s*=\s*new URL\(\s*["'][\w-]+\.mjs["'],\s*import\.meta\.url\s*\)/.test(texto) && (texto.match(/\btarea\s*=/g) ?? []).length === 1, `${r} arranca un hilo con una \`tarea\` que puede venir de otro sitio`);
  }
});

test('SEGURIDAD: el lector no lanza ningún programa ni lleva un mandato de adb (desde 3.97.0 no hay adb: la captura la da la tablet)', () => {
  // Javi: «no quiero perder la cuenta». Tocar la pantalla por adb sería
  // automatizar el juego (bot) y pone la cuenta en riesgo; leer una captura no.
  // Hasta 3.96.0 leer.mjs capturaba la tablet por adb desde Termux (tres
  // llamadas permitidas, fijadas por forma). Desde 3.97.0 nadie en la carpeta
  // puede lanzar programas: por FORMA, toda la carpeta, subcarpetas incluidas.
  const carpeta = join(RAIZ, 'scripts/lector');
  const todos = readdirSync(carpeta, { recursive: true }).map(String);
  const ficheros = todos.filter((f) => /\.(c|m)?js$/.test(f));
  const sinComentarios = (t) => t.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
  const PROHIBIDOS = /['"`](input|shell|tap|swipe|keyevent|text|install|uninstall|push|am|pm|monkey|sendevent|root|reboot|exec-out|screencap|connect)['"`]/;
  for (const f of ficheros) {
    const texto = sinComentarios(readFileSync(join(carpeta, f), 'utf8'));
    ok(!PROHIBIDOS.test(texto), `${f} lleva un mandato de adb: ${texto.match(PROHIBIDOS)?.[0]}`);
    ok(!/child_process|\bexecFile|\bspawn|\bexecSync|\bprocess\.binding|\badb\b/.test(texto), `${f} puede lanzar programas o habla de adb: nadie en el lector lo tiene permitido`);
  }
  // Ni guiones de shell (lector.sh, el arranque de Termux, se quitó en 3.97.0), ni voz.mjs (3.96.0), ni tablet.mjs (buscar la tablet por adb).
  for (const fuera of ['voz.mjs', 'tablet.mjs']) ok(!ficheros.includes(fuera), `vuelve a haber ${fuera}`);
  eq(todos.filter((g) => /\.sh$/.test(g)).length, 0, 'vuelve a haber un guion de shell en el lector');
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
  // Antes, por un enlace, no hacía nada y salía con 0 (revisión de 3.21.0).
  const tmp = mkdtempSync(join(tmpdir(), 'lector con espacio '));
  const enlace = join(tmp, 'repo');
  symlinkSync(RAIZ, enlace);
  const r = spawnSync(process.execPath, [join(enlace, 'scripts/lector/leer.mjs')], { encoding: 'utf8' });
  eq(r.status, 2, `por un enlace sale con ${r.status} y sin el mensaje de uso: ${r.stderr}`);
});

test('una cara que el panel pinta un 20-25% más grande se sigue leyendo: la criba mira también ese tamaño (3.55.0)', () => {
  const caras = carasGuardadas();
  // Amplía cada hueco alrededor de su centro, como la tablet pinta a Hanabi o a Johnson (medido en los recortes del 10-12 de octubre de 2026).
  const ampliar = (img, [cx, cy], f, [x0, y0, w, h]) => {
    const out = { ...img, rgba: img.rgba.slice() };
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) {
      const sx = Math.round(cx + (x - cx) / f), sy = Math.round(cy + (y - cy) / f);
      out.rgba.set(img.rgba.subarray((sy * img.ancho + sx) * 4, (sy * img.ancho + sx) * 4 + 4), (y * img.ancho + x) * 4);
    }
    return out;
  };
  const enemigos = PICKS_ENEMIGOS.reduce((img, p, i) => ampliar(img, p, 1.2, [2020, 230 + 216 * i, 380, 216]), capturaCompleta({ columna: 2 }));
  const leidos = leerPicksEnemigos(enemigos, caras).map((l) => l.nombre);
  ok(leidos.includes('Lesley') && leidos.includes('Aamon'), `a 1,2 no lee a Lesley y Aamon: ${leidos}`);
  ok(leidos.every((n) => !n || VERDAD_JUEGO.enemigos2.includes(n)), `a 1,2 lee a quien no está: ${leidos}`);
  const aliados = ALIADOS.reduce((img, p, i) => ampliar(img, p, 1.25, [60, 228 + 216 * i, 300, 170]), capturaCompleta());
  const companeros = leerAliados(aliados, caras).map((l) => l.nombre);
  ok(companeros.includes('Estes'), `a 1,25 no lee a Estes en tu equipo: ${companeros}`);
  ok(companeros.every((n) => !n || VERDAD_JUEGO.aliados.includes(n)), `a 1,25 lee en tu equipo a quien no está: ${companeros}`);
});

test('Minotaur con el dibujo que pinta el juego y la API aún no tiene: lo lee la cara del panel (3.59.3)', () => {
  // La columna enemiga de #80 (Nana, Alpha, Minotaur, Miya, Yin), OTRO draft que los dos de donde salen las caras del panel (#108, #58).
  const g = capturaCompleta({ conPicks: false });
  const col = leerPng(readFileSync(join(RAIZ, 'pruebas/fixtures/juego/picks-minotaur.png')));
  for (let y = 0; y < col.alto; y++) g.rgba.set(col.rgba.subarray(y * col.ancho * 4, (y + 1) * col.ancho * 4), ((230 + y) * g.ancho + 2120) * 4);
  const caras = carasGuardadas();
  const sin = leerPicksEnemigos(g, caras, { panel: [] });
  ok(sin[2].nombre !== 'Minotaur' && sin[2].parecido < 0.8, `sin la cara del panel ya se lee a Minotaur (${sin[2].nombre} ${sin[2].parecido.toFixed(2)}): la prueba no mide nada`);
  const con = leerPicksEnemigos(g, caras);
  eq(con[2].nombre, 'Minotaur', `con la cara del panel el hueco 3 sale ${con[2].nombre ?? '?'} (${con[2].parecido.toFixed(2)})`);
  ok(con[2].parecido >= 0.9, `Minotaur se parece solo ${con[2].parecido.toFixed(2)}`);
  eq(con.filter((l) => l.nombre === 'Minotaur').length, 1, `Minotaur sale en más de un hueco: ${con.map((l) => l.nombre)}`);
  // Y en la captura de siempre (Clint y Khufra, sin Minotaur) no aparece.
  ok(!leerPicksEnemigos(capturaCompleta(), caras).some((l) => l.nombre === 'Minotaur'), 'la cara del panel lee a Minotaur donde no está');
});

test('tu equipo con las caras de serie (3.59.5): Gord y tu Diggie de #121, un draft del que no sale ninguna de ellas', () => {
  // La columna de tu equipo de #121: Miya, Diggie (tu fila), X.Borg, Gord, Sora; la API no leía ni a Diggie ni a Gord.
  const g = capturaCompleta({ conAliados: false });
  const col = leerPng(readFileSync(join(RAIZ, 'pruebas/fixtures/juego/aliados-gord.png')));
  for (let y = 0; y < col.alto; y++) g.rgba.set(col.rgba.subarray(y * col.ancho * 4, (y + 1) * col.ancho * 4), ((228 + y) * g.ancho + 60) * 4);
  const caras = carasGuardadas();
  const filas = (l) => l.map((x) => x.nombre ?? '?').join(',');
  const sin = leerAliados(g, caras, { panel: [] });
  eq(filas(sin), 'Miya,?,?,?,Sora', `sin las caras de serie se lee ${filas(sin)}: la prueba no mide nada`);
  const con = leerAliados(g, caras);
  eq(filas(con), 'Miya,Diggie,?,Gord,Sora', `con las caras de serie se lee ${filas(con)}`);
  ok(con[3].aprendida && con[3].parecido >= 0.92, `Gord no sale de una cara de serie a 0,92 o más (${con[3].parecido.toFixed(2)})`);
});

test('un rival un poco por debajo del umbral, con margen sobre el segundo (3.80.0): Kaja de #146 sí, el hueco rojo de quien no ha elegido no', () => {
  // La columna de rivales de #146: Vexana, Bruno, Kaja, Saber y el hueco de Esmeralda aún sin elegir.
  const g = capturaCompleta();
  const col = leerPng(readFileSync(join(RAIZ, 'pruebas/fixtures/juego/picks-kaja.png')));
  for (let y = 0; y < col.alto; y++) g.rgba.set(col.rgba.subarray(y * col.ancho * 4, (y + 1) * col.ancho * 4), ((230 + y) * g.ancho + 2120) * 4);
  const l = leerPicksEnemigos(g, carasGuardadas());
  ok(l[2].parecido < PARECIDO_MINIMO, `Kaja ya pasa el umbral (${l[2].parecido.toFixed(3)}): la prueba no mide nada`);
  ok(l[2].nombre === 'Kaja' && l[2].cerca, `Kaja a ${l[2].parecido.toFixed(3)} con ${(l[2].parecido - (l[2].segundo?.parecido ?? 0)).toFixed(3)} de margen sale ${l[2].nombre ?? '?'}`);
  eq(l.map((x) => x.nombre ?? '?').join(','), 'Vexana,Bruno,Kaja,Saber,?', 'el hueco sin elegir se lee como alguien');
});

test('aceptarCercanos (3.80.0): umbral, margen sobre el segundo y nunca un nombre ya leído', () => {
  const h = (candidato, parecido, segundo, nombre = null) => ({ nombre, candidato, parecido, segundo: { nombre: 'Otro', parecido: segundo } });
  const r = aceptarCercanos([h('Kaja', 0.79, 0.70), h('Gord', 0.79, 0.75), h('Atlas', 0.76, 0.6), h('Vexana', 0.9, 0.7, 'Vexana'), h('Vexana', 0.79, 0.6)]);
  eq(r.map((x) => x.nombre ?? '?').join(','), 'Kaja,?,?,Vexana,?');
  ok(r[0].cerca && !r[3].cerca, 'no marca cuál entró por cerca');
  eq(CERCA_ENEMIGO < PARECIDO_MINIMO && MARGEN_CERCA_ENEMIGO > 0, true);
});

test('tu Minotaur de serie (3.84.1): la skin roja con la que la tablet apuntó «Floryn supuesto» el 28 de octubre de 2026', () => {
  const g = capturaCompleta({ conAliados: false });
  const col = leerPng(readFileSync(join(RAIZ, 'pruebas/fixtures/juego/aliados-minotaur.png')));
  for (let y = 0; y < col.alto; y++) g.rgba.set(col.rgba.subarray(y * col.ancho * 4, (y + 1) * col.ancho * 4), ((228 + y) * g.ancho + 60) * 4);
  const caras = carasGuardadas();
  const sin = leerAliados(g, caras, { panel: carasDelPanel('aliados').filter((c) => c.nombre !== 'Minotaur') });
  ok(!sin[3].nombre, `sin la cara de Minotaur tu fila ya sale ${sin[3].nombre}: la prueba no mide nada`);
  const con = leerAliados(g, caras);
  eq(con[3].nombre, 'Minotaur', `con las caras de serie tu fila sale ${con[3].nombre ?? '?'} (${con[3].parecido.toFixed(2)})`);
  eq(con.filter((x) => x.nombre === 'Minotaur').length, 1, 'Minotaur sale en más de una fila');
  eq(JSON.stringify(con.filter((_, i) => i !== 3).map((x) => x.nombre)), JSON.stringify(sin.filter((_, i) => i !== 3).map((x) => x.nombre)), 'la cara nueva cambia lo que se leía de los demás');
  ok(!leerAliados(capturaCompleta(), caras).some((x) => x.nombre === 'Minotaur' && x.aprendida), 'la cara de Minotaur lee a Minotaur donde no está');
});

test('tu Estes de serie (3.80.0): tu fila de #75, un draft del que no sale la cara', () => {
  const g = capturaCompleta({ conAliados: false });
  const col = leerPng(readFileSync(join(RAIZ, 'pruebas/fixtures/juego/aliados-estes.png')));
  for (let y = 0; y < col.alto; y++) g.rgba.set(col.rgba.subarray(y * col.ancho * 4, (y + 1) * col.ancho * 4), ((228 + y) * g.ancho + 60) * 4);
  const caras = carasGuardadas();
  const sin = leerAliados(g, caras, { panel: carasDelPanel('aliados').filter((c) => c.nombre !== 'Estes') });
  ok(!sin[4].nombre, `sin las caras de Estes tu fila ya sale ${sin[4].nombre}: la prueba no mide nada`);
  const con = leerAliados(g, caras);
  eq(con[4].nombre, 'Estes', `con las caras de serie tu fila sale ${con[4].nombre ?? '?'} (${con[4].parecido.toFixed(2)})`);
  eq(con.filter((x) => x.nombre === 'Estes').length, 1, 'Estes sale en más de una fila');
  ok(!leerAliados(capturaCompleta(), caras).some((x) => x.nombre === 'Estes' && x.aprendida), 'la cara de Estes lee a Estes donde no está');
});

await terminar('scripts/lector');
