/**
 * La captura de la tablet llega SIEMPRE en crudo (la cabecera de `screencap`
 * y los píxeles): la APK no comprime nada y el lector no descomprime nada.
 * `leerCrudo` acepta las dos cabeceras de Android y RGBX; lo que se guarda
 * para aprender se comprime aparte, fuera del hilo principal.
 */
import { createServer } from 'node:http';
import { mkdtempSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after } from 'node:test';
import { test, ok, eq } from '../ayuda.mjs';
import { leerPng, leerCrudo, escribirPngRapido, escribirPng } from '../../scripts/lector/png.mjs';
import { capturaDeLaApk } from '../../scripts/lector/en-tablet.mjs';
import { capturaCompleta, capturaCompletaPng, VERDAD } from '../fixtures/juego/captura.mjs';
import { arrancar } from '../fixtures/juego/lector.mjs';

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

const cerrar = [];
after(() => Promise.all(cerrar.map((f) => f())));

test('la captura de la APK: en crudo, con su secreto, por 127.0.0.1; sin el secreto o sin grabar, un fallo con lo que hay que hacer', async () => {
  const img = capturaCompleta();
  const crudo = crudoDe(img);
  let grabando = true;
  const apk = createServer((req, res) => {
    if (req.headers['x-secreto'] !== 'secreto-de-la-apk') { res.writeHead(403).end(); return; }
    if (req.url === '/captura') { if (grabando) res.writeHead(200).end(crudo); else res.writeHead(409).end(); return; }
    res.writeHead(404).end();
  });
  await new Promise((r) => apk.listen(0, '127.0.0.1', r));
  cerrar.push(() => new Promise((r) => apk.close(r)));
  const base = `http://127.0.0.1:${apk.address().port}`;
  const leida = await capturaDeLaApk(base, 'secreto-de-la-apk')();
  ok(leida.ancho === img.ancho && leida.alto === img.alto && Buffer.from(leida.rgba).equals(Buffer.from(img.rgba)), 'la captura de la APK no es la imagen que dio');
  const fallo = async (f) => { try { await f(); return null; } catch (e) { return e.message; } };
  ok(/captura 403/.test(await fallo(capturaDeLaApk(base, 'otro-secreto'))), 'sin el secreto la APK da la captura');
  grabando = false;
  ok(/no está grabando/.test(await fallo(capturaDeLaApk(base, 'secreto-de-la-apk'))), 'sin grabar no dice qué hacer');
});

test('cada lectura del draft se guarda en PNG para aprender, y la imagen guardada es la que se leyó', async () => {
  const carpeta = mkdtempSync(join(tmpdir(), 'cruda-'));
  const img = capturaCompleta();
  const { interno, cerrar: c } = await arrancar({ carpeta, capturar: async () => img });
  cerrar.push(c);
  const r = await interno.leer();
  ok(r.ok, JSON.stringify(r));
  eq(r.lectura.tuyos.map((b) => b.nombre).join(), VERDAD.tuyos.join(), 'la lectura en crudo no lee los baneos');
  await interno.guardando();
  const png = join(carpeta, `${r.lectura.id}.png`);
  ok(existsSync(png) && existsSync(join(carpeta, `${r.lectura.id}.json`)), 'la lectura no deja su captura para aprender');
  const vuelta = leerPng((await import('node:fs')).readFileSync(png));
  ok(Buffer.from(vuelta.rgba).equals(Buffer.from(img.rgba)), 'el PNG guardado no es la imagen leída');
});
