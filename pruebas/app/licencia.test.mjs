/**
 * Las claves de invitación (3.65.0, src/app/licencia.js): firmar con la
 * clave de administrador, comprobar con la pública, y la puerta.
 */
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { crearClaveDeAdministrador, firmarClave, comprobarClave, sanearLicencias, sanearDatosDeClave, claveDeEnlace, enlaceDeClave, pasaLaPuerta } from '../../src/app/licencia.js';

const admin = await crearClaveDeAdministrador();
const otro = await crearClaveDeAdministrador();
const AHORA = Date.UTC(2026, 9, 22);
const fijo = () => new Uint8Array([1, 2, 3, 4, 5, 6]);

test('una clave firmada vale con su pública y dice quién es', async () => {
  const c = await firmarClave({ nombre: '  Lucía  ', privada: admin.privada, ahora: AHORA, azar: fijo });
  ok(/^[\w-]+\.[\w-]+$/.test(c), `la clave no cabe en un enlace: ${c}`);
  const r = await comprobarClave(c, { publica: admin.publica, ahora: AHORA + 1 });
  eq(r.valida, true); eq(r.motivo, null);
  eq(r.datos.nombre, 'Lucía'); eq(r.datos.emitida, AHORA); eq(r.datos.caduca, null);
  ok(/^[a-z0-9]{6,24}$/.test(r.datos.id), `id raro: ${r.datos.id}`);
  const d = await comprobarClave(await firmarClave({ nombre: 'B', privada: admin.privada }), { publica: admin.publica });
  ok(d.datos.id !== r.datos.id, 'dos claves con el mismo id: revocar una quitaría las dos');
});

test('la firma no se falsifica: otra clave, el cuerpo cambiado o la firma de otra no valen', async () => {
  const c = await firmarClave({ nombre: 'Lucía', dias: 7, privada: admin.privada, ahora: AHORA });
  eq((await comprobarClave(c, { publica: otro.publica, ahora: AHORA })).motivo, 'firma', 'vale con la pública de otro');
  const [cuerpo, firma] = c.split('.');
  // Alargar la caducidad a mano: el mismo nombre con otro cuerpo.
  const datos = JSON.parse(Buffer.from(cuerpo, 'base64url').toString());
  const trucado = Buffer.from(JSON.stringify({ ...datos, c: datos.c + 365 * 86400000 })).toString('base64url');
  eq((await comprobarClave(`${trucado}.${firma}`, { publica: admin.publica, ahora: AHORA })).motivo, 'firma', 'alargar la caducidad pasa');
  const otra = await firmarClave({ nombre: 'Pepe', privada: admin.privada, ahora: AHORA });
  eq((await comprobarClave(`${cuerpo}.${otra.split('.')[1]}`, { publica: admin.publica, ahora: AHORA })).motivo, 'firma', 'la firma de otra clave vale');
  eq((await comprobarClave(`${cuerpo}.AAAA`, { publica: admin.publica, ahora: AHORA })).motivo, 'firma');
});

test('caducada, revocada, sin pública o con basura: no vale y dice por qué, sin lanzar', async () => {
  const c = await firmarClave({ nombre: 'Lucía', dias: 7, privada: admin.privada, ahora: AHORA });
  eq((await comprobarClave(c, { publica: admin.publica, ahora: AHORA + 6 * 86400000 })).valida, true);
  eq((await comprobarClave(c, { publica: admin.publica, ahora: AHORA + 8 * 86400000 })).motivo, 'caducada');
  const { datos } = await comprobarClave(c, { publica: admin.publica, ahora: AHORA });
  eq((await comprobarClave(c, { publica: admin.publica, revocadas: [datos.id], ahora: AHORA })).motivo, 'revocada');
  eq((await comprobarClave(c, { publica: admin.publica, revocadas: ['otraclave1'], ahora: AHORA })).valida, true);
  eq((await comprobarClave(c, { publica: null, ahora: AHORA })).motivo, 'sinPublica');
  for (const basura of [null, '', 'hola', 'a.b.c', '.x', '%%%.%%%', `${Buffer.from('{"id":"x"}').toString('base64url')}.AAAA`]) {
    eq((await comprobarClave(basura, { publica: admin.publica })).motivo, 'formato', `«${basura}» no es formato`);
  }
});

test('sanearLicencias: forma garantizada, nunca la parte privada, y sin pública no se exige', () => {
  const l = sanearLicencias({ publica: admin.privada, exigir: true, revocadas: ['abcdef', 'MAL', 3, '../x'] });
  eq(l.publica.d, undefined, 'publicaría la parte privada de la clave de administrador');
  eq(l.exigir, true); eq(JSON.stringify(l.revocadas), '["abcdef"]');
  eq(sanearLicencias({ exigir: true }).exigir, false, 'exigir sin pública cierra la puerta a todos para siempre');
  eq(JSON.stringify(sanearLicencias(null)), JSON.stringify({ version: 1, publica: null, exigir: false, revocadas: [] }));
  eq(sanearLicencias({ publica: admin.publica, exigir: 'true' }).exigir, false);
});

test('el licencias.json publicado tiene la forma de sanearLicencias', () => {
  const j = JSON.parse(readFileSync(join(RAIZ, 'public/licencias.json'), 'utf8'));
  eq(JSON.stringify(sanearLicencias(j)), JSON.stringify(j), 'licencias.json lleva algo que la app no lee igual');
  eq(j.publica?.d, undefined, 'licencias.json lleva una clave privada');
});

test('el enlace lleva la clave y la app la saca de él', async () => {
  const c = await firmarClave({ nombre: 'Lucía', privada: admin.privada });
  const url = new URL(enlaceDeClave(c));
  eq(url.origin + url.pathname, 'https://srchipiron.github.io/mobile-legends-pick-assist/');
  eq(claveDeEnlace(url.hash), c);
  eq(claveDeEnlace('#lector=1.2.3.4:5&codigo=x'), null);
  eq(claveDeEnlace('#clave=<script>'), null);
  eq(sanearDatosDeClave({ id: 'abcdef', n: '   ', e: 1 }), null, 'una clave sin nombre');
});

test('la puerta: abierta si no se exige; si se exige, el administrador y quien tenga clave válida', () => {
  const exigir = sanearLicencias({ publica: admin.publica, exigir: true });
  const abierta = sanearLicencias({ publica: admin.publica });
  eq(pasaLaPuerta({ licencias: null, comprobada: null }), true, 'sin licencias.json (sin red) no se cierra');
  eq(pasaLaPuerta({ licencias: abierta, comprobada: null }), true);
  eq(pasaLaPuerta({ licencias: exigir, comprobada: null }), false, 'sin clave pasa');
  eq(pasaLaPuerta({ licencias: exigir, comprobada: { valida: false, motivo: 'revocada' } }), false, 'con clave revocada pasa');
  eq(pasaLaPuerta({ licencias: exigir, comprobada: { valida: true } }), true);
  eq(pasaLaPuerta({ licencias: exigir, comprobada: null, esAdministrador: true }), true, 'el administrador se queda fuera');
});

await terminar('app/licencia');
