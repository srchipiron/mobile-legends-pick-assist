/**
 * Lo que queda de la subida a GitHub (3.98.0): la huella que usa la base de
 * datos, el token (solo administración) guardado sin poder reventar la app,
 * y que la app ya no abra ni comente incidencias.
 */
import { test, ok, eq, terminar, RAIZ } from '../arnes.mjs';
import { huellaDe, sanearEnvio } from '../../src/app/envio.js';
import { recogerPerfil } from '../../src/motor/perfil.js';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const partidas = [{ t: 2, pick: 'Atlas', gane: true, recomendados: ['Atlas'] }, { t: 1, pick: 'Tigreal', gane: false, recomendados: [] }];
const mastery = { Atlas: { games: 20, winRate: 0.55 } };

test('la huella cambia con cualquier partida, resultado o maestría, y no con el rango ni el idioma', () => {
  const base = huellaDe({ partidas, mastery });
  eq(base, huellaDe({ partidas: partidas.map((p) => ({ ...p })), mastery: { ...mastery } }), 'la misma cosa da dos huellas');
  ok(base.startsWith('2.'), `la huella no lleva el nº de partidas delante: ${base}`);
  ok(base !== huellaDe({ partidas: partidas.map((p) => (p.t === 2 ? { ...p, gane: false } : p)), mastery }), 'corregir un resultado no cambia la huella');
  ok(base !== huellaDe({ partidas: partidas.slice(1), mastery }), 'quitar una partida no cambia la huella');
  ok(base !== huellaDe({ partidas, mastery: { Atlas: { games: 21, winRate: 0.55 } } }), 'cambiar la maestría no cambia la huella');
  // Lo que ve el hook es el perfil entero: rango, línea e idioma no cuentan.
  const p1 = recogerPerfil({ mastery, partidas, rango: 'glory', linea: 'roam', idioma: 'es' });
  const p2 = recogerPerfil({ mastery, partidas, rango: 'mythic', linea: 'exp', idioma: 'en' });
  eq(huellaDe(p1), huellaDe(p2), 'cambiar de rango o de idioma dispararía una subida');
});

test('sanearEnvio: solo el token, con cualquier basura y con lo guardado por una versión anterior', () => {
  eq(JSON.stringify(sanearEnvio(null)), '{"token":null}');
  eq(JSON.stringify(sanearEnvio([1, 2])), '{"token":null}');
  eq(JSON.stringify(sanearEnvio({ token: '  tok  ', incidencia: 12, tablet: 3, subidas: ['picks:1'], huella: '2.a' })), '{"token":"tok"}', 'se queda lo de la subida a incidencias');
});

test('la app ya no abre ni comenta incidencias por la API (3.98.0): ni github.js, ni ningún fichero de src/app', () => {
  const carpeta = join(RAIZ, 'src/app');
  const ficheros = readdirSync(carpeta, { recursive: true }).map(String).filter((f) => /\.(js|jsx)$/.test(f));
  for (const f of ficheros) {
    const texto = readFileSync(join(carpeta, f), 'utf8');
    ok(!/subirIncidencia|comentarIncidencia|subirAparte|\/issues\/\$\{|\/comments\b/.test(texto), `${f} vuelve a subir a incidencias de GitHub`);
  }
});

terminar('app/envio');
