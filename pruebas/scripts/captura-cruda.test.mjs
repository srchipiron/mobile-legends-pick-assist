/**
 * La captura SIN comprimir de las lecturas del draft (3.45.0): `screencap`
 * sin `-p` se lee (`leerCrudo`), el lector prueba las dos y se queda con la
 * más rápida (`crearElectorDeCaptura`), lee lo mismo que con el PNG, guarda
 * un PNG para el aprendizaje, y si la crudo no vale vuelve a la comprimida
 * sin perder la lectura (y sin culpar a la crudo de una tablet apagada).
 */
import { mkdtempSync, readFileSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, ok, eq, terminar } from '../arnes.mjs';
import { leerPng, leerCrudo, escribirPngRapido, escribirPng } from '../../scripts/lector/png.mjs';
import { crearServidor, crearElectorDeCaptura, ELECCION_DE_CAPTURA } from '../../scripts/lector/servir.mjs';
import { capturaCompletaPng, VERDAD } from '../fixtures/juego/captura.mjs';

/** Lo que daría `screencap` sin `-p`: cabecera (12 o 16 bytes) y los píxeles tal cual. */
const crudoDe = ({ ancho, alto, rgba }, { cabecera = 16, formato = 1 } = {}) => {
  const c = Buffer.alloc(cabecera);
  c.writeUInt32LE(ancho, 0); c.writeUInt32LE(alto, 4); c.writeUInt32LE(formato, 8);
  if (cabecera === 16) c.writeUInt32LE(1, 12);
  return Buffer.concat([c, Buffer.from(rgba)]);
};

test('la captura en crudo se lee con las dos cabeceras de Android y RGBX; lo que no cuadra se rechaza', async () => {
  const img = { ancho: 3, alto: 2, rgba: Uint8Array.from({ length: 24 }, (_, i) => (i * 37) & 255) };
  for (const cabecera of [12, 16]) {
    const r = leerCrudo(crudoDe(img, { cabecera }));
    ok(r.ancho === 3 && r.alto === 2 && Buffer.from(r.rgba).equals(Buffer.from(img.rgba)), `con cabecera de ${cabecera} no sale la imagen`);
  }
  const x = leerCrudo(crudoDe(img, { formato: 2 }));
  ok([3, 7, 11, 15, 19, 23].every((k) => x.rgba[k] === 255), 'RGBX no deja el cuarto byte opaco');
  const falla = (buf) => { try { leerCrudo(buf); return false; } catch { return true; } };
  ok(falla(crudoDe(img, { formato: 4 })), 'acepta un formato de 16 bits (RGB_565) como si fuera RGBA');
  ok(falla(crudoDe(img).subarray(0, 30)), 'acepta una captura cortada');
  ok(falla(capturaCompletaPng()), 'acepta un PNG como si fuera crudo');
  ok(falla(Buffer.alloc(0)), 'acepta una captura vacía');
  // Y el PNG rápido que se guarda para el aprendizaje es la misma imagen.
  const grande = leerPng(capturaCompletaPng());
  const vuelta = leerPng(await escribirPngRapido(grande));
  ok(vuelta.ancho === grande.ancho && vuelta.alto === grande.alto && Buffer.from(vuelta.rgba).equals(Buffer.from(grande.rgba)), 'el PNG guardado de una captura en crudo no es la misma imagen');
  // El CRC por tabla da lo mismo que antes: un PNG escrito con él se lee igual.
  ok(Buffer.from(leerPng(escribirPng(img)).rgba).equals(Buffer.from(img.rgba)), 'el PNG de siempre deja de leerse');
});

test('el elector alterna hasta tener muestras de las dos, se queda con la más rápida, vuelve a probar la otra de vez en cuando, y tras un fallo se queda en PNG', () => {
  const e = crearElectorDeCaptura({ muestras: 3, ventana: 5, explorar: 10 });
  const vistos = [];
  const tiempo = { crudo: 1500, png: 4000 };
  let cambio = null;
  for (let i = 0; i < 30; i++) { const f = e.siguiente(); vistos.push(f); cambio = e.anotar(f, tiempo[f]) ?? cambio; }
  eq(vistos.slice(0, 6).join(), 'crudo,png,crudo,png,crudo,png', `no alterna al principio: ${vistos.slice(0, 6)}`);
  eq(cambio, 'crudo', 'no avisa de que la crudo es la más rápida');
  const despues = vistos.slice(6);
  ok(despues.filter((f) => f === 'crudo').length >= 20 && despues.includes('png'), `no se queda con la rápida o no vuelve a probar la otra: ${despues}`);
  // Si la wifi cambia y la crudo pasa a ir lenta, cambia.
  tiempo.crudo = 9000;
  const luego = [];
  for (let i = 0; i < 30; i++) { const f = e.siguiente(); luego.push(f); e.anotar(f, tiempo[f]); }
  ok(luego.slice(-20).filter((f) => f === 'png').length >= 17, `no se pasa a la comprimida cuando la crudo va lenta: ${luego}`);
  // Con la crudo rota, siempre PNG.
  const r = crearElectorDeCaptura();
  r.descartar('formato 4');
  ok(Array.from({ length: 12 }, () => r.siguiente()).every((f) => f === 'png'), 'pide crudo después de descartarla');
  ok(ELECCION_DE_CAPTURA.muestras >= 2 && ELECCION_DE_CAPTURA.explorar > ELECCION_DE_CAPTURA.muestras, 'la elección no tiene muestras o no vuelve a explorar');
});

