/**
 * Los recortes de los picks (scripts/lector/recortes.mjs, 3.52.0): las diez
 * caras de una captura del draft, para subirlas y medir por qué el lector
 * no reconoce a algunos héroes. Lo que importa: que quepan en un mensaje,
 * que sigan reconociéndose igual (si no, no sirven para medir) y que NO
 * lleven los nombres de los jugadores.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { leerPng } from '../../scripts/lector/png.mjs';
import { carasGuardadas, leerPicksEnemigos, leerAliados } from '../../scripts/lector/leer.mjs';
import { recorteDePicks, recorteDeDraft, recortesDelDraft, componerPicks, CAJAS_ALIADOS, CAJAS_ENEMIGOS, TOPE_RECORTE } from '../../scripts/lector/recortes.mjs';
import { capturaCompleta, VERDAD } from '../fixtures/juego/captura.mjs';

const caras = carasGuardadas();
const img = capturaCompleta({ columna: 2 });

/** Devuelve el recorte a su sitio en una pantalla negra, ampliado al tamaño de la referencia. */
function devolver(b64) {
  const r = leerPng(Buffer.from(b64, 'base64'));
  const ancho = CAJAS_ALIADOS[0][2] + CAJAS_ENEMIGOS[0][2], alto = 170 * 5;
  const cap = { ancho: 2400, alto: 1504, rgba: new Uint8Array(2400 * 1504 * 4) };
  const pixel = (x, y) => { const sx = Math.min(r.ancho - 1, Math.floor((x * r.ancho) / ancho)), sy = Math.min(r.alto - 1, Math.floor((y * r.alto) / alto)); return r.rgba.subarray((sy * r.ancho + sx) * 4, (sy * r.ancho + sx) * 4 + 4); };
  for (let i = 0; i < 5; i++) {
    const [ax, ay, aw, ah] = CAJAS_ALIADOS[i], [ex, ey, ew, eh] = CAJAS_ENEMIGOS[i];
    for (let y = 0; y < ah; y++) for (let x = 0; x < aw; x++) cap.rgba.set(pixel(x, i * 170 + y), ((ay + y) * 2400 + ax + x) * 4);
    for (let y = 0; y < eh; y++) for (let x = 0; x < ew; x++) cap.rgba.set(pixel(aw + x, i * 170 + y), ((ey + y) * 2400 + ex + x) * 4);
  }
  return cap;
}

test('el recorte cabe en un mensaje y, devuelto a su sitio, el lector lee las diez caras igual que en la captura', () => {
  const b64 = recorteDePicks(img);
  ok(b64 && b64.length <= TOPE_RECORTE, `no cabe: ${b64?.length}`);
  const vuelta = devolver(b64);
  const antes = leerPicksEnemigos(img, caras), despues = leerPicksEnemigos(vuelta, caras);
  eq(despues.map((l) => l.nombre).join(), VERDAD.enemigos2.join(), 'los enemigos del recorte no son los de la captura');
  const aliadosAntes = leerAliados(img, caras), aliadosDespues = leerAliados(vuelta, caras);
  eq(aliadosDespues.map((l) => l.nombre).join(), VERDAD.aliados.join(), 'tu equipo no se lee en el recorte');
  // Que sirva para MEDIR: el parecido no puede caer mucho (medido: ±0,05).
  for (const [a, d] of [...antes.map((l, i) => [l, despues[i]]), ...aliadosAntes.map((l, i) => [l, aliadosDespues[i]])]) {
    ok(Math.abs(a.parecido - d.parecido) <= 0.08, `${a.nombre}: ${a.parecido.toFixed(2)} → ${d.parecido.toFixed(2)}`);
  }
});

test('el recorte no lleva los nombres de los jugadores: ni la caja de tu equipo ni la franja de abajo de cada hueco del suyo', () => {
  // Una pantalla negra con magenta SOLO donde van los nombres.
  const cap = { ancho: 2400, alto: 1504, rgba: new Uint8Array(2400 * 1504 * 4) };
  const pintar = (x0, y0, w, h) => { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) cap.rgba.set([255, 0, 255, 255], (y * 2400 + x) * 4); };
  for (let i = 0; i < 5; i++) {
    pintar(14, 404 + 216 * i, 300, 36); // el nombre en tu equipo (NOMBRES_ALIADOS de leer.mjs)
    pintar(2020, 230 + 216 * i + 165, 380, 216 - 165); // la parte de abajo del hueco enemigo, donde va su nombre
  }
  const c = componerPicks(cap);
  let magenta = 0;
  for (let k = 0; k < c.rgba.length; k += 4) if (c.rgba[k] > 200 && c.rgba[k + 1] < 60 && c.rgba[k + 2] > 200) magenta += 1;
  eq(magenta, 0, `se cuelan ${magenta} píxeles de la zona de los nombres`);
  // Y el control: con las caras pintadas, sí salen.
  pintar(CAJAS_ALIADOS[0][0] + 10, CAJAS_ALIADOS[0][1] + 10, 20, 20);
  const c2 = componerPicks(cap);
  ok(c2.rgba.some((v, k) => k % 4 === 0 && v > 200 && c2.rgba[k + 1] < 60), 'la cara de tu equipo no entra en el recorte');
});

test('en una tablet de otra resolución las cajas se escalan: mismo recorte de la misma pantalla a la mitad', () => {
  const mitad = { ancho: 1200, alto: 752, rgba: new Uint8Array(1200 * 752 * 4) };
  for (let y = 0; y < 752; y++) for (let x = 0; x < 1200; x++) mitad.rgba.set(img.rgba.subarray(((y * 2) * 2400 + x * 2) * 4, ((y * 2) * 2400 + x * 2) * 4 + 4), (y * 1200 + x) * 4);
  const r = recorteDeDraft(mitad, caras);
  eq(r.enemigos.filter((h) => h.nombre).length >= 4 && r.aliados.filter((h) => h.nombre).length >= 4, true, `en la mitad lee ${r.enemigos.map((h) => h.nombre)} / ${r.aliados.map((h) => h.nombre)}`);
});

test('lo leído va hueco a hueco, con candidato y parecido aunque no pase del umbral, y la fila que eres tú', () => {
  const r = recorteDeDraft(capturaCompleta({ columna: 2, conAliados: false }), caras);
  eq(r.enemigos.length, 5); eq(r.aliados.length, 5);
  eq(r.enemigos.map((h) => h.nombre).join(), VERDAD.enemigos2.join());
  ok(r.aliados.every((h) => h.nombre === null && typeof h.candidato === 'string' && h.parecido < 0.8), 'sin tu equipo en pantalla lee a alguien');
  eq(r.tuyoFila, -1, 'sin tu equipo en pantalla dice qué fila eres');
  eq(recorteDeDraft(img, caras).tuyoFila, VERDAD.tuyoFila, 'no dice que la quinta fila eres tú');
});

test('de las capturas del aprendizaje se recortan las DOS ÚLTIMAS que eran la pantalla del draft, nunca una descartada', () => {
  const leidas = [];
  const informe = [{ id: 'lectura-1' }, { id: 'lectura-2' }, { id: 'lectura-3', descartada: 'sinBaneos' }, { id: 'lectura-4' }, { id: 'lectura-5', descartada: 'sinBaneos' }];
  const r = recortesDelDraft(informe, (id) => { leidas.push(id); return img; }, caras);
  eq(r.map((x) => x.id).join(), 'lectura-2,lectura-4');
  eq(leidas.join(), 'lectura-2,lectura-4', 'decodifica capturas que no recorta');
  eq(recortesDelDraft([], () => img, caras).length, 0);
});

await terminar('scripts/recortes');
