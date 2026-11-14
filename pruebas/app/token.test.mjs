/**
 * El token de GitHub (solo administración) guardado sin poder reventar la
 * app, la huella con la que se sube a la base de datos, y que la app no abre
 * ni comenta incidencias por la API.
 */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test, ok, eq, RAIZ } from '../ayuda.mjs';
import { sanearToken } from '../../src/app/estado/useToken.js';
import { huellaDeSubida } from '../../src/app/estado/useComunidad.js';

const partidas = [{ t: 2, pick: 'Atlas', gane: true, recomendados: ['Atlas'] }, { t: 1, pick: 'Tigreal', gane: false, recomendados: [] }];

test('la huella cambia con cualquier partida, resultado, quitada o referencia, y es la misma de 3.x', () => {
  const base = huellaDeSubida({ partidas, olvidadas: [], referencia: null });
  eq(base, huellaDeSubida({ partidas: partidas.map((p) => ({ ...p })), olvidadas: [], referencia: null }), 'la misma cosa da dos huellas');
  ok(base.startsWith('2.'), `la huella no lleva el nº de partidas delante: ${base}`);
  ok(base !== huellaDeSubida({ partidas: partidas.map((p) => (p.t === 2 ? { ...p, gane: false } : p)) }), 'corregir un resultado no cambia la huella');
  ok(base !== huellaDeSubida({ partidas: partidas.slice(1) }), 'quitar una partida no cambia la huella');
  ok(base !== huellaDeSubida({ partidas, olvidadas: [3] }), 'una quitada no cambia la huella');
  ok(base !== huellaDeSubida({ partidas, referencia: { winRate: 0.5, partidas: 100 } }), 'la referencia no cambia la huella');
  // La huella guardada por 3.x (`{ p, m: { o, r } }`): igual, para no volver a subir todo al actualizar.
  eq(huellaDeSubida({ partidas, olvidadas: [9], referencia: null }), '2.' + fnv(JSON.stringify({ p: partidas, m: { o: [9], r: null } })));
});

function fnv(texto) {
  let h = 0x811c9dc5;
  for (let i = 0; i < texto.length; i++) { h ^= texto.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; }
  return h.toString(16);
}

test('lo guardado en roam-picker:envio: solo el token, con cualquier basura y con lo de versiones viejas', () => {
  eq(JSON.stringify(sanearToken(null)), '{"token":null}');
  eq(JSON.stringify(sanearToken([1, 2])), '{"token":null}');
  eq(JSON.stringify(sanearToken({ token: '  tok  ', incidencia: 12, tablet: 3, subidas: ['picks:1'], huella: '2.a' })), '{"token":"tok"}', 'se queda lo de la subida a incidencias');
});

test('ningún fichero de src/app abre ni comenta incidencias por la API', () => {
  const carpeta = join(RAIZ, 'src/app');
  const ficheros = readdirSync(carpeta, { recursive: true }).map(String).filter((f) => /\.(js|jsx)$/.test(f));
  ok(ficheros.length > 40, `la búsqueda se queda muda: ${ficheros.length} ficheros`);
  for (const f of ficheros) {
    const texto = readFileSync(join(carpeta, f), 'utf8');
    ok(!/subirIncidencia|comentarIncidencia|subirAparte|\/issues\/\$\{|\/comments\b/.test(texto), `${f} vuelve a subir a incidencias de GitHub`);
  }
});