test('/leer con el elector: la crudo lee lo mismo que la comprimida, deja un PNG para aprender y dice su formato; si la crudo no vale, vuelve a la comprimida sin perder la lectura', async () => {
  const png = capturaCompletaPng();
  const crudo = crudoDe(leerPng(png));
  const carpeta = mkdtempSync(join(tmpdir(), 'crudo-'));
  const pedidas = [];
  let modo = 'bien';
  const capturar = async (op = {}) => {
    pedidas.push(op.crudo ? 'crudo' : 'png');
    if (modo === 'apagada') throw Object.assign(new Error('device offline'), { tipo: 'tablet' });
    if (op.crudo) return modo === 'roto' ? Buffer.from('basura') : crudo;
    return png;
  };
  const elector = crearElectorDeCaptura();
  const servidor = crearServidor({ capturar, elector, carpeta, enHilos: false, aprender: async () => ({ aprendido: null, informe: [] }) });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${servidor.address().port}`;
  const leer = async () => { const r = await fetch(`${base}/leer`, { headers: { Origin: 'https://srchipiron.github.io' } }); return { estado: r.status, l: await r.json() }; };
  try {
    const a = (await leer()).l, b = (await leer()).l;
    eq(`${a.formato},${b.formato}`, 'crudo,png', 'no prueba primero la crudo y luego la comprimida');
    eq(a.enemigos.map((x) => x.nombre).filter(Boolean).join(), VERDAD.enemigos.join(), 'la captura en crudo no lee los picks enemigos');
    eq(JSON.stringify([a.tuyos, a.suyos, a.enemigos, a.aliados, a.tuyo]), JSON.stringify([b.tuyos, b.suyos, b.enemigos, b.aliados, b.tuyo]), 'en crudo se lee otra cosa que en PNG');
    // El PNG de la crudo llega a la carpeta (se escribe aparte) y es la misma imagen.
    const t0 = Date.now();
    while (!existsSync(join(carpeta, `${a.id}.png`)) && Date.now() - t0 < 5000) await new Promise((r) => setTimeout(r, 20));
    ok(Buffer.from(leerPng(readFileSync(join(carpeta, `${a.id}.png`))).rgba).equals(Buffer.from(leerPng(png).rgba)), 'la captura en crudo no se guarda como el PNG de la misma imagen');
    // La tablet apagada: falla la crudo y la comprimida, la app lo sabe, y la crudo NO se descarta por eso.
    modo = 'apagada';
    while (elector.siguiente() !== 'crudo');
    const apagada = await leer();
    eq(apagada.estado, 502, 'con la tablet apagada no dice que falla la captura');
    eq(elector.estado().roto, null, 'una tablet apagada descarta la captura en crudo para siempre');
    // La crudo que no se sabe leer: la lectura sale igual, comprimida, y desde ahí todo comprimido.
    modo = 'roto';
    pedidas.length = 0;
    let rota = null;
    for (let i = 0; i < 12 && !rota; i++) { const r = await leer(); if (pedidas.includes('crudo')) rota = r; pedidas.length = rota ? pedidas.length : 0; }
    ok(rota && rota.estado === 200 && rota.l.formato === 'png' && rota.l.enemigos.some((x) => x.nombre), `una crudo rota pierde la lectura: ${JSON.stringify(rota?.l?.error ?? rota?.estado)}`);
    ok(elector.estado().roto, 'una crudo que no se sabe leer no se descarta');
    pedidas.length = 0;
    for (let i = 0; i < 12; i++) await leer();
    ok(!pedidas.includes('crudo'), 'después de descartarla sigue pidiendo la crudo');
  } finally { servidor.close(); }
});

test('sin elector, /leer sigue con la comprimida y no pide nunca la crudo (las pruebas y leer.mjs de siempre)', async () => {
  const pedidas = [];
  const servidor = crearServidor({ capturar: async (op = {}) => { pedidas.push(op.crudo ? 'crudo' : 'png'); return capturaCompletaPng(); }, enHilos: false });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  try {
    const r = await (await fetch(`http://127.0.0.1:${servidor.address().port}/leer`, { headers: { Origin: 'https://srchipiron.github.io' } })).json();
    eq(`${r.formato}|${pedidas.join()}`, 'png|png', 'sin elector cambia de formato');
  } finally { servidor.close(); }
});

await terminar('scripts/captura-cruda');
