/**
 * Lo que llega de la API son datos, no código ni rutas (3.60.4). Dos caminos
 * que la revisión de seguridad reprodujo: una speciality con comillas que
 * derivar-tags.mjs escribía como código en reglas.js (y `npm test` lo
 * ejecutaba en el bot de mantenimiento, con permiso de escritura), y un id
 * de imagen «../x» que escribía fuera de su carpeta.
 */
import { mkdtempSync, existsSync, readdirSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { pintarTabla } from '../../scripts/derivar-tags.mjs';
import { ES_SPECIALITY } from '../../scripts/ingesta/extraccion.mjs';
import { bajarImagenes, esUrlDeImagen } from '../../scripts/ingesta/imagenes.mjs';

test('una speciality con forma de código no llega a reglas.js', async () => {
  const reales = ['Chase', 'Finisher', 'Crowd Control', 'Support', 'Charge', 'Burst', 'Damage', 'Control', 'Regen', 'Poke', 'Magic Damage', 'Guard', 'Initiator', 'Push', 'Mixed Damage'];
  ok(reales.every((s) => ES_SPECIALITY.test(s)), 'se rechaza una speciality real');
  const mala = "x':(globalThis.PWNED=1),'y";
  ok(!ES_SPECIALITY.test(mala) && !ES_SPECIALITY.test('a\nb') && !ES_SPECIALITY.test('`x`'), 'se acepta una speciality con comillas');
  const tabla = pintarTabla({ Guard: ['tank', 'cc_hard'], [mala]: ['mobile'], Poke: ["x'];globalThis.PWNED=2;['"] });
  eq(tabla, "  'Guard': ['tank', 'cc_hard'],", `la tabla lleva lo que no debe: ${tabla}`);
  // Y el código que sale se puede evaluar sin efectos.
  delete globalThis.PWNED;
  await import(`data:text/javascript,${encodeURIComponent(`export const T = {\n${tabla}\n};`)}`);
  eq(globalThis.PWNED, undefined, 'la tabla ejecuta código');
  // El bot sustituye el bloque con una función: con una cadena, `$&` del texto nuevo se interpretaba.
  ok(readFileSync(join(RAIZ, '.github/workflows/mantenimiento.yml'), 'utf8').includes('salida.replace(viejo, () => nuevo)'), 'mantenimiento.yml sustituye el bloque con una cadena');
});

test('una imagen con id «../x» o una dirección que no es https no se baja', async () => {
  ok(esUrlDeImagen('https://akmweb.youngjoygame.com/a.png') && esUrlDeImagen('http://127.0.0.1:9/a.png'), 'se rechaza una dirección buena');
  ok(!esUrlDeImagen('http://otro.sitio/a.png') && !esUrlDeImagen('file:///etc/passwd') && !esUrlDeImagen('javascript:1') && !esUrlDeImagen('no es url'), 'se acepta una dirección mala');
  const PNG = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47]), Buffer.alloc(300)]);
  const srv = createServer((req, res) => { res.writeHead(200, { 'Content-Type': 'image/png' }).end(PNG); });
  await new Promise((r) => srv.listen(0, '127.0.0.1', r));
  try {
    const base = mkdtempSync(join(tmpdir(), 'imagenes-'));
    const dir = join(base, 'objetos');
    const u = `http://127.0.0.1:${srv.address().port}/i.png`;
    const r = await bajarImagenes({ '../escapado': u, 'a/b': u, 7: u }, dir, '.png', 'objetos');
    ok(!existsSync(join(base, 'escapado.png')), 'un id «../escapado» escribe fuera de la carpeta');
    eq(readdirSync(dir).filter((f) => f.endsWith('.png')).join(), '7.png', `se bajan imágenes con id que no es un número: ${readdirSync(dir)}`);
    eq(r.bajados, 1);
  } finally { srv.close(); }
});

await terminar('scripts/datos-de-fuera');
