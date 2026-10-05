/**
 * La subida automática de partidas (3.10.0), la parte pura: qué se sube,
 * cuándo toca y que lo guardado no pueda reventar la app.
 */
import { test, ok, eq, terminar } from '../arnes.mjs';
import { huellaDe, sanearEnvio, tocaSubir, encolarAparte, vaciarCola, MAX_APARTE, ESPERA_MS, REINTENTO_MS } from '../../src/app/envio.js';
import { recogerPerfil } from '../../src/motor/perfil.js';

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

test('sanearEnvio garantiza la forma con cualquier basura', () => {
  const vacio = sanearEnvio(null);
  eq(vacio.token, null); eq(vacio.incidencia, null); eq(vacio.huella, null);
  const raro = sanearEnvio({ token: '  tok  ', incidencia: '12', huella: 7, cuando: -1, error: '', intento: 'ayer', url: 'https://x' });
  eq(raro.token, 'tok'); eq(raro.incidencia, null, 'un número como texto pasa como incidencia'); eq(raro.huella, null); eq(raro.cuando, null); eq(raro.error, null); eq(raro.intento, null); eq(raro.url, 'https://x');
  eq(sanearEnvio({ incidencia: 12, cuando: 5 }).incidencia, 12);
  eq(sanearEnvio([1, 2]).token, null);
});

test('tocaSubir: con token, con partidas, con red, con datos nuevos, y sin machacar la API tras un fallo', () => {
  const ahora = 1_000_000_000;
  const estado = sanearEnvio({ token: 'github_pat_x', huella: '2.aaaa' });
  ok(tocaSubir(estado, '3.bbbb', { ahora, partidas: 3 }), 'con datos nuevos no sube');
  ok(!tocaSubir(estado, '2.aaaa', { ahora, partidas: 2 }), 'sube lo que ya está subido');
  ok(!tocaSubir(sanearEnvio({ huella: null }), '3.bbbb', { ahora, partidas: 3 }), 'sube sin token');
  ok(!tocaSubir(estado, '3.bbbb', { ahora, partidas: 0 }), 'sube sin partidas');
  ok(!tocaSubir(estado, '3.bbbb', { ahora, partidas: 3, enLinea: false }), 'sube sin red');
  const fallido = sanearEnvio({ ...estado, error: 'red', intento: ahora - 1000, huellaIntentada: '3.bbbb' });
  ok(!tocaSubir(fallido, '3.bbbb', { ahora, partidas: 3 }), 'reintenta al momento con los mismos datos que acaban de fallar');
  ok(tocaSubir(fallido, '3.bbbb', { ahora: ahora + REINTENTO_MS, partidas: 3 }), 'no reintenta pasado el plazo');
  ok(tocaSubir(fallido, '4.cccc', { ahora, partidas: 4 }), 'no reintenta al momento con datos nuevos');
  ok(ESPERA_MS >= 1000 && ESPERA_MS <= 10000, `una espera de ${ESPERA_MS} ms no es «unos segundos»`);
});

await test('las pantallas del final que no se pudieron subir esperan en cola y se suben al volver la red (3.41.0)', async () => {
  const subidas = [], comentarios = [];
  let red = false;
  const api = {
    subir: async (e) => { if (!red) return { error: 'red' }; subidas.push(e.titulo); return { numero: 100 + subidas.length }; },
    comentar: async (c) => { if (!red) return { error: 'red' }; comentarios.push(c); return { url: 'x' }; },
  };
  let cola = encolarAparte([], { titulo: 'A', cuerpo: 'a', comentario: 'ca' });
  cola = encolarAparte(cola, { titulo: 'B', cuerpo: 'b' });
  cola = await vaciarCola(cola, api);
  eq(cola.map((e) => e.titulo).join(), 'A,B', 'sin red se pierde lo que no se subió');
  red = true;
  cola = await vaciarCola(cola, api);
  eq(cola.length, 0, 'con red no se sube lo que esperaba');
  eq(subidas.join(), 'A,B', 'no se suben en orden, o se repiten');
  eq(JSON.stringify(comentarios), JSON.stringify([{ numero: 101, cuerpo: 'ca' }]), 'el comentario no va a su incidencia');
  // La incidencia se crea y el comentario falla: queda SOLO el comentario, con su número.
  let falla = true;
  const aMedias = await vaciarCola([{ titulo: 'C', cuerpo: 'c', comentario: 'cc' }], {
    subir: async () => ({ numero: 7 }),
    comentar: async () => (falla ? { error: 'red' } : { url: 'x' }),
  });
  ok(aMedias.length === 1 && aMedias[0].numero === 7, `una incidencia creada se volvería a crear: ${JSON.stringify(aMedias)}`);
  let creadas = 0;
  falla = false;
  eq((await vaciarCola(aMedias, { subir: async () => { creadas += 1; return { numero: 8 }; }, comentar: async () => ({ url: 'x' }) })).length, 0, 'el comentario pendiente no se sube');
  eq(creadas, 0, 'la incidencia se crea dos veces');
  // Con tope: se tiran las más viejas.
  let llena = [];
  for (let i = 0; i < MAX_APARTE + 2; i++) llena = encolarAparte(llena, { titulo: `T${i}` });
  eq(llena.map((e) => e.titulo).join(), Array.from({ length: MAX_APARTE }, (_, i) => `T${i + 2}`).join(), 'la cola no tiene tope o tira las nuevas');
});

terminar('app/envio');
